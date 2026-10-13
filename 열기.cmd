@echo off
chcp 65001 > nul
cd /d "%~dp0"
where node > nul 2>&1
if errorlevel 1 (
  echo Node.js가 없어요. https://nodejs.org 에서 설치해 주세요.
  pause
  exit /b 1
)
node serve.js
pause
