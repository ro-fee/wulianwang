#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEClient.h>
#include <HardwareSerial.h>
#include <math.h>
#include <esp_now.h>
#include <WiFi.h>

// #define LEFT // 根据实际硬件定义LEFT/RIGHT
#define RIGHT

// ── 压力鞋垫 BLE Client ──
static BLEUUID sensorServiceUUID("0000fff0-0000-1000-8000-00805f9b34fb");
static BLEUUID sensorNotifyUUID("0000fff1-0000-1000-8000-00805f9b34fb");

#ifdef LEFT
static BLEAddress targetAddress("FF:24:08:20:53:BD"); // 左足
#else
static BLEAddress targetAddress("FF:23:10:16:02:EA"); // 右足
#endif

// ── ESP-NOW 目标: 腰间 S3 MAC (烧录前替换为实际 MAC 地址！) ──
// 获取方式: 先烧录 hub-waist.ino → 串口监视器(115200) → 复制打印的 MAC 地址
// ESP-NOW 不支持广播地址，使用 FF:FF:FF:FF:FF:FF 将导致通信失败
static const uint8_t WAIST_MAC[] = {0xA0, 0xDD, 0xCC, 0xDD, 0xEE, 0xFF}; // ← 替换为实际 MAC

// ── ESP-NOW 发送间隔 ──
static const unsigned long ESP_NOW_SEND_INTERVAL_MS = 30;

// ── 压力鞋垫 BLE Client ──
BLEClient *pClient = nullptr;
BLERemoteCharacteristic *pNotifyCharacteristic = nullptr;

const size_t BUFFER_SIZE = 100;
uint8_t rx_buffer[BUFFER_SIZE];
size_t rx_index = 0;

const size_t PRESSURE_ARRAY_SIZE = 18;
uint16_t pressure[PRESSURE_ARRAY_SIZE];
float AnglePressure[24] = {0};  // 6 手臂角度 + 18 压力

// ── JY901S IMU 手臂 ──
struct ImuData {
  float roll, pitch, yaw;
  bool newData;
};

HardwareSerial upperArmSerial(1);
ImuData upperArmData = {0.0, 0.0, 0.0, false};
static int state1 = 0, bufferIndex1 = 0;
static uint8_t buffer1[11];

HardwareSerial lowerArmSerial(2);
ImuData lowerArmData = {0.0, 0.0, 0.0, false};
static int state2 = 0, bufferIndex2 = 0;
static uint8_t buffer2[11];

// ── 零偏校准 ──
float zero_error_roll_upper = 0.0, zero_error_pitch_upper = 0.0, zero_error_yaw_upper = 0.0;
float zero_error_roll_lower = 0.0, zero_error_pitch_lower = 0.0, zero_error_yaw_lower = 0.0;
float sum_roll_upper = 0.0, sum_pitch_upper = 0.0, sum_yaw_upper = 0.0;
float sum_roll_lower = 0.0, sum_pitch_lower = 0.0, sum_yaw_lower = 0.0;
int sample_count = 10;

// ── ESP-NOW 发送 ──
static unsigned long lastSendMs = 0;
esp_now_peer_info_t peerInfo;

// ── ESP-NOW 数据包: 肘部 → 腰间 ──
struct __attribute__((packed)) ArmEspNowPacket {
  uint8_t header;        // 0x41 = 'A'
  uint8_t side;          // 'L' or 'R'
  int16_t angles[6];     // 上臂[3] + 下臂[3], 度×100
  uint16_t pressures[18];
  uint16_t checksum;
};

