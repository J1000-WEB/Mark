@echo off
REM MARK Research Agent launcher
REM Place this file inside the research-agent folder.

REM Edit these two lines for your setup:
set MARK_BASE_URL=https://your-domain.vercel.app
set LOGIC_PASSWORD=4885

REM Move to this script's own folder (works no matter where you double-click it from)
cd /d "%~dp0"

echo ============================================
echo  MARK Research Agent watcher starting
echo  MARK_BASE_URL=%MARK_BASE_URL%
echo ============================================
echo.

node watch.js

echo.
echo (Stopped. Press any key to close this window)
pause >nul
