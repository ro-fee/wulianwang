#!/usr/bin/env python3
"""
3D 关节控制台 — 网页可视化控制每个关节
==========================================
在浏览器中打开控制面板，用滑块独立控制每个关节的角度。
数据通过 WebSocket 推送到 3D 页面。

用法:
  python tests/test_3d_control.py
  然后浏览器打开:
    - 控制面板: http://127.0.0.1:5502/control.html
    - 3D 模型:  http://127.0.0.1:5502/rgc-frontend/threeDimention.html
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
# 配置
# ═══════════════════════════════════════════
HTTP_PORT = 5502
WS_PORT = 8765
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEND_HZ = 50
SEND_INTERVAL = 1.0 / SEND_HZ

# 当前关节状态 (度): 12 个角度 + 18 个压力
# [左臂上Roll/Pitch/Yaw, 左臂下R/P/Y, 右臂上R/P/Y, 右臂下R/P/Y,
#  左腿上R/P/Y, 左腿下R/P/Y, 右腿上R/P/Y, 右腿下R/P/Y]
# 共 24 个角度, 这里简化为 12 个关节角度
state = {
    "left_upper": {"roll": 0, "pitch": 0, "yaw": 0},
    "left_lower": {"roll": 0, "pitch": 0, "yaw": 0},
    "right_upper": {"roll": 0, "pitch": 0, "yaw": 0},
    "right_lower": {"roll": 0, "pitch": 0, "yaw": 0},
    "left_upperLeg": {"roll": 0, "pitch": 0, "yaw": 0},
    "left_lowerLeg": {"roll": 0, "pitch": 0, "yaw": 0},
    "right_upperLeg": {"roll": 0, "pitch": 0, "yaw": 0},
    "right_lowerLeg": {"roll": 0, "pitch": 0, "yaw": 0},
}
state_lock = threading.Lock()
ws_clients = set()

# 预设步态
PRESETS = {
    "rest": "全部归零",
    "right_leg_up": "右腿前抬 60°",
    "left_leg_up": "左腿前抬 60°",
    "right_arm_up": "右臂前抬 60°",
    "left_arm_up": "左臂前抬 60°",
    "t_pose": "T-Pose (手臂水平)",
    "a_pose": "A-Pose (手臂下垂)",
}

CONTROL_HTML = r"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>3D 关节控制台</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0e17;color:#c8d6e5;font:14px 'PingFang SC',sans-serif;padding:16px}
h2{color:#00e5ff;margin-bottom:12px;font-size:18px;letter-spacing:.05em}
.row{display:flex;gap:12px;flex-wrap:wrap}
.card{flex:1;min-width:280px;background:rgba(8,12,20,.9);border:1px solid rgba(0,229,255,.15);border-radius:12px;padding:14px;margin-bottom:12px}
.card h3{font-size:14px;margin-bottom:10px;letter-spacing:.04em}
.card.l{color:#4fc3f7}.card.r{color:#ef5350}
.slider-group{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.slider-group label{width:36px;font-size:12px;text-align:right;color:#8b95a8}
.slider-group input[type=range]{flex:1;accent-color:#00e5ff}
.slider-group .val{width:44px;text-align:center;font-size:12px;font-family:monospace;background:rgba(255,255,255,.05);border-radius:4px;padding:2px 0}
.presets{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.presets button{background:rgba(0,229,255,.08);border:1px solid rgba(0,229,255,.2);color:#8b95a8;padding:5px 14px;border-radius:14px;cursor:pointer;font-size:12px;transition:all .15s}
.presets button:hover{background:rgba(0,229,255,.18);color:#c8d6e5}
.presets button.active{background:rgba(0,229,255,.25);border-color:#00e5ff;color:#fff}
#status{font-size:12px;color:#586274;margin-top:10px}
#ws-indicator{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:#586274}
#ws-indicator.on{background:#0f0;box-shadow:0 0 6px #0f0}
</style>
</head>
<body>
<h2>3D 关节控制台</h2>
<div class="presets" id="presets"></div>

<div class="row">
  <!-- 左臂 -->
  <div class="card l"><h3>左臂 - 上臂</h3>
    <div class="slider-group"><label>前后</label><input type="range" min="-90" max="90" value="0" data-joint="left_upper" data-axis="pitch"><span class="val">0°</span></div>
    <div class="slider-group"><label>左右</label><input type="range" min="-40" max="40" value="0" data-joint="left_upper" data-axis="roll"><span class="val">0°</span></div>
    <div class="slider-group"><label>扭转</label><input type="range" min="-30" max="30" value="0" data-joint="left_upper" data-axis="yaw"><span class="val">0°</span></div>
    <h3 style="margin-top:8px">左臂 - 下臂</h3>
    <div class="slider-group"><label>肘屈</label><input type="range" min="-80" max="0" value="0" data-joint="left_lower" data-axis="pitch"><span class="val">0°</span></div>
  </div>
  <!-- 右臂 -->
  <div class="card r"><h3>右臂 - 上臂</h3>
    <div class="slider-group"><label>前后</label><input type="range" min="-90" max="90" value="0" data-joint="right_upper" data-axis="pitch"><span class="val">0°</span></div>
    <div class="slider-group"><label>左右</label><input type="range" min="-40" max="40" value="0" data-joint="right_upper" data-axis="roll"><span class="val">0°</span></div>
    <div class="slider-group"><label>扭转</label><input type="range" min="-30" max="30" value="0" data-joint="right_upper" data-axis="yaw"><span class="val">0°</span></div>
    <h3 style="margin-top:8px">右臂 - 下臂</h3>
    <div class="slider-group"><label>肘屈</label><input type="range" min="-80" max="0" value="0" data-joint="right_lower" data-axis="pitch"><span class="val">0°</span></div>
  </div>
</div>

<div class="row">
  <!-- 左腿 -->
  <div class="card l"><h3>左腿 - 大腿</h3>
    <div class="slider-group"><label>前后</label><input type="range" min="-90" max="90" value="0" data-joint="left_upperLeg" data-axis="pitch"><span class="val">0°</span></div>
    <div class="slider-group"><label>左右</label><input type="range" min="-30" max="30" value="0" data-joint="left_upperLeg" data-axis="roll"><span class="val">0°</span></div>
    <div class="slider-group"><label>扭转</label><input type="range" min="-20" max="20" value="0" data-joint="left_upperLeg" data-axis="yaw"><span class="val">0°</span></div>
    <h3 style="margin-top:8px">左腿 - 小腿</h3>
    <div class="slider-group"><label>膝屈</label><input type="range" min="0" max="90" value="0" data-joint="left_lowerLeg" data-axis="pitch"><span class="val">0°</span></div>
  </div>
  <!-- 右腿 -->
  <div class="card r"><h3>右腿 - 大腿</h3>
    <div class="slider-group"><label>前后</label><input type="range" min="-90" max="90" value="0" data-joint="right_upperLeg" data-axis="pitch"><span class="val">0°</span></div>
    <div class="slider-group"><label>左右</label><input type="range" min="-30" max="30" value="0" data-joint="right_upperLeg" data-axis="roll"><span class="val">0°</span></div>
    <div class="slider-group"><label>扭转</label><input type="range" min="-20" max="20" value="0" data-joint="right_upperLeg" data-axis="yaw"><span class="val">0°</span></div>
    <h3 style="margin-top:8px">右腿 - 小腿</h3>
    <div class="slider-group"><label>膝屈</label><input type="range" min="0" max="90" value="0" data-joint="right_lowerLeg" data-axis="pitch"><span class="val">0°</span></div>
  </div>
</div>

<div id="status"><span id="ws-indicator"></span>WebSocket 未连接</div>

<script>
const WS_URL = `ws://${location.hostname || '127.0.0.1'}:WS_PORT`;
let ws = null;

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    document.getElementById('ws-indicator').className = 'on';
    document.getElementById('status').innerHTML = '<span id="ws-indicator" class="on"></span>已连接';
  };
  ws.onclose = () => {
    document.getElementById('ws-indicator').className = '';
    document.getElementById('status').innerHTML = '<span id="ws-indicator"></span>断开, 2s重连...';
    setTimeout(connect, 2000);
  };
}

document.querySelectorAll('input[type=range]').forEach(slider => {
  const joint = slider.dataset.joint;
  const axis = slider.dataset.axis;
  const valSpan = slider.nextElementSibling;
  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    valSpan.textContent = val + '°';
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({joint, axis, val}));
    }
  });
});

// 预设按钮
const presets = PRESETS_JSON;
const presetDiv = document.getElementById('presets');
Object.entries(presets).forEach(([name, label]) => {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({preset: name}));
      presetDiv.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (name === 'rest') updateAllSliders({});
    }
  });
  presetDiv.appendChild(btn);
});

function updateAllSliders(values) {
  document.querySelectorAll('input[type=range]').forEach(slider => {
    const key = slider.dataset.joint + '.' + slider.dataset.axis;
    if (values[key] !== undefined) {
      slider.value = values[key];
      slider.nextElementSibling.textContent = values[key] + '°';
    } else {
      slider.value = 0;
      slider.nextElementSibling.textContent = '0°';
    }
  });
}

connect();
</script>
</body>
</html>
""".replace("WS_PORT", str(WS_PORT)).replace(
    "PRESETS_JSON",
    json.dumps(PRESETS, ensure_ascii=False)
)

