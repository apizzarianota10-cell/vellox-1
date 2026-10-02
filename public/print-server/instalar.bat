@echo off
set "INSTALADOR_VERSAO=v4"
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

:: Cria script de inicializacao — roda TOTALMENTE oculto (sem janela pra
:: fechar sem querer). Tudo que o servidor imprimiria na tela vai pro
:: log.txt (servidor.ps1 grava lá com Start-Transcript).
echo @echo off > "%DIR%\iniciar.bat"
echo powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\VelloxPrint\servidor.ps1" >> "%DIR%\iniciar.bat"

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
echo   Iniciando servidor (oculto, sem janela)...
echo  =========================================
echo.
start "" "%DIR%\iniciar.bat"

:: Espera o servidor subir e mostra as ultimas linhas do log aqui mesmo —
:: antes disso, um erro logo na largada (impressora errada, config
:: corrompido etc.) so aparecia pra quem sabia abrir o log.txt sozinho.
echo  Aguardando o servidor iniciar...
timeout /t 5 /nobreak >nul
echo.
echo  ----------------------------------------
echo   Ultimas linhas do servidor (log.txt):
echo  ----------------------------------------
powershell -NoProfile -Command "if (Test-Path '%DIR%\log.txt') { Get-Content '%DIR%\log.txt' -Tail 12 } else { Write-Host '(log.txt ainda nao foi criado)' }"
echo  ----------------------------------------
echo.
echo  Se aparecer algum "ERRO" ou "AVISO" em vermelho/amarelo acima, resolva
echo  antes de continuar. Se nao, pode fazer um pedido de teste no Vellox.
echo.
echo  O servidor continua rodando escondido em segundo plano. Pra conferir
echo  de novo mais tarde, abra: %DIR%\log.txt
echo.
pause
