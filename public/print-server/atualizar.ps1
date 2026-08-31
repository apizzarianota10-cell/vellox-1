# Vellox - Atualiza o servidor de impressao sem mexer nas credenciais salvas
# (empresa_id, agent_token, impressora, papel continuam os mesmos de C:\VelloxPrint\config.json)
$ErrorActionPreference = "Stop"
$dir = "C:\VelloxPrint"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Vellox - Atualizar servidor de impressao" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "$dir\config.json")) {
    Write-Host "ERRO: nao achei $dir\config.json — parece que o Vellox Print nao esta instalado neste PC." -ForegroundColor Red
    Write-Host "Rode o instalador completo em https://www.appvellox.online/print-server/instalar.bat" -ForegroundColor Yellow
    Read-Host "Pressione ENTER para sair"
    exit 1
}

Write-Host "Baixando a versao mais recente..." -ForegroundColor Yellow
# Baixa pra um arquivo temporario primeiro e SO troca o servidor.ps1 (e para
# o antigo) se o download realmente deu certo — assim, se a internet cair no
# meio, o agente que ja estava rodando continua rodando em vez de ficar sem
# nenhum processo de impressao ate alguem notar.
$tmpFile = Join-Path $env:TEMP "vellox-servidor-novo.ps1"
try {
    Invoke-WebRequest "https://www.appvellox.online/print-server/servidor.ps1" -OutFile $tmpFile -UseBasicParsing -TimeoutSec 30
    if (-not (Test-Path $tmpFile) -or (Get-Item $tmpFile).Length -lt 1000) {
        throw "Arquivo baixado parece vazio ou incompleto."
    }
} catch {
    Write-Host "ERRO: nao foi possivel baixar a atualizacao ($($_.Exception.Message)). O servidor atual continua rodando normalmente — tente de novo mais tarde." -ForegroundColor Red
    Read-Host "Pressione ENTER para sair"
    exit 1
}

Write-Host "Download OK. Parando o servidor atual (se estiver rodando)..." -ForegroundColor Yellow
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*servidor.ps1*" } |
    ForEach-Object {
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
    }
Start-Sleep -Seconds 2

Move-Item -Path $tmpFile -Destination "$dir\servidor.ps1" -Force

if (-not (Test-Path "$dir\iniciar.bat")) {
    # instalações antigas podem não ter o iniciar.bat — recria
    "@echo off`r`npowershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dir\servidor.ps1`"" |
        Out-File -Encoding ascii "$dir\iniciar.bat"
}

Write-Host "Reiniciando o servidor (escondido, do jeito de sempre)..." -ForegroundColor Yellow
Start-Process -FilePath "$dir\iniciar.bat" -WindowStyle Hidden

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  Pronto! Servidor atualizado." -ForegroundColor Green
Write-Host "  Duvidas: confira C:\VelloxPrint\log.txt" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Read-Host "Pressione ENTER para fechar"
