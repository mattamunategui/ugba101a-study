// Exam focus (top-priority source): topics grouped by level, with deep links, practice sets and flashcards.
import { HUB } from '../hub.js?v=06d3f64d6b';
import { h, md, figureEl, fill, put } from '../lib/render.js?v=06d3f64d6b';
import * as store from '../lib/store.js?v=06d3f64d6b';
import { mountEngine } from './practice.js?v=06d3f64d6b';
import { flash } from './memorize.js?v=06d3f64d6b';
import { levelPill } from './module.js?v=06d3f64d6b';

/** All topics across focus pages (optionally for one page), with their page. */
export function focusTopics(ctx, pageId = null) {
  return (ctx.bundle.focus || []).filter((f) => !pageId || f.id === pageId).flatMap((f) => (f.topics || []).map((t) => ({ ...t, page: f })));
}
const questionItems = (ctx, ids) => {
  const by = new Map(store.allQuestionItems(ctx.bundle).map((it) => [it.q.id, it]));
  return (ids || []).map((id) => by.get(id)).filter(Boolean);
};
const gsiOrder = (items) => items.map((it, i) => [it, i]).sort((a, b) => (b[0].q.gsi || 0) - (a[0].q.gsi || 0) || a[1] - b[1]).map((x) => x[0]);

