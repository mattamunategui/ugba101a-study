// DOM helpers, markdown + math rendering, figures, video facade, lightbox, theme.
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  append(e, kids);
  return e;
}
export function append(e, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    e.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return e;
}
/** Replace children / append, skipping null, undefined and false. */
export function fill(el, ...kids) { el.replaceChildren(); return append(el, kids); }
export const put = (el, ...kids) => append(el, kids);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- markdown + math ----------
// Math is lifted out before marked runs (so _ and \ survive), then rendered with KaTeX after sanitizing.
const MATH_RE = /(```[\s\S]*?```|`[^`\n]*`|\\\$)|\$\$([\s\S]+?)\$\$|\$(?!\s)((?:\\.|[^$\\\n])+?)(?<!\s)\$(?!\d)/g;
const CALLOUTS = { tip: 'Tip', warning: 'Watch out', example: 'Example' };

function katexHtml(tex, display) {
  try {
    if (window.katex) return window.katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore' });
  } catch { /* fall through */ }
  return `<code>${esc(display ? '$$' + tex + '$$' : '$' + tex + '$')}</code>`;
}

export function md(src, inline = false) {
  src = String(src ?? '');
  const maths = [];
  const s = src.replace(MATH_RE, (m, code, disp, inl) => {
    if (code) return m;
    maths.push({ tex: disp ?? inl, display: disp != null });
    return `zzmath${maths.length - 1}zz`;
  });
  let html;
  if (window.marked && window.DOMPurify) {
    html = inline ? window.marked.parseInline(s, { gfm: true }) : window.marked.parse(s, { gfm: true });
    html = window.DOMPurify.sanitize(html);
    const box = document.createElement('div');
    box.innerHTML = html;
    box.querySelectorAll('blockquote').forEach((bq) => {
      const p = bq.firstElementChild;
      const m = p && p.tagName === 'P' && /^\s*\[!(tip|warning|example)\]\s*/i.exec(p.textContent);
      if (!m) return;
      const kind = m[1].toLowerCase();
      const first = p.firstChild;
      if (first && first.nodeType === 3) first.textContent = first.textContent.replace(/^\s*\[!\w+\]\s*/, '');
      if (!p.textContent.trim() && !p.children.length) p.remove();
      const div = h('div', { class: 'callout callout-' + kind }, h('div', { class: 'callout-title' }, CALLOUTS[kind]));
      while (bq.firstChild) div.append(bq.firstChild);
      bq.replaceWith(div);
    });
    box.querySelectorAll('a[href]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    box.querySelectorAll('table').forEach((t) => { const w = h('div', { class: 'table-wrap' }); t.replaceWith(w); w.append(t); });
    html = box.innerHTML;
  } else {
    html = esc(s).replace(/\n/g, '<br>');
  }
  return html.replace(/zzmath(\d+)zz/g, (_, i) => katexHtml(maths[i].tex, maths[i].display));
}
export const mdInline = (s) => md(s, true);
/** Strip markdown/math for plain-text labels. */
export function plain(s) {
  return String(s ?? '').replace(/\\\$/g, '\u0000').replace(/\$+([^$]*)\$+/g, (_, m) => m.replace(/\\[dt]?frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2').replace(/\\[a-zA-Z]+\s*|[{}^]/g, '').replace(/\*/g, '\u0001'))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`#>]/g, '').replace(/\u0000/g, '$').replace(/\u0001/g, '*').replace(/\s+/g, ' ').trim();
}

// ---------- theme ----------
export function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode; else delete root.dataset.theme;
  window.dispatchEvent(new Event('themechange'));
}
export function effectiveTheme() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => window.dispatchEvent(new Event('themechange')));

// ---------- SMILES ----------
let smiDrawer = null;
const THEMES = {
  light: { C: '#1f2430', O: '#d6402f', N: '#2c6fd1', F: '#1f9d55', CL: '#12887a', BR: '#c25a12', I: '#7b3fb0', P: '#c25a12', S: '#b08900', B: '#c25a12', SI: '#c25a12', H: '#5b6370', BACKGROUND: 'transparent' },
  dark: { C: '#e8eaf0', O: '#ff7d6e', N: '#6fa8ff', F: '#4ddb8c', CL: '#3ed1bd', BR: '#ff9a52', I: '#c796ff', P: '#ff9a52', S: '#f1d04a', B: '#ff9a52', SI: '#ff9a52', H: '#a9afbc', BACKGROUND: 'transparent' },
};
function drawSmiles(host, smiles) {
  if (!window.SmilesDrawer) { host.textContent = smiles; return; }
  smiDrawer ||= new window.SmilesDrawer.SmiDrawer({ width: 320, height: 240, padding: 12, themes: THEMES });
  host.replaceChildren();
  smiDrawer.draw(smiles, 'svg', effectiveTheme(), (svg) => {
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.setAttribute('role', 'img'); svg.setAttribute('class', 'smiles-svg');
    const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    if (vb.length === 4 && vb[2] > 0) { svg.style.width = Math.min(320, Math.max(140, vb[2] * 2.4)) + 'px'; svg.style.setProperty('--vb', vb[2]); }
    host.replaceChildren(svg);
  }, () => { host.textContent = smiles; });
}

