"""读取腰间 Hub 的 WiFi MAC 地址 — 自动写入 REAL + TEST 固件。串口读不到时 fallback 到 esptool。"""
import subprocess
import sys
import time
import re
import serial
import serial.tools.list_ports
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

REAL_FIRMWARE = [
    PROJECT_ROOT / "rgc-backend" / "rgc-backend.ino",
    PROJECT_ROOT / "rgc-backend" / "satellite-leg" / "satellite-leg.ino",
]
TEST_FIRMWARE = [
    PROJECT_ROOT / "tests" / "firmware" / "test-elbow" / "test-elbow.ino",
    PROJECT_ROOT / "tests" / "firmware" / "test-leg" / "test-leg.ino",
]

# 任何需要被替换为真实 MAC 的值
PLACEHOLDERS = [
    "{0xA0, 0xDD, 0xCC, 0xDD, 0xEE, 0xFF}",
    "{0x28, 0x84, 0x85, 0x6D, 0x68, 0x0C}",
    "{0x00, 0x00, 0x00, 0x00, 0x00, 0x00}",
]

INVALID_MAC = "00:00:00:00:00:00"


def find_esp32_port():
    ports = serial.tools.list_ports.comports()
    for p in ports:
        if "USB" in p.description or "COM" in p.device:
            return p.device
    return None


def read_mac_from_serial(port: str, timeout: float = 15) -> str | None:
    print(f"方法1: 串口读取 ({port}) ...")
    ser = serial.Serial(port, 115200, timeout=2)
    ser.dtr = False
    time.sleep(0.1)
    ser.dtr = True

    start = time.time()
    mac = None
    while time.time() - start < timeout:
        try:
            line = ser.readline().decode("utf-8", errors="replace").strip()
        except Exception:
            continue
        if not line:
            continue
        print(f"  {line}")
        m = re.search(r"([0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2})", line)
        if m:
            mac = m.group(1).upper()
            break

    ser.close()
    return mac


def read_mac_via_esptool(port: str) -> str | None:
    print(f"方法2: esptool read-mac ({port}) ...")
    try:
        result = subprocess.run(
            ["python", "-m", "esptool", "--port", port, "read-mac"],
            capture_output=True, text=True, timeout=20,
        )
        for line in result.stdout.splitlines():
            print(f"  {line}")
        # esptool 输出格式: MAC: XX:XX:XX:XX:XX:XX
        m = re.search(r"MAC:\s+([0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2})", result.stdout)
        if m:
            return m.group(1).upper()
    except Exception as e:
        print(f"  esptool 调用失败: {e}")
    return None


def format_mac_c(mac_str: str) -> str:
    parts = mac_str.split(":")
    return "{" + ", ".join(f"0x{p}" for p in parts) + "}"


def patch_firmware(filepath: Path, old: str, new: str) -> bool:
    if not filepath.exists():
        print(f"  [跳过] {filepath} (不存在)")
        return False
    content = filepath.read_text(encoding="utf-8")
    if old not in content:
        print(f"  [跳过] {filepath.name} (无匹配)")
        return False
    content = content.replace(old, new)
    filepath.write_text(content, encoding="utf-8")
    print(f"  [OK] {filepath.name}")
    return True


def main():
    print("╔══════════════════════════════════════╗")
    print("║  读取 Hub MAC + 自动更新所有固件      ║")
    print("╚══════════════════════════════════════╝\n")
    print("请确认：1) Hub 已烧录 hub-waist.ino")
    print("        2) Hub 通过 USB 连接到电脑\n")

    port = sys.argv[1] if len(sys.argv) > 1 else "COM7"
    if not port:
        print("未找到串口设备！手动指定: python tests/read_hub_mac.py COM7")
        sys.exit(1)

    # 方法1: 串口读取
    mac = read_mac_from_serial(port)

    # 如果返回空或全零，fallback 到 esptool
    if not mac or mac == INVALID_MAC:
        if mac == INVALID_MAC:
            print(f"\n  串口返回全零 MAC，尝试 esptool ...")
        mac = read_mac_via_esptool(port)

    if not mac:
        print("\n所有方法均失败，无法获取 MAC。")
        sys.exit(1)

    mac_c = format_mac_c(mac)
    print(f"\nHub MAC: {mac}")
    print(f"C 数组:  {mac_c}")

    print("\n更新固件...")
    updated = 0
    for fw in REAL_FIRMWARE + TEST_FIRMWARE:
        for placeholder in PLACEHOLDERS:
            if patch_firmware(fw, placeholder, mac_c):
                updated += 1
                break

    print(f"\n完成! 更新了 {updated} 个固件。")
    print(f"现在可以烧录肘部和腿部固件了。")


if __name__ == "__main__":
    main()
