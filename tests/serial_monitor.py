"""读取 ESP32 串口输出 — 比 Arduino IDE 监视器更可靠"""
import serial
import sys

PORT = sys.argv[1] if len(sys.argv) > 1 else "COM7"
BAUD = 115200

try:
    ser = serial.Serial(PORT, BAUD, timeout=1)
    print(f"已连接 {PORT} @ {BAUD}，等待数据... (Ctrl+C 停止)\n")
    while True:
        line = ser.readline().decode("utf-8", errors="replace").strip()
        if line:
            print(line)
except KeyboardInterrupt:
    print("\n已停止")
except serial.SerialException as e:
    print(f"无法打开 {PORT}: {e}")
    print("请检查端口号是否正确，或 ESP32 是否已插入")
finally:
    try:
        ser.close()
    except:
        pass
