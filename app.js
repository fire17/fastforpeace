/* צום לשלום 2026 — single-page hub. Vanilla JS, no build step. Content: data.js (window.FFP). */
(() => {
  'use strict';

  const D = window.FFP;
  const main = document.getElementById('main');
  if (!D) { main.innerHTML = '<div class="wrap narrow"><p class="lead-plain">שגיאה בטעינת התוכן. נסו לרענן.</p></div>'; return; }

  const LAW = D.law, OFF = D.officials, DOCS = D.docs, MAN = D.manifesto, FILES = D.files || {};
  const R = DOCS.request;
  const SITE_URL = 'https://fastforpeace.akeyo.io/';
  const STATUS_SHORT = 'בקשה 3885 · בבדיקה';
  const STATUS_FULL = R.status_full_he;
  const DISCLAIMER = OFF.disclaimer_he;

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const dove = (cls) => `<svg class="${cls || 'dove'}" aria-hidden="true"><use href="#i-dove"/></svg>`;
  const badge = (size) => `<span class="badge${size ? ' badge-' + size : ''}"><i class="dot" aria-hidden="true"></i>${STATUS_SHORT}</span>`;
  const paras = (t) => String(t).split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const lawById = (id) => LAW.sections.find((s) => s.id === id);
  const scenById = (id) => LAW.scenarios.find((s) => s.id === id);
  const cardById = (id) => OFF.cards.find((c) => c.id === id);
  const ext = (url, label, cls) => `<a class="${cls || 'cite'}" href="${esc(url)}" target="_blank" rel="noopener">${icon('ext')}<span>${esc(label)}</span></a>`;
  const CARD_ICON = { night: 'moon', 'crowd-or-speaker': 'mega', 'health-medics': 'heart', 'after-holiday': 'leaf' };

  /* ---------- sources: in-site preview links (#/source/<slug>?h=<i>, rendered by viewer.js) ---------- */
  const SRC = D.sources || [];
  const SV = window.FFPViewer || null;
  const srcBy = {}, hlAt = {}, srcByLabel = {}, srcByFile = {};
  SRC.forEach((s) => {
    srcBy[s.slug] = s;
    (s.highlights || []).forEach((h, i) => { hlAt[h.hl_id] = { slug: s.slug, h: i }; });
    (s.cited_by_links || []).forEach((l) => { srcByLabel[l] = s.slug; });
    if (s.file) srcByFile[s.file] = s.slug;
  });
  const previewable = (t) => !!(SV && t && srcBy[t.slug] && srcBy[t.slug].kind !== 'link-only' && srcBy[t.slug].file);
  /* Several quotes behind one citation: open at the first one that backs the claim (supports / obligation). */
  function pickHl(slug, ids) {
    const at = (ids || []).map((id) => hlAt[id]).filter((t) => t && t.slug === slug);
    const yes = at.find((t) => /^(supports|obligation)$/.test(srcBy[slug].highlights[t.h].stance));
    return yes || at[0] || { slug, h: null };
  }
  const citeTarget = new Map(); /* officials citation object -> { slug, h } */
  (() => {
    const byPath = {};
    SRC.forEach((s) => (s.cited_by_officials || []).forEach((c) => { byPath[c.path] = pickHl(s.slug, c.hl_ids); }));
    const add = (path, c) => { if (byPath[path]) citeTarget.set(c, byPath[path]); };
    ['police', 'inspector'].forEach((w) => (OFF[w].points || []).forEach((p, i) => (p.citations || []).forEach((c, j) => add(`officials.${w}.points[${i}].citations[${j}]`, c))));
    (OFF.cards || []).forEach((cd, i) => (cd.citations || []).forEach((c, j) => add(`officials.cards[${i}].citations[${j}]`, c)));
  })();
  const srcHref = (t) => `#/source/${encodeURIComponent(t.slug)}${t.h != null ? `?h=${t.h}` : ''}`;
  /* The captured original inside the site when we hold one; the official site otherwise (link-only sources). */
  function srcLink(t, url, label, cls) {
    if (!previewable(t)) return ext(url, label, cls);
    return `<a class="${cls || 'cite'}" href="${srcHref(t)}" data-orig="${esc(url)}">${icon('src')}<span>${esc(label)}</span></a>`;
  }
  const linkTarget = (l) => (srcByLabel[l.label_he] ? { slug: srcByLabel[l.label_he], h: null } : null);

  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { /* storage may be blocked */ }
    return null;
  }

  /* Spoken lines: a quoted part is what he says, the rest is a stage direction.
     Gershayim inside words (מ"ר, מד"א) are not quotation marks. */
  function sayHTML(t) {
    const g = String(t).replace(/([א-ת])"(?=[א-ת])/g, '$1״');
    const parts = []; const re = /"([^"]+)"/g; let last = 0, m;
    while ((m = re.exec(g))) {
      if (m.index > last) parts.push(['d', g.slice(last, m.index)]);
      parts.push(['s', m[1]]); last = re.lastIndex;
    }
    if (last < g.length) parts.push(['d', g.slice(last)]);
    if (!parts.some((p) => p[0] === 's')) return `<p class="say">${esc(t)}</p>`;
    return parts.map(([k, v]) => (k === 's' ? `<p class="say">${esc(v.trim())}</p>` : (v.trim() ? `<p class="say-dir">${esc(v.trim())}</p>` : ''))).join('');
  }

  /* Parse a hand-over letter: greeting, "key: value" rows, "Heading:" + bullets, status, closing. */
  function parseHandover(text) {
    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
    const out = { greeting: lines[0], rows: [], blocks: [], status: null, closing: null };
    let cur = null;
    for (const line of lines.slice(1)) {
      if (line.startsWith('•')) { if (cur) cur.items.push(line.replace(/^•\s*/, '')); continue; }
      const m = line.match(/^([^:]{1,16}):\s*(.*)$/);
      if (m && !m[2]) { cur = { title: m[1], items: [] }; out.blocks.push(cur); continue; }
      cur = null;
      if (m && (m[1] === 'מול העירייה' || m[1] === 'סטטוס')) out.status = { label: m[1], text: m[2] };
      else if (m && m[1] === 'בקשה בכבוד') out.closing = { label: m[1], text: m[2] };
      else if (m) out.rows.push({ label: m[1], text: m[2] });
      else out.blocks.push({ para: line });
    }
    return out;
  }
  const citeLi = (t) => { const i = t.indexOf(': '); return i > 0 ? `<li><b>${esc(t.slice(0, i))}</b> ${esc(t.slice(i + 2))}</li>` : `<li>${esc(t)}</li>`; };
  const statusBox = (text, label) => `<div class="status-box"><div class="status-head">${badge()}${label ? `<span class="status-label">${esc(label)}</span>` : ''}</div><p>${esc(text)}</p></div>`;

  function handoverHTML(h) {
    return `
      <div class="ho-rows">${h.rows.map((r) => `<div class="ho-row"><div class="ho-k">${esc(r.label)}</div><div class="ho-v">${esc(r.text)}</div></div>`).join('')}</div>
      ${h.blocks.map((b) => (b.para ? `<p>${esc(b.para)}</p>` : `<h3 class="ho-h">${esc(b.title)}</h3><ul class="ho-list">${b.items.map(citeLi).join('')}</ul>`)).join('')}
      ${h.status ? statusBox(h.status.text, h.status.label) : ''}
      ${h.closing ? `<p class="ho-closing"><b>${esc(h.closing.label)}:</b> ${esc(h.closing.text)}</p>` : ''}`;
  }

  function citesHTML(list) {
    if (!list || !list.length) return '';
    return `<ul class="cites">${list.map((c) => `<li>${srcLink(citeTarget.get(c), c.url, c.label)}</li>`).join('')}</ul>`;
  }
  function uniqueCites(groups) {
    const seen = new Set(); const out = [];
    groups.forEach((list) => (list || []).forEach((c) => { const k = c.url + '|' + c.label; if (!seen.has(k)) { seen.add(k); out.push(c); } }));
    return out;
  }

  /* One reusable player for every recording on the site.
     Transport + timeline are dir="ltr" on purpose: media time runs left→right even in Hebrew UIs
     (Material/Apple bidi guidance, YouTube/Spotify in Hebrew), labels stay Hebrew. */
  const RATES = [0.75, 1, 1.25, 1.5, 2];
  const rateLabel = (r) => r + '×';
  const fmtSpoken = (s) => { s = Math.max(0, Math.floor(s || 0)); const m = Math.floor(s / 60), r = s % 60; return (m ? `${m} דקות ` : '') + `${r} שניות`; };
  function player(who, opts) {
    if (typeof opts !== 'object') opts = { big: !!opts };
    const a = OFF[who].audio, big = !!opts.big;
    const dur = Math.round(a.duration_s || 0);
    const title = opts.title || (big ? 'האזינו להסבר הקולי' : 'הסבר קולי למסירה');
    const skip = (n, sm) => {
      const fwd = n > 0, k = Math.abs(n);
      return `<button class="pskip${sm ? ' pskip-sm' : ''}" type="button" data-skip="${n}" aria-label="${k} שניות ${fwd ? 'קדימה' : 'אחורה'}" title="${k} שניות ${fwd ? 'קדימה' : 'אחורה'}">${sm ? `<span class="pskip-n">${fwd ? '+' : '−'}${k}</span>` : `${icon(fwd ? 'fwd' : 'rew')}<span class="pskip-n">${k}</span>`}</button>`;
    };
    return `<div class="player${big ? ' player-big' : ''}${opts.compact ? ' player-compact' : ''}" data-player role="group" aria-label="${esc(title)}">
      <div class="player-head">
        <div class="player-title">${esc(title)}<span class="player-sub">${big ? 'עברית · ' : ''}${fmtTime(a.duration_s)}</span></div>
      </div>
      <div class="player-track" dir="ltr">
        <div class="player-bar" role="slider" tabindex="0" aria-label="מיקום בהקלטה" aria-valuemin="0" aria-valuemax="${dur}" aria-valuenow="0" aria-valuetext="0 שניות מתוך ${esc(fmtSpoken(dur))}">
          <div class="player-rail"><div class="player-fill"></div></div><div class="player-knob"></div><div class="player-tip" aria-hidden="true">0:00</div>
        </div>
        <div class="player-time"><span class="t-cur">0:00</span><span class="t-dur">${fmtTime(a.duration_s)}</span></div>
      </div>
      <div class="player-ctrls" dir="ltr">
        ${skip(-5, true)}${skip(-10)}
        <button class="player-btn" type="button" aria-label="השמעה">${icon('play', 'i-play')}${icon('pause', 'i-pause')}</button>
        ${skip(10)}${skip(5, true)}
      </div>
      <div class="player-rates" role="group" aria-label="מהירות השמעה">
        <span class="player-rates-k" aria-hidden="true">מהירות</span>
        <div class="player-rates-in" dir="ltr">${RATES.map((r) => `<button class="prate" type="button" data-rate="${r}" aria-pressed="${r === 1}" aria-label="מהירות ${rateLabel(r)}">${rateLabel(r)}</button>`).join('')}</div>
      </div>
      <audio preload="none">
        <source src="${esc(a.m4a)}" type="audio/mp4">
        <source src="${esc(a.mp3)}" type="audio/mpeg">
        <source src="${esc(a.ogg)}" type="audio/ogg">
      </audio>
    </div>`;
  }

  function pageHero(o) {
    return `<section class="hero hero-page"><div class="hero-in${o.narrow === false ? '' : ' hero-narrow'}">
      <a class="crumb" href="#/">${icon('arrow')}<span>לעמוד הראשי</span></a>
      ${o.kicker ? `<p class="kicker">${esc(o.kicker)}</p>` : ''}
      <h1 class="hero-title">${o.title}</h1>
      ${o.lead ? `<p class="lead">${o.lead}</p>` : ''}
      ${o.badge === false ? '' : badge()}
      ${o.extra || ''}
    </div></section>`;
  }

  const footer = () => `<footer class="foot">
      ${dove('foot-dove')}
      <p class="foot-title">צום לשלום 2026 · סוכת השלום, כיכר הבימה</p>
      <p>${esc(DISCLAIMER)}</p>
      <p class="foot-links"><a href="#/about">אודות</a><span aria-hidden="true">·</span><a href="#/docs">מסמכים</a><span aria-hidden="true">·</span><span dir="ltr">fastforpeace.akeyo.io</span></p>
    </footer>`;

  const printHead = (title) => `<div class="print-only print-head"><b>צום לשלום 2026 · ${esc(title)}</b><span>${SITE_URL.replace('https://', '').replace(/\/$/, '')} · ${esc(DISCLAIMER)}</span></div>`;

  function showFrame(inner, opts) {
    opts = opts || {};
    return `<div class="show${opts.read ? ' read' : ''}" data-scale>
      <div class="show-top">
        <span class="show-brand">${dove('show-dove')}<span>צום לשלום 2026</span></span>
        <span class="show-tools">
          <button class="show-btn" type="button" data-size aria-label="הגדלת הטקסט">${icon('text')}</button>
          <button class="show-btn show-exit" type="button" data-exit aria-label="סיום — החזר לי">${icon('x')}<span class="show-exit-t">סיום — החזר לי</span></button>
        </span>
      </div>
      <article class="show-body">${inner}</article>
      <p class="show-foot">${esc(DISCLAIMER)}</p>
    </div>`;
  }

  /* ---------- views ---------- */

  function viewHub() {
    const facts = [
      ['אדם אחד', 'בלי במה, רמקול, נאומים או תהלוכה'],
      ['צום מים', '10–14 ימים, מים בלבד'],
      ['9.99 מ״ר', '3.7 × 2.7 מ׳ · גובה 1.90 מ׳'],
      ['מעבר פתוח', 'על הריצוף, לא על הדשא'],
    ];
    const tiles = [
      ['#/law', 'law', 'החוק', 'ציטוטים מדויקים וקישור לכל מקור'],
      ['#/situations', 'chat', 'מצבים בשטח', 'מה לומר, מה להראות, מה לא לעשות'],
      ['#/request', 'file', 'בקשה 3885', 'הסטטוס, ההודעה בכתב והמסמכים'],
      ['#/manifesto', 'feather', 'המניפסט', 'למה הצום · עברית ו־English'],
      ['#/docs', 'folder', 'מסמכים רשמיים', 'כל קובצי ה־PDF, זמינים גם בלי קליטה'],
      ['#/about', 'info', 'אודות', 'מה זה האתר ואיך משתמשים בו'],
    ];
    const pillars = [
      ['#/law/police-license', 'רישיון משטרה', 'לא נדרש', 'אדם אחד, פחות מ־50 איש, בלי נאום ובלי תהלוכה.'],
      ['#/law/structure-municipal', 'הסוכה', 'עניין עירוני', 'חוק העזר של תל אביב ס׳ 39(א)(1); בג״ץ 5078/20 פדידה.'],
      ['#/request', 'העירייה', 'בקשה 3885 בבדיקה', 'הוגשה ב־01.10.2026. תשובה בכתב צפויה תוך כ־12 ימי עבודה.'],
    ];
    const ptile = (who) => {
      const P = who === 'police'; const o = OFF[who];
      return `<article class="ptile ptile-${who}">
        <a class="ptile-link" href="#/${who}" aria-label="${esc(o.greeting_he)}: לעמוד המלא"></a>
        <div class="ptile-top"><span class="ptile-ic">${icon(P ? 'police' : 'inspector')}</span><p class="ptile-kicker">${P ? 'כשניידת עוצרת' : 'כשפקח עירוני מגיע'}</p></div>
        <h2 class="ptile-title">${esc(o.greeting_he)}</h2>
        <p class="ptile-desc">${P ? 'הסבר מנומס, הקלטה קולית ומקורות: למה לא נדרש רישיון משטרה.' : 'המסגרת העירונית, סטטוס הבקשה לעירייה, הקלטה קולית ומקורות.'}</p>
        <div class="ptile-actions">
          <a class="btn btn-gold" href="#/${who}/show">${icon('handover')}<span>${P ? 'מסור לשוטר' : 'הצג לפקח'}</span></a>
          <span class="ptile-more"><span>לעמוד המלא</span>${icon('left')}</span>
        </div>
      </article>`;
    };
    return {
      title: '',
      html: `
      <section class="hero hero-hub"><div class="hero-in">
        <div class="emblem">${dove('emblem-dove')}</div>
        <p class="eyebrow">סוכת השלום · כיכר הבימה, תל אביב</p>
        <h1 class="hub-title">צום לשלום <span class="gold">2026</span></h1>
        <p class="hub-sub">צום מים בלבד של אדם אחד, בסוכה קטנה ושקטה<span class="dates">01.10.2026 – 14.10.2026</span></p>
        ${badge('lg')}
        <p class="hub-name">תמר בר זכאי · <span lang="en" dir="ltr">Fast for Peace 2026</span></p>
      </div></section>
      <section class="wrap tiles-primary">${ptile('police')}${ptile('inspector')}</section>
      <section class="wrap"><div class="facts">${facts.map(([b, s]) => `<div class="fact"><b>${b}</b><span>${s}</span></div>`).join('')}</div></section>
      <section class="wrap">
        <h2 class="sec-title">בקצרה: למה זה לפי החוק</h2>
        <div class="pillars">${pillars.map(([href, k, v, t], i) => `<a class="pillar" href="${href}"><span class="pillar-n">${i + 1}</span><span class="pillar-txt"><small>${k}</small><b>${v}</b><span>${t}</span></span>${icon('left', 'pillar-go')}</a>`).join('')}</div>
      </section>
      <section class="wrap">
        <h2 class="sec-title">כל החומרים</h2>
        <div class="tiles">${tiles.map(([href, ic, t, s]) => `<a class="tile" href="${href}"><span class="tile-ic">${icon(ic)}</span><b>${t}</b><span>${s}</span></a>`).join('')}</div>
        <p class="offline-note" data-offline hidden>${icon('check')}<span>האתר נשמר במכשיר וזמין גם בלי קליטה, כולל ההקלטות והמסמכים.</span></p>
      </section>
      ${footer()}`,
    };
  }

  const READ_SETS = {
    police: ['patrol-check', 'needs-license', 'night-check', 'crowd-or-speaker', 'removal-order'],
    inspector: ['inspector-permit', 'after-holiday', 'night-check', 'removal-order'],
  };

  function viewOfficial(who, rest) {
    if (rest[0] === 'show') return showOfficial(who);
    if (rest[0] === 'read') return readOfficial(who);
    const P = who === 'police'; const o = OFF[who]; const h = parseHandover(o.handover_he);
    const label = P ? 'מסור לשוטר' : 'הצג לפקח';
    return {
      title: o.greeting_he,
      html: `${pageHero({
        kicker: P ? 'למסירה לשוטר' : 'להצגה לפקח העירוני',
        title: esc(o.greeting_he),
        lead: P ? 'צום מים שקט של אדם אחד בסוכה קטנה. לא נדרש רישיון משטרה, והסוכה עצמה היא עניין עירוני.' : 'סוכה קטנה של 9.99 מ״ר על הריצוף, והמעבר פתוח. לגבי הסוכה הוגשה בקשה לעירייה, והיא בבדיקה.',
      })}
      <div class="wrap narrow page">
        ${printHead(o.greeting_he)}
        <div class="actions-main">
          <a class="btn btn-gold btn-xl" href="#/${who}/show">${icon('handover')}<span><b>${label}</b><small>מסך מלא, טקסט גדול והקלטה</small></span></a>
          <a class="btn btn-ghost btn-xl" href="#/${who}/read">${icon('mic')}<span><b>קרא בקול</b><small>מה אני אומר, מילה במילה</small></span></a>
        </div>
        ${player(who)}
        <h2 class="sec-title">ההסבר המלא</h2>
        <div class="doc-card"><p class="doc-greet">${esc(h.greeting)}</p>${handoverHTML(h)}</div>
        <h2 class="sec-title">הנקודות העיקריות, עם מקורות</h2>
        <div class="points">${o.points.map((p) => `<article class="point"><h3>${esc(p.title_he)}</h3><p>${esc(p.body_he)}</p>${citesHTML(p.citations)}</article>`).join('')}</div>
        <div class="row-actions no-print">
          <button class="btn btn-ghost btn-sm" type="button" data-share>${icon('share')}<span>שיתוף</span></button>
          <button class="btn btn-ghost btn-sm" type="button" data-print>${icon('print')}<span>הדפסה</span></button>
          <a class="btn btn-ghost btn-sm" href="#/${P ? 'inspector' : 'police'}">${icon(P ? 'inspector' : 'police')}<span>${P ? 'לעמוד הפקח' : 'לעמוד השוטר'}</span></a>
        </div>
        <p class="disclaimer">${esc(DISCLAIMER)}</p>
      </div>
      ${footer()}`,
    };
  }

  function showOfficial(who) {
    const o = OFF[who]; const h = parseHandover(o.handover_he);
    const i = h.greeting.indexOf(', ');
    const hello = i > 0 ? h.greeting.slice(0, i) : h.greeting;
    const sub = i > 0 ? h.greeting.slice(i + 2) : '';
    const cites = uniqueCites(o.points.map((p) => p.citations));
    return {
      mode: 'show', title: o.greeting_he, exit: '#/' + who,
      html: showFrame(`
        <p class="show-kicker">צום לשלום 2026 · סוכת השלום</p>
        <h1 class="show-greet">${esc(hello)}${sub ? `<span class="show-greet-sub">${esc(sub)}</span>` : ''}</h1>
        ${player(who, true)}
        ${handoverHTML(h)}
        <h2 class="ho-h show-src-title">המקורות</h2>
        ${citesHTML(cites)}`),
    };
  }

  function readOfficial(who) {
    const P = who === 'police';
    const items = READ_SETS[who].map(scenById).filter(Boolean);
    return {
      mode: 'read', title: 'קרא בקול', exit: '#/' + who,
      html: showFrame(`
        <p class="show-kicker">קרא בקול · ${P ? 'מול שוטר' : 'מול פקח'}</p>
        <p class="read-intro">בקול רגוע ולאט. אחרי כל משפט, להקשיב.</p>
        ${items.map((s) => `<section class="read-item">
          <p class="read-when">${esc(s.title_he)}</p>
          <div class="read-say">${sayHTML(s.what_to_say_he)}</div>
          <p class="read-dont"><b>לא:</b> ${esc(s.dont_he)}</p>
        </section>`).join('')}
        <div class="read-end"><a class="btn btn-gold" href="#/${who}/show">${icon('handover')}<span>${P ? 'מסור לשוטר' : 'הצג לפקח'} במקום זה</span></a></div>`, { read: true }),
    };
  }

  function viewLaw(rest) {
    const [id, sub] = rest;
    if (id && sub === 'show' && lawById(id)) return showLaw(id);
    const pillars = [
      ['#/law/police-license', 'רישיון משטרה', 'לא נדרש', 'פקודת המשטרה ס׳ 83–84; הנחיית היועמ״ש 3.1200; נוהל 221.110.19 נספח ד׳.'],
      ['#/law/structure-municipal', 'הסוכה', 'עניין עירוני', 'חוק העזר של תל אביב ס׳ 39(א)(1); בג״ץ 5078/20 פדידה, פס׳ 3.'],
      ['#/law/general-tent-permit', 'ההיתר הכללי', 'אוהל בלבד', 'עד 48 שעות. הסוכה לא נשענת עליו: נדרש היתר פרטני (ס׳ 6); בקשה 3885 בבדיקה.'],
    ];
    return {
      title: 'החוק',
      html: `${pageHero({ kicker: 'החוק', title: 'מה החוק אומר', lead: 'ציטוטים מדויקים מהמקורות הרשמיים, עם קישור לכל מקור. נבדק ב־01.10.2026.' })}
      <div class="wrap narrow page">
        <div class="pillars pillars-law">${pillars.map(([href, k, v, t], i) => `<a class="pillar" href="${href}"><span class="pillar-n">${i + 1}</span><span class="pillar-txt"><small>${k}</small><b>${v}</b><span>${t}</span></span>${icon('chev', 'pillar-go')}</a>`).join('')}</div>
        <h2 class="sec-title">הנושאים</h2>
        <div class="acc">${LAW.sections.map((s, i) => `<details class="acc-item law-sec" id="law-${s.id}"${id === s.id ? ' open' : ''}>
          <summary><span class="acc-num">${i + 1}</span><span class="acc-title">${esc(s.title_he)}</span>${icon('chev', 'acc-chev')}</summary>
          <div class="acc-body">
            <p class="law-summary">${esc(s.summary_he)}</p>
            ${s.quotes.map((q, qi) => quoteHTML(q, s.id, qi)).join('')}
            <div class="sec-actions no-print">
              <a class="btn btn-ghost btn-sm" href="#/law/${s.id}/show">${icon('handover')}<span>הצג במסך מלא</span></a>
              <button class="btn btn-ghost btn-sm" type="button" data-share="#/law/${s.id}">${icon('share')}<span>קישור לנושא</span></button>
            </div>
          </div>
        </details>`).join('')}</div>
        <h2 class="sec-title">שאלות ותשובות</h2>
        <div class="acc faq">${LAW.faq.map((f) => `<details class="acc-item"><summary><span class="acc-title">${esc(f.q_he)}</span>${icon('chev', 'acc-chev')}</summary><div class="acc-body"><p>${esc(f.a_he)}</p></div></details>`).join('')}</div>
        <h2 class="sec-title">כל המקורות</h2>
        <ul class="linklist">${LAW.links.map((l) => `<li>${srcLink(linkTarget(l), l.url, l.label_he, 'link-row')}</li>`).join('')}</ul>
        <p class="disclaimer">${esc(DISCLAIMER)}</p>
      </div>${footer()}`,
      after: id ? () => { const el = document.getElementById('law-' + id); if (el) { el.open = true; requestAnimationFrame(() => el.scrollIntoView({ block: 'start' })); } return true; } : null,
    };
  }

  /* law.json quote i of section sid is highlight "<sid>.q<i>" in content/sources.json. */
  function quoteHTML(q, sid, i) {
    const t = sid != null ? hlAt[`${sid}.q${i}`] || null : null;
    return `<figure class="quote"><blockquote>${esc(q.text_he)}</blockquote><figcaption><span class="q-src">${esc(q.source_name_he)}</span><span class="q-sec">${esc(q.section)}</span>${srcLink(t, q.url, previewable(t) ? 'הצג במקור' : 'למקור')}</figcaption></figure>`;
  }

  function showLaw(id) {
    const s = lawById(id);
    return {
      mode: 'show', title: s.title_he, exit: '#/law/' + id,
      html: showFrame(`
        <p class="show-kicker">צום לשלום 2026 · מה החוק אומר</p>
        <h1 class="show-title">${esc(s.title_he)}</h1>
        <p class="show-lead">${esc(s.summary_he)}</p>
        ${s.quotes.map((q, qi) => quoteHTML(q, s.id, qi)).join('')}`),
    };
  }

  function lawChip(id) {
    if (id === 'request-3885') return `<a class="chip" href="#/request">${icon('file')}<span>בקשה 3885 · בבדיקה</span></a>`;
    const s = lawById(id); if (!s) return '';
    return `<a class="chip" href="#/law/${id}">${icon('law')}<span>${esc(s.title_he)}</span></a>`;
  }

  function viewSituations(rest) {
    const [id, sub] = rest;
    if (id && sub === 'show' && scenById(id)) return showScenario(id);
    return {
      title: 'מצבים בשטח',
      html: `${pageHero({ kicker: 'בשטח', title: 'מצבים בשטח', lead: 'לכל מצב שעלול לקרות: מה לומר, מה להראות, ומה לא לעשות.' })}
      <div class="wrap narrow page">
        <h2 class="sec-title">כרטיסים להצגה</h2>
        <p class="sec-lead">כרטיס קצר לגורם רשמי, במסך מלא. לוחצים ומוסרים את הטלפון.</p>
        <div class="cards4">${OFF.cards.map((c) => `<a class="ocard" href="#/cards/${c.id}/show"><span class="ocard-ic">${icon(CARD_ICON[c.id] || 'info')}</span><b>${esc(c.title_he)}</b><span class="ocard-go">${icon('handover')}<span>הצג</span></span></a>`).join('')}</div>
        <h2 class="sec-title">תרחישים</h2>
        <div class="acc">${LAW.scenarios.map((s) => `<details class="acc-item scen" id="sc-${s.id}"${id === s.id ? ' open' : ''}>
          <summary><span class="acc-title">${esc(s.title_he)}</span>${icon('chev', 'acc-chev')}</summary>
          <div class="acc-body">
            <p class="scen-sit">${esc(s.situation_he)}</p>
            <div class="scen-block"><h4>${icon('mic')}מה לומר</h4><div class="say-box">${sayHTML(s.what_to_say_he)}</div></div>
            <div class="scen-block"><h4>${icon('law')}מה להראות</h4><div class="chips">${s.what_to_show.map(lawChip).join('')}</div></div>
            <div class="scen-block scen-dont"><h4>${icon('x')}מה לא לעשות</h4><p>${esc(s.dont_he)}</p></div>
            <div class="sec-actions no-print"><a class="btn btn-gold btn-sm" href="#/situations/${s.id}/show">${icon('handover')}<span>הצג במסך מלא</span></a></div>
          </div>
        </details>`).join('')}</div>
      </div>${footer()}`,
      after: id ? () => { const el = document.getElementById('sc-' + id); if (el) { el.open = true; requestAnimationFrame(() => el.scrollIntoView({ block: 'start' })); } return true; } : null,
    };
  }

  function showScenario(id) {
    const s = scenById(id);
    const know = s.what_to_show.map(lawById).filter(Boolean);
    return {
      mode: 'show', title: s.title_he, exit: '#/situations/' + id,
      html: showFrame(`
        <p class="show-kicker">צום לשלום 2026 · סוכת השלום</p>
        <div class="show-say">${sayHTML(s.what_to_say_he)}</div>
        <h2 class="ho-h">מה כדאי לדעת</h2>
        ${know.map((k) => `<section class="know"><h3>${esc(k.title_he)}</h3><p>${esc(k.summary_he)}</p>${k.quotes[0] ? quoteHTML(k.quotes[0], k.id, 0) : ''}</section>`).join('')}`),
    };
  }

  function viewCards(rest) {
    const [id] = rest; const c = cardById(id);
    if (!c) return viewSituations([]);
    return {
      mode: 'show', title: c.title_he, exit: '#/situations',
      html: showFrame(`
        <p class="show-kicker">צום לשלום 2026 · סוכת השלום</p>
        <h1 class="show-title"><span class="show-title-ic">${icon(CARD_ICON[c.id] || 'info')}</span>${esc(c.title_he)}</h1>
        <p class="show-lead">${esc(c.body_he)}</p>
        ${statusBox(STATUS_FULL)}
        <h2 class="ho-h show-src-title">המקורות</h2>
        ${citesHTML(c.citations)}`),
    };
  }

  function letterHTML(text) {
    const blocks = text.split(/\n{2,}/);
    return blocks.map((b, i) => {
      const t = esc(b.trim()).replace(/\n/g, '<br>');
      if (i === 0) return `<p class="l-title">${t}</p>`;
      if (/^תאריך:/.test(b)) return `<p class="l-date">${t}</p>`;
      if (/^הנדון:/.test(b)) return `<p class="l-subj">${t}</p>`;
      if (/^בכבוד רב/.test(b)) return `<p class="l-sign">${t}</p>`;
      return `<p>${t}</p>`;
    }).join('');
  }

  function requestTimeline() {
    return `<ol class="timeline">
      <li class="tl-done"><span class="tl-dot"></span><p class="tl-when">01.10.2026 · 07:00</p><p class="tl-what">שיחה מקדימה לעירייה</p></li>
      <li class="tl-done"><span class="tl-dot"></span><p class="tl-when">01.10.2026</p><p class="tl-what">הבקשה הוגשה בטופס המקוון, עם הודעה בכתב</p><p class="tl-note">מסך האישור: הפנייה נקלטה בעירייה, קיבלה את המספר 3885 והועברה לטיפול.</p></li>
      <li class="tl-now"><span class="tl-dot"></span><p class="tl-when">עכשיו</p><p class="tl-what">בבדיקה</p><p class="tl-note">לא ניתן היתר, ועדיין לא התקבלה תשובה.</p></li>
      <li class="tl-next"><span class="tl-dot"></span><p class="tl-when">תוך כ־12 ימי עבודה</p><p class="tl-what">תשובה בכתב מהעירייה</p><p class="tl-note">לפי דף ההנחיות של העירייה, התשובה נשלחת במייל. בסירוב, התשובה כוללת את הסיבות.</p></li>
    </ol>`;
  }

  function viewRequest(rest) {
    if (rest[0] === 'show') return showRequest();
    const details = R.details.filter((d) => !/^תיאור האירוע/.test(d.label_he));
    const desc = R.details.find((d) => /^תיאור האירוע/.test(d.label_he));
    const img = (f, cap, sub) => `<figure class="docfig"><a href="${f}" target="_blank" rel="noopener"><img src="${f}" alt="${esc(cap)}" loading="lazy" decoding="async"></a><figcaption>${esc(cap)}<small>${esc(sub)}</small></figcaption></figure>`;
    return {
      title: 'בקשה 3885',
      html: `${pageHero({ kicker: 'העירייה', title: 'בקשה 3885', lead: 'הבקשה הפרטנית לעיריית תל אביב-יפו להצבת סוכת השלום לכל תקופת הצום.', badge: false })}
      <div class="wrap narrow page">
        <div class="status-hero">
          ${badge('lg')}
          <p class="status-hero-text">${esc(STATUS_FULL)}</p>
          <p class="status-hero-note">בקשה בבדיקה אינה היתר, ואין עדיין החלטה: לא אישור ולא סירוב.</p>
        </div>
        ${requestTimeline()}
        <div class="row-actions no-print">
          <a class="btn btn-gold btn-sm" href="#/request/show">${icon('handover')}<span>הצג לפקח</span></a>
          <button class="btn btn-ghost btn-sm" type="button" data-share>${icon('share')}<span>שיתוף</span></button>
        </div>
        <h2 class="sec-title">פרטי הבקשה</h2>
        <dl class="dl">${details.map((d) => `<div class="dl-row"><dt>${esc(d.label_he)}</dt><dd>${esc(d.value_he)}</dd></div>`).join('')}</dl>
        ${desc ? `<details class="acc-item desc"><summary><span class="acc-title">${esc(desc.label_he)}</span>${icon('chev', 'acc-chev')}</summary><div class="acc-body">${paras(desc.value_he.replace(/\n/g, '\n\n'))}</div></details>` : ''}
        <h2 class="sec-title">ההודעה בכתב שצורפה</h2>
        ${R.notice_caption_he ? `<p class="letter-caption" role="note">${esc(R.notice_caption_he)}</p>` : ''}
        <div class="letter">${letterHTML(R.notice_letter_he)}</div>
        <p class="sec-lead">עותק לפרסום: ת.ז., טלפון ודוא״ל הוסרו.</p>
        <h2 class="sec-title">המסמכים</h2>
        <div class="docfigs">
          ${img('docs/request-3885-submitted-redacted.png', 'עותק הבקשה שהוגשה', 'פרטים אישיים הושחרו')}
          ${img('docs/notice-3885-redacted.png', 'ההודעה בכתב', 'פרטים אישיים הוסרו')}
        </div>
        <div class="row-actions">
          <a class="btn btn-ghost btn-sm" href="docs/notice-3885-redacted.pdf" target="_blank" rel="noopener">${icon('file')}<span>ההודעה (PDF)</span></a>
          <a class="btn btn-ghost btn-sm" href="#/docs">${icon('folder')}<span>כל המסמכים</span></a>
        </div>
        <h2 class="sec-title">מה קורה עכשיו</h2>
        <p class="body-text">${esc(R.what_happens_next_he)}</p>
      </div>${footer()}`,
    };
  }

  function showRequest() {
    const pick = ['מספר פנייה למעקב', 'תאריך הפנייה', 'מגיש הבקשה', 'שם האירוע', 'אתר', 'הערה לכתובת', 'מידות הסוכה (מתוך תיאור האירוע)', 'מספר המשתתפים (הערכה)', 'תאריך ושעת התחלה', 'תאריך ושעת סיום'];
    const rows = pick.map((l) => R.details.find((d) => d.label_he === l)).filter(Boolean);
    return {
      mode: 'show', title: 'בקשה 3885', exit: '#/request',
      html: showFrame(`
        <p class="show-kicker">עיריית תל אביב-יפו · בקשה לקיום אירוע במרחב הציבורי</p>
        <h1 class="show-title">פנייה 3885</h1>
        ${statusBox(STATUS_FULL)}
        <div class="ho-rows ho-rows-wide">${rows.map((d) => `<div class="ho-row"><div class="ho-k">${esc(d.label_he.replace(' (מתוך תיאור האירוע)', '').replace(' (הערכה)', ''))}</div><div class="ho-v">${esc(d.value_he)}</div></div>`).join('')}</div>
        <h2 class="ho-h">ההודעה בכתב שצורפה</h2>
        ${R.notice_caption_he ? `<p class="letter-caption" role="note">${esc(R.notice_caption_he)}</p>` : ''}
        <div class="letter">${letterHTML(R.notice_letter_he)}</div>
        <h2 class="ho-h">עותק הבקשה שהוגשה</h2>
        <a class="show-img" href="docs/request-3885-submitted-redacted.png" target="_blank" rel="noopener"><img src="docs/request-3885-submitted-redacted.png" alt="עותק הבקשה שהוגשה, פנייה 3885. פרטים אישיים הושחרו." loading="lazy"></a>`),
    };
  }

  function manifestoHTML(text) {
    return String(text).split(/\n{2,}/).map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return '';
      const fmt = (l) => esc(l).replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
      let html = ''; let buf = [];
      const flush = () => { if (buf.length) { html += `<p>${buf.map(fmt).join('<br>')}</p>`; buf = []; } };
      lines.forEach((l) => { if (/^>\s?/.test(l)) { flush(); html += `<blockquote>${fmt(l.replace(/^>\s?/, ''))}</blockquote>`; } else buf.push(l); });
      flush();
      return html;
    }).join('');
  }

  function viewManifesto(rest) {
    const en = rest[0] === 'en';
    const tabs = `<div class="tabs" role="tablist" aria-label="שפה">
      <a role="tab" href="#/manifesto" aria-selected="${!en}">עברית</a>
      <a role="tab" href="#/manifesto/en" aria-selected="${en}" lang="en">English</a></div>`;
    return {
      title: en ? 'Manifesto' : 'המניפסט',
      html: `${pageHero({ kicker: en ? 'Manifesto · המניפסט' : 'המניפסט', title: en ? '<span lang="en" dir="ltr">The only path to security is peace</span>' : 'הדרך היחידה לבטחון היא שלום', badge: false, extra: tabs })}
      <div class="wrap narrow page">
        <article class="manifesto" ${en ? 'lang="en" dir="ltr"' : 'lang="he"'}>
          ${manifestoHTML(en ? MAN.en : MAN.he)}
          <p class="sig">${en ? '— Tamar Bar Zakai' : '— תמר בר זכאי'}</p>
        </article>
        <div class="row-actions no-print">
          <button class="btn btn-ghost btn-sm" type="button" data-share>${icon('share')}<span>${en ? 'Share' : 'שיתוף'}</span></button>
        </div>
      </div>${footer()}`,
    };
  }

  function viewDocs() {
    const row = (p) => {
      const type = /\.pdf$/i.test(p.file) ? 'PDF' : 'PNG';
      const size = FILES[p.file];
      const pv = srcByFile[p.file] ? { slug: srcByFile[p.file], h: null } : null;
      const openBtn = previewable(pv)
        ? `<a class="btn btn-ghost btn-sm" href="${srcHref(pv)}">${icon('src')}<span>פתיחה</span></a>`
        : `<a class="btn btn-ghost btn-sm" href="${esc(p.file)}" target="_blank" rel="noopener">${icon('ext')}<span>פתיחה</span></a>`;
      return `<article class="docrow">
        <span class="ftype ftype-${type.toLowerCase()}" aria-hidden="true">${type}</span>
        <div class="docrow-main">
          <h3>${esc(p.label_he)}</h3>
          <p>${esc(p.note_he)}</p>
          <div class="docmeta">
            ${openBtn}
            <a class="btn btn-ghost btn-sm" href="${esc(p.file)}" download>${icon('download')}<span>הורדה</span></a>
            ${size ? `<span class="size">${type} · ${fmtSize(size)}</span>` : ''}
          </div>
        </div>
      </article>`;
    };
    const mine = DOCS.pdfs.filter((p) => /3885/.test(p.file));
    const official = DOCS.pdfs.filter((p) => !/3885/.test(p.file));
    const audio = ['police', 'inspector'].map((w) => {
      const a = OFF[w].audio;
      return `<article class="docrow docrow-audio">
        <span class="ftype ftype-audio" aria-hidden="true">${icon('mic')}</span>
        <div class="docrow-main">
          <h3>הסבר קולי · ${esc(OFF[w].greeting_he)}</h3>
          <p>הקלטה בעברית, ${fmtTime(a.duration_s)} דקות.</p>
        </div>
        <div class="docrow-wide">
          ${player(w, { title: 'האזנה', compact: true })}
          <div class="docmeta">
            <a class="btn btn-ghost btn-sm" href="${esc(a.mp3)}" download>${icon('download')}<span>MP3</span></a>
            <a class="btn btn-ghost btn-sm" href="${esc(a.m4a)}" download>${icon('download')}<span>M4A</span></a>
            ${FILES[a.mp3] ? `<span class="size">${fmtSize(FILES[a.mp3])}</span>` : ''}
          </div>
        </div>
      </article>`;
    }).join('');
    return {
      title: 'מסמכים',
      html: `${pageHero({ kicker: 'מסמכים', title: 'כל המסמכים', lead: 'כל הקבצים שמורים באתר עצמו, וזמינים גם בלי קליטה אחרי הפתיחה הראשונה.', badge: false })}
      <div class="wrap narrow page">
        <h2 class="sec-title">הבקשה לעירייה · 3885</h2>
        <div class="doclist">${mine.map(row).join('')}</div>
        <h2 class="sec-title">מסמכים רשמיים</h2>
        <div class="doclist">${official.map(row).join('')}</div>
        <h2 class="sec-title">ההקלטות</h2>
        <div class="doclist">${audio}</div>
        <h2 class="sec-title">מקורות רשמיים</h2>
        <ul class="linklist">${LAW.links.map((l) => `<li>${srcLink(linkTarget(l), l.url, l.label_he, 'link-row')}</li>`).join('')}</ul>
      </div>${footer()}`,
    };
  }

  function viewAbout() {
    const facts = [
      ['האירוע', 'צום לשלום 2026 · Fast for Peace 2026'],
      ['מי', 'תמר בר זכאי, אדם אחד'],
      ['מה', 'צום מים בלבד, 10–14 ימים, בסוכה קטנה: סוכת השלום'],
      ['איפה', 'כיכר הבימה, תל אביב. על הריצוף, לא על הדשא; המעבר להולכי רגל פתוח'],
      ['מתי', '01.10.2026 – 14.10.2026'],
      ['הסוכה', '3.7 × 2.7 מ׳ (9.99 מ״ר), גובה 1.90 מ׳'],
      ['מה אין', 'רמקול, מגפון, במה, נאומים או תהלוכה'],
      ['העירייה', STATUS_FULL],
    ];
    return {
      title: 'אודות',
      html: `${pageHero({ kicker: 'אודות', title: 'מה זה האתר', lead: 'מקום אחד לכל החומרים של צום לשלום 2026, כדי שלא יהיה צורך לחפש הודעות ותמונות בטלפון.' })}
      <div class="wrap narrow page">
        <h2 class="sec-title">איך משתמשים</h2>
        <ol class="steps">
          <li><b>כשמגיע שוטר או פקח:</b> פותחים את האתר, לוחצים <a href="#/police/show">מסור לשוטר</a> או <a href="#/inspector/show">הצג לפקח</a>, ומוסרים את הטלפון. המסך מתמלא בטקסט גדול, עם כפתור ▶ להסבר הקולי. הכפתור "סיום — החזר לי" מחזיר למקום הקודם.</li>
          <li><b>כשאני מדבר בעצמי:</b> "קרא בקול" מציג את המשפטים לפי מצב, בטקסט גדול על רקע כהה.</li>
          <li><b>בלי קליטה:</b> אחרי הפתיחה הראשונה, כל האתר נשמר במכשיר, כולל ההקלטות וקובצי ה־PDF.</li>
          <li><b>להוספה למסך הבית:</b> בתפריט הדפדפן, "הוספה למסך הבית". האתר נפתח כמו אפליקציה.</li>
        </ol>
        <p class="offline-note" data-offline hidden>${icon('check')}<span>האתר נשמר במכשיר הזה וזמין גם בלי קליטה.</span></p>
        <h2 class="sec-title">העובדות</h2>
        <dl class="dl">${facts.map(([k, v]) => `<div class="dl-row"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <h2 class="sec-title">יושר ופרטיות</h2>
        <div class="points points-1">
          <article class="point"><h3>הסטטוס כפי שהוא</h3><p>${esc(STATUS_FULL)}. באתר אין טענה שניתן היתר. כשתגיע תשובה בכתב מהעירייה, היא תעודכן כאן.</p></article>
          <article class="point"><h3>מקורות</h3><p>כל טענה משפטית מקושרת למקור רשמי, עם הסעיף המדויק. המקורות נבדקו ב־01.10.2026. הנחיית היועמ״ש מקושרת מעותק באתר עדאלה, כי עותק gov.il לא אומת.</p></article>
          <article class="point"><h3>פרטיות</h3><p>באתר אין מספר תעודת זהות, מספר טלפון או כתובת דוא״ל. במסמכים שמוצגים כאן הפרטים האלה הושחרו או הוסרו.</p></article>
        </div>
        <h2 class="sec-title" lang="en" dir="ltr">In English</h2>
        <p class="body-text en" lang="en" dir="ltr">Fast for Peace 2026: a solo, water-only fast of 10–14 days by Tamar Bar Zakai, in a small peace sukkah ("Sukkat HaShalom") at Habima Square, Tel Aviv, 01.10.2026 – 14.10.2026. One person, no speaker, stage or march; the sukkah (3.7 × 2.7 m, 9.99 m²) stands on the paving and the walkway stays open. A request to the Tel Aviv-Yafo municipality (no. 3885) was submitted on 01.10.2026 and is under review.</p>
        <p class="disclaimer">${esc(DISCLAIMER)}</p>
      </div>${footer()}`,
    };
  }

  function viewNotFound() {
    return {
      title: 'לא נמצא',
      html: `${pageHero({ kicker: 'שגיאה', title: 'העמוד לא נמצא', lead: 'הקישור אולי השתנה. כל החומרים נמצאים בעמוד הראשי.', badge: false })}
      <div class="wrap narrow page"><a class="btn btn-gold" href="#/">${icon('home')}<span>לעמוד הראשי</span></a></div>${footer()}`,
    };
  }

  const ROUTES = {
    '': viewHub,
    police: (r) => viewOfficial('police', r),
    inspector: (r) => viewOfficial('inspector', r),
    law: viewLaw,
    situations: viewSituations,
    cards: viewCards,
    request: viewRequest,
    manifesto: viewManifesto,
    docs: viewDocs,
    about: viewAbout,
  };

  /* ---------- behaviour ---------- */

  function pauseAll(except) {
    document.querySelectorAll('audio').forEach((a) => { if (a !== except) { try { a.pause(); } catch (e) { /* ignore */ } } });
  }

  function bindPlayers(root) {
    const getRate = () => { const r = parseFloat(store('ffp-rate')); return RATES.indexOf(r) >= 0 ? r : 1; };
    root.querySelectorAll('[data-player]').forEach((pl) => {
      const au = pl.querySelector('audio'), btn = pl.querySelector('.player-btn'), bar = pl.querySelector('.player-bar');
      const fill = pl.querySelector('.player-fill'), knob = pl.querySelector('.player-knob'), tip = pl.querySelector('.player-tip');
      const cur = pl.querySelector('.t-cur'), dur = pl.querySelector('.t-dur');
      const title = (pl.querySelector('.player-title') || {}).firstChild;
      const maxD = () => (au.duration && isFinite(au.duration) ? au.duration : +bar.getAttribute('aria-valuemax'));
      let pending = null, dragging = false;
      const now = () => (pending != null ? pending : au.currentTime || 0);

      const paint = (t) => {
        const d = maxD(); const f = d ? Math.min(1, Math.max(0, t / d)) : 0;
        const pct = (f * 100).toFixed(2) + '%';
        fill.style.width = pct; knob.style.left = pct; tip.style.left = pct;
        cur.textContent = fmtTime(t); tip.textContent = fmtTime(t);
        bar.setAttribute('aria-valuenow', String(Math.round(t)));
        bar.setAttribute('aria-valuetext', `${fmtSpoken(t)} מתוך ${fmtSpoken(d)}`);
      };
      /* Seek works before the file has loaded: remember the target and apply it on metadata. */
      const seekTo = (t) => {
        t = Math.min(maxD(), Math.max(0, t));
        if (au.readyState >= 1) { try { au.currentTime = t; pending = null; } catch (e) { pending = t; } } else pending = t;
        paint(t);
      };
      const setRate = (r) => {
        au.defaultPlaybackRate = r; au.playbackRate = r;
        pl.querySelectorAll('[data-rate]').forEach((b) => b.setAttribute('aria-pressed', String(+b.getAttribute('data-rate') === r)));
      };
      setRate(getRate());

      const play = () => {
        pauseAll(au);
        pl.classList.add('loading');
        au.playbackRate = au.defaultPlaybackRate;
        const p = au.play();
        if (p && p.catch) p.catch(() => { pl.classList.remove('loading'); toast('לא ניתן לנגן כרגע. נסו שוב.'); });
      };
      const toggle = () => { if (au.paused) play(); else au.pause(); };
      btn.addEventListener('click', toggle);
      pl.querySelectorAll('[data-skip]').forEach((b) => b.addEventListener('click', () => seekTo(now() + +b.getAttribute('data-skip'))));
      pl.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', () => {
        const r = +b.getAttribute('data-rate'); store('ffp-rate', String(r));
        document.querySelectorAll('[data-player]').forEach((o) => { const x = o.querySelector('audio'); x.defaultPlaybackRate = r; x.playbackRate = r; o.querySelectorAll('[data-rate]').forEach((c) => c.setAttribute('aria-pressed', String(+c.getAttribute('data-rate') === r))); });
        setRate(r);
      }));

      au.addEventListener('loadedmetadata', () => {
        if (isFinite(au.duration)) { dur.textContent = fmtTime(au.duration); bar.setAttribute('aria-valuemax', String(Math.round(au.duration))); }
        if (pending != null) { try { au.currentTime = pending; } catch (e) { /* ignore */ } pending = null; }
        au.playbackRate = au.defaultPlaybackRate;
      });
      au.addEventListener('playing', () => { pl.classList.remove('loading'); pl.classList.add('playing'); btn.setAttribute('aria-label', 'השהיה'); mediaSession(au, title ? title.textContent : document.title, play, seekTo, now); });
      au.addEventListener('pause', () => { pl.classList.remove('playing', 'loading'); btn.setAttribute('aria-label', 'השמעה'); });
      au.addEventListener('ended', () => { pl.classList.remove('playing'); });
      au.addEventListener('timeupdate', () => { if (!dragging && pending == null) paint(au.currentTime); });

      /* Scrubber: tap jumps to that exact moment, drag scrubs with a live time bubble. LTR timeline. */
      const fromX = (x) => { const r = bar.getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)) * maxD(); };
      bar.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        e.preventDefault(); dragging = true; pl.classList.add('scrubbing');
        try { bar.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        bar.focus({ preventScroll: true });
        paint(fromX(e.clientX));
      });
      bar.addEventListener('pointermove', (e) => { if (dragging) paint(fromX(e.clientX)); });
      const end = (e) => {
        if (!dragging) return;
        dragging = false; pl.classList.remove('scrubbing');
        seekTo(fromX(e.clientX));
      };
      bar.addEventListener('pointerup', end);
      bar.addEventListener('pointercancel', () => { dragging = false; pl.classList.remove('scrubbing'); paint(now()); });

      const KEYS = { ArrowRight: 5, ArrowLeft: -5, ArrowUp: 5, ArrowDown: -5, PageUp: 10, PageDown: -10 };
      bar.addEventListener('keydown', (e) => {
        if (KEYS[e.key] != null) { seekTo(now() + KEYS[e.key] * (e.shiftKey ? 2 : 1)); e.preventDefault(); }
        else if (e.key === 'Home') { seekTo(0); e.preventDefault(); }
        else if (e.key === 'End') { seekTo(maxD()); e.preventDefault(); }
        else if (e.key === ' ' || e.key === 'Enter' || e.code === 'KeyK') { toggle(); e.preventDefault(); }
      });
      /* Anywhere inside the player: j / l = ±10 s, k = play/pause (video-player convention). */
      pl.addEventListener('keydown', (e) => {
        if (e.target === bar || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.code === 'KeyJ') { seekTo(now() - 10); e.preventDefault(); }
        else if (e.code === 'KeyL') { seekTo(now() + 10); e.preventDefault(); }
        else if (e.code === 'KeyK') { toggle(); e.preventDefault(); }
      });
    });
  }

  /* Lock-screen / headset controls on phones (feature-detected). */
  function mediaSession(au, title, play, seekTo, now) {
    if (!('mediaSession' in navigator)) return;
    try {
      const ms = navigator.mediaSession;
      if (window.MediaMetadata) ms.metadata = new MediaMetadata({ title, artist: 'צום לשלום 2026', artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] });
      ms.setActionHandler('play', play);
      ms.setActionHandler('pause', () => au.pause());
      ms.setActionHandler('seekbackward', (d) => seekTo(now() - ((d && d.seekOffset) || 10)));
      ms.setActionHandler('seekforward', (d) => seekTo(now() + ((d && d.seekOffset) || 10)));
      ms.setActionHandler('seekto', (d) => { if (d && d.seekTime != null) seekTo(d.seekTime); });
    } catch (e) { /* some actions unsupported */ }
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = document.querySelector('.toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
  }

  async function share(hash) {
    const url = SITE_URL + (hash || location.hash || '#/');
    const title = document.title;
    if (navigator.share) {
      try { await navigator.share({ title, text: 'צום לשלום 2026 · סוכת השלום, כיכר הבימה', url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); toast('הקישור הועתק'); return; } catch (e) { /* fall through */ }
    const ta = document.createElement('textarea'); ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('הקישור הועתק'); } catch (e) { toast(url); }
    ta.remove();
  }

  /* Screen wake lock while handing over (feature-detected). */
  let wakeLock = null;
  async function lockOn() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch (e) { wakeLock = null; }
  }
  function lockOff() { if (wakeLock) { try { wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; } }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (document.body.classList.contains('is-show') || document.body.classList.contains('is-read'))) lockOn();
  });

  const SCALES = [1, 1.14, 1.3];
  function applyScale(el) {
    const i = Math.min(SCALES.length - 1, Math.max(0, parseInt(store('ffp-scale') || '0', 10) || 0));
    el.style.setProperty('--s', SCALES[i]);
    return i;
  }

  function updateNav(key) {
    document.querySelectorAll('[data-nav]').forEach((a) => {
      const k = a.getAttribute('data-nav');
      if (k === key || (k === 'home' && key === '')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /* The one encoding this browser will play: the same order as the <source> list (m4a, mp3, ogg). The service worker
     keeps only that one offline. */
  const AUDIO_EXT = (() => {
    try { const a = document.createElement('audio'); if (a.canPlayType('audio/mp4')) return 'm4a'; if (a.canPlayType('audio/mpeg')) return 'mp3'; if (a.canPlayType('audio/ogg')) return 'ogg'; } catch (e) { /* ignore */ }
    return 'mp3';
  })();

  async function markOffline(root) {
    const els = root.querySelectorAll('[data-offline]');
    if (!els.length || !('caches' in window)) return;
    try {
      const hit = await caches.match('docs/notice-3885-redacted.pdf');
      const hit2 = await caches.match(`audio/police.${AUDIO_EXT}`);
      if (hit && hit2) els.forEach((e) => { e.hidden = false; });
    } catch (e) { /* ignore */ }
  }

  const scrollMemo = {};
  let inApp = false;
  let lastMode = 'page';

  function parse(hash) {
    return (hash == null ? location.hash : hash).replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch (e) { return p; } });
  }

  /* Source viewer = an overlay route. The page underneath is NOT re-rendered while it is open, so closing it
     (back button, ✕, Esc) lands on the exact spot it was opened from, open accordions included. */
  let baseHash = null;
  let viewerFromApp = false;
  const isSourceHash = (h) => parse(h)[0] === 'source';
  function route() {
    const parts = parse();
    if (parts[0] === 'source' && SV) {
      if (baseHash == null) render('#/'); /* deep link: the hub sits underneath */
      const q = new URLSearchParams(location.hash.split('?')[1] || '');
      const h = /^\d+$/.test(q.get('h') || '') ? +q.get('h') : null;
      SV.open(parts[1] || '', h, { onClose: closeViewer });
      return;
    }
    if (SV && SV.isOpen()) {
      SV.close();
      if ((location.hash || '#/') === baseHash) return;
    }
    render();
  }
  function closeViewer() {
    if (viewerFromApp && history.length > 1) history.back();
    else location.hash = baseHash || '#/';
  }

  function render(hashOverride) {
    pauseAll();
    const parts = parse(hashOverride);
    baseHash = hashOverride || location.hash || '#/';
    const key = parts[0] || '';
    const fn = Object.prototype.hasOwnProperty.call(ROUTES, key) ? ROUTES[key] : viewNotFound;
    const view = fn(parts.slice(1)) || viewNotFound();
    const mode = view.mode || 'page';
    const body = document.body;
    body.classList.toggle('is-show', mode === 'show');
    body.classList.toggle('is-read', mode === 'read');
    body.setAttribute('data-route', key || 'home');
    main.innerHTML = view.html;
    document.title = view.title ? `${view.title} · צום לשלום 2026` : 'צום לשלום 2026 · סוכת השלום';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', mode === 'show' ? (matchMedia('(prefers-color-scheme: dark)').matches ? '#0a1422' : '#f5efe3') : '#0b1828');

    if (mode === 'show' || mode === 'read') lockOn(); else lockOff();

    main.querySelectorAll('[data-exit]').forEach((b) => b.addEventListener('click', () => {
      if (inApp && history.length > 1) history.back(); else location.hash = view.exit || '#/';
    }));
    const scaled = main.querySelector('[data-scale]');
    if (scaled) {
      applyScale(scaled);
      main.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => {
        const i = (applyScale(scaled) + 1) % SCALES.length; store('ffp-scale', String(i)); applyScale(scaled);
        toast(['טקסט רגיל', 'טקסט גדול', 'טקסט גדול מאוד'][i]);
      }));
    }
    main.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => window.print()));
    bindPlayers(main);
    updateNav(key);
    markOffline(main);

    const here = baseHash;
    let handled = false;
    if (view.after) handled = !!view.after(main);
    if (!handled) {
      if (lastMode !== 'page' && mode === 'page' && scrollMemo[here] != null) window.scrollTo(0, scrollMemo[here]);
      else window.scrollTo(0, 0);
    }
    lastMode = mode;
    if (inApp) main.focus({ preventScroll: true });
  }

  window.addEventListener('hashchange', (e) => {
    let old = '#/';
    try { old = new URL(e.oldURL).hash || '#/'; } catch (err) { /* ignore */ }
    const fromSource = isSourceHash(old), toSource = isSourceHash();
    if (!fromSource) scrollMemo[old] = window.scrollY;
    if (toSource && !fromSource) viewerFromApp = true;
    else if (!toSource) viewerFromApp = false;
    inApp = true;
    route();
  });

  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-share]');
    if (s) { e.preventDefault(); share(s.getAttribute('data-share') || ''); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (SV && SV.isOpen()) { closeViewer(); return; }
      const x = main.querySelector('[data-exit]'); if (x) x.click();
    }
  });
  window.addEventListener('beforeprint', () => document.querySelectorAll('details').forEach((d) => { d.open = true; }));

  route();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'backfilled') markOffline(main); });
      navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
        /* Fill in whatever the install could not fetch (documents, snapshots, this browser's audio encoding). */
        if (reg.active) reg.active.postMessage({ type: 'backfill', audio: AUDIO_EXT });
        setTimeout(() => markOffline(main), 1500);
      }).catch(() => { /* offline cache unavailable */ });
    });
  }
})();
