# Vellox Print Server - PowerShell (sem Node.js)
$Versao = "v5"

# Roda oculto (-WindowStyle Hidden) — sem janela pra ver a tela ou pausar
# num Read-Host, entao tudo vai pro log.txt em vez do console. Reinicia o
# log a cada partida pra nao crescer sem limite (o interessante e sempre o
# mais recente).
$logPath = Join-Path $PSScriptRoot "log.txt"
try { Start-Transcript -Path $logPath -Force | Out-Null } catch {}

$cfgPath = Join-Path $PSScriptRoot "config.json"
if (-not (Test-Path $cfgPath)) { Write-Host "ERRO: config.json nao encontrado." -ForegroundColor Red; exit 1 }
$cfg = Get-Content $cfgPath | ConvertFrom-Json
$supabaseUrl = $cfg.supabase_url
$supabaseKey = $cfg.supabase_anon_key
$empresaId   = if ($cfg.empresa_id)   { $cfg.empresa_id.ToString().Trim() }   else { $null }
$empresaNome = if ($cfg.empresa_nome) { $cfg.empresa_nome.ToString().Trim() } else { "" }
$printerName = $cfg.printer_name
$agentToken  = if ($cfg.agent_token)  { $cfg.agent_token.ToString().Trim() }  else { $null }
$tamanhoPapel = if ($cfg.tamanho_papel) { $cfg.tamanho_papel.ToString().Trim() } else { "80mm" }
# Layout do cupom (classico/moderno/compacto) — ao contrário do resto do
# config.json, este valor NÃO vem do arquivo local: é buscado do banco (ver
# Refresh-Layout mais abaixo), pra poder ser trocado nas Configurações do
# painel sem precisar reinstalar nada no PC. "moderno" é só o valor inicial
# até a primeira busca responder.
$layout = "moderno"

if (-not $empresaId -or $empresaId -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') {
    Write-Host "ERRO: empresa_id ausente ou invalido no config.json." -ForegroundColor Red
    Write-Host "Reinstale em https://www.appvellox.online/print-server/instalar.bat" -ForegroundColor Yellow
    exit 1
}
if (-not $agentToken -or $agentToken.Length -lt 20) {
    Write-Host "ERRO: agent_token ausente ou incompleto no config.json." -ForegroundColor Red
    Write-Host "Reinstale em https://www.appvellox.online/print-server/instalar.bat" -ForegroundColor Yellow
    exit 1
}

