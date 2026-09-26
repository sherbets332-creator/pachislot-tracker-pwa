/**
 * Service Worker：オフラインで完全に動くようにするためのキャッシュ層。
 *
 * ビルド不要のバニラJS構成なので、ファイルを追加するたびに「事前キャッシュ一覧」を
 * メンテナンスし続けるのは事故のもと。代わりに stale-while-revalidate 方式にする：
 * - キャッシュにあれば即座に返す（オフラインでも動く）
 * - 裏でネットワークから取りに行き、成功したらキャッシュを更新する（次回開いたときに反映される）
 * - 一度も開いたことのないファイルをオフラインで開こうとした場合だけは、他のPWA同様
 *   ネットワークが必要（初回はオンラインである前提）。
 */
const CACHE_NAME = "pachislot-pwa-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
