# 大创项目 — 环境配置与运行指南

## 一、硬件连接

### 1.1 硬件清单

| 硬件 | 数量 | 说明 |
|------|------|------|
| ESP32 开发板 | 2 | 一个配置为 LEFT，一个为 RIGHT |
| IMU 传感器（大臂） | 2 | 通过 UART 连接 ESP32 |
| IMU 传感器（小臂） | 2 | 通过 UART 连接 ESP32 |
| 足部压力传感器 | 2 | 左右脚各一个，通过 BLE 与 ESP32 通信 |
| USB 数据线 | 2 | ESP32 供电 + 串口调试 |

### 1.2 ESP32 引脚接线

`rgc-backend.ino` 中引脚定义（以 RIGHT 为例）：

| 功能 | ESP32 引脚 |
|------|-----------|
| 大臂 IMU UART RX | GPIO 3 |
| 大臂 IMU UART TX | GPIO 2 |
| 小臂 IMU UART RX | GPIO 11 |
| 小臂 IMU UART TX | GPIO 10 |
| 输出引脚 1 | GPIO 1 (LOW) |
| 输出引脚 2 | GPIO 4 (HIGH) |
| 输出引脚 3 | GPIO 9 (LOW) |
| 输出引脚 4 | GPIO 12 (HIGH) |

> LEFT 版本：大臂用 GPIO 10/11，小臂用 GPIO 2/3（与 RIGHT 互换）。

### 1.3 IMU 数据协议

IMU 通过串口（115200, 8N1）发送 11 字节数据包：

| 偏移 | 长度 | 内容 |
|------|------|------|
| 0 | 1 | 帧头 0x55 |
| 1 | 1 | 帧头 0x53 |
| 2~3 | 2 | Roll 原始值 (int16 LE)，公式: `raw / 32768 × 180` |
| 4~5 | 2 | Pitch 原始值 (int16 LE) |
| 6~7 | 2 | Yaw 原始值 (int16 LE) |
| 8~9 | 2 | 保留 |
| 10 | 1 | 校验和 (bytes 0~9 之和) |

### 1.4 足部压力传感器 BLE

足部传感器是独立 BLE 外设：

| 属性 | 值 |
|------|-----|
| Service UUID | `0000fff0-0000-1000-8000-00805f9b34fb` |
| Notify UUID | `0000fff1-0000-1000-8000-00805f9b34fb` |
| 数据格式 | 39 字节/包，帧头 0xAA，含 18 个 uint16 压力值 |
| LEFT 地址 | `FF:24:08:20:53:BD` |
| RIGHT 地址 | `FF:23:10:16:02:EA` |

### 1.5 上电顺序

```
① IMU（大臂 + 小臂）通电
② ESP32 通电（与 IMU 一体的话同步上电）
③ 足部压力传感器通电
④ PC 运行桥接器
```

**为什么这个顺序？** ESP32 的 `setup()` 启动后立即执行 `calculateZeroError()`，等待 IMU 数据做零点校准。IMU 没数据就卡死，BLE 服务不会初始化。

---

## 二、ESP32 固件烧录

### 2.1 工具

- Arduino IDE 2.x 或 PlatformIO
- ESP32 开发板支持包（Arduino IDE: 开发板管理器安装 `esp32 by Espressif Systems`）

### 2.2 所需库

| 库 | 用途 |
|----|------|
| `BLEDevice` | ESP32 BLE Server/Client |
| `BLEUtils` | BLE UUID 定义 |
| `BLEServer` | BLE 服务端 |
| `BLEClient` | BLE 客户端（连接足部传感器） |
| `BLE2902` | BLE 描述符（使能 Notify） |
| `HardwareSerial` | UART 通信（接收 IMU 数据） |

> 以上库均包含在 ESP32 Arduino Core 中，无需额外安装。

### 2.3 烧录步骤

1. 打开 `rgc-backend.ino`
2. 根据需要取消注释 `#define LEFT` 或 `#define RIGHT`（两个 ESP32 分别烧录不同版本）
3. 选择开发板：`ESP32 Dev Module`
4. 选择端口：连接 ESP32 后对应的 COM 口
5. 点击上传

### 2.4 验证

烧录后用串口监视器（115200 波特率）观察输出：

```
RGC BLE backend starting...
IMU serial initialized.
upper zero error: roll=1.23, pitch=-0.45, yaw=5.67
lower zero error: roll=-3.12, pitch=0.89, yaw=10.34
Web BLE server started: RGC-BLE-RIGHT
Connecting to sensor BLE device...
Sensor BLE connected.
Sensor BLE notify enabled.
```

看到 `Web BLE server started` 即表示 BLE 广播已启动。

---

## 三、PC 环境配置（Python 桥接器）

### 3.1 Python 版本

Python 3.10 ~ 3.14 均可。**注意：Windows 上可能安装多个 Python，务必确保运行和安装用的是同一个。**

### 3.2 安装依赖

```bash
pip install bleak websockets
```

