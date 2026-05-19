# 运动数据分析平台

实时采集 IMU 和足部压力传感器数据，通过 BLE 传输到 PC，Web 前端可视化展示。

## 快速开始

### 1. 安装 Python 依赖

```bash
pip install -r requirements.txt
```

### 2. 硬件准备

1. ESP32 烧录 `rgc-backend/rgc-backend.ino`（两个 ESP32 分别选 LEFT / RIGHT）
2. 给 IMU 传感器 + ESP32 通电
3. 给足部压力传感器通电

### 3. 启动

双击 `start_ble_bridge.bat`，或：

```bash
python -u ble_bridge_launcher.py
```

浏览器会自动打开前端页面。首次连接约需 10 秒扫描 BLE 设备。

### 4. 访问页面

| 页面 | 功能 |
|------|------|
| `index.html` | 主监控中心，大小臂曲线 + 系统状态 |
| `foot.html` | 足部压力热力图 |
| `arm.html` | 大小臂关节曲线 |
| `threeDimention.html` | 3D 运动姿态仿真 |
| `report.html` | 跑姿分析报告 |

---

## 项目结构

```
├── ble_bridge_launcher.py    # PC 桥接器（BLE → WebSocket）
├── start_ble_bridge.bat      # Windows 一键启动
├── requirements.txt          # Python 依赖
├── rgc-backend/              # ESP32 固件
│   └── rgc-backend.ino
└── rgc-frontend/             # 前端页面
    ├── index.html
    ├── foot.html
    ├── arm.html
    ├── threeDimention.html
    ├── personalInformation.html
    ├── report.html
    ├── css/
    ├── js/
    └── img/
```

## 环境要求

| 项目 | 版本 |
|------|------|
| Python | ≥ 3.10 |
| 浏览器 | Chrome / Edge（最新版） |
| ESP32 | ESP32 Dev Module |
| PC 蓝牙 | BLE 4.0+ |

## 常见问题

**扫不到 BLE 设备？** 确认 ESP32 通电，串口监视器（115200）看见 `Web BLE server started`。

**前端无数据？** 确认足部传感器通电，桥接器日志显示 `收到数据包`。

**端口被占用？** 加参数：`python ble_bridge_launcher.py --http-port 5503 --ws-port 8766`。


