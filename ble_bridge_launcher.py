import argparse
import asyncio
import json
import os
import sys
import threading
import time
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import websockets
from bleak import BleakClient, BleakScanner

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"


PROJECT_ROOT = Path(__file__).resolve().parent
WEB_PAGE = "rgc-frontend/index.html"
HTTP_HOST = "127.0.0.1"
HTTP_PORT = 5502
WS_HOST = "127.0.0.1"
WS_PORT = 8765

BLE_SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab"
BLE_DATA_CHAR_UUID = "abcd1234-1234-1234-1234-abcdef123456"
BLE_DEVICE_NAMES = {
    "LEFT": "RGC-BLE-LEFT",
    "RIGHT": "RGC-BLE-RIGHT",
}
BLE_SCAN_TIMEOUT_SECONDS = 8
BLE_RECONNECT_DELAY_SECONDS = 3

web_clients = set()
latest_packets = {}


class ChatHTTPRequestHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/chat":
            self._handle_chat()
        else:
            self.send_response(404)
            self.end_headers()

    def _handle_chat(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b""
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
            return

        messages = data.get("messages", [])
        if not messages:
            self._send_json(400, {"error": "messages required"})
            return

        if not DEEPSEEK_API_KEY:
            self._send_json(200, {
                "reply": "AI 聊天未配置。\n\n请设置环境变量 DEEPSEEK_API_KEY，\n"
                         "前往 https://platform.deepseek.com/api_keys 申请。\n\n"
                         "Windows: set DEEPSEEK_API_KEY=sk-xxx\n"
                         "然后重启桥接器。"
            })
            return

        # Prepend system prompt
        system_prompt = (
            "你是一个专业的跑步运动分析教练，擅长分析运动生物力学数据。"
            "用户会提供跑步时的关节角度、足部压力分布、步频、对称性等数据。"
            "请基于数据给出具体、可操作的改进建议。用中文回复，"
            "保持建议简洁但专业，必要时分点列出。"
        )
        full_messages = [{"role": "system", "content": system_prompt}] + messages

        try:
            import openai
            client = openai.OpenAI(
                api_key=DEEPSEEK_API_KEY,
                base_url=DEEPSEEK_BASE_URL,
            )
            resp = client.chat.completions.create(
                model=DEEPSEEK_MODEL,
                messages=full_messages,
                temperature=0.7,
                max_tokens=1024,
            )
            reply = resp.choices[0].message.content
            self._send_json(200, {"reply": reply})
        except Exception as e:
            self._send_json(500, {"error": f"AI 请求失败: {str(e)}"})

    def _send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def start_http_server(host, port):
    handler = partial(ChatHTTPRequestHandler, directory=str(PROJECT_ROOT))
    server = ReusableThreadingHTTPServer((host, port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


async def websocket_handler(websocket, path=None):
    web_clients.add(websocket)
    print(f"[WEB] 页面已连接，当前页面数: {len(web_clients)}")
    try:
        for packet in latest_packets.values():
            await websocket.send(packet)

        async for message in websocket:
            try:
                msg = json.loads(message)
                cmd = msg.get("cmd", "")
                if cmd == "calibrate":
                    for fwd in ble_forwarders.values():
                        await fwd.send_command("CALIBRATE")
                    await websocket.send(json.dumps({"cmd": "calibrate", "status": "sent"}))
            except json.JSONDecodeError:
                pass
            except websockets.exceptions.ConnectionClosed:
                break
    finally:
        web_clients.discard(websocket)
        print(f"[WEB] 页面已断开，当前页面数: {len(web_clients)}")


async def broadcast_packet(packet):
    source = packet.get("source")
    if source:
        latest_packets[source] = json.dumps(packet, ensure_ascii=False, separators=(",", ":"))

    if not web_clients:
        return

    message = json.dumps(packet, ensure_ascii=False, separators=(",", ":"))
    stale_clients = []
    for client in list(web_clients):
        try:
            await client.send(message)
        except websockets.exceptions.ConnectionClosed:
            stale_clients.append(client)

    for client in stale_clients:
        web_clients.discard(client)


def parse_rg_packet(data):
    """解析ESP32发来的RG二进制数据包(V1:56字节, V2:68字节)，返回dict或None"""
    # 最小长度: V1=56字节
    if len(data) < 56:
        return None
    if data[0] != 0x52 or data[1] != 0x47:  # 'R', 'G'
        return None

    version = data[2]
    payload_len = data[3]

    # V1: 6 角度 + 18 压力 = 48 字节载荷, 56 字节总长
    # V2: 12 角度 + 18 压力 = 60 字节载荷, 68 字节总长
    if version == 1 and payload_len == 48 and len(data) >= 56:
        angle_count = 6
        pressure_offset = 18  # 6*2 + 4(header) + 2(seq) = 18
        checksum_idx = 54
    elif version == 2 and payload_len == 60 and len(data) >= 68:
        angle_count = 12
        pressure_offset = 30  # 12*2 + 4(header) + 2(seq) = 30
        checksum_idx = 66
    else:
        return None

    # 16-bit checksum
    expected_checksum = data[checksum_idx] | (data[checksum_idx + 1] << 8)
    actual_checksum = sum(data[:checksum_idx]) & 0xFFFF
    if actual_checksum != expected_checksum:
        return None

    angles = []
    for i in range(angle_count):
        offset = 6 + i * 2
        raw = data[offset] | (data[offset + 1] << 8)
        if raw & 0x8000:
            raw -= 0x10000
        angles.append(round(raw / 100.0, 2))

    # V1 兼容: 腿部角度填 0
    if version == 1:
        angles += [0.0] * 6

    pressures = []
    for i in range(18):
        offset = pressure_offset + i * 2
        raw = data[offset] | (data[offset + 1] << 8)
        pressures.append(raw)

    return {"data": angles + pressures}


ble_forwarders = {}  # source → BleForwarder

class BleForwarder:
    def __init__(self, source, device_name):
        self.source = source
        self.device_name = device_name
        self.buffer = bytearray()
        self.loop = None
        self.disconnected = None
        self.packet_count = 0
        self._client = None

    async def send_command(self, cmd: str):
        if self._client and self._client.is_connected:
            try:
                await self._client.write_gatt_char(BLE_DATA_CHAR_UUID, cmd.encode())
                print(f"[CMD] 已发送 '{cmd}' → {self.device_name}")
                return True
            except Exception as e:
                print(f"[CMD] 发送失败: {e}")
        return False

    async def run_forever(self):
        self.loop = asyncio.get_running_loop()
        while True:
            device = await self.find_device()
            if device is None:
                print(f"[BLE-{self.source}] 未发现 {self.device_name}，{BLE_RECONNECT_DELAY_SECONDS}s 后重试")
                await asyncio.sleep(BLE_RECONNECT_DELAY_SECONDS)
                continue

            await self.connect_and_forward(device)
            await asyncio.sleep(BLE_RECONNECT_DELAY_SECONDS)

    async def find_device(self):
        print(f"[BLE-{self.source}] 扫描 {self.device_name} ...")

        def matches(device, advertisement_data):
            names = [device.name, advertisement_data.local_name]
            return self.device_name in names

        try:
            return await BleakScanner.find_device_by_filter(matches, timeout=BLE_SCAN_TIMEOUT_SECONDS)
        except Exception as exc:
            print(f"[BLE-{self.source}] 扫描失败: {exc}")
            return None

    async def connect_and_forward(self, device):
        self.buffer = bytearray()
        self.disconnected = asyncio.Event()

        def on_disconnect(_client):
            print(f"[BLE-{self.source}] 已断开")
            if self.loop and self.disconnected:
                self.loop.call_soon_threadsafe(self.disconnected.set)

        print(f"[BLE-{self.source}] 连接 {self.device_name} ({device.address}) ...")
        try:
            async with BleakClient(device, disconnected_callback=on_disconnect) as client:
                self._client = client
                await client.start_notify(BLE_DATA_CHAR_UUID, self.on_notification)
                print(f"[BLE-{self.source}] 已连接并订阅通知")
                await self.disconnected.wait()
        except Exception as exc:
            print(f"[BLE-{self.source}] 连接/订阅失败: {exc}")

    def on_notification(self, _sender, data):
        self.buffer.extend(data)

        # 查找RG头 (0x52, 0x47)，根据版本自动识别 V1(56字节)/V2(68字节)
        while len(self.buffer) >= 4:  # 至少需要 4 字节才能读版本号和载荷长度
            # 找到第一个RG头
            pos = 0
            while pos <= len(self.buffer) - 2:
                if self.buffer[pos] == 0x52 and self.buffer[pos + 1] == 0x47:
                    break
                pos += 1

            if pos > len(self.buffer) - 4:
                # RG头找到但不够读版本号和载荷长度，丢弃前面无效字节后等待更多数据
                if pos > 0:
                    del self.buffer[:pos]
                break

            # 读取版本号和载荷长度，确定包大小
            version = self.buffer[pos + 2]
            payload_len = self.buffer[pos + 3]

            # 已知版本对应包长: V1=56, V2=68
            version_packet_sizes = {1: 56, 2: 68}
            if version in version_packet_sizes:
                expected_len = version_packet_sizes[version]
            else:
                # 未知版本，跳过RG头继续扫描
                del self.buffer[:pos + 2]
                continue

            if len(self.buffer) < pos + expected_len:
                # 数据不够一个完整包，等待更多数据
                if pos > 0:
                    del self.buffer[:pos]
                break

            chunk = self.buffer[pos:pos + expected_len]
            parsed = parse_rg_packet(chunk)
            if parsed is not None:
                parsed["source"] = self.source
                self.packet_count += 1
                if self.packet_count % 20 == 1:
                    data_arr = parsed['data']
                    arm_angles = [f"{data_arr[i]:.1f}" for i in range(6)]
                    leg_angles = [f"{data_arr[i]:.1f}" for i in range(6, 12)]
                    print(f"[BLE-{self.source}] #{self.packet_count} (V{version}) "
                          f"手臂: [{', '.join(arm_angles)}] "
                          f"腿部: [{', '.join(leg_angles)}] "
                          f"压力[{len(data_arr) - 12}个]")
                if self.loop:
                    self.loop.call_soon_threadsafe(
                        lambda p=parsed: asyncio.create_task(broadcast_packet(p))
                    )
                del self.buffer[:pos + expected_len]
            else:
                # 校验失败，跳过RG头继续扫描
                del self.buffer[:pos + 2]


async def run_bridge(args):
    page_url = f"http://{args.http_host}:{args.http_port}/{args.page}"

    try:
        http_server = start_http_server(args.http_host, args.http_port)
    except OSError as exc:
        print(f"[HTTP] 启动失败: {exc}")
        print(f"[HTTP] 请确认端口 {args.http_port} 没有被 VS Code Live Server 或其他程序占用")
        raise

    print(f"[HTTP] 静态页面服务: http://{args.http_host}:{args.http_port}/")
    print(f"[WS] 页面数据服务: ws://{args.ws_host}:{args.ws_port}")
    print(f"[WEB] 打开主页: {page_url}")
    webbrowser.open(page_url)

    left_forwarder = BleForwarder("LEFT", args.left_name)
    right_forwarder = BleForwarder("RIGHT", args.right_name)
    ble_forwarders["LEFT"] = left_forwarder
    ble_forwarders["RIGHT"] = right_forwarder

    async with websockets.serve(websocket_handler, args.ws_host, args.ws_port):
        await asyncio.gather(
            left_forwarder.run_forever(),
            right_forwarder.run_forever(),
        )

    http_server.shutdown()


def parse_args():
    parser = argparse.ArgumentParser(description="RGC BLE到网页的本地桥接启动器")
    parser.add_argument("--page", default=WEB_PAGE, help="启动后打开的页面路径")
    parser.add_argument("--http-host", default=HTTP_HOST)
    parser.add_argument("--http-port", type=int, default=HTTP_PORT)
    parser.add_argument("--ws-host", default=WS_HOST)
    parser.add_argument("--ws-port", type=int, default=WS_PORT)
    parser.add_argument("--left-name", default=BLE_DEVICE_NAMES["LEFT"])
    parser.add_argument("--right-name", default=BLE_DEVICE_NAMES["RIGHT"])
    return parser.parse_args()


def main():
    args = parse_args()
    print("RGC BLE桥接启动器")
    print("按 Ctrl+C 停止")
    try:
        asyncio.run(run_bridge(args))
    except KeyboardInterrupt:
        print("\n已停止桥接服务")
    except Exception as exc:
        print(f"启动器异常退出: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