// ═══════════════════════════════════════════
// 压力鞋垫 BLE 回调 (不变)
// ═══════════════════════════════════════════
void notifyCallback(BLERemoteCharacteristic *pBLERemoteCharacteristic,
                    uint8_t *pData, size_t length, bool isNotify) {
  for (size_t i = 0; i < length; ++i) {
    if (rx_index < BUFFER_SIZE)
      rx_buffer[rx_index++] = pData[i];
    else {
      rx_index = 0;
      Serial.println("Buffer overflow!");
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
    for (size_t i = 0; i < PRESSURE_ARRAY_SIZE; ++i) {
      pressure[i] = (rx_buffer[2 + 2 * i] << 8) | rx_buffer[3 + 2 * i];
      AnglePressure[6 + i] = pressure[i];
    }
    memmove(rx_buffer, rx_buffer + 39, rx_index - 39);
    rx_index -= 39;
  }
}

void reconnectSensorBle() {
  Serial.println("Reconnecting sensor BLE...");
  if (pClient) { pClient->disconnect(); delete pClient; pClient = nullptr; }
  pClient = BLEDevice::createClient();
  if (pClient->connect(targetAddress)) {
    Serial.println("Sensor BLE reconnected.");
    BLERemoteService *pSvc = pClient->getService(sensorServiceUUID);
    if (pSvc) {
      pNotifyCharacteristic = pSvc->getCharacteristic(sensorNotifyUUID);
      if (pNotifyCharacteristic && pNotifyCharacteristic->canNotify()) {
        pNotifyCharacteristic->registerForNotify(notifyCallback);
        Serial.println("Sensor BLE notify registered.");
      }
    }
  } else {
    Serial.println("Sensor BLE reconnect failed!");
  }
}

// ═══════════════════════════════════════════
// JY901S 解析: 0x55 0x53 (不变)
// ═══════════════════════════════════════════
void processSensor(HardwareSerial &serial, int &state, int &bufferIndex,
                   uint8_t buffer[], ImuData &imuData, const char *name) {
  while (serial.available()) {
    uint8_t byte = serial.read();
    if (state == 0) {
      if (byte == 0x55) { buffer[0] = byte; state = 1; }
    } else if (state == 1) {
      if (byte == 0x53) { buffer[1] = byte; state = 2; bufferIndex = 2; }
      else state = 0;
    } else if (state == 2) {
      buffer[bufferIndex++] = byte;
      if (bufferIndex == 11) {
        uint8_t sum = 0;
        for (int i = 0; i < 10; ++i) sum += buffer[i];
        if (sum == buffer[10]) {
          int16_t rollRaw  = (buffer[3] << 8) | buffer[2];
          int16_t pitchRaw = (buffer[5] << 8) | buffer[4];
          int16_t yawRaw   = (buffer[7] << 8) | buffer[6];
          imuData.roll  = rollRaw  / 32768.0 * 180.0;
          imuData.pitch = pitchRaw / 32768.0 * 180.0;
          imuData.yaw   = yawRaw   / 32768.0 * 180.0;
          imuData.newData = true;
        } else {
          Serial.printf("%s IMU checksum error!\n", name);
        }
        state = 0; bufferIndex = 0;
      }
    }
  }
}

// ═══════════════════════════════════════════
// 角度归一化 (不变)
// ═══════════════════════════════════════════
void normalizeAnglePressure() {
  AnglePressure[0] = upperArmData.roll - zero_error_roll_upper;
  AnglePressure[1] = upperArmData.pitch - zero_error_pitch_upper;
  AnglePressure[2] = upperArmData.yaw - zero_error_yaw_upper;
  AnglePressure[3] = lowerArmData.roll - zero_error_roll_lower;
  AnglePressure[4] = lowerArmData.pitch - zero_error_pitch_lower;
  AnglePressure[5] = lowerArmData.yaw - zero_error_yaw_lower;

  for (int i = 0; i < 6; i++) {
    if (i == 1 || i == 4) continue;
    AnglePressure[i] = fmod(AnglePressure[i], 360.0);
    if (AnglePressure[i] > 180) AnglePressure[i] -= 360;
    else if (AnglePressure[i] < -180) AnglePressure[i] += 360;
  }
  for (int i = 1; i < 6; i += 3) {
    AnglePressure[i] = fmod(AnglePressure[i], 360.0);
    if (AnglePressure[i] > 180) AnglePressure[i] -= 360;
    else if (AnglePressure[i] < -180) AnglePressure[i] += 360;
    if (AnglePressure[i] > 90) {
      AnglePressure[i] = 180 - AnglePressure[i];
      AnglePressure[i] = -AnglePressure[i];
    } else if (AnglePressure[i] < -90) {
      AnglePressure[i] = -180 - AnglePressure[i];
      AnglePressure[i] = -AnglePressure[i];
    }
  }
}

// ═══════════════════════════════════════════
// ESP-NOW 发送
// ═══════════════════════════════════════════
void onEspNowSend(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {}

void sendArmDataViaEspNow() {
  ArmEspNowPacket pkt;
  pkt.header = 0x41;
  pkt.side =
#ifdef LEFT
    'L';
#else
    'R';
#endif

  for (int i = 0; i < 6; i++)
    pkt.angles[i] = (int16_t)round(AnglePressure[i] * 100.0f);
  for (int i = 0; i < 18; i++)
    pkt.pressures[i] = (uint16_t)round(AnglePressure[6 + i]);

  uint16_t sum = 0;
  uint8_t *raw = (uint8_t *)&pkt;
  for (size_t i = 0; i < sizeof(pkt) - 2; i++) sum += raw[i];
  pkt.checksum = sum;

  esp_now_send(WAIST_MAC, (uint8_t *)&pkt, sizeof(pkt));
}

void setupEspNow() {
  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    Serial.println("[ESP-NOW] 初始化失败! 重启...");
    delay(1000);
    ESP.restart();
  }
  esp_now_register_send_cb(onEspNowSend);
  memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, WAIST_MAC, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);
  Serial.println("[ESP-NOW] TX 就绪 → 腰间 S3");
}

