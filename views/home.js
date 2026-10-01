import { HUB } from '../hub.js?v=183898d02e';
import { h, md, mdInline, fill, put } from '../lib/render.js?v=183898d02e';
import * as store from '../lib/store.js?v=183898d02e';
import { lectureLabel, scoreText } from './module.js?v=183898d02e';

const fmtDate = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function render(ctx) {
  const { root, course } = ctx;
  document.title = course.title;
  const parts = course.parts;
  let partId = store.get('part', null);
  if (!parts.find((p) => p.id === partId)) partId = parts[0]?.id;
  const wrap = h('div', { class: 'wrap wide home' });
  put(root, wrap);
  let timer = null;
  ctx.onCleanup(() => clearInterval(timer));

  function draw() {
    clearInterval(timer);
    const part = parts.find((p) => p.id === partId);
    const kids = [];
    kids.push(h('div', { class: 'hero' }, h('div', { class: 'eyebrow' }, course.course), h('h1', null, course.title)));
    if (parts.length > 1) {
      kids.push(h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Course parts' }, parts.map((p) =>
        h('button', { class: 'tab' + (p.id === partId ? ' active' : ''), role: 'tab', 'aria-selected': p.id === partId ? 'true' : 'false', type: 'button', onclick: () => { partId = p.id; store.set('part', p.id); draw(); } }, 'Part ' + p.id))));
    }
    if (!part) { fill(wrap, ...kids, h('p', null, 'No content yet.')); return; }
    kids.push(h('p', { class: 'part-title' }, part.title, part.instructor && h('span', { class: 'muted' }, ' · ' + part.instructor)));

    if (part.exam) {
      const e = part.exam;
      const cd = h('div', { class: 'countdown', role: 'timer', 'aria-live': 'off' });
      const tick = () => {
        const now = Date.now(), start = new Date(e.start).getTime(), end = e.end ? new Date(e.end).getTime() : start;
        if (now >= start && now < end) { cd.replaceChildren(h('div', { class: 'cd-state' }, e.title + ' is in progress')); return; }
        if (now >= end) { cd.replaceChildren(h('div', { class: 'cd-state' }, e.title + ' has finished')); return; }
        let s = Math.floor((start - now) / 1000);
        const d = Math.floor(s / 86400); s -= d * 86400; const hr = Math.floor(s / 3600); s -= hr * 3600; const mi = Math.floor(s / 60); s -= mi * 60;
        cd.replaceChildren(...[[d, 'days'], [hr, 'hrs'], [mi, 'min'], [s, 'sec']].map(([n, l]) => h('div', { class: 'cd-unit' }, h('span', { class: 'cd-n' }, String(n).padStart(2, '0')), h('span', { class: 'cd-l' }, l))));
      };
      tick(); timer = setInterval(tick, 1000);
      kids.push(h('section', { class: 'exam-box card-box' },
        h('div', { class: 'exam-top' }, h('div', null, h('div', { class: 'eyebrow' }, 'Countdown'), h('h2', null, e.title), h('div', { class: 'muted' }, fmtDate(e.start))), cd),
        (e.facts || []).length > 0 && h('details', { class: 'about' }, h('summary', null, 'About the exam'),
          h('ul', null, e.facts.map((f) => h('li', { html: mdInline(f) }))),
          e.source && h('p', { class: 'muted small' }, 'Source: ' + e.source))));
    }

    // tiles
    const decks = part.decks.map((d) => ctx.decks.get(d)).filter(Boolean);
    const exams = part.exams.map((d) => ctx.exams.get(d)).filter(Boolean);
    const missed = store.missedItems(ctx.bundle).length;
    const cardsN = decks.reduce((n, d) => n + d.cards.length, 0);
    const mastery = decks.length ? Math.round(decks.reduce((n, d) => n + store.deckMastery(d), 0) / decks.length) : 0;
    const tile = (href, title, sub, on = true, cls = '') => h(on ? 'a' : 'div', { class: 'tile ' + cls + (on ? '' : ' disabled'), href: on ? href : null }, h('div', { class: 'tile-title' }, title), h('div', { class: 'tile-sub' }, sub));
    const gsiTopics = (ctx.bundle.focus || []).filter((f) => !part.focus || part.focus.includes(f.id)).flatMap((f) => f.topics || []);
    const gsiDone = store.focusDone();
    kids.push(h('div', { class: 'tiles' },
      gsiTopics.length > 0 && tile('#/focus', `🎯 ${HUB.focus.label}: ${gsiTopics.length} topic${gsiTopics.length > 1 ? 's' : ''}`,
        `${gsiTopics.filter((t) => gsiDone.has(t.id)).length} checked off · ${gsiTopics.filter((t) => t.level === 3).length} likely exam questions · start here`, true, 'gsi-tile'),
      tile('#/memorize', 'Memorize', decks.length ? `${decks.length} deck${decks.length > 1 ? 's' : ''} · ${cardsN} cards · ${mastery}% mastery` : 'Coming soon', decks.length > 0),
      tile('#/exam', 'Exam practice', exams.length ? `${exams.length} exam set${exams.length > 1 ? 's' : ''}${exams.some((x) => x.timed) ? ' · timed mode' : ''}` : 'Coming soon', exams.length > 0),
      tile('#/missed', `Retry missed (${missed})`, missed ? 'Questions you last got wrong' : 'Nothing missed yet', missed > 0, missed ? 'warn' : '')));

    kids.push(h('h2', { class: 'section-title' }, 'Modules'));
    kids.push(h('div', { class: 'cards' }, part.modules.map((mid) => {
      const m = ctx.mods.get(mid); if (!m) return null;
      const n = store.readCount(mid), tot = (m.sections || []).length, sc = store.moduleScore(m);
      return h('a', { class: 'mod-card', href: '#/m/' + mid },
        h('div', { class: 'eyebrow' }, lectureLabel(m.lecture)),
        h('h3', null, m.title),
        h('p', { class: 'mod-sum', html: mdInline(m.summary || '') }),
        h('div', { class: 'mc-stats' },
          h('div', null, h('div', { class: 'progress thin' }, h('div', { class: 'progress-fill', style: `width:${tot ? (100 * Math.min(n, tot)) / tot : 0}%` })), h('span', { class: 'small muted' }, `${Math.min(n, tot)}/${tot} sections read`)),
          h('div', { class: 'small ' + (sc.attempted ? '' : 'muted') }, scoreText(sc))));
    })));
    kids.push(h('p', { class: 'muted small updated' }, 'Content updated ' + (ctx.bundle.builtAt ? new Date(ctx.bundle.builtAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'recently')));
    fill(wrap, ...kids);
  }
  draw();
}
