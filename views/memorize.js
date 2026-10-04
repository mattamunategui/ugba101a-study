import { HUB } from '../hub.js?v=6f7658f99f';
import { h, md, mdInline, figureEl, plain, fill, put } from '../lib/render.js?v=6f7658f99f';
import * as store from '../lib/store.js?v=6f7658f99f';

const FIELD_NAMES = { three: '3-letter code', one: '1-letter code', cls: 'class', class: 'class', group: 'category', doubleBonds: 'number of double bonds', notation: 'C:DB notation', pKaR: 'side-chain pKa', figure: 'structure' };
const ID_KEYS = ['name', 'title', 'topic', 'term', 'item'];
const ANSWER_KEYS = ['value', 'answer', 'definition', 'description'];
const idKey = (c, deck) => (deck?.idField && c.fields?.[deck.idField] != null ? deck.idField : ID_KEYS.find((k) => c.fields && c.fields[k] != null && c.fields[k] !== ''));
/** Short identifying label for a card (its name/topic field if present, else its front text). */
const ident = (c, deck) => { const k = idKey(c, deck); return k ? plain(String(c.fields[k])) : label(c); };
/** Usable question fields for a card (everything except the identifying field). */
const qkeys = (c, deck) => (!idKey(c, deck) ? [] : Object.keys(c.fields || {}).filter((k) => k !== idKey(c, deck) && c.fields[k] != null && c.fields[k] !== '' && (!deck?.quizFields || deck.quizFields.includes(k))));
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
  if (mode === 'quiz') { location.replace(`#/memorize/${deckId}/flash`); return; }
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
  if (mode === 'flash') return flash(ctx, root, deck, cards, false, { picker: true });
  if (mode === 'match' && attrsOf(deck).length > 1) return match(ctx, root, deck, cards);
  if (mode === 'groups' && deck.sets?.length) return groups(ctx, root, deck, cards);
  if (mode === 'learn') return learn(ctx, root, deck, cards);
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
  const holder = h('div', { class: 'cgrid' });
  const draw = () => {
    const tags = new Set(store.get('memtags', []) || []);
    holder.replaceChildren(...decks.map((d) => {
      const ids = new Set(d.cards.filter((c) => !tags.size || (c.tags || []).some((t) => tags.has(t))).map((c) => c.id));
      const m = store.deckMastery(d, ids);
      const miss = new Set(store.missedKeys((k) => k.startsWith(`set:${d.id}:`) || ids.has(k.split('|')[0])).map((k) => k.split('|')[0])).size;
      return h('a', { class: 'gcard', href: '#/memorize/' + d.id },
        h('h3', { class: 'rr-title' }, d.title), h('p', { class: 'rr-sub gc-desc', html: mdInline(d.description || '') }),
        h('div', { class: 'bar' }, h('span', { style: `width:${m}%` })),
        h('div', { class: 'rr-meta' }, h('span', null, `${ids.size} card${ids.size === 1 ? '' : 's'}${tags.size ? ' (filtered)' : ''}`), h('span', null, `${m}% mastery`), miss > 0 && h('span', { class: 'gc-miss' }, `${miss} missed`)));
    }));
    if (!decks.length) holder.append(h('p', { class: 'muted' }, 'No decks yet.'));
  };
  put(root, h('a', { class: 'back', href: '#/' }, 'Home'), h('h1', null, 'Memorize'),
    h('p', { class: 'lede' }, 'Multiple-choice flashcards with spaced repetition, attribute matching, group sets and type-in practice.'),
    tagFilter(allTags(decks), draw), holder);
  draw();
}

function deckHome(ctx, root, deck, cards) {
  const dist = [0, 0, 0, 0, 0, 0]; let fresh = 0; const now = Date.now(); let due = 0;
  for (const c of cards) { const s = store.getCard(c.id); if (!s) { fresh++; due++; } else { dist[s.b]++; if (s.due <= now) due++; } }
  const max = Math.max(1, ...dist.slice(1), fresh);
  const modes = [['learn', 'Learn', 'Browse every card with all its attributes, as cards or a table.'], ['flash', 'Flashcards', `${due} due. Pick the right answer from 4 choices.`],
    attrsOf(deck).length > 1 && ['match', 'Match attributes', 'Choose a question and an answer attribute, e.g. 1-letter code to structure.'],
    deck.sets?.length && ['groups', 'Groups', `${deck.sets.length} sets. Tap every item that fits a characteristic.`],
    ['type', 'Type-in', 'Type the answer from memory.']].filter(Boolean);
  put(root, h('a', { class: 'back', href: '#/memorize' }, 'Decks'), h('h1', null, deck.title),
    deck.description && h('p', { class: 'lede', html: mdInline(deck.description) }),
    tagFilter(allTags([deck]), () => { root.replaceChildren(); deckHome(ctx, root, deck, deck.cards.filter((c) => { const t = new Set(store.get('memtags', []) || []); return !t.size || (c.tags || []).some((x) => t.has(x)); })); }),
    h('p', { class: 'muted' }, `${cards.length} card${cards.length === 1 ? '' : 's'}, ${due} due, ${store.deckMastery(deck, new Set(cards.map((c) => c.id)))}% mastery`),
    h('div', { class: 'cgrid modes' }, modes.map(([m, t, s]) => h('a', { class: 'gcard', href: `#/memorize/${deck.id}/${m}` }, h('h3', { class: 'rr-title' }, t), h('p', { class: 'rr-sub' }, s)))),
    h('div', { class: 'boxes', 'aria-label': 'Leitner box distribution' }, h('h2', null, 'Boxes'),
      [['New', fresh], [1, dist[1]], [2, dist[2]], [3, dist[3]], [4, dist[4]], [5, dist[5]]].map(([l, n]) => h('div', { class: 'box-line' }, h('span', { class: 'box-l' }, l === 'New' ? 'New' : 'Box ' + l), h('div', { class: 'bar' }, h('span', { style: `width:${(100 * n) / max}%` })), h('span', { class: 'box-n' }, String(n))))));
}

