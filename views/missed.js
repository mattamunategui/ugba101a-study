import { HUB } from '../hub.js?v=b8ec976334';
import { h, fill, put } from '../lib/render.js?v=b8ec976334';
import * as store from '../lib/store.js?v=b8ec976334';
import { mountEngine } from './practice.js?v=b8ec976334';

export function render(ctx) {
  document.title = 'Missed' + ' · ' + HUB.short;
  const items = store.missedItems(ctx.bundle);
  const root = h('div', { class: 'wrap engine' });
  ctx.root.append(root);
  if (!items.length) {
    put(root, h('div', { class: 'engine-head' }, h('a', { class: 'back', href: '#/' }, 'Home'), h('h1', null, 'Retry missed')),
      h('div', { class: 'empty' }, h('p', null, 'Nothing to retry. Questions you get wrong in modules or exams will show up here until you answer them correctly.')));
    return;
  }
  ctx.onCleanup(mountEngine(root, { title: `Retry missed (${items.length})`, items, backHref: '#/', backLabel: 'Home', mods: ctx.mods }));
}
