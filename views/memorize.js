import { HUB } from '../hub.js?v=9324167050';
import { h, md, mdInline, figureEl, plain, fill, put } from '../lib/render.js?v=9324167050';
import * as store from '../lib/store.js?v=9324167050';
import { mountEngine } from './practice.js?v=9324167050';

const FIELD_NAMES = { three: '3-letter code', one: '1-letter code', cls: 'class', class: 'class', group: 'category', doubleBonds: 'number of double bonds', notation: 'C:DB notation', pKaR: 'side-chain pKa' };
const ID_KEYS = ['name', 'title', 'topic', 'term', 'item'];
const ANSWER_KEYS = ['value', 'answer', 'definition', 'description'];
const idKey = (c, deck) => (deck?.idField && c.fields?.[deck.idField] != null ? deck.idField : ID_KEYS.find((k) => c.fields && c.fields[k] != null && c.fields[k] !== ''));
/** Short identifying label for a card (its name/topic field if present, else its front text). */
const ident = (c, deck) => { const k = idKey(c, deck); return k ? plain(String(c.fields[k])) : label(c); };
/** Usable question fields for a card (everything except the identifying field). */
const qkeys = (c, deck) => Object.keys(c.fields || {}).filter((k) => k !== idKey(c, deck) && c.fields[k] != null && c.fields[k] !== '' && (!deck?.quizFields || deck.quizFields.includes(k)));
const fieldPrompt = (deck, c, k) => (ANSWER_KEYS.includes(k) ? c.front
  : deck.quizPrompts?.[k] ? deck.quizPrompts[k].replace('{x}', `**${ident(c, deck)}**`)
  : `What is the **${fieldName(deck, k)}** of **${ident(c, deck)}**?`);
