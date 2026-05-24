#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLEClient.h>
#include <BLE2902.h>
#include <esp_now.h>
#include <WiFi.h>

// ── 选左/右 (烧录时改 #define) ──
// #define LEFT
#define RIGHT

// ── BLE Server 参数 (连接 PC) ──
static const char *BLE_SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab";
static const char *BLE_DATA_CHAR_UUID = "abcd1234-1234-1234-1234-abcdef123456";
static const size_t BLE_CHUNK_SIZE = 20;

#ifdef LEFT
static const char *BLE_DEVICE_NAME = "RGC-BLE-LEFT";
#else
static const char *BLE_DEVICE_NAME = "RGC-BLE-RIGHT";
#endif

// ── BLE Client 参数 (连接压力鞋垫) ──
static BLEUUID SENSOR_SVC_UUID("0000fff0-0000-1000-8000-00805f9b34fb");
static BLEUUID SENSOR_NOTIFY_UUID("0000fff1-0000-1000-8000-00805f9b34fb");

#ifdef LEFT
static BLEAddress INSOLE_MAC("FF:24:08:20:53:BD");
#else
static BLEAddress INSOLE_MAC("FF:23:10:16:02:EA");
#endif

// ── RG 数据包 V2 ──
static const size_t RGC_PACKET_SIZE = 68;
static const uint8_t  RGC_PACKET_VERSION = 2;
static const uint8_t  RGC_PAYLOAD_LENGTH = 60;
static const unsigned long BLE_NOTIFY_INTERVAL_MS = 30;

// ── ESP-NOW 数据包 (肘部仅发6个手臂角度，压力由腰间 Hub 直连鞋垫) ──
struct __attribute__((packed)) ArmEspNowPacket {
  uint8_t header;        // 0x41 = 'A'
  uint8_t side;          // 'L' or 'R'
  int16_t angles[6];     // 上臂[3] + 下臂[3], 度×100
  uint16_t checksum;
};

struct __attribute__((packed)) LegEspNowPacket {
  uint8_t header;        // 0x4C = 'L'
  uint8_t side;          // 'L' or 'R'
  int16_t angles[6];     // 大腿[3] + 小腿[3], 度×100
  uint16_t checksum;
};

// ── ESP-NOW 缓存 (临界区保护) ──
portMUX_TYPE cacheMux = portMUX_INITIALIZER_UNLOCKED;
volatile bool armDataReady = false;
volatile bool legDataReady = false;
ArmEspNowPacket armCache;
LegEspNowPacket legCache;
static unsigned long lastArmRecvMs = 0;
static unsigned long lastLegRecvMs = 0;

// ── 压力鞋垫缓存 (临界区保护) ──
portMUX_TYPE pressureMux = portMUX_INITIALIZER_UNLOCKED;
volatile bool pressureReady = false;
uint16_t pressureCache[18] = {0};
static unsigned long lastPressureMs = 0;

// ── 鞋垫 BLE Client ──
BLEClient *pInsoleClient = nullptr;
BLERemoteCharacteristic *pInsoleNotifyChar = nullptr;
static const size_t RX_BUF_SIZE = 100;
uint8_t rx_buffer[RX_BUF_SIZE];
size_t rx_index = 0;

// ── BLE Server (连接 PC) ──
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

// ── ESP-NOW 命令包 ──
struct __attribute__((packed)) EspNowCmd {
  uint8_t header;   // 0x43 = 'C'
  uint8_t cmd;      // 'R' = RESET
  uint16_t checksum;
};
static uint8_t elbowMac[6] = {0};
static uint8_t legMac[6] = {0};
static bool elbowPeerAdded = false;
static bool legPeerAdded = false;

