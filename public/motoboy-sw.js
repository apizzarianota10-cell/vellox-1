// motoboy-sw.js — service worker do app do motoboy (escopo /motoboy).
//
// Só cuida de NOTIFICAÇÕES (push + clique). Não tem handler de fetch e não usa
// Cache Storage: o app sempre vem da rede, nunca uma versão velha.
// Registrado por src/lib/motoboySw.ts. O PwaRegister ignora este escopo.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Web Push (para quando houver VAPID + inscrição no servidor). Payload JSON:
// { "title": "...", "body": "...", "tag": "...", "url": "/motoboy" }
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Vellox Motoboy";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Você tem uma atualização de pedido.",
      tag: data.tag || "vellox-motoboy",
      renotify: true,
      icon: "/motoboy-icone?s=192",
      badge: "/motoboy-icone?s=192",
      vibrate: [200, 100, 200, 100, 300],
      data: { url: data.url || "/motoboy" },
    })
  );
});

// Clique: foca a janela do app se já estiver aberta, senão abre /motoboy.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const alvo = (event.notification.data && event.notification.data.url) || "/motoboy";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        try {
          if (new URL(c.url).pathname.startsWith("/motoboy") && "focus" in c) return c.focus();
        } catch (_) { /* ignora */ }
      }
      return self.clients.openWindow ? self.clients.openWindow(alvo) : undefined;
    })
  );
});