// ═══════════════════════════════════════════
// 压力鞋垫 BLE Client 初始化
// ═══════════════════════════════════════════
void setupSensorBleClient() {
  pClient = BLEDevice::createClient();
  Serial.println("Connecting to sensor BLE device...");
  if (pClient->connect(targetAddress)) {
    Serial.println("Sensor BLE connected.");
    BLERemoteService *pSvc = pClient->getService(sensorServiceUUID);
    if (pSvc) {
      pNotifyCharacteristic = pSvc->getCharacteristic(sensorNotifyUUID);
      if (pNotifyCharacteristic && pNotifyCharacteristic->canNotify()) {
        pNotifyCharacteristic->registerForNotify(notifyCallback);
        Serial.println("Sensor BLE notify enabled.");
      }
    }
  } else {
    Serial.println("Sensor BLE connection failed!");
  }
}

// ═══════════════════════════════════════════
// IMU 引脚初始化
// ═══════════════════════════════════════════
void setupImuAndPins() {
#ifdef RIGHT
  upperArmSerial.begin(115200, SERIAL_8N1, 2, 3);
  lowerArmSerial.begin(115200, SERIAL_8N1, 10, 11);
#else
  upperArmSerial.begin(115200, SERIAL_8N1, 10, 11);
  lowerArmSerial.begin(115200, SERIAL_8N1, 2, 3);
#endif
  Serial.println("IMU serial initialized.");
  pinMode(1, OUTPUT);  pinMode(4, OUTPUT);
  pinMode(9, OUTPUT);  pinMode(12, OUTPUT);
  digitalWrite(1, LOW);   digitalWrite(4, HIGH);
  digitalWrite(9, LOW);   digitalWrite(12, HIGH);
}

// ═══════════════════════════════════════════
// 零偏校准
// ═══════════════════════════════════════════
void calculateZeroError() {
  for (int i = 0; i < sample_count; i++) {
    processSensor(upperArmSerial, state1, bufferIndex1, buffer1, upperArmData, "upperArm");
    processSensor(lowerArmSerial, state2, bufferIndex2, buffer2, lowerArmData, "lowerArm");
    while (!upperArmData.newData || !lowerArmData.newData) {
      processSensor(upperArmSerial, state1, bufferIndex1, buffer1, upperArmData, "upperArm");
      processSensor(lowerArmSerial, state2, bufferIndex2, buffer2, lowerArmData, "lowerArm");
      delay(10);
    }
    sum_roll_upper  += upperArmData.roll;
    sum_pitch_upper += upperArmData.pitch;
    sum_yaw_upper   += upperArmData.yaw;
    sum_roll_lower  += lowerArmData.roll;
    sum_pitch_lower += lowerArmData.pitch;
    sum_yaw_lower   += lowerArmData.yaw;
    upperArmData.newData = false;
    lowerArmData.newData = false;
    delay(50);
  }
  zero_error_roll_upper  = sum_roll_upper  / sample_count;
  zero_error_pitch_upper = sum_pitch_upper / sample_count;
  zero_error_yaw_upper   = sum_yaw_upper   / sample_count;
  zero_error_roll_lower  = sum_roll_lower  / sample_count;
  zero_error_pitch_lower = sum_pitch_lower / sample_count;
  zero_error_yaw_lower   = sum_yaw_lower   / sample_count;
  Serial.printf("upper zero: roll=%.2f pitch=%.2f yaw=%.2f\n",
    zero_error_roll_upper, zero_error_pitch_upper, zero_error_yaw_upper);
  Serial.printf("lower zero: roll=%.2f pitch=%.2f yaw=%.2f\n",
    zero_error_roll_lower, zero_error_pitch_lower, zero_error_yaw_lower);
}

// ═══════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n[RGC] 肘部采集器启动 (ESP-NOW TX)");

  setupImuAndPins();
  calculateZeroError();

  BLEDevice::init("RGC-ARM");
  setupSensorBleClient();
  setupEspNow();
}

// ═══════════════════════════════════════════
// LOOP
// ═══════════════════════════════════════════
void loop() {
  if (pClient && !pClient->isConnected())
    reconnectSensorBle();

  processSensor(upperArmSerial, state1, bufferIndex1, buffer1, upperArmData, "upperArm");
  processSensor(lowerArmSerial, state2, bufferIndex2, buffer2, lowerArmData, "lowerArm");

  if (upperArmData.newData && lowerArmData.newData) {
    normalizeAnglePressure();
    upperArmData.newData = false;
    lowerArmData.newData = false;

    unsigned long now = millis();
    if (now - lastSendMs >= ESP_NOW_SEND_INTERVAL_MS) {
      sendArmDataViaEspNow();
      lastSendMs = now;
    }
    // newData 标志只有在新数据到达时才会被 processSensor 重新置 true，
    // 此处仅记录"已处理过"，丢掉中间帧是目的性降采样（100Hz→33Hz）
  }
}
