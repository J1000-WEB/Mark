@echo off
REM MARK ERP Agent - daily scheduler launcher
cd /d "%~dp0"

echo ============================================
echo  MARK ERP daily schedule - running
echo  (close this window to stop)
echo ============================================
echo.

node run-daily-schedule.js

echo.
echo (Stopped. Press any key to close this window)
pause >nul
