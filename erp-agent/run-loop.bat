@echo off
REM MARK ERP Agent - continuous loop launcher
cd /d "%~dp0"

echo ============================================
echo  MARK ERP Agent - running continuously
echo  (close this window to stop)
echo ============================================
echo.

node run-loop.js

echo.
echo (Stopped. Press any key to close this window)
pause >nul
