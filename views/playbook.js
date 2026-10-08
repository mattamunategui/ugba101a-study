// Efficiencymaxxing: per-module exam playbook (question types + fastest method), launches practice per play.
import { HUB } from '../hub.js?v=1981078eb3';
import { h, md, mdInline, figureEl, fill, put } from '../lib/render.js?v=1981078eb3';
import * as store from '../lib/store.js?v=1981078eb3';
import { mountEngine } from './practice.js?v=1981078eb3';
import { focusTopics } from './focus.js?v=1981078eb3';

const LIKE = { 3: 'Very likely', 2: 'Likely', 1: 'Possible' };
const doneSet = () => new Set(store.get('maxdone', []) || []);
const setDone = (id, on) => { const s = doneSet(); on ? s.add(id) : s.delete(id); store.set('maxdone', [...s]); };
const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? null : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };

export function render(ctx) {
  const [playId] = ctx.params;
  const root = h('div', { class: 'wrap' + (playId ? ' engine' : '') });
  ctx.root.append(root);
  document.title = 'Efficiencymaxxing · ' + HUB.short;

  const part = store.currentPart(ctx.course);
  if (!part) { put(root, h('p', null, 'No playbook yet.')); return; }
  const files = (ctx.bundle.playbook || []).filter((f) => f.part === part.id);
  const plays = files.flatMap((f) => (f.plays || []).map((p) => ({ ...p, module: f.module, focus: [] })));
  // Fold each exam-focus topic into the play that shares the most practice questions; the rest go in "Also on the radar".
  const radar = [];
  for (const t of focusTopics(ctx).filter((t) => t.page.part === part.id)) {
    const q = new Set(t.questionIds || []);
    let best = null, n = 0;
    for (const p of plays) { const k = (p.practice || []).filter((id) => q.has(id)).length; if (k > n) { best = p; n = k; } }
    if (best) { best.focus.push(t); best.practice = [...new Set([...(best.practice || []), ...(t.questionIds || [])])]; } else radar.push(t);
  }

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
  const body = h('div');
  put(root, h('a', { class: 'back', href: '#/' }, 'Home'),
    h('h1', null, 'Efficiencymaxxing'),
    h('p', { class: 'lede' }, `Every question type on ${e?.title || 'the exam'}, and the fastest way to get it right.`, when && h('span', { class: 'muted' }, ` Exam: ${when}.`)),
    body);

  if (!mods.length && !mustknow.length) { fill(body, h('p', { class: 'muted' }, 'No playbook yet.')); return; }

  function draw() {
    const done = doneSet();
    const open = new Set([...body.querySelectorAll('details.max-play[open]')].map((d) => d.dataset.play)); // keep expanded cards open across redraws
    const kids = [];
    if (mustknow.length) kids.push(mustKnow(mustknow));
    if (radar.length) kids.push(h('section', { class: 'max-mod' }, h('h2', null, 'Also on the radar'),
      radar.map((t) => h('div', { class: 'max-ex' }, h('h4', null, t.title), h('div', { class: 'md', html: md(t.why || '') }), readLinks(t)))));
    for (const { m, plays: ps } of mods) {
      const n3 = ps.filter((p) => p.likelihood === 3).length, nd = ps.filter((p) => done.has(p.id)).length;
      kids.push(h('section', { class: 'max-mod', id: 'max-' + m.id },
        h('h2', null, h('a', { href: '#/m/' + encodeURIComponent(m.id) }, m.title)),
        h('p', { class: 'max-sum' }, `${ps.length} play${ps.length === 1 ? '' : 's'} · ${n3} very likely · ${nd} done`),
        h('div', { class: 'max-plays' }, ps.map((p) => playCard(p, done.has(p.id), open.has(p.id))))));
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
        p.focus.map((t) => h('div', { class: 'max-why' }, h('h4', null, 'Why it’s on the exam'), h('div', { class: 'md', html: md(t.why || '') }), t.figure && figureEl(t.figure))),
        p.source && h('p', { class: 'max-src' }, p.source),
        h('div', { class: 'max-actions' }, n > 0 && h('a', { class: 'btn small primary', href: `#/max/${encodeURIComponent(p.id)}` }, `Practice (${n})`),
          p.focus.map((t) => [readLinks(t), (t.cardIds || []).length > 0 && h('a', { class: 'btn small', href: `#/focus/${encodeURIComponent(t.id)}/flash` }, `Flashcards (${t.cardIds.length})`)]), doneBtn)));
  }

  function readLinks(t) {
    const ls = (t.links || []).filter((l) => ctx.mods.has(l.module));
    return ls.map((l, i) => h('a', { class: 'btn small', href: `#/m/${encodeURIComponent(l.module)}?s=${encodeURIComponent(l.section)}`, title: ctx.mods.get(l.module).title }, ls.length > 1 ? `Read ${i + 1}` : 'Read this'));
  }
  draw();
}
