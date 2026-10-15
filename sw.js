/* sw.js — supaya aplikasi tetap jalan offline. Naikkan VERSION setiap kali update file. */
const VERSION = "ss-v1.0.2";
const SHELL = [
  "./", "./index.html", "./css/style.css",
  "./js/store.js", "./js/speech.js", "./js/sensei.js", "./js/app.js", "./js/qrcode.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./data/index.json", "./data/bab1.json", "./data/bab2.json", "./data/bab3.json"
];
const RUNTIME_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;                 // chat Worker & GAS (POST) selalu lewat jaringan
  const url = new URL(req.url);

  // File aplikasi sendiri: network-first (dapat versi terbaru), cadangan dari cache saat offline
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  // Font & pdf.js: cache-first
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return res;
      }))
    );
  }
});
