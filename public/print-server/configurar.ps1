# Vellox Print Server - Configuracao (copiar/colar, sem depender de download de arquivo)
$Versao = "v3"
$ErrorActionPreference = "Stop"
$dir = "C:\VelloxPrint"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Vellox - Configuracao do servidor" -ForegroundColor Cyan
Write-Host "  Versao $Versao" -ForegroundColor Cyan
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
Write-Host "  2. Va em Automacoes > Impressao"
Write-Host "  3. Ache 'Credenciais do servidor de impressao'"
Write-Host "  4. Copie o 'ID da empresa' e o 'Token do agente'"
Write-Host ""
Start-Process "https://www.appvellox.online/automacoes/impressao"
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

# 3b. Testa a credencial contra o servidor ANTES de seguir pro resto das
# perguntas — antes disso, um ID ou token colado errado (ex: trocados entre
# si, ou faltando um caractere no copiar/colar) só aparecia depois, com o
# agente ficando "offline" sem nenhuma explicacao. Essa chamada (mesma RPC
# que o servidor.ps1 usa pra buscar layout/fonte) devolve vazio se o par
# nao bater com nenhuma linha no banco — e a linha sempre existe antes
# disso, porque so chega aqui depois de abrir a tela de Credenciais, que ja
# cria o token.
function Test-Credencial($empId, $token) {
    try {
        $uri  = "$($pub.supabase_url)/rest/v1/rpc/get_print_agent_prefs"
        $hdrs = @{ "apikey" = $pub.supabase_anon_key; "Authorization" = "Bearer $($pub.supabase_anon_key)"; "Content-Type" = "application/json" }
        $body = @{ p_empresa_id = $empId; p_agent_token = $token } | ConvertTo-Json
        $resp = Invoke-RestMethod -Uri $uri -Headers $hdrs -Method POST -Body $body -TimeoutSec 15 -ErrorAction Stop
        return ($resp -and $resp.Count -gt 0)
    } catch {
        return $false
    }
}

while ($true) {
    $empresaId = Read-Validated -Label "Cole o ID da empresa" `
        -Pattern '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' `
        -Hint "Deve ser um UUID (ex: 1a2b3c4d-5e6f-7890-abcd-ef1234567890)."

    $agentToken = Read-Validated -Label "Cole o token do agente" `
        -Pattern '^[0-9a-f]{32,64}$' `
        -Hint "Deve ser o token hexadecimal mostrado na tela, sem espacos."

    Write-Host "Validando com o servidor..." -ForegroundColor Yellow -NoNewline
    if (Test-Credencial $empresaId $agentToken) {
        Write-Host " OK!" -ForegroundColor Green
        break
    }
    Write-Host " FALHOU." -ForegroundColor Red
    Write-Host "  O ID e/ou o token nao bateram com nenhuma loja. Confira se copiou certinho" -ForegroundColor Red
    Write-Host "  (sem espaco extra, sem trocar os dois campos) e tente de novo." -ForegroundColor Red
    Write-Host ""
}

$empresaNome = (Read-Host "Nome da loja para o topo do cupom (ENTER para deixar em branco)").Trim()

Write-Host ""
Write-Host "Impressoras instaladas neste computador:" -ForegroundColor Yellow
$printers = @(Get-Printer | Select-Object -ExpandProperty Name)
$printers | ForEach-Object { Write-Host "  -> $_" }
Write-Host ""
while ($true) {
    $printerName = (Read-Host "Nome exato da impressora termica (ENTER = padrao do sistema)").Trim()
    if (-not $printerName) { break }
    $match = $printers | Where-Object { $_ -ieq $printerName }
    if ($match) { $printerName = $match; break }
    Write-Host "  Nao achei '$printerName' na lista acima. Copie o nome EXATO de uma das linhas," -ForegroundColor Red
    Write-Host "  ou deixe em branco pra usar a impressora padrao do Windows." -ForegroundColor Red
}

Write-Host ""
Write-Host "Tamanho da bobina de papel da impressora termica:" -ForegroundColor Yellow
Write-Host "  1 = 58mm (bobina estreita)"
Write-Host "  2 = 80mm (bobina larga)"
$papelOpc = (Read-Host "Escolha 1 ou 2").Trim()
$tamanhoPapel = if ($papelOpc -eq "1") { "58mm" } else { "80mm" }

$cfg = [PSCustomObject]@{
    supabase_url      = $pub.supabase_url
    supabase_anon_key = $pub.supabase_anon_key
    empresa_id        = $empresaId
    empresa_nome      = $empresaNome
    agent_token       = $agentToken
    printer_name      = $printerName
    tamanho_papel     = $tamanhoPapel
}
$cfg | ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $dir "config.json")
Write-Host ""
Write-Host "Configuracao salva em $dir\config.json" -ForegroundColor Green