void addPeerIfNew(const uint8_t *mac, bool &added, const char *name) {
  if (added) return;
  bool valid = false;
  for (int i = 0; i < 6; i++) { if (mac[i] != 0) { valid = true; break; } }
  if (!valid) return;
  esp_now_peer_info_t info;
  memset(&info, 0, sizeof(info));
  memcpy(info.peer_addr, mac, 6);
  info.channel = 0;
  info.encrypt = false;
  if (esp_now_add_peer(&info) == ESP_OK) {
    added = true;
    Serial.printf("[ESP-NOW] 已添加 %s peer: %02X:%02X:%02X:%02X:%02X:%02X\n",
      name, mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  }
}

void sendEspNowCmd(const uint8_t *mac, uint8_t cmdCode) {
  if (!elbowPeerAdded && !legPeerAdded) return;
  EspNowCmd pkt;
  pkt.header = 0x43;
  pkt.cmd = cmdCode;
  uint16_t sum = 0;
  uint8_t *raw = (uint8_t *)&pkt;
  for (size_t i = 0; i < sizeof(pkt) - 2; i++) sum += raw[i];
  pkt.checksum = sum;
  esp_now_send(mac, (uint8_t *)&pkt, sizeof(pkt));
}

void onEspNowSendCb(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {
  Serial.printf("[CMD] 发送 %s\n", status == ESP_NOW_SEND_SUCCESS ? "OK" : "FAIL");
}

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) {
    String cmd = String(c->getValue().c_str());
    cmd.trim();
    cmd.toUpperCase();
    Serial.printf("[CMD] 收到命令: %s\n", cmd.c_str());
    if (cmd == "RESET") {
      if (elbowPeerAdded) { sendEspNowCmd(elbowMac, 'R'); Serial.println("[CMD] RESET → 肘部"); }
      if (legPeerAdded)   { sendEspNowCmd(legMac, 'R');   Serial.println("[CMD] RESET → 大腿"); }
      if (!elbowPeerAdded && !legPeerAdded) Serial.println("[CMD] 无已连接卫星");
    } else if (cmd == "CALIBRATE") {
      if (elbowPeerAdded) { sendEspNowCmd(elbowMac, 'C'); Serial.println("[CMD] CALIBRATE → 肘部"); }
      if (legPeerAdded)   { sendEspNowCmd(legMac, 'C');   Serial.println("[CMD] CALIBRATE → 大腿"); }
      if (!elbowPeerAdded && !legPeerAdded) Serial.println("[CMD] 无已连接卫星");
    }
  }
};

// ═══════════════════════════════════════════
// ESP-NOW 接收回调
// ═══════════════════════════════════════════
void onEspNowRecv(const esp_now_recv_info *info, const uint8_t *data, int len) {
  const uint8_t *mac = info->src_addr;
  if (len == sizeof(ArmEspNowPacket) && data[0] == 0x41) {
    ArmEspNowPacket *pkt = (ArmEspNowPacket *)data;
    if (pkt->side ==
#ifdef LEFT
        'L'
#else
        'R'
#endif
    ) {
      memcpy(elbowMac, mac, 6);
      addPeerIfNew(mac, elbowPeerAdded, "肘部");
      portENTER_CRITICAL(&cacheMux);
      memcpy((void *)&armCache, data, sizeof(ArmEspNowPacket));
      armDataReady = true;
      portEXIT_CRITICAL(&cacheMux);
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
      memcpy(legMac, mac, 6);
      addPeerIfNew(mac, legPeerAdded, "腿部");
      portENTER_CRITICAL(&cacheMux);
      memcpy((void *)&legCache, data, sizeof(LegEspNowPacket));
      legDataReady = true;
      portEXIT_CRITICAL(&cacheMux);
      lastLegRecvMs = millis();
    }
  }
}

// ═══════════════════════════════════════════
// 压力鞋垫 BLE 通知回调
// ═══════════════════════════════════════════
void onInsoleNotify(BLERemoteCharacteristic *pChar, uint8_t *pData, size_t length, bool isNotify) {
  for (size_t i = 0; i < length; ++i) {
    if (rx_index < RX_BUF_SIZE)
      rx_buffer[rx_index++] = pData[i];
    else {
      rx_index = 0;
      Serial.println("[鞋垫] Buffer overflow!");
    }
  }

  while (rx_index >= 39) {
    if (rx_buffer[0] != 0xAA) {
      memmove(rx_buffer, rx_buffer + 1, rx_index - 1);
      rx_index--;
      continue;
    }
    uint8_t calcSum = 0;
    for (size_t i = 0; i < 38; ++i) calcSum += rx_buffer[i];
    if (calcSum != rx_buffer[38]) {
      memmove(rx_buffer, rx_buffer + 1, rx_index - 1);
      rx_index--;
      continue;
    }

    portENTER_CRITICAL(&pressureMux);
    for (size_t i = 0; i < 18; ++i) {
      pressureCache[i] = (rx_buffer[2 + 2 * i] << 8) | rx_buffer[3 + 2 * i];
    }
    pressureReady = true;
    portEXIT_CRITICAL(&pressureMux);
    lastPressureMs = millis();

    memmove(rx_buffer, rx_buffer + 39, rx_index - 39);
    rx_index -= 39;
  }
}

