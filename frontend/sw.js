const VERSION = "1.94";
const CACHE_NAME = `elai-shell-${VERSION}`;

const SHELL_FILES = [
  "./manifest.json",
  "./img/ELAI.png",
  "./img/elai-button.png",
  "./img/food-wallpaper.png",
  "./img/icon-192.png",
  "./img/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  const isHtml = request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");

  if (isHtml) {
    // HTML stranka: vzdy nejdriv zkusit sit (cache: no-store, aby nas
    // neobelstila HTTP cache prohlizece), at se nezasekne stara verze.
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Ostatni (CSS/JS/obrazky): rychle z kese, pri prvnim pozadavku dotahnout a ulozit.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
