@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "SCRIPT=%SCRIPT_DIR%RUN_CAPCUT_Easy_CUT.ps1"
set "POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%SCRIPT%" (
  echo [X] RUN_CAPCUT_Easy_CUT.ps1 was not found.
  echo Please extract the ZIP file again, then run this file from the extracted folder.
  echo.
  pause
  exit /b 1
)

if not exist "%POWERSHELL%" set "POWERSHELL=powershell.exe"

"%POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [X] CAPCUT Easy CUT stopped with error code %EXIT_CODE%.
  echo.
  pause
)

exit /b %EXIT_CODE%
