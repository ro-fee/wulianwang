@echo off
chcp 65001 >nul
title 3D模型测试 — Mock Bridge

echo.
echo   ╔══════════════════════════════════════╗
echo   ║     3D 模型测试 (无硬件模拟)         ║
echo   ╚══════════════════════════════════════╝
echo.

echo [1/2] 检查依赖...
python -c "import websockets" >nul 2>&1
if errorlevel 1 (
    echo        安装 websockets...
    pip install websockets -q
)
echo        依赖就绪

echo [2/2] 启动模拟服务器...
echo.
echo    http://127.0.0.1:5502/rgc-frontend/threeDimention.html
echo    ws://127.0.0.1:8765
echo    按 Ctrl+C 停止
echo.

python tests/test_bridge_mock.py

pause
