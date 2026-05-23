@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title 跑步姿态分析 — 一键启动

echo.
echo   ╔══════════════════════════════════════════════╗
echo   ║      ◈ 跑步姿态分析平台  ◈                    ║
echo   ║      东北大学 · 大创项目                       ║
echo   ╚══════════════════════════════════════════════╝
echo.

:: ── 0. 清理上次可能残留的进程 ──
echo [0/5] 清理残留进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:8765" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo        已终止残留进程 PID=%%a
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:5502" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo        已终止残留进程 PID=%%a
)
echo        清理完成

:: ── 1. 检查 Python ──
echo [1/5] 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请安装 Python 3.10+
    echo 下载地址: https://www.python.org/downloads/
    echo 安装时请勾选 "Add Python to PATH"
    pause
    exit /b 1
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do echo        已检测: Python %%v

:: ── 2. 检查/安装依赖 ──
echo.
echo [2/5] 检查依赖包...
python -c "import bleak, websockets, openai" >nul 2>&1
if errorlevel 1 (
    echo        正在安装依赖包...
    python -m pip install -r requirements.txt -q
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络连接
        pause
        exit /b 1
    )
    echo        依赖安装完成
) else (
    echo        依赖已就绪
)

:: ── 3. API Key ──
echo.
echo [3/5] 设置 DeepSeek API Key...
set DEEPSEEK_API_KEY=sk-e1e178ed79244558b5e8f4da7f166cae
echo        API Key 已配置

:: ── 4. 启动桥接器 ──
echo.
echo [4/5] 启动桥接器...
echo.
echo   前端页面: http://127.0.0.1:5502/rgc-frontend/
echo   BLE 数据: ws://127.0.0.1:8765
echo   按 Ctrl+C 停止
echo.
echo   ═══════════════════════════════════════════════
echo.

python -u ble_bridge_launcher.py

pause