const fieldName = (deck, k) => deck.fieldLabels?.[k] || FIELD_NAMES[k] || k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const bare = (f) => ({ ...f, caption: null, credit: null }); // hide the caption so it can't give the answer away
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const label = (c) => { const t = plain(c.front); return t.length > 60 ? t.slice(0, 57) + '…' : t; };
function noun(deck) {
  if (deck.noun) return deck.noun;
  const t = String(deck.title || 'card').toLowerCase().replace(/^(the|sample)\s+/, '').replace(/^\d+\s+/, '').replace(/^(the|sample)\s+/, '').replace(/^\d+\s+/, '');
  return t.replace(/s$/, '') || 'card';
}
const norm = (s) => plain(String(s ?? '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
/** Lenient comparison: case/space/punctuation-insensitive, alternatives split on / ; , ( ), small typos allowed. */
export function lenient(user, target) {
  const u = norm(user); if (!u) return false;
  const full = norm(target);
  if (u === full) return true;
  const alts = String(target).split(/[\/;,()]| or /).map(norm).filter(Boolean);
  if (alts.includes(u)) return true;
  if (full.length >= 5 && lev(u, full) <= (full.length >= 10 ? 2 : 1)) return true;
  const words = (s) => plain(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
  const tw = words(target);
  if (tw.length >= 3) { const uw = new Set(words(user)); if (tw.filter((w) => uw.has(w)).length / tw.length >= 0.75) return true; }
  return false;
}

export function render(ctx) {
  const [deckId, mode] = ctx.params;
  const root = h('div', { class: 'wrap' + (mode ? ' engine' : '') });
  ctx.root.append(root);
  document.title = 'Memorize' + ' · ' + HUB.short;
  const deck = deckId && ctx.decks.get(deckId);
  if (!deckId) return list(ctx, root);
  if (!deck) { put(root, h('p', null, 'Deck not found.'), h('a', { href: '#/memorize' }, 'Back')); return; }
  const tags = new Set(store.get('memtags', []) || []);
  const cards = deck.cards.filter((c) => !tags.size || (c.tags || []).some((t) => tags.has(t)));
  if (!mode) return deckHome(ctx, root, deck, cards);
  if (!cards.length) { put(root, h('a', { class: 'back', href: '#/memorize' }, 'Decks'), h('p', null, 'No cards match the selected tags.')); return; }
  if (mode === 'flash') return flash(ctx, root, deck, cards);
  if (mode === 'quiz') return quiz(ctx, root, deck, cards);
  if (mode === 'type') return typein(ctx, root, deck, cards);
  put(root, h('p', null, 'Unknown mode.'));
}

// Only offer tags that are words and cover a few cards; the professor's memorize list always comes first.
function allTags(decks) {
  const n = new Map();
  for (const d of decks) for (const c of d.cards) for (const t of c.tags || []) n.set(t, (n.get(t) || 0) + 1);
  const special = ['gsi-focus', 'prof-memorize'];
  const keep = [...n].filter(([t, k]) => (special.includes(t) ? k >= 1 : k >= 3) && /^[a-z][a-z-]+$/i.test(t)).map(([t]) => t).sort();
  return [...special.filter((t) => keep.includes(t)), ...keep.filter((t) => !special.includes(t))];
}
const tagLabel = (t) => (t === 'prof-memorize' ? 'Prof said memorize' : t === 'gsi-focus' ? HUB.focus.short + ' focus' : t.replace(/-/g, ' '));
export const isGsi = (c) => (c.tags || []).includes('gsi-focus');

function tagFilter(tagsAll, onChange) {
  const sel = new Set(store.get('memtags', []) || []);
  if (!tagsAll.length) return null;
  const box = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by tag' });
  let expanded = tagsAll.length <= 14;
  const paint = () => fill(box, h('span', { class: 'chips-l' }, 'Tags:'), ...(expanded ? tagsAll : [...tagsAll].sort((a, b) => sel.has(b) - sel.has(a)).slice(0, 12)).map((t) => h('button', { class: 'chip' + (t === 'gsi-focus' ? ' gsi-chip-btn' : '') + (sel.has(t) ? ' on' : ''), type: 'button', 'aria-pressed': sel.has(t) ? 'true' : 'false', onclick: () => { sel.has(t) ? sel.delete(t) : sel.add(t); store.set('memtags', [...sel]); paint(); onChange(); } }, tagLabel(t))),
    sel.size ? h('button', { class: 'chip clear', type: 'button', onclick: () => { sel.clear(); store.set('memtags', []); paint(); onChange(); } }, 'Clear') : null,
    expanded ? null : h('button', { class: 'chip clear', type: 'button', onclick: () => { expanded = true; paint(); } }, `+${tagsAll.length - 12} more`));
  paint();
  return box;
}

function list(ctx, root) {
  const decks = ctx.course.parts.flatMap((p) => p.decks.map((d) => ctx.decks.get(d))).filter(Boolean);
  const holder = h('div', { class: 'rlist' });
  const draw = () => {
    const tags = new Set(store.get('memtags', []) || []);
    holder.replaceChildren(...decks.map((d) => {
      const ids = new Set(d.cards.filter((c) => !tags.size || (c.tags || []).some((t) => tags.has(t))).map((c) => c.id));
      const m = store.deckMastery(d, ids);
      return h('a', { href: '#/memorize/' + d.id },
        h('h3', { class: 'rr-title' }, d.title), h('p', { class: 'rr-sub', html: mdInline(d.description || '') }),
        h('div', { class: 'bar' }, h('span', { style: `width:${m}%` })),
        h('div', { class: 'rr-meta' }, h('span', null, `${ids.size} card${ids.size === 1 ? '' : 's'}${tags.size ? ' (filtered)' : ''}`), h('span', null, `${m}% mastery`)));
    }));
    if (!decks.length) holder.append(h('p', { class: 'muted' }, 'No decks yet.'));
  };
  put(root, h('a', { class: 'back', href: '#/' }, 'Home'), h('h1', null, 'Memorize'),
    h('p', { class: 'lede' }, 'Flashcards with spaced repetition (Leitner boxes), multiple-choice quizzes and type-in practice.'),
    tagFilter(allTags(decks), draw), holder);
  draw();
}

function deckHome(ctx, root, deck, cards) {
  const dist = [0, 0, 0, 0, 0, 0]; let fresh = 0; const now = Date.now(); let due = 0;
  for (const c of cards) { const s = store.getCard(c.id); if (!s) { fresh++; due++; } else { dist[s.b]++; if (s.due <= now) due++; } }
  const max = Math.max(1, ...dist.slice(1), fresh);
  const hasFields = cards.some((c) => c.fields);
  put(root, h('a', { class: 'back', href: '#/memorize' }, 'Decks'), h('h1', null, deck.title),
    deck.description && h('p', { class: 'lede', html: mdInline(deck.description) }),
    tagFilter(allTags([deck]), () => { root.replaceChildren(); deckHome(ctx, root, deck, deck.cards.filter((c) => { const t = new Set(store.get('memtags', []) || []); return !t.size || (c.tags || []).some((x) => t.has(x)); })); }),
    h('p', { class: 'muted' }, `${cards.length} card${cards.length === 1 ? '' : 's'}, ${due} due, ${store.deckMastery(deck, new Set(cards.map((c) => c.id)))}% mastery`),
    h('div', { class: 'boxes', 'aria-label': 'Leitner box distribution' }, h('h2', null, 'Boxes'),
      [['New', fresh], [1, dist[1]], [2, dist[2]], [3, dist[3]], [4, dist[4]], [5, dist[5]]].map(([l, n]) => h('div', { class: 'box-line' }, h('span', { class: 'box-l' }, l === 'New' ? 'New' : 'Box ' + l), h('div', { class: 'bar' }, h('span', { style: `width:${(100 * n) / max}%` })), h('span', { class: 'box-n' }, String(n))))),
    h('div', { class: 'rlist' },
      h('a', { href: `#/memorize/${deck.id}/flash` }, h('div', { class: 'rr-title' }, 'Flashcards'), h('div', { class: 'rr-sub' }, `${due} due. Flip, then Again or Good.`)),
      h('a', { href: `#/memorize/${deck.id}/quiz` }, h('div', { class: 'rr-title' }, 'Quiz'), h('div', { class: 'rr-sub' }, hasFields ? 'Multiple choice from card fields' : 'Match front to back')),
      h('a', { href: `#/memorize/${deck.id}/type` }, h('div', { class: 'rr-title' }, 'Type-in'), h('div', { class: 'rr-sub' }, 'Type the answer from memory'))));
}

// ---------- Flashcards ----------
export function flash(ctx, root, deck, cards, all = false, o = {}) {
  const backHref = o.backHref || '#/memorize/' + deck.id;
  const deckOf = (c) => (o.deckOf && o.deckOf(c)) || deck;
  const now = Date.now();
  let queue = cards.filter((c) => { const s = store.getCard(c.id); return all || !s || s.due <= now; });
  queue = shuffle(queue).sort((a, b) => ((store.getCard(a.id)?.b || 1) - (store.getCard(b.id)?.b || 1)) || (isGsi(b) - isGsi(a)));
  let flipped = false, done = 0;
  const total = queue.length;
  const stats = { again: 0, good: 0 };
  const onKey = (e) => {
    if (!root.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target.tagName;
    if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'A' && tag !== 'INPUT') { e.preventDefault(); if (queue.length) { flipped = !flipped; draw(); } }
    else if (flipped && queue.length && (e.key === '1' || e.key === 'ArrowLeft')) rate(false);
    else if (flipped && queue.length && (e.key === '2' || e.key === 'ArrowRight')) rate(true);
    else if (!flipped && queue.length && (e.key === 'Enter') && tag !== 'BUTTON' && tag !== 'A') { flipped = true; draw(); }
  };
  document.addEventListener('keydown', onKey);
  ctx.onCleanup(() => document.removeEventListener('keydown', onKey));
  function rate(good) {
    const c = queue.shift(); const s = store.getCard(c.id);
    if (good) { store.setCard(c.id, (s?.b || 1) + 1); stats.good++; done++; }
    else { store.setCard(c.id, 1); stats.again++; queue.splice(Math.min(3, queue.length), 0, c); }
    flipped = false; draw();
  }
  function boxes() {
    const d = [0, 0, 0, 0, 0, 0]; let n = 0;
    for (const c of cards) { const s = store.getCard(c.id); if (s) d[s.b]++; else n++; }
    return h('div', { class: 'box-strip', 'aria-label': 'Box distribution' }, h('span', null, `New ${n}`), [1, 2, 3, 4, 5].map((b) => h('span', null, `Box ${b}: ${d[b]}`)));
  }
  function draw() {
    const head = h('div', { class: 'engine-head' }, h('a', { class: 'back', href: backHref }, '' + deck.title), h('h1', null, 'Flashcards'));
    if (!queue.length) {
      fill(root, head, h('div', { class: 'summary' }, h('h2', null, total ? 'Session complete' : 'All caught up'),
        total ? h('p', null, `${stats.good} good, ${stats.again} again`) : h('p', { class: 'muted' }, 'No cards are due right now. Come back later, or review everything anyway.'),
        boxes(), h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { root.replaceChildren(); flash(ctx, root, deck, cards, true, o); } }, 'Study all cards anyway'),
          h('a', { class: 'btn ghost', href: backHref }, 'Done'))));
      return;
    }
    const c = queue[0];
    const front = h('div', { class: 'fc-face' }, isGsi(c) && h('span', { class: 'tag-focus', title: HUB.focus.label }, HUB.focus.short + ' focus'), h('div', { class: 'md fc-text', html: md(c.front) }), c.figure && figureEl(bare(c.figure)));
    const back = h('div', { class: 'fc-face back' }, h('div', { class: 'md fc-text', html: md(c.back) }),
      (c.fields || c.source) && h('dl', { class: 'fc-fields' }, Object.entries(c.fields || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => [h('dt', null, fieldName(deckOf(c), k)), h('dd', null, String(v))]),
        c.source && [h('dt', null, 'Source'), h('dd', null, String(c.source))]));
    const sc = store.getCard(c.id);
    fill(root, head,
      h('div', { class: 'progress-label' }, `${queue.length} left, box ${sc?.b || 1}${sc ? '' : ' (new)'}`),
      h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${total ? (100 * done) / total : 0}%` })),
      h('div', { class: 'flashcard' + (flipped ? ' flipped' : ''), role: 'button', tabindex: '0', 'aria-label': flipped ? 'Card back. Press space to flip.' : 'Card front. Press space to flip.', onclick: () => { flipped = !flipped; draw(); }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); flipped = !flipped; draw(); root.querySelector('.flashcard')?.focus(); } } },
        front, flipped && h('hr', { class: 'fc-sep' }), flipped && back,
        !flipped && h('div', { class: 'fc-hint' }, 'Click or press Space to flip')),
      flipped ? h('div', { class: 'rate-row' }, h('button', { class: 'btn bad', type: 'button', onclick: () => rate(false) }, 'Again (1)'), h('button', { class: 'btn good', type: 'button', onclick: () => rate(true) }, 'Good (2)'))
        : h('div', { class: 'rate-row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { flipped = true; draw(); } }, 'Show answer')),
      boxes());
    root.querySelector('.flashcard')?.focus({ preventScroll: true });
  }
  draw();
}

// ---------- Quiz (generated MCQs, shown by the practice engine) ----------
function makeQuiz(deck, cards, n = 10) {
  const out = [];
  const fieldKeys = [...new Set(cards.flatMap((c) => qkeys(c, deck)))];
  const vals = (k) => [...new Set(deck.cards.map((c) => c.fields?.[k]).filter((v) => v != null && v !== '').map(String))];
  for (const c of shuffle([...cards]).slice(0, n)) {
    const lab = ident(c, deck);
    let q = null;
    const imgOk = deck.imageQuiz !== false && c.figure && deck.cards.filter((x) => x.id !== c.id).length >= 1;
    if (imgOk && (!c.fields || Math.random() < 0.6)) {
      const others = shuffle([...new Set(deck.cards.filter((x) => x.id !== c.id && ident(x, deck) !== lab).map((x) => ident(x, deck)))]).slice(0, 3);
      if (others.length) {
        const choices = shuffle([lab, ...others]);
        q = { type: 'mcq', prompt: `Which ${noun(deck)} is this?`, figure: bare(c.figure), choices, answer: choices.indexOf(lab) };
      }
    }
    if (!q && c.fields) {
      const ks = shuffle(fieldKeys.filter((k) => c.fields?.[k] != null && c.fields[k] !== '' && vals(k).filter((v) => v.toLowerCase() !== String(c.fields[k]).toLowerCase()).length >= 1));
      if (ks.length) {
        const k = ks[0], right = String(c.fields[k]);
        const wrong = shuffle(vals(k).filter((v) => v.toLowerCase() !== right.toLowerCase())).slice(0, 3);
        const choices = shuffle([right, ...wrong]);
        q = { type: 'mcq', prompt: fieldPrompt(deck, c, k), choices, answer: choices.indexOf(right) };
      }
    }
    if (!q) {
      const others = shuffle([...new Set(deck.cards.filter((x) => x.id !== c.id && x.back !== c.back).map((x) => x.back))]).slice(0, 3);
      if (!others.length) continue;
      const choices = shuffle([c.back, ...others]);
      q = { type: 'mcq', prompt: c.front, choices, answer: choices.indexOf(c.back), figure: c.figure && bare(c.figure) };
    }
    out.push({ q: { id: `quiz:${c.id}:${out.length}`, explanation: c.back, source: c.source, tags: [], ...q } });
  }
  return out;
}
function quiz(ctx, root, deck, cards) {
  const items = makeQuiz(deck, cards);
  if (!items.length) { put(root, h('a', { class: 'back', href: '#/memorize/' + deck.id }, 'Back'), h('p', null, 'This deck needs at least two different cards to generate a quiz.')); return; }
  const again = () => { root.replaceChildren(); quiz(ctx, root, deck, cards); };
  ctx.onCleanup(mountEngine(root, { title: 'Quiz: ' + deck.title, items, noRecord: true, filters: false, again, backHref: '#/memorize/' + deck.id, backLabel: deck.title }));
}

// ---------- Type-in ----------
function typein(ctx, root, deck, cards) {
  const qs = shuffle([...cards]).slice(0, 15).map((c) => {
    const lab = ident(c, deck);
    const ks = qkeys(c, deck);
    if (deck.imageQuiz !== false && c.figure && (!ks.length || Math.random() < 0.5)) return { c, prompt: `Name this ${noun(deck)}`, answer: lab, figure: bare(c.figure) };
    if (ks.length) { const k = pick(ks); return { c, prompt: fieldPrompt(deck, c, k), answer: String(c.fields[k]) }; }
    return { c, prompt: c.front, answer: c.back, md: true };
  });
  let i = 0, right = 0, res = null; const wrong = [];
  function draw() {
    const head = h('div', { class: 'engine-head' }, h('a', { class: 'back', href: '#/memorize/' + deck.id }, '' + deck.title), h('h1', null, 'Type-in: ' + deck.title));
    if (i >= qs.length) {
      fill(root, head, h('div', { class: 'summary' }, h('h2', null, 'Round complete'), h('div', { class: 'big-score' }, String(right), h('span', null, `of ${qs.length} correct (${Math.round((100 * right) / qs.length)}%)`)),
        wrong.length > 0 && h('div', null, h('h3', null, 'Missed'), h('ul', null, wrong.map((w) => h('li', null, plain(w.prompt) + ': ', h('strong', null, plain(w.answer)))))),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { root.replaceChildren(); typein(ctx, root, deck, cards); } }, 'New round'), h('a', { class: 'btn ghost', href: '#/memorize/' + deck.id }, 'Done'))));
      return;
    }
    const q = qs[i];
    const input = h(plain(q.answer).length > 40 ? 'textarea' : 'input', { class: 'num-input wide-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Your answer', disabled: !!res, placeholder: plain(q.answer).length > 40 ? 'Recall it (type or just think), then reveal…' : 'Type your answer…', value: res ? res.said : '' });
    input.value = res ? res.said : ''; // textarea ignores the value attribute
    const long = plain(q.answer).length > 40; // long answers: recall, reveal, then self-mark
    const mark = (ok) => { res.ok = ok; if (ok) right++; else wrong.push(q); draw(); };
    const check = () => {
      if (res && res.ok === null) return;
      if (res) { i++; res = null; draw(); return; }
      if (long) { res = { ok: null, said: input.value }; draw(); return; }
      const ok = lenient(input.value, q.answer); res = { ok, said: input.value }; if (ok) right++; else wrong.push(q); draw();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (!long || e.metaKey || e.ctrlKey)) { e.preventDefault(); check(); } });
    fill(root, head,
      h('div', { class: 'progress-label' }, `Question ${i + 1} of ${qs.length}`),
      h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${(100 * i) / qs.length}%` })),
      h('article', { class: 'qcard' }, h('div', { class: 'prompt', html: md(q.prompt) }), q.figure && figureEl(q.figure), h('div', { class: 'num-row' }, input),
        res && res.ok === null && h('div', { class: 'feedback', role: 'status' }, h('div', { class: 'fb-head' }, 'Answer'), h('div', { class: 'md', html: md(q.answer) }),
          h('div', { class: 'row-actions' }, h('button', { class: 'btn good', type: 'button', onclick: () => mark(true) }, '✓ Got it'), h('button', { class: 'btn bad', type: 'button', onclick: () => mark(false) }, '✗ Missed it'))),
        res && res.ok !== null && h('div', { class: 'feedback ' + (res.ok ? 'fb-ok' : 'fb-bad'), role: 'status' }, h('div', { class: 'fb-head' }, res.ok ? '✓ Correct' : '✗ Not quite'),
          !res.ok && !long && h('div', null, 'Answer: ', h('strong', { html: mdInline(q.answer) })),
          !res.ok && !long && h('button', { class: 'btn small', type: 'button', onclick: () => { res.ok = true; right++; wrong.splice(wrong.indexOf(q), 1); draw(); } }, 'I was right')),
        h('div', { class: 'q-foot' }, h('span'), h('button', { class: 'btn primary', type: 'button', disabled: !!res && res.ok === null, onclick: check }, res ? (res.ok === null ? 'Mark yourself above' : i === qs.length - 1 ? 'Finish' : 'Next') : long ? 'Reveal answer' : 'Check'))));
    if (!res) input.focus();
    else root.querySelector('.q-foot .btn')?.focus();
  }
  draw();
}
