#include <Arduino.h>
#include <HardwareSerial.h>
#include <esp_now.h>
#include <WiFi.h>

// ── 选左/右腿 (烧录时改 #define) ──
// #define LEFT
#define RIGHT

// ── ESP-NOW 目标: 腰间 S3 MAC (先用广播, 后续填入实际 MAC) ──
static const uint8_t WAIST_MAC[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// ── JY901S 串口引脚 (ESP32-S3 SuperMini) ──
// 大腿 IMU: UART1
#define UPPER_LEG_RX 4
#define UPPER_LEG_TX 5
// 小腿 IMU: UART2
#define LOWER_LEG_RX 6
#define LOWER_LEG_TX 7

// ── ESP-NOW 数据包 ──
struct __attribute__((packed)) LegPacket {
  uint8_t header;       // 0x4C = 'L'
  uint8_t side;         // 'L' or 'R'
  int16_t angles[6];    // 大腿[3] + 小腿[3], 度×100
  uint16_t checksum;
};

// ── IMU 数据结构 ──
struct ImuData {
  float roll, pitch, yaw;
  bool newData;
};

HardwareSerial upperLegSerial(1);
HardwareSerial lowerLegSerial(2);

ImuData upperLeg = {0, 0, 0, false};
ImuData lowerLeg = {0, 0, 0, false};

// 串口状态机
static int stateUp = 0, bufIdxUp = 0;
static uint8_t bufUp[11];
static int stateLo = 0, bufIdxLo = 0;
static uint8_t bufLo[11];

// 零偏
float zeroUpper[3] = {0}, zeroLower[3] = {0};
static const int ZERO_SAMPLES = 10;

// 发送节流
static unsigned long lastSendMs = 0;
static const unsigned long SEND_INTERVAL_MS = 30;

// ESP-NOW
esp_now_peer_info_t peerInfo;

// ═══════════════════════════════════════════
// JY901S 解析: 0x55 0x53 协议 (复用手臂固件逻辑)
// ═══════════════════════════════════════════
void processJY901(HardwareSerial &ser, int &state, int &bfIdx,
                  uint8_t *buf, ImuData &imu, const char *name) {
  while (ser.available()) {
    uint8_t b = ser.read();
    if (state == 0) {
      if (b == 0x55) { buf[0] = b; state = 1; }
    } else if (state == 1) {
      if (b == 0x53) { buf[1] = b; state = 2; bfIdx = 2; }
      else state = 0;
    } else if (state == 2) {
      buf[bfIdx++] = b;
      if (bfIdx == 11) {
        uint8_t sum = 0;
        for (int i = 0; i < 10; i++) sum += buf[i];
        if (sum == buf[10]) {
          int16_t rollRaw  = (buf[3] << 8) | buf[2];
          int16_t pitchRaw = (buf[5] << 8) | buf[4];
          int16_t yawRaw   = (buf[7] << 8) | buf[6];
          imu.roll  = rollRaw  / 32768.0 * 180.0;
          imu.pitch = pitchRaw / 32768.0 * 180.0;
          imu.yaw   = yawRaw   / 32768.0 * 180.0;
          imu.newData = true;
        }
        state = 0; bfIdx = 0;
      }
    }
  }
}

// ═══════════════════════════════════════════
// 零偏校准 (启动时采样 10 帧求均值)
// ═══════════════════════════════════════════
void calibrateZero() {
  Serial.println("[CAL] 零偏校准开始，请保持腿部静止...");
  float sumUpper[3] = {0}, sumLower[3] = {0};
  int count = 0;

  unsigned long start = millis();
  while (count < ZERO_SAMPLES && (millis() - start) < 5000) {
    processJY901(upperLegSerial, stateUp, bufIdxUp, bufUp, upperLeg, "upperLeg");
    processJY901(lowerLegSerial, stateLo, bufIdxLo, bufLo, lowerLeg, "lowerLeg");

    if (upperLeg.newData && lowerLeg.newData) {
      sumUpper[0] += upperLeg.roll;
      sumUpper[1] += upperLeg.pitch;
      sumUpper[2] += upperLeg.yaw;
      sumLower[0] += lowerLeg.roll;
      sumLower[1] += lowerLeg.pitch;
      sumLower[2] += lowerLeg.yaw;
      upperLeg.newData = false;
      lowerLeg.newData = false;
      count++;
      delay(10);
    }
  }

  for (int i = 0; i < 3; i++) {
    zeroUpper[i] = sumUpper[i] / count;
    zeroLower[i] = sumLower[i] / count;
  }

  Serial.printf("[CAL] 大腿零偏: roll=%.2f pitch=%.2f yaw=%.2f\n",
                zeroUpper[0], zeroUpper[1], zeroUpper[2]);
  Serial.printf("[CAL] 小腿零偏: roll=%.2f pitch=%.2f yaw=%.2f\n",
                zeroLower[0], zeroLower[1], zeroLower[2]);
}

// ═══════════════════════════════════════════
// ESP-NOW 发送回调
// ═══════════════════════════════════════════
void onSend(const uint8_t *mac, esp_now_send_status_t status) {
  // 静默, 不打印日志以免影响性能
}

// ═══════════════════════════════════════════
// 发送腿部数据
// ═══════════════════════════════════════════
void sendLegData() {
  LegPacket pkt;
  pkt.header = 0x4C; // 'L'
  pkt.side =
#ifdef LEFT
    'L';
#else
    'R';
#endif

  // 零偏修正
  float angles[6] = {
    upperLeg.roll - zeroUpper[0],
    upperLeg.pitch - zeroUpper[1],
    upperLeg.yaw - zeroUpper[2],
    lowerLeg.roll - zeroLower[0],
    lowerLeg.pitch - zeroLower[1],
    lowerLeg.yaw - zeroLower[2]
  };

  // 编码为 int16 ×100
  for (int i = 0; i < 6; i++) {
    pkt.angles[i] = (int16_t)round(angles[i] * 100.0f);
  }

  // 校验和
  uint16_t sum = 0;
  uint8_t *raw = (uint8_t *)&pkt;
  for (size_t i = 0; i < sizeof(pkt) - 2; i++) sum += raw[i];
  pkt.checksum = sum;

  esp_now_send(WAIST_MAC, (uint8_t *)&pkt, sizeof(pkt));
}

// ═══════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n[RGC] 腿部卫星启动");

#ifdef LEFT
  Serial.println("[RGC] 侧: LEFT");
#else
  Serial.println("[RGC] 侧: RIGHT");
#endif

  // 初始化 JY901S 串口
  upperLegSerial.begin(115200, SERIAL_8N1, UPPER_LEG_RX, UPPER_LEG_TX);
  lowerLegSerial.begin(115200, SERIAL_8N1, LOWER_LEG_RX, LOWER_LEG_TX);
  Serial.printf("[UART] 大腿IMU: RX=%d TX=%d\n", UPPER_LEG_RX, UPPER_LEG_TX);
  Serial.printf("[UART] 小腿IMU: RX=%d TX=%d\n", LOWER_LEG_RX, LOWER_LEG_TX);

  // 零偏校准
  calibrateZero();

  // 初始化 ESP-NOW
  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    Serial.println("[ESP-NOW] 初始化失败! 重启...");
    delay(1000);
    ESP.restart();
  }

  esp_now_register_send_cb(onSend);

  memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, WAIST_MAC, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("[ESP-NOW] 添加 peer 失败，继续尝试发送...");
  }

  Serial.println("[ESP-NOW] 就绪，开始发送数据");
}

// ═══════════════════════════════════════════
// LOOP
// ═══════════════════════════════════════════
void loop() {
  processJY901(upperLegSerial, stateUp, bufIdxUp, bufUp, upperLeg, "upperLeg");
  processJY901(lowerLegSerial, stateLo, bufIdxLo, bufLo, lowerLeg, "lowerLeg");

  if (upperLeg.newData && lowerLeg.newData) {
    unsigned long now = millis();
    if (now - lastSendMs >= SEND_INTERVAL_MS) {
      sendLegData();
      lastSendMs = now;
    }
    upperLeg.newData = false;
    lowerLeg.newData = false;
  }
}
