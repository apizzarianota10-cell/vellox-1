@echo off
set "INSTALADOR_VERSAO=v2"
title Vellox - Instalador de Impressao %INSTALADOR_VERSAO%
color 0A
echo.
echo  =========================================
echo   Vellox - Servidor de Impressao Local
echo   (Nao precisa de Node.js!)
echo   Instalador %INSTALADOR_VERSAO%
echo  =========================================
echo.

set "DIR=C:\VelloxPrint"
if not exist "%DIR%" mkdir "%DIR%"

echo  Baixando arquivos...
powershell -NoProfile -Command "Invoke-WebRequest 'https://www.appvellox.online/print-server/servidor.ps1' -OutFile '%DIR%\servidor.ps1' -UseBasicParsing"
powershell -NoProfile -Command "Invoke-WebRequest 'https://www.appvellox.online/print-server/configurar.ps1' -OutFile '%DIR%\configurar.ps1' -UseBasicParsing"
if not exist "%DIR%\servidor.ps1" (
  echo  ERRO: Falha ao baixar servidor.ps1. Verifique sua conexao.
  pause & exit /b 1
)
if not exist "%DIR%\configurar.ps1" (
  echo  ERRO: Falha ao baixar configurar.ps1. Verifique sua conexao.
  pause & exit /b 1
)
echo  Download OK!
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%DIR%\configurar.ps1"

if not exist "%DIR%\config.json" (
  echo  ERRO: Configuracao nao foi salva. Tente novamente.
  pause & exit /b 1
)

:: Cria script de inicializacao
echo @echo off > "%DIR%\iniciar.bat"
echo powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File "C:\VelloxPrint\servidor.ps1" >> "%DIR%\iniciar.bat"

:: Atalho no startup do Windows
powershell -NoProfile -Command ^
  "$ws=$([Runtime.InteropServices.Marshal]::GetActiveObject('WScript.Shell') -as [object]);" ^
  "if(-not $ws){$ws=New-Object -ComObject WScript.Shell};" ^
  "$s=$ws.CreateShortcut($([Environment]::GetFolderPath('Startup')+'\Vellox Print.lnk'));" ^
  "$s.TargetPath='C:\VelloxPrint\iniciar.bat';" ^
  "$s.WindowStyle=7;" ^
  "$s.Save();" ^
  "Write-Host 'Atalho de inicializacao criado.' -ForegroundColor Green;"

echo.
echo  =========================================
echo   Instalacao concluida!
echo   Iniciando servidor...
echo  =========================================
echo.
start /min cmd /k "powershell -NoProfile -ExecutionPolicy Bypass -File C:\VelloxPrint\servidor.ps1"
echo.
echo  Servidor rodando em segundo plano!
echo  Faca um pedido de teste no Vellox.
echo.
pause
