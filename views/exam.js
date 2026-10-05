import { HUB } from '../hub.js?v=e3450f5a32';
import { h, md, fill, put } from '../lib/render.js?v=e3450f5a32';
import * as store from '../lib/store.js?v=e3450f5a32';
import { mountEngine } from './practice.js?v=e3450f5a32';

function examItems(ctx, exam) {
  const out = [];
  for (const s of exam.sections || []) {
    for (const q of s.questions || []) out.push({ q, section: s.heading });
    for (const id of s.questionIds || []) { const f = ctx.qIndex.get(id); if (f) out.push({ q: f.q, section: s.heading }); }
  }
  return out;
}

export function render(ctx) {
  const [id, mode] = ctx.params;
  const root = h('div', { class: 'wrap' + (id && mode ? ' engine' : '') });
  ctx.root.append(root);
  if (!id) {
    document.title = 'Exam practice' + ' · ' + HUB.short;
    put(root, h('a', { class: 'back', href: '#/' }, 'Home'), h('h1', null, 'Exam practice'));
    for (const part of ctx.course.parts) {
      const ex = part.exams.map((e) => ctx.exams.get(e)).filter(Boolean);
      if (!ex.length) continue;
      put(root, h('h2', { class: 'section-title' }, part.title));
      put(root, h('div', { class: 'rlist' }, ex.map((e) => {
        const n = examItems(ctx, e).length, r = store.getExamResult(e.id);
        return h('a', { href: '#/exam/' + e.id },
          h('h3', { class: 'rr-title' }, e.title), h('p', { class: 'rr-sub', html: md(e.description || '', true) }),
          h('div', { class: 'rr-meta' }, h('span', null, `${n} questions`), e.timed && h('span', null, `${e.timed} min timed`), r && h('span', null, `last timed score ${r.score} of ${r.total}`)));
      })));
    }
    if (!ctx.bundle.exams.length) put(root, h('p', { class: 'muted' }, 'No exam sets yet.'));
    return;
  }
  const exam = ctx.exams.get(id);
  if (!exam) { put(root, h('p', null, 'Exam not found.'), h('a', { href: '#/exam' }, 'Back')); return; }
  document.title = exam.title + ' · ' + HUB.short;
  const items = examItems(ctx, exam);
  if (!mode) {
    const r = store.getExamResult(id);
    put(root, h('a', { class: 'back', href: '#/exam' }, 'Exam sets'), h('h1', null, exam.title),
      exam.description && h('p', { class: 'lede', html: md(exam.description, true) }),
      h('h2', null, 'Sections'),
      h('ul', { class: 'rlist' }, (exam.sections || []).map((s) => h('li', null, s.heading, h('span', { class: 'muted' }, `, ${(s.questions || []).length + (s.questionIds || []).length} questions`)))),
      r && h('p', { class: 'muted' }, `Last timed result: ${r.score} of ${r.total} (${Math.round((100 * r.score) / r.total)}%)`),
      h('div', { class: 'row-actions' },
        h('a', { class: 'btn', href: `#/exam/${id}/practice` }, 'Practice mode'),
        exam.timed && h('a', { class: 'btn', href: `#/exam/${id}/timed` }, `Timed, ${exam.timed} minutes`)),
      h('p', { class: 'muted small' }, 'Practice mode gives immediate feedback on each question. Timed mode hides answers until you submit, then shows your score by section.'));
    return;
  }
  const timed = mode === 'timed' && exam.timed;
  ctx.onCleanup(mountEngine(root, { title: exam.title + (timed ? ' (timed)' : ''), items, timed: timed ? exam.timed : 0, examId: id, backHref: '#/exam/' + id, backLabel: 'Exam overview' }));
}
