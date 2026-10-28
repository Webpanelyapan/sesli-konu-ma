@echo off
title Sesli Sohbet - Internete Yayinla
echo ===================================================
echo   Sesli Sohbet Sunucusu Baslatiliyor...
echo ===================================================

start cmd /k "title Sunucu (Port 3000) && node server.js"

echo Sunucu acildi! Simdi internete acik HTTPS baglantisi olusturuluyor...
timeout /t 2 /nobreak >nul

npx localtunnel --port 3000
pause