export function render(ctx) {
  const [a, mode] = ctx.params;
  const root = h('div', { class: 'wrap' + (mode ? ' engine' : '') });
  ctx.root.append(root);
  document.title = 'Exam focus · ' + HUB.short;

  if (a === 'all' && mode === 'practice') {
    const items = gsiOrder(store.allQuestionItems(ctx.bundle).filter((it) => it.q.gsi));
    if (!items.length) { put(root, h('a', { class: 'back', href: '#/focus' }, 'Exam focus'), h('p', null, 'No ' + HUB.focus.short + '-tagged questions yet.')); return; }
    ctx.onCleanup(mountEngine(root, { title: `All ${HUB.focus.short} focus questions (${items.length})`, items, backHref: '#/focus', backLabel: 'Exam focus', defaultOrder: 'gsi' }));
    return;
  }
  const topic = a && focusTopics(ctx).find((t) => t.id === a);
  if (topic && mode === 'practice') {
    const items = questionItems(ctx, topic.questionIds);
    if (!items.length) { put(root, h('a', { class: 'back', href: '#/focus/' + a }, 'Exam focus'), h('p', null, 'No questions linked to this topic yet.')); return; }
    ctx.onCleanup(mountEngine(root, { title: topic.title, items, backHref: '#/focus/' + a, backLabel: 'Exam focus', defaultOrder: 'gsi' }));
    return;
  }
  if (topic && mode === 'flash') {
    const where = new Map();
    for (const d of ctx.bundle.decks) for (const c of d.cards) where.set(c.id, { c, d });
    const found = (topic.cardIds || []).map((id) => where.get(id)).filter(Boolean);
    if (!found.length) { put(root, h('a', { class: 'back', href: '#/focus/' + a }, 'Exam focus'), h('p', null, 'No flashcards linked to this topic yet.')); return; }
    const deckOf = new Map(found.map((x) => [x.c.id, x.d]));
    flash(ctx, root, { id: '', title: topic.title, fieldLabels: {} }, found.map((x) => x.c), true, { backHref: '#/focus/' + a, deckOf: (c) => deckOf.get(c.id) });
    return;
  }

  // overview (all pages, one page by id, or all with one topic highlighted)
  const pageOnly = a && !topic && (ctx.bundle.focus || []).some((f) => f.id === a) ? a : null;
  const topics = focusTopics(ctx, pageOnly);
  const modTitle = (id) => ctx.mods.get(id)?.title;
  const wrap = h('div', { class: 'focus-head' });
  put(root, h('a', { class: 'back', href: '#/' }, 'Home'), wrap);
  const body = h('div');
  put(root, body);

  function draw() {
    const done = store.focusDone();
    const nDone = topics.filter((t) => done.has(t.id)).length;
    const nQ = store.allQuestionItems(ctx.bundle).filter((it) => it.q.gsi).length;
    fill(wrap, h('h1', null, HUB.focus.label),
      h('p', { class: 'lede' }, HUB.focus.blurb),
      (ctx.bundle.focus || []).filter((f) => f.description && (!pageOnly || f.id === pageOnly)).map((f) =>
        h('details', { class: 'focus-about' }, h('summary', null, 'How to use this page and the exam format'), h('div', { class: 'md', html: md(f.description) }))),
      topics.length > 0 && h('div', { class: 'focus-progress' },
        h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': topics.length, 'aria-valuenow': nDone, 'aria-label': 'Topics checked off' }, h('div', { class: 'progress-fill', style: `width:${(100 * nDone) / topics.length}%` })),
        h('div', { class: 'progress-label' }, `${nDone} of ${topics.length} topics checked off`)),
      nQ > 0 && h('a', { class: 'btn primary', href: '#/focus/all/practice' }, `Practice all focus questions (${nQ})`),
      pageOnly && h('p', null, h('a', { href: '#/focus' }, 'Show all focus pages')));
    const kids = [];
    if (!topics.length) kids.push(h('p', { class: 'muted' }, 'No exam-focus topics yet.'));
    for (const lv of [3, 2, 1]) {
      const ts = topics.filter((t) => (t.level || 1) === lv);
      if (!ts.length) continue;
      kids.push(h('h2', { class: 'focus-level' }, levelPill(lv), h('span', { class: 'count' }, `${ts.length} topic${ts.length > 1 ? 's' : ''}`)));
      kids.push(h('div', { class: 'topic-list' }, ts.map((t) => topicCard(t, done.has(t.id)))));
    }
    fill(body, ...kids);
  }

  function topicCard(t, isDone) {
    const nQ = questionItems(ctx, t.questionIds).length;
    const nC = (t.cardIds || []).length;
    const links = (t.links || []).filter((l) => ctx.mods.has(l.module));
    const sec = (l) => (ctx.mods.get(l.module).sections || []).find((s) => s.id === l.section);
    return h('article', { class: 'topic lv' + t.level + (isDone ? ' done' : '') + (a === t.id ? ' hl' : ''), id: 'topic-' + t.id },
      h('div', { class: 'topic-top' }, h('h3', null, t.title),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: isDone, onchange: (e) => { store.setFocusDone(t.id, e.target.checked); draw(); document.getElementById('topic-' + t.id)?.querySelector('input')?.focus(); } }), ' Got it')),
      h('div', { class: 'md', html: md(t.why) }),
      t.figure && figureEl(t.figure),
      (t.sources || []).length > 0 && h('div', { class: 'topic-src' }, h('span', null, 'Sources:'), t.sources.map((s) => h('span', null, s))),
      h('div', { class: 'topic-actions' },
        links.map((l, i) => h('a', { class: 'btn small', href: `#/m/${encodeURIComponent(l.module)}?s=${encodeURIComponent(l.section)}`, title: [modTitle(l.module), sec(l)?.heading].filter(Boolean).join(' › ') }, links.length > 1 ? `Read in module: ${sec(l)?.heading || l.section}` : 'Read in module')),
        nQ > 0 && h('a', { class: 'btn small', href: `#/focus/${encodeURIComponent(t.id)}/practice` }, `Practice these ${nQ} question${nQ > 1 ? 's' : ''}`),
        nC > 0 && h('a', { class: 'btn small', href: `#/focus/${encodeURIComponent(t.id)}/flash` }, `Flashcards (${nC})`)));
  }
  draw();
  if (topic) setTimeout(() => document.getElementById('topic-' + a)?.scrollIntoView({ block: 'start' }), 50);
}
