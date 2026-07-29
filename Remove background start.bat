@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\Uninstall-Autostart.ps1"
pause
