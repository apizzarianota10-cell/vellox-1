# Vellox Print Server - Configuracao (copiar/colar, sem depender de download de arquivo)
$ErrorActionPreference = "Stop"
$dir = "C:\VelloxPrint"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Vellox - Configuracao do servidor" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# 1. Busca supabase_url / anon_key sem precisar de login (rota publica)
try {
    $pub = Invoke-RestMethod -Uri "https://www.appvellox.online/api/print-server/public-config" -UseBasicParsing
} catch {
    Write-Host "ERRO: nao foi possivel contatar o servidor Vellox. Verifique sua internet." -ForegroundColor Red
    Read-Host "Pressione ENTER para sair"
    exit 1
}
if (-not $pub.supabase_url -or -not $pub.supabase_anon_key) {
    Write-Host "ERRO: resposta invalida do servidor." -ForegroundColor Red
    Read-Host "Pressione ENTER para sair"
    exit 1
}

# 2. Abre o navegador na tela de credenciais
Write-Host "Abrindo a pagina de credenciais no navegador..." -ForegroundColor Yellow
Write-Host "  1. Faca login com sua conta Vellox, se pedir"
Write-Host "  2. Va em Configuracoes > Impressao"
Write-Host "  3. Ache 'Credenciais do servidor de impressao'"
Write-Host "  4. Copie o 'ID da empresa' e o 'Token do agente'"
Write-Host ""
Start-Process "https://www.appvellox.online/configuracoes/impressao"
Read-Host "Pressione ENTER aqui quando ja tiver os dois valores copiados"
Write-Host ""

# 3. Le e valida (com retry) - protege contra espaco/aspas/corte no paste
function Read-Validated {
    param([string]$Label, [string]$Pattern, [string]$Hint)
    while ($true) {
        $raw = Read-Host $Label
        if ($raw -eq "sair" -or $raw -eq "cancelar") {
            Write-Host "Instalacao cancelada." -ForegroundColor Yellow
            exit 1
        }
        $v = $raw.Trim().Trim('"').Trim("'")
        if ($v -match $Pattern) { return $v }
        Write-Host "  Valor invalido. $Hint (digite 'sair' para cancelar)" -ForegroundColor Red
    }
}

$empresaId = Read-Validated -Label "Cole o ID da empresa" `
    -Pattern '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' `
    -Hint "Deve ser um UUID (ex: 1a2b3c4d-5e6f-7890-abcd-ef1234567890)."

$agentToken = Read-Validated -Label "Cole o token do agente" `
    -Pattern '^[0-9a-f]{32,64}$' `
    -Hint "Deve ser o token hexadecimal mostrado na tela, sem espacos."

$empresaNome = (Read-Host "Nome da loja para o topo do cupom (ENTER para deixar em branco)").Trim()

Write-Host ""
Write-Host "Impressoras instaladas neste computador:" -ForegroundColor Yellow
Get-Printer | Select-Object -ExpandProperty Name | ForEach-Object { Write-Host "  -> $_" }
Write-Host ""
$printerName = (Read-Host "Nome exato da impressora termica (ENTER = padrao do sistema)").Trim()

$cfg = [PSCustomObject]@{
    supabase_url      = $pub.supabase_url
    supabase_anon_key = $pub.supabase_anon_key
    empresa_id        = $empresaId
    empresa_nome      = $empresaNome
    agent_token       = $agentToken
    printer_name      = $printerName
    tamanho_papel     = "80mm"
}
$cfg | ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $dir "config.json")
Write-Host ""
Write-Host "Configuracao salva em $dir\config.json" -ForegroundColor Green
