// Practice engine shared by modules, exams, the playbook and memorize-quiz; also the Practice index (#/practice).
import { HUB } from '../hub.js?v=106daaa0cf';
import { h, md, mdInline, figureEl, plain, fmtTime, fill, put } from '../lib/render.js?v=106daaa0cf';
import * as store from '../lib/store.js?v=106daaa0cf';
import { setChatContext } from '../lib/chat.js?v=106daaa0cf';

export const GSI_LEVEL = { 3: 'Exam question', 2: 'Emphasized', 1: 'Covered' };
export const DIFF = { 1: 'Recall', 2: 'Apply', 3: 'Exam-hard' };
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };

/** Parse "1.5e-3", "1.5×10^-3", "1.5x10-3", "+2", "10^-3", "1.5 x 10⁻³". Returns number or null. */
export function parseNum(input) {
  let s = String(input ?? '').trim().replace(/[−–—]/g, '-').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]/g, (c) => (c === '⁻' ? '^-' : c === '⁺' ? '^+' : '^' + SUP[c]));
  s = s.replace(/\^(\^)/g, '^').replace(/\^-\^(\d)/g, '^-$1').replace(/\^\+\^(\d)/g, '^+$1').replace(/\^(\d)\^(\d)/g, '^$1$2').replace(/\s+/g, '').replace(/,(?=\d{3}\b)/g, '');
  let m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)$/.exec(s);
  if (m) return parseFloat(m[1]);
  m = /^([+-]?(?:\d+\.?\d*|\.\d+))?(?:[x×*·]|\*\*)?10\^?\(?([+-]?\d+)\)?$/i.exec(s);
  if (m && (m[1] !== undefined || /^[+-]?10/.test(s))) {
    const mant = m[1] === undefined ? 1 : parseFloat(m[1]);
    return mant * Math.pow(10, parseInt(m[2], 10));
  }
  return null;
}

export function grade(q, r) {
  switch (q.type) {
    case 'mcq': return r === q.answer;
    case 'tf': return r === q.answer;
    case 'multi': { const a = [...(r || [])].sort(), b = [...q.answer].sort(); return a.length === b.length && a.every((x, i) => x === b[i]); }
    case 'numeric': { const v = parseNum(r); return v != null && Math.abs(v - q.answer) <= (q.tolerance ?? 0) + 1e-12; }
    case 'short': return r === 'got' ? true : r === 'missed' ? false : null;
  }
  return null;
}
function hasResp(q, r) {
  if (q.type === 'mcq') return r != null;
  if (q.type === 'tf') return typeof r === 'boolean';
  if (q.type === 'multi') return Array.isArray(r) && r.length > 0;
  if (q.type === 'numeric') return parseNum(r) != null;
  return false;
}
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtAns = (q) => `${q.answer}${q.unit ? ' ' + q.unit : ''}${q.tolerance ? ` (± ${q.tolerance})` : ''}`;

/**
 * opts: {title, items:[{q, section?, label?}], timed?:minutes, backHref, backLabel, filters?:true,
 *        noRecord?:bool, again?:()=>items, onFinish?:fn, examId?,
 *        groups?:[{id,title,skill}] + moduleId (skill categories), mods?:Map (section headings for guide links)}
 * Returns a cleanup function.
 */
