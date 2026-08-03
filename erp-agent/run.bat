@echo off
REM MARK ERP Agent launcher
cd /d "%~dp0"

echo ============================================
echo  MARK ERP Agent - scraping channel sales
echo ============================================
echo.

node scrape.js

echo.
echo (Done. Press any key to close this window)
pause >nul