# Trava contra instancia duplicada: se duas copias deste script rodarem ao
# mesmo tempo (janela fechada no X sem encerrar direito, teste manual
# enquanto o atalho de inicializacao ja esta rodando, etc.), as duas ficam
# fazendo polling em paralelo e disputando os mesmos pedidos — quem pegar
# primeiro marca auto_printed=true e a outra nunca mais ve aquele pedido, sem
# nenhum erro visivel (foi a causa de "imprime uma vez sim, outra nao"). O
# Mutex garante que so uma instancia por empresa passa daqui — a segunda so
# encerra na hora, antes de abrir porta ou comecar a pollar.
$mutex = New-Object System.Threading.Mutex($false, "VelloxPrintServer_$empresaId")
if (-not $mutex.WaitOne(0)) {
    Write-Host "Ja existe uma instancia do servidor de impressao rodando neste PC para esta empresa." -ForegroundColor Yellow
    Write-Host "Encerrando esta copia pra evitar dois processos disputando os mesmos pedidos." -ForegroundColor Yellow
    try { Stop-Transcript | Out-Null } catch {}
    exit 0
}

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Vellox - Servidor de Impressao" -ForegroundColor Cyan
Write-Host "  Versao $Versao" -ForegroundColor Cyan
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
    $W = if ($tamanhoPapel -eq "58mm") { 32 } else { 48 }
    function xB { param([byte[]]$v) foreach ($x in $v) { $b.Add($x) } }
    function xT { param([string]$s) foreach ($c in $s.ToCharArray()) { $n=[int][char]$c; $b.Add([byte]$(if($n -lt 256){$n}else{63})) } }
    function xN { param([int]$n=1) for($i=0;$i -lt $n;$i++){$b.Add([byte]10)} }
    function Init  { xB @(27,64) }
    function Bold  { param([bool]$on) xB @(27,69,$(if($on){1}else{0})) }
    function Big   { param([bool]$on) xB @(29,33,$(if($on){17}else{0})) }
    function Align { param([int]$a) xB @(27,97,$a) }
    function Sep   { xT ("="*$W); xN }
    function DSep  { xT ("-"*$W); xN }
    function Cut   { xB @(29,86,65,5) }
    function Cols  { param([string]$L,[string]$R)
        $sp=$W-$L.Length-$R.Length; xT ($L+$(if($sp -gt 0){" "*$sp}else{" "})+$R); xN }

    $data = [DateTime]::Parse($p.created_at).ToLocalTime().ToString("dd/MM/yy HH:mm")
    $total = [double]$p.valor_pedido + [double]$p.valor_motoboy
    $pgtoMap = @{dinheiro="Dinheiro";cartao_credito="Cartao de Credito";cartao_debito="Cartao de Debito";pix="PIX";ja_pago="Ja pago"}
    $pgto = if ($pgtoMap.ContainsKey($p.forma_pagamento)) { $pgtoMap[$p.forma_pagamento] } else { "$($p.forma_pagamento)" }
    # Mesma prioridade do cupom "reimprimir" (src/lib/printService.ts, layout moderno):
    # retirada vence, depois já pago, senão delivery.
    $tipo = if ($p.tipo_pedido -eq "retirada") { "RETIRADA" }
            elseif ($p.forma_pagamento -eq "ja_pago") { "JA PAGO" }
            else { "DELIVERY" }

    # ── Layout espelhando o cupom "reimprimir" (formatReceipt) — clássico,
    # moderno ou compacto, o mesmo que a empresa escolheu em Configurações.
    # Tudo em negrito o tempo todo (o HTML de referência usa peso 700 como base
    # em toda parte) — só Big/Align mudam pra marcar ênfase.
    Init
    Bold $true

    if ($layout -eq "classico") {
        $headerText = if ($p.forma_pagamento -eq "ja_pago") { "* JA PAGO *" }
                      elseif ($p.tipo_pedido -eq "retirada") { "-- RETIRADA --" }
                      else { "- DELIVERY -" }

        Align 1; Big $true
        xT $(if ($empresaNome) { $empresaNome.ToUpper() } else { "PEDIDO" }); xN
        Big $false
        xT $data; xN
        Sep

        Big $true
        xT $headerText; xN
        Big $false
        xT "PEDIDO #$($p.id.Substring(0,8).ToUpper())"; xN
        Align 0
        Sep

        xT "CLIENTE"; xN
        Big $true
        xT $p.cliente_nome; xN
        Big $false
        if ($p.cliente_telefone) { xT $p.cliente_telefone; xN }
        Sep

        if ($p.tipo_pedido -eq "entrega") {
            xT "ENDERECO"; xN
            xT "$($p.endereco_entrega)$(if($p.bairro){", $($p.bairro)"})"; xN
        } else {
            Align 1; Big $true
            xT "*** RETIRADA NO LOCAL ***"; xN
            Big $false; Align 0
        }
        Sep

        xT "ITENS"; xN
        if ($p.descricao_itens) {
            foreach ($l in ($p.descricao_itens -split "`n")) { if ($l.Trim()) { xT $l.Trim(); xN } }
        }
        if ($p.observacoes) {
            Sep
            xT "OBS"; xN
            xT $p.observacoes; xN
        }
        Sep

        Cols "Subtotal:" "R$ $(([double]$p.valor_pedido).ToString("F2").Replace(".",","))"
        if ([double]$p.valor_motoboy -gt 0) { Cols "Entrega:" "R$ $(([double]$p.valor_motoboy).ToString("F2").Replace(".",","))" }
        Sep

        Align 1; Big $true
        xT "TOTAL: R$ $($total.ToString("F2").Replace(".",","))"; xN
        Big $false; Align 0
        Sep

        xT "PAGAMENTO"; xN
        Big $true
        xT $pgto; xN
        Big $false
        if ($p.troco_para) { xT "Troco p/ R$ $(([double]$p.troco_para).ToString("F2").Replace(".", ","))"; xN }
        Sep

        Align 1
        xT "appvellox.online"; xN

    } elseif ($layout -eq "compacto") {
        $tag = if ($p.tipo_pedido -eq "retirada") { "[RETIRADA]" }
               elseif ($p.forma_pagamento -eq "ja_pago") { "[JA PAGO]" }
               else { "[DELIVERY]" }

        Align 1; Big $true
        xT $(if ($empresaNome) { $empresaNome.ToUpper() } else { "PEDIDO" }); xN
        Big $false
        xT "$data | #$($p.id.Substring(0,8).ToUpper())"; xN
        Align 0
        DSep

        xT "$tag $($p.cliente_nome)"; xN
        if ($p.cliente_telefone) { xT $p.cliente_telefone; xN }
        if ($p.tipo_pedido -eq "entrega") { xT "$($p.endereco_entrega)$(if($p.bairro){", $($p.bairro)"})"; xN }
        DSep

        if ($p.descricao_itens) {
            foreach ($l in ($p.descricao_itens -split "`n")) { if ($l.Trim()) { xT $l.Trim(); xN } }
        }
        if ($p.observacoes) { xT "Obs: $($p.observacoes)"; xN }
        DSep

        $subLinha = "Sub: R$ $(([double]$p.valor_pedido).ToString("F2").Replace(".",","))"
        if ([double]$p.valor_motoboy -gt 0) { $subLinha += " | Entr: R$ $(([double]$p.valor_motoboy).ToString("F2").Replace(".",","))" }
        xT $subLinha; xN
        Big $true
        xT "TOTAL: R$ $($total.ToString("F2").Replace(".",","))"; xN
        Big $false
        $pgtoLinha = "Pgto: $pgto"
        if ($p.troco_para) { $pgtoLinha += " | Troco p/ R$ $(([double]$p.troco_para).ToString("F2").Replace(".", ","))" }
        xT $pgtoLinha; xN
        DSep

        Align 1
        xT "appvellox.online"; xN

    } else {
        # Moderno (padrão)
        Sep
        Align 1; Big $true
        xT $(if ($empresaNome) { $empresaNome.ToUpper() } else { "PEDIDO" }); xN
        Big $false
        xT $data; xN
        Align 0
        Sep

        Align 1; Big $true
        xT "[ $tipo ]"; xN
        Big $false
        xT "PEDIDO #$($p.id.Substring(0,8).ToUpper())"; xN
        Align 0
        Sep

        Big $true
        xT "> $($p.cliente_nome)"; xN
        Big $false
        if ($p.cliente_telefone) { xT "Tel: $($p.cliente_telefone)"; xN }
        DSep

        if ($p.tipo_pedido -eq "entrega") {
            xT "End: $($p.endereco_entrega)$(if($p.bairro){", $($p.bairro)"})"; xN
        } else {
            Align 1; Big $true
            xT "*** RETIRADA NO LOCAL ***"; xN
            Big $false; Align 0
        }
        Sep

        xT "ITENS"; xN
        if ($p.descricao_itens) {
            foreach ($l in ($p.descricao_itens -split "`n")) { if ($l.Trim()) { xT "- $($l.Trim())"; xN } }
        }
        if ($p.observacoes) {
            DSep
            xT "Obs: $($p.observacoes)"; xN
        }
        Sep

        Cols "Subtotal:" "R$ $(([double]$p.valor_pedido).ToString("F2").Replace(".",","))"
        if ([double]$p.valor_motoboy -gt 0) { Cols "Entrega:" "R$ $(([double]$p.valor_motoboy).ToString("F2").Replace(".",","))" }
        Sep

        Align 1; Big $true
        xT ">> TOTAL: R$ $($total.ToString("F2").Replace(".",",")) <<"; xN
        Big $false; Align 0
        Sep

        Big $true
        xT "Pgto: $pgto"; xN
        Big $false
        if ($p.troco_para) { xT "Troco p/ R$ $(([double]$p.troco_para).ToString("F2").Replace(".", ","))"; xN }
        Sep

        Align 1
        xT "appvellox.online"; xN
    }

    Bold $false
    xN; xN; xN
    Cut

    return ,$b.ToArray()
}

