#!/usr/bin/env python3
"""
RGC Mock Bridge — 无硬件全模拟测试服务器
============================================
用途: ESP32 和传感器全都没有时，验证前端所有页面的数据渲染
无需 bleak/websockets 以外的依赖，不需要 BLE 硬件

启动: python test_bridge_mock.py
然后浏览器打开 http://127.0.0.1:5502/rgc-frontend/index.html

模拟内容:
  - LEFT + RIGHT 两路 68 字节 V2 RG 数据包
  - 12 关节角度 (手臂6 + 腿部6) — 正弦波模拟行走
  - 18 足底压力 — 步态周期半波整流
  - 33 Hz 发送频率，与真实硬件一致
  - WebSocket :8765 + HTTP :5502，端口与正式版完全相同
"""

import argparse
import asyncio
import json
import math
import os
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# ── 可选依赖检查 ──
try:
    import websockets
except ImportError:
    print("[ERROR] 缺少 websockets 库，请运行: pip install websockets")
    sys.exit(1)

try:
    import openai
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False

# ═══════════════════════════════════════════
# 常量
# ═══════════════════════════════════════════
DEFAULT_HTTP_PORT = 5502
DEFAULT_WS_PORT = 8765
TWO_PI = 2.0 * math.pi
SIM_FREQ_HZ = 1.0         # 模拟步频 Hz
SEND_INTERVAL_S = 0.030   # 30ms = ~33Hz
PAGE_PATH = "rgc-frontend/index.html"

# V2 数据格式: 12 个角度 + 18 个压力 = 30 元素
N_ANGLES = 12   # [上臂3 + 下臂3 + 大腿3 + 小腿3]
N_PRESSURES = 18

# WebSocket 连接池
connected_clients: set = set()
latest_packets: dict[str, dict] = {}  # "LEFT" | "RIGHT" → 最新 JSON


# ═══════════════════════════════════════════
# 模拟数据生成器
# ═══════════════════════════════════════════

class GaitSimulator:
    """左右脚交替步态模拟，生成关节角度和足底压力"""

    def __init__(self, side: str):
        self.side = side          # "LEFT" | "RIGHT"
        self.start_s = time.monotonic()
        # 左右脚相位差 180° (π)
        self.phase_offset = 0.0 if side == "LEFT" else math.pi

    def _elapsed_phase(self) -> float:
        t = time.monotonic() - self.start_s
        return t * SIM_FREQ_HZ * TWO_PI + self.phase_offset

    def generate_angles(self) -> list[float]:
        """返回 12 个角度值 (度)"""
        p = self._elapsed_phase()
        hp = p + 0.4  # 小腿/小臂相对大腿/上臂的相位滞后

        return [
            # 上臂 [0-2]: 肩关节
            8.0  * math.sin(p * 0.5),      # Roll
            30.0 * math.sin(p),             # Pitch (前摆/后摆)
            10.0 * math.sin(p * 0.6),      # Yaw
            # 下臂 [3-5]: 肘关节
            5.0  * math.sin(p * 0.5),      # Roll
            20.0 * math.sin(p + 0.3),      # Pitch
            6.0  * math.sin(p * 0.7),      # Yaw
            # 大腿 [6-8]: 髋关节
            6.0  * math.sin(p * 0.5),      # Roll
            25.0 * math.sin(p),             # Pitch (屈伸)
            4.0  * math.sin(p * 0.7),      # Yaw
            # 小腿 [9-11]: 膝关节
            3.0  * math.sin(p * 0.5),      # Roll
            40.0 * math.sin(hp),            # Pitch (膝关节主运动)
            2.0  * math.sin(p * 0.6),      # Yaw
        ]

    def generate_pressures(self) -> list[int]:
        """返回 18 个压力值 (0~1200 原始ADC)"""
        p = self._elapsed_phase()
        # 半波整流: 只在该脚触地时产生压力
        stance = max(0.0, math.sin(p))  # [0, 1]

        # 足的滚动效应
        fore_scale = max(0.0, math.sin(p + 0.5))
        heel_scale = max(0.0, math.sin(p - 0.5))
        mid_scale = (fore_scale + heel_scale) * 0.5

        pressures = []
        for i in range(6):
            pressures.append(int(stance * fore_scale * 1200 * (0.7 + 0.3 * math.sin(i * 0.8))))
        for i in range(6):
            pressures.append(int(stance * mid_scale * 1200 * (0.6 + 0.4 * math.sin(i * 0.7))))
        for i in range(6):
            pressures.append(int(stance * heel_scale * 1200 * (0.7 + 0.3 * math.sin(i * 0.9))))
        return pressures

    def generate_packet(self) -> dict:
        """生成与真实 BLE 桥接器完全一致的 JSON 数据包"""
        angles = self.generate_angles()
        pressures = self.generate_pressures()
        data = angles + [float(p) for p in pressures]
        return {"source": self.side, "data": data}


# ═══════════════════════════════════════════
# WebSocket 服务器
# ═══════════════════════════════════════════

async def ws_handler(websocket, path=None):
    """新浏览器页面连接"""
    connected_clients.add(websocket)
    addr = websocket.remote_address
    print(f"[WS] 客户端连接: {addr} (当前 {len(connected_clients)} 个)")

    # 立即发送最新快照，新页面不空白
    for source in ("LEFT", "RIGHT"):
        if source in latest_packets:
            try:
                await websocket.send(json.dumps(latest_packets[source]))
            except Exception:
                pass

    try:
        async for _ in websocket:
            pass  # 不处理客户端消息
    except Exception:
        pass
    finally:
        connected_clients.discard(websocket)
        print(f"[WS] 客户端断开: {addr} (剩余 {len(connected_clients)} 个)")


