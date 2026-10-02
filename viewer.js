/* צום לשלום 2026 — source viewer.
   Route: #/source/<slug>?h=<index>  (index into that source's highlights in content/sources.json).
   Opens the captured original inside the site — a PDF page (PDF.js, vendored, offline) or an HTML snapshot
   (sandboxed same-origin iframe, no scripts run in it) — at the exact clause, with ONLY that quote marked.

   Legal accuracy:
   · PDF marks are the line rects the capture tool found for the quote's verbatim text. Every rect set is
     re-checked letter for letter against the PDF by tools/viewer-check/pdf_rects.py.
   · HTML marks are placed only when EVERY segment of the quote is found letter for letter in the page.
     If one segment is missing, nothing at all is marked and the header says so.
   · Yellow = the quote backs the claim (stance supports / obligation). Caution and context quotes get a
     dashed location frame only, never the yellow highlight. */
(() => {
  'use strict';

  const VENDOR = 'vendor/pdfjs/';
  const K = /[א-ת0-9A-Za-z]/; /* letters + digits: the same matching key the capture tool used */
  const STRONG = { supports: 1, obligation: 1 };
  const ZMIN = 1, ZMAX = 4, ZSTEP = 1.25;
  const MAX_PX = 12e6; /* canvas pixel budget per page (iOS limit is ~16.7M) */

  let root = null;
  const ui = {};
  let st = null;
  let gen = 0;
  let lastFocus = null;
  let prevTitle = '';
  let closeHandler = null;
  let pdfjsP = null;
  const pdfCache = new Map();

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = (d, extra) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"${extra || ''}>${d}</svg>`;
  const use = (id) => `<svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const list = () => (window.FFP && window.FFP.sources) || [];
  const find = (slug) => list().find((s) => s.slug === slug) || null;
  const strong = (h) => !!(h && STRONG[h.stance]);
  const keyOf = (t) => { let k = ''; for (const c of String(t)) if (K.test(c)) k += c; return k; };
  const uniq = (a) => Array.from(new Set(a)).sort((x, y) => x - y);
  const segText = (g) => (typeof g === 'string' ? g : g.text_exact);
  const stanceWord = (h) => (h.stance === 'caution' ? 'הסתייגות' : 'רקע');

  /* ---------- shell ---------- */

  function build() {
    if (root) return;
    root = el('div', 'sv');
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'sv-title');
    root.innerHTML = `
      <header class="sv-head">
        <div class="sv-top">
          <button class="sv-close" type="button" aria-label="סגירת התצוגה וחזרה">${use('x')}</button>
          <div class="sv-titles">
            <p class="sv-kicker">המקור, כפי שהוא במקור</p>
            <h2 class="sv-title" id="sv-title"></h2>
          </div>
        </div>
        <p class="sv-where"></p>
        <p class="sv-what"></p>
        <div class="sv-actions">
          <a class="sv-orig" target="_blank" rel="noopener"><span>פתח במקור הרשמי</span><span aria-hidden="true">↗</span></a>
          <label class="sv-pick-wrap"><span class="sv-sr">קטע מסומן במסמך</span><select class="sv-pick"></select></label>
        </div>
      </header>
      <div class="sv-body" tabindex="-1"></div>
      <footer class="sv-foot" hidden>
        <div class="sv-grp">
          <button class="sv-btn" type="button" data-act="prev" aria-label="העמוד הקודם">${use('arrow')}</button>
          <span class="sv-pg" aria-live="polite"></span>
          <button class="sv-btn" type="button" data-act="next" aria-label="העמוד הבא">${use('left')}</button>
        </div>
        <button class="sv-btn sv-btn-wide" type="button" data-act="target" aria-label="חזרה לקטע המסומן">${svg('<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.6"/><path d="M12 1.8v3.4M12 18.8v3.4M1.8 12h3.4M18.8 12h3.4"/>')}<span>לקטע</span></button>
        <div class="sv-grp">
          <button class="sv-btn" type="button" data-act="zout" aria-label="הקטנה">${svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M7.5 10.5h6"/>')}</button>
          <span class="sv-zoom" aria-live="polite"></span>
          <button class="sv-btn" type="button" data-act="zin" aria-label="הגדלה">${svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M7.5 10.5h6M10.5 7.5v6"/>')}</button>
        </div>
      </footer>`;
    document.body.appendChild(root);
    ['title', 'where', 'what', 'orig', 'pick', 'body', 'foot', 'pg', 'zoom', 'close'].forEach((k) => { ui[k] = root.querySelector('.sv-' + k); });
    ui.pickWrap = root.querySelector('.sv-pick-wrap');
    ui.target = root.querySelector('[data-act="target"]');

    ui.close.addEventListener('click', () => { if (closeHandler) closeHandler(); else close(); });
    ui.what.addEventListener('click', () => ui.what.classList.toggle('sv-what-open')); /* long claims: tap to read in full */
    ui.pick.addEventListener('change', () => {
      if (!st) return;
      const v = ui.pick.value === '' ? null : +ui.pick.value;
      try { history.replaceState(history.state, '', hrefFor(st.s.slug, v)); } catch (e) { /* file:// or sandbox */ }
      retarget(v);
    });
    root.querySelector('.sv-foot').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !st || !st.pdf) return;
      const a = b.getAttribute('data-act');
      if (a === 'prev') goPage(st.cur - 1);
      else if (a === 'next') goPage(st.cur + 1);
      else if (a === 'zin') zoomBy(ZSTEP);
      else if (a === 'zout') zoomBy(1 / ZSTEP);
      else if (a === 'target') toTarget();
    });
    let raf = 0;
    ui.body.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; trackPage(); }); }, { passive: true });
    let rt = 0, lastW = window.innerWidth;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (!isOpen() || !st || !st.pdf || Math.abs(window.innerWidth - lastW) < 40) return;
        lastW = window.innerWidth;
        renderWindow(st.win, { center: hasTargetIn(st.win), page: st.cur });
      }, 220);
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ui.close.click(); }
      else if (st && st.pdf && (e.key === 'PageDown' || e.key === 'PageUp') && !e.target.closest('select')) {
        e.preventDefault(); goPage(st.cur + (e.key === 'PageDown' ? 1 : -1));
      }
    });
  }

  const hrefFor = (slug, h) => `#/source/${encodeURIComponent(slug)}${h != null ? `?h=${h}` : ''}`;

  function header() {
    const s = st.s, h = st.hl;
    ui.title.textContent = s ? s.title_he : 'המקור לא נמצא';
    const hasOrig = !!(s && s.original_url);
    ui.orig.hidden = !hasOrig;
    if (hasOrig) ui.orig.href = s.original_url;
    ui.where.innerHTML = s ? whereHTML(s, h) : '';
    ui.what.innerHTML = s ? whatHTML(s, h, st.status) : 'הקישור אולי השתנה. אפשר לחזור ולבחור מקור אחר.';
    ui.what.classList.remove('sv-what-open');
    const hl = (s && s.highlights) || [];
    ui.pickWrap.hidden = !hl.length;
    if (hl.length) {
      ui.pick.innerHTML = `<option value="">כל המסמך, בלי סימון</option>` + hl.map((x, i) =>
        `<option value="${i}"${i === st.h ? ' selected' : ''}>${i + 1}. ${esc(x.section_he)}${strong(x) ? '' : ` · ${stanceWord(x)}`}</option>`).join('');
      if (st.h == null) ui.pick.value = '';
    }
    root.setAttribute('data-status', st.status);
    root.setAttribute('data-kind', s ? s.kind : 'none');
    ui.target.hidden = !h;
  }

  function whereHTML(s, h) {
    if (!h) return `<span class="sv-where-k">איפה:</span> המסמך המלא${s.kind === 'pdf' && s.pages ? ` · ${s.pages} עמודים` : ''}`;
    let t = `<span class="sv-where-k">איפה:</span> <b>${esc(h.section_he)}</b>`;
    if (s.kind === 'pdf') {
      const file = uniq(h.segments.map((g) => g.page));
      const fileTxt = file.length > 1 ? `${file[0]}–${file[file.length - 1]}` : String(file[0]);
      const lab = (h.page_label || []).filter(Boolean);
      const labTxt = lab.length > 1 ? `${lab[0]}–${lab[lab.length - 1]}` : (lab[0] || '');
      t += labTxt && labTxt !== fileTxt
        ? ` · עמ׳ ${esc(labTxt)} במסמך <span class="sv-dim">(עמוד ${fileTxt} בקובץ)</span>`
        : ` · עמוד ${fileTxt}`;
    }
    return t;
  }

  function whatHTML(s, h, status) {
    const n = (s.highlights || []).length;
    if (s.kind === 'link-only') return 'אין למקור הזה תצוגה מקדימה (טופס או דף שירות). אפשר לפתוח אותו באתר הרשמי.';
    if (!h) return n ? `<b>${n} קטעים מסומנים במסמך.</b> בחרו קטע ברשימה כדי לקפוץ אליו.` : 'במסמך הזה אין קטע מסומן.';
    if (status === 'nomatch') return `<span class="sv-sw sv-sw-x" aria-hidden="true"></span><b>לא סומן דבר:</b> הציטוט לא נמצא במסמך מילה במילה.`;
    if (strong(h)) return `<span class="sv-sw" aria-hidden="true"></span><b>מה מודגש:</b> ${esc(h.supports_claim_he)}`;
    return `<span class="sv-sw sv-sw-loc" aria-hidden="true"></span><b>${stanceWord(h)}, מסומן במסגרת בלבד:</b> ${esc(h.supports_claim_he)}`;
  }

  function busy(msg) {
    ui.body.textContent = '';
    const m = el('div', 'sv-msg sv-busy');
    m.innerHTML = `<span class="sv-spin" aria-hidden="true"></span><span>${esc(msg)}</span>`;
    ui.body.appendChild(m);
  }

  function message(html) {
    ui.body.textContent = '';
    const m = el('div', 'sv-msg');
    m.innerHTML = html;
    ui.body.appendChild(m);
  }

  /* ---------- open / close ---------- */

  function open(slug, h, opts) {
    build();
    opts = opts || {};
    closeHandler = opts.onClose || null;
    const s = find(slug);
    const idx = s && Number.isInteger(h) && s.highlights && s.highlights[h] ? h : null;
    if (isOpen() && st && st.s && s && st.s.slug === s.slug && (st.pdf || st.frame)) { retarget(idx); return; }
    if (!isOpen()) { lastFocus = document.activeElement; prevTitle = document.title; }
    const g = ++gen;
    st = { g, s, h: idx, hl: idx != null ? s.highlights[idx] : null, status: idx != null ? 'loading' : 'none', zoom: null, win: null, cur: 1, pdf: null, frame: null };
    root.hidden = false;
    document.documentElement.classList.add('sv-open');
    ui.foot.hidden = true;
    header();
    if (s) document.title = `${s.title_he} · צום לשלום 2026`;
    if (!s) message(`<p>המקור הזה לא נמצא.</p>`);
    else if (s.kind === 'pdf') showPdf(g);
    else if (s.kind === 'html') showHtml(g);
    else message(`<p>${esc(s.title_he)}</p><p><a class="sv-orig sv-orig-lg" href="${esc(s.original_url)}" target="_blank" rel="noopener">פתח במקור הרשמי ↗</a></p>`);
    try { ui.close.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function retarget(idx) {
    if (!st || !st.s) return;
    st.h = idx;
    st.hl = idx != null ? st.s.highlights[idx] : null;
    st.status = idx != null ? 'loading' : 'none';
    header();
    if (st.pdf) {
      const want = idx != null ? windowFor(targetPages()) : windowFor([1]);
      renderWindow(want, { center: idx != null, page: want[0] === 1 && idx == null ? 1 : null });
    } else if (st.frame) markHtml();
  }

  function close() {
    if (!root || root.hidden) return;
    gen++;
    root.hidden = true;
    document.documentElement.classList.remove('sv-open');
    ui.body.textContent = '';
    st = null;
    if (prevTitle) document.title = prevTitle;
    if (lastFocus && document.contains(lastFocus) && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }

  const isOpen = () => !!(root && !root.hidden);

  /* ---------- PDF ---------- */

  function loadPdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjsP) {
      pdfjsP = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = VENDOR + 'pdf.min.js';
        sc.onload = () => {
          const L = window.pdfjsLib;
          if (!L) { pdfjsP = null; reject(new Error('pdfjs missing')); return; }
          L.GlobalWorkerOptions.workerSrc = VENDOR + 'pdf.worker.min.js';
          resolve(L);
        };
        sc.onerror = () => { pdfjsP = null; reject(new Error('pdfjs load failed')); };
        document.head.appendChild(sc);
      });
    }
    return pdfjsP;
  }

  function loadPdf(s) {
    if (!pdfCache.has(s.file)) {
      const p = loadPdfjs()
        .then((L) => fetch(s.file).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
          .then((buf) => L.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise));
      p.catch(() => pdfCache.delete(s.file));
      pdfCache.set(s.file, p);
    }
    return pdfCache.get(s.file);
  }

  function targetPages() {
    if (!st.hl) return [1];
    const ps = uniq(st.hl.segments.map((g) => g.page));
    const out = [];
    for (let p = ps[0]; p <= ps[ps.length - 1]; p++) out.push(p);
    return out;
  }
  /* One page of context on each side, so a clause near a page edge can still sit mid-screen. */
  function windowFor(pages) {
    const n = st.pdf.numPages, a = Math.max(1, pages[0] - 1), b = Math.min(n, pages[pages.length - 1] + 1);
    const out = [];
    for (let p = a; p <= b; p++) out.push(p);
    return out;
  }
  const hasTargetIn = (win) => !!(st && st.hl && win && targetPages().every((p) => win.indexOf(p) >= 0));

  async function showPdf(g) {
    busy('טוען את המסמך…');
    let pdf;
    try { pdf = await loadPdf(st.s); } catch (e) {
      if (g === gen) { st.status = st.hl ? 'error' : st.status; header(); message(`<p>לא ניתן לטעון את המסמך כרגע.</p><p><a class="sv-orig sv-orig-lg" href="${esc(st.s.original_url)}" target="_blank" rel="noopener">פתח במקור הרשמי ↗</a></p>`); }
      return;
    }
    if (g !== gen) return;
    st.pdf = pdf;
    ui.foot.hidden = false;
    await renderWindow(windowFor(targetPages()), { center: !!st.hl, page: st.hl ? null : 1 });
  }

  /* Zoom 1 = page fits the width. Default: fit the page's TEXT column; then make the clause's lines at least
     ~14px tall, but never wider than the screen (a table row stays whole). The whole page is one tap away (−). */
  async function defaultZoom(page, base, avail) {
    const fit = avail / base.width;
    let f = 1;
    try {
      const tc = await page.getTextContent();
      let x0 = Infinity, x1 = -Infinity;
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const x = it.transform[4];
        x0 = Math.min(x0, x); x1 = Math.max(x1, x + (it.width || 0));
      }
      if (x1 > x0) f = base.width / (x1 - x0 + 28);
    } catch (e) { /* keep fit-width */ }
    f = Math.max(ZMIN, Math.min(f, 1.8));
    if (fit * f > 1.6) f = Math.max(ZMIN, 1.6 / fit); /* wide screens: no giant pages */
    const first = st.hl ? st.hl.segments.find((g) => g.rects && g.rects.length) : null;
    if (first) {
      /* every rect of the quote on its first page (a table row = several cells = several segments) */
      const rs = [].concat(...st.hl.segments.filter((g) => g.page === first.page && g.rects).map((g) => g.rects));
      const hs = rs.map((r) => r[3] - r[1]).sort((a, b) => a - b);
      const lineH = hs[Math.floor(hs.length / 2)] || 10;
      const w = Math.max(...rs.map((r) => r[2])) - Math.min(...rs.map((r) => r[0]));
      f = Math.max(f, 14 / lineH / fit);
      f = Math.min(f, (avail - 24) / (w * fit));
    }
    return Math.max(ZMIN, Math.min(ZMAX, f));
  }

  function outRatio(vp) {
    const dpr = window.devicePixelRatio || 1;
    let r = Math.min(dpr * 1.5, 4);
    if (vp.width * vp.height * r * r > MAX_PX) r = Math.sqrt(MAX_PX / (vp.width * vp.height));
    return Math.max(1, r);
  }

  async function renderWindow(pages, o) {
    o = o || {};
    const g = gen, L = window.pdfjsLib, body = ui.body;
    const avail = Math.max(240, Math.min(body.clientWidth - 16, 980));
    const wrap = el('div', 'sv-pages');
    const items = [];
    for (const n of pages) {
      const page = await st.pdf.getPage(n);
      if (g !== gen) return;
      const base = page.getViewport({ scale: 1 });
      if (st.zoom == null) { st.zoom = await defaultZoom(page, base, avail); if (g !== gen) return; }
      const vp = page.getViewport({ scale: (avail / base.width) * st.zoom });
      const pe = el('div', 'sv-page');
      pe.style.width = vp.width + 'px';
      pe.style.height = vp.height + 'px';
      pe.setAttribute('data-page', String(n));
      pe.setAttribute('role', 'img');
      pe.setAttribute('aria-label', `עמוד ${n} מתוך ${st.pdf.numPages}`);
      const cv = el('canvas');
      const marks = el('div', 'sv-hls');
      const tl = el('div', 'textLayer');
      pe.append(cv, marks, tl);
      wrap.appendChild(pe);
      drawMarks(marks, n, page, vp);
      items.push({ n, page, vp, cv, tl });
    }
    body.textContent = '';
    body.appendChild(wrap);
    st.win = pages;
    ui.zoom.textContent = Math.round(st.zoom * 100) + '%';
    if (o.center && st.hl) centerMark();
    else if (o.page) scrollToPage(o.page, false);
    trackPage();
    if (st.hl && st.status === 'loading') { st.status = 'ok'; root.setAttribute('data-status', 'ok'); }
    /* Paint the clause's page first, then its neighbours. */
    const first = st.hl ? targetPages()[0] : (o.page || pages[0]);
    items.sort((a, b) => Math.abs(a.n - first) - Math.abs(b.n - first));
    for (const it of items) {
      if (g !== gen) return;
      try {
        const r = outRatio(it.vp);
        it.cv.width = Math.floor(it.vp.width * r);
        it.cv.height = Math.floor(it.vp.height * r);
        it.cv.style.width = it.vp.width + 'px';
        it.cv.style.height = it.vp.height + 'px';
        await it.page.render({ canvasContext: it.cv.getContext('2d', { alpha: false }), viewport: it.vp, transform: r !== 1 ? [r, 0, 0, r, 0, 0] : null }).promise;
        if (g !== gen) return;
        it.cv.parentNode.classList.add('painted');
        const tc = await it.page.getTextContent();
        if (g !== gen) return;
        it.tl.style.setProperty('--scale-factor', String(it.vp.scale));
        L.renderTextLayer({ textContentSource: tc, container: it.tl, viewport: it.vp, textDivs: [] });
      } catch (e) { /* a failed page stays blank; others still render */ }
    }
    root.setAttribute('data-painted', String(pages.length));
  }

  /* Rects are PDF points, origin top-left (PyMuPDF), one per highlighted line. */
  function drawMarks(layer, n, page, vp) {
    const h = st.hl;
    if (!h) return;
    const yes = strong(h), view = page.view;
    h.segments.forEach((seg, si) => {
      if (seg.page !== n || !seg.rects) return;
      let top = Infinity, bot = -Infinity;
      seg.rects.forEach((r) => {
        const q = vp.convertToViewportRectangle([view[0] + r[0], view[3] - r[3], view[0] + r[2], view[3] - r[1]]);
        const x = Math.min(q[0], q[2]), y = Math.min(q[1], q[3]), w = Math.abs(q[2] - q[0]), hh = Math.abs(q[3] - q[1]);
        const pad = Math.max(1.5, 1.8 * vp.scale);
        const m = el('i', yes ? 'sv-hl' : 'sv-loc');
        m.style.cssText = `left:${(x - pad).toFixed(1)}px;top:${(y - pad / 2).toFixed(1)}px;width:${(w + 2 * pad).toFixed(1)}px;height:${(hh + pad).toFixed(1)}px`;
        m.setAttribute('data-seg', String(si));
        layer.appendChild(m);
        top = Math.min(top, y); bot = Math.max(bot, y + hh);
      });
      if (yes && isFinite(top)) {
        const b = el('i', 'sv-bar');
        b.style.top = (top - 2).toFixed(1) + 'px';
        b.style.height = (bot - top + 4).toFixed(1) + 'px';
        layer.appendChild(b);
      }
    });
  }

  function markBox(sel) {
    const body = ui.body, br = body.getBoundingClientRect();
    let t = Infinity, b = -Infinity, l = Infinity, r = -Infinity;
    body.querySelectorAll(sel).forEach((m) => {
      const q = m.getBoundingClientRect();
      t = Math.min(t, q.top); b = Math.max(b, q.bottom); l = Math.min(l, q.left); r = Math.max(r, q.right);
    });
    if (!isFinite(t)) return null;
    return { top: t - br.top + body.scrollTop, bottom: b - br.top + body.scrollTop, left: l - br.left + body.scrollLeft, right: r - br.left + body.scrollLeft };
  }

  /* The quote on its first page, vertically centred; if that is taller than the screen, its first segment
     (top-aligned when even that is taller). Horizontally centred. */
  function centerMark() {
    const body = ui.body;
    const H = body.clientHeight, W = body.clientWidth;
    const p0 = st.hl && st.hl.segments[0] ? st.hl.segments[0].page : null;
    let box = p0 != null ? markBox(`.sv-page[data-page="${p0}"] .sv-hls [data-seg]`) : null;
    if (!box || box.bottom - box.top > H * 0.8) box = markBox('.sv-hls [data-seg="0"]');
    if (!box) return;
    let top = (box.top + box.bottom) / 2 - H / 2;
    if (box.bottom - box.top > H * 0.8) top = box.top - 24;
    let left = (box.left + box.right) / 2 - W / 2;
    if (box.right - box.left > W) left = box.right - W + 8; /* RTL text: keep the line starts (right edge) on screen */
    body.scrollTop = Math.max(0, top);
    body.scrollLeft = Math.max(0, left);
  }

  function scrollToPage(n, smooth) {
    const pe = ui.body.querySelector(`.sv-page[data-page="${n}"]`);
    if (!pe) return false;
    const top = Math.max(0, pe.offsetTop - 8);
    if (smooth && ui.body.scrollTo) ui.body.scrollTo({ top, behavior: 'smooth' }); else ui.body.scrollTop = top;
    return true;
  }

  function trackPage() {
    if (!st || !st.pdf) return;
    const body = ui.body, mid = body.scrollTop + body.clientHeight / 2;
    let cur = st.win ? st.win[0] : 1;
    body.querySelectorAll('.sv-page').forEach((pe) => { if (pe.offsetTop <= mid) cur = +pe.getAttribute('data-page'); });
    st.cur = cur;
    ui.pg.textContent = `עמוד ${cur} / ${st.pdf.numPages}`;
    root.querySelector('[data-act="prev"]').disabled = cur <= 1;
    root.querySelector('[data-act="next"]').disabled = cur >= st.pdf.numPages;
  }

  function goPage(n) {
    if (!st || !st.pdf) return;
    n = Math.max(1, Math.min(st.pdf.numPages, n));
    if (st.win && st.win.indexOf(n) >= 0) { scrollToPage(n, true); return; }
    renderWindow(windowFor([n]), { page: n });
  }

  function zoomBy(f) {
    if (!st || !st.pdf) return;
    const z = Math.max(ZMIN, Math.min(ZMAX, st.zoom * f));
    if (Math.abs(z - st.zoom) < 0.01) return;
    st.zoom = z;
    const centred = hasTargetIn(st.win) && markBox('.sv-hls [data-seg="0"]');
    renderWindow(st.win, centred ? { center: true } : { page: st.cur });
  }

  function toTarget() {
    if (!st || !st.hl) return;
    if (hasTargetIn(st.win)) centerMark();
    else renderWindow(windowFor(targetPages()), { center: true });
  }

  /* ---------- HTML snapshot ---------- */

  function showHtml(g) {
    busy('טוען את העמוד…');
    const f = el('iframe', 'sv-frame');
    f.title = st.s.title_he;
    f.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    f.setAttribute('referrerpolicy', 'no-referrer');
    f.addEventListener('load', () => {
      if (g !== gen || !st) return;
      const b = ui.body.querySelector('.sv-busy');
      if (b) b.remove();
      st.frame = f;
      markHtml();
    });
    f.src = st.s.file;
    ui.body.appendChild(f);
  }

  /* Marks, plus "fit": desktop-only pages (fixed 450–980px columns) reflow to the phone width with their own
     fonts and colours; if a layout still overflows, the whole page is scaled to fit, like a phone browser does. */
  const FRAME_CSS = `
    mark.ffp-hl{background:#ffe14d!important;color:#000!important;box-shadow:0 0 0 2px #ffe14d;border-radius:2px;padding:0;outline:0!important}
    mark.ffp-loc{background:transparent!important;color:inherit!important;outline:2px dashed #8a6220!important;outline-offset:1px;border-radius:2px;padding:0;box-shadow:none}
    html{scroll-behavior:auto!important}
    html.ffp-fit,html.ffp-fit body{overflow-x:hidden!important}
    html.ffp-reflow body{min-width:0!important;width:auto!important}
    html.ffp-reflow body *:not(img):not(svg):not(video):not(canvas):not(iframe){max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
    html.ffp-reflow img,html.ffp-reflow video,html.ffp-reflow iframe{max-width:100%!important;height:auto!important}
    html.ffp-reflow table{width:100%!important;table-layout:auto!important}
    html.ffp-reflow td,html.ffp-reflow th{width:auto!important;overflow-wrap:anywhere}
    html.ffp-reflow pre{white-space:pre-wrap!important}`;

  function fitFrame(f, doc) {
    const de = doc.documentElement, W = f.clientWidth, sw0 = de.scrollWidth;
    if (!W || sw0 <= W + 4) return 'as-is';
    de.classList.add('ffp-reflow');
    if (de.scrollWidth <= W + 4) { de.classList.add('ffp-fit'); return 'reflow'; }
    /* Absolute-positioned layouts (site builders) do not reflow: scale the original layout to fit instead. */
    de.classList.remove('ffp-reflow');
    /* Floor 0.6: below that the marked clause is ~7px text, unreadable when shown to an officer. The page then pans
       sideways and markHtml centres the clause horizontally too. */
    de.style.zoom = String(Math.max(0.6, W / sw0));
    return 'zoom';
  }

  function markHtml() {
    const f = st.frame;
    let doc = null;
    try { doc = f.contentDocument; } catch (e) { doc = null; }
    if (!doc || !doc.body) { if (st.hl) { st.status = 'nomatch'; header(); } return; }
    if (!doc.getElementById('ffp-viewer-style')) {
      const s = doc.createElement('style');
      s.id = 'ffp-viewer-style';
      s.textContent = FRAME_CSS;
      (doc.head || doc.documentElement).appendChild(s);
      root.setAttribute('data-fit', fitFrame(f, doc));
    }
    clearMarks(doc);
    const w = f.contentWindow;
    if (!st.hl) { try { w.scrollTo(0, 0); } catch (e) { /* ignore */ } root.setAttribute('data-marks', '0'); return; }
    const marks = markSegments(doc, st.hl.segments.map(segText), strong(st.hl) ? 'ffp-hl' : 'ffp-loc');
    root.setAttribute('data-marks', String(marks ? marks.length : 0));
    if (!marks) { st.status = 'nomatch'; header(); return; }
    st.status = 'ok';
    root.setAttribute('data-status', 'ok');
    const sy = window.scrollY;
    marks[0].scrollIntoView({ block: 'center', inline: root.getAttribute('data-fit') === 'zoom' ? 'center' : 'nearest' });
    /* Centre the whole quote when it fits on screen. */
    let y0 = Infinity, y1 = -Infinity;
    marks.forEach((m) => { Array.prototype.forEach.call(m.getClientRects(), (r) => { y0 = Math.min(y0, r.top); y1 = Math.max(y1, r.bottom); }); });
    if (isFinite(y0) && y1 - y0 < w.innerHeight * 0.85) w.scrollBy(0, (y0 + y1) / 2 - w.innerHeight / 2);
    if (window.scrollY !== sy) window.scrollTo(0, sy);
  }

  function clearMarks(doc) {
    doc.querySelectorAll('mark.ffp-hl, mark.ffp-loc').forEach((m) => {
      const p = m.parentNode;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      p.normalize();
    });
  }

  function indexText(doc) {
    const SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1 };
    const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentNode && SKIP[n.parentNode.nodeName] ? 2 : 1) });
    const nodes = [], map = [];
    let k = '', n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue;
      for (let i = 0; i < t.length; i++) if (K.test(t[i])) { k += t[i]; map.push([nodes.length, i]); }
      nodes.push(n);
    }
    return { nodes, map, k };
  }

  function visibleAt(doc, ix, j) {
    const [ni, off] = ix.map[j];
    const r = doc.createRange();
    try { r.setStart(ix.nodes[ni], off); r.setEnd(ix.nodes[ni], off + 1); } catch (e) { return false; }
    return r.getClientRects().length > 0;
  }

  /* All segments or nothing: find every segment (in order, first VISIBLE occurrence) before touching the DOM. */
  function markSegments(doc, segs, cls) {
    const ix = indexText(doc);
    const spans = [];
    let pos = 0;
    for (const s of segs) {
      const sk = keyOf(s);
      if (!sk) return null;
      let j = ix.k.indexOf(sk, pos);
      while (j >= 0 && !visibleAt(doc, ix, j)) j = ix.k.indexOf(sk, j + 1);
      if (j < 0) return null;
      let a = ix.map[j].slice(), b = ix.map[j + sk.length - 1].slice();
      /* Leading / trailing punctuation of the quote (e.g. the opening " of a definition) is marked too, but only
         when the page has exactly those characters right there. */
      const lead = (/^[^\sא-ת0-9A-Za-z]+/.exec(s) || [''])[0];
      const tail = (/[^\sא-ת0-9A-Za-z]+$/.exec(s) || [''])[0];
      const ta = ix.nodes[a[0]].nodeValue, tb = ix.nodes[b[0]].nodeValue;
      if (lead && a[1] >= lead.length && ta.slice(a[1] - lead.length, a[1]) === lead) a[1] -= lead.length;
      if (tail && tb.slice(b[1] + 1, b[1] + 1 + tail.length) === tail) b[1] += tail.length;
      spans.push([a, b]);
      pos = j + sk.length;
    }
    /* Wrap from the end backwards: splitting a text node keeps its head, so earlier offsets stay valid. */
    const marks = [];
    for (let si = spans.length - 1; si >= 0; si--) {
      const [a, b] = spans[si];
      for (let ni = b[0]; ni >= a[0]; ni--) {
        const node = ix.nodes[ni], t = node.nodeValue;
        const s = ni === a[0] ? a[1] : 0, e = ni === b[0] ? b[1] + 1 : t.length;
        if (!t.slice(s, e).trim()) continue;
        let mid = node;
        if (s > 0) mid = node.splitText(s);
        if (e - s < mid.nodeValue.length) mid.splitText(e - s);
        const m = doc.createElement('mark');
        m.className = cls;
        mid.parentNode.insertBefore(m, mid);
        m.appendChild(mid);
        marks.unshift(m);
      }
    }
    return marks.length ? marks : null;
  }

  window.FFPViewer = { open, close, isOpen, find, hrefFor };
})();
