@echo off
title MediSync Adherence Platform
echo ====================================================
echo Starting MediSync Medical Adherence System...
echo ====================================================
echo.
echo 1. Opening browser at http://localhost:3000 ...
timeout /t 2 /nobreak >nul
start http://localhost:3000
echo.
echo 2. Launching Node.js Backend Server on Port 3000...
echo Keep this terminal window open while using the app!
echo.
node server.js
pause
