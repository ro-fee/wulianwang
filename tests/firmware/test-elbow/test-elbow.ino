// ═══════════════════════════════════════════════════════════
// 肘部卫星 — 测试版 (无 JY901S IMU, 模拟手臂角度)
// ═══════════════════════════════════════════════════════════
// 压力数据由腰间 Hub 直连鞋垫收取，肘部仅发手臂 6 角度
// ═══════════════════════════════════════════════════════════

#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>

// #define LEFT
#define RIGHT

static const uint8_t WAIST_MAC[] = {0x28, 0x84, 0x85, 0x6D, 0x67, 0xFC}; // ← 替换

static const unsigned long SEND_INTERVAL_MS = 30;
static const float SIM_FREQ_HZ = 1.0f;

struct __attribute__((packed)) ArmEspNowPacket {
  uint8_t header;        // 0x41 = 'A'
  uint8_t side;          // 'L' or 'R'
  int16_t angles[6];     // 上臂[3] + 下臂[3], 度×100
  uint16_t checksum;
};

static unsigned long lastSendMs = 0;
static unsigned long startMs = 0;
static uint32_t pktCount = 0;
esp_now_peer_info_t peerInfo;

void onSend(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {
  if (status != ESP_NOW_SEND_SUCCESS) Serial.println("[ESP-NOW] 发送失败!");
}

void generateFakeAngles(float angles[6]) {
  float t = (millis() - startMs) / 1000.0f;
  float phase = t * SIM_FREQ_HZ * TWO_PI;
  angles[0] = 8.0f  * sinf(phase * 0.5f);
  angles[1] = 30.0f * sinf(phase);
  angles[2] = 10.0f * sinf(phase * 0.6f);
  angles[3] = 5.0f  * sinf(phase * 0.5f);
  angles[4] = 20.0f * sinf(phase + 0.3f);
  angles[5] = 6.0f  * sinf(phase * 0.7f);
}

void sendArmData() {
  float angles[6];
  generateFakeAngles(angles);

  ArmEspNowPacket pkt;
  pkt.header = 0x41;
#ifdef LEFT
  pkt.side = 'L';
#else
  pkt.side = 'R';
#endif
  for (int i = 0; i < 6; i++) pkt.angles[i] = (int16_t)roundf(angles[i] * 100.0f);

  uint16_t sum = 0;
  uint8_t *raw = (uint8_t *)&pkt;
  for (size_t i = 0; i < sizeof(pkt) - 2; i++) sum += raw[i];
  pkt.checksum = sum;

  esp_err_t err = esp_now_send(WAIST_MAC, (uint8_t *)&pkt, sizeof(pkt));
  pktCount++;
  if (pktCount % 100 == 1) {
    Serial.printf("[TEST] #%u 上臂 P=%.1f° | 下臂 P=%.1f° | 发送%s\n",
      pktCount, angles[1], angles[4], err == ESP_OK ? "OK" : "FAIL");
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n╔══════════════════════════════════════╗");
  Serial.println("║  RGC 肘部卫星 — 测试模式 (仅手臂)    ║");
  Serial.println("╚══════════════════════════════════════╝");
#ifdef LEFT
  Serial.println("[CFG] 侧: LEFT");
#else
  Serial.println("[CFG] 侧: RIGHT");
#endif
  Serial.printf("[CFG] 目标 MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
    WAIST_MAC[0], WAIST_MAC[1], WAIST_MAC[2],
    WAIST_MAC[3], WAIST_MAC[4], WAIST_MAC[5]);

  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    Serial.println("[ESP-NOW] 初始化失败! 重启...");
    delay(3000);
    ESP.restart();
  }
  esp_now_register_send_cb(onSend);
  memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, WAIST_MAC, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);
  Serial.println("[ESP-NOW] 就绪");
  startMs = millis();
}

void loop() {
  unsigned long now = millis();
  if (now - lastSendMs >= SEND_INTERVAL_MS) {
    sendArmData();
    lastSendMs = now;
  }
}
