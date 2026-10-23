// Impressora térmica Bluetooth direto do navegador — Web Bluetooth (BLE).
// Funciona no Chrome do Android (e Chrome/Edge no PC). iPhone não tem.
//
// Como a reconexão funciona sem toque do usuário:
//  1. Depois do pareamento (requestDevice, que EXIGE toque), o objeto do
//     aparelho fica guardado em memória (`cacheDevice`). Enquanto o painel
//     não for recarregado, gatt.connect() funciona sem toque nenhum.
//  2. Se a página foi recarregada, tenta navigator.bluetooth.getDevices()
//     (aparelhos já autorizados neste site) — também sem toque. Nem todo
//     Chrome Android tem essa função ativada.
//  3. Se nada disso der, lança BtPrecisaToqueError: quem chamou mostra o aviso
//     "Toque para imprimir" e chama de novo com { permitirSeletor: true }
//     dentro do toque (abre a lista do Bluetooth já filtrada pelo nome).

const KEYS = {
  id:      "vellox-bt-printer-id",
  name:    "vellox-bt-printer-name",
  service: "vellox-bt-service-uuid",
  char:    "vellox-bt-char-uuid",
  lento:   "vellox-bt-modo-lento",
};

// Serviço/característica de escrita mais comuns em impressoras térmicas BLE.
const PROFILES = [
  { service: "000018f0-0000-1000-8000-00805f9b34fb", char: "00002af1-0000-1000-8000-00805f9b34fb" },
  { service: "e7810a71-73ae-499d-8c15-faa9aef0c3f2", char: "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f" },
  { service: "49535343-fe7d-4ae5-8fa9-9fafd205e455", char: "49535343-8841-43f4-a8d4-ecbe34729bb3" },
  { service: "0000ff00-0000-1000-8000-00805f9b34fb", char: "0000ff02-0000-1000-8000-00805f9b34fb" },
  { service: "0000ae30-0000-1000-8000-00805f9b34fb", char: "0000ae01-0000-1000-8000-00805f9b34fb" },
  { service: "0000ffe0-0000-1000-8000-00805f9b34fb", char: "0000ffe1-0000-1000-8000-00805f9b34fb" },
  { service: "0000fff0-0000-1000-8000-00805f9b34fb", char: "0000fff2-0000-1000-8000-00805f9b34fb" },
];
const OPTIONAL_SERVICES = PROFILES.map(p => p.service);

// Blocos pequenos: muita impressora BLE barata tem buffer/MTU minúsculo e
// perde dados (sai cortado/embaralhado) se receber muito de uma vez.
// Modo lento = 20 bytes (cabe em qualquer MTU, inclusive o mínimo de 23).
const BLOCO_NORMAL = { tamanho: 100, pausaMs: 20 };
const BLOCO_LENTO  = { tamanho: 20,  pausaMs: 30 };

type BT = {
  requestDevice(opts: object): Promise<BluetoothDevice>;
  getDevices?: () => Promise<BluetoothDevice[]>;
};

type BluetoothDevice = {
  id: string;
  name?: string;
  gatt?: {
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    connected: boolean;
  };
};

type BluetoothRemoteGATTServer = {
  connected: boolean;
  getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTService>;
  getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>;
  disconnect(): void;
};

type BluetoothRemoteGATTService = {
  uuid: string;
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
};

type BluetoothRemoteGATTCharacteristic = {
  uuid: string;
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
  writeValueWithResponse?: (value: BufferSource) => Promise<void>;
  writeValue(value: BufferSource): Promise<void>;
};

/** Lançado quando só dá pra reconectar com um toque do usuário na tela. */
export class BtPrecisaToqueError extends Error {
  constructor(msg = "Toque na tela para conectar a impressora.") {
    super(msg);
    this.name = "BtPrecisaToqueError";
  }
}

let cacheDevice: BluetoothDevice | null = null;
let cacheChar: BluetoothRemoteGATTCharacteristic | null = null;
let fila: Promise<unknown> = Promise.resolve();

