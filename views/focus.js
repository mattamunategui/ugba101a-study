import { HUB } from '../hub.js?v=b408fab770';
import { h, put } from '../lib/render.js?v=b408fab770';
import { flash } from './memorize.js?v=b408fab770';

/** All topics across focus pages (optionally for one page), with their page. */
export function focusTopics(ctx, pageId = null) {
  return (ctx.bundle.focus || []).filter((f) => !pageId || f.id === pageId).flatMap((f) => (f.topics || []).map((t) => ({ ...t, page: f })));
}
// Exam focus now lives inside Efficiencymaxxing (#/max); this route only serves a topic's flashcards.
export function render(ctx) {
  const [a, mode] = ctx.params;
  const topic = a && focusTopics(ctx).find((t) => t.id === a);
  if (!topic || mode !== 'flash') { location.replace('#/max'); return; }
  const root = h('div', { class: 'wrap engine' });
  ctx.root.append(root);
  document.title = topic.title + ' · ' + HUB.short;
  const where = new Map();
  for (const d of ctx.bundle.decks) for (const c of d.cards) where.set(c.id, { c, d });
  const found = (topic.cardIds || []).map((id) => where.get(id)).filter(Boolean);
  if (!found.length) { put(root, h('a', { class: 'back', href: '#/max' }, 'Efficiencymaxxing'), h('p', null, 'No flashcards linked to this topic yet.')); return; }
  const deckOf = new Map(found.map((x) => [x.c.id, x.d]));
  flash(ctx, root, { id: '', title: topic.title, fieldLabels: {} }, found.map((x) => x.c), true, { backHref: '#/max', deckOf: (c) => deckOf.get(c.id) });
}
