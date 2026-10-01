import { HUB } from '../hub.js?v=183898d02e';
import { h, md, mdInline, figureEl, resourceEl, fill, put } from '../lib/render.js?v=183898d02e';
import * as store from '../lib/store.js?v=183898d02e';

export const GSI_LEVEL = { 3: 'Exam question', 2: 'Emphasized', 1: 'Covered' };
export const levelPill = (l) => h('span', { class: 'gsi-lv lv' + l, title: HUB.focus.short + ' level ' + l + ' of 3' },
  h('span', { class: 'gsi-dots', 'aria-hidden': 'true' }, [1, 2, 3].map((i) => h('i', { class: i <= l ? 'on' : '' }))), GSI_LEVEL[l] || 'Covered');

export function render(ctx) {
  const [id] = ctx.params;
  const mod = ctx.mods.get(id);
  const { root } = ctx;
  if (!mod) { put(root, h('div', { class: 'wrap' }, h('p', null, 'Module not found. '), h('a', { href: '#/' }, 'Back home'))); return; }
  const part = ctx.course.parts.find((p) => p.modules.includes(id));
  const order = part ? part.modules : [];
  const pos = order.indexOf(id);
  const prev = pos > 0 ? ctx.mods.get(order[pos - 1]) : null;
  const next = pos >= 0 && pos < order.length - 1 ? ctx.mods.get(order[pos + 1]) : null;
  document.title = mod.title + ' · ' + HUB.short;

  const sections = mod.sections || [];
  const target = new URLSearchParams((location.hash.split('?')[1] || '')).get('s');
  const targetIdx = sections.findIndex((x) => x.id === target);
  const readEls = new Map(); // sectionId -> {tocLink, btn, section}
  const updateProgress = () => {
    const n = store.readCount(id);
    progText.textContent = `${Math.min(n, sections.length)} of ${sections.length} sections read`;
    progFill.style.width = (sections.length ? (100 * Math.min(n, sections.length)) / sections.length : 0) + '%';
  };
  const paint = (sid) => {
    const e = readEls.get(sid); const on = store.isRead(id, sid);
    e.toc.classList.toggle('read', on);
    e.sec.classList.toggle('is-read', on);
    e.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    e.btn.textContent = on ? '✓ Read' : 'Mark read';
    e.btn.classList.toggle('on', on);
    updateProgress();
  };

  const progText = h('span', null), progFill = h('div', { class: 'progress-fill' });
  const q = (mod.questions || []).length;

  // header
  const head = h('header', { class: 'mod-head' },
    h('a', { class: 'back', href: '#/' }, '← All modules'),
    h('div', { class: 'eyebrow' }, lectureLabel(mod.lecture)),
    h('h1', null, mod.title),
    mod.summary && h('p', { class: 'lede', html: mdInline(mod.summary) }),
    h('div', { class: 'mini-progress' }, h('div', { class: 'progress' }, progFill), progText),
    (mod.objectives || []).length > 0 && h('div', { class: 'objectives card-box' }, h('h2', null, 'Learning objectives'),
      h('ul', null, mod.objectives.map((o) => h('li', { html: mdInline(o) })))),
    (mod.textbookRefs || []).length > 0 && h('p', { class: 'muted small' }, 'Textbook: ' + mod.textbookRefs.join(', ')));

  // sections
  const main = h('div', { class: 'mod-main' });
  const toc = h('ol', { class: 'toc' });
  sections.forEach((s, i) => {
    const sid = 'sec-' + s.id;
    const btn = h('button', { class: 'btn small read-toggle', type: 'button', 'aria-pressed': 'false', onclick: () => { store.setRead(id, s.id, !store.isRead(id, s.id)); paint(s.id); } }, 'Mark read');
    const sec = h('section', { class: 'sec', id: sid, 'aria-labelledby': sid + '-h' },
      h('div', { class: 'sec-head' }, h('h2', { id: sid + '-h' }, h('span', { class: 'sec-n' }, String(i + 1)), ' ', s.heading), btn),
      h('div', { class: 'md', html: md(s.body) }));
    (s.figures || []).forEach((f) => sec.append(figureEl(f)));
    const gsi = (s.gsiFocus || []).filter((g) => g && g.text);
    if (gsi.length) sec.append(h('aside', { class: 'gsi-focus', 'aria-label': HUB.focus.label },
      h('div', { class: 'gf-title' }, '🎯 ' + HUB.focus.label),
      h('ul', { class: 'gf-list' }, [...gsi].sort((a, b) => (b.level || 1) - (a.level || 1)).map((g) => h('li', null,
        h('span', { class: 'gf-text', html: mdInline(g.text) }),
        h('span', { class: 'gf-meta' }, levelPill(g.level || 1), g.source && h('span', { class: 'gf-src' }, g.source)))))));
    const emph = s.profEmphasis || [];
    if (emph.length) sec.append(h('aside', { class: 'prof-emph', 'aria-label': 'Professor emphasis' },
      h('div', { class: 'pe-title' }, emph.length > 1 ? `★ Professor emphasis (${emph.length})` : '★ Professor emphasis'),
      h('ul', { class: 'pe-list' }, emph.map((e) => h('li', null,
        h('span', { class: 'pe-text', html: mdInline(e.text) }),
        e.source && h('span', { class: 'pe-src' }, e.source))))));
    if ((s.resources || []).length) sec.append(h('div', { class: 'res-list' }, h('h3', null, 'Watch / read'), s.resources.map(resourceEl)));
    const sentinel = h('div', { class: 'sentinel', 'aria-hidden': 'true', 'data-sid': s.id });
    sec.append(sentinel);
    main.append(sec);
    const tl = h('a', { href: '#', onclick: (e) => { e.preventDefault(); sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, s.heading);
    const top = Math.max(0, ...(s.gsiFocus || []).map((g) => g.level || 1));
    const li = h('li', null, tl, top >= 2 && h('span', { class: 'gsi-chip', title: HUB.focus.label + ': ' + GSI_LEVEL[top] }, '🎯 ' + HUB.focus.short + ' focus'));
    toc.append(li);
    readEls.set(s.id, { toc: li, btn, sec, sentinel });
  });

  if ((mod.keyTakeaways || []).length) main.append(h('section', { class: 'takeaways card-box' }, h('h2', null, 'Key takeaways'), h('ul', null, mod.keyTakeaways.map((t) => h('li', { html: mdInline(t) })))));
  if ((mod.resources || []).length) main.append(h('section', { class: 'sec' }, h('h2', null, 'More resources'), h('div', { class: 'res-list' }, mod.resources.map(resourceEl))));
  main.append(q > 0
    ? h('a', { class: 'cta', href: '#/practice/' + id }, h('span', { class: 'cta-big' }, `Practice: ${q} question${q > 1 ? 's' : ''}`), h('span', { class: 'cta-sub' }, scoreText(store.moduleScore(mod))), h('span', { class: 'cta-arrow', 'aria-hidden': 'true' }, '→'))
    : h('p', { class: 'muted' }, 'No practice questions yet.'));
  main.append(h('nav', { class: 'pn', 'aria-label': 'Module navigation' },
    prev ? h('a', { class: 'pn-link', href: '#/m/' + prev.id }, h('span', null, '← Previous'), h('strong', null, prev.title)) : h('span'),
    next ? h('a', { class: 'pn-link next', href: '#/m/' + next.id }, h('span', null, 'Next →'), h('strong', null, next.title)) : h('span')));

  const side = h('aside', { class: 'mod-side' }, h('div', { class: 'toc-box' }, h('div', { class: 'toc-title' }, 'On this page'), toc,
    q > 0 && h('a', { class: 'btn primary small', href: '#/practice/' + id }, 'Practice →')));

  main.prepend(head);
  put(root, h('div', { class: 'wrap wide' }, h('div', { class: 'mod-layout' }, main, side)));
  sections.forEach((s) => paint(s.id));

  // deep link: #/m/<module>?s=<section> scrolls to that section (twice, since lazy figures shift the layout)
  if (targetIdx >= 0) {
    const el = readEls.get(sections[targetIdx].id).sec;
    const go = () => { if (el.isConnected) el.scrollIntoView({ block: 'start' }); };
    el.classList.add('flash-target');
    requestAnimationFrame(go);
    const t1 = setTimeout(go, 400), t2 = setTimeout(() => { go(); el.classList.remove('flash-target'); }, 1200);
    ctx.onCleanup(() => { clearTimeout(t1); clearTimeout(t2); });
  }
  // auto-mark read when scrolled through
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting || en.boundingClientRect.top < 0) {
          const sid = en.target.dataset.sid;
          if (!store.isRead(id, sid)) { store.setRead(id, sid, true); paint(sid); }
          io.unobserve(en.target);
        }
      }
    }, { threshold: 0 });
    // let layout settle (figures lazy-load) before observing
    const t = setTimeout(() => { let i = 0; readEls.forEach((e) => { if (i++ >= targetIdx) io.observe(e.sentinel); }); }, 600);
    ctx.onCleanup(() => { clearTimeout(t); io.disconnect(); });
  }
  // highlight current section in the TOC
  if ('IntersectionObserver' in window && sections.length) {
    const cur = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { readEls.forEach((e) => e.toc.classList.remove('current')); readEls.get(en.target.dataset.sid)?.toc.classList.add('current'); }
    }, { rootMargin: '-20% 0px -70% 0px' });
    sections.forEach((s) => { readEls.get(s.id).sec.dataset.sid = s.id; cur.observe(readEls.get(s.id).sec); });
    ctx.onCleanup(() => cur.disconnect());
  }
}
export function lectureLabel(l) {
  if (!l || !l.length) return 'Module';
  return l.length === 1 ? `Lecture ${l[0]}` : `Lectures ${Math.min(...l)}–${Math.max(...l)}`;
}
export function scoreText(s) {
  if (!s.attempted) return 'Not started';
  return `${s.correct}/${s.total} correct · ${s.attempted} attempted`;
}
