@echo off
title Vellox - Atualizar Servidor de Impressao
color 0A
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest 'https://www.appvellox.online/print-server/atualizar.ps1' -OutFile '%TEMP%\vellox-atualizar.ps1' -UseBasicParsing; & '%TEMP%\vellox-atualizar.ps1'"
