import argparse
import asyncio
import json
import sys
import threading
import time
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import websockets
from bleak import BleakClient, BleakScanner


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


class QuietHTTPRequestHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def start_http_server(host, port):
    handler = partial(QuietHTTPRequestHandler, directory=str(PROJECT_ROOT))
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
        await websocket.wait_closed()
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
    """解析ESP32发来的56字节RG二进制数据包，返回dict或None"""
    if len(data) < 56:
        return None
    if data[0] != 0x52 or data[1] != 0x47:  # 'R', 'G'
        return None

    version = data[2]
    payload_len = data[3]
    if version != 1 or payload_len != 48:
        return None

    # 16-bit checksum (sum of bytes 0..53)
    expected_checksum = data[54] | (data[55] << 8)
    actual_checksum = sum(data[:54]) & 0xFFFF
    if actual_checksum != expected_checksum:
        return None

    angles = []
    for i in range(6):
        offset = 6 + i * 2
        raw = data[offset] | (data[offset + 1] << 8)
        if raw & 0x8000:
            raw -= 0x10000
        angles.append(round(raw / 100.0, 2))

    pressures = []
    for i in range(18):
        offset = 18 + i * 2
        raw = data[offset] | (data[offset + 1] << 8)
        pressures.append(raw)

    return {"data": angles + pressures}


class BleForwarder:
    def __init__(self, source, device_name):
        self.source = source
        self.device_name = device_name
        self.buffer = bytearray()
        self.loop = None
        self.disconnected = None
        self.packet_count = 0

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
                await client.start_notify(BLE_DATA_CHAR_UUID, self.on_notification)
                print(f"[BLE-{self.source}] 已连接并订阅通知")
                await self.disconnected.wait()
        except Exception as exc:
            print(f"[BLE-{self.source}] 连接/订阅失败: {exc}")

    def on_notification(self, _sender, data):
        self.buffer.extend(data)

        # 查找RG头 (0x52, 0x47) 并尝试解析56字节完整包
        while len(self.buffer) >= 56:
            # 找到第一个RG头
            pos = 0
            while pos <= len(self.buffer) - 2:
                if self.buffer[pos] == 0x52 and self.buffer[pos + 1] == 0x47:
                    break
                pos += 1
            if pos > len(self.buffer) - 56:
                # RG头太靠后或没找到，丢弃前面无效字节
                if pos > 0:
                    del self.buffer[:pos]
                break

            # 取出56字节尝试解析
            chunk = self.buffer[pos:pos + 56]
            parsed = parse_rg_packet(chunk)
            if parsed is not None:
                parsed["source"] = self.source
                self.packet_count += 1
                if self.packet_count % 20 == 1:
                    print(f"[BLE-{self.source}] 收到数据包 #{self.packet_count}, "
                          f"角度: {[parsed['data'][i] for i in range(6)]}, "
                          f"压力[{len(parsed['data']) - 6}个]")
                if self.loop:
                    self.loop.call_soon_threadsafe(
                        lambda p=parsed: asyncio.create_task(broadcast_packet(p))
                    )
                del self.buffer[:pos + 56]
            else:
                # 校验失败，跳过这个RG头
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
