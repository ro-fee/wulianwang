@echo off
chcp 65001 >nul
title Hub 链路验证
echo.
echo   所有设备上电后按任意键开始验证...
pause >nul
echo.
python tests/verify_hub.py
echo.
pause
