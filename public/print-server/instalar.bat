@echo off
title Vellox - Instalador de Impressao
color 0A
echo.
echo  =========================================
echo   Vellox - Servidor de Impressao Local
echo   (Nao precisa de Node.js!)
echo  =========================================
echo.

set "DIR=C:\VelloxPrint"
if not exist "%DIR%" mkdir "%DIR%"

echo  Baixando servidor...
powershell -NoProfile -Command "Invoke-WebRequest 'https://www.appvellox.online/print-server/servidor.ps1' -OutFile '%DIR%\servidor.ps1' -UseBasicParsing"
if not exist "%DIR%\servidor.ps1" (
  echo  ERRO: Falha ao baixar. Verifique sua conexao.
  pause & exit /b 1
)
echo  Download OK!
echo.

echo  Abrindo pagina de configuracao no seu navegador...
echo  (Se pedir login, entre com sua conta Vellox)
start "" "https://www.appvellox.online/api/print-server/config"
echo.
echo  =========================================
echo   1. O arquivo config.json foi baixado
echo      na sua pasta Downloads automaticamente
echo   2. Volte aqui e aperte uma tecla
echo  =========================================
echo.
pause

:: Pega o config*.json MAIS RECENTE do Downloads — o navegador nao
:: sobrescreve arquivo com nome repetido (baixa como "config (1).json"
:: etc.), entao nao da pra assumir o nome exato "config.json".
set "FOUND="
for /f "delims=" %%F in ('powershell -NoProfile -Command "Get-ChildItem -Path \"$env:USERPROFILE\Downloads\" -Filter 'config*.json' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName"') do set "FOUND=%%F"

if not defined FOUND (
  echo.
  echo  ERRO: nenhum config*.json encontrado em "%USERPROFILE%\Downloads"
  echo  Baixe manualmente em:
  echo    https://www.appvellox.online/api/print-server/config
  echo  e coloque o arquivo em %DIR%\config.json
  pause & exit /b 1
)
echo  Usando: %FOUND%
copy /y "%FOUND%" "%DIR%\config.json" >nul
echo  Configuracao encontrada!
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$cfg = Get-Content 'C:\VelloxPrint\config.json' -Raw | ConvertFrom-Json;" ^
  "Write-Host '';" ^
  "Write-Host 'Impressoras instaladas:' -ForegroundColor Yellow;" ^
  "Get-Printer | Select-Object -ExpandProperty Name | ForEach-Object { Write-Host ('  -> ' + $_) };" ^
  "Write-Host '';" ^
  "$imp = Read-Host 'Nome exato da impressora termica (ENTER = padrao do sistema)';" ^
  "$cfg | Add-Member -NotePropertyName printer_name -NotePropertyValue $imp.Trim() -Force;" ^
  "$cfg | ConvertTo-Json | Out-File -Encoding utf8 'C:\VelloxPrint\config.json';" ^
  "Write-Host '';" ^
  "Write-Host 'Configuracao salva!' -ForegroundColor Green;"

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
