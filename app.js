import { HUB } from './hub.js?v=0ff919c245';
import { unlock, WrongPasscode } from './lib/crypto.js?v=0ff919c245';
import * as store from './lib/store.js?v=0ff919c245';
import { h, applyTheme, md } from './lib/render.js?v=0ff919c245';
import { mountChat, unmountChat } from './lib/chat.js?v=0ff919c245';

const VIEWS = {
  '': () => import('./views/home.js?v=0ff919c245'),
  m: () => import('./views/module.js?v=0ff919c245'),
  focus: () => import('./views/focus.js?v=0ff919c245'),
  max: () => import('./views/playbook.js?v=0ff919c245'),
  practice: () => import('./views/practice.js?v=0ff919c245'),
  memorize: () => import('./views/memorize.js?v=0ff919c245'),
  exam: () => import('./views/exam.js?v=0ff919c245'),
  missed: () => import('./views/missed.js?v=0ff919c245'),
  settings: () => import('./views/settings.js?v=0ff919c245'),
};

const app = document.getElementById('app');
let typedName = '', bundle = null, ctxBase = null, cleanups = [], navEl = null, mainEl = null, routeSeq = 0;

applyTheme(store.get('theme', 'auto'));
window.addEventListener('hub:progress', () => refreshNav());

// ---------- gate ----------
function showGate(message = '', busy = false) {
  bundle = null;
  app.replaceChildren();
  document.title = HUB.name;
  const input = h('input', { id: 'pass', type: 'password', autocomplete: 'current-password', placeholder: 'Passcode', 'aria-label': 'Passcode', required: true, autofocus: true, disabled: busy });
  const err = h('div', { class: 'gate-err', role: 'alert' }, message);
  const nameIn = HUB.askName && nameInput(typedName || store.getName() || '');
  const btn = h('button', { class: 'btn primary block', type: 'submit', disabled: busy }, busy ? 'Unlocking…' : 'Unlock');
  const form = h('form', { class: 'gate-card', onsubmit: async (e) => {
    e.preventDefault();
    const p = input.value;
    let name = null;
    if (nameIn) {
      name = nameIn.value.trim();
      typedName = name;
      if (!name) { err.textContent = 'Please enter your name.'; nameIn.focus(); return; }
    }
    if (!p) return;
    input.disabled = true; btn.disabled = true; btn.textContent = 'Unlocking…'; err.textContent = '';
    form.classList.add('loading');
    await tryUnlock(p, true, name);
  } },
  h('h1', null, HUB.name),
  h('p', { class: 'muted' }, 'Enter the passcode to open the hub.'),
  nameIn, h('label', { class: 'sr-only', for: 'pass' }, 'Passcode'), input, btn, err,
  h('div', { class: 'spinner', 'aria-hidden': 'true' }));
  if (busy) form.classList.add('loading');
  app.append(h('main', { class: 'gate' }, form));
  if (!busy) (nameIn && !nameIn.value ? nameIn : input).focus();
}

function nameInput(value) {
  return h('input', { id: 'name', type: 'text', autocomplete: 'name', placeholder: 'Full name', 'aria-label': 'Full name', maxlength: 80, required: true, value });
}

// Saved-passcode visitors never see the gate, so ask for the name once before opening the hub.
function askNameOnce() {
  document.title = HUB.name;
  const input = nameInput('');
  const err = h('div', { class: 'gate-err', role: 'alert' });
  const form = h('form', { class: 'gate-card', onsubmit: (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) { err.textContent = 'Please enter your name.'; return; }
    store.setName(name);
    openHub();
  } }, h('h1', null, "What's your name?"), input, h('button', { class: 'btn primary block', type: 'submit' }, 'Continue'), err);
  app.replaceChildren(h('main', { class: 'gate' }, form));
  input.focus();
}

function openHub() {
  start();
  logActivity();
}

// First unlock per browser: tell the owner's Google Form who this is. Fire-and-forget; never blocks the hub.
function logActivity() {
  const a = bundle && bundle.activity, name = store.getName();
  if (!a || !name || store.get('activity-logged', false)) return;
  try {
    fetch(a.formAction, { method: 'POST', mode: 'no-cors', body: new URLSearchParams({ [a.nameEntry]: name }) })
      .then(() => store.set('activity-logged', true), () => { /* offline: retry next visit */ });
  } catch { /* ignore */ }
}

async function tryUnlock(passcode, fromForm, name = null) {
  try {
    const b = await unlock(passcode);
    store.setPass(passcode);
    if (name) store.setName(name);
    bundle = b;
    if (HUB.askName && !store.getName()) askNameOnce(); else openHub();
  } catch (e) {
    if (e instanceof WrongPasscode) {
      if (!fromForm) store.clearPass();
      showGate(fromForm ? 'Wrong passcode. Please try again.' : 'The saved passcode no longer works. Please enter it again.');
    } else {
      console.error(e);
      showGate('Could not open the content: ' + (e.message || e));
    }
  }
}

function lock() {
  if (HUB.mode === 'local') return;
  store.clearPass();
  cleanup();
  unmountChat();
  bundle = null;
  showGate();
}

// ---------- shell + router ----------
function cleanup() { for (const f of cleanups.splice(0)) { try { f && f(); } catch (e) { console.error(e); } } }

