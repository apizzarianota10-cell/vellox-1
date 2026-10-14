# Vellox Print Server - Configuracao
$Versao = "v4"
# "Continue" de proposito: com "Stop" global, qualquer comando opcional que
# falhasse (ex: Get-Printer sem o modulo PrintManagement, spooler parado)
# derrubava o script inteiro e o config.json nunca era salvo.
$ErrorActionPreference = "Continue"
# Windows PowerShell 5.1 pode vir sem TLS 1.2 habilitado, e o site/Supabase
# so aceitam TLS 1.2+ ("Nao foi possivel criar um canal seguro SSL/TLS").
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072 } catch {}

$dir = "C:\VelloxPrint"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

function Sair([string]$msg) {
    Write-Host ""
    Write-Host $msg -ForegroundColor Red
    Read-Host "Pressione ENTER para sair"
    exit 1
}

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Vellox - Configuracao da impressora" -ForegroundColor Cyan
Write-Host "  Versao $Versao" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# -- 1. Config publica (URL/chave publica do Supabase) ---------------------
$pub = $null
for ($i = 1; $i -le 3 -and -not $pub; $i++) {
    try {
        $pub = Invoke-RestMethod -Uri "https://www.appvellox.online/api/print-server/public-config" -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop
    } catch {
        if ($i -lt 3) { Start-Sleep -Seconds 2 }
    }
}
if (-not $pub -or -not $pub.supabase_url -or -not $pub.supabase_anon_key) {
    Sair "ERRO: nao consegui falar com o servidor Vellox. Confira a internet deste computador e rode o instalador de novo."
}

# Mesma RPC que o servidor.ps1 usa. Devolve a linha da loja se o par
# ID+token bater, $null se o servidor respondeu que nao bate, ou "REDE" se
# nem conseguiu perguntar (internet caiu, timeout) - sao erros diferentes pro
# usuario e nao podem virar a mesma mensagem.
function Get-Prefs([string]$empId, [string]$token) {
    $uri  = "$($pub.supabase_url)/rest/v1/rpc/get_print_agent_prefs"
    $hdrs = @{ "apikey" = $pub.supabase_anon_key; "Authorization" = "Bearer $($pub.supabase_anon_key)"; "Content-Type" = "application/json" }
    $body = @{ p_empresa_id = $empId; p_agent_token = $token } | ConvertTo-Json
    for ($i = 1; $i -le 3; $i++) {
        try {
            $resp = @(Invoke-RestMethod -Uri $uri -Headers $hdrs -Method POST -Body $body -TimeoutSec 15 -ErrorAction Stop)
            if ($resp.Count -gt 0 -and $resp[0]) { return $resp[0] }
            return $null
        } catch {
            if ($i -lt 3) { Start-Sleep -Seconds 2 }
        }
    }
    return "REDE"
}

function Avisa-Rede {
    Write-Host " sem resposta do servidor." -ForegroundColor Red
    Write-Host "  Confira a internet deste computador." -ForegroundColor Red
    $r = Read-Host "ENTER para tentar de novo, ou digite 'sair'"
    if ($r -match '^\s*(sair|cancelar)\s*$') { Sair "Instalacao cancelada." }
}

# -- 2. Credenciais --------------------------------------------------------
$uuidRe  = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
# Token novo e hex; lojas antigas podem ainda ter token no formato JWT (a.b.c).
$tokenRe = '[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|[0-9a-fA-F]{32,64}'
$empresaId = $null; $agentToken = $null; $prefs = $null