// ---------- shared bits ----------
// the router focuses <main> after render, so defer our own focus
const focusSoon = (el, sel) => setTimeout(() => el.querySelector(sel)?.focus({ preventScroll: true }), 0);
const headEl = (href, lab, title) => h('div', { class: 'engine-head' }, h('a', { class: 'back', href }, lab), h('h1', null, title));
const missBtn = (n, go) => h('button', { class: 'btn', type: 'button', disabled: !n, onclick: go }, `Missed only (${n})`);
function startView(root, back, title, intro, btns, sel = '.btn.primary') {
  fill(root, headEl(back.href, back.label, title), intro, h('div', { class: 'row-actions' }, btns));
  focusSoon(root, sel);
}
function summaryView(root, head, { title = 'Round complete', right, total, miss = [], btns = [], top }) {
  fill(root, head, h('div', { class: 'summary' }, h('h2', null, title),
    h('div', { class: 'big-score' }, String(right), h('span', null, `of ${total} correct (${total ? Math.round((100 * right) / total) : 0}%)`)), top,
    miss.length > 0 && h('div', null, h('h3', null, 'Missed'), h('ul', { class: 'miss-list' }, miss)), h('div', { class: 'row-actions' }, btns)));
  focusSoon(root, '.summary .row-actions .btn');
}
const uniq = (list, key, ban, n = 3) => { const seen = new Set(ban), out = []; for (const x of list) { const k = key(x); if (k != null && !seen.has(k)) { seen.add(k); out.push(x); if (out.length === n) break; } } return out; };
const fk = (c) => c.figure && (c.figure.smiles || c.figure.img);
const done = (q) => { const ch = [{ ...q.right, ok: 1 }, ...q.dis]; shuffle(ch); return { ...q, choices: ch, ans: ch.findIndex((x) => x.ok) }; };

// ---------- attributes (Match / Groups) ----------
const SETS = 'sets', FIG = 'figure';
function attrsOf(deck, withSets = true) {
  const c0 = deck.cards.find((c) => c.fields);
  const idk = c0 && idKey(c0, deck);
  if (!idk && !deck.matrix) return []; // fields without a name/title are metadata (module, kind)
  const ks = deck.matrix?.fields || [idk, ...(deck.quizFields || Object.keys(c0?.fields || {})), FIG];
  const has = (k) => (k === FIG ? deck.cards.some((c) => c.figure) : deck.cards.some((c) => c.fields?.[k] != null && c.fields[k] !== ''));
  const out = [...new Set(ks.filter(Boolean))].filter(has).map((id) => ({ id, label: up(id === FIG ? deck.fieldLabels?.figure || 'structure' : fieldName(deck, id)) }));
  if (withSets && deck.sets?.length) out.push({ id: SETS, label: 'Characteristics' });
  return out;
}
const up = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const lc = (a) => a.label.toLowerCase();
const vk = (a, c) => { const v = a.id === FIG ? fk(c) : c.fields?.[a.id]; return v == null || v === '' ? null : String(v).trim().toLowerCase(); };
const chOf = (a, c) => (a.id === FIG ? { f: bare(c.figure) } : { t: String(c.fields[a.id]) });

