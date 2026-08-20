const { createClient } = require('@supabase/supabase-js');
const { exec } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Config ─────────────────────────────────────────────────────────────────
const cfgPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(cfgPath)) { console.error('config.json nao encontrado.'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const { supabase_url, supabase_anon_key, empresa_id, empresa_nome, printer_name } = cfg;
if (!supabase_url || !supabase_anon_key || !empresa_id) {
  console.error('Configuracao incompleta. Execute o instalador novamente.');
  process.exit(1);
}

// ── ESC/POS builder ────────────────────────────────────────────────────────
const ESC = 0x1B, GS = 0x1D, LF = 0x0A;

function escPos(pedido) {
  const b = [];
  const W = 32;

  function push(...v) { v.forEach(x => b.push(x)); }
  function text(s) { [...s].forEach(c => { const n = c.charCodeAt(0); b.push(n < 256 ? n : 63); }); }
  function nl(n = 1) { for (let i = 0; i < n; i++) b.push(LF); }
  function init()   { push(ESC, 0x40); }
  function bold(on) { push(ESC, 0x45, on ? 1 : 0); }
  function big(on)  { push(GS, 0x21, on ? 0x11 : 0x00); }
  function align(a) { push(ESC, 0x61, a); } // 0=left 1=center 2=right
  function sep()    { text('-'.repeat(W)); nl(); }
  function cut()    { push(GS, 0x56, 0x41, 0x05); }

  function cols(left, right) {
    const sp = W - left.length - right.length;
    text(left + (sp > 0 ? ' '.repeat(sp) : ' ') + right);
    nl();
  }

  function center(s) {
    const pad = Math.max(0, Math.floor((W - s.length) / 2));
    text(' '.repeat(pad) + s);
    nl();
  }

  const data  = new Date(pedido.created_at);
  const hora  = data.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  const dataS = data.toLocaleDateString('pt-BR');
  const total = pedido.valor_pedido + pedido.valor_motoboy;
  const PGTO  = { dinheiro:'Dinheiro', cartao_credito:'Cartao Credito', cartao_debito:'Cartao Debito', pix:'PIX', ja_pago:'Ja pago' };
  const pgto  = PGTO[pedido.forma_pagamento] || pedido.forma_pagamento || '---';
  const now   = new Date();
  const printedAt = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;

  init();

  // Empresa
  align(1); big(true); bold(true);
  text((empresa_nome || 'PEDIDO').toUpperCase()); nl();
  big(false);

  // Pedido
  text(`PEDIDO #${pedido.id.slice(0,8).toUpperCase()}`); nl();
  bold(false); align(0);
  sep();

  // Cliente + hora
  const clienteShort = pedido.cliente_nome.slice(0, 18);
  cols(clienteShort, `${hora} ${dataS}`);
  sep();

  // Tipo entrega
  align(1); bold(true); big(true);
  text(pedido.tipo_pedido === 'entrega' ? 'ENTREGA' : 'RETIRADA'); nl();
  big(false); bold(false); align(0);
  sep();

  // Dados cliente
  bold(true); text('CLIENTE/CELULAR'); nl(); bold(false);
  text(`${pedido.cliente_nome} - ${pedido.cliente_telefone}`); nl();

  if (pedido.tipo_pedido === 'entrega') {
    bold(true); text('ENDERECO:'); nl(); bold(false);
    text(pedido.endereco_entrega + (pedido.bairro ? `, ${pedido.bairro}` : '')); nl();
  }

  if (pedido.observacoes) {
    bold(true); text('OBS:'); nl(); bold(false);
    text(pedido.observacoes); nl();
  }

  sep();

  // Itens
  (pedido.descricao_itens || '').split('\n').filter(Boolean).forEach(l => { text(l); nl(); });
  sep();

  // Totais
  cols('SUBTOTAL', `R$ ${pedido.valor_pedido.toFixed(2).replace('.',',')}`);
  if (pedido.valor_motoboy > 0)
    cols('TAXA ENTREGA', `R$ ${pedido.valor_motoboy.toFixed(2).replace('.',',')}`);
  bold(true); big(true);
  cols('TOTAL', `R$ ${total.toFixed(2).replace('.',',')}`);
  big(false); bold(false);
  sep();

  // Pagamento
  bold(true); text('PAGAMENTO'); nl(); bold(false);
  text(pgto + (pedido.troco_para ? ` Troco p/ R$ ${pedido.troco_para.toFixed(2).replace('.',',')}` : '')); nl();
  sep();

  // Rodapé
  align(1);
  text(`IMPRESSO EM ${printedAt}`); nl();
  bold(true); text('appvellox.online'); bold(false); nl();
  nl(3);
  cut();

  return Buffer.from(b);
}

// ── Impressão RAW via Windows API ──────────────────────────────────────────
const PS_HEADER = `
Add-Type -TypeDefinition @"
using System;using System.Runtime.InteropServices;
public class WP{
  [DllImport("winspool.drv",CharSet=CharSet.Unicode)]public static extern bool OpenPrinter(string n,out IntPtr h,IntPtr p);
  [DllImport("winspool.drv")]public static extern bool ClosePrinter(IntPtr h);
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]public struct DI{public string n;public string o;public string t;}
  [DllImport("winspool.drv",CharSet=CharSet.Unicode)]public static extern int StartDocPrinter(IntPtr h,int l,ref DI d);
  [DllImport("winspool.drv")]public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv")]public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv")]public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv")]public static extern bool WritePrinter(IntPtr h,IntPtr b,int c,out int w);
}
"@
`;

function printRaw(bytes, printerName) {
  const tmp   = path.join(os.tmpdir(), `vellox_${Date.now()}.bin`);
  const tmpPs = path.join(os.tmpdir(), `vellox_${Date.now()}.ps1`);
  fs.writeFileSync(tmp, bytes);

  const pn = printerName
    ? `'${printerName.replace(/'/g, "''")}'`
    : `(Get-WmiObject Win32_Printer | Where-Object {$_.Default -eq $true}).Name`;

  const ps = `${PS_HEADER}
$pn    = ${pn}
$bytes = [IO.File]::ReadAllBytes('${tmp.replace(/\\/g,'/')}')
$h     = [IntPtr]::Zero
[WP]::OpenPrinter($pn,[ref]$h,[IntPtr]::Zero) | Out-Null
$di    = New-Object WP+DI; $di.n='Vellox'; $di.t='RAW'
[WP]::StartDocPrinter($h,1,[ref]$di) | Out-Null
[WP]::StartPagePrinter($h) | Out-Null
$p = [Runtime.InteropServices.Marshal]::AllocCoTaskMem($bytes.Length)
[Runtime.InteropServices.Marshal]::Copy($bytes,0,$p,$bytes.Length)
$w = 0; [WP]::WritePrinter($h,$p,$bytes.Length,[ref]$w) | Out-Null
[Runtime.InteropServices.Marshal]::FreeCoTaskMem($p)
[WP]::EndPagePrinter($h) | Out-Null
[WP]::EndDocPrinter($h) | Out-Null
[WP]::ClosePrinter($h) | Out-Null
`;

  fs.writeFileSync(tmpPs, ps, 'utf8');
  exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`, (err) => {
    try { fs.unlinkSync(tmp); fs.unlinkSync(tmpPs); } catch {}
    if (err) console.error(`[ERRO] ${err.message}`);
    else     console.log(`[OK] Cupom impresso!`);
  });
}

// ── Supabase listener ──────────────────────────────────────────────────────
const supabase = createClient(supabase_url, supabase_anon_key);
const printed  = new Set();

console.log('\n=====================================');
console.log('  Vellox - Servidor de Impressao');
console.log('=====================================');
console.log(`Empresa  : ${empresa_nome || empresa_id}`);
console.log(`Impressora: ${printer_name || 'padrao do sistema'}`);
console.log('Aguardando pedidos...\n');

function handlePedido(pedido) {
  if (pedido.status !== 'em_fila') return;
  if (printed.has(pedido.id)) return;
  printed.add(pedido.id);

  const t = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${t}] #${pedido.id.slice(0,8).toUpperCase()} - ${pedido.cliente_nome}`);

  try {
    const bytes = escPos(pedido);
    printRaw(bytes, printer_name);
  } catch (e) {
    console.error('[ERRO]', e.message);
  }
}

// ── Realtime (entrega instantânea) ────────────────────────────────────────
let realtimeOk = false;

supabase
  .channel('vellox-print-server')
  .on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'pedidos',
    filter: `empresa_id=eq.${empresa_id}`,
  }, (payload) => {
    realtimeOk = true;
    handlePedido(payload.new);
  })
  .subscribe(s => {
    if (s === 'SUBSCRIBED') {
      realtimeOk = true;
      console.log('Realtime conectado! Pronto para imprimir.\n');
    }
    if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
      realtimeOk = false;
      console.error(`[AVISO] Realtime ${s} — polling de backup ativo.`);
    }
  });

// ── Polling de backup (garante impressão mesmo se Realtime cair) ──────────
// Roda a cada 60 s e busca pedidos dos últimos 90 minutos ainda não impressos.
// Se o Realtime já entregou o pedido, o Set `printed` evita re-impressão.
async function pollPedidos() {
  try {
    const desde = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .eq('empresa_id', empresa_id)
      .eq('status', 'em_fila')
      .gte('created_at', desde)
      .order('created_at', { ascending: true });

    if (error) { console.error('[POLL] Erro:', error.message); return; }

    let novos = 0;
    for (const p of (data || [])) {
      if (!printed.has(p.id)) {
        novos++;
        handlePedido(p);
      }
    }
    if (novos > 0) {
      console.log(`[POLL] ${novos} pedido(s) recuperado(s) pelo backup.`);
    }
  } catch (e) {
    console.error('[POLL] Excecao:', e.message);
  }
}

// Aguarda 10 s para o Realtime conectar antes de iniciar o polling
setTimeout(() => {
  pollPedidos();
  setInterval(pollPedidos, 60_000);
}, 10_000);

// Mantém o processo vivo
setInterval(() => {}, 60_000);
