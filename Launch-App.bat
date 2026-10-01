@echo off
setlocal
set "appPort=4173"
if defined LAUNCH_APP_PORT set "appPort=%LAUNCH_APP_PORT%"
set "browserOption="
if /I "%LAUNCH_APP_NO_BROWSER%"=="1" set "browserOption=-NoBrowser"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch-App.ps1" -Port %appPort% %browserOption%
if errorlevel 1 pause
endlocal
