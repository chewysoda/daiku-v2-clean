@echo off
rem Double-click to install Daiku. If Daiku-Setup*.exe is next to this file it just runs that (under a minute);
rem otherwise it builds from source. The real work is in install.ps1, next to this file.
title Daiku installer
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
