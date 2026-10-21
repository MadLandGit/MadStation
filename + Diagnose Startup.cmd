@echo off
setlocal
cd /d "%~dp0"
title Mad Station - Diagnose Startup

echo ================================================================
echo Mad Station v1.6.3 - Diagnose Startup (full checks)
echo ================================================================
echo Runs the complete release checks, security audits, production build,
echo Electron binary verification, and live startup/shutdown diagnosis.
echo If dependencies are missing or mismatched, it tries npm ci.
echo A timestamped log is saved under %LOCALAPPDATA%\MadStation\diagnostics.
echo.

if not exist "%~dp0scripts\diagnose-startup.ps1" (
  echo ERROR: scripts\diagnose-startup.ps1 is missing.
  echo Re-extract the complete project ZIP and try again.
  pause
  exit /b 2
)
if not exist "%~dp0scripts\check-diagnose-startup-syntax.ps1" (
  echo ERROR: scripts\check-diagnose-startup-syntax.ps1 is missing.
  echo Re-extract the complete project ZIP and try again.
  pause
  exit /b 2
)

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo ERROR: Windows PowerShell was not found.
  pause
  exit /b 2
)

echo Checking PowerShell syntax before starting diagnostics...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-diagnose-startup-syntax.ps1"
if errorlevel 1 (
  echo ERROR: Diagnose Startup has a PowerShell syntax problem. The diagnostic routine was not started.
  pause
  exit /b 2
)

echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\diagnose-startup.ps1"
set "DIAGNOSE_EXIT_CODE=%ERRORLEVEL%"
echo.
if "%DIAGNOSE_EXIT_CODE%"=="0" (
  echo Diagnose Startup finished: checks passed and the application startup flow was confirmed.
) else (
  echo Diagnose Startup found a failure or could not complete.
  echo Read the final diagnostic summary and timestamped log path printed above.
)
echo.
pause
exit /b %DIAGNOSE_EXIT_CODE%