void reconnectInsoleBle() {
  Serial.println("[鞋垫] 重新连接...");
  if (pInsoleClient) { pInsoleClient->disconnect(); delete pInsoleClient; pInsoleClient = nullptr; }
  pInsoleClient = BLEDevice::createClient();
  if (pInsoleClient->connect(INSOLE_MAC)) {
    Serial.println("[鞋垫] 已连接");
    BLERemoteService *pSvc = pInsoleClient->getService(SENSOR_SVC_UUID);
    if (pSvc) {
      pInsoleNotifyChar = pSvc->getCharacteristic(SENSOR_NOTIFY_UUID);
      if (pInsoleNotifyChar && pInsoleNotifyChar->canNotify()) {
        pInsoleNotifyChar->registerForNotify(onInsoleNotify);
        Serial.println("[鞋垫] Notify 已注册");
      }
    }
  } else {
    Serial.println("[鞋垫] 连接失败!");
  }
}

void setupInsoleBleClient() {
  pInsoleClient = BLEDevice::createClient();
  Serial.println("[鞋垫] 连接中...");
  if (pInsoleClient->connect(INSOLE_MAC)) {
    Serial.println("[鞋垫] 已连接");
    BLERemoteService *pSvc = pInsoleClient->getService(SENSOR_SVC_UUID);
    if (pSvc) {
      pInsoleNotifyChar = pSvc->getCharacteristic(SENSOR_NOTIFY_UUID);
      if (pInsoleNotifyChar && pInsoleNotifyChar->canNotify()) {
        pInsoleNotifyChar->registerForNotify(onInsoleNotify);
        Serial.println("[鞋垫] Notify 已注册");
      }
    }
  } else {
    Serial.println("[鞋垫] 连接失败，将在 loop 中重试");
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

  // 手臂角度 [0-5] + 腿部角度 [6-11]
  int16_t armAngles[6] = {0};
  int16_t legAngles[6] = {0};
  portENTER_CRITICAL(&cacheMux);
  if (armDataReady) memcpy(armAngles, (void *)armCache.angles, sizeof(armAngles));
  if (legDataReady) memcpy(legAngles, (void *)legCache.angles, sizeof(legAngles));
  portEXIT_CRITICAL(&cacheMux);

  for (int i = 0; i < 6; i++) writeUint16Le(pkt, 6 + i * 2, (uint16_t)armAngles[i]);
  for (int i = 0; i < 6; i++) writeUint16Le(pkt, 18 + i * 2, (uint16_t)legAngles[i]);

  // 压力由腰间 Hub 直连鞋垫收取 [30-65]
  uint16_t pressures[18] = {0};
  portENTER_CRITICAL(&pressureMux);
  if (pressureReady) memcpy(pressures, (void *)pressureCache, sizeof(pressures));
  portEXIT_CRITICAL(&pressureMux);
  for (int i = 0; i < 18; i++) writeUint16Le(pkt, 30 + i * 2, pressures[i]);

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

  const char *initVal = "RGC-V2-READY";
  pDataChar->setValue((uint8_t *)initVal, strlen(initVal));

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
  esp_now_register_send_cb(onEspNowSendCb);
  Serial.println("[ESP-NOW] 收发就绪, 等待肘部+大腿数据...");
}

// ═══════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n[RGC] 腰间汇聚器启动 (含鞋垫 BLE 直连)");
  Serial.printf("[WIFI] MAC 地址: %s\n", WiFi.macAddress().c_str());
  Serial.println("[INFO] 请将上方 MAC 地址填入肘部和大腿固件的 WAIST_MAC[]");

#ifdef LEFT
  Serial.println("[RGC] 侧: LEFT");
#else
  Serial.println("[RGC] 侧: RIGHT");
#endif

  setupEspNow();
  setupBleServer();        // 必须先 init BLE，后续 Client 才能用
  setupInsoleBleClient();  // 直连鞋垫收压力
}

// ═══════════════════════════════════════════
// LOOP
// ═══════════════════════════════════════════
void loop() {
  // 鞋垫断线重连
  if (pInsoleClient && !pInsoleClient->isConnected()) {
    reconnectInsoleBle();
  }

  sendDataToBle();

  // 状态日志 (每 5 秒)
  static unsigned long lastLogMs = 0;
  if (millis() - lastLogMs > 5000) {
    float armAge = (millis() - lastArmRecvMs) / 1000.0f;
    float legAge = (millis() - lastLegRecvMs) / 1000.0f;
    float prsAge = (millis() - lastPressureMs) / 1000.0f;
    Serial.printf("[STAT] 肘部: %s (%.1fs) | 腿部: %s (%.1fs) | 鞋垫: %s (%.1fs)\n",
      armDataReady ? "有" : "无", armAge,
      legDataReady ? "有" : "无", legAge,
      pressureReady ? "有" : "无", prsAge);
    Serial.printf("[MAC] Hub MAC: %s\n", WiFi.macAddress().c_str());
    Serial.println("[MAC] ↑ 填入 test-elbow.ino / test-leg.ino 的 WAIST_MAC[]");
    lastLogMs = millis();
  }
}