export function mountEngine(root, opts) {
  const items = opts.items;
  const timed = !!opts.timed;
  // Skill categories (module practice only): groups from the module, untimed.
  const cat = !timed && !!opts.moduleId && Array.isArray(opts.groups) && opts.groups.length > 0;
  const gIds = cat ? opts.groups.map((g) => g.id) : [];
  const gi = (it) => { const i = gIds.indexOf(it.q.group); return i < 0 ? gIds.length : i; };
  // Exam priority (module practice): 3 = will be tested, 2 = in the slides, 1 = not in the slides (hidden unless asked).
  const prio = (it) => it.q.priority || 2;
  const usePrio = !timed && !!opts.moduleId && items.some((it) => it.q.priority);
  const nLow = usePrio ? items.filter((it) => prio(it) === 1).length : 0;
  if (cat && usePrio) { // least important categories go last, otherwise keep the module's order
    const score = (g) => { const qs = items.filter((it) => it.q.group === g && prio(it) > 1); return qs.length ? qs.reduce((n, it) => n + prio(it), 0) / qs.length : 0; };
    const sc = new Map(gIds.map((g) => [g, score(g)]));
    gIds.sort((a, b) => sc.get(b) - sc.get(a) || opts.groups.findIndex((x) => x.id === a) - opts.groups.findIndex((x) => x.id === b));
  }
  const isSkip = () => false; // ponytail: category skipping UI removed; drop the isSkip plumbing if it never comes back
  const S = { showLow: false, filter: 'all', order: opts.defaultOrder === 'cat' && !cat ? 'gsi' : opts.defaultOrder || 'orig', shuffle: false, list: [], idx: 0, phase: 'run', confirming: false };
  const sess = new Map();
  const redone = new Set();
  const st = (q) => {
    if (!sess.has(q.id)) {
      // Restore what was answered in an earlier visit, as if the session never ended.
      const a = !timed && !opts.noRecord && !redone.has(q.id) && store.getQ(q.id);
      sess.set(q.id, a
        ? { resp: a.r !== undefined ? a.r : q.type === 'short' ? (a.ok ? 'got' : 'missed') : undefined, revealed: true, done: true, ok: a.ok, firstOk: a.ok, tries: 1, restored: true }
        : { resp: undefined, revealed: false, done: false, ok: null });
    }
    return sess.get(q.id);
  };
  function redo() { const q = cur().q; redone.add(q.id); sess.delete(q.id); draw(); }
  let timerId = null, endsAt = 0, timerEl = null;
  const record = (q, ok, resp) => { if (!opts.noRecord && ok != null) store.recordAnswer(q.id, ok, resp); };

  function rebuild() {
    let l = items.filter((it) => {
      const a = store.getQ(it.q.id);
      if (usePrio && !S.showLow && prio(it) === 1) return false;
      if (S.filter === 'unanswered') return !a;
      if (S.filter === 'missed') return a && !a.ok;
      if (S.filter === 'emphasis') return !!it.q.emphasis;
      if (S.filter === 'gsi') return !!it.q.gsi;
      return true;
    });
    if (S.shuffle) l = shuffle([...l]);
    else if (S.order === 'cat' && cat) l = l.map((it, i) => [it, i]).sort((a, b) => gi(a[0]) - gi(b[0]) || (a[0].q.difficulty || 2) - (b[0].q.difficulty || 2) || a[1] - b[1]).map((x) => x[0]);
    else if (S.order === 'gsi') l = l.map((it, i) => [it, i]).sort((a, b) => (b[0].q.gsi || 0) - (a[0].q.gsi || 0) || a[1] - b[1]).map((x) => x[0]);
    S.list = l; S.idx = Math.max(0, l.findIndex((it) => !isSkip(it))); S.phase = 'run';
  }
  rebuild();
  if (!timed && !opts.noRecord) {
    const un = S.list.map((it, i) => i).filter((i) => !store.getQ(S.list[i].q.id));
    const i = un.find((j) => !isSkip(S.list[j])) ?? un[0];
    if (i > 0) S.idx = i;
  }

  if (timed) {
    endsAt = Date.now() + opts.timed * 60000;
    timerId = setInterval(tick, 1000);
  }
  function tick() {
    const left = Math.max(0, endsAt - Date.now());
    if (timerEl && timerEl.isConnected) {
      timerEl.textContent = fmtTime(Math.ceil(left / 1000)).padStart(5, '0');
      timerEl.classList.toggle('warn', left < 5 * 60000);
    }
    if (left <= 0 && S.phase === 'run') submitTimed();
  }

  // ---- actions ----
  const cur = () => S.list[S.idx];
  function showFeedback(s) { return s.done || (timed && S.phase === 'review'); }
  // Untimed wrong answer awaiting retry ("Not quite"): the question counts as wrong, answer not yet revealed.
  const fin = (s) => s.done || !!s.wrong;
  const okOf = (s) => s.firstOk ?? s.ok; // first-attempt correctness, so retries can't inflate scores
  function pick(i) {
    const it = cur(); if (!it) return; const q = it.q, s = st(q);
    if (fin(s) || (timed && S.phase === 'review')) return;
    if (q.type === 'mcq') s.resp = i;
    else if (q.type === 'tf') s.resp = i === 0;
    else if (q.type === 'multi') { const set = new Set(s.resp || []); set.has(i) ? set.delete(i) : set.add(i); s.resp = [...set]; }
    draw(); root.querySelector(`.opt[data-i="${i}"]`)?.focus();
  }
  function submit() {
    const it = cur(); if (!it || timed) return; const q = it.q, s = st(q);
    if (s.done) return;
    if (q.type === 'short') { if (!s.revealed) { s.revealed = true; draw(); } return; }
    if (!hasResp(q, s.resp)) { s.hint = q.type === 'numeric' ? 'Enter a number, like 8, 1.5e-3, or 1.5×10^-3.' : 'Choose an answer first.'; draw(); return; }
    s.hint = null;
    const ok = grade(q, s.resp);
    s.tries = (s.tries || 0) + 1;
    if (s.tries === 1) { s.firstOk = ok; record(q, ok, s.resp); } // only the first attempt is recorded
    if (ok) { s.ok = true; s.done = true; } else s.wrong = true;
    draw();
  }
  function tryAgain() {
    const it = cur(); if (!it) return; const q = it.q, s = st(q);
    if (!s.wrong || s.done) return;
    if (q.type === 'mcq' || q.type === 'tf') (s.elim ||= new Set()).add(s.resp);
    s.wrong = false; s.resp = undefined; draw();
    (root.querySelector('.opt:not(.elim)') || root.querySelector('.opt') || root.querySelector('#num'))?.focus();
  }
  function showHint() { const s = st(cur().q); s.hintOpen = true; if (cur().q.guide) s.steps = Math.max(1, s.steps || 0); draw(); }
  function nextStep() {
    const q = cur().q, s = st(q); s.steps = Math.min((s.steps || 1) + 1, q.guide.steps.length); draw();
  }
  function giveUp() { const s = st(cur().q); s.wrong = false; s.done = true; s.ok = false; draw(); }
  function mark(ok) {
    const it = cur(); if (!it) return; const q = it.q, s = st(q);
    s.resp = ok ? 'got' : 'missed'; s.ok = ok; s.firstOk = ok; s.done = true; s.revealed = true;
    record(q, ok);
    if (timed && S.phase === 'review') saveExam();
    draw();
  }
  // Next/Previous skip questions in categories marked "Got this, skip" (clicking a navigator box still opens one).
  function stepIdx(d) { for (let i = S.idx + d; i >= 0 && i < S.list.length; i += d) if (!isSkip(S.list[i])) return i; return -1; }
  function go(d) { const n = stepIdx(d); if (n >= 0) { S.idx = n; draw(); toCard(); } }
  // bring the new question's top into view (below the sticky header) only if it isn't already
  function toCard() { const c = root.querySelector('.qcard'); if (!c) return; const t = c.getBoundingClientRect().top; if (t < 56 || t > innerHeight * 0.6) c.scrollIntoView({ block: 'start' }); }
  function next() {
    if (stepIdx(1) >= 0) go(1);
    else if (timed) { if (S.phase === 'run') { S.confirming = true; draw(); } else { S.idx = 0; draw(); } }
    else { S.phase = 'summary'; draw(); window.scrollTo({ top: 0 }); }
  }
  function submitTimed() {
    clearInterval(timerId); timerId = null;
    for (const it of items) {
      const s = st(it.q);
      if (it.q.type === 'short') { s.revealed = true; s.done = false; s.ok = null; }
      else {
        s.ok = grade(it.q, s.resp); s.done = true;
        if (hasResp(it.q, s.resp)) record(it.q, s.ok); // skipped questions count as wrong in the score but don't flood the Missed queue
      }
    }
    S.phase = 'review'; S.confirming = false; S.idx = 0; saveExam(); draw(); window.scrollTo({ top: 0 });
  }
  function score() {
    let right = 0, pending = 0;
    const secs = new Map();
    for (const it of items) {
      const s = st(it.q); const k = it.section || 'All questions';
      if (!secs.has(k)) secs.set(k, { right: 0, total: 0, pending: 0 });
      const e = secs.get(k); e.total++;
      if (s.ok === true) { right++; e.right++; } else if (s.ok === null) { pending++; e.pending++; }
    }
    return { right, pending, total: items.length, secs };
  }
  function saveExam() { if (opts.examId) { const sc = score(); store.setExamResult(opts.examId, { score: sc.right, total: sc.total, timed: true }); } }

  // Put the cursor in the answer box after every redraw, so you can type and press Enter without the mouse.
  // Never takes focus away from another text field or dropdown the user is in.
  function autoFocus(el) {
    if (opts.focusNum === false) return;
    setTimeout(() => {
      const a = document.activeElement;
      if (el.isConnected && !el.disabled && (a === document.body || (root.contains(a) && !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)))) el.focus();
    }, 0);
  }

  // ---- keyboard ----
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || !root.isConnected) return;
    if (document.querySelector('.lightbox')) return;
    const t = e.target, tag = t.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    const it = cur(); if (!it || S.phase === 'summary') return;
    const q = it.q, s = st(q);
    if (e.key === 'Enter') {
      if (tag === 'TEXTAREA') { if (e.shiftKey || timed) return; e.preventDefault(); if (!s.revealed) submit(); return; }
      if ((tag === 'BUTTON' && !t.classList.contains('opt')) || tag === 'A' || tag === 'SELECT' || tag === 'SUMMARY') return;
      e.preventDefault();
      if (timed && S.phase === 'run') next();
      else if (showFeedback(s)) next();
      else if (s.wrong) tryAgain();
      else submit();
      return;
    }
    if (typing) return;
    if (/^[1-9]$/.test(e.key)) {
      const n = +e.key - 1;
      if (q.type === 'short') { if (s.revealed && !s.done && n < 2) mark(n === 0); return; }
      const count = q.type === 'tf' ? 2 : (q.choices || []).length;
      if (n < count) { e.preventDefault(); pick(n); }
    } else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  }
  document.addEventListener('keydown', onKey);

  // ---- rendering ----
  const catTitle = (g) => cat && opts.groups.find((x) => x.id === g)?.title;

  function hintBox(q, s) {
    const g = q.guide, n = s.steps || 1, tot = g.steps.length;
    return h('div', { class: 'hint-box', role: 'status', tabindex: '-1' },
      h('div', { class: 'hb-title' }, 'Hint'),
      g.concept && h('div', { class: 'md', html: md(g.concept) }),
      g.steps.slice(0, n).map((t, i) => h('div', { class: 'hb-step' },
        h('div', { class: 'hb-title' }, i === tot - 1 && tot > 1 ? 'Last step: answer' : `Step ${i + 1} of ${tot}`), h('div', { class: 'md', html: md(t) }))),
      n < tot && h('button', { class: 'btn small hb-next', type: 'button', onclick: nextStep }, `Next step (${n + 1} of ${tot})`));
  }

  function walkthrough(q, ok) {
    const g = q.guide;
    const link = ({ module: m, section: sec }) => h('a', { href: `#/m/${m}?s=${sec}` }, 'Review: ' + (opts.mods?.get(m)?.sections?.find((x) => x.id === sec)?.heading || sec));
    return h('div', { class: 'walk' },
      g.steps?.length > 0 && h('details', { class: 'walk-steps', open: !ok }, h('summary', null, 'Step by step'),
        h('ol', null, g.steps.map((t) => h('li', { html: md(t) })))),
      g.concept && h('details', null, h('summary', null, 'What this tests'), h('div', { class: 'md', html: md(g.concept) })),
      (g.review || g.links?.length > 0) && h('details', { open: !ok }, h('summary', null, 'To strengthen this'),
        g.review && h('div', { class: 'md', html: md(g.review) }),
        g.links?.length > 0 && h('ul', { class: 'walk-links' }, g.links.map((l) => h('li', null, link(l))))));
  }

  function prioNote() {
    if (!usePrio) return null;
    return h('div', { class: 'prio-note' },
      h('span', null, h('i', { class: 'pd p3' }), 'Will be tested'),
      nLow > 0 && h('button', { class: 'linkish', type: 'button', onclick: () => { S.showLow = !S.showLow; const id = cur()?.q.id; rebuild(); const j = S.list.findIndex((it) => it.q.id === id); if (j >= 0) S.idx = j; draw(); } },
        S.showLow ? 'Hide the questions not in the slides' : `Show ${nLow} question${nLow > 1 ? 's' : ''} not in the slides`));
  }

  function navigator() {
    const grouped = cat && S.order === 'cat' && !S.shuffle;
    return h('nav', { class: 'qnav', 'aria-label': 'Question navigator' }, S.list.map((it, i) => {
      const s = st(it.q);
      let c = 'qn';
      if (isSkip(it)) c += ' skipped';
      if (usePrio) c += ' p' + prio(it);
      if (i === S.idx) c += ' current';
      if (s.wrong && !s.done) c += ' bad';
      else if (showFeedback(s)) { const o = okOf(s); c += o === null ? ' answered' : o ? ' ok' : ' bad'; }
      else if (timed && hasResp(it.q, s.resp)) c += ' answered';
      const btn = h('button', { class: c, type: 'button', 'aria-label': `Question ${i + 1}${isSkip(it) ? ' (skipped category)' : ''}`, 'aria-current': i === S.idx ? 'true' : null, onclick: () => { S.idx = i; draw(); } }, String(i + 1));
      if (!grouped || (i > 0 && S.list[i - 1].q.group === it.q.group)) return btn;
      return [h('span', { class: 'qn-cat' + (isSkip(it) ? ' skipped' : '') }, catTitle(it.q.group) || 'Other'), btn];
    }));
  }

  function optionsEl(q, s, locked, fb) {
    const labels = q.type === 'tf' ? ['True', 'False'] : q.choices;
    const val = (i) => (q.type === 'tf' ? i === 0 : i);
    const sel = (i) => (q.type === 'multi' ? (s.resp || []).includes(i) : s.resp === val(i));
    const isAns = (i) => (q.type === 'multi' ? q.answer.includes(i) : q.answer === val(i));
    const elim = (i) => !fb && !s.wrong && s.elim && s.elim.has(val(i));
    return h('div', { class: 'opts', role: q.type === 'multi' ? 'group' : 'radiogroup', 'aria-label': 'Answer choices' }, labels.map((t, i) => {
      let c = 'opt';
      if (sel(i)) c += ' selected';
      if (elim(i)) c += ' elim';
      if (s.wrong && !fb && sel(i)) c += ' wrong';
      if (fb) { if (isAns(i)) c += sel(i) || q.type !== 'multi' ? ' correct' : ' correct missed'; else if (sel(i)) c += ' wrong'; }
      return h('button', { class: c, type: 'button', 'data-i': i, role: q.type === 'multi' ? 'checkbox' : 'radio', 'aria-checked': sel(i) ? 'true' : 'false', disabled: locked, onclick: () => pick(i) },
        h('span', { class: 'opt-key', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'opt-text', html: mdInline(t) }),
        fb && isAns(i) && h('span', { class: 'opt-flag', 'aria-label': 'correct answer' }, '✓'),
        fb && !isAns(i) && sel(i) && h('span', { class: 'opt-flag', 'aria-label': 'your answer, incorrect' }, '✗'));
    }));
  }

  function card(it) {
    const q = it.q, s = st(q);
    const fb = showFeedback(s);
    const locked = fb || !!s.wrong;
    const body = [];
    if (it.section && opts.showSections !== false) body.push(h('div', { class: 'q-section' }, it.section));
    if (q.type === 'multi') body.push(h('div', { class: 'q-meta' }, 'Select all that apply'));
    body.push(h('div', { class: 'prompt', html: md(q.prompt) }));
    if (q.figure) body.push(figureEl(q.figure));

    if (q.type === 'mcq' || q.type === 'tf' || q.type === 'multi') body.push(optionsEl(q, s, locked, fb));
    else if (q.type === 'numeric') {
      const input = h('input', { id: 'num', class: 'num-input', type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'e.g. 1.5e-3', 'aria-label': 'Your numeric answer', disabled: locked, value: s.resp ?? '' });
      input.addEventListener('input', () => { s.resp = input.value; if (s.hint) { s.hint = null; card_hint.textContent = ''; } });
      const card_hint = h('div', { class: 'hint', role: 'status' }, s.hint || '');
      body.push(h('div', { class: 'num-row' }, input, q.unit && h('span', { class: 'unit' }, q.unit)), card_hint);
      if (!locked) autoFocus(input);
    } else if (q.type === 'short') {
      const ta = h('textarea', { class: 'short-input', rows: 3, placeholder: 'Write your answer here (optional, for yourself)…', 'aria-label': 'Your answer', disabled: s.revealed });
      ta.value = s.draft || '';
      ta.addEventListener('input', () => { s.draft = ta.value; });
      body.push(ta);
      if (!s.revealed) autoFocus(ta);
      if (s.revealed) {
        body.push(h('div', { class: 'model-answer' }, h('div', { class: 'ma-title' }, 'Model answer'), h('div', { class: 'md', html: md(q.answer) })));
        if (!s.done) body.push(h('div', { class: 'selfmark' }, h('span', null, 'How did you do?'),
          h('button', { class: 'btn good', type: 'button', onclick: () => mark(true) }, 'Got it (1)'),
          h('button', { class: 'btn bad', type: 'button', onclick: () => mark(false) }, 'Missed it (2)')));
      }
    }

    const hintEl = s.hintOpen && !fb && (q.guide ? hintBox(q, s) : q.explanation && h('div', { class: 'hint-box' }, h('div', { class: 'hb-title' }, 'Hint'), h('div', { class: 'md', html: md(q.explanation) })));
    const canHint = !!(q.guide || q.explanation);
    if (q.guide && !timed && !fb && !s.wrong && !s.hintOpen && !(q.type === 'short' && s.revealed)) body.push(h('div', { class: 'hint-row' }, h('button', { class: 'btn small', type: 'button', onclick: showHint }, 'Show hint')));
    if (s.wrong && !fb) {
      body.push(h('div', { class: 'feedback fb-bad', role: 'status' },
        h('div', { class: 'fb-head' }, 'Not quite'),
        h('div', { class: 'fb-actions' },
          h('button', { class: 'btn small primary', type: 'button', onclick: tryAgain }, 'Try again'),
          canHint && !s.hintOpen && h('button', { class: 'btn small', type: 'button', onclick: showHint }, 'Show hint'),
          h('button', { class: 'btn small', type: 'button', onclick: giveUp }, 'Show answer'))));
      if (hintEl) body.push(hintEl);
    } else if (hintEl) body.push(hintEl);
    if (fb && (q.type !== 'short' || s.done)) {
      const ok = s.ok;
      const fbEl = h('div', { class: 'feedback ' + (ok ? 'fb-ok' : 'fb-bad'), role: 'status' },
        h('div', { class: 'fb-head' }, ok ? (q.type === 'short' ? '✓ Got it' : s.tries > 1 ? `✓ Correct on try ${s.tries}` : '✓ Correct') : (q.type === 'short' ? '✗ Missed it' : '✗ Incorrect'),
          q.type === 'numeric' && !ok && h('span', { class: 'fb-ans' }, 'Answer: ', fmtAns(q))),
        q.type === 'numeric' && ok && h('div', { class: 'fb-sub' }, 'Answer: ' + fmtAns(q)),
        q.explanation && (ok ? h('details', { class: 'walk-steps' }, h('summary', null, 'Explanation'), h('div', { class: 'md', html: md(q.explanation) })) : h('div', { class: 'md', html: md(q.explanation) })),
        q.guide && walkthrough(q, ok),
        h('div', { class: 'fb-tags' },
          q.source && h('span', null, 'Source: ' + q.source),
          q.emphasis && h('span', { class: 'emph' }, 'Professor emphasis'),
          q.difficulty && h('span', null, DIFF[q.difficulty]),
          (q.tags || []).filter((t) => t !== 'sample').map((t) => h('span', null, t))));
      body.push(fbEl);
    }
    if (timed && S.phase === 'review' && q.type === 'short' && !s.done) { /* self-mark shown above */ }

    // footer controls
    const last = stepIdx(1) < 0;
    const foot = h('div', { class: 'q-foot' },
      h('button', { class: 'btn ghost', type: 'button', disabled: stepIdx(-1) < 0, onclick: () => go(-1) }, 'Previous'));
    if (timed && S.phase === 'run') foot.append(h('button', { class: 'btn primary', type: 'button', onclick: next }, last ? 'Review and submit' : 'Next'));
    else if (!timed && s.wrong && !s.done) foot.append(h('button', { class: 'btn', type: 'button', onclick: next }, last ? 'Finish' : 'Next'));
    else if (!timed && !s.done && q.type !== 'short') foot.append(h('button', { class: 'btn primary', type: 'button', onclick: submit }, 'Check answer'));
    else if (!timed && !s.done && q.type === 'short' && !s.revealed) foot.append(h('button', { class: 'btn primary', type: 'button', onclick: submit }, 'Reveal answer'));
    else if (s.done || (timed && S.phase === 'review')) foot.append(h('button', { class: 'btn primary', type: 'button', onclick: next }, last ? (timed ? 'Back to start' : 'Finish') : 'Next'));
    if (s.restored && !timed) foot.append(h('button', { class: 'btn ghost', type: 'button', onclick: redo }, 'Redo this question'));
    return h('article', { class: 'qcard', 'aria-live': 'polite' }, body, foot);
  }

  function summary() {
    const rows = S.list.map((it, i) => ({ it, i, s: st(it.q) }));
    const answered = rows.filter((r) => fin(r.s)), right = answered.filter((r) => okOf(r.s)).length;
    const pct = answered.length ? Math.round((100 * right) / answered.length) : 0;
    const missed = rows.filter((r) => fin(r.s) && !okOf(r.s));
    const skippedCat = rows.filter((r) => !fin(r.s) && isSkip(r.it));
    const skipped = rows.filter((r) => !fin(r.s) && !isSkip(r.it));
    return h('section', { class: 'summary' },
      h('h2', null, 'Set complete'),
      h('div', { class: 'big-score' }, String(right), h('span', null, `of ${answered.length} correct (${pct}%)`)),
      skipped.length > 0 && h('p', { class: 'muted' }, `${skipped.length} question${skipped.length > 1 ? 's' : ''} not answered.`),
      skippedCat.length > 0 && h('p', { class: 'muted' }, `${skippedCat.length} in categories you marked “Got this, skip”.`),
      h('ul', { class: 'sum-list' }, rows.map(({ it, i, s }) => h('li', { class: fin(s) ? (okOf(s) ? 'ok' : 'bad') : 'skip' },
        h('button', { class: 'linkish', type: 'button', onclick: () => { S.phase = 'run'; S.idx = i; draw(); } },
          h('span', { class: 'sum-n' }, String(i + 1)), h('span', { class: 'sum-mark', 'aria-hidden': 'true' }, fin(s) ? (okOf(s) ? '✓' : '✗') : isSkip(it) ? '»' : '–'),
          h('span', { class: 'sum-text' }, plain(it.q.prompt).slice(0, 110)))))),
      h('div', { class: 'row-actions' },
        missed.length > 0 && h('button', { class: 'btn primary', type: 'button', onclick: () => { const ids = new Set(missed.map((r) => r.it.q.id)); S.list = S.list.filter((x) => ids.has(x.q.id)); for (const x of S.list) sess.delete(x.q.id); S.idx = 0; S.phase = 'run'; draw(); } }, `Retry ${missed.length} missed`),
        opts.again && h('button', { class: 'btn primary', type: 'button', onclick: () => { cleanup(); opts.again(); } }, 'New round'),
        h('button', { class: 'btn', type: 'button', onclick: () => { sess.clear(); rebuild(); draw(); } }, 'Restart set'),
        opts.backHref && h('a', { class: 'btn ghost', href: opts.backHref }, opts.doneLabel || opts.backLabel || 'Back')),
      opts.nextLinks?.length > 0 && h('div', { class: 'row-actions next-mod' }, h('span', { class: 'muted' }, opts.nextTitle), opts.nextLinks.map((l) => h('a', { class: 'btn' + (l.primary ? ' primary' : ''), href: l.href }, l.label))));
  }

  function reviewSummary() {
    const sc = score();
    const pct = Math.round((100 * sc.right) / sc.total);
    return h('section', { class: 'summary' },
      h('h2', null, 'Exam submitted'),
      h('div', { class: 'big-score' }, String(sc.right), h('span', null, `of ${sc.total} correct (${pct}%)`)),
      sc.pending > 0 && h('p', { class: 'muted' }, `${sc.pending} short-answer question${sc.pending > 1 ? 's' : ''} still need${sc.pending > 1 ? '' : 's'} self-grading below (counted as 0 until marked).`),
      h('div', { class: 'sec-scores' }, [...sc.secs].map(([k, v]) => h('div', { class: 'sec-score' },
        h('div', { class: 'sec-name' }, k), h('div', { class: 'bar' }, h('span', { style: `width:${v.total ? (100 * v.right) / v.total : 0}%` })),
        h('div', { class: 'sec-num' }, `${v.right} of ${v.total}`)))),
      h('p', { class: 'muted' }, 'Review each question below.'));
  }

  function draw() {
    const kids = [];
    kids.push(h('div', { class: 'engine-head' },
      opts.backHref && h('a', { class: 'back', href: opts.backHref }, '' + (opts.backLabel || 'Back')),
      h('h1', null, opts.title)));
    if (S.phase === 'summary') { fill(root, ...kids, summary()); return; }
    if (timed) {
      timerEl = h('span', { class: 'timer', role: 'timer', 'aria-label': 'Time remaining' }, S.phase === 'run' ? fmtTime(Math.ceil(Math.max(0, endsAt - Date.now()) / 1000)).padStart(5, '0') : 'Done');
      kids.push(h('div', { class: 'timed-bar' },
        h('span', null, S.phase === 'run' ? 'Timed exam, no feedback until you submit' : 'Review'),
        S.phase === 'run' && timerEl,
        S.phase === 'run' && h('button', { class: 'btn small', type: 'button', onclick: () => { S.confirming = true; draw(); } }, 'Submit exam')));
      if (S.confirming && S.phase === 'run') {
        const un = items.filter((i) => !hasResp(i.q, st(i.q).resp)).length;
        kids.push(h('div', { class: 'confirm-box', role: 'alertdialog' },
          h('p', null, un ? `${un} question${un > 1 ? 's are' : ' is'} unanswered. Submit anyway?` : 'Submit your exam now?'),
          h('button', { class: 'btn primary', type: 'button', onclick: submitTimed }, 'Yes, submit'),
          h('button', { class: 'btn', type: 'button', onclick: () => { S.confirming = false; draw(); } }, 'Keep working')));
      }
      if (S.phase === 'review') kids.push(reviewSummary());
    }
    if (!S.list.length) {
      kids.push(h('div', { class: 'empty' }, h('p', null, items.length ? 'No questions match this filter.' : 'No questions here yet.'), items.length > 0 && h('button', { class: 'btn', type: 'button', onclick: () => { S.filter = 'all'; rebuild(); draw(); } }, 'Show all')));
      fill(root, ...kids); return;
    }
    const answeredN = S.list.filter((i) => fin(st(i.q)) || (timed && S.phase === 'run' && hasResp(i.q, st(i.q).resp))).length;
    kids.push(h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': S.list.length, 'aria-valuenow': answeredN, 'aria-label': 'Progress' },
      h('div', { class: 'progress-fill', style: `width:${(100 * answeredN) / S.list.length}%` })));
    kids.push(h('div', { class: 'qlayout' }, h('div', { class: 'qside' }, h('div', { class: 'qstick' }, navigator(), prioNote())), card(cur())));
    fill(root, ...kids);
    setChatContext({ kind: 'question', q: cur().q, module: opts.moduleId ? opts.mods?.get(opts.moduleId) : undefined, state: st(cur().q), hideAnswer: timed && S.phase === 'run', label: `Q${S.idx + 1}` + (catTitle(cur().q.group) ? ' · ' + catTitle(cur().q.group) : '') });
    const f = root.querySelector('.timed-bar'); if (!f && timerEl) timerEl = null;
  }

  function cleanup() {
    document.removeEventListener('keydown', onKey);
    clearInterval(timerId);
  }
  draw();
  return cleanup;
}