function start() {
  const course = bundle.course;
  ctxBase = {
    bundle, course,
    mods: new Map(bundle.modules.map((m) => [m.id, m])),
    decks: new Map(bundle.decks.map((d) => [d.id, d])),
    exams: new Map(bundle.exams.map((e) => [e.id, e])),
    qIndex: new Map(),
    lock, refreshNav,
  };
  for (const m of bundle.modules) for (const q of m.questions || []) ctxBase.qIndex.set(q.id, { q, mod: m });
  app.replaceChildren();
  navEl = h('nav', { class: 'nav', 'aria-label': 'Main' });
  mainEl = h('main', { id: 'main', tabindex: '-1' });
  app.append(...[whatsNew(course)].filter(Boolean), h('header', { class: 'topbar' }, h('div', { class: 'topbar-in' }, histBtns(), h('a', { class: 'brand', href: '#/' }, h('img', { src: 'icon.svg', alt: '', width: 24, height: 24 }), h('span', null, HUB.short)), navEl)), mainEl);
  window.removeEventListener('hashchange', route);
  window.addEventListener('hashchange', route);
  mountChat(ctxBase);
  route();
}

// Back/forward buttons (routing is hash-based, so history.back/forward move between pages)
function histBtns() {
  const svg = (d) => h('span', { html: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>` });
  const b = (label, d, fn) => h('button', { class: 'hist-btn', type: 'button', 'aria-label': label, title: label, onclick: fn }, svg(d));
  return h('div', { class: 'hist' }, b('Back', 'M10 3 5 8l5 5', () => history.back()), b('Forward', 'M6 3l5 5-5 5', () => history.forward()));
}

// ---------- "What's new" banner: shown once per update per browser ----------
function whatsNew(course) {
  const ups = (course.updates || []).filter((u) => u && u.id && u.text);
  const ids = ups.map((u) => u.id);
  let seen = store.seenUpdates();
  if (seen === null && store.isFirstVisit()) { store.markUpdatesSeen(ids); seen = ids; } // brand-new visitors don't need it
  const fresh = ups.filter((u) => !(seen || []).includes(u.id));
  if (!fresh.length) return null;
  const u = fresh[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(u.date || '');
  const when = m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const box = h('div', { class: 'whatsnew', role: 'region', 'aria-label': "What's new" },
    h('div', { class: 'whatsnew-in' },
      h('div', { class: 'wn-body' }, h('span', { class: 'wn-tag' }, "What's new"), h('span', { html: md(u.text, true) }), when && h('span', { class: 'wn-date' }, when)),
      h('button', { class: 'wn-x', type: 'button', 'aria-label': "Dismiss what's new", onclick: () => { store.markUpdatesSeen(ids); box.remove(); } }, 'Dismiss')));
  box.querySelectorAll('a[href^="#"]').forEach((a) => { a.removeAttribute('target'); a.removeAttribute('rel'); });
  return box;
}

function refreshNav() {
  if (!navEl || !bundle) return;
  const seg = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const missed = store.missedItems(bundle).length;
  // `short` is the label shown on phones so all seven items fit without scrolling
  const link = (href, text, key, extra, short) => h('a', { href, class: (seg === key ? 'active' : '') + (key === '' ? ' nav-home' : ''), 'aria-current': seg === key ? 'page' : null, 'aria-label': text },
    h('span', { class: 'nl-full' }, text), h('span', { class: 'nl-short', 'aria-hidden': 'true' }, short || text), extra);
  navEl.replaceChildren(
    link('#/', 'Home', ''),
    link('#/focus', 'Exam Focus', 'focus', null, 'Focus'),
    link('#/max', 'Efficiencymaxxing', 'max', null, 'Maxx'),
    link('#/memorize', 'Memorize', 'memorize', null, 'Cards'),
    link('#/exam', 'Exams', 'exam'),
    link('#/missed', 'Missed', 'missed', missed ? h('span', { class: 'pill' }, String(missed)) : null),
    link('#/settings', 'Settings', 'settings', null, 'Settings'));
}

async function route() {
  if (!bundle) return;
  const seq = ++routeSeq;
  cleanup();
  const [path] = location.hash.replace(/^#/, '').split('?');
  const segs = path.split('/').filter(Boolean).map(decodeURIComponent);
  const key = segs[0] || '';
  const loader = VIEWS[key] || VIEWS[''];
  mainEl.replaceChildren();
  window.scrollTo(0, 0);
  refreshNav();
  try {
    const mod = await loader();
    if (seq !== routeSeq) return;
    mod.render({ ...ctxBase, root: mainEl, params: VIEWS[key] ? segs.slice(1) : [], onCleanup: (f) => cleanups.push(f) });
    if (!['practice', 'exam', 'm'].includes(key)) mainEl.focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    mainEl.replaceChildren(h('div', { class: 'wrap' }, h('h1', null, 'Something went wrong'), h('pre', { class: 'err' }, String(e && e.stack || e)), h('a', { href: '#/' }, 'Back home')));
  }
}

// ---------- boot ----------
// Local mode (private app on this Mac): plain bundle, no passcode gate.
async function openLocal() {
  try {
    const r = await fetch('data/bundle.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    bundle = await r.json();
    start();
  } catch (e) {
    app.replaceChildren(h('main', { class: 'gate' }, h('div', { class: 'gate-card' }, h('h1', null, HUB.name), h('p', { class: 'gate-err' }, 'Could not load content: ' + e.message))));
  }
}
const saved = store.getPass();
if (HUB.mode === 'local') openLocal();
else if (saved) { showGate('', true); tryUnlock(saved, false); } else showGate();
