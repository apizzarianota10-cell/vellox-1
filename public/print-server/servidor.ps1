# Vellox Print Server - PowerShell (sem Node.js)
$Versao = "v14"

# Impressora termica usa a propria codepage (normalmente CP850/CP860), que
# NAO bate com os bytes que [int][char] produz pra acentos - "O" (211)
# por exemplo sai como "a" (ordinal feminino) em vez de "O" na pagina de
# codigo real da impressora, e caracteres tipograficos (travessao —) saiam
# como "?". Em vez de apostar na codepage certa pra cada impressora, troca
# acento/pontuacao especial pelo equivalente ASCII antes de imprimir -
# funciona igual em qualquer impressora, nao fica refem de configuracao.
$script:AccentMap = @{
    [char]0x00E1='a'; [char]0x00E0='a'; [char]0x00E2='a'; [char]0x00E3='a'; [char]0x00E4='a'
    [char]0x00C1='A'; [char]0x00C0='A'; [char]0x00C2='A'; [char]0x00C3='A'; [char]0x00C4='A'
    [char]0x00E9='e'; [char]0x00E8='e'; [char]0x00EA='e'; [char]0x00EB='e'
    [char]0x00C9='E'; [char]0x00C8='E'; [char]0x00CA='E'; [char]0x00CB='E'
    [char]0x00ED='i'; [char]0x00EC='i'; [char]0x00EE='i'; [char]0x00EF='i'
    [char]0x00CD='I'; [char]0x00CC='I'; [char]0x00CE='I'; [char]0x00CF='I'
    [char]0x00F3='o'; [char]0x00F2='o'; [char]0x00F4='o'; [char]0x00F5='o'; [char]0x00F6='o'
    [char]0x00D3='O'; [char]0x00D2='O'; [char]0x00D4='O'; [char]0x00D5='O'; [char]0x00D6='O'
    [char]0x00FA='u'; [char]0x00F9='u'; [char]0x00FB='u'; [char]0x00FC='u'
    [char]0x00DA='U'; [char]0x00D9='U'; [char]0x00DB='U'; [char]0x00DC='U'
    [char]0x00E7='c'; [char]0x00C7='C'; [char]0x00F1='n'; [char]0x00D1='N'
    [char]0x2014='-'; [char]0x2013='-'; [char]0x2018="'"; [char]0x2019="'"
    [char]0x201C='"'; [char]0x201D='"'; [char]0x2026='...'
    [char]0x00B7='.'; [char]0x2022='-'; [char]0x00BA='o'; [char]0x00AA='a'; [char]0x00B0='o'
}

