# hub-waist BLE 概念问答记录

> 2026-05-22，逐行讲解 hub-waist.ino 过程中对 BLE 基础概念的问答

---

## Q1: BLE 是什么？

BLE = Bluetooth Low Energy（蓝牙低功耗），蓝牙 4.0 引入。

| | 经典蓝牙 | BLE |
|---|---|---|
| 功耗 | 高 | 极低（纽扣电池数月） |
| 速率 | 2-3 Mbps | ~0.3 Mbps |
| 配对 | 需要 | 不需要 |
| 场景 | 音频、大文件 | 传感器、穿戴设备 |

本项目：ESP32 汇聚器当 BLE Peripheral，电脑 Python bleak 当 Client，推送运动数据给浏览器展示。

---

## Q2: 广播是向外发信号吗？为什么需要名字？

广播 = ESP32 每隔几十毫秒在 3 个 BLE 信道（37/38/39）上轮流发射广播包（最长 31 字节）。

名字的作用：
- **人识别**：扫描列表里看到 `RGC-BLE-RIGHT`，能分辨左右
- **代码过滤**：Python 按名字搜索，从一堆蓝牙设备中找到正确的 ESP32

完整广播→连接流程：
```
ESP32 广播 "RGC-BLE-RIGHT" → 电脑扫描 → 找到名字匹配 → 连接 → 写 CCD → 推送数据
```

连接建立后广播自动停止，断开后重新广播。

---

## Q3: 信道是什么？

BLE 在 2.4GHz 频段分了 **40 个信道**，间隔 2MHz：

- **3 个广播信道**（37/38/39）：只在上面喊话发广播
- **37 个数据信道**（0~36）：连接后跳频传输，每发一个包换频率，抗干扰

---

## Q4: CCD 是什么？

CCCD = Client Characteristic Configuration Descriptor，UUID `0x2902`。

本质是一个**开关**：
- `0x0001` → "开始推数据"
- `0x0000` → "停止推数据"

ESP32 固件第 277 行安装这个开关，Python 第 261 行 `start_notify()` 写 `0x0001` 开启推送。

---

## Q5: 蓝牙是自动连接的吗？

不自动。但本项目用 Python bleak 库在**系统层**自动扫描连接，绕过浏览器 Web Bluetooth 的弹窗限制。

```
标准方式：浏览器弹窗 → 人点选 → 连接（需要人操作）
本项目：  Python bleak → 代码自动扫描名字 → 自动连接（无需操作）
```

---

## Q6: 为什么我没选过设备？

架构不同：
```
ESP32 ← BLE → Python bleak 启动器 ← WebSocket → 浏览器
```

Python 脚本 (`ble_bridge_launcher.py`) 在系统层调用 `BleakScanner.find_device_by_filter()` 按名字 `"RGC-BLE-LEFT"` / `"RGC-BLE-RIGHT"` 自动扫描并连接。浏览器只需要连 WebSocket (`ws://127.0.0.1:8765`) 拿数据。

---

## Q7: 电脑可以连接多个蓝牙设备吗？

可以。Windows 通常 3-5 个稳定，本项目只需 2 个（左右腰汇聚器），完全够用。

---

## Q8: bleak 是什么？

Python 的 BLE 库，全称 "Bluetooth Low Energy platform Agnostic Klient"。

- `BleakScanner`：扫描附近 BLE 设备
- `BleakClient`：连接设备，收发数据

用 bleak 而不是 Web Bluetooth 的原因是：系统层运行，不需要用户交互，自动扫描自动连。

---

## Q9: Client 是什么意思？

连接发起方。永远是一方主动连（Client，电脑），一方被动等（Server，ESP32）。

```
Client (电脑/bleak)  →  主动连接  →  Server (ESP32)
```

---

## Q10: 两个 UUID 有什么区别？

| UUID | 层级 | 作用 | 类比 |
|------|------|------|------|
| Service UUID `12345678-...` | 上层 | 标识设备功能类型 | 大房间 |
| Characteristic UUID `abcd1234-...` | 下层 | 标识具体数据通道 | 房间里的柜子 |

两个 UUID 同时写在 ESP32 固件和 Python 脚本里，一模一样，用来互相识别。

---

## Q11: RGC-BLE-LEFT 的作用是什么？

ESP32 的设备名。Python 扫描时按这个名字找到正确设备（而非 MAC 地址），同时区分左右腿。

---

## Q12: UUID 电脑怎么知道？

写在 `ble_bridge_launcher.py` 第 29-30 行，和 ESP32 固件一模一样。开发者自己定义的 128 位随机 UUID，两边对上就能通信。
