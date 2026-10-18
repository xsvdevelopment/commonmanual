@echo off
title OpenBay (close this window to stop OpenBay)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing...
  call npm install || (pause & exit /b 1)
)
if not exist dist (
  echo Building...
  call npm run build || (pause & exit /b 1)
)

start "" http://localhost:4747
node server\index.js
pause