/** One Match question for card c (q = question attribute, a = answer attribute), or null when it can't be made unambiguous. */
function matchItem(deck, q, a, c) {
  const cs = deck.cards, sets = deck.sets || [], mine = sets.filter((s) => s.members.includes(c.id));
  let it;
  if (q.id === SETS) {
    const s = pick(mine); if (!s || vk(a, c) == null) return null;
    const mem = cs.filter((x) => s.members.includes(x.id));
    it = { prompt: `Which **${lc(a)}** has this characteristic?`, big: s.title, right: chOf(a, c), explain: [c.back, s.note].filter(Boolean).join('\n\n'),
      dis: uniq(shuffle(cs.filter((x) => !s.members.includes(x.id))), (x) => vk(a, x), mem.map((x) => vk(a, x))).map((x) => chOf(a, x)) };
  } else {
    const qv = vk(q, c); if (qv == null || (a.id !== SETS && vk(a, c) == null)) return null;
    const base = { explain: c.back, ...(q.id === FIG ? { pfig: bare(c.figure) } : { big: String(c.fields[q.id]) }) };
    if (a.id === SETS) {
      if (!mine.length || cs.filter((x) => vk(q, x) === qv).length > 1) return null;
      const r = pick(mine);
      it = { ...base, prompt: `Which characteristic fits this **${lc(q)}**?`, right: { t: r.title }, explain: `${c.back}\n\n**Belongs to:** ${mine.map((s) => s.title).join('; ')}`,
        dis: uniq(shuffle(sets.filter((s) => !s.members.includes(c.id))), (s) => s.title.toLowerCase(), [r.title.toLowerCase()]).map((s) => ({ t: s.title })) };
    } else {
      const corr = new Set(cs.filter((x) => vk(q, x) === qv).map((x) => vk(a, x)));
      if (corr.size > 1) return null;
      it = { ...base, prompt: `Which **${lc(a)}** goes with this **${lc(q)}**?`, right: chOf(a, c), dis: uniq(shuffle(cs.filter((x) => vk(q, x) !== qv)), (x) => vk(a, x), corr).map((x) => chOf(a, x)) };
    }
  }
  if (!it.dis.length) return null;
  return { ...done(it), key: `${c.id}|${q.id}>${a.id}`, c, regen: () => matchItem(deck, q, a, c) };
}

function match(ctx, root, deck, cards) {
  const at = attrsOf(deck), saved = (store.get('memattr', {}) || {})[deck.id] || deck.matrix?.default || [];
  let qi = Math.max(0, at.findIndex((x) => x.id === saved[0])), ai = at.findIndex((x) => x.id === saved[1]);
  if (ai < 0 || ai === qi) ai = (qi + 1) % at.length;
  let note = '', sw = null;
  const back = { href: '#/memorize/' + deck.id, label: deck.title };
  const keyOf = () => `|${at[qi].id}>${at[ai].id}`;
  const save = () => store.set('memattr', { ...(store.get('memattr', {}) || {}), [deck.id]: [at[qi].id, at[ai].id] });
  const build = (only) => {
    const ms = new Set(store.missedKeys((k) => k.endsWith(keyOf())));
    const its = shuffle(cards.map((c) => matchItem(deck, at[qi], at[ai], c)).filter((x) => x && (!only || ms.has(x.key))));
    return only ? its : its.slice(0, 15);
  };
  const go = (only) => {
    const items = build(only);
    if (!items.length) { note = 'Not enough distinct, unambiguous items for this pair. Try another combination.'; paint(); return; }
    const run = (its) => runQuiz(ctx, root, { title: `${at[qi].label} to ${at[ai].label}`, backHref: back.href, backLabel: back.label, items: its,
      again: () => run(build(false)), againLabel: 'New round', retry: (m) => run(m), extra: [h('button', { class: 'btn ghost', type: 'button', onclick: () => paint() }, 'Change attributes')] });
    run(items);
  };
  const row = (name, get, mv) => h('div', { class: 'sw-row' }, h('span', { class: 'sw-name' }, name),
    h('button', { class: 'btn small sw-arrow', type: 'button', 'data-sw': name + 'p', 'aria-label': `Previous ${name.toLowerCase()} attribute`, onclick: () => { sw = name + 'p'; mv(-1); } }, '◀'),
    h('span', { class: 'sw-val', 'aria-live': 'polite' }, at[get()].label),
    h('button', { class: 'btn small sw-arrow', type: 'button', 'data-sw': name + 'n', 'aria-label': `Next ${name.toLowerCase()} attribute`, onclick: () => { sw = name + 'n'; mv(1); } }, '▶'));
  const step = (cur, d, other) => { let i = cur; do i = (i + d + at.length) % at.length; while (i === other); return i; };
  function paint() {
    save();
    const n = store.missedKeys((k) => k.endsWith(keyOf()) && cards.some((c) => k === c.id + keyOf())).length;
    startView(root, back, 'Match attributes', h('div', null, h('p', { class: 'muted' }, 'Pick what you are shown and what you have to answer.'),
      h('div', { class: 'switcher' }, row('Question', () => qi, (d) => { qi = step(qi, d, ai); note = ''; paint(); }), row('Answer', () => ai, (d) => { ai = step(ai, d, qi); note = ''; paint(); }),
        h('button', { class: 'btn small', type: 'button', 'data-sw': 'swap', onclick: () => { [qi, ai] = [ai, qi]; note = ''; sw = 'swap'; paint(); } }, 'Swap')), note && h('p', { class: 'feedback fb-bad', role: 'status' }, note)),
      [h('button', { class: 'btn primary', type: 'button', onclick: () => go(false) }, 'Continue'), missBtn(n, () => go(true))], sw ? `[data-sw="${sw}"]` : undefined);
  }
  paint();
}