// ---------- figures ----------
export function figureEl(fig, { small = false } = {}) {
  const f = h('figure', { class: 'fig' + (small ? ' fig-small' : '') });
  const cap = fig.caption ? plain(fig.caption) : 'Figure';
  if (fig.smiles) {
    const host = h('div', { class: 'smiles-host', role: 'img', 'aria-label': cap });
    f.append(host);
    drawSmiles(host, fig.smiles);
    const redraw = () => { if (!f.isConnected && !host.isConnected) { window.removeEventListener('themechange', redraw); return; } drawSmiles(host, fig.smiles); };
    window.addEventListener('themechange', redraw);
  } else if (fig.img) {
    const img = h('img', { src: fig.img, alt: cap, loading: 'lazy', decoding: 'async' });
    f.append(h('button', { class: 'fig-btn', type: 'button', 'aria-label': 'Enlarge figure: ' + cap, onclick: () => openLightbox(fig) }, img));
  }
  if (fig.caption || fig.credit) {
    f.append(h('figcaption', null,
      fig.caption && h('span', { class: 'cap', html: mdInline(fig.caption) }),
      fig.credit && h('span', { class: 'credit' }, fig.credit)));
  }
  return f;
}
let lb = null;
export function openLightbox(fig) {
  closeLightbox();
  const prev = document.activeElement;
  const close = () => { closeLightbox(); prev && prev.focus && prev.focus(); };
  lb = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Figure', onclick: (e) => { if (e.target === lb || e.target.classList.contains('lb-close')) close(); } },
    h('button', { class: 'lb-close', type: 'button', 'aria-label': 'Close' }, '×'),
    h('img', { src: fig.img, alt: plain(fig.caption || 'Figure') }),
    fig.caption && h('div', { class: 'lb-cap', html: mdInline(fig.caption) + (fig.credit ? ` <span class="credit">${esc(fig.credit)}</span>` : '') }));
  lb._key = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', lb._key);
  document.body.append(lb);
  lb.querySelector('.lb-close').focus();
}
export function closeLightbox() {
  if (!lb) return;
  document.removeEventListener('keydown', lb._key);
  lb.remove(); lb = null;
}

// ---------- resources ----------
export function ytId(url) {
  const m = /(?:v=|youtu\.be\/|embed\/)([\w-]{11})/.exec(url || '');
  return m ? m[1] : null;
}
export function resourceEl(r) {
  if (r.type === 'youtube' && ytId(r.url)) {
    const id = ytId(r.url);
    const play = () => {
      const src = `https://www.youtube-nocookie.com/embed/${id}?start=${parseInt(r.start) || 0}&autoplay=1&rel=0`;
      facade.replaceWith(h('iframe', { class: 'yt-frame', src, title: r.title, allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' }));
    };
    const facade = h('button', { class: 'yt-facade', type: 'button', 'aria-label': 'Play video: ' + r.title, onclick: play },
      h('img', { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, alt: '', loading: 'lazy' }),
      h('span', { class: 'yt-play', 'aria-hidden': 'true' }, 'Play'));
    return h('div', { class: 'res res-video' }, facade,
      h('div', { class: 'res-meta' },
        h('a', { class: 'res-title', href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.title),
        h('div', { class: 'res-sub' }, [r.channel, r.start ? 'starts at ' + fmtTime(r.start) : null].filter(Boolean).map((x) => h('span', null, x))),
        r.why && h('div', { class: 'res-why', html: mdInline(r.why) })));
  }
  return h('a', { class: 'res res-link', href: r.url, target: '_blank', rel: 'noopener noreferrer' },
    h('div', { class: 'res-meta' },
      h('span', { class: 'res-title' }, r.title),
      h('div', { class: 'res-sub' }, [r.channel, r.type === 'khan' ? 'Khan Academy' : null].filter((x, i, a) => x && a.indexOf(x) === i).map((x) => h('span', null, x))),
      r.why && h('div', { class: 'res-why', html: mdInline(r.why) })));
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export { fmtTime };
