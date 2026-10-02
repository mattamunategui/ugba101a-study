// All progress lives ONLY in this browser's localStorage under "<HUB.slug>:v1:". Nothing is ever sent anywhere.
import { HUB } from '../hub.js?v=9324167050';
// Every access is wrapped in try/catch; if storage is unavailable we fall back to in-memory state.
const P = HUB.slug + ':v1:';
const KEEP_ON_RESET = ['pass', 'theme', 'part', 'updates-seen'];
const mem = new Map();

function rawGet(k) {
  try { const v = localStorage.getItem(P + k); if (v !== null) return v; } catch { /* unavailable */ }
  return mem.has(k) ? mem.get(k) : null;
}
function rawSet(k, v) {
  mem.set(k, v);
  try { localStorage.setItem(P + k, v); } catch { /* unavailable or full */ }
}
export function get(k, def = null) {
  const v = rawGet(k);
  if (v === null) return def;
  try { return JSON.parse(v); } catch { return def; }
}
export function set(k, v) { rawSet(k, JSON.stringify(v)); }
export function remove(k) {
  mem.delete(k);
  try { localStorage.removeItem(P + k); } catch { /* ignore */ }
}
export function persistent() {
  try { localStorage.setItem(P + '_t', '1'); localStorage.removeItem(P + '_t'); return true; } catch { return false; }
}

// ---- passcode ----
export const getPass = () => get('pass', null);
export const setPass = (p) => set('pass', p);
export const clearPass = () => remove('pass');

// ---- question attempts: {qid: {ok, n, right, t}} (ok = latest attempt) ----
let attempts = null;
const A = () => (attempts ||= get('attempts', {}) || {});
export const getQ = (id) => A()[id] || null;
export function recordAnswer(id, ok) {
  const a = A()[id] || { n: 0, right: 0 };
  A()[id] = { ok: !!ok, n: a.n + 1, right: a.right + (ok ? 1 : 0), t: Date.now() };
  set('attempts', A());
  try { window.dispatchEvent(new Event('hub:progress')); } catch { /* ignore */ }
}
export function allAttempts() { return A(); }

// ---- sections read: {moduleId: [sectionId]} ----
let read = null;
const R = () => (read ||= get('read', {}) || {});
export const isRead = (m, s) => (R()[m] || []).includes(s);
export const readCount = (m) => (R()[m] || []).length;
export function setRead(m, s, on = true) {
  const arr = new Set(R()[m] || []);
  on ? arr.add(s) : arr.delete(s);
  R()[m] = [...arr];
  set('read', R());
}

// ---- Leitner cards: {cardId: {b: 1..5, due: ms}} ----
const DAY = 86400000;
export const BOX_INTERVAL = [0, 0, 0.25 * DAY, 1 * DAY, 2 * DAY, 4 * DAY]; // index = box
let cards = null;
const C = () => (cards ||= get('cards', {}) || {});
export const getCard = (id) => C()[id] || null;
export function setCard(id, box) {
  box = Math.max(1, Math.min(5, box));
  C()[id] = { b: box, due: Date.now() + BOX_INTERVAL[box] };
  set('cards', C());
}

// ---- exam results: {examId: {score, total, t}} ----
export const getExamResult = (id) => (get('exams', {}) || {})[id] || null;
export function setExamResult(id, r) { const e = get('exams', {}) || {}; e[id] = { ...r, t: Date.now() }; set('exams', e); }

// ---- Exam-focus topics marked "Got it": [topicId] ----
export const focusDone = () => new Set(get('focusdone', []) || []);
export function setFocusDone(id, on) {
  const s = focusDone(); on ? s.add(id) : s.delete(id);
  set('focusdone', [...s]);
}

// ---- "What's new" updates already dismissed: [updateId] (null = never set) ----
export const seenUpdates = () => { const v = get('updates-seen', null); return Array.isArray(v) ? v : null; };
export const markUpdatesSeen = (ids) => set('updates-seen', ids);
/** True when this browser has no saved study progress at all (a brand-new visitor). */
export function isFirstVisit() {
  return ['attempts', 'read', 'cards', 'exams', 'memtags', 'focusdone'].every((k) => rawGet(k) === null);
}

// ---- derived ----
export function moduleScore(mod) {
  let attempted = 0, correct = 0;
  for (const q of mod.questions || []) { const a = getQ(q.id); if (a) { attempted++; if (a.ok) correct++; } }
  return { total: (mod.questions || []).length, attempted, correct };
}
export function allQuestionItems(bundle) {
  const out = [], seen = new Set();
  for (const m of bundle.modules) for (const q of m.questions || []) if (!seen.has(q.id)) { seen.add(q.id); out.push({ q, label: m.title, href: '#/m/' + m.id }); }
  for (const e of bundle.exams) for (const s of e.sections || []) for (const q of s.questions || []) if (!seen.has(q.id)) { seen.add(q.id); out.push({ q, label: e.title, section: s.heading }); }
  return out;
}
export function missedItems(bundle) {
  return allQuestionItems(bundle).filter(({ q }) => { const a = getQ(q.id); return a && !a.ok; });
}
export function deckMastery(deck, ids = null) {
  const cs = deck.cards.filter((c) => !ids || ids.has(c.id));
  if (!cs.length) return 0;
  const sum = cs.reduce((s, c) => s + ((getCard(c.id)?.b || 1) - 1) / 4, 0);
  return Math.round((100 * sum) / cs.length);
}

export function resetProgress() {
  attempts = read = cards = null;
  const keep = {};
  for (const k of KEEP_ON_RESET) keep[k] = rawGet(k);
  for (const k of [...mem.keys()]) if (!KEEP_ON_RESET.includes(k)) mem.delete(k);
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(P) && !KEEP_ON_RESET.includes(k.slice(P.length))) localStorage.removeItem(k);
  } catch { /* ignore */ }
}