# IMPORTANTE: cada chamada Win32 abaixo retorna $false em caso de erro — isso
# NAO PODE ser descartado com "| Out-Null" como era antes. Um OpenPrinter que
# falha (impressora renomeada/desligada/offline, spooler parado, nome errado
# no config.json) deixava o handle zerado e todas as chamadas seguintes eram
# no-ops silenciosos: o log mostrava "[OK] 0 bytes enviados" (nunca um erro!)
# e o pedido era marcado como impresso (auto_printed=true) — nenhuma outra
# via (RPC, navegador) tentava de novo, e o problema ficava invisivel em
# QUALQUER lugar. Agora cada etapa lanca excecao se falhar, o loop principal
# ja captura isso (Write-Host "[ERRO impressao] ...") e, por lancar ANTES do
# mark_pedido_printed, o pedido continua elegivel pra tentar de novo.
function Print-Raw { param([byte[]]$bytes)
    $pn = if ($printerName -and $printerName.Trim()) { $printerName } else {
        (Get-WmiObject Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1).Name
    }
    if (-not $pn) { throw "Nenhuma impressora encontrada (nome configurado vazio e sem impressora padrao no Windows)." }
    Write-Host "  Imprimindo em: $pn" -ForegroundColor Gray
    $h = [IntPtr]::Zero
    if (-not [WinPrint]::OpenPrinter($pn, [ref]$h, [IntPtr]::Zero)) {
        throw "OpenPrinter falhou para '$pn' (Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())) — confira se o nome bate exatamente com o das Impressoras do Windows."
    }
    try {
        $di = New-Object WinPrint+DI; $di.n = "Vellox"; $di.t = "RAW"
        if ([WinPrint]::StartDocPrinter($h, 1, [ref]$di) -eq 0) {
            throw "StartDocPrinter falhou (Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())) — spooler pode estar parado ou pausado."
        }
        try {
            if (-not [WinPrint]::StartPagePrinter($h)) {
                throw "StartPagePrinter falhou (Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
            }
            $ptr = [Runtime.InteropServices.Marshal]::AllocCoTaskMem($bytes.Length)
            try {
                [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
                $w = 0
                if (-not [WinPrint]::WritePrinter($h, $ptr, $bytes.Length, [ref]$w)) {
                    throw "WritePrinter falhou (Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
                }
                if ($w -ne $bytes.Length) {
                    throw "WritePrinter enviou so $w de $($bytes.Length) bytes."
                }
            } finally {
                [Runtime.InteropServices.Marshal]::FreeCoTaskMem($ptr)
            }
            [WinPrint]::EndPagePrinter($h) | Out-Null
        } finally {
            [WinPrint]::EndDocPrinter($h) | Out-Null
        }
    } finally {
        [WinPrint]::ClosePrinter($h) | Out-Null
    }
    Write-Host "  [OK] $w bytes enviados a impressora!" -ForegroundColor Green
}

# Mini servidor HTTP na porta 7532 — o mesmo endereco que o app Electron
# (Print Agent) usa. O painel web ja verifica esse endereco PRIMEIRO, antes
# de cair no heartbeat via banco (que tem atraso de detecção). Abrindo essa
# porta aqui, o reconhecimento fica instantâneo, igual ao app de verdade.
# So responde "ok" — quem realmente imprime e o loop de polling abaixo.
#
# IMPORTANTE (Private Network Access): o painel roda em HTTPS publico
# (appvellox.online) e faz fetch para http://localhost:7532 — isso NAO e
# bloqueado como "mixed content" (Chrome/Edge tratam localhost como origem
# confiavel desde 2021), MAS o Chrome/Edge tambem exigem, alem do CORS
# normal, que a resposta inclua o header
# "Access-Control-Allow-Private-Network: true" quando um site publico tenta
# acessar um endereco local/privado (Private Network Access). Sem esse
# header o navegador bloqueia a requisicao mesmo com o listener funcionando
# perfeitamente — por isso ele e enviado em toda resposta abaixo.
#
# IMPORTANTE (processo unico, nao Start-Job): o listener roda numa runspace
# DENTRO deste mesmo processo powershell.exe, e nao via Start-Job. Start-Job
# cria um processo powershell.exe SEPARADO — se este script for encerrado de
# forma abrupta (fechar a janela no X, Gerenciador de Tarefas, um crash),
# o bloco "finally" que derruba o job pode nao chegar a rodar, e esse
# processo separado fica "orfao", escutando a porta 7532 pra sempre. Na
# proxima vez que o servidor.ps1 for iniciado, essa instancia fantasma
# responde no lugar da nova, MAS continua rodando o proprio loop de polling
# dela — se ela pegar um pedido primeiro e chamar mark_pedido_printed, a
# instancia visivel nunca mais ve esse pedido (RPC filtra auto_printed=true),
# e a janela fica em silencio total, sem nenhum erro. Usando uma runspace no
# mesmo processo em vez de Start-Job, matar este processo (de qualquer jeito)
# sempre derruba o listener junto — nunca fica zumbi.
$httpListener  = $null
$listenerRs    = $null
$listenerPs    = $null
try {
    $httpListener = New-Object System.Net.HttpListener
    $httpListener.Prefixes.Add("http://localhost:7532/")
    $httpListener.Start()

    $listenerRs = [runspacefactory]::CreateRunspace()
    $listenerRs.Open()
    $listenerPs = [powershell]::Create()
    $listenerPs.Runspace = $listenerRs
    [void]$listenerPs.AddScript({
        param($listener)
        while ($listener.IsListening) {
            try {
                $context = $listener.GetContext()
            } catch {
                # Listener foi parado (Stop()/Close()) — sai do loop de boa.
                break
            }
            $request  = $context.Request
            $response = $context.Response
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
            # Necessario para o Chrome/Edge nao bloquear via Private Network
            # Access (ver comentario acima).
            $response.Headers.Add("Access-Control-Allow-Private-Network", "true")
            $response.ContentType = "application/json"

            $body = '{}'
            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 204
            } elseif ($request.HttpMethod -eq "GET" -and $request.Url.AbsolutePath -eq "/") {
                $body = '{"online":true,"selectedPrinter":null,"realtimeStatus":"SUBSCRIBED","lastError":null}'
            } elseif ($request.HttpMethod -eq "POST" -and $request.Url.AbsolutePath -eq "/print") {
                # O pedido chega e sera impresso pelo loop de polling em ate
                # 5s — so confirma recebido pra o navegador nao tentar imprimir
                # ele mesmo (evita duplicar).
                $body = '{"ok":true}'
            } else {
                $response.StatusCode = 404
            }

            $buffer = [System.Text.Encoding]::UTF8.GetBytes($body)
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            $response.OutputStream.Close()
        }
    }).AddArgument($httpListener)
    [void]$listenerPs.BeginInvoke()

    # Confirmacao ativa de que a porta realmente esta respondendo. Como o
    # listener agora roda na mesma maquina/processo, $httpListener.Start()
    # ja teria lancado excecao se a porta estivesse ocupada ou sem permissao
    # (capturado no catch abaixo) — mas ainda testamos com Invoke-WebRequest
    # de verdade, com varias tentativas curtas, pra ter certeza de que o
    # loop da runspace realmente comecou a aceitar conexoes.
    $portaAtiva = $false
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Milliseconds 200
        try {
            $probe = Invoke-WebRequest -Uri "http://localhost:7532/" -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
            if ($probe.StatusCode -eq 200) { $portaAtiva = $true; break }
        } catch {
            # Ainda nao subiu — tenta de novo ate o limite.
        }
    }

    if ($portaAtiva) {
        Write-Host "Reconhecimento instantaneo ativo (porta 7532)." -ForegroundColor Green
    } else {
        Write-Host "AVISO: a porta 7532 abriu mas nao respondeu a tempo. O reconhecimento vai usar o heartbeat via banco (mais lento, ate 30s)." -ForegroundColor Yellow
        try { $httpListener.Stop(); $httpListener.Close() } catch {}
        try { $listenerPs.Stop(); $listenerPs.Dispose() } catch {}
        try { $listenerRs.Close(); $listenerRs.Dispose() } catch {}
        $httpListener = $null; $listenerPs = $null; $listenerRs = $null
    }
} catch {
    # Mais provavel: porta 7532 ja em uso — inclusive por uma instancia
    # anterior deste mesmo servidor.ps1 que ficou rodando em segundo plano
    # (ex: a janela foi fechada no X em vez de deixar o script terminar
    # sozinho). Veja o comentario grande acima sobre processo unico.
    Write-Host "AVISO: nao foi possivel abrir a porta 7532 (provavelmente ja esta em uso - pode ser uma instancia anterior deste servidor ainda rodando em segundo plano; feche processos powershell.exe antigos no Gerenciador de Tarefas se for o caso). Detalhe: $($_.Exception.Message) O reconhecimento vai usar o heartbeat via banco (mais lento, ate 30s)." -ForegroundColor Yellow
    if ($httpListener) { try { $httpListener.Close() } catch {} }
    $httpListener = $null; $listenerPs = $null; $listenerRs = $null
}
Write-Host ""

