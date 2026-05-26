#include <Arduino.h>
#include <HardwareSerial.h>

// JY901S 验证固件 — 读取并打印 IMU 数据
// 用法: 烧录 → 串口监视器 115200 → 看角度数据
//       有数据=波特率正确, 无数据/乱码=波特率不匹配

// ── 根据接线选择 LEFT 或 RIGHT ──
// #define LEFT
#define RIGHT

struct ImuData { float roll, pitch, yaw; bool newData; };

HardwareSerial imu1(1);
HardwareSerial imu2(2);
ImuData d1 = {0}, d2 = {0};
int s1 = 0, bi1 = 0; uint8_t b1[11];
int s2 = 0, bi2 = 0; uint8_t b2[11];

const unsigned long BAUD = 115200;  // JY901S 波特率

void parse(HardwareSerial &s, int &st, int &bi, uint8_t *buf, ImuData &d, const char *tag) {
  while (s.available()) {
    uint8_t b = s.read();
    if (st == 0) { if (b == 0x55) { buf[0] = b; st = 1; } }
    else if (st == 1) { if (b == 0x53) { buf[1] = b; st = 2; bi = 2; } else st = 0; }
    else if (st == 2) {
      buf[bi++] = b;
      if (bi == 11) {
        uint8_t sum = 0;
        for (int i = 0; i < 10; i++) sum += buf[i];
        if (sum == buf[10]) {
          int16_t rr = (buf[3] << 8) | buf[2];
          int16_t pr = (buf[5] << 8) | buf[4];
          int16_t yr = (buf[7] << 8) | buf[6];
          d.roll  = rr * 180.0 / 32768.0;
          d.pitch = pr * 180.0 / 32768.0;
          d.yaw   = yr * 180.0 / 32768.0;
          d.newData = true;
        } else {
          Serial.printf("[%s] checksum err\n", tag);
        }
        st = 0;
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  // 供电
  pinMode(1, OUTPUT); pinMode(4, OUTPUT);
  pinMode(9, OUTPUT); pinMode(12, OUTPUT);
  digitalWrite(1, LOW);  digitalWrite(4, HIGH);
  digitalWrite(9, LOW);  digitalWrite(12, HIGH);

#ifdef LEFT
  imu1.begin(BAUD, SERIAL_8N1, 10, 11);
  imu2.begin(BAUD, SERIAL_8N1, 2, 3);
#else
  imu1.begin(BAUD, SERIAL_8N1, 2, 3);
  imu2.begin(BAUD, SERIAL_8N1, 10, 11);
#endif

  Serial.println("\n========================================");
  Serial.printf("[JY901S 验证] BAUD=%lu\n", BAUD);
  Serial.println("========================================");
  Serial.println("等待 IMU 数据... (Ctrl+C 退出串口监视器)\n");
}

void loop() {
  parse(imu1, s1, bi1, b1, d1, "上臂");
  parse(imu2, s2, bi2, b2, d2, "下臂");

  if (d1.newData && d2.newData) {
    d1.newData = false; d2.newData = false;
    static unsigned long last = 0;
    if (millis() - last >= 1000) {
      last = millis();
      Serial.printf("上臂 R:%7.2f P:%7.2f Y:%7.2f | 下臂 R:%7.2f P:%7.2f Y:%7.2f\n",
        d1.roll, d1.pitch, d1.yaw, d2.roll, d2.pitch, d2.yaw);
    }
  }
}