# O instalador baixado do painel ja vem com as credenciais da loja (variaveis
# definidas no topo do .bat) - nesse caso nao precisa copiar/colar nada.
$envId  = if ($env:VELLOX_EMPRESA_ID)  { $env:VELLOX_EMPRESA_ID.Trim() }  else { "" }
$envTok = if ($env:VELLOX_AGENT_TOKEN) { $env:VELLOX_AGENT_TOKEN.Trim() } else { "" }
if ($envId -match "^$uuidRe$" -and $envTok -match "^($tokenRe)$") {
    while ($true) {
        Write-Host "Conectando a sua loja..." -ForegroundColor Yellow -NoNewline
        $prefs = Get-Prefs $envId $envTok
        if ($prefs -is [string]) { Avisa-Rede; continue }
        break
    }
    if ($prefs) {
        $empresaId = $envId; $agentToken = $envTok
        Write-Host " OK!" -ForegroundColor Green
    } else {
        Write-Host " nao bateu." -ForegroundColor Yellow
        Write-Host "  O token foi trocado no painel depois que esse instalador foi baixado." -ForegroundColor Yellow
        Write-Host "  Vamos pegar as credenciais na mao (ou baixe o instalador de novo)." -ForegroundColor Yellow
        Write-Host ""
    }
}

function Read-Extrai([string]$label, [string]$regex, [string]$dica) {
    while ($true) {
        $raw = Read-Host $label
        if ($raw -match '^\s*(sair|cancelar)\s*$') { Sair "Instalacao cancelada." }
        $m = [regex]::Match([string]$raw, $regex)
        if ($m.Success) { return $m.Value }
        Write-Host "  Nao reconheci. $dica (ou digite 'sair')" -ForegroundColor Red
    }
}

if (-not $empresaId) {
    Write-Host "Abrindo a pagina de credenciais no navegador..." -ForegroundColor Yellow
    Write-Host "  Painel Vellox > Automacoes > Impressao > 'Credenciais do servidor de impressao'"
    Write-Host "  (dica: o botao 'Baixar instalador' dessa tela ja vem configurado e pula esta etapa)"
    Write-Host ""
    Start-Process "https://www.appvellox.online/automacoes/impressao"
    while (-not $empresaId) {
        $id  = Read-Extrai "Cole o ID da empresa" $uuidRe "O ID tem o formato 1a2b3c4d-5e6f-7890-abcd-ef1234567890."
        $tok = Read-Extrai "Cole o token do agente" $tokenRe "O token e uma sequencia de letras e numeros, sem espacos."
        Write-Host "Validando..." -ForegroundColor Yellow -NoNewline
        $prefs = Get-Prefs $id $tok
        if ($prefs -is [string]) { Avisa-Rede; continue }
        if ($prefs) {
            $empresaId = $id; $agentToken = $tok
            Write-Host " OK!" -ForegroundColor Green
        } else {
            Write-Host " nao bateu com nenhuma loja." -ForegroundColor Red
            Write-Host "  Confira se nao trocou os dois campos e tente de novo (ou digite 'sair')." -ForegroundColor Red
            Write-Host ""
        }
    }
}

$empresaNome = if ($prefs.empresa_nome) { ([string]$prefs.empresa_nome).Trim() } else { "" }
if ($empresaNome) { Write-Host "Loja: $empresaNome" -ForegroundColor Green }
Write-Host ""

# -- 3. Impressora ---------------------------------------------------------
# Win32_Printer funciona em qualquer Windows; Get-Printer depende do modulo
# PrintManagement (ausente em algumas edicoes) e e so o ultimo recurso.
function Get-Impressoras {
    $itens = $null
    try { $itens = @(Get-CimInstance Win32_Printer -ErrorAction Stop) } catch {}
    if (-not $itens -or $itens.Count -eq 0) { try { $itens = @(Get-WmiObject Win32_Printer -ErrorAction Stop) } catch {} }
    $res = @()
    if ($itens) {
        foreach ($p in $itens) { if ($p.Name) { $res += [PSCustomObject]@{ Nome = [string]$p.Name; Padrao = [bool]$p.Default } } }
    }
    if ($res.Count -eq 0) {
        try { foreach ($p in @(Get-Printer -ErrorAction Stop)) { $res += [PSCustomObject]@{ Nome = [string]$p.Name; Padrao = $false } } } catch {}
    }
    return ,$res
}

$virtualRe = '(?i)pdf|xps|onenote|fax|anydesk|send to|enviar para|document writer|redirect|remot'
$termicaRe = '(?i)pos|termic|thermal|recibo|receipt|cupom|58|80|tm-|epson|elgin|bematech|daruma|tanca|knup|gertec|sweda|xprinter|jetway|control ?id|generic|text only'

