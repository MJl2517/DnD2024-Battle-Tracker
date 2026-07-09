@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0git-push.ps1" %*
exit /b %ERRORLEVEL%
