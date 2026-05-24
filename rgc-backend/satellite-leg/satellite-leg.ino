#include <Arduino.h>
#include <HardwareSerial.h>
#include <esp_now.h>
#include <WiFi.h>
#include <math.h>

// ── 选左/右腿 ──
// #define LEFT
#define RIGHT

// ── ESP-NOW 目标: 腰间 S3 MAC ──
static const uint8_t WAIST_MAC[] = {0x28, 0x84, 0x85, 0x6D, 0x68, 0x0C}; // ← 替换为实际 MAC

static const unsigned long SEND_INTERVAL_MS = 30;

// ── 腿部角度 ──
float legAngles[6] = {0};

// ── JY901S IMU ──
struct ImuData {
  float roll, pitch, yaw;
  bool newData;
};

HardwareSerial upperLegSerial(1);
ImuData upperLegData = {0.0, 0.0, 0.0, false};
static int stateUp = 0, bufIdxUp = 0;
static uint8_t bufUp[11];

HardwareSerial lowerLegSerial(2);
ImuData lowerLegData = {0.0, 0.0, 0.0, false};
static int stateLo = 0, bufIdxLo = 0;
static uint8_t bufLo[11];

// ── 零偏校准 ──
float zero_roll_upper = 0.0, zero_pitch_upper = 0.0, zero_yaw_upper = 0.0;
float zero_roll_lower = 0.0, zero_pitch_lower = 0.0, zero_yaw_lower = 0.0;
float sum_roll_upper = 0.0, sum_pitch_upper = 0.0, sum_yaw_upper = 0.0;
float sum_roll_lower = 0.0, sum_pitch_lower = 0.0, sum_yaw_lower = 0.0;
int sample_count = 10;

// ── ESP-NOW ──
static unsigned long lastSendMs = 0;
esp_now_peer_info_t peerInfo;
volatile bool calibrateRequested = false;

struct __attribute__((packed)) LegPacket {
  uint8_t header;       // 0x4C = 'L'
  uint8_t side;         // 'L' or 'R'
  int16_t angles[6];    // 大腿[3] + 小腿[3], 度×100
  uint16_t checksum;
};

struct __attribute__((packed)) EspNowCmd {
  uint8_t header;   // 0x43 = 'C'
  uint8_t cmd;      // 'R' = RESET, 'C' = CALIBRATE
  uint16_t checksum;
};

// ═══════════════════════════════════════════
// JY901S 解析: 0x55 0x53
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
// 角度归一化
// ═══════════════════════════════════════════
void normalizeAngles() {
  legAngles[0] = upperLegData.roll - zero_roll_upper;
  legAngles[1] = upperLegData.pitch - zero_pitch_upper;
  legAngles[2] = upperLegData.yaw - zero_yaw_upper;
  legAngles[3] = lowerLegData.roll - zero_roll_lower;
  legAngles[4] = lowerLegData.pitch - zero_pitch_lower;
  legAngles[5] = lowerLegData.yaw - zero_yaw_lower;

  for (int i = 0; i < 6; i++) {
    if (i == 1 || i == 4) continue;
    legAngles[i] = fmod(legAngles[i], 360.0);
    if (legAngles[i] > 180) legAngles[i] -= 360;
    else if (legAngles[i] < -180) legAngles[i] += 360;
  }
  for (int i = 1; i < 6; i += 3) {
    legAngles[i] = fmod(legAngles[i], 360.0);
    if (legAngles[i] > 180) legAngles[i] -= 360;
    else if (legAngles[i] < -180) legAngles[i] += 360;
    if (legAngles[i] > 90) {
      legAngles[i] = 180 - legAngles[i];
      legAngles[i] = -legAngles[i];
    } else if (legAngles[i] < -90) {
      legAngles[i] = -180 - legAngles[i];
      legAngles[i] = -legAngles[i];
    }
  }
}