# Impressao RAW (mesmo caminho do servidor.ps1) - testar por aqui garante que
# o nome escolhido funciona de verdade antes de salvar.
$script:podeTestar = $true
try { Add-Type -ErrorAction Stop -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinPrintCfg {
    [DllImport("winspool.drv",CharSet=CharSet.Unicode)]
    public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr p);
    [DllImport("winspool.drv")]
    public static extern bool ClosePrinter(IntPtr h);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
    public struct DI { public string n; public string o; public string t; }
    [DllImport("winspool.drv",CharSet=CharSet.Unicode)]
    public static extern int StartDocPrinter(IntPtr h, int l, ref DI d);
    [DllImport("winspool.drv")]
    public static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv")]
    public static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv")]
    public static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv")]
    public static extern bool WritePrinter(IntPtr h, IntPtr b, int c, out int w);
}
"@ } catch { $script:podeTestar = $false }

# Devolve "" se imprimiu, "PULAR" se nao da pra testar neste PC, ou a mensagem de erro.
function Teste-Impressao([string]$nome) {
    if (-not $script:podeTestar) { return "PULAR" }
    $txt = "VELLOX`nTeste de impressao OK`n$empresaNome`n$(Get-Date -Format 'dd/MM/yyyy HH:mm')`n"
    $bytes = New-Object System.Collections.Generic.List[byte]
    foreach ($x in @(27,64,27,97,1)) { $bytes.Add([byte]$x) }
    foreach ($c in $txt.ToCharArray()) { $n = [int]$c; $bytes.Add([byte]$(if ($n -lt 128) { $n } else { 63 })) }
    foreach ($x in @(27,100,4,29,86,66,0)) { $bytes.Add([byte]$x) }
    $arr = $bytes.ToArray()
    $h = [IntPtr]::Zero
    if (-not [WinPrintCfg]::OpenPrinter($nome, [ref]$h, [IntPtr]::Zero)) { return "nao consegui abrir a impressora '$nome'." }
    try {
        $di = New-Object WinPrintCfg+DI; $di.n = "Vellox teste"; $di.t = "RAW"
        if ([WinPrintCfg]::StartDocPrinter($h, 1, [ref]$di) -eq 0) { return "o spooler do Windows recusou o trabalho (impressora pausada/offline?)." }
        try {
            [void][WinPrintCfg]::StartPagePrinter($h)
            $ptr = [Runtime.InteropServices.Marshal]::AllocCoTaskMem($arr.Length)
            try {
                [Runtime.InteropServices.Marshal]::Copy($arr, 0, $ptr, $arr.Length)
                $w = 0
                if (-not [WinPrintCfg]::WritePrinter($h, $ptr, $arr.Length, [ref]$w)) { return "falha ao enviar dados pra impressora." }
            } finally { [Runtime.InteropServices.Marshal]::FreeCoTaskMem($ptr) }
            [void][WinPrintCfg]::EndPagePrinter($h)
        } finally { [void][WinPrintCfg]::EndDocPrinter($h) }
    } finally { [void][WinPrintCfg]::ClosePrinter($h) }
    return ""
}

