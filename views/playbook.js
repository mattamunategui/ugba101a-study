// Efficiencymaxxing: per-module exam playbook (question types + fastest method), launches practice per play.
import { HUB } from '../hub.js?v=002235cafa';
import { h, md, mdInline, fill, put } from '../lib/render.js?v=002235cafa';
import * as store from '../lib/store.js?v=002235cafa';
import { mountEngine } from './practice.js?v=002235cafa';

const LIKE = { 3: 'Very likely', 2: 'Likely', 1: 'Possible' };
const doneSet = () => new Set(store.get('maxdone', []) || []);
const setDone = (id, on) => { const s = doneSet(); on ? s.add(id) : s.delete(id); store.set('maxdone', [...s]); };
const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? null : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };

export function render(ctx) {
  const [playId] = ctx.params;
  const root = h('div', { class: 'wrap' + (playId ? ' engine' : '') });
  ctx.root.append(root);
  document.title = 'Efficiencymaxxing · ' + HUB.short;

  const parts = ctx.course.parts;
  let part = parts.find((p) => p.id === store.get('part', null)) || parts[0];
  if (!part) { put(root, h('p', null, 'No playbook yet.')); return; }
  const files = (ctx.bundle.playbook || []).filter((f) => f.part === part.id);
  const plays = files.flatMap((f) => (f.plays || []).map((p) => ({ ...p, module: f.module })));

  if (playId) {
    const play = plays.find((p) => p.id === playId);
    const back = h('a', { class: 'back', href: '#/max' }, 'Efficiencymaxxing');
    const by = new Map(store.allQuestionItems(ctx.bundle).map((it) => [it.q.id, it]));
    const items = play ? (play.practice || []).map((id) => by.get(id)).filter(Boolean) : [];
    if (!items.length) { put(root, back, h('p', null, 'No practice questions linked to this play.')); return; }
    ctx.onCleanup(mountEngine(root, { title: play.title.replace(/\$/g, ''), items, backHref: '#/max', backLabel: 'Efficiencymaxxing', mods: ctx.mods }));
    return;
  }

  const mustknow = files.filter((f) => f.mustknow);
  const mods = (part.modules || []).map((id) => ({ m: ctx.mods.get(id), plays: plays.filter((p) => p.module === id) })).filter((x) => x.m && x.plays.length);
  const e = part.exam, when = e && fmtDate(e.start);
  const flags = { likely: !!store.get('max-likely', false), hide: !!store.get('max-hide', false) };
  const body = h('div');
  put(root, h('a', { class: 'back', href: '#/' }, 'Home'),
    h('h1', null, 'Efficiencymaxxing'),
    h('p', { class: 'lede' }, `Every question type on ${e?.title || 'the exam'}, and the fastest way to get it right.`, when && h('span', { class: 'muted' }, ` Exam: ${when}.`)),
    body);

  if (!mods.length && !mustknow.length) { fill(body, h('p', { class: 'muted' }, 'No playbook yet.')); return; }

  function draw() {
    const done = doneSet();
    const open = new Set([...body.querySelectorAll('details.max-play[open]')].map((d) => d.dataset.play)); // keep expanded cards open across redraws
    const show = (p) => (!flags.likely || p.likelihood === 3) && (!flags.hide || !done.has(p.id));
    const toggle = (key, storeKey, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: flags[key], onchange: (ev) => { flags[key] = ev.target.checked; store.set(storeKey, flags[key]); draw(); } }), ' ' + label);
    const kids = [];
    if (mustknow.length) kids.push(mustKnow(mustknow));
    kids.push(h('div', { class: 'max-controls' },
      h('div', { class: 'max-chips', role: 'group', 'aria-label': 'Jump to module' }, mods.map(({ m }) => h('button', { class: 'max-chip', type: 'button', onclick: () => document.getElementById('max-' + m.id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }) }, m.title.replace(/^(Module|Lecture)\s*\d+\s*[:.\-–]?\s*/i, '') || m.title))),
      h('div', { class: 'max-toggles' }, toggle('likely', 'max-likely', 'Very likely only'), toggle('hide', 'max-hide', 'Hide done'))));
    for (const { m, plays: ps } of mods) {
      const vis = ps.filter(show);
      const n3 = ps.filter((p) => p.likelihood === 3).length, nd = ps.filter((p) => done.has(p.id)).length;
      kids.push(h('section', { class: 'max-mod', id: 'max-' + m.id },
        h('h2', null, h('a', { href: '#/m/' + encodeURIComponent(m.id) }, m.title)),
        h('p', { class: 'max-sum' }, `${ps.length} play${ps.length === 1 ? '' : 's'} · ${n3} very likely · ${nd} done`),
        vis.length ? h('div', { class: 'max-plays' }, vis.map((p) => playCard(p, done.has(p.id), open.has(p.id)))) : h('p', { class: 'muted small' }, 'Nothing to show with these filters.')));
    }
    fill(body, ...kids);
  }

  function mustKnow(fs) {
    const key = 'max-mustknow-open';
    const d = h('details', { class: 'max-must', open: store.get(key, true) !== false, ontoggle: () => store.set(key, d.open) },
      h('summary', null, fs[0].title || 'Must-know cold'),
      h('div', { class: 'max-cols' }, fs.flatMap((f) => f.mustknow).map((g) => h('div', { class: 'max-group' }, h('h3', null, g.title), h('ul', null, (g.items || []).map((i) => h('li', { html: mdInline(i) })))))));
    return d;
  }

  function playCard(p, isDone, isOpen) {
    const n = (p.practice || []).filter((id) => ctx.qIndex.has(id)).length;
    const doneBtn = h('button', { class: 'btn small max-got' + (isDone ? ' on' : ''), type: 'button', 'aria-pressed': String(isDone), onclick: () => { setDone(p.id, !isDone); draw(); document.querySelector(`[data-play="${p.id}"] .max-got`)?.focus(); } }, isDone ? '✓ Got it' : 'Got it');
    return h('details', { class: 'max-play lk' + p.likelihood + (isDone ? ' done' : ''), 'data-play': p.id, open: isOpen },
      h('summary', null,
        h('span', { class: 'max-top' }, h('span', { class: 'max-title', html: mdInline(p.title) }), isDone && h('span', { class: 'max-tick', title: 'Got it' }, '✓'), h('span', { class: 'max-badge lk' + p.likelihood }, LIKE[p.likelihood] || 'Possible')),
        h('span', { class: 'max-spot', html: mdInline(p.spot || '') })),
      h('div', { class: 'max-body' },
        h('h4', null, 'Steps'), h('ol', null, (p.steps || []).map((s) => h('li', { html: mdInline(s) }))),
        p.example && h('div', { class: 'max-ex' }, h('h4', null, 'Example'), h('div', { class: 'md', html: md('**Q.** ' + p.example.q, true) }), h('div', { class: 'md', html: md('**A.** ' + p.example.a, true) })),
        (p.traps || []).length > 0 && h('ul', { class: 'max-traps' }, p.traps.map((t) => h('li', null, h('span', { 'aria-hidden': 'true' }, '⚠ '), h('span', { html: mdInline(t) })))),
        p.source && h('p', { class: 'max-src' }, p.source),
        h('div', { class: 'max-actions' }, n > 0 && h('a', { class: 'btn small primary', href: `#/max/${encodeURIComponent(p.id)}` }, `Practice (${n})`), doneBtn)));
  }
  draw();
}
