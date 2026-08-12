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
powershell -NoProfile -Command "Invoke-WebRequest 'https://www.appvellox.online/print-server/servidor.ps1' -OutFile '%DIR%\servidor.ps1'"
if not exist "%DIR%\servidor.ps1" (
  echo  ERRO: Falha ao baixar. Verifique sua conexao.
  pause & exit /b 1
)
echo  Download OK!
echo.

echo  Abrindo configuracoes para voce copiar o ID...
start "" "https://www.appvellox.online/configuracoes"
echo.
echo  =========================================
echo   Abra o site que acabou de abrir,
echo   role ate "Impressao automatica silenciosa"
echo   e clique em COPIAR ao lado do ID.
echo  =========================================
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$pub = Invoke-RestMethod 'https://www.appvellox.online/api/print-server/public-config';" ^
  "$id   = Read-Host 'Cole o ID da empresa';" ^
  "if (-not $id.Trim()) { Write-Host 'ID vazio, tente novamente.' -ForegroundColor Red; Read-Host; exit 1 };" ^
  "$nome = Read-Host 'Nome da empresa';" ^
  "Write-Host '';" ^
  "Write-Host 'Impressoras instaladas:' -ForegroundColor Yellow;" ^
  "Get-Printer | Select-Object -ExpandProperty Name | ForEach-Object { Write-Host ('  -> ' + $_) };" ^
  "Write-Host '';" ^
  "$imp = Read-Host 'Nome exato da impressora termica (ENTER = padrao)';" ^
  "[ordered]@{supabase_url=$pub.supabase_url;supabase_anon_key=$pub.supabase_anon_key;empresa_id=$id.Trim();empresa_nome=$nome;printer_name=$imp.Trim()} | ConvertTo-Json | Out-File -Encoding utf8 'C:\VelloxPrint\config.json';" ^
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