// ---------- Flashcards: 4-choice quiz per card ----------
/** One MCQ for a card: structure/name/field choices, else other cards' backs. Distractors are distinct and never equal the right answer. */
function cardItem(deck, c) {
  const pool = deck.cards || [], figOk = deck.imageQuiz !== false && c.figure, lab = ident(c, deck), r = Math.random();
  const others = () => shuffle(pool.filter((x) => x.id !== c.id));
  let q = null;
  if (figOk && idKey(c, deck) && r < 0.3) {
    const dis = uniq(others(), fk, [fk(c)]);
    if (dis.length) q = { prompt: `Which structure is **${lab}**?`, right: { f: bare(c.figure) }, dis: dis.map((x) => ({ f: bare(x.figure) })) };
  }
  if (!q && figOk && (!c.fields || r < 0.65)) {
    const dis = uniq(others(), (x) => ident(x, deck).toLowerCase(), [lab.toLowerCase()]);
    if (dis.length) q = { prompt: `Which ${noun(deck)} is this?`, pfig: bare(c.figure), right: { t: lab }, dis: dis.map((x) => ({ t: ident(x, deck) })) };
  }
  if (!q && c.fields) {
    for (const k of shuffle(qkeys(c, deck))) {
      const dis = uniq(shuffle(pool.map((x) => x.fields?.[k]).filter((v) => v != null && v !== '')), (v) => String(v).toLowerCase(), [String(c.fields[k]).toLowerCase()]);
      if (dis.length) { q = { prompt: fieldPrompt(deck, c, k), right: { t: String(c.fields[k]) }, dis: dis.map((t) => ({ t: String(t) })) }; break; }
    }
  }
  if (!q) q = { prompt: c.front, pfig: c.figure && bare(c.figure), right: { t: c.back }, dis: uniq(others(), (x) => norm(x.back), [norm(c.back)]).map((x) => ({ t: x.back })) };
  return { ...done(q), key: c.id, explain: c.back, c, gsi: isGsi(c), regen: () => cardItem(deck, c) };
}

