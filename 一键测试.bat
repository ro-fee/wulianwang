@echo off
chcp 65001 >nul
title 3D模型测试 — Mock Bridge

echo.
echo   ╔══════════════════════════════════════╗
echo   ║     3D 模型测试 (无硬件模拟)         ║
echo   ╚══════════════════════════════════════╝
echo.

:: ── 0. 清理上次可能残留的进程 ──
echo [0/4] 清理残留进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:8765" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo        已终止残留进程 PID=%%a
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:5502" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo        已终止残留进程 PID=%%a
)
echo        清理完成

echo [1/4] 检查依赖...
python -c "import websockets" >nul 2>&1
if errorlevel 1 (
    echo        安装 websockets...
    pip install websockets -q
)
echo        依赖就绪

echo [2/4] 设置 DeepSeek API Key...
set DEEPSEEK_API_KEY=sk-e1e178ed79244558b5e8f4da7f166cae
echo        API Key 已配置

echo [3/4] 启动模拟服务器...
echo.
echo    http://127.0.0.1:5502/rgc-frontend/threeDimention.html
echo    ws://127.0.0.1:8765
echo    按 Ctrl+C 停止
echo.

python tests/test_bridge_mock.py

pause
