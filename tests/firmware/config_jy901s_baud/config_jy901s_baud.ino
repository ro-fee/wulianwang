#include <Arduino.h>
#include <HardwareSerial.h>

// JY901S 波特率修改工具
// 将两颗 JY901S 从 9600 改成 115200 并保存到 Flash
//
// 用法:
//   1. 确认肘部 S3 已连接两颗 JY901S (原接线不动)
//   2. 烧录本固件 → 打开串口监视器(9600) 观察结果
//   3. 成功后烧回 rgc-backend.ino (同步改成 115200)

// ── 默认 RIGHT 侧. 如果是 LEFT 请注释 RIGHT, 取消注释 LEFT ──
// #define LEFT
#define RIGHT

HardwareSerial upperSerial(1);
HardwareSerial lowerSerial(2);

// 当前 JY901S 波特率 (要连上才能发命令)
static const unsigned long CURRENT_BAUD = 9600;

void powerOnImus() {
  pinMode(1, OUTPUT);  pinMode(4, OUTPUT);
  pinMode(9, OUTPUT);  pinMode(12, OUTPUT);
  digitalWrite(1, LOW);    // upper GND
  digitalWrite(4, HIGH);   // upper VCC
  digitalWrite(9, LOW);    // lower GND
  digitalWrite(12, HIGH);  // lower VCC
}

void sendCommand(HardwareSerial &serial, const uint8_t *cmd, size_t len, const char *label) {
  Serial.printf("[%s] 发送: ", label);
  for (size_t i = 0; i < len; i++) {
    Serial.printf("%02X ", cmd[i]);
    serial.write(cmd[i]);
  }
  Serial.println();
  delay(200);
}

void setup() {
  Serial.begin(9600);
  delay(500);
  Serial.println("\n========================================");
  Serial.println("[JY901S 波特率修改工具] 9600 → 115200");
  Serial.println("========================================");

  powerOnImus();
  delay(1000);  // 等 JY901S 上电稳定
  Serial.println("JY901S 已上电，等待稳定...\n");

#ifdef LEFT
  upperSerial.begin(CURRENT_BAUD, SERIAL_8N1, 10, 11);
  lowerSerial.begin(CURRENT_BAUD, SERIAL_8N1, 2, 3);
#else
  upperSerial.begin(CURRENT_BAUD, SERIAL_8N1, 2, 3);
  lowerSerial.begin(CURRENT_BAUD, SERIAL_8N1, 10, 11);
#endif

  // 1. 设置波特率 115200
  //    JY901S 寄存器 0x04 = 波特率, 值 0x05 = 115200
  uint8_t setBaud115200[] = {0xFF, 0xAA, 0x04, 0x05, 0x00};
  sendCommand(upperSerial, setBaud115200, 5, "上臂 IMU");
  sendCommand(lowerSerial, setBaud115200, 5, "下臂 IMU");

  delay(500);

  // 2. 保存到 Flash
  uint8_t saveCmd[] = {0xFF, 0xAA, 0x00, 0x00, 0x00};
  sendCommand(upperSerial, saveCmd, 5, "上臂保存");
  sendCommand(lowerSerial, saveCmd, 5, "下臂保存");

  Serial.println("\n========================================");
  Serial.println(" 修改完成！");
  Serial.println(" 下一步:");
  Serial.println(" 1. 把 rgc-backend.ino 的三处 9600 改成 115200");
  Serial.println(" 2. 烧录 rgc-backend.ino 回肘部 S3");
  Serial.println(" 3. 打开串口监视器(115200) 确认 IMU 数据正常");
  Serial.println("========================================");
}

void loop() {
  // 什么也不做
}
