#!/usr/bin/env python3
"""
3D 模型角度测试 — 独立服务器
==============================
自带 HTTP 静态文件服务 + WebSocket 数据推送。
不依赖 Mock 服务器，一键启动即可在浏览器中观察 3D 骨骼运动。

用法:
  python tests/test_3d_angles.py                    # walk:  自然走路 (默认)
  python tests/test_3d_angles.py --mode swing        # swing: 大幅跑步摆动
  python tests/test_3d_angles.py --mode wave         # wave:  关节波浪传递
  python tests/test_3d_angles.py --mode pose         # pose:  循环切换姿势

数据格式: 30 元素 = [上臂R/P/Y, 下臂R/P/Y, 大腿R/P/Y, 小腿R/P/Y, 足底压力×18]
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

try:
    import websockets
except ImportError:
    print("[ERROR] pip install websockets")
    sys.exit(1)

# ═══════════════════════════════════════════
# 常量
# ═══════════════════════════════════════════
HTTP_PORT = 5502
WS_PORT = 8765
SEND_HZ = 33
SEND_INTERVAL = 1.0 / SEND_HZ
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# WebSocket 连接池
connected = set()
latest_packets = {}

# ═══════════════════════════════════════════
# 数据生成器
# ═══════════════════════════════════════════

def generate_swing(t, freq, side):
    """模拟自然跑步姿态：同侧手脚相反（交叉步态），前后摆动为主"""
    offset = 0.0 if side == "LEFT" else math.pi
    arm_phase = t * freq * 2 * math.pi + offset
    leg_phase = arm_phase + math.pi  # 同侧腿与臂相反！
    half_arm = arm_phase + 0.3
    half_leg = leg_phase + 0.4
    angles = [
        # 上臂 [0-2]: 肩关节 — 前摆为主
        5.0  * math.sin(arm_phase * 0.5),    # Roll: ±5°
        30.0 * math.sin(arm_phase),           # Pitch: ±30° (前后主运动)
        3.0  * math.sin(arm_phase * 0.6),    # Yaw: ±3°
        # 下臂 [3-5]: 肘关节 — 屈伸
        3.0  * math.sin(arm_phase * 0.5),    # Roll: ±3°
        25.0 * math.sin(half_arm),            # Pitch: ±25° (肘屈伸)
        2.0  * math.sin(arm_phase * 0.7),    # Yaw: ±2°
        # 大腿 [6-8]: 髋关节 — 与同侧臂相反
        5.0  * math.sin(leg_phase * 0.5),    # Roll: ±5°
        25.0 * math.sin(leg_phase),           # Pitch: ±25° (髋屈伸)
        2.0  * math.sin(leg_phase * 0.7),    # Yaw: ±2°
        # 小腿 [9-11]: 膝关节 — 屈伸
        3.0  * math.sin(leg_phase * 0.5),    # Roll: ±3°
        50.0 * math.sin(half_leg),            # Pitch: ±50° (膝屈伸)
        2.0  * math.sin(leg_phase * 0.6),    # Yaw: ±2°
    ]
    stance = max(0.0, math.sin(leg_phase))
    pressures = [int(stance * 800 * (0.6 + 0.4 * math.sin(i * 0.7))) for i in range(18)]
    return {"source": side, "data": angles + [float(p) for p in pressures]}


def generate_walk(t, freq, side):
    """模拟自然走路：臂摆略大，腿步幅略小，交叉步态"""
    offset = 0.0 if side == "LEFT" else math.pi
    arm_phase = t * freq * 2 * math.pi + offset
    leg_phase = arm_phase + math.pi
    half_leg = leg_phase + 0.3
    half_arm = arm_phase + 0.2
    angles = [
        # 上臂: 加大摆幅
        0.0,
        25.0 * math.sin(arm_phase),           # Pitch: ±25° (臂摆加大)
        0.0,
        # 下臂: 肘屈伸
        0.0,
        12.0 * math.sin(half_arm),            # Pitch: ±12° (肘屈伸)
        0.0,
        # 大腿: 步幅略小
        0.0,
        20.0 * math.sin(leg_phase),           # Pitch: ±20° (步幅小一点)
        0.0,
        # 小腿: 膝屈伸
        0.0,
        35.0 * math.sin(half_leg),            # Pitch: ±35° (膝屈伸)
        0.0,
    ]
    stance = max(0.0, math.sin(leg_phase))
    pressures = [int(stance * 600 * (0.6 + 0.4 * math.sin(i * 0.7))) for i in range(18)]
    return {"source": side, "data": angles + [float(p) for p in pressures]}


def generate_wave(t, freq, side):
    """波浪传递: 肩→肘→髋→膝 依次运动"""
    base = t * freq * 2 * math.pi
    offsets = [0.0, 0.5, 1.0, 1.5]
    amps    = [30,  40,  25,  50]
    angles = []
    for off, amp in zip(offsets, amps):
        p = base + off * math.pi
        angles.extend([5.0 * math.sin(p * 0.5), amp * math.sin(p), 4.0 * math.sin(p * 0.6)])
    return {"source": side, "data": angles + [400.0] * 18}


PRESET_POSES = {
    "T-Pose":      [0,  0,  0,   0,   0,  0,   0,  0,  0,   0,   0,  0],
    "手臂平举":     [0, 90,  0,   0,   0,  0,   0,  0,  0,   0,   0,  0],
    "手臂前伸":     [0, 45,  0,   0, -30,  0,   0,  0,  0,   0,   0,  0],
    "深蹲":         [0,  0,  0,   0,   0,  0,   0, 60,  0,   0, -70,  0],
    "弓步":         [0,  0,  0,   0,   0,  0,   0, 40,  0,   0, -60,  0],
    "跑步摆臂":     [0,-30,  0,   0, -60,  0,   0, 20,  0,   0, -40,  0],
}
POSE_NAMES = list(PRESET_POSES.keys())


def generate_pose(t, freq, side):
    """每 3 秒切换一个静态姿势"""
    name = POSE_NAMES[int(t / 3.0) % len(POSE_NAMES)]
    angles = PRESET_POSES[name][:]
    return {"source": side, "data": angles + [300.0] * 18, "pose": name}


# ═══════════════════════════════════════════
# WebSocket 服务器
# ═══════════════════════════════════════════

async def ws_handler(websocket, path=None):
    connected.add(websocket)
    for src in ("LEFT", "RIGHT"):
        if src in latest_packets:
            try:
                await websocket.send(json.dumps(latest_packets[src]))
            except Exception:
                pass
    try:
        async for _ in websocket:
            pass
    finally:
        connected.discard(websocket)


async def broadcast(pkt):
    latest_packets[pkt["source"]] = pkt
    msg = json.dumps(pkt)
    stale = []
    for ws in list(connected):
        try:
            await ws.send(msg)
        except Exception:
            stale.append(ws)
    for ws in stale:
        connected.discard(ws)


async def data_loop(gen, freq):
    print(f"[DATA] 模式启动, {SEND_HZ}Hz")
    start = time.monotonic()
    count = 0
    last_log = 0
    while True:
        t0 = time.monotonic()
        elapsed = t0 - start
        pkt_l = gen(elapsed, freq, "LEFT")
        pkt_r = gen(elapsed, freq, "RIGHT")
        await broadcast(pkt_l)
        await broadcast(pkt_r)
        count += 2

        if elapsed - last_log >= 1.0:
            pose_info = f" [{pkt_l.get('pose', '')}]" if 'pose' in pkt_l else ""
            a = pkt_l["data"]
            print(f"  [{elapsed:5.1f}s] #{count:5d} | "
                  f"上臂P={a[1]:+6.1f}° 下臂P={a[4]:+6.1f}° "
                  f"大腿P={a[7]:+6.1f}° 小腿P={a[10]:+6.1f}°{pose_info}")
            last_log = elapsed

        sleep_t = SEND_INTERVAL - (time.monotonic() - t0)
        if sleep_t > 0:
            await asyncio.sleep(sleep_t)


# ═══════════════════════════════════════════
# HTTP 服务器
# ═══════════════════════════════════════════

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PROJECT_DIR, **kwargs)

    def log_message(self, format, *args):
        pass  # 静默


def start_http(host, port):
    srv = ThreadingHTTPServer((host, port), Handler)
    srv.allow_reuse_address = True
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv


# ═══════════════════════════════════════════
# 入口
# ═══════════════════════════════════════════

def generate_rest(t, freq, side):
    """静息姿态：所有角度为 0，验证模型初始姿势"""
    return {"source": side, "data": [0.0] * 30}


def generate_right_leg_up(t, freq, side):
    """抬右腿测试：只有右侧大腿 Pitch=60°, 其余全零"""
    angles = [0.0] * 12
    if side == "RIGHT":
        angles[7] = 60.0  # 右大腿 Pitch = 60° (大幅前抬)
    return {"source": side, "data": angles + [0.0] * 18}


GENERATORS = {
    "swing": generate_swing, "walk": generate_walk,
    "wave": generate_wave, "pose": generate_pose,
    "rest": generate_rest, "right_leg": generate_right_leg_up
}

async def run(args):
    gen = GENERATORS[args.mode]

    print("╔══════════════════════════════════════╗")
    print("║  3D 模型角度测试 — 独立服务器        ║")
    print("╚══════════════════════════════════════╝")
    print(f"  模式: {args.mode}  摆动频率: {args.freq} Hz")
    print(f"  角度幅度: ±30°~60° (大幅，方便 3D 观察)")

    http = start_http(args.host, args.http_port)
    print(f"\n[HTTP] http://{args.host}:{args.http_port}")

    ws_server = await websockets.serve(ws_handler, args.host, args.ws_port)
    print(f"[WS]   ws://{args.host}:{args.ws_port}")

    page_url = f"http://{args.host}:{args.http_port}/rgc-frontend/threeDimention.html"
    print(f"\n👉 打开: {page_url}")
    print(f"   按 Ctrl+C 停止\n")

    if not args.no_browser:
        webbrowser.open(page_url)

    try:
        await data_loop(gen, args.freq)
    except asyncio.CancelledError:
        pass
    finally:
        ws_server.close()
        await ws_server.wait_closed()
        http.shutdown()


def parse_args():
    p = argparse.ArgumentParser(description="3D 模型角度测试 — 独立服务器")
    p.add_argument("--mode", default="walk")
    p.add_argument("--freq", type=float, default=0.5,
                   help="摆动频率 Hz (默认 0.5，慢速方便观察，设为 1.0 接近真实跑步)")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--http-port", type=int, default=HTTP_PORT)
    p.add_argument("--ws-port", type=int, default=WS_PORT)
    p.add_argument("--no-browser", action="store_true")
    return p.parse_args()


def main():
    args = parse_args()
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        print("\n[3D] 已停止")


if __name__ == "__main__":
    main()