# Polling loop (sem WebSocket, usa REST a cada 5s)
# Le os pedidos via RPC (get_pedidos_pendentes_agent) em vez de consultar a
# tabela "pedidos" direto — a RPC valida o agent_token no servidor antes de
# devolver qualquer coisa, sem precisar deixar a tabela de pedidos aberta.
$headers = @{ "apikey" = $supabaseKey; "Authorization" = "Bearer $supabaseKey"; "Content-Type" = "application/json" }
$printed = @{}
$lastCheck = (Get-Date).AddSeconds(-30).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$layoutRefreshAt = Get-Date # busca o layout já na primeira volta do loop

Write-Host "Aguardando pedidos (verificando a cada 5s)..." -ForegroundColor Green
Write-Host ""

try {
while ($true) {
    $now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

    # Heartbeat: avisa o painel web que este servidor está online (aparece
    # no lugar do aviso amarelo "voce esta sem o app de impressao")
    try {
        $pingUri  = "$supabaseUrl/rest/v1/rpc/ping_print_agent"
        $pingBody = @{ p_empresa_id = $empresaId; p_impressora = $printerName; p_tamanho_papel = $tamanhoPapel; p_agent_token = $agentToken } | ConvertTo-Json
        Invoke-RestMethod -Uri $pingUri -Headers $headers -Method POST -Body $pingBody -TimeoutSec 15 -ErrorAction SilentlyContinue | Out-Null
    } catch {}

    # Layout do cupom: busca no banco a cada 60s (não a cada 5s pra não
    # dobrar o tráfego à toa) — assim, trocar o layout nas Configurações do
    # painel reflete aqui sem precisar reiniciar o agente.
    if ((Get-Date) -ge $layoutRefreshAt) {
        try {
            $prefsUri  = "$supabaseUrl/rest/v1/rpc/get_print_agent_prefs"
            $prefsBody = @{ p_empresa_id = $empresaId; p_agent_token = $agentToken } | ConvertTo-Json
            $prefs = Invoke-RestMethod -Uri $prefsUri -Headers $headers -Method POST -Body $prefsBody -TimeoutSec 15 -ErrorAction Stop
            if ($prefs -and $prefs.Count -gt 0 -and $prefs[0].layout) { $layout = $prefs[0].layout }
        } catch {}
        $layoutRefreshAt = (Get-Date).AddSeconds(60)
    }

    try {
        $rpcUri = "$supabaseUrl/rest/v1/rpc/get_pedidos_pendentes_agent"
        $body = @{ p_empresa_id = $empresaId; p_agent_token = $agentToken; p_desde = $lastCheck } | ConvertTo-Json
        $orders = Invoke-RestMethod -Uri $rpcUri -Headers $headers -Method POST -Body $body -TimeoutSec 15 -ErrorAction Stop
        foreach ($pedido in $orders) {
            if (-not $printed.ContainsKey($pedido.id)) {
                $t = (Get-Date).ToString("HH:mm:ss")
                Write-Host "[$t] Novo pedido: #$($pedido.id.Substring(0,8).ToUpper()) - $($pedido.cliente_nome)" -ForegroundColor Yellow
                try {
                    $bytes = Build-EscPos $pedido
                    Print-Raw $bytes
                    # So marca como "ja visto" DEPOIS de imprimir com sucesso — se
                    # Print-Raw lancar erro, nao marca aqui, e o pedido continua
                    # elegivel (auto_printed ainda false no banco) pra tentar de
                    # novo no proximo ciclo de 5s, em vez de ficar "esquecido" so
                    # porque essa tentativa falhou.
                    $printed[$pedido.id] = $true
                    # Marca no banco que este pedido ja foi impresso (auto_printed=true).
                    # Isso faz o painel web (PrintListener) pular o fallback via
                    # navegador para este pedido caso ele ainda nao tenha rodado,
                    # evitando imprimir o mesmo pedido duas vezes.
                    try {
                        $markUri  = "$supabaseUrl/rest/v1/rpc/mark_pedido_printed"
                        $markBody = @{ p_pedido_id = $pedido.id; p_empresa_id = $empresaId; p_auto = $true } | ConvertTo-Json
                        Invoke-RestMethod -Uri $markUri -Headers $headers -Method POST -Body $markBody -TimeoutSec 15 -ErrorAction SilentlyContinue | Out-Null
                    } catch {}
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
} finally {
    if ($httpListener) { try { $httpListener.Stop(); $httpListener.Close() } catch {} }
    if ($listenerPs)   { try { $listenerPs.Stop(); $listenerPs.Dispose() } catch {} }
    if ($listenerRs)   { try { $listenerRs.Close(); $listenerRs.Dispose() } catch {} }
    try { $mutex.ReleaseMutex(); $mutex.Dispose() } catch {}
    try { Stop-Transcript | Out-Null } catch {}
}
