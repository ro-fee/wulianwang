@echo off
title RGC BLE Bridge

echo ================================
echo   RGC BLE Bridge Launcher
echo ================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.10+
    echo Download: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [1/2] Checking dependencies...
python -c "import bleak, websockets, openai" >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    python -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies. Check your network.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed.
) else (
    echo [OK] Dependencies ready.
)

echo [2/2] Starting bridge...
echo.
echo Press Ctrl+C to stop.
echo Frontend will open in your browser.
echo.

REM DeepSeek AI Chat API Key
set DEEPSEEK_API_KEY=sk-e1e178ed79244558b5e8f4da7f166cae

python -u ble_bridge_launcher.py

pause