# 预设角度
PRESET_ANGLES = {
    "rest": {},
    "right_leg_up": {"right_upperLeg.pitch": 60},
    "left_leg_up": {"left_upperLeg.pitch": 60},
    "right_arm_up": {"right_upper.pitch": 90},
    "left_arm_up": {"left_upper.pitch": 90},
    "t_pose": {
        "left_upper.pitch": 0, "right_upper.pitch": 0,
        "left_lower.pitch": 0, "right_lower.pitch": 0,
    },
    "a_pose": {},
}

ORDER = [
    "left_upper", "left_lower", "right_upper", "right_lower",
    "left_upperLeg", "left_lowerLeg", "right_upperLeg", "right_lowerLeg"
]
AXES = ["roll", "pitch", "yaw"]


current_pose = "apose"  # apose | tpose

def state_to_data(source):
    """将当前 state 转换为 30 元素数据数组 (LEFT 或 RIGHT)"""
    prefix = "left_" if source == "LEFT" else "right_"
    angles = []
    with state_lock:
        for part in ["upper", "lower", "upperLeg", "lowerLeg"]:
            key = prefix + part
            s = state.get(key, {"roll": 0, "pitch": 0, "yaw": 0})
            angles.extend([s["roll"], s["pitch"], s["yaw"]])
    pressures = [0.0] * 18
    return {"source": source, "data": angles + pressures, "pose": current_pose}