async def broadcast(packet: dict):
    """广播 JSON 数据给所有连接的浏览器"""
    source = packet.get("source", "?")
    latest_packets[source] = packet
    msg = json.dumps(packet)
    if not connected_clients:
        return
    # 使用 list 避免迭代时修改集合
    stale = []
    for ws in list(connected_clients):
        try:
            await ws.send(msg)
        except Exception:
            stale.append(ws)
    for ws in stale:
        connected_clients.discard(ws)


async def data_generator_loop():
    """后台协程: 以 33Hz 生成模拟数据并广播"""
    left_sim = GaitSimulator("LEFT")
    right_sim = GaitSimulator("RIGHT")
    print(f"[SIM] 步频={SIM_FREQ_HZ}Hz, 发送间隔={SEND_INTERVAL_S*1000:.0f}ms (~{1/SEND_INTERVAL_S:.0f}Hz)")

    while True:
        t0 = time.monotonic()

        # 并行广播 LEFT + RIGHT
        pkt_left = left_sim.generate_packet()
        pkt_right = right_sim.generate_packet()
        await broadcast(pkt_left)
        await broadcast(pkt_right)

        elapsed = time.monotonic() - t0
        sleep_time = max(0, SEND_INTERVAL_S - elapsed)
        if sleep_time > 0:
            await asyncio.sleep(sleep_time)


# ═══════════════════════════════════════════
# HTTP 服务器 (静态文件 + AI 聊天代理)
# ═══════════════════════════════════════════

class MockHTTPHandler(SimpleHTTPRequestHandler):
    """提供静态文件 + /api/chat (DeepSeek 代理, 可选)"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.getcwd(), **kwargs)

    def do_OPTIONS(self):
        self._cors_headers()
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/chat":
            self._handle_chat()
        else:
            self.send_response(404)
            self.end_headers()

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_chat(self):
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len) if content_len > 0 else b"{}"

        try:
            req = json.loads(body)
            messages = req.get("messages", [])
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON"}, 400)
            return

        api_key = os.environ.get("DEEPSEEK_API_KEY", "")
        if not api_key or not HAS_OPENAI:
            self._send_json({
                "reply": "[Mock模式] AI 教练未配置。设置 DEEPSEEK_API_KEY 环境变量 + 安装 openai 库即可启用。\n\n当前模拟传感器数据正常运行，所有前端页面应能收到实时数据。"
            })
            return

        try:
            client = openai.OpenAI(
                api_key=api_key,
                base_url="https://api.deepseek.com/v1"
            )
            resp = client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": "你是一位专业的跑步姿态分析教练，帮助用户分析跑步姿态数据并给出改进建议。请用中文回答。"}
                ] + messages,
                temperature=0.7,
                max_tokens=1024,
            )
            reply = resp.choices[0].message.content
            self._send_json({"reply": reply})
        except Exception as e:
            self._send_json({"reply": f"[AI Error] {e}"}, 500)

    def log_message(self, format, *args):
        # 抑制 HTTP 访问日志，保持控制台干净
        pass


def start_http_server(host: str, port: int) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), MockHTTPHandler)
    server.allow_reuse_address = True
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server


# ═══════════════════════════════════════════
# 入口
# ═══════════════════════════════════════════

async def run_mock(args):
    print("╔══════════════════════════════════════╗")
    print("║  RGC Mock Bridge — 无硬件测试模式    ║")
    print("║  模拟 LEFT + RIGHT 双路传感器数据    ║")
    print("╚══════════════════════════════════════╝\n")

    # 启动 HTTP
    http = start_http_server(args.http_host, args.http_port)
    print(f"[HTTP] 静态文件服务: http://{args.http_host}:{args.http_port}")
    print(f"[HTTP] AI 聊天端点: POST /api/chat")

    # 启动 WebSocket
    ws_server = await websockets.serve(ws_handler, args.ws_host, args.ws_port)
    print(f"[WS]  WebSocket 服务: ws://{args.ws_host}:{args.ws_port}")
    print(f"[SIM] 模拟数据已启动 (V2: {N_ANGLES}角度 + {N_PRESSURES}压力)")
    print()
    print(f"👉 浏览器打开: http://{args.http_host}:{args.http_port}/{PAGE_PATH}")
    print(f"   按 Ctrl+C 停止\n")

    # 打开浏览器
    url = f"http://{args.http_host}:{args.http_port}/{PAGE_PATH}"
    webbrowser.open(url)

    # 运行数据生成器
    try:
        await data_generator_loop()
    except asyncio.CancelledError:
        pass
    finally:
        ws_server.close()
        await ws_server.wait_closed()
        http.shutdown()


def parse_args():
    p = argparse.ArgumentParser(description="RGC Mock Bridge - 无硬件测试服务器")
    p.add_argument("--http-host", default="127.0.0.1")
    p.add_argument("--http-port", type=int, default=DEFAULT_HTTP_PORT)
    p.add_argument("--ws-host", default="127.0.0.1")
    p.add_argument("--ws-port", type=int, default=DEFAULT_WS_PORT)
    p.add_argument("--freq", type=float, default=SIM_FREQ_HZ,
                   help=f"模拟步频 Hz (默认 {SIM_FREQ_HZ})")
    p.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    return p.parse_args()


def main():
    args = parse_args()
    global SIM_FREQ_HZ
    SIM_FREQ_HZ = args.freq

    if args.no_browser:
        global webbrowser
        webbrowser_open = webbrowser.open
        webbrowser.open = lambda url: None

    try:
        asyncio.run(run_mock(args))
    except KeyboardInterrupt:
        print("\n[MOCK] 用户中断，已停止。")


if __name__ == "__main__":
    main()