// ═══════════════════════════════════════════
// ESP-NOW 发送
// ═══════════════════════════════════════════
void onEspNowSend(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {}

void onEspNowRecv(const esp_now_recv_info *info, const uint8_t *data, int len) {
  if (len == sizeof(EspNowCmd) && data[0] == 0x43 && data[1] == 'C') {
    Serial.println("[CMD] 收到校准指令");
    calibrateRequested = true;
  }
}

void sendLegData() {
  LegPacket pkt;
  pkt.header = 0x4C;
#ifdef LEFT
  pkt.side = 'L';
#else
  pkt.side = 'R';
#endif

  for (int i = 0; i < 6; i++)
    pkt.angles[i] = (int16_t)round(legAngles[i] * 100.0f);

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
  esp_now_register_recv_cb(onEspNowRecv);
  memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, WAIST_MAC, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);
  Serial.println("[ESP-NOW] TX 就绪 → 腰间 S3");
}

// ═══════════════════════════════════════════
// IMU 引脚初始化 (与肘部完全一致的接线)
// ═══════════════════════════════════════════
void setupImuAndPins() {
#ifdef RIGHT
  upperLegSerial.begin(115200, SERIAL_8N1, 2, 3);
  lowerLegSerial.begin(115200, SERIAL_8N1, 10, 11);
#else
  upperLegSerial.begin(115200, SERIAL_8N1, 10, 11);
  lowerLegSerial.begin(115200, SERIAL_8N1, 2, 3);
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
    processSensor(upperLegSerial, stateUp, bufIdxUp, bufUp, upperLegData, "upperLeg");
    processSensor(lowerLegSerial, stateLo, bufIdxLo, bufLo, lowerLegData, "lowerLeg");
    while (!upperLegData.newData || !lowerLegData.newData) {
      processSensor(upperLegSerial, stateUp, bufIdxUp, bufUp, upperLegData, "upperLeg");
      processSensor(lowerLegSerial, stateLo, bufIdxLo, bufLo, lowerLegData, "lowerLeg");
      delay(10);
    }
    sum_roll_upper  += upperLegData.roll;
    sum_pitch_upper += upperLegData.pitch;
    sum_yaw_upper   += upperLegData.yaw;
    sum_roll_lower  += lowerLegData.roll;
    sum_pitch_lower += lowerLegData.pitch;
    sum_yaw_lower   += lowerLegData.yaw;
    upperLegData.newData = false;
    lowerLegData.newData = false;
    delay(50);
  }
  zero_roll_upper  = sum_roll_upper  / sample_count;
  zero_pitch_upper = sum_pitch_upper / sample_count;
  zero_yaw_upper   = sum_yaw_upper   / sample_count;
  zero_roll_lower  = sum_roll_lower  / sample_count;
  zero_pitch_lower = sum_pitch_lower / sample_count;
  zero_yaw_lower   = sum_yaw_lower   / sample_count;
  Serial.printf("upper leg zero: roll=%.2f pitch=%.2f yaw=%.2f\n",
    zero_roll_upper, zero_pitch_upper, zero_yaw_upper);
  Serial.printf("lower leg zero: roll=%.2f pitch=%.2f yaw=%.2f\n",
    zero_roll_lower, zero_pitch_lower, zero_yaw_lower);
}

// ═══════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n[RGC] 腿部采集器启动 (IMU → ESP-NOW)");

#ifdef LEFT
  Serial.println("[RGC] 侧: LEFT");
#else
  Serial.println("[RGC] 侧: RIGHT");
#endif

  setupImuAndPins();
  // 校准由前端或上电后手动触发，不在 setup 中自动执行
  setupEspNow();
}

// ═══════════════════════════════════════════
// LOOP
// ═══════════════════════════════════════════
void loop() {
  if (calibrateRequested) {
    calibrateRequested = false;
    sum_roll_upper = 0; sum_pitch_upper = 0; sum_yaw_upper = 0;
    sum_roll_lower = 0; sum_pitch_lower = 0; sum_yaw_lower = 0;
    Serial.println("[CAL] 开始重新校准...");
    calculateZeroError();
    Serial.println("[CAL] 校准完成");
  }

  processSensor(upperLegSerial, stateUp, bufIdxUp, bufUp, upperLegData, "upperLeg");
  processSensor(lowerLegSerial, stateLo, bufIdxLo, bufLo, lowerLegData, "lowerLeg");

  if (upperLegData.newData && lowerLegData.newData) {
    normalizeAngles();
    upperLegData.newData = false;
    lowerLegData.newData = false;

    unsigned long now = millis();
    if (now - lastSendMs >= SEND_INTERVAL_MS) {
      sendLegData();
      lastSendMs = now;
    }
  }
}
