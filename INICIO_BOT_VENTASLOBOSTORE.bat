@echo off
title BOT VENTAS LOBO STORE
color 0B

cd /d "C:\Users\ANGELITO PC\AndroidStudioProjects\VENTASLOBOSTORE"

if not exist logs mkdir logs

:START
echo [%date% %time%] Iniciando bot...
node bot.js >> logs\bot.log 2>&1

echo.
echo El bot se cerro o fallo.
echo Reiniciando en 5 segundos...
timeout /t 5 /nobreak >nul
goto START