| 包 | 版本 | 用途 |
|----|------|------|
| `bleak` | ≥3.0 | BLE 客户端，扫描并连接 ESP32，订阅 Notify |
| `websockets` | ≥14 | WebSocket 服务端，将 BLE 数据推送给前端页面 |

> bleak 在 Windows 上会自动安装 `winrt-*` 系列子包（Windows Runtime BLE API 绑定）。

### 3.3 Python 多环境问题排查

如果 `pip install` 成功但运行时提示 `ModuleNotFoundError`：

```bash
# 查看命令行走的是哪个 Python
where python

# 查看 pip 对应的 Python
python -m pip --version

# 如果两者不一致，用完整路径运行
C:/Users/xxx/AppData/Local/Python/pythoncore-3.14-64/python.exe -m pip install bleak websockets
C:/Users/xxx/AppData/Local/Python/pythoncore-3.14-64/python.exe -u ble_bridge_launcher.py
```

### 3.4 网路要求

前端页面依赖 CDN 资源（需外网）：

| 资源 | URL |
|------|-----|
| Tailwind CSS | `https://cdn.tailwindcss.com` |
| Font Awesome | `https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css` |
| Chart.js | `https://cdn.jsdelivr.net/npm/chart.js` |
| Chart.js DataLabels | `https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0` |
| Google Fonts | `https://fonts.googleapis.com/css2?family=Inter` |

> 离线环境下可下载这些文件到 `rgc-frontend/` 本地引用。

---

## 四、蓝牙连接过程（数据链路详解）

### 4.1 整体架构

```
┌──────────────┐   BLE Notify    ┌──────────────┐   BLE Notify    ┌──────────────────┐   WebSocket   ┌──────────┐
│ 足部压力传感器 │ ───────────────► │    ESP32     │ ───────────────► │ ble_bridge_      │ ─────────────► │ 前端页面  │
│ (BLE Peripheral)│               │ (BLE Central  │               │ launcher.py      │              │ (浏览器)  │
└──────────────┘                  │  + Server)   │               │ (BLE Central +   │              └──────────┘
                                  └──────────────┘               │  WS Server)      │
                                   ▲        ▲                    └──────────────────┘
                                   │        │
                              ┌────┘        └────┐
                              │                  │
                         大臂IMU (UART)    小臂IMU (UART)
```

### 4.2 各阶段详情

#### 阶段 1：ESP32 初始化

1. ESP32 上电，串口输出 `RGC BLE backend starting...`
2. 初始化 IMU 串口（UART1: GPIO 2/3, UART2: GPIO 10/11）
3. **零点校准**：采集 10 组 IMU 数据，计算平均值作为零偏
4. 初始化 BLE Device，设备名 `RGC-BLE-LEFT` 或 `RGC-BLE-RIGHT`
5. 创建 BLE Service (`12345678-1234-1234-1234-1234567890ab`)
6. 创建 Characteristic (`abcd1234-1234-1234-1234-abcdef123456`)，支持 Read/Notify/Write
7. 启动 BLE 广播
8. 作为 BLE Client 连接足部压力传感器

#### 阶段 2：桥接器扫描与连接

1. `ble_bridge_launcher.py` 启动，启动 HTTP 服务器 (端口 5502) 提供前端页面
2. 启动 WebSocket 服务器 (端口 8765) 等待前端连接
3. 并行启动两个 `BleForwarder`，通过设备名过滤扫描 BLE 设备：
   - LEFT: 扫描 `RGC-BLE-LEFT`
   - RIGHT: 扫描 `RGC-BLE-RIGHT`
4. 扫描到设备后，连接并订阅 `abcd1234-...` Characteristic 的 Notify

#### 阶段 3：数据传输

1. ESP32 收到 IMU 数据（大臂 + 小臂）和足部压力数据后，组装 56 字节 RG 数据包
2. 通过 BLE Notify 发送给桥接器（每 30ms 一个包）
3. 桥接器接收二进制数据，校验后解析为 JSON：`{"source": "LEFT", "data": [6角度, 18压力]}`
4. 通过 WebSocket 广播给所有连接的前端页面

#### 阶段 4：前端渲染

1. 前端页面打开后连接 `ws://127.0.0.1:8765`
2. 收到 JSON 消息后，分别处理：
   - **index.html**: 提取前 6 个角度值绘制大小臂曲线图
   - **foot.html**: 提取后 18 个压力值绘制足部热力图
   - **arm.html**: 提取前 6 个角度值绘制手臂关节曲线
3. 新打开的页面会收到 `latest_packets` 中的最新数据（不丢失状态）

### 4.3 BLE UUID 参数

| 参数 | 值 | 说明 |
|------|-----|------|
| ESP32 BLE Service UUID | `12345678-1234-1234-1234-1234567890ab` | 服务标识 |
| ESP32 BLE Data Char UUID | `abcd1234-1234-1234-1234-abcdef123456` | 数据通道 |
| ESP32 BLE 设备名 (左) | `RGC-BLE-LEFT` | 扫描过滤名 |
| ESP32 BLE 设备名 (右) | `RGC-BLE-RIGHT` | 扫描过滤名 |
| 足部传感器 Service UUID | `0000fff0-0000-1000-8000-00805f9b34fb` | 足部传感器服务 |
| 足部传感器 Notify UUID | `0000fff1-0000-1000-8000-00805f9b34fb` | 足部数据通道 |