function bt(): BT {
  return (navigator as unknown as { bluetooth: BT }).bluetooth;
}

function ler(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}

export function isBtSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/** Web Bluetooth pode existir no objeto mas estar desligado (ex.: sem adaptador). */
export async function isBtAvailable(): Promise<boolean> {
  if (!isBtSupported()) return false;
  try {
    const b = (navigator as unknown as { bluetooth: { getAvailability?: () => Promise<boolean> } }).bluetooth;
    return b.getAvailability ? await b.getAvailability() : true;
  } catch { return true; }
}

export function getPairedPrinterName(): string | null {
  return ler(KEYS.name);
}

export function isModoLento(): boolean {
  return ler(KEYS.lento) === "1";
}

export function setModoLento(v: boolean): void {
  try { v ? localStorage.setItem(KEYS.lento, "1") : localStorage.removeItem(KEYS.lento); } catch {}
}

async function acharEscrita(server: BluetoothRemoteGATTServer): Promise<BluetoothRemoteGATTCharacteristic | null> {
  // 1. Perfis conhecidos
  for (const p of PROFILES) {
    try {
      const svc = await server.getPrimaryService(p.service);
      const ch  = await svc.getCharacteristic(p.char);
      if (ch.properties.write || ch.properties.writeWithoutResponse) return ch;
    } catch { /* próximo */ }
  }
  // 2. Qualquer característica de escrita nos serviços liberados
  try {
    for (const svc of await server.getPrimaryServices()) {
      for (const ch of await svc.getCharacteristics()) {
        if (ch.properties.write || ch.properties.writeWithoutResponse) return ch;
      }
    }
  } catch { /* nada */ }
  return null;
}

async function conectar(device: BluetoothDevice): Promise<BluetoothRemoteGATTCharacteristic> {
  if (!device.gatt) throw new Error("Esse aparelho não parece ser uma impressora.");
  const server = await device.gatt.connect();
  const serviceId = ler(KEYS.service);
  const charId    = ler(KEYS.char);
  if (serviceId && charId && ler(KEYS.id) === device.id) {
    try {
      const svc = await server.getPrimaryService(serviceId);
      return await svc.getCharacteristic(charId);
    } catch { /* procura de novo abaixo */ }
  }
  const ch = await acharEscrita(server);
  if (!ch) {
    try { server.disconnect(); } catch {}
    throw new Error("Não deu para conversar com essa impressora pelo Bluetooth direto.");
  }
  return ch;
}

function guardar(device: BluetoothDevice, ch: BluetoothRemoteGATTCharacteristic, serviceUuid?: string) {
  cacheDevice = device;
  cacheChar   = ch;
  try {
    localStorage.setItem(KEYS.id,   device.id);
    localStorage.setItem(KEYS.name, device.name ?? "Impressora");
    localStorage.setItem(KEYS.char, ch.uuid);
    if (serviceUuid) localStorage.setItem(KEYS.service, serviceUuid);
  } catch {}
}

function uuidDoServico(ch: BluetoothRemoteGATTCharacteristic): string | undefined {
  // Na API real a característica tem `.service`; se não, deduz pelo perfil.
  const comServico = ch as unknown as { service?: { uuid: string } };
  return comServico.service?.uuid ?? PROFILES.find(x => x.char === ch.uuid)?.service;
}

/** Abre a lista do Bluetooth (PRECISA de toque) e guarda a impressora escolhida. */
export async function pairPrinter(): Promise<string> {
  if (!isBtSupported()) throw new Error("Este navegador não tem Bluetooth. Use o Google Chrome no Android.");
  const device = await bt().requestDevice({ acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES });
  const ch = await conectar(device);
  guardar(device, ch, uuidDoServico(ch));
  return device.name ?? "Impressora";
}