// ---- module practice route ----
export function render(ctx) {
  const [id] = ctx.params;
  if (!id) return practiceIndex(ctx);
  const mod = ctx.mods.get(id);
  if (!mod) { ctx.root.append(h('p', null, 'Module not found.')); return; }
  document.title = 'Practice: ' + mod.title + ' · ' + HUB.short;
  const items = (mod.questions || []).map((q) => ({ q }));
  const root = h('div', { class: 'wrap engine' });
  ctx.root.append(root);
  const hasGroups = Array.isArray(mod.groups) && mod.groups.length > 0;
  const order = ctx.course.parts.find((p) => p.modules.includes(id))?.modules || [];
  const pos = order.indexOf(id), nx = pos >= 0 ? ctx.mods.get(order[pos + 1]) : null;
  const nextLinks = nx ? [{ href: '#/m/' + nx.id, label: 'Read it', primary: true }, (nx.questions || []).length > 0 && { href: '#/practice/' + nx.id, label: `Practice its ${nx.questions.filter((q) => q.priority !== 1).length} questions` }].filter(Boolean) : [];
  ctx.onCleanup(mountEngine(root, { title: `Practice: ${mod.title}`, items, backHref: '#/m/' + id, backLabel: pos >= 0 ? `Module ${pos + 1}` : 'Module', doneLabel: 'Back to reading', nextLinks, nextTitle: nx && `Next up, Module ${pos + 2}: ${nx.title}`, defaultOrder: hasGroups ? 'cat' : 'gsi', groups: mod.groups, moduleId: id, mods: ctx.mods }));
}