$printerName = ""
while ($true) {
    $todas = Get-Impressoras
    $reais = @($todas | Where-Object { $_.Nome -notmatch $virtualRe })
    $lista = @($reais | Where-Object { $_.Nome -match $termicaRe }) + @($reais | Where-Object { $_.Nome -notmatch $termicaRe })

    if ($lista.Count -eq 0) {
        Write-Host "Nenhuma impressora encontrada neste computador." -ForegroundColor Red
        Write-Host "  Ligue a impressora termica no USB e instale o driver dela (o CD/site do fabricante)."
        $r = (Read-Host "ENTER para procurar de novo, ou P para continuar sem impressora").Trim()
        if ($r -match '^[pP]$') { $printerName = ""; break }
        continue
    }

    $sugerida = $lista | Where-Object { $_.Nome -match $termicaRe } | Select-Object -First 1
    if (-not $sugerida) { $sugerida = $lista | Where-Object { $_.Padrao } | Select-Object -First 1 }
    if (-not $sugerida) { $sugerida = $lista[0] }
    $idxSug = [array]::IndexOf(@($lista | ForEach-Object { $_.Nome }), $sugerida.Nome) + 1

    Write-Host "Impressoras encontradas:" -ForegroundColor Yellow
    for ($i = 0; $i -lt $lista.Count; $i++) {
        $tags = @()
        if ($lista[$i].Nome -eq $sugerida.Nome) { $tags += "sugerida" }
        if ($lista[$i].Padrao) { $tags += "padrao do Windows" }
        $sufixo = if ($tags.Count -gt 0) { "  <- " + ($tags -join ", ") } else { "" }
        Write-Host ("  [{0}] {1}{2}" -f ($i + 1), $lista[$i].Nome, $sufixo)
    }
    Write-Host ""
    $esc = (Read-Host "Numero da impressora TERMICA (so ENTER = [$idxSug])").Trim()

    $escolhida = $null
    if (-not $esc) { $escolhida = $sugerida.Nome }
    elseif ($esc -match '^\d+$' -and [int]$esc -ge 1 -and [int]$esc -le $lista.Count) { $escolhida = $lista[[int]$esc - 1].Nome }
    else {
        $m = $todas | Where-Object { $_.Nome -ieq $esc } | Select-Object -First 1
        if ($m) { $escolhida = $m.Nome }
    }
    if (-not $escolhida) { Write-Host "  Opcao invalida, digite o numero da lista." -ForegroundColor Red; Write-Host ""; continue }

    Write-Host "Imprimindo cupom de teste em '$escolhida'..." -ForegroundColor Yellow
    $erro = Teste-Impressao $escolhida
    if ($erro -eq "PULAR") {
        Write-Host "  (nao deu pra testar daqui - antivirus/politica bloqueou. Teste pelo painel depois.)" -ForegroundColor Yellow
        $printerName = $escolhida
        break
    }
    if ($erro) {
        Write-Host "  Nao imprimiu: $erro" -ForegroundColor Red
        Write-Host "  Confira se a impressora esta ligada, com papel e cabo conectado." -ForegroundColor Red
        $r = (Read-Host "ENTER para escolher de novo, ou U para usar essa mesmo assim").Trim()
        if ($r -match '^[uU]$') { $printerName = $escolhida; break }
        Write-Host ""
        continue
    }
    $ok = (Read-Host "Saiu um cupom 'Teste de impressao OK'? (S/n)").Trim()
    if ($ok -match '^[nN]') { Write-Host "  Entao vamos tentar outra impressora." -ForegroundColor Yellow; Write-Host ""; continue }
    $printerName = $escolhida
    break
}

# -- 4. Papel --------------------------------------------------------------
$papelPadrao = if ($printerName -match '58') { "58mm" } elseif ($prefs.tamanho_papel) { [string]$prefs.tamanho_papel } else { "80mm" }
Write-Host ""
Write-Host "Largura da bobina: 1 = 58mm (estreita)  2 = 80mm (larga)" -ForegroundColor Yellow
$papelOpc = (Read-Host "Escolha 1 ou 2 (so ENTER = $papelPadrao)").Trim()
$tamanhoPapel = if ($papelOpc -eq "1") { "58mm" } elseif ($papelOpc -eq "2") { "80mm" } else { $papelPadrao }

# -- 5. Salva --------------------------------------------------------------
$cfg = [PSCustomObject]@{
    supabase_url      = $pub.supabase_url
    supabase_anon_key = $pub.supabase_anon_key
    empresa_id        = $empresaId
    empresa_nome      = $empresaNome
    agent_token       = $agentToken
    printer_name      = $printerName
    tamanho_papel     = $tamanhoPapel
}
try {
    $cfg | ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $dir "config.json") -ErrorAction Stop
} catch {
    Sair "ERRO: nao consegui salvar $dir\config.json ($($_.Exception.Message))."
}
Write-Host ""
Write-Host "Configuracao salva!" -ForegroundColor Green
exit 0