/** Quiz runner: items = [{key, prompt, big?, pfig?, choices:[{t|f}], ans, explain, regen?}]. Keys 1-4 pick, Enter = Next. */
function runQuiz(ctx, root, cfg) {
  root._stop?.();
  let queue = [...cfg.items], picked = null, n = 0;
  const first = new Map(), total = queue.length;
  const onKey = (e) => {
    if (!root.isConnected) return stop();
    if (e.metaKey || e.ctrlKey || e.altKey || !queue.length) return;
    const tag = e.target.tagName;
    if (picked == null && /^[1-9]$/.test(e.key) && +e.key <= queue[0].choices.length && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); pick(+e.key - 1); }
    else if (picked != null && e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); next(); }
  };
  const stop = () => { document.removeEventListener('keydown', onKey); root._stop = null; };
  document.addEventListener('keydown', onKey); root._stop = stop; ctx.onCleanup(stop);
  function pick(i) {
    const it = queue[0], ok = i === it.ans; picked = i;
    if (!first.has(it.key)) first.set(it.key, { it, ok });
    store.setRes(it.key, ok); cfg.onAnswer?.(it, ok);
    draw();
  }
  function next() {
    const it = queue.shift(), ok = picked === it.ans; picked = null;
    if (ok || !cfg.requeue) n++; else queue.splice(Math.min(3, queue.length), 0, it.regen ? it.regen() : it);
    draw();
  }
  function draw() {
    const head = headEl(cfg.backHref, cfg.backLabel, cfg.title);
    if (!queue.length) {
      const all = [...first.values()], miss = all.filter((x) => !x.ok).map((x) => x.it);
      if (!all.length) { fill(root, head, h('div', { class: 'summary' }, cfg.empty, h('div', { class: 'row-actions' }, cfg.again && h('button', { class: 'btn primary', type: 'button', onclick: cfg.again }, cfg.againLabel), h('a', { class: 'btn ghost', href: cfg.backHref }, 'Done')))); focusSoon(root, '.summary .btn'); return; }
      summaryView(root, head, { title: cfg.requeue ? 'Session complete' : 'Round complete', right: all.length - miss.length, total: all.length, top: cfg.footer?.(),
        miss: miss.map((it) => { const r = it.choices[it.ans]; return h('li', null, it.pfig && figureEl(it.pfig, { small: true }), plain(it.big ?? it.prompt) + ' → ', r.f ? figureEl(r.f, { small: true }) : h('strong', { html: mdInline(r.t) })); }),
        btns: [miss.length > 0 && h('button', { class: 'btn primary', type: 'button', onclick: () => cfg.retry(miss.map((it) => (it.regen ? it.regen() : it)).filter(Boolean)) }, 'Retry missed'),
          cfg.again && h('button', { class: 'btn' + (miss.length ? '' : ' primary'), type: 'button', onclick: cfg.again }, cfg.againLabel), cfg.extra, h('a', { class: 'btn ghost', href: cfg.backHref }, 'Done')] });
      return;
    }
    const it = queue[0], ok = picked === it.ans, fig = it.choices.some((x) => x.f);
    const opts = h('div', { class: 'opts' + (fig ? ' fig-opts' : ''), role: 'group', 'aria-label': 'Answer choices' }, it.choices.map((x, i) =>
      h('button', { class: 'opt' + (fig ? ' opt-fig' : '') + (picked == null ? '' : i === it.ans ? ' correct' : i === picked ? ' wrong' : ''), type: 'button', disabled: picked != null, onclick: () => pick(i) },
        h('span', { class: 'opt-key' }, String(i + 1)), x.f ? figureEl(x.f, { small: true }) : h('span', { class: 'opt-text', html: md(x.t) }),
        picked != null && (i === it.ans || i === picked) && h('span', { class: 'opt-flag', 'aria-hidden': 'true' }, i === it.ans ? '✓' : '✗'))));
    const last = queue.length === 1 && (picked == null || ok || !cfg.requeue);
    fill(root, head,
      h('div', { class: 'progress-label' }, `${queue.length} left${cfg.meta ? ', ' + cfg.meta(it) : ''}`),
      h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${total ? (100 * n) / total : 0}%` })),
      h('article', { class: 'qcard' }, it.gsi && h('span', { class: 'tag-focus', title: HUB.focus.label }, HUB.focus.short + ' focus'),
        h('div', { class: 'prompt', html: md(it.prompt) }), it.big != null && h('div', { class: 'mq-big', html: mdInline(it.big) }), it.pfig && figureEl(it.pfig), opts,
        picked != null && h('div', { class: 'feedback ' + (ok ? 'fb-ok' : 'fb-bad'), role: 'status' }, h('div', { class: 'fb-head' }, ok ? '✓ Correct' : '✗ Not quite'), h('div', { class: 'md', html: md(it.explain) }),
          it.c?.source && h('div', { class: 'fb-sub' }, 'Source: ' + it.c.source)),
        picked != null && h('div', { class: 'q-foot' }, h('span'), h('button', { class: 'btn primary', type: 'button', onclick: next }, last ? 'Finish' : 'Next (Enter)'))),
      cfg.footer?.());
    focusSoon(root, picked == null ? '.opt' : '.q-foot .btn');
  }
  draw();
}

export function flash(ctx, root, deck, cards, all = false, o = {}) {
  const backHref = o.backHref || '#/memorize/' + deck.id;
  const deckOf = (c) => (o.deckOf && o.deckOf(c)) || deck;
  const boxes = () => {
    const d = [0, 0, 0, 0, 0, 0]; let n = 0;
    for (const c of cards) { const s = store.getCard(c.id); if (s) d[s.b]++; else n++; }
    return h('div', { class: 'box-strip', 'aria-label': 'Box distribution' }, h('span', null, `New ${n}`), [1, 2, 3, 4, 5].map((b) => h('span', null, `Box ${b}: ${d[b]}`)));
  };
  const dueCards = (every) => { const now = Date.now(); return cards.filter((c) => { const s = store.getCard(c.id); return every || !s || s.due <= now; }); };
  const run = (list) => runQuiz(ctx, root, { title: 'Flashcards', backHref, backLabel: deck.title, requeue: true, footer: boxes,
    items: list.map((c) => cardItem(deckOf(c), c)), retry: (m) => run(m.map((it) => it.c)),
    meta: (it) => { const s = store.getCard(it.c.id); return `box ${s?.b || 1}${s ? '' : ' (new)'}`; },
    onAnswer: (it, ok) => { const s = store.getCard(it.c.id); store.setCard(it.c.id, ok ? (s?.b || 1) + 1 : 1); },
    empty: [h('h2', null, 'All caught up'), h('p', { class: 'muted' }, 'No cards are due right now. Come back later, or review everything anyway.'), boxes()],
    again: all ? null : () => flash(ctx, root, deck, cards, true, { ...o, picker: false }), againLabel: 'Study all cards anyway' });
  const sorted = (l) => shuffle(l).sort((a, b) => ((store.getCard(a.id)?.b || 1) - (store.getCard(b.id)?.b || 1)) || (isGsi(b) - isGsi(a)));
  if (!o.picker) return run(sorted(dueCards(all)));
  const nd = dueCards(false).length, miss = cards.filter((c) => store.getRes(c.id) === false);
  startView(root, { href: backHref, label: deck.title }, 'Flashcards', h('p', { class: 'muted' }, `${nd} due of ${cards.length} cards. Pick the right answer; a miss sends the card back to box 1.`),
    [nd > 0 && h('button', { class: 'btn primary', type: 'button', onclick: () => run(sorted(dueCards(false))) }, `Study ${nd} due`),
      h('button', { class: 'btn' + (nd ? '' : ' primary'), type: 'button', onclick: () => run(sorted(dueCards(true))) }, 'Study all cards'),
      missBtn(miss.length, () => run(sorted(miss)))]);
}

// ---------- Groups ----------
function groups(ctx, root, deck, cards) {
  const sets = deck.sets, at = attrsOf(deck, false), key = (s) => `set:${deck.id}:${s.id}`;
  const back = '#/memorize/' + deck.id;
  let disp = at.find((x) => x.id === store.get('memgdisp')) || at[0];
  const body = (c) => (disp?.id === FIG && c.figure ? figureEl(bare(c.figure), { small: true }) : h('span', { class: 'gt-t', html: mdInline(disp && disp.id !== FIG && c.fields?.[disp.id] != null ? String(c.fields[disp.id]) : ident(c, deck)) }));
  const names = (s) => s.members.map((id) => { const c = deck.cards.find((x) => x.id === id); return c ? ident(c, deck) : id; }).join(', ');
  const run = (seq) => round(seq, 0, new Map());
  function menu() {
    root._stop?.();
    const miss = sets.filter((s) => store.getRes(key(s)) === false);
    fill(root, headEl(back, deck.title, 'Groups'), h('p', { class: 'muted' }, 'Pick a characteristic, then tap every item that has it.'),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => run(sets) }, 'Quiz all groups'), missBtn(miss.length, () => run(miss))),
      h('div', { class: 'cgrid' }, sets.map((s) => { const r = store.getRes(key(s)); return h('button', { class: 'gcard', type: 'button', onclick: () => run([s]) },
        h('h3', { class: 'rr-title' }, s.title), h('p', { class: 'rr-sub' }, `${s.members.length} member${s.members.length === 1 ? '' : 's'}`), r != null && h('span', { class: r ? 'gc-ok' : 'gc-miss' }, r ? '✓ got it last time' : '✗ missed last time')); })));
    focusSoon(root, '.btn.primary');
  }
  function finish(seq, res) {
    root._stop?.();
    const miss = seq.filter((s) => res.get(s.id) === false);
    summaryView(root, headEl(back, deck.title, 'Groups'), { right: seq.length - miss.length, total: seq.length,
      miss: miss.map((s) => h('li', null, h('strong', null, s.title + ': '), names(s))),
      btns: [miss.length > 0 && h('button', { class: 'btn primary', type: 'button', onclick: () => run(miss) }, 'Retry missed'), h('button', { class: 'btn' + (miss.length ? '' : ' primary'), type: 'button', onclick: menu }, 'All groups'), h('a', { class: 'btn ghost', href: back }, 'Done')] });
  }
  function round(seq, i, res) {
    root._stop?.();
    const s = seq[i], mem = new Set(s.members), sel = new Set(), tiles = new Map();
    let checked = false;
    const grid = h('div', { class: 'gtiles' }), out = h('div'), count = h('span', { class: 'muted' }, '0 selected');
    const draw = () => { tiles.clear(); grid.replaceChildren(...deck.cards.map((c) => { const b = h('button', { class: 'gt' + (sel.has(c.id) ? ' on' : ''), type: 'button', 'aria-pressed': String(sel.has(c.id)), 'aria-label': ident(c, deck), disabled: checked, onclick: () => { sel.has(c.id) ? sel.delete(c.id) : sel.add(c.id); b.classList.toggle('on', sel.has(c.id)); b.setAttribute('aria-pressed', String(sel.has(c.id))); count.textContent = `${sel.size} selected`; } }, body(c)); tiles.set(c.id, b); return b; })); };
    const chips = at.length > 1 && h('div', { class: 'chips', role: 'group', 'aria-label': 'Show on tiles' }, h('span', { class: 'chips-l' }, 'Show:'), at.map((a) => h('button', { class: 'chip' + (a === disp ? ' on' : ''), type: 'button', 'aria-pressed': String(a === disp), onclick: (e) => { disp = a; store.set('memgdisp', a.id); chips.querySelectorAll('.chip').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); }); e.currentTarget.classList.add('on'); e.currentTarget.setAttribute('aria-pressed', 'true'); draw(); } }, a.label)));
    const checkBtn = h('button', { class: 'btn primary', type: 'button', onclick: check }, 'Check (Enter)');
    function check() {
      if (checked) return; checked = true; checkBtn.hidden = true;
      const hit = [...mem].filter((id) => sel.has(id)).length, bad = [...sel].filter((id) => !mem.has(id)).length, ok = hit === mem.size && !bad;
      store.setRes(key(s), ok); res.set(s.id, ok);
      for (const [id, b] of tiles) { const m = mem.has(id), p = sel.has(id); b.disabled = true; b.classList.remove('on'); if (m || p) { b.classList.add(m && p ? 'ok' : m ? 'miss' : 'bad'); b.append(h('span', { class: 'gt-flag', 'aria-hidden': 'true' }, m && p ? '✓' : m ? 'missed' : '✗')); } }
      const nx = i + 1 < seq.length;
      fill(out, h('div', { class: 'feedback ' + (ok ? 'fb-ok' : 'fb-bad'), role: 'status' }, h('div', { class: 'fb-head' }, ok ? `✓ All ${mem.size} found` : `✗ ${hit} of ${mem.size} found, ${bad} wrong pick${bad === 1 ? '' : 's'}`),
        s.note && h('div', { class: 'md', html: md(s.note) }), s.source && h('div', { class: 'fb-sub' }, 'Source: ' + s.source),
        h('div', { class: 'fb-sub' }, 'Dashed = missed, red = wrong pick.')),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => (nx ? round(seq, i + 1, res) : seq.length > 1 ? finish(seq, res) : sets.length > 1 ? round([sets[(sets.indexOf(s) + 1) % sets.length]], 0, new Map()) : menu()) }, nx ? 'Next set' : seq.length > 1 ? 'Finish' : 'Next set'),
          !ok && h('button', { class: 'btn', type: 'button', onclick: () => round(seq, i, res) }, 'Retry'), seq.length === 1 && h('button', { class: 'btn ghost', type: 'button', onclick: menu }, 'All groups')));
      focusSoon(out, '.btn.primary');
    }
    const onKey = (e) => {
      if (!root.isConnected) return stop();
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || /^(BUTTON|A|INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      e.preventDefault(); checked ? out.querySelector('.btn.primary')?.click() : check();
    };
    const stop = () => { document.removeEventListener('keydown', onKey); root._stop = null; };
    document.addEventListener('keydown', onKey); root._stop = stop; ctx.onCleanup(stop);
    draw();
    fill(root, headEl(back, deck.title, 'Groups'), seq.length > 1 && h('div', { class: 'progress-label' }, `Set ${i + 1} of ${seq.length}`),
      h('article', { class: 'qcard' }, h('div', { class: 'prompt', html: md(`Tap every one that fits: **${s.title}**`) }), chips, grid, out, h('div', { class: 'q-foot' }, count, checkBtn)));
    focusSoon(grid, '.gt');
  }
  menu();
}

// ---------- Learn: every card with all its attributes ----------
function learn(ctx, root, deck, cards) {
  const at = attrsOf(deck, false), sets = deck.sets || [], hasFig = at.some((a) => a.id === FIG);
  const cols = at.filter((a) => a.id !== FIG && a.id !== idKey(cards[0], deck));
  const title = (c) => (at.length ? ident(c, deck) : plain(c.front));
  const fig = (c) => hasFig && c.figure && figureEl(bare(c.figure), { small: true });
  const cell = (c, a) => h('span', { html: mdInline(String(c.fields?.[a.id] ?? '—')) });
  const inSets = (c) => { const m = sets.filter((s) => s.members.includes(c.id)); return m.length > 0 && h('div', { class: 'ln-sets' }, m.map((s) => h('span', { class: 'ln-chip' }, s.title))); };
  const note = (c) => c.fields?.note && h('p', { class: 'muted ln-note', html: mdInline(c.fields.note) });
  const card = (c) => h('article', { class: 'gcard lcard' }, fig(c), h('h3', { class: 'rr-title' }, title(c)),
    at.length ? h('dl', { class: 'ln-dl' }, cols.map((a) => [h('dt', null, a.label), h('dd', null, cell(c, a))])) : h('div', { class: 'md', html: md(c.back) }),
    note(c), inSets(c));
  const table = () => h('div', { class: 'ln-tablewrap' }, h('table', { class: 'ln-table' },
    h('thead', null, h('tr', null, hasFig && h('th', null, 'Structure'), h('th', null, at.length ? 'Name' : 'Front'), at.length ? cols.map((a) => h('th', null, a.label)) : h('th', null, 'Back'), sets.length > 0 && h('th', null, 'Characteristics'))),
    h('tbody', null, cards.map((c) => h('tr', null, hasFig && h('td', null, fig(c)), h('th', { scope: 'row' }, title(c)),
      at.length ? cols.map((a) => h('td', null, cell(c, a))) : h('td', { class: 'md', html: md(c.back) }), sets.length > 0 && h('td', null, inSets(c)))))));
  const body = h('div');
  let view = store.get('memlearn', 'cards') === 'table' ? 'table' : 'cards';
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'View' }, h('span', { class: 'chips-l' }, 'View:'),
    ['cards', 'table'].map((v) => h('button', { class: 'chip' + (v === view ? ' on' : ''), type: 'button', 'aria-pressed': String(v === view), 'data-v': v, onclick: () => { view = v; store.set('memlearn', v); paint(); } }, v === 'cards' ? 'Cards' : 'Table')));
  function paint() {
    chips.querySelectorAll('.chip').forEach((b) => { b.classList.toggle('on', b.dataset.v === view); b.setAttribute('aria-pressed', String(b.dataset.v === view)); });
    body.replaceChildren(view === 'table' ? table() : h('div', { class: 'cgrid lgrid' }, cards.map(card)));
  }
  put(root, headEl('#/memorize/' + deck.id, deck.title, 'Learn'), h('p', { class: 'muted' }, `${cards.length} card${cards.length === 1 ? '' : 's'}. Study them here, then test yourself with Flashcards, Match or Groups.`), chips, body);
  paint();
}

// ---------- Type-in ----------
function typein(ctx, root, deck, cards) {
  const miss = cards.filter((c) => store.getRes(c.id) === false);
  startView(root, { href: '#/memorize/' + deck.id, label: deck.title }, 'Type-in: ' + deck.title, h('p', { class: 'muted' }, 'Type each answer from memory. 15 random cards per round.'),
    [h('button', { class: 'btn primary', type: 'button', onclick: () => typeRun(ctx, root, deck, cards, cards) }, 'Start'), missBtn(miss.length, () => typeRun(ctx, root, deck, cards, miss))]);
}
function typeRun(ctx, root, deck, cards, pool) {
  const qs = shuffle([...pool]).slice(0, 15).map((c) => {
    const lab = ident(c, deck);
    const ks = qkeys(c, deck);
    if (deck.imageQuiz !== false && c.figure && (!ks.length || Math.random() < 0.5)) return { c, prompt: `Name this ${noun(deck)}`, answer: lab, figure: bare(c.figure) };
    if (ks.length) { const k = pick(ks); return { c, prompt: fieldPrompt(deck, c, k), answer: String(c.fields[k]) }; }
    return { c, prompt: c.front, answer: c.back, md: true };
  });
  let i = 0, right = 0, res = null; const wrong = [];
  function draw() {
    const head = headEl('#/memorize/' + deck.id, deck.title, 'Type-in: ' + deck.title);
    if (i >= qs.length) {
      summaryView(root, head, { right, total: qs.length, miss: wrong.map((w) => h('li', null, plain(w.prompt) + ': ', h('strong', null, plain(w.answer)))),
        btns: [wrong.length > 0 && h('button', { class: 'btn primary', type: 'button', onclick: () => typeRun(ctx, root, deck, cards, wrong.map((w) => w.c)) }, 'Retry missed'),
          h('button', { class: 'btn' + (wrong.length ? '' : ' primary'), type: 'button', onclick: () => typeRun(ctx, root, deck, cards, cards) }, 'New round'), h('a', { class: 'btn ghost', href: '#/memorize/' + deck.id }, 'Done')] });
      return;
    }
    const q = qs[i];
    const input = h(plain(q.answer).length > 40 ? 'textarea' : 'input', { class: 'num-input wide-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Your answer', disabled: !!res, placeholder: plain(q.answer).length > 40 ? 'Recall it (type or just think), then reveal…' : 'Type your answer…', value: res ? res.said : '' });
    input.value = res ? res.said : ''; // textarea ignores the value attribute
    const long = plain(q.answer).length > 40; // long answers: recall, reveal, then self-mark
    const mark = (ok) => { res.ok = ok; store.setRes(q.c.id, ok); if (ok) right++; else wrong.push(q); draw(); };
    const check = () => {
      if (res && res.ok === null) return;
      if (res) { i++; res = null; draw(); return; }
      if (long) { res = { ok: null, said: input.value }; draw(); return; }
      const ok = lenient(input.value, q.answer); res = { ok, said: input.value }; store.setRes(q.c.id, ok); if (ok) right++; else wrong.push(q); draw();
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
          !res.ok && !long && h('button', { class: 'btn small', type: 'button', onclick: () => { res.ok = true; store.setRes(q.c.id, true); right++; wrong.splice(wrong.indexOf(q), 1); draw(); } }, 'I was right')),
        h('div', { class: 'q-foot' }, h('span'), h('button', { class: 'btn primary', type: 'button', disabled: !!res && res.ok === null, onclick: check }, res ? (res.ok === null ? 'Mark yourself above' : i === qs.length - 1 ? 'Finish' : 'Next') : long ? 'Reveal answer' : 'Check'))));
    if (!res) input.focus();
    else root.querySelector('.q-foot .btn')?.focus();
  }
  draw();
}
