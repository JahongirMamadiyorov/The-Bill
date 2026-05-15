@echo off
:: ============================================================
::  The Bill - Kitchen Print Agent Installer
::  Double-click this file to set up automatic kitchen printing
:: ============================================================

:: Request administrator privileges (needed for PM2 startup)
NET SESSION >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: Run the PowerShell installer from the same folder as this .bat file
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause
