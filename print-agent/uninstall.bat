@echo off
:: ============================================================
::  The Bill - Remove Print Agent
::  Run this to completely uninstall the print agent from this PC
:: ============================================================

NET SESSION >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo  Stopping The Bill print agent...
pm2 stop TheBill-PrintAgent
pm2 delete TheBill-PrintAgent
pm2 save

echo.
echo  Removing auto-start...
pm2-startup uninstall

echo.
echo  Done. Print agent has been removed from this PC.
echo.
pause
