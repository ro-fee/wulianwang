#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <esp_now.h>
#include <WiFi.h>

// ── 选左/右 (烧录时改 #define) ──
// #define LEFT
#define RIGHT

// ── BLE 参数 (与 arm 固件一致，电脑端不改配对名) ──
static const char *BLE_SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab";
static const char *BLE_DATA_CHAR_UUID = "abcd1234-1234-1234-1234-abcdef123456";
static const size_t BLE_CHUNK_SIZE = 20;

#ifdef LEFT
static const char *BLE_DEVICE_NAME = "RGC-BLE-LEFT";
#else
static const char *BLE_DEVICE_NAME = "RGC-BLE-RIGHT";
#endif

// ── RG 数据包 V2 ──
static const size_t RGC_PACKET_SIZE = 68;    // 4头 + 60载荷 + 2序号 + 2校验
static const uint8_t  RGC_PACKET_VERSION = 2;
static const uint8_t  RGC_PAYLOAD_LENGTH = 60;  // 12角度×2 + 18压力×2
static const unsigned long BLE_NOTIFY_INTERVAL_MS = 30;

// ── ESP-NOW 数据包 ──
// 来自肘部 S3: 手臂 6 角度 + 18 压力
struct __attribute__((packed)) ArmEspNowPacket {
  uint8_t header;        // 0x41 = 'A'
  uint8_t side;          // 'L' or 'R'
  int16_t angles[6];     // 手臂上[3]+下[3], 度×100
  uint16_t pressures[18];
  uint16_t checksum;
};

// 来自腿部 S3: 腿部 6 角度
struct __attribute__((packed)) LegEspNowPacket {
  uint8_t header;        // 0x4C = 'L'
  uint8_t side;          // 'L' or 'R'
  int16_t angles[6];     // 大腿[3]+小腿[3], 度×100
  uint16_t checksum;
};

// ── 缓存: 收到的 ESP-NOW 数据 ──
volatile bool armDataReady = false;
volatile bool legDataReady = false;
ArmEspNowPacket armCache;
LegEspNowPacket legCache;
static unsigned long lastArmRecvMs = 0;
static unsigned long lastLegRecvMs = 0;
static const unsigned long DATA_TIMEOUT_MS = 500;  // 超过500ms没收到数据就填旧值

// ── BLE ──
BLEServer *pServer = nullptr;
BLECharacteristic *pDataChar = nullptr;
bool bleConnected = false;
uint16_t bleSeq = 0;
static unsigned long lastBleNotifyMs = 0;

// ═══════════════════════════════════════════
// BLE Server 回调
// ═══════════════════════════════════════════
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *s) {
    bleConnected = true;
    Serial.println("[BLE] 电脑已连接");
  }
  void onDisconnect(BLEServer *s) {
    bleConnected = false;
    Serial.println("[BLE] 电脑已断开, 重新广播");
    s->getAdvertising()->start();
  }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) {
    String cmd = String(c->getValue().c_str());
    cmd.trim();
    cmd.toUpperCase();
    Serial.printf("[CMD] 收到命令: %s\n", cmd.c_str());
    // TODO: ESP-NOW 转发 RESET 给肘部和大腿
  }
};

// ═══════════════════════════════════════════
// ESP-NOW 接收回调
// ═══════════════════════════════════════════
void onEspNowRecv(const uint8_t *mac, const uint8_t *data, int len) {
  if (len == sizeof(ArmEspNowPacket) && data[0] == 0x41) {
    ArmEspNowPacket *pkt = (ArmEspNowPacket *)data;
    if (pkt->side ==
#ifdef LEFT
        'L'
#else
        'R'
#endif
    ) {
      memcpy((void *)&armCache, data, sizeof(ArmEspNowPacket));
      armDataReady = true;
      lastArmRecvMs = millis();
    }
  } else if (len == sizeof(LegEspNowPacket) && data[0] == 0x4C) {
    LegEspNowPacket *pkt = (LegEspNowPacket *)data;
    if (pkt->side ==
#ifdef LEFT
        'L'
#else
        'R'
#endif
    ) {
      memcpy((void *)&legCache, data, sizeof(LegEspNowPacket));
      legDataReady = true;
      lastLegRecvMs = millis();
    }
  }
}

// ═══════════════════════════════════════════
// RG 包构建 (V2: 12 角度 + 18 压力)
// ═══════════════════════════════════════════
void writeUint16Le(uint8_t *pkt, size_t off, uint16_t val) {
  pkt[off] = val & 0xFF;
  pkt[off + 1] = (val >> 8) & 0xFF;
}

