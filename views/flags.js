// "On the exam": what the prof said will be on the exam (course.json → parts[].examFlags), newest first.
// #/flags · #/flags/<id>/practice · #/flags/<id>/cards
import { HUB } from '../hub.js?v=64113f447c';
import { h, md, put } from '../lib/render.js?v=64113f447c';
import * as store from '../lib/store.js?v=64113f447c';
import { mountEngine } from './practice.js?v=64113f447c';
import { flash } from './memorize.js?v=64113f447c';

export function render(ctx) {
  const part = store.currentPart(ctx.course);
  const flags = [...(part?.examFlags || [])].sort((a, b) => b.date.localeCompare(a.date));
  const root = h('div', { class: 'wrap' });
  ctx.root.append(root);
  const [id, mode] = ctx.params;
  const back = h('a', { class: 'back', href: '#/flags' }, 'On the exam');
  if (id) {
    const f = flags.find((x) => x.id === id);
    if (!f) { location.replace('#/flags'); return; }
    root.className = 'wrap engine';
    document.title = 'On the exam · ' + HUB.short;
    if (mode === 'cards') {
      const where = new Map();
      for (const d of ctx.bundle.decks) for (const c of d.cards) where.set(c.id, { c, d });
      const found = (f.cardIds || []).map((x) => where.get(x)).filter(Boolean);
      const deckOf = new Map(found.map((x) => [x.c.id, x.d]));
      flash(ctx, root, { id: '', title: 'On the exam: ' + fmt(f.date), fieldLabels: {} }, found.map((x) => x.c), true, { backHref: '#/flags', deckOf: (c) => deckOf.get(c.id) });
      return;
    }
    const by = new Map(store.allQuestionItems(ctx.bundle).map((it) => [it.q.id, it]));
    const items = (f.questionIds || []).map((x) => by.get(x)).filter(Boolean);
    ctx.onCleanup(mountEngine(root, { title: 'On the exam: ' + fmt(f.date), items, backHref: '#/flags', backLabel: 'On the exam', mods: ctx.mods }));
    return;
  }
  document.title = 'On the exam · ' + HUB.short;
  put(root,
    h('h1', null, 'On the exam'),
    h('p', { class: 'lede' }, 'What the prof has said will be on the ' + (part?.exam?.title || 'exam').toLowerCase() + ', newest first. Know every one of these cold.'),
    flags.length ? h('div', { class: 'flag-list' }, flags.map((f) => {
      const nq = (f.questionIds || []).length, nc = (f.cardIds || []).length;
      return h('article', { class: 'flag' },
        h('div', { class: 'lec' }, [fmt(f.date), f.where].filter(Boolean).join(' · ')),
        h('div', { class: 'flag-said md', html: md('**He said:** ' + f.said) }),
        f.know && h('div', { class: 'md', html: md(f.know) }),
        h('div', { class: 'flag-actions' },
          (f.links || []).filter((l) => ctx.mods.has(l.module)).map((l) => h('a', { class: 'btn small', href: `#/m/${encodeURIComponent(l.module)}?s=${encodeURIComponent(l.section)}` }, 'Read it')),
          nq > 0 && h('a', { class: 'btn primary small', href: `#/flags/${f.id}/practice` }, `Practice ${nq} question${nq > 1 ? 's' : ''}`),
          nc > 0 && h('a', { class: 'btn small', href: `#/flags/${f.id}/cards` }, `${nc} flashcard${nc > 1 ? 's' : ''}`)));
    })) : h('p', { class: 'muted' }, 'Nothing flagged yet for this exam.'));
}
const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
