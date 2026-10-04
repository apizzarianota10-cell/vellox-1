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
# Antes filtrava só por Name='powershell.exe' e nunca conferia se matou de
# verdade — se falhasse (nome diferente tipo pwsh.exe, processo preso,
# permissao), o script seguia em frente do mesmo jeito e subia a versao
# nova, que trombava com o mutex do processo antigo ainda vivo e se fechava
# sozinha sem avisar nada. Parecia que a atualizacao "nao tinha feito
# nada". Agora: pega qualquer processo com servidor.ps1 na linha de
# comando (sem travar no nome do executavel), mata, CONFERE que morreu de
# verdade (reconsultando), escala pra taskkill se precisar, e só segue
# adiante depois de confirmar — se não conseguir, avisa bem alto em vez de
# seguir calado.
function Get-ServidorProcs {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*servidor.ps1*" }
}

$tentativas = 0
$restantes = @(Get-ServidorProcs)
while ($restantes.Count -gt 0 -and $tentativas -lt 5) {
    foreach ($proc in $restantes) {
        if ($tentativas -eq 0) {
            try { Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop } catch {}
        } else {
            # Escalada: Stop-Process não bastou, tenta taskkill /T (mata a
            # arvore de processos toda, inclusive filhos presos).
            try { & taskkill /F /T /PID $proc.ProcessId 2>$null | Out-Null } catch {}
        }
    }
    Start-Sleep -Seconds 1
    $tentativas++
    $restantes = @(Get-ServidorProcs)
}

if ($restantes.Count -gt 0) {
    Write-Host ""
    Write-Host "ERRO: nao consegui encerrar o servidor antigo (PID $($restantes[0].ProcessId)) depois de $tentativas tentativas." -ForegroundColor Red
    Write-Host "A versao nova NAO foi iniciada pra evitar os dois rodando ao mesmo tempo." -ForegroundColor Red
    Write-Host "Abra o Gerenciador de Tarefas, encerre manualmente o processo acima e rode este atualizador de novo." -ForegroundColor Yellow
    Read-Host "Pressione ENTER para sair"
    exit 1
}
Write-Host "Servidor antigo encerrado (confirmado)." -ForegroundColor Green

Move-Item -Path $tmpFile -Destination "$dir\servidor.ps1" -Force

if (-not (Test-Path "$dir\iniciar.bat")) {
    # instalações antigas podem não ter o iniciar.bat — recria
    "@echo off`r`npowershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dir\servidor.ps1`"" |
        Out-File -Encoding ascii "$dir\iniciar.bat"
}

Write-Host "Reiniciando o servidor (escondido, do jeito de sempre)..." -ForegroundColor Yellow
Start-Process -FilePath "$dir\iniciar.bat" -WindowStyle Hidden

Start-Sleep -Seconds 5
Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host "  Ultimas linhas do servidor (log.txt):" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Cyan
if (Test-Path "$dir\log.txt") { Get-Content "$dir\log.txt" -Tail 12 } else { Write-Host "(log.txt ainda nao foi criado)" }
Write-Host "----------------------------------------" -ForegroundColor Cyan

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  Pronto! Servidor atualizado." -ForegroundColor Green
Write-Host "  Se aparecer ERRO/AVISO acima, resolva antes de continuar." -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Read-Host "Pressione ENTER para fechar"
