"""同时测试 9600 和 115200 — 手动 DTR 复位"""
import serial
import serial.tools.list_ports
import sys
import time


def find_esp32():
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        print("未找到串口"), sys.exit(1)
    print("可用串口:")
    for p in ports:
        print(f"  {p.device} - {p.description}")
    for p in ports:
        if any(k in p.description for k in ["CP210", "CH340", "Silicon", "ESP32", "USB"]):
            return p.device
    return ports[0].device


def test_baud(port, baud):
    print(f"\n{'='*40}")
    print(f"{port} @ {baud}")
    print(f"{'='*40}")

    ser = serial.Serial(port, baud, timeout=0.2,
                        dsrdtr=False, rtscts=False)
    # 不复位, 直接读当前运行状态
    time.sleep(1)

    deadline = time.time() + 8
    all_data = b""
    while time.time() < deadline:
        n = ser.in_waiting
        if n:
            chunk = ser.read(n)
            all_data += chunk
            print(chunk.decode("utf-8", errors="replace"), end="", flush=True)
        time.sleep(0.05)

    if not all_data:
        print("(无数据)")
    ser.close()


def main():
    port = find_esp32()
    test_baud(port, 9600)
    test_baud(port, 115200)


if __name__ == "__main__":
    main()
