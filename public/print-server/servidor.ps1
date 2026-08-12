# Vellox Print Server - PowerShell (sem Node.js)
$cfgPath = Join-Path $PSScriptRoot "config.json"
if (-not (Test-Path $cfgPath)) { Write-Host "ERRO: config.json nao encontrado." -ForegroundColor Red; Read-Host; exit 1 }
$cfg = Get-Content $cfgPath | ConvertFrom-Json
$supabaseUrl = $cfg.supabase_url
$supabaseKey = $cfg.supabase_anon_key
$empresaId   = $cfg.empresa_id
$empresaNome = $cfg.empresa_nome
$printerName = $cfg.printer_name

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Vellox - Servidor de Impressao" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Empresa  : $empresaNome"
Write-Host "Impressora: $(if ($printerName) { $printerName } else { 'padrao do sistema' })"
Write-Host ""

# Windows raw printing via winspool.drv
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinPrint {
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
"@

function Build-EscPos($p) {
    $b = New-Object System.Collections.Generic.List[byte]
    $W = 32
    function xB { param([byte[]]$v) foreach ($x in $v) { $b.Add($x) } }
    function xT { param([string]$s) foreach ($c in $s.ToCharArray()) { $n=[int][char]$c; $b.Add([byte]$(if($n -lt 256){$n}else{63})) } }
    function xN { param([int]$n=1) for($i=0;$i -lt $n;$i++){$b.Add([byte]10)} }
    function Init  { xB @(27,64) }
    function Bold  { param([bool]$on) xB @(27,69,$(if($on){1}else{0})) }
    function Big   { param([bool]$on) xB @(29,33,$(if($on){17}else{0})) }
    function Align { param([int]$a) xB @(27,97,$a) }
    function Sep   { xT ("-"*$W); xN }
    function Cut   { xB @(29,86,65,5) }
    function Cols  { param([string]$L,[string]$R)
        $sp=$W-$L.Length-$R.Length; xT ($L+$(if($sp -gt 0){" "*$sp}else{" "})+$R); xN }

    $hora = [DateTime]::Parse($p.created_at).ToLocalTime().ToString("HH:mm")
    $data = [DateTime]::Parse($p.created_at).ToLocalTime().ToString("dd/MM/yy")
    $total = [double]$p.valor_pedido + [double]$p.valor_motoboy
    $pgtoMap = @{dinheiro="Dinheiro";cartao_credito="Cartao Credito";cartao_debito="Cartao Debito";pix="PIX";ja_pago="Ja pago"}
    $pgto = if ($pgtoMap.ContainsKey($p.forma_pagamento)) { $pgtoMap[$p.forma_pagamento] } else { "$($p.forma_pagamento)" }
    $now = (Get-Date).ToString("dd/MM/yy HH:mm")

    Init
    Align 1; Big $true; Bold $true
    xT $empresaNome.ToUpper(); xN
    Big $false
    xT "PEDIDO #$($p.id.Substring(0,8).ToUpper())"; xN
    Bold $false; Align 0
    Sep

    $cn = if ($p.cliente_nome.Length -gt 18) { $p.cliente_nome.Substring(0,18) } else { $p.cliente_nome }
    Cols $cn "$hora $data"
    Sep

    Align 1; Bold $true; Big $true
    xT $(if($p.tipo_pedido -eq "entrega"){"ENTREGA"}else{"RETIRADA"}); xN
    Big $false; Bold $false; Align 0
    Sep

    Bold $true; xT "CLIENTE/CELULAR"; xN; Bold $false
    xT "$($p.cliente_nome) - $($p.cliente_telefone)"; xN

    if ($p.tipo_pedido -eq "entrega") {
        Bold $true; xT "ENDERECO:"; xN; Bold $false
        xT "$($p.endereco_entrega)$(if($p.bairro){", $($p.bairro)"})"; xN
    }
    if ($p.observacoes) {
        Bold $true; xT "OBS:"; xN; Bold $false
        xT "$($p.observacoes)"; xN
    }
    Sep

    if ($p.descricao_itens) {
        foreach ($l in ($p.descricao_itens -split "`n")) { if ($l.Trim()) { xT $l.Trim(); xN } }
    }
    Sep

    Cols "SUBTOTAL" "R$ $([double]$p.valor_pedido.ToString("F2").Replace(".",","))"
    if ([double]$p.valor_motoboy -gt 0) { Cols "TAXA ENTREGA" "R$ $([double]$p.valor_motoboy.ToString("F2").Replace(".",","))" }
    Bold $true; Big $true
    Cols "TOTAL" "R$ $($total.ToString("F2").Replace(".",","))"
    Big $false; Bold $false
    Sep

    Bold $true; xT "PAGAMENTO"; xN; Bold $false
    xT "$pgto$(if($p.troco_para){" Troco p/ R$ $([double]$p.troco_para.ToString("F2").Replace(".",","))"}else{""})"; xN
    Sep

    Align 1
    xT "IMPRESSO EM $now"; xN
    Bold $true; xT "appvellox.online"; Bold $false; xN
    xN; xN; xN
    Cut

    return ,$b.ToArray()
}

function Print-Raw { param([byte[]]$bytes)
    $pn = if ($printerName -and $printerName.Trim()) { $printerName } else {
        (Get-WmiObject Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1).Name
    }
    Write-Host "  Imprimindo em: $pn" -ForegroundColor Gray
    $h = [IntPtr]::Zero
    [WinPrint]::OpenPrinter($pn, [ref]$h, [IntPtr]::Zero) | Out-Null
    $di = New-Object WinPrint+DI; $di.n = "Vellox"; $di.t = "RAW"
    [WinPrint]::StartDocPrinter($h, 1, [ref]$di) | Out-Null
    [WinPrint]::StartPagePrinter($h) | Out-Null
    $ptr = [Runtime.InteropServices.Marshal]::AllocCoTaskMem($bytes.Length)
    [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
    $w = 0; [WinPrint]::WritePrinter($h, $ptr, $bytes.Length, [ref]$w) | Out-Null
    [Runtime.InteropServices.Marshal]::FreeCoTaskMem($ptr)
    [WinPrint]::EndPagePrinter($h) | Out-Null
    [WinPrint]::EndDocPrinter($h) | Out-Null
    [WinPrint]::ClosePrinter($h) | Out-Null
    Write-Host "  [OK] $w bytes enviados a impressora!" -ForegroundColor Green
}

# Polling loop (sem WebSocket, usa REST a cada 5s)
$headers = @{ "apikey" = $supabaseKey; "Authorization" = "Bearer $supabaseKey" }
$printed = @{}
$lastCheck = (Get-Date).AddSeconds(-30).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

Write-Host "Aguardando pedidos (verificando a cada 5s)..." -ForegroundColor Green
Write-Host ""

while ($true) {
    $now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    try {
        $uri = "$supabaseUrl/rest/v1/pedidos?empresa_id=eq.$empresaId&status=eq.em_fila&created_at=gt.$lastCheck&select=*"
        $orders = Invoke-RestMethod -Uri $uri -Headers $headers -Method GET -ErrorAction Stop
        foreach ($pedido in $orders) {
            if (-not $printed.ContainsKey($pedido.id)) {
                $printed[$pedido.id] = $true
                $t = (Get-Date).ToString("HH:mm:ss")
                Write-Host "[$t] Novo pedido: #$($pedido.id.Substring(0,8).ToUpper()) - $($pedido.cliente_nome)" -ForegroundColor Yellow
                try {
                    $bytes = Build-EscPos $pedido
                    Print-Raw $bytes
                } catch {
                    Write-Host "  [ERRO impressao] $_" -ForegroundColor Red
                }
            }
        }
    } catch {
        Write-Host "[ERRO conexao $($(Get-Date).ToString('HH:mm:ss'))] $_" -ForegroundColor Red
    }
    $lastCheck = $now
    Start-Sleep -Seconds 5
}