# Roda oculto (-WindowStyle Hidden) — sem janela pra ver a tela ou pausar
# num Read-Host, entao tudo vai pro log.txt em vez do console. Reinicia o
# log a cada partida pra nao crescer sem limite (o interessante e sempre o
# mais recente).
$logPath = Join-Path $PSScriptRoot "log.txt"
try { Start-Transcript -Path $logPath -Force | Out-Null } catch {}
# TLS 1.2 - Windows PowerShell 5.1 nem sempre liga sozinho e o site so aceita 1.2+.
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072 } catch {}

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
# Tamanho da letra do cupom inteiro - normal/grande/extra_grande.
# Mesma lógica do $layout: vem do banco, não do config.json.
$fonte = "grande"

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
    # Um tamanho so pro cupom inteiro (configuracoes_print_agent.fonte):
    # normal = Fonte A 1x; grande = Fonte B (9 pontos de largura) em 2x2 - letra
    # mais alta e proporcional, sem esticar, com 2/3 das colunas; extra_grande =
    # Fonte A 2x2 (metade das colunas). Altura dupla sozinha (GS ! 1) esticava a
    # letra e ficava feia. $esp = ESC 3 (espaco entre linhas) proporcional a
    # altura. Toda quebra/separador/coluna usa o $W efetivo, entao nenhuma
    # linha passa da largura e a impressora nunca corta no meio.
    $base = if ($tamanhoPapel -eq "58mm") { 32 } else { 48 }
    $fontB = if ($fonte -eq "grande") { 1 } else { 0 }
    $tam = if ($fonte -eq "normal") { 0 } else { 17 }
    $esp = if ($fonte -eq "grande") { 44 } elseif ($fonte -eq "extra_grande") { 60 } else { 0 }
    $W = if ($fonte -eq "grande") { [int][Math]::Floor($base * 2 / 3) } elseif ($fonte -eq "extra_grande") { [int]($base / 2) } else { [int]$base }
    function xB { param([byte[]]$v) foreach ($x in $v) { $b.Add($x) } }
    function xT { param([string]$s)
        foreach ($c in $s.ToCharArray()) {
            if ($script:AccentMap.ContainsKey($c)) {
                foreach ($mc in $script:AccentMap[$c].ToCharArray()) { $b.Add([byte][int]$mc) }
                continue
            }
            $n=[int][char]$c
            $b.Add([byte]$(if($n -lt 128){$n}else{63}))
        }
    }
    function xN { param([int]$n=1) for($i=0;$i -lt $n;$i++){$b.Add([byte]10)} }
    # ESC @ zera fonte/tamanho/espacamento - tudo e reaplicado logo depois.
    function Init  { xB @(27,64); xB @(27,77,$fontB); xB @(29,33,$tam); if ($esp -gt 0) { xB @(27,51,$esp) } }
    function Bold  { param([bool]$on) xB @(27,69,$(if($on){1}else{0})) }
    function Align { param([int]$a) xB @(27,97,$a) }
    function Sep   { xT ("="*$W); xN }
    function DSep  { xT ("-"*$W); xN }
    function Cut   { xB @(29,86,65,5) }
    # Comprimento ja com acento trocado (o "..." vira 3 colunas).
    function Len { param([string]$s)
        $n = 0
        foreach ($c in $s.ToCharArray()) { if ($script:AccentMap.ContainsKey($c)) { $n += $script:AccentMap[$c].Length } else { $n++ } }
        return $n
    }
    function Plain { param([string]$s)
        $sb = New-Object System.Text.StringBuilder
        foreach ($c in $s.ToCharArray()) { if ($script:AccentMap.ContainsKey($c)) { [void]$sb.Append($script:AccentMap[$c]) } else { [void]$sb.Append($c) } }
        return $sb.ToString()
    }
    # Word-wrap com recuo: 1a linha com $pref, continuacoes com $cont. So
    # corta no meio da palavra se ela sozinha nao cabe na linha.
    function WrapLinhas { param([string]$s, [string]$pref, [string]$cont)
        $out = New-Object System.Collections.Generic.List[string]
        $linha = (Plain $s).Trim()
        $p0 = $pref
        while ($true) {
            $cols = [Math]::Max($W - $p0.Length, 4)
            if ($linha.Length -le $cols) { break }
            $corte = $linha.Substring(0, $cols + 1).LastIndexOf(' ')
            if ($corte -lt 1) { $corte = $cols }
            $out.Add($p0 + $linha.Substring(0, $corte).TrimEnd())
            $linha = $linha.Substring($corte).TrimStart()
            $p0 = $cont
        }
        $out.Add($p0 + $linha)
        return ,$out
    }
    function xWrapPref { param([string]$s, [string]$pref, [string]$cont)
        foreach ($l in (WrapLinhas $s $pref $cont)) { xT $l; xN }
    }
    function xWrap { param([string]$s) xWrapPref $s "" "" }
    # Primeira variante que cabe inteira numa linha; senao quebra a ultima.
    function xFit { param([string[]]$opcoes)
        foreach ($o in $opcoes) { if ((Len $o) -le $W) { xT $o; xN; return } }
        xWrap $opcoes[-1]
    }
    # Separador com titulo centralizado: "------ ITENS ------".
    function Titulo { param([string]$t, [string]$ch = "-")
        $s = " $t "
        if ($s.Length -ge $W) { xFit @($t); return }
        $esq = [int][Math]::Floor(($W - $s.Length) / 2)
        xT (($ch * $esq) + $s + ($ch * ($W - $s.Length - $esq))); xN
    }
    # Valor alinhado a direita na ultima linha do rotulo (quebrado por palavra);
    # se nao couber ali, vai sozinho pra linha de baixo.
    function Cols  { param([string]$L,[string]$R)
        $ls = WrapLinhas $L "" ""
        $R = Plain $R
        for ($i = 0; $i -lt $ls.Count - 1; $i++) { xT $ls[$i]; xN }
        $ult = $ls[$ls.Count - 1]
        $sp = $W - $ult.Length - $R.Length
        if ($sp -ge 1) {
            xT ($ult + (" " * $sp) + $R); xN
        } else {
            xT $ult; xN
            $pad = $W - $R.Length
            if ($pad -ge 0) { xT ((" " * $pad) + $R); xN } else { xWrap $R }
        }
    }
    # Duas partes juntas com " | " se couber, senao uma por linha.
    function xPar { param([string]$a, [string]$c)
        if (-not $c) { xWrap $a; return }
        $j = "$a | $c"
        if ((Len $j) -le $W) { xT $j; xN } else { xWrap $a; xWrap $c }
    }

    # Mesmas regras de src/lib/escpos.ts (parseItemLine) - manter os dois iguais.
    # "/" so separa sabores quando colado em letra dos dois lados: "Frango c/
    # Catupiry", "s/ cebola", "1/2" e "c/Catupiry" (abreviacao de uma letra)
    # ficam inteiros - o catalogo junta os sabores com "/" sem espaco.
    function SplitSabores { param([string]$seg)
        $out = New-Object System.Collections.Generic.List[string]
        $sb = New-Object System.Text.StringBuilder
        for ($i = 0; $i -lt $seg.Length; $i++) {
            $ch = $seg[$i]
            if ($ch -eq '/') {
                $prev = if ($i -gt 0) { $seg[$i-1] } else { [char]' ' }
                $next = if ($i + 1 -lt $seg.Length) { $seg[$i+1] } else { [char]' ' }
                $abrev = [char]::IsLetter($prev) -and ($i -lt 2 -or [char]::IsWhiteSpace($seg[$i-2]))
                $corta = (-not [char]::IsWhiteSpace($prev)) -and (-not [char]::IsWhiteSpace($next)) -and (-not ([char]::IsDigit($prev) -and [char]::IsDigit($next))) -and (-not $abrev)
                if ($corta) { $out.Add($sb.ToString()); [void]$sb.Clear(); continue }
            }
            [void]$sb.Append($ch)
        }
        $out.Add($sb.ToString())
        # Sem a virgula de proposito: quem chama embrulha em @(), e ",@()" aqui
        # viraria array dentro de array.
        return @($out | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }
    # O bloco de detalhes e o ULTIMO "(...)" da linha, casado parentese a
    # parentese - assim "Pizza (G) (Grande . Calabresa/Mussarela)" mantem o
    # "(G)" no nome e um sabor "Calabresa (sem cebola)" nao quebra nada.
    function SeparaDetalhes { param([string]$s)
        if (-not $s.EndsWith(")")) { return @($s, "") }
        $depth = 0
        for ($i = $s.Length - 1; $i -ge 0; $i--) {
            if ($s[$i] -eq ')') { $depth++ }
            elseif ($s[$i] -eq '(') {
                $depth--
                if ($depth -eq 0) {
                    if ($i -gt 0 -and $s[$i-1] -eq ' ') { return @($s.Substring(0, $i).TrimEnd(), $s.Substring($i + 1, $s.Length - $i - 2)) }
                    break
                }
            }
        }
        return @($s, "")
    }
    # "Nx Nome (variacao . Sabor1/Sabor2 . + adicional, adicional) - R$valor"
    # (travessao e ponto medio via \u2014/\u00B7, nao literais: o instalador
    # baixa este .ps1 sem BOM e o PowerShell 5.1 le como ANSI). Cada parte do
    # parentese e opcional: com variacao + sabores, os sabores sao o 2o segmento
    # que nao comeca com "+ "; sozinho, so e sabor se tiver "/".
    function ParseItem { param([string]$line)
        if ($line -notmatch '^(\d+)\s*x\s+(.+?)\s+\u2014\s+R\$\s*([\d.,]+)$') { return $null }
        $qtd = $Matches[1]; $preco = $Matches[3]
        $sep = SeparaDetalhes $Matches[2]
        $nome = $sep[0]
        $segs = @()
        if ($sep[1]) { $segs = @($sep[1] -split ' \u00B7 ' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
        $adic = @(); $outros = @()
        foreach ($s in $segs) {
            if ($s.StartsWith("+ ")) { $adic += @($s.Substring(2) -split ', ' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
            else { $outros += $s }
        }
        $sabores = @(); $detalhes = @($outros)
        if ($outros.Count -ge 2) {
            $sabores = @(SplitSabores $outros[1])
            $detalhes = @($outros[0]) + @($outros | Select-Object -Skip 2)
        } elseif ($outros.Count -eq 1) {
            $pt = @(SplitSabores $outros[0])
            if ($pt.Count -ge 2) { $sabores = $pt; $detalhes = @() }
        }
        return @{ qtd = $qtd; nome = $nome; preco = $preco; detalhes = $detalhes; sabores = $sabores; adicionais = $adic; pizza = ($nome -match 'pizza|brotinho') }
    }

    # Cada item vira um bloco: nome+preco (preco a direita quando cabe, senao
    # na linha de baixo), variacao recuada, bloco de sabores com titulo
    # ("MEIO A MEIO:" + "1/2 Sabor" em pizza; "N SABORES:" numerado no resto) e
    # adicionais um por linha com "+ ". Continuacao recuada sob o texto, pra
    # uma quebra de linha nunca parecer outro sabor.
    function ItemBlock { param([string]$line)
        $it = ParseItem $line
        if (-not $it) { xWrap $line; return }
        Cols "$($it.qtd)x $($it.nome)" ("R$" + $it.preco)
        foreach ($d in @($it.detalhes)) { xWrapPref $d "  " "  " }
        $n = @($it.sabores).Count
        if ($n -ge 1) {
            $tit = if ($n -eq 1) { "SABOR:" } elseif ($it.pizza -and $n -eq 2) { "MEIO A MEIO:" } else { "$n SABORES:" }
            xWrapPref $tit "  " "  "
            for ($j = 0; $j -lt $n; $j++) {
                $pref = if ($n -eq 1) { "  - " } elseif ($it.pizza) { "  1/$n " } else { "  $($j + 1). " }
                xWrapPref $it.sabores[$j] $pref (" " * $pref.Length)
            }
        }
        foreach ($a in @($it.adicionais)) { xWrapPref $a "  + " "    " }
    }

    # Uma linha em branco entre itens, menos no compacto.
    function ItemsSection { param([string]$descricaoItens)
        if (-not $descricaoItens) { return }
        $linhas = @($descricaoItens -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        for ($i = 0; $i -lt $linhas.Count; $i++) {
            ItemBlock $linhas[$i]
            if ($layout -ne "compacto" -and $i -lt $linhas.Count - 1) { xN }
        }
    }

    function Rs { param($v) "R$ " + ([double]$v).ToString("F2").Replace(".",",") }

    $data = [DateTime]::Parse($p.created_at).ToLocalTime().ToString("dd/MM/yy HH:mm")
    $total = [double]$p.valor_pedido + [double]$p.valor_motoboy
    $pgtoMap = @{dinheiro="Dinheiro";cartao_credito="Cartao de Credito";cartao_debito="Cartao de Debito";pix="PIX";ja_pago="Ja pago"}
    $pgto = if ($pgtoMap.ContainsKey($p.forma_pagamento)) { $pgtoMap[$p.forma_pagamento] } else { "$($p.forma_pagamento)" }
    # Mesma prioridade do cupom "reimprimir" (src/lib/printService.ts):
    # retirada vence, depois ja pago, senao delivery.
    $tipo = if ($p.tipo_pedido -eq "retirada") { "RETIRADA" }
            elseif ($p.forma_pagamento -eq "ja_pago") { "JA PAGO" }
            else { "DELIVERY" }
    $loja = if ($empresaNome) { $empresaNome.ToUpper() } else { "PEDIDO" }
    $numero = "PEDIDO #$($p.id.Substring(0,8).ToUpper())"
    $endereco = "$($p.endereco_entrega)$(if($p.bairro){", $($p.bairro)"})"
    $troco = if ($p.troco_para) { "Troco p/ $(Rs $p.troco_para)" } else { "" }
    function Entrega {
        if ($p.tipo_pedido -eq "entrega") {
            xWrap "End: $($p.endereco_entrega)"
            if ($p.bairro) { xWrap "Bairro: $($p.bairro)" }
        } else {
            Align 1; xFit @("*** RETIRADA NO LOCAL ***", "RETIRADA NO LOCAL"); Align 0
        }
    }

    # Layout espelhando o cupom "reimprimir" (formatReceipt) - classico,
    # moderno ou compacto. Tudo no mesmo tamanho e em negrito; so Align muda.
    Init
    Bold $true

    if ($layout -eq "classico") {
        $headerText = if ($p.forma_pagamento -eq "ja_pago") { "* JA PAGO *" }
                      elseif ($p.tipo_pedido -eq "retirada") { "-- RETIRADA --" }
                      else { "- DELIVERY -" }

        Align 1
        xWrap $loja
        xWrap $data
        Sep
        xFit @($headerText)
        xFit @($numero)
        Align 0
        Sep

        xWrap "Cliente: $($p.cliente_nome)"
        if ($p.cliente_telefone) { xWrap "Tel: $($p.cliente_telefone)" }
        Entrega
        Titulo "ITENS" "-"

        ItemsSection $p.descricao_itens
        if ($p.observacoes) { DSep; xWrap "Obs: $($p.observacoes)" }
        Sep

        Cols "Subtotal:" (Rs $p.valor_pedido)
        if ([double]$p.valor_motoboy -gt 0) { Cols "Entrega:" (Rs $p.valor_motoboy) }
        Cols "TOTAL:" (Rs $total)
        Sep

        xWrap "Pgto: $pgto"
        if ($troco) { xWrap $troco }
        Sep

        Align 1
        xT "appvellox.online"; xN

    } elseif ($layout -eq "compacto") {
        Align 1
        xWrap $loja
        xPar $data "#$($p.id.Substring(0,8).ToUpper())"
        Align 0
        DSep

        xWrap "[$tipo] $($p.cliente_nome)"
        if ($p.cliente_telefone) { xWrap $p.cliente_telefone }
        if ($p.tipo_pedido -eq "entrega") { xWrap $endereco }
        DSep

        ItemsSection $p.descricao_itens
        if ($p.observacoes) { xWrap "Obs: $($p.observacoes)" }
        DSep

        $entr = if ([double]$p.valor_motoboy -gt 0) { "Entr: $(Rs $p.valor_motoboy)" } else { "" }
        xPar "Sub: $(Rs $p.valor_pedido)" $entr
        xFit @("TOTAL: $(Rs $total)", "TOTAL $((Rs $total).Replace(' ',''))")
        xPar "Pgto: $pgto" $troco
        DSep

        Align 1
        xT "appvellox.online"; xN

    } else {
        # Moderno (padrao)
        Sep
        Align 1
        xWrap $loja
        xWrap $data
        Sep
        xFit @("[ $tipo ]")
        xFit @($numero)
        Align 0
        Sep

        xWrap "> $($p.cliente_nome)"
        if ($p.cliente_telefone) { xWrap "Tel: $($p.cliente_telefone)" }
        DSep
        Entrega
        Titulo "ITENS" "="

        ItemsSection $p.descricao_itens
        if ($p.observacoes) { DSep; xWrap "Obs: $($p.observacoes)" }
        Sep

        Cols "Subtotal:" (Rs $p.valor_pedido)
        if ([double]$p.valor_motoboy -gt 0) { Cols "Entrega:" (Rs $p.valor_motoboy) }
        Sep

        Align 1; xFit @(">> TOTAL: $(Rs $total) <<", "TOTAL: $(Rs $total)", "TOTAL $((Rs $total).Replace(' ',''))"); Align 0
        Sep

        xWrap "Pgto: $pgto"
        if ($troco) { xWrap $troco }
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
        throw "OpenPrinter falhou para '$pn' (Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())) - confira se o nome bate exatamente com o das Impressoras do Windows."
    }
    try {
        $di = New-Object WinPrint+DI; $di.n = "Vellox"; $di.t = "RAW"
        if ([WinPrint]::StartDocPrinter($h, 1, [ref]$di) -eq 0) {
            throw "StartDocPrinter falhou (Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())) - spooler pode estar parado ou pausado."
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
# Cupom de teste enviado pelo painel ("Imprimir teste"): entra nesta fila e o
# loop principal imprime com o MESMO Build-EscPos dos pedidos reais — o teste
# sai exatamente igual ao pedido do catalogo.
$filaTeste = New-Object 'System.Collections.Concurrent.ConcurrentQueue[string]'
try {
    $httpListener = New-Object System.Net.HttpListener
    $httpListener.Prefixes.Add("http://localhost:7532/")
    $httpListener.Start()

    $listenerRs = [runspacefactory]::CreateRunspace()
    $listenerRs.Open()
    $listenerPs = [powershell]::Create()
    $listenerPs.Runspace = $listenerRs
    [void]$listenerPs.AddScript({
        param($listener, $fila, $tokenAgente)
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
                # Pedido real: sera impresso pelo loop de polling em ate 5s — so
                # confirma recebido pra o navegador nao imprimir de novo.
                # Cupom de teste: so com o token da loja (qualquer site aberto
                # no navegador consegue chamar localhost, entao sem isso daria
                # pra mandar impressao pra impressora de qualquer um).
                $body = '{"ok":true}'
                $raw = ""
                try {
                    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                    $raw = $reader.ReadToEnd(); $reader.Close()
                } catch {}
                if ($raw -match '"teste"\s*:\s*true') {
                    $obj = $null
                    try { $obj = $raw | ConvertFrom-Json } catch {}
                    if ($obj -and $obj.token -and $obj.token -eq $tokenAgente -and $obj.pedido) {
                        $fila.Enqueue($raw)
                        $body = '{"ok":true,"teste":true}'
                    } else {
                        $response.StatusCode = 403
                        $body = '{"ok":false,"erro":"token invalido"}'
                    }
                }
            } else {
                $response.StatusCode = 404
            }

            $buffer = [System.Text.Encoding]::UTF8.GetBytes($body)
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            $response.OutputStream.Close()
        }
    }).AddArgument($httpListener).AddArgument($filaTeste).AddArgument($agentToken)
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

# -- Auto-atualizacao --------------------------------------------------------
# A versao oficial e o proprio servidor.ps1 publicado no site (fonte unica,
# nada pra manter em sincronia a mao). A cada 30 min baixa, le o $Versao dele
# e, se for MAIOR que o desta copia e o arquivo for valido (tamanho + sintaxe
# lida como ANSI, igual o PS 5.1 vai ler), um processo auxiliar troca o
# arquivo depois que este sai e reinicia. Se a versao nova nao ficar de pe,
# o auxiliar volta a anterior e marca a versao como ruim pra nao tentar de novo.
$urlServidor   = "https://www.appvellox.online/print-server/servidor.ps1"
$updateCheckAt = (Get-Date).AddMinutes(2)
function Num-Versao([string]$v) { if ($v -match 'v(\d+)') { return [int]$Matches[1] }; return 0 }

function Busca-Atualizacao {
    $novo = Join-Path $PSScriptRoot "servidor.novo.ps1"
    try {
        Invoke-WebRequest "$($urlServidor)?t=$([DateTime]::UtcNow.Ticks)" -OutFile $novo -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    } catch { return $null }
    try {
        if ((Get-Item $novo).Length -lt 10000) { throw "arquivo baixado pequeno demais" }
        $txt = [System.IO.File]::ReadAllText($novo, [System.Text.Encoding]::Default)
        if ($txt -notmatch '(?m)^\$Versao = "(v\d+)"') { throw "arquivo baixado sem numero de versao" }
        $vNova = $Matches[1]
        $ruim = Join-Path $PSScriptRoot "versao-ruim.txt"
        $vRuim = if (Test-Path $ruim) { (Get-Content $ruim -ErrorAction SilentlyContinue | Select-Object -First 1) } else { "" }
        if ((Num-Versao $vNova) -le (Num-Versao $Versao) -or $vNova -eq $vRuim) {
            Remove-Item $novo -Force -ErrorAction SilentlyContinue
            return $null
        }
        $errs = $null
        [void][System.Management.Automation.Language.Parser]::ParseInput($txt, [ref]$null, [ref]$errs)
        if ($errs -and $errs.Count -gt 0) { throw "versao $vNova com erro de sintaxe" }
        return $vNova
    } catch {
        Write-Host "  [AVISO] Atualizacao ignorada: $($_.Exception.Message)" -ForegroundColor Yellow
        Remove-Item $novo -Force -ErrorAction SilentlyContinue
        return $null
    }
}

$script:HelperTxt = @'
param([int]$OldPid, [string]$Dir, [string]$Nova)
$log = Join-Path $Dir "auto-update.log"
function L($m) { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'dd/MM HH:mm:ss'), $m) }
function Vivo { @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*servidor.ps1*' -and $_.ProcessId -ne $PID }).Count -gt 0 }
L "Atualizando para $Nova (processo antigo $OldPid)"
for ($i = 0; $i -lt 60; $i++) { if (-not (Get-Process -Id $OldPid -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 500 }
if (Get-Process -Id $OldPid -ErrorAction SilentlyContinue) { try { Stop-Process -Id $OldPid -Force -ErrorAction Stop } catch {}; Start-Sleep -Seconds 2 }
$atual = Join-Path $Dir "servidor.ps1"; $novo = Join-Path $Dir "servidor.novo.ps1"; $bak = Join-Path $Dir "servidor.anterior.ps1"
$ini = Join-Path $Dir "iniciar.bat"
if (-not (Test-Path $ini)) { "@echo off`r`npowershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$atual`"" | Out-File -FilePath $ini -Encoding ascii }
$trocou = $false
try { Copy-Item $atual $bak -Force -ErrorAction Stop; Move-Item $novo $atual -Force -ErrorAction Stop; $trocou = $true; L "Arquivo trocado." } catch { L "Falha ao trocar o arquivo: $($_.Exception.Message)" }
Start-Process -FilePath $ini -WindowStyle Hidden
Start-Sleep -Seconds 25
if (Vivo) { L "OK: rodando a versao nova."; exit 0 }
if ($trocou) {
    L "Versao nova nao ficou de pe - voltando a anterior."
    Set-Content -Path (Join-Path $Dir "versao-ruim.txt") -Value $Nova
    try { Copy-Item $bak $atual -Force -ErrorAction Stop } catch { L "Falha ao restaurar: $($_.Exception.Message)" }
    Start-Process -FilePath $ini -WindowStyle Hidden
    Start-Sleep -Seconds 15
}
if (Vivo) { L "Versao anterior rodando de novo." } else { L "ERRO: nenhum servidor ficou rodando - rode o instalador." }
'@

function Aplica-Atualizacao([string]$vNova) {
    Write-Host "[ATUALIZACAO] Versao $vNova disponivel (esta e $Versao). Reiniciando pra atualizar..." -ForegroundColor Cyan
    $helper = Join-Path $PSScriptRoot "auto-update.ps1"
    Set-Content -Path $helper -Value $script:HelperTxt -Encoding ASCII
    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$helper`"",
        '-OldPid', $PID, '-Dir', "`"$PSScriptRoot`"", '-Nova', $vNova)
}

Write-Host "Aguardando pedidos (verificando a cada 5s)..." -ForegroundColor Green
Write-Host ""

try {
while ($true) {
    $now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

    # Heartbeat: avisa o painel web que este servidor está online (aparece
    # no lugar do aviso amarelo "voce esta sem o app de impressao")
    try {
        $pingUri  = "$supabaseUrl/rest/v1/rpc/ping_print_agent"
        $pingBody = @{ p_empresa_id = $empresaId; p_impressora = $printerName; p_tamanho_papel = $tamanhoPapel; p_agent_token = $agentToken; p_agent_versao = $Versao } | ConvertTo-Json
        Invoke-RestMethod -Uri $pingUri -Headers $headers -Method POST -Body $pingBody -TimeoutSec 15 -ErrorAction SilentlyContinue | Out-Null
    } catch {}

    # Cupom de teste do painel: usa o layout/tamanho escolhidos na tela (os
    # mesmos ja salvos no banco) so pra este cupom.
    $rawTeste = $null
    while ($filaTeste.TryDequeue([ref]$rawTeste)) {
        try {
            $jt = $rawTeste | ConvertFrom-Json
            $layoutReal = $layout; $fonteReal = $fonte
            if ($jt.layout -in @('classico', 'moderno', 'compacto')) { $layout = $jt.layout }
            if ($jt.fonte -in @('normal', 'grande', 'extra_grande')) { $fonte = $jt.fonte }
            try {
                Print-Raw (Build-EscPos $jt.pedido)
                Write-Host "[TESTE] Cupom de teste impresso ($layout / $fonte)." -ForegroundColor Green
            } finally { $layout = $layoutReal; $fonte = $fonteReal }
        } catch {
            Write-Host "  [ERRO teste] $_" -ForegroundColor Red
        }
    }

    # Layout do cupom: busca no banco a cada 60s (não a cada 5s pra não
    # dobrar o tráfego à toa) — assim, trocar o layout nas Configurações do
    # painel reflete aqui sem precisar reiniciar o agente.
    if ((Get-Date) -ge $layoutRefreshAt) {
        try {
            $prefsUri  = "$supabaseUrl/rest/v1/rpc/get_print_agent_prefs"
            $prefsBody = @{ p_empresa_id = $empresaId; p_agent_token = $agentToken } | ConvertTo-Json
            $prefs = Invoke-RestMethod -Uri $prefsUri -Headers $headers -Method POST -Body $prefsBody -TimeoutSec 15 -ErrorAction Stop
            if ($prefs -and $prefs.Count -gt 0) {
                if ($prefs[0].layout)       { $layout       = $prefs[0].layout }
                if ($prefs[0].fonte)        { $fonte        = $prefs[0].fonte }
                # Nome da loja: sincroniza do banco (empresas.nome) em vez de
                # depender só do que foi digitado na hora de parear - isso
                # ficava em branco sempre que a pessoa so apertava ENTER no
                # configurar.ps1, e o cupom automatico saia com "PEDIDO" no
                # lugar do nome real. So pisa em cima do valor local se o
                # banco realmente devolveu algo (campo so existe a partir da
                # migracao schema_v64 — RPC antiga simplesmente nao manda).
                if ($prefs[0].empresa_nome) { $empresaNome  = $prefs[0].empresa_nome }
            } else {
                # Resposta vazia = token/empresa_id nao validou no servidor (ver
                # get_print_agent_prefs) — fica nisso silenciosamente era o motivo
                # do layout escolhido no painel nunca "pegar" pra quem tinha
                # credencial errada. Agora pelo menos fica no log.txt.
                Write-Host "  [AVISO] get_print_agent_prefs voltou vazio - confira o ID da empresa e o token em config.json." -ForegroundColor Yellow
            }
        } catch {
            Write-Host "  [AVISO] Falha ao buscar layout/fonte do painel: $_" -ForegroundColor Yellow
        }
        $layoutRefreshAt = (Get-Date).AddSeconds(60)
    }

    # Entre um ciclo e outro (nunca no meio de uma impressao).
    if ((Get-Date) -ge $updateCheckAt) {
        $updateCheckAt = (Get-Date).AddMinutes(30)
        $vNova = Busca-Atualizacao
        if ($vNova) {
            try { Aplica-Atualizacao $vNova; break } catch { Write-Host "  [AVISO] Nao consegui iniciar a atualizacao: $_" -ForegroundColor Yellow }
        }
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
