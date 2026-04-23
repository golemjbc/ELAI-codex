@echo off
setlocal

set "REPO_ROOT=%~dp0..\"
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%scripts\bump-version.ps1"
if errorlevel 1 exit /b 1

git add index.html
exit /b 0