def apply_preset(name):
    """应用预设"""
    global current_pose
    with state_lock:
        for k in state:
            state[k] = {"roll": 0, "pitch": 0, "yaw": 0}
        angles = PRESET_ANGLES.get(name, {})
        for key, val in angles.items():
            joint, axis = key.split(".")
            if joint in state:
                state[joint][axis] = val
    if name == "t_pose":
        current_pose = "tpose"
    else:
        current_pose = "apose"


class ControlHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PROJECT_DIR, **kwargs)

    def do_GET(self):
        if self.path == "/control.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(CONTROL_HTML.encode("utf-8"))
        else:
            super().do_GET()

    def log_message(self, format, *args):
        pass


# ═══════════════════════════════════════════
# WebSocket
# ═══════════════════════════════════════════

async def ws_handler(websocket, path=None):
    """双向: 3D页面连接接收数据, 控制台连接发送命令"""
    ws_clients.add(websocket)
    try:
        async for msg in websocket:
            try:
                data = json.loads(msg)
            except json.JSONDecodeError:
                continue
            # 控制台命令: {joint, axis, val} 或 {preset: name}
            if "preset" in data:
                apply_preset(data["preset"])
            elif "joint" in data and "axis" in data and "val" in data:
                with state_lock:
                    if data["joint"] in state:
                        state[data["joint"]][data["axis"]] = float(data["val"])
    except Exception:
        pass
    finally:
        ws_clients.discard(websocket)


async def broadcast_loop():
    """持续广播 LEFT + RIGHT 数据"""
    while True:
        left_pkt = state_to_data("LEFT")
        right_pkt = state_to_data("RIGHT")
        msg_l = json.dumps(left_pkt)
        msg_r = json.dumps(right_pkt)
        stale = []
        for ws in list(ws_clients):
            try:
                await ws.send(msg_l)
                await ws.send(msg_r)
            except Exception:
                stale.append(ws)
        for ws in stale:
            ws_clients.discard(ws)
        await asyncio.sleep(SEND_INTERVAL)


async def run(args):
    http = ThreadingHTTPServer((args.host, args.http_port), ControlHandler)
    http.allow_reuse_address = True
    t = threading.Thread(target=http.serve_forever, daemon=True)
    t.start()

    ws_server = await websockets.serve(ws_handler, args.host, args.ws_port)

    ctrl_url = f"http://{args.host}:{args.http_port}/control.html"
    model_url = f"http://{args.host}:{args.http_port}/rgc-frontend/threeDimention.html"

    print("╔══════════════════════════════════════╗")
    print("║  3D 关节控制台                       ║")
    print("╚══════════════════════════════════════╝")
    print(f"\n  控制面板: {ctrl_url}")
    print(f"  3D 模型:  {model_url}")
    print(f"  按 Ctrl+C 停止\n")

    if not args.no_browser:
        webbrowser.open(ctrl_url)
        webbrowser.open(model_url)

    try:
        await broadcast_loop()
    except asyncio.CancelledError:
        pass
    finally:
        ws_server.close()
        await ws_server.wait_closed()
        http.shutdown()


def parse_args():
    p = argparse.ArgumentParser(description="3D 关节控制台")
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
        print("\n已停止")


if __name__ == "__main__":
    main()
