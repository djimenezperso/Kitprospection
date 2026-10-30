// Service worker minimal : permet l'installation sur l'écran d'accueil. Aucune donnée n'est mise en cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
