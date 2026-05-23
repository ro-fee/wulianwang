// ═══════════════════════════════════════════════════════════
// 肘部卫星 — 测试版 (无 JY901S IMU + 无 BLE 鞋垫, 全模拟)
// ═══════════════════════════════════════════════════════════
// 用途: 角度传感器和鞋垫都没到时，验证 ESP-NOW → 腰间 Hub → BLE → PC 全链路
// 用法: 1. 先烧录 hub-waist.ino → 串口监视器复制 MAC
//       2. 将 MAC 填入下方 WAIST_MAC[]
//       3. 烧录本固件 → 打开串口监视器(115200) 观察发送日志
//       4. 传感器到货后，烧录正式版 rgc-backend.ino 即可
// ═══════════════════════════════════════════════════════════

#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>

// ── 选左/右臂 ──
// #define LEFT
#define RIGHT

// ── ESP-NOW 目标: 腰间 S3 MAC ⚠️ 烧录前必须替换为实际 MAC！──
static const uint8_t WAIST_MAC[] = {0x28, 0x84, 0x85, 0x6D, 0x68, 0x0C};

// ── 模拟参数 ──
static const unsigned long SEND_INTERVAL_MS = 30;
static const float SIM_FREQ_HZ = 1.0f;               // 1Hz 步频
// TWO_PI 已由 ESP32 Arduino.h 提供
static const uint16_t PRESSURE_MAX = 1200;            // 模拟压力峰值 (原始ADC值)

// ── ESP-NOW 数据包 (与正式版完全一致) ──
struct __attribute__((packed)) ArmEspNowPacket {
  uint8_t header;        // 0x41 = 'A'
  uint8_t side;          // 'L' or 'R'
  int16_t angles[6];     // 上臂[3] + 下臂[3], 度×100
  uint16_t pressures[18];
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
// 生成模拟手臂角度 (跑步摆臂动作)
// ═══════════════════════════════════════════
void generateFakeArmAngles(float angles[6]) {
  float t = (millis() - startMs) / 1000.0f;
  float phase = t * SIM_FREQ_HZ * TWO_PI;

  // 上臂: 跑步时肩关节主要在 pitch 方向前后摆动
  angles[0] = 8.0f  * sinf(phase * 0.5f);          // Roll:  ±8°  (轻微外展)
  angles[1] = 30.0f * sinf(phase);                   // Pitch: ±30° (主运动: 前摆/后摆)
  angles[2] = 10.0f * sinf(phase * 0.6f);           // Yaw:   ±10° (轻微旋转)

  // 下臂: 肘关节随摆臂自然屈伸
  angles[3] = 5.0f  * sinf(phase * 0.5f);          // Roll:  ±5°
  angles[4] = 20.0f * sinf(phase + 0.3f);           // Pitch: ±20° (肘屈伸, 相对上臂滞后)
  angles[5] = 6.0f  * sinf(phase * 0.7f);          // Yaw:   ±6°
}

// ═══════════════════════════════════════════
// 生成模拟足底压力 (步态周期: 单脚支撑→双脚→单脚)
// ═══════════════════════════════════════════
void generateFakePressures(uint16_t pressures[18]) {
  float t = (millis() - startMs) / 1000.0f;
  float phase = t * SIM_FREQ_HZ * TWO_PI;

  // 步态相位: 0~π = 该脚触地(压力高), π~2π = 该脚腾空(压力低)
  // 用半波整流正弦模拟
  float stance = sinf(phase);                    // [-1, 1]
  float pressureScale = fmaxf(0.0f, stance);     // 半波整流 [0, 1]
  // 加入足底滚动效果: 着地时压力从前掌→全掌→后跟移动
  float rollShift = phase;                        // 用于模拟压力中心前后移动

  // 18个压力传感器分区:
  // 索引 0-5:   前掌区 (forefoot)
  // 索引 6-11:  中足区 (midfoot)
  // 索引 12-17: 后跟区 (heel)

  float foreScale = fmaxf(0.0f, sinf(rollShift + 0.5f));    // 前掌先触地
  float heelScale  = fmaxf(0.0f, sinf(rollShift - 0.5f));    // 后跟后触地
  float midScale   = (foreScale + heelScale) * 0.5f;          // 中足过渡

  for (int i = 0; i < 6; i++) {
    pressures[i]      = (uint16_t)(pressureScale * foreScale * PRESSURE_MAX * (0.7f + 0.3f * sinf(i * 0.8f)));
    pressures[i + 6]  = (uint16_t)(pressureScale * midScale  * PRESSURE_MAX * (0.6f + 0.4f * sinf(i * 0.7f)));
    pressures[i + 12] = (uint16_t)(pressureScale * heelScale * PRESSURE_MAX * (0.7f + 0.3f * sinf(i * 0.9f)));
  }
}

// ═══════════════════════════════════════════
// 发送手臂+压力数据
// ═══════════════════════════════════════════
void sendArmData() {
  float angles[6];
  uint16_t pressures[18];
  generateFakeArmAngles(angles);
  generateFakePressures(pressures);

  ArmEspNowPacket pkt;
  pkt.header = 0x41;
#ifdef LEFT
  pkt.side = 'L';
#else
  pkt.side = 'R';
#endif

  for (int i = 0; i < 6; i++) {
    pkt.angles[i] = (int16_t)roundf(angles[i] * 100.0f);
  }
  for (int i = 0; i < 18; i++) {
    pkt.pressures[i] = pressures[i];
  }

  uint16_t sum = 0;
  uint8_t *raw = (uint8_t *)&pkt;
  for (size_t i = 0; i < sizeof(pkt) - 2; i++) sum += raw[i];
  pkt.checksum = sum;

  esp_err_t err = esp_now_send(WAIST_MAC, (uint8_t *)&pkt, sizeof(pkt));
  pktCount++;

  if (pktCount % 100 == 1) {
    // 计算压力总值用于快速验证
    uint32_t pSum = 0;
    for (int i = 0; i < 18; i++) pSum += pressures[i];
    Serial.printf("[TEST] #%u 上臂 P=%.1f° | 下臂 P=%.1f° | 压力总和=%u | 发送%s\n",
      pktCount, angles[1], angles[4], (uint32_t)pSum,
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
  Serial.println("║  RGC 肘部卫星 — 测试模式 (无传感器)  ║");
  Serial.println("╚══════════════════════════════════════╝");

#ifdef LEFT
  Serial.println("[CFG] 侧: LEFT");
#else
  Serial.println("[CFG] 侧: RIGHT");
#endif
  Serial.printf("[CFG] 步频模拟: %.1f Hz\n", SIM_FREQ_HZ);
  Serial.printf("[CFG] 发送间隔: %lu ms (~%.0f Hz)\n", SEND_INTERVAL_MS, 1000.0f / SEND_INTERVAL_MS);
  Serial.printf("[CFG] 模拟数据: 手臂6角度 + 足底18压力\n");
  Serial.printf("[CFG] 目标 MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
    WAIST_MAC[0], WAIST_MAC[1], WAIST_MAC[2],
    WAIST_MAC[3], WAIST_MAC[4], WAIST_MAC[5]);

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
    sendArmData();
    lastSendMs = now;
  }
}