/** Reabre a lista do Bluetooth filtrada pelo nome salvo (PRECISA de toque). */
async function reescolherComToque(): Promise<BluetoothDevice> {
  const nome = ler(KEYS.name);
  const opts = nome && nome !== "Impressora"
    ? { filters: [{ name: nome }], optionalServices: OPTIONAL_SERVICES }
    : { acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES };
  return bt().requestDevice(opts);
}

async function obterDispositivo(permitirSeletor: boolean): Promise<BluetoothDevice> {
  if (cacheDevice) return cacheDevice;
  const storedId = ler(KEYS.id);
  if (storedId) {
    try {
      const b = bt();
      if (b.getDevices) {
        const d = (await b.getDevices()).find(x => x.id === storedId);
        if (d) return d;
      }
    } catch { /* getDevices indisponível neste Chrome */ }
  }
  if (permitirSeletor) return reescolherComToque();
  throw new BtPrecisaToqueError();
}

async function escrever(ch: BluetoothRemoteGATTCharacteristic, data: Uint8Array): Promise<void> {
  const { tamanho, pausaMs } = isModoLento() ? BLOCO_LENTO : BLOCO_NORMAL;
  // Com resposta (write) é mais garantido: a impressora confirma cada bloco.
  const comResposta = ch.properties.write || !ch.properties.writeWithoutResponse;
  const blocos = fatiarEmBlocos(data, tamanho);
  for (let i = 0; i < blocos.length; i++) {
    const bloco = blocos[i];
    if (comResposta) {
      if (ch.writeValueWithResponse) await ch.writeValueWithResponse(bloco);
      else await ch.writeValue(bloco);
    } else if (ch.writeValueWithoutResponse) {
      await ch.writeValueWithoutResponse(bloco);
    } else {
      await ch.writeValue(bloco);
    }
    if (i < blocos.length - 1) await new Promise(r => setTimeout(r, pausaMs));
  }
}

async function imprimirAgora(data: Uint8Array, permitirSeletor: boolean): Promise<void> {
  if (!isBtSupported()) throw new Error("Este navegador não tem Bluetooth.");
  if (!ler(KEYS.id) && !cacheDevice) throw new Error("Nenhuma impressora escolhida ainda.");

  const device = await obterDispositivo(permitirSeletor);
  let ch = cacheDevice === device && cacheChar && device.gatt?.connected ? cacheChar : null;
  if (!ch) {
    ch = await conectar(device);
    guardar(device, ch, uuidDoServico(ch));
  }
  try {
    await escrever(ch, data);
  } catch {
    // Conexão caiu (impressora dormiu?) — reconecta uma vez e manda de novo.
    cacheChar = null;
    try { device.gatt?.disconnect(); } catch {}
    ch = await conectar(device);
    guardar(device, ch, uuidDoServico(ch));
    await escrever(ch, data);
  }
  // Mantém conectado: o próximo pedido sai mais rápido. Se cair, reconecta acima.
}

/**
 * Envia bytes ESC/POS para a impressora Bluetooth.
 * Sem `permitirSeletor`, nunca abre janela: se precisar de toque, lança
 * BtPrecisaToqueError. Impressões são enfileiradas (uma de cada vez).
 */
export function printViaBluetooth(data: Uint8Array, opts: { permitirSeletor?: boolean } = {}): Promise<void> {
  const tarefa = fila.then(() => imprimirAgora(data, !!opts.permitirSeletor));
  fila = tarefa.catch(() => {});
  return tarefa;
}

export function unpairPrinter(): void {
  try { cacheDevice?.gatt?.disconnect(); } catch {}
  cacheDevice = null;
  cacheChar   = null;
  try { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); } catch {}
}

/** Fatia em blocos — exportado só para teste. */
export function fatiarEmBlocos(data: Uint8Array, tamanho: number): Uint8Array<ArrayBuffer>[] {
  const out: Uint8Array<ArrayBuffer>[] = [];
  for (let i = 0; i < data.length; i += tamanho) out.push(new Uint8Array(data.subarray(i, i + tamanho)));
  return out;
}
