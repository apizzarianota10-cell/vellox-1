// Service worker do app do motoboy (public/motoboy-sw.js), escopo /motoboy.
// O script fica na raiz, então o escopo máximo permitido é "/" e /motoboy cabe
// nele sem precisar do header Service-Worker-Allowed.

export const MOTOBOY_SW_URL = "/motoboy-sw.js";
export const MOTOBOY_SW_SCOPE = "/motoboy";

let pendente: Promise<ServiceWorkerRegistration | null> | null = null;

export function swSuportado(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

/** Registra (uma vez por carregamento) e devolve o registro, ou null se não der. */
export function registrarSwMotoboy(): Promise<ServiceWorkerRegistration | null> {
  if (!swSuportado()) return Promise.resolve(null);
  if (!pendente) {
    pendente = navigator.serviceWorker
      .register(MOTOBOY_SW_URL, { scope: MOTOBOY_SW_SCOPE, updateViaCache: "none" })
      .then((reg) => { reg.update().catch(() => {}); return reg; })
      .catch((err) => {
        console.warn("[motoboy-sw] falha ao registrar", err);
        pendente = null;
        return null;
      });
  }
  return pendente;
}

export interface AvisoMotoboy {
  titulo: string;
  corpo: string;
  tag: string;
}

/** Mostra uma notificação do sistema (via SW quando possível — exigido no Android). */
export async function mostrarNotificacaoMotoboy(aviso: AvisoMotoboy): Promise<boolean> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  const opts: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body: aviso.corpo,
    tag: aviso.tag,
    renotify: true,
    icon: "/motoboy-icone?s=192",
    badge: "/motoboy-icone?s=192",
    vibrate: [200, 100, 200, 100, 300],
    data: { url: "/motoboy" },
  };
  try {
    const reg = await registrarSwMotoboy();
    if (reg) {
      await reg.showNotification(aviso.titulo, opts);
      return true;
    }
  } catch { /* cai no fallback */ }
  try {
    // Desktop sem SW: construtor direto (no Android ele lança erro).
    new Notification(aviso.titulo, opts);
    return true;
  } catch {
    return false;
  }
}
