"""验证腰间 Hub 数据链路状态 — 无需串口监视器"""
import sys
import time
import re
import serial
import serial.tools.list_ports


def find_esp32_port():
    ports = serial.tools.list_ports.comports()
    for p in ports:
        if "USB" in p.description or "COM" in p.device:
            return p.device
    return None


def verify(port: str, timeout: float = 20) -> dict:
    """打开串口，等待 STAT 行，返回验证结果"""
    print(f"打开 {port} (115200) ...")
    ser = serial.Serial(port, 115200, timeout=1)
    ser.dtr = False
    time.sleep(0.1)
    ser.dtr = True

    results = {"elbow": False, "leg": False, "insole": False, "mac": None, "side": None}
    start = time.time()
    all_ok = False

    print("等待 Hub 启动...\n")
    while time.time() - start < timeout:
        try:
            line = ser.readline().decode("utf-8", errors="replace").strip()
        except Exception:
            continue
        if not line:
            continue

        print(f"  {line}")

        # 提取 MAC
        m = re.search(r"([0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2})", line)
        if m:
            results["mac"] = m.group(1).upper()

        # 提取侧
        if "侧: LEFT" in line:
            results["side"] = "LEFT"
        elif "侧: RIGHT" in line:
            results["side"] = "RIGHT"

        # 解析 STAT 行
        if "[STAT]" not in line:
            continue

        results["elbow"] = "肘部: 有" in line
        results["leg"] = "腿部: 有" in line
        results["insole"] = "鞋垫: 有" in line
        all_ok = results["elbow"] and results["leg"] and results["insole"]
        break

    ser.close()
    return results, all_ok


def main():
    print("╔══════════════════════════════════════╗")
    print("║  Hub 链路状态验证                    ║")
    print("╚══════════════════════════════════════╝\n")

    port = sys.argv[1] if len(sys.argv) > 1 else "COM7"
    if not port:
        print("未找到串口设备！手动指定: python tests/verify_hub.py COM7")
        sys.exit(1)

    results, all_ok = verify(port)
    print()

    # 报告
    side = results["side"] or "?"
    print(f"  侧:     {side}")
    print(f"  肘部:   {'OK' if results['elbow'] else 'FAIL'}")
    print(f"  腿部:   {'OK' if results['leg'] else 'FAIL'}")
    print(f"  鞋垫:   {'OK' if results['insole'] else 'FAIL'}")

    if results["mac"]:
        print(f"  MAC:    {results['mac']}")
    print()

    if all_ok:
        print("✓ 全链路正常")
    else:
        print("✗ 链路异常 — 检查:")
        if not results["elbow"]:
            print("  - 肘部 WAIST_MAC 是否正确 / IMU 是否先通电")
        if not results["leg"]:
            print("  - 腿部 WAIST_MAC 是否正确 / IMU 是否先通电")
        if not results["insole"]:
            print("  - 鞋垫是否通电 / MAC 是否匹配")
        sys.exit(1)


if __name__ == "__main__":
    main()
