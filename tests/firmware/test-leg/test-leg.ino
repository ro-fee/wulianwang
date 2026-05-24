// ═══════════════════════════════════════════════════════════
// 腿部卫星 — 测试版 (无 JY901S IMU, 用正弦波模拟)
// ═══════════════════════════════════════════════════════════
// 用途: 角度传感器没到时，验证 ESP-NOW → 腰间 Hub → BLE → PC 全链路
// 用法: 1. 先烧录 hub-waist.ino → 串口监视器复制 MAC
//       2. 将 MAC 填入下方 WAIST_MAC[]
//       3. 烧录本固件 → 打开串口监视器(115200) 观察发送日志
//       4. 传感器到货后，烧录正式版 satellite-leg.ino 即可
// ═══════════════════════════════════════════════════════════

#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>

// ── 选左/右腿 ──
// #define LEFT
#define RIGHT

// ── ESP-NOW 目标: 腰间 S3 MAC ⚠️ 烧录前必须替换为实际 MAC！──
// 获取方式: 先烧录 hub-waist.ino → 串口监视器(115200) → 复制打印的 MAC 地址
static const uint8_t WAIST_MAC[] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

// ── 模拟参数 ──
static const unsigned long SEND_INTERVAL_MS = 30;   // 33Hz, 与正式版一致
static const float SIM_FREQ_HZ = 1.0f;               // 1Hz 步频 (~60步/分)
// TWO_PI 已由 ESP32 Arduino.h 提供

// ── ESP-NOW 数据包 (与正式版完全一致) ──
struct __attribute__((packed)) LegPacket {
  uint8_t header;       // 0x4C = 'L'
  uint8_t side;         // 'L' or 'R'
  int16_t angles[6];    // 大腿[3] + 小腿[3], 度×100
  uint16_t checksum;
};

static unsigned long lastSendMs = 0;
static unsigned long startMs = 0;
static uint32_t pktCount = 0;
esp_now_peer_info_t peerInfo;

// ═══════════════════════════════════════════
// ESP-NOW 发送回调
// ═══════════════════════════════════════════
void onSend(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {
  if (status != ESP_NOW_SEND_SUCCESS) {
    Serial.println("[ESP-NOW] 发送失败!");
  }
}

// ═══════════════════════════════════════════
// 生成模拟腿部角度
// ═══════════════════════════════════════════
void generateFakeAngles(float angles[6]) {
  float t = (millis() - startMs) / 1000.0f;  // 秒
  float phase = t * SIM_FREQ_HZ * TWO_PI;
  float halfPhase = phase + 0.4f;             // 小腿相位偏移 (膝屈伸滞后于髋)

  // 大腿: 模拟行走时髋关节运动
  angles[0] = 6.0f  * sinf(phase * 0.5f);       // Roll:  ±6°  (轻微外展/内收)
  angles[1] = 25.0f * sinf(phase);               // Pitch: ±25° (主运动: 屈伸)
  angles[2] = 4.0f  * sinf(phase * 0.7f);       // Yaw:   ±4°  (轻微旋转)

  // 小腿: 模拟膝关节屈伸
  angles[3] = 3.0f  * sinf(phase * 0.5f);       // Roll:  ±3°
  angles[4] = 40.0f * sinf(halfPhase);           // Pitch: ±40° (膝关节主运动)
  angles[5] = 2.0f  * sinf(phase * 0.6f);       // Yaw:   ±2°
}

// ═══════════════════════════════════════════
// 发送腿部数据
// ═══════════════════════════════════════════
void sendLegData() {
  float angles[6];
  generateFakeAngles(angles);

  LegPacket pkt;
  pkt.header = 0x4C;
#ifdef LEFT
  pkt.side = 'L';
#else
  pkt.side = 'R';
#endif

  for (int i = 0; i < 6; i++) {
    pkt.angles[i] = (int16_t)roundf(angles[i] * 100.0f);
  }

  // 校验和
  uint16_t sum = 0;
  uint8_t *raw = (uint8_t *)&pkt;
  for (size_t i = 0; i < sizeof(pkt) - 2; i++) sum += raw[i];
  pkt.checksum = sum;

  esp_err_t err = esp_now_send(WAIST_MAC, (uint8_t *)&pkt, sizeof(pkt));
  pktCount++;

  if (pktCount % 100 == 1) {  // 每100包 (~3秒) 打印一次
    Serial.printf("[TEST] #%u 大腿 R=%.1f P=%.1f Y=%.1f | 小腿 R=%.1f P=%.1f Y=%.1f | 发送%s\n",
      pktCount,
      angles[0], angles[1], angles[2],
      angles[3], angles[4], angles[5],
      err == ESP_OK ? "OK" : "FAIL");
  }
}

// ═══════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n╔══════════════════════════════════════╗");
  Serial.println("║  RGC 腿部卫星 — 测试模式 (无IMU)     ║");
  Serial.println("╚══════════════════════════════════════╝");

#ifdef LEFT
  Serial.println("[CFG] 侧: LEFT");
#else
  Serial.println("[CFG] 侧: RIGHT");
#endif
  Serial.printf("[CFG] 步频模拟: %.1f Hz\n", SIM_FREQ_HZ);
  Serial.printf("[CFG] 发送间隔: %lu ms (~%.0f Hz)\n", SEND_INTERVAL_MS, 1000.0f / SEND_INTERVAL_MS);
  Serial.printf("[CFG] 目标 MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
    WAIST_MAC[0], WAIST_MAC[1], WAIST_MAC[2],
    WAIST_MAC[3], WAIST_MAC[4], WAIST_MAC[5]);

  // 初始化 ESP-NOW
  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    Serial.println("[ESP-NOW] 初始化失败! 3秒后重启...");
    delay(3000);
    ESP.restart();
  }

  esp_now_register_send_cb(onSend);

  memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, WAIST_MAC, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;

  esp_err_t peerErr = esp_now_add_peer(&peerInfo);
  if (peerErr == ESP_OK) {
    Serial.println("[ESP-NOW] Peer 添加成功，开始发送模拟数据");
  } else {
    Serial.printf("[ESP-NOW] Peer 添加失败 (错误码 %d)，但会继续尝试发送\n", peerErr);
  }

  startMs = millis();
}

// ═══════════════════════════════════════════
// LOOP
// ═══════════════════════════════════════════
void loop() {
  unsigned long now = millis();
  if (now - lastSendMs >= SEND_INTERVAL_MS) {
    sendLegData();
    lastSendMs = now;
  }
}
