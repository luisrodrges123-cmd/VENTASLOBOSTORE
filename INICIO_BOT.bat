@echo off
title BOT VENTAS LOBO STORE - MODO PREMIUM
color 0b

:start
cls
echo ======================================================
echo           🐺 BIENVENIDO A LOBO STORE 🐺
echo        SISTEMA DE VENTAS AUTOMATIZADO 24/7
echo ======================================================
echo.
echo [INFO] Iniciando el Bot de WhatsApp...
echo [INFO] Presiona CTRL+C para detener el proceso.
echo.

node bot.js

echo.
echo ======================================================
echo   [!] EL BOT SE HA CERRADO O HA DETECTADO UN ERROR
echo   [!] REINICIANDO EN 5 SEGUNDOS...
echo ======================================================
echo.

timeout /t 5
goto start
