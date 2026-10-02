/* Service worker — precaches the hub so it works with no signal.
   VERSION and PRECACHE are stamped by tools/build-data.py (content hash) — re-run it after any change.
   Install = the app shell only, all-or-nothing (small). Everything else (documents, source snapshots, the PDF
   renderer, ONE audio encoding) is added file by file, each failure tolerated, at install and again on every page
   load ({type:'backfill'} message from app.js), so one dropped request on a weak signal never costs offline mode. */
const VERSION = 'ffp-1ffc942318'; /* @version */
const PRECACHE = [/* @precache */
  "./",
  "404.html",
  "app.js",
  "data.js",
  "manifest.webmanifest",
  "styles.css",
  "viewer.css",
  "viewer.js",
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
  "icons/icon.svg",
  "sources/acri-guide-ch2-licensing.html",
  "sources/acri-guide-ch6-protest-tents.html",
  "sources/acri-identify-to-police.html",
  "sources/acri-photography-manual-2016.pdf",
  "sources/acri-tlv-tent-approval-letter.html",
  "sources/ag-guideline-3-1200.pdf",
  "sources/bagatz-5078-20-fdida.pdf",
  "sources/id-card-law-wikisource.html",
  "sources/noise-regulations-nevo.html",
  "sources/police-ordinance-nevo.html",
  "sources/tlv-bylaw-order-cleanliness-nevo.html",
  "sources/tlv-events-approval.html",
  "sources/tlv-noise-bylaw.pdf",
  "vendor/pdfjs/pdf.min.js",
  "vendor/pdfjs/pdf.worker.min.js"
];
const FONT_CACHE = 'ffp-fonts-v1';

const SCOPE = new URL(self.registration.scope).pathname;
const IS_SHELL = (p) => !/^(audio|docs|sources|vendor)\//.test(p);
const SHELL = PRECACHE.filter(IS_SHELL);
const AUDIO_EXT = /\.(m4a|mp3|ogg)$/;

/* Add what is missing, one file at a time; a failed file is skipped (retried on the next page load). */
async function backfill(audioExt) {
  const cache = await caches.open(VERSION);
  const want = PRECACHE.filter((p) => !IS_SHELL(p) && (!AUDIO_EXT.test(p) || (audioExt && p.endsWith('.' + audioExt))));
  let added = 0, failed = 0;
  for (const p of want) {
    if (await cache.match(p)) continue;
    try { await cache.add(new Request(p, { cache: 'reload' })); added++; } catch (e) { failed++; }
  }
  return { added, failed };
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL.map((p) => new Request(p, { cache: 'reload' }))))
      .then(() => backfill(null))
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

self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type !== 'backfill') return;
  const ext = /^(m4a|mp3|ogg)$/.test(d.audio) ? d.audio : null;
  event.waitUntil(backfill(ext).then((r) => { if (event.source) event.source.postMessage({ type: 'backfilled', ...r }); }));
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

/* Cache-first for our own files. No background re-download: every precached file is versioned by VERSION
   (a content hash), so a changed file arrives with the next service worker, not by re-fetching on every hit. */
async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

/* The app's own document (scope root or index.html): network with a short timeout, cached shell otherwise.
   Only THIS response is ever stored under './'. */
async function shellNavigation(request) {
  const cache = await caches.open(VERSION);
  const net = fetch(request).then((res) => {
    if (res && res.ok && res.type === 'basic') cache.put('./', res.clone());
    return res;
  });
  const cached = () => cache.match('./').then((r) => r || cache.match('index.html'));
  const timeout = new Promise((resolve) => setTimeout(() => cached().then((r) => r && resolve(r)), 2500));
  try {
    return await Promise.race([net, timeout]);
  } catch (e) {
    return (await cached()) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

/* Any other navigation — the source viewer's iframes (sources/*.html), a PDF or image opened in a new tab:
   the file itself, cache-first (all of them are precached), never the app shell. */
async function fileNavigation(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  } catch (e) {
    return new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><p dir="rtl">הקובץ הזה עוד לא נשמר במכשיר. נסו שוב כשיש קליטה.</p>',
      { status: 504, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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
    const shell = req.destination !== 'iframe' && (url.pathname === SCOPE || url.pathname === SCOPE + 'index.html');
    event.respondWith(shell ? shellNavigation(req) : fileNavigation(req));
    return;
  }
  event.respondWith(cacheFirst(req));
});