### 4.4 RG 数据包格式

ESP32 发送的 56 字节二进制包结构：

| 字节偏移 | 长度 | 字段 | 类型 | 说明 |
|----------|------|------|------|------|
| 0 | 2 | Magic | uint8[2] | 固定 `R` `G` (0x52, 0x47) |
| 2 | 1 | Version | uint8 | 固定 1 |
| 3 | 1 | Payload Length | uint8 | 固定 48 |
| 4 | 2 | Sequence | uint16 LE | 包序号，自增 |
| 6 | 2 | 上臂 Roll | int16 LE | 角度 × 100 |
| 8 | 2 | 上臂 Pitch | int16 LE | 角度 × 100 |
| 10 | 2 | 上臂 Yaw | int16 LE | 角度 × 100 |
| 12 | 2 | 下臂 Roll | int16 LE | 角度 × 100 |
| 14 | 2 | 下臂 Pitch | int16 LE | 角度 × 100 |
| 16 | 2 | 下臂 Yaw | int16 LE | 角度 × 100 |
| 18 | 2 × 18 | 足部压力 | uint16 LE × 18 | 18 个压力传感器值 |
| 54 | 2 | Checksum | uint16 LE | byte 0~53 的累加和 |

> 角度值在 JS 端使用前需除以 100 恢复为度数。桥接器已做此转换，前端直接使用度数。

---

## 五、运行步骤

### 5.1 硬件准备

1. IMU 连接 ESP32（按引脚表）
2. 足部传感器装好电池
3. ESP32 通过 USB 连接 PC

### 5.2 启动桥接器

```bash
cd E:\Da_Chuang_Project
python -u ble_bridge_launcher.py
```

或双击 `start_ble_bridge.bat`。

### 5.3 预期输出

```
RGC BLE桥接启动器
按 Ctrl+C 停止
[HTTP] 静态页面服务: http://127.0.0.1:5502/
[WS] 页面数据服务: ws://127.0.0.1:8765
[WEB] 打开主页: http://127.0.0.1:5502/rgc-frontend/index.html
[BLE-LEFT] 扫描 RGC-BLE-LEFT ...
[BLE-RIGHT] 扫描 RGC-BLE-RIGHT ...
[BLE-LEFT] 连接 RGC-BLE-LEFT (XX:XX:XX:XX:XX:XX) ...
[BLE-RIGHT] 连接 RGC-BLE-RIGHT (XX:XX:XX:XX:XX:XX) ...
[BLE-LEFT] 已连接并订阅通知
[BLE-RIGHT] 已连接并订阅通知
[WEB] 页面已连接，当前页面数: 1
[BLE-LEFT] 收到数据包 #1, 角度: [...], 压力[18个]
[BLE-RIGHT] 收到数据包 #1, 角度: [...], 压力[18个]
```

### 5.4 访问前端

桥接器启动后自动打开浏览器，也可手动访问：

| 页面 | URL |
|------|-----|
| 主页 | `http://127.0.0.1:5502/rgc-frontend/index.html` |
| 足部热力图 | `http://127.0.0.1:5502/rgc-frontend/foot.html` |
| 大小臂曲线图 | `http://127.0.0.1:5502/rgc-frontend/arm.html` |
| 3D 仿真图 | `http://127.0.0.1:5502/rgc-frontend/threeDimention.html` |
| 个人信息 | `http://127.0.0.1:5502/rgc-frontend/personalInformation.html` |
| 跑姿分析报告 | `http://127.0.0.1:5502/rgc-frontend/report.html` |

### 5.5 停止服务

按 `Ctrl + C` 停止桥接器。

---

## 六、常见问题排查

| 现象 | 可能原因 | 排查方法 |
|------|----------|----------|
| 桥接器扫不到 BLE 设备 | ESP32 未通电 / IMU 数据未到 | 串口监视器看 ESP32 是否输出 `Web BLE server started` |
| 扫到但连不上 | 距离太远 / BLE 信号差 | ESP32 靠近 PC |
| 连上但无数据包 | 足部传感器未通电 / 超出距离 | 检查足部传感器电池，靠近 ESP32 |
| 有数据包但前端无显示 | WebSocket 未连接 | 看桥接器日志有没有 `页面已连接` |
| 前端图表不更新 | CDN 资源加载失败 | 浏览器 F12 → Console 看有无 404/网络错误 |
| `ModuleNotFoundError` | Python 环境不一致 | 用 `pip show bleak` 确认安装位置，与 `python` 路径一致 |
| 端口占用 | 上次未正常退出 / VS Code Live Server | 改 `--http-port` 和 `--ws-port` 参数 |
