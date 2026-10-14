@echo off
set "INSTALADOR_VERSAO=v6"
title Vellox - Instalador de Impressao %INSTALADOR_VERSAO%
color 0A
echo.
echo  =========================================
echo   Vellox - Servidor de Impressao Local
echo   Instalador %INSTALADOR_VERSAO%
echo  =========================================
echo.

set "DIR=C:\VelloxPrint"
if not exist "%DIR%" mkdir "%DIR%"

:: Baixa pra arquivo temporario, confere o tamanho e so entao substitui -
:: download pela metade nunca sobrescreve um arquivo que funcionava. O
:: "-bor 3072" liga TLS 1.2, que o Windows PowerShell 5.1 as vezes nao usa
:: sozinho (erro "nao foi possivel criar canal seguro SSL/TLS").
echo  Baixando arquivos...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try{[Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor 3072}catch{};" ^
  "$ok=$true;" ^
  "foreach($f in 'servidor.ps1','configurar.ps1'){" ^
  "  $tmp=Join-Path $env:TEMP ('vellox-'+$f); $feito=$false;" ^
  "  for($i=1;$i -le 3 -and -not $feito;$i++){" ^
  "    try{ Invoke-WebRequest ('https://www.appvellox.online/print-server/'+$f) -OutFile $tmp -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop;" ^
  "         if((Get-Item $tmp).Length -gt 1000){ Move-Item $tmp (Join-Path '%DIR%' $f) -Force; $feito=$true } }catch{ Start-Sleep -Seconds 2 } };" ^
  "  if(-not $feito){ Write-Host ('  ERRO ao baixar '+$f) -ForegroundColor Red; $ok=$false } };" ^
  "if(-not $ok){ exit 1 }"
if errorlevel 1 (
  echo.
  echo  ERRO: nao consegui baixar os arquivos. Confira a internet e rode de novo.
  pause & exit /b 1
)
echo  Download OK!
echo.

:: Se este .bat foi baixado pelo painel, VELLOX_EMPRESA_ID e VELLOX_AGENT_TOKEN
:: ja estao definidos no topo dele e o configurar.ps1 pula o copiar/colar.
powershell -NoProfile -ExecutionPolicy Bypass -File "%DIR%\configurar.ps1"
:: Cancelado/erro: nao segue com um config.json velho de instalacao anterior.
if errorlevel 1 (
  echo.
  echo  Configuracao nao concluida. Rode o instalador de novo quando quiser.
  pause & exit /b 1
)

if not exist "%DIR%\config.json" (
  echo.
  echo  ERRO: a configuracao nao foi salva. Rode o instalador de novo.
  pause & exit /b 1
)

:: Script de inicializacao - roda oculto, tudo vai pro log.txt.
echo @echo off > "%DIR%\iniciar.bat"
echo powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\VelloxPrint\servidor.ps1" >> "%DIR%\iniciar.bat"

:: Atalho na inicializacao do Windows
powershell -NoProfile -Command ^
  "try{ $ws=New-Object -ComObject WScript.Shell;" ^
  "$s=$ws.CreateShortcut([Environment]::GetFolderPath('Startup')+'\Vellox Print.lnk');" ^
  "$s.TargetPath='C:\VelloxPrint\iniciar.bat'; $s.WindowStyle=7; $s.Save();" ^
  "Write-Host ' Inicia sozinho junto com o Windows.' -ForegroundColor Green }catch{ Write-Host ' AVISO: nao criei o atalho de inicializacao, abra C:\VelloxPrint\iniciar.bat apos reiniciar o PC.' -ForegroundColor Yellow }"

:: Mata servidor antigo - um processo velho segurando o mutex faz o novo
:: fechar sozinho na hora, parecendo que a instalacao "nao fez nada".
powershell -NoProfile -Command ^
  "$p=@(Get-CimInstance Win32_Process -EA SilentlyContinue | Where-Object { $_.CommandLine -like '*servidor.ps1*' -and $_.ProcessId -ne $PID });" ^
  "foreach($x in $p){ try{Stop-Process -Id $x.ProcessId -Force -EA Stop}catch{ & taskkill /F /T /PID $x.ProcessId 2>$null | Out-Null } };" ^
  "if($p.Count -gt 0){ Start-Sleep -Seconds 2 }"

echo.
echo  Iniciando o servidor de impressao...
start "" "%DIR%\iniciar.bat"
timeout /t 8 /nobreak >nul

:: Confere de verdade: processo vivo + log sem erro.
powershell -NoProfile -Command ^
  "$vivo=@(Get-CimInstance Win32_Process -EA SilentlyContinue | Where-Object { $_.CommandLine -like '*servidor.ps1*' -and $_.ProcessId -ne $PID }).Count -gt 0;" ^
  "$log=if(Test-Path '%DIR%\log.txt'){ Get-Content '%DIR%\log.txt' -Tail 15 }else{ @() };" ^
  "$erro=@($log | Where-Object { $_ -match 'ERRO' });" ^
  "Write-Host '';" ^
  "if($vivo -and $erro.Count -eq 0){" ^
  "  Write-Host ' =========================================' -ForegroundColor Green;" ^
  "  Write-Host '   PRONTO! Servidor de impressao rodando.' -ForegroundColor Green;" ^
  "  Write-Host '   No painel (Automacoes > Impressao) o' -ForegroundColor Green;" ^
  "  Write-Host '   agente fica VERDE em ate 10 segundos.' -ForegroundColor Green;" ^
  "  Write-Host ' =========================================' -ForegroundColor Green" ^
  "} else {" ^
  "  Write-Host ' =========================================' -ForegroundColor Red;" ^
  "  Write-Host '   O servidor NAO ficou rodando.' -ForegroundColor Red;" ^
  "  Write-Host ' =========================================' -ForegroundColor Red;" ^
  "  Write-Host ' Ultimas linhas do log:' -ForegroundColor Yellow;" ^
  "  $log | ForEach-Object { Write-Host ('   '+$_) };" ^
  "  Write-Host ' Tire um print desta tela e mande pro suporte Vellox.' -ForegroundColor Yellow" ^
  "}"
echo.
pause