function practiceIndex(ctx) {
  document.title = 'Practice · ' + HUB.short;
  const parts = ctx.course.parts;
  const part = parts.find((p) => p.id === store.get('part', null)) || parts[0];
  const mods = (part?.modules || []).map((id, i) => [ctx.mods.get(id), i + 1]).filter(([m]) => m && (m.questions || []).length);
  ctx.root.append(h('div', { class: 'wrap' }, h('h1', null, 'Practice questions'),
    mods.length ? h('div', { class: 'cards' }, mods.map(([m, n]) => h('a', { class: 'mod-card', href: '#/practice/' + m.id },
      h('div', { class: 'lec' }, 'Module ' + n), h('h3', null, m.title),
      practiceStats(store.moduleScore({ questions: m.questions.filter((q) => q.priority !== 1) })), prioCounts(m))))
      : h('p', { class: 'muted' }, 'No practice questions yet.')));
}

// Bar = share of questions attempted, split into right (green) and wrong (red).
function practiceStats(sc) {
  const pct = (n) => `width:${sc.total ? (100 * n) / sc.total : 0}%`;
  const label = !sc.attempted ? `${sc.total} questions · Not started`
    : `${sc.attempted} of ${sc.total} done · ${sc.correct} right` + (sc.attempted === sc.total ? ' · ✓ Complete' : '');
  return h('div', { class: 'mc-stats' }, h('span', null, label),
    h('div', { class: 'progress pq-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': sc.total, 'aria-valuenow': sc.attempted, 'aria-label': 'Questions done' },
      h('div', { class: 'progress-fill pq-ok', style: pct(sc.correct) }), h('div', { class: 'progress-fill pq-bad', style: pct(sc.attempted - sc.correct) })));
}

function prioCounts(m) {
  const n = (p) => m.questions.filter((q) => q.priority === p).length;
  if (!n(3) && !n(2)) return null;
  return h('div', { class: 'prio-count' }, h('span', null, h('i', { class: 'pd p3' }), `${n(3)} will be tested`), n(1) > 0 && h('span', null, `${n(1)} not in slides (hidden)`));
}
