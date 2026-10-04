import { HUB } from '../hub.js?v=6f7658f99f';
import { h, mdInline, fill, put } from '../lib/render.js?v=6f7658f99f';
import * as store from '../lib/store.js?v=6f7658f99f';
import { lectureLabel, scoreText } from './module.js?v=6f7658f99f';

const fmtDate = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function render(ctx) {
  const { root, course } = ctx;
  document.title = course.title;
  const parts = course.parts;
  let partId = store.get('part', null);
  if (!parts.find((p) => p.id === partId)) partId = parts[0]?.id;
  const wrap = h('div', { class: 'wrap home' });
  put(root, wrap);
  let timer = null;
  ctx.onCleanup(() => clearInterval(timer));

  function draw() {
    clearInterval(timer);
    const part = parts.find((p) => p.id === partId);
    const kids = [];
    kids.push(h('div', { class: 'hero' }, h('h1', null, course.title)));
    kids.push(h('p', { class: 'sub' }, h('span', null, course.course), part && h('span', null, part.title), part?.instructor && h('span', null, part.instructor)));
    if (parts.length > 1) {
      kids.push(h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Course parts' }, parts.map((p) =>
        h('button', { class: 'tab' + (p.id === partId ? ' active' : ''), role: 'tab', 'aria-selected': p.id === partId ? 'true' : 'false', type: 'button', onclick: () => { partId = p.id; store.set('part', p.id); draw(); } }, 'Part ' + p.id))));
    }
    if (!part) { fill(wrap, ...kids, h('p', null, 'No content yet.')); return; }

    if (part.exam) {
      const e = part.exam;
      const cd = h('span', { class: 'countdown', role: 'timer', 'aria-live': 'off' });
      const unit = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
      const tick = () => {
        const now = Date.now(), start = new Date(e.start).getTime(), end = e.end ? new Date(e.end).getTime() : start;
        if (now >= end) { cd.textContent = e.title + ' has finished'; return; }
        if (now >= start) { cd.textContent = e.title + ' is in progress'; return; }
        const mins = Math.floor((start - now) / 60000), d = Math.floor(mins / 1440), hr = Math.floor((mins % 1440) / 60), mi = mins % 60;
        cd.textContent = `${e.title} in ` + (d ? `${unit(d, 'day')}, ${unit(hr, 'hour')}` : hr ? `${unit(hr, 'hour')}, ${unit(mi, 'minute')}` : unit(mi, 'minute'));
      };
      tick(); timer = setInterval(tick, 30000);
      kids.push(h('section', { class: 'exam' },
        h('div', { class: 'exam-line' }, cd, h('span', { class: 'muted small' }, fmtDate(e.start))),
        (e.facts || []).length > 0 && h('details', { class: 'about' }, h('summary', null, 'About the exam'),
          h('ul', null, e.facts.map((f) => h('li', { html: mdInline(f) }))),
          e.source && h('p', { class: 'muted small' }, 'Source: ' + e.source))));
    }

    // quick links
    const decks = part.decks.map((d) => ctx.decks.get(d)).filter(Boolean);
    const exams = part.exams.map((d) => ctx.exams.get(d)).filter(Boolean);
    const missed = store.missedItems(ctx.bundle).length;
    const cardsN = decks.reduce((n, d) => n + d.cards.length, 0);
    const gsiTopics = (ctx.bundle.focus || []).filter((f) => !part.focus || part.focus.includes(f.id)).flatMap((f) => f.topics || []);
    const gsiDone = store.focusDone();
    const link = (href, title, count, on = true) => on ? h('a', { href }, title, count && h('span', null, ' ' + count)) : h('span', { class: 'off' }, title, count && h('span', null, ' ' + count));
    kids.push(h('nav', { class: 'quick', 'aria-label': 'Study tools' },
      gsiTopics.length > 0 && link('#/focus', HUB.focus.label, `${gsiTopics.filter((t) => gsiDone.has(t.id)).length} of ${gsiTopics.length} done`),
      link('#/max', 'Efficiencymaxxing', null, (ctx.bundle.playbook || []).some((f) => f.part === part.id)),
      link('#/memorize', 'Memorize', `${cardsN} cards`, decks.length > 0),
      link('#/exam', 'Exam practice', `${exams.length} set${exams.length === 1 ? '' : 's'}`, exams.length > 0),
      link('#/missed', 'Retry missed', String(missed), missed > 0)));

    kids.push(h('h2', { class: 'section-title' }, 'Modules'));
    kids.push(h('div', { class: 'cards' }, part.modules.map((mid) => {
      const m = ctx.mods.get(mid); if (!m) return null;
      const n = store.readCount(mid), tot = (m.sections || []).length, sc = store.moduleScore(m);
      return h('a', { class: 'mod-card', href: '#/m/' + mid },
        h('div', { class: 'lec' }, lectureLabel(m.lecture)),
        h('h3', null, m.title),
        h('p', { class: 'mod-sum', html: mdInline(m.summary || '') }),
        h('div', { class: 'mc-stats' },
          h('span', null, `${Math.min(n, tot)} of ${tot} sections read`),
          h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${tot ? (100 * Math.min(n, tot)) / tot : 0}%` })),
          sc.attempted > 0 && h('span', null, scoreText(sc))));
    })));
    kids.push(h('p', { class: 'muted small updated' }, 'Content updated ' + (ctx.bundle.builtAt ? new Date(ctx.bundle.builtAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'recently')));
    fill(wrap, ...kids);
  }
  draw();
}