uint16_t packetChecksum(const uint8_t *pkt) {
  uint16_t sum = 0;
  for (size_t i = 0; i < RGC_PACKET_SIZE - 2; i++) sum += pkt[i];
  return sum;
}

void buildDataPacket(uint8_t *pkt) {
  pkt[0] = 'R';
  pkt[1] = 'G';
  pkt[2] = RGC_PACKET_VERSION;
  pkt[3] = RGC_PAYLOAD_LENGTH;
  writeUint16Le(pkt, 4, bleSeq++);

  // 角度: 手臂[0-5] + 腿部[6-11]
  int16_t armAngles[6] = {0};
  int16_t legAngles[6] = {0};
  if (armDataReady) memcpy(armAngles, armCache.angles, sizeof(armAngles));
  if (legDataReady) memcpy(legAngles, legCache.angles, sizeof(legAngles));

  for (int i = 0; i < 6; i++) {
    writeUint16Le(pkt, 6 + i * 2, (uint16_t)armAngles[i]);
  }
  for (int i = 0; i < 6; i++) {
    writeUint16Le(pkt, 18 + i * 2, (uint16_t)legAngles[i]);
  }

  // 压力: [12-29]
  uint16_t pressures[18] = {0};
  if (armDataReady) memcpy(pressures, armCache.pressures, sizeof(pressures));
  for (int i = 0; i < 18; i++) {
    writeUint16Le(pkt, 30 + i * 2, pressures[i]);
  }

  writeUint16Le(pkt, 66, packetChecksum(pkt));
}

void sendBlePacket(const uint8_t *pkt, size_t len) {
  if (!bleConnected || !pDataChar) return;
  for (size_t off = 0; off < len; off += BLE_CHUNK_SIZE) {
    size_t chunk = min(BLE_CHUNK_SIZE, len - off);
    pDataChar->setValue((uint8_t *)(pkt + off), chunk);
    pDataChar->notify();
    delay(3);
  }
}

void sendDataToBle() {
  if (millis() - lastBleNotifyMs < BLE_NOTIFY_INTERVAL_MS) return;
  lastBleNotifyMs = millis();

  uint8_t pkt[RGC_PACKET_SIZE];
  buildDataPacket(pkt);
  sendBlePacket(pkt, sizeof(pkt));
}

// ═══════════════════════════════════════════
// BLE Server 初始化
// ═══════════════════════════════════════════
void setupBleServer() {
  BLEDevice::init(BLE_DEVICE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService *svc = pServer->createService(BLE_SERVICE_UUID);
  pDataChar = svc->createCharacteristic(
    BLE_DATA_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_NOTIFY |
    BLECharacteristic::PROPERTY_WRITE
  );
  pDataChar->addDescriptor(new BLE2902());
  pDataChar->setCallbacks(new CommandCallbacks());

  uint8_t initPkt[RGC_PACKET_SIZE] = {0};
  buildDataPacket(initPkt);
  pDataChar->setValue(initPkt, sizeof(initPkt));

  svc->start();
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(BLE_SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.printf("[BLE] Server 启动: %s\n", BLE_DEVICE_NAME);
}

// ═══════════════════════════════════════════
// ESP-NOW 初始化
// ═══════════════════════════════════════════
void setupEspNow() {
  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    Serial.println("[ESP-NOW] 初始化失败! 重启...");
    delay(1000);
    ESP.restart();
  }
  esp_now_register_recv_cb(onEspNowRecv);
  Serial.println("[ESP-NOW] 接收就绪, 等待肘部+大腿数据...");
}

// ═══════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n[RGC] 腰间汇聚器启动");

#ifdef LEFT
  Serial.println("[RGC] 侧: LEFT");
#else
  Serial.println("[RGC] 侧: RIGHT");
#endif

  setupEspNow();
  setupBleServer();
}

// ═══════════════════════════════════════════
// LOOP
// ═══════════════════════════════════════════
void loop() {
  sendDataToBle();

  // 超时日志
  static unsigned long lastLogMs = 0;
  if (millis() - lastLogMs > 5000) {
    float armAge = (millis() - lastArmRecvMs) / 1000.0f;
    float legAge = (millis() - lastLegRecvMs) / 1000.0f;
    Serial.printf("[STAT] 肘部数据: %s (%.1fs前) | 腿部数据: %s (%.1fs前)\n",
      armDataReady ? "有" : "无", armAge,
      legDataReady ? "有" : "无", legAge);
    lastLogMs = millis();
  }
}
