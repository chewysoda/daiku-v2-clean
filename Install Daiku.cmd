@echo off
rem Double-click to build and install Daiku. The real work is in install.ps1, next to this file.
title Daiku installer
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
