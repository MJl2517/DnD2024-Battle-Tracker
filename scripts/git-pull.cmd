@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0git-pull.ps1"
exit /b %ERRORLEVEL%
