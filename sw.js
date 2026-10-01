/* Service worker — precaches EVERYTHING (pages, audio, documents) so the hub works with no signal.
   VERSION and PRECACHE are stamped by tools/build-data.py (content hash) — re-run it after any change. */
const VERSION = 'ffp-99dbc270ba'; /* @version */
const PRECACHE = [/* @precache */
  "./",
  "404.html",
  "app.js",
  "data.js",
  "index.html",
  "manifest.webmanifest",
  "styles.css",
  "audio/inspector.m4a",
  "audio/inspector.mp3",
  "audio/inspector.ogg",
  "audio/police.m4a",
  "audio/police.mp3",
  "audio/police.ogg",
  "docs/general-protest-tent-permit.pdf",
  "docs/notice-3885-redacted.html",
  "docs/notice-3885-redacted.pdf",
  "docs/notice-3885-redacted.png",
  "docs/police-appendix-D-when-license-needed.pdf",
  "docs/police-procedure-221.110.19-assemblies.pdf",
  "docs/procedure-869-public-space-use.pdf",
  "docs/request-3885-submitted-redacted.png",
  "icons/apple-touch-icon.png",
  "icons/dove.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon.svg"
];
const FONT_CACHE = 'ffp-fonts-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Audio needs byte-range answers (Safari asks for "bytes=0-1" first). Serve 206 from the cached file. */
async function rangeResponse(request) {
  const cache = await caches.open(VERSION);
  let res = await cache.match(request.url, { ignoreSearch: true });
  if (!res) {
    try {
      res = await fetch(request.url);
      if (res.ok) cache.put(request.url, res.clone());
    } catch (e) {
      return new Response('', { status: 504 });
    }
  }
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  let start = 0, end = size - 1;
  if (m) {
    if (m[1] === '' && m[2] !== '') { start = Math.max(0, size - Number(m[2])); }
    else { start = Number(m[1] || 0); if (m[2] !== '') end = Math.min(Number(m[2]), size - 1); }
  }
  if (start >= size || start > end) {
    return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const chunk = buf.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(chunk.byteLength),
      'Accept-Ranges': 'bytes',
    },
  });
}

/* Cache-first for our own files, refreshed in the background. */
async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then((res) => {
    if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  if (hit) return hit;
  const res = await refresh;
  return res || new Response('', { status: 504, statusText: 'Offline' });
}

async function navigation(request) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put('./', res.clone());
    return res;
  } catch (e) {
    return (await cache.match('./')) || (await cache.match('index.html')) || new Response('Offline', { status: 503 });
  }
}

async function fonts(request) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(request);
  const net = fetch(request).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await net) || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(fonts(req));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (req.headers.has('range')) { event.respondWith(rangeResponse(req)); return; }
  if (req.mode === 'navigate') {
    /* Short-timeout network for the page itself, cache when offline. */
    event.respondWith(Promise.race([
      navigation(req),
      new Promise((resolve) => setTimeout(() => caches.open(VERSION).then((c) => c.match('./')).then((r) => r && resolve(r)), 2500)),
    ]));
    return;
  }
  event.respondWith(cacheFirst(req));
});
