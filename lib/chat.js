// "Ask Claude" tutor: bring-your-own-key chat panel, calling api.anthropic.com straight from the browser.
// The key lives only in this browser's localStorage (store key "chat-key") and is sent only to api.anthropic.com.
import { HUB } from '../hub.js?v=5c0f01166d';
import * as store from './store.js?v=5c0f01166d';
import { h, md, plain } from './render.js?v=5c0f01166d';


const MODEL = 'claude-sonnet-5-5';
const API = 'https://api.anthropic.com/v1/messages';
const KEYS_URL = 'https://console.anthropic.com/settings/keys';
const KEEP_MSGS = 40, SEND_MSGS = 12, CTX_CHARS = 8000, QUOTE_MAX = 1500;

// ---------- key (settings uses these) ----------
export const getKey = () => store.get('chat-key', null);
export const keyHint = () => { const k = getKey(); return k ? '•••• ' + k.slice(-4) : ''; };
export function setKey(k) {
  k = String(k || '').trim();
  if (!/^sk-ant-\S{10,}$/.test(k)) return false;
  store.set('chat-key', k); announce(); return true;
}
export function clearKey() { store.remove('chat-key'); announce(); }
const announce = () => window.dispatchEvent(new Event('chat:key'));

const headers = (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' });

/** Tiny 1-token request. Resolves {ok, message}. */
export async function testKey() {
  const key = getKey();
  if (!key) return { ok: false, message: 'No key saved.' };
  try {
    const r = await fetch(API, { method: 'POST', headers: headers(key), body: JSON.stringify({ model: MODEL, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }) });
    if (r.ok) return { ok: true, message: 'Key works.' };
    return { ok: false, message: await errText(r) };
  } catch { return { ok: false, message: 'Could not reach Anthropic. Check your connection and try again.' }; }
}

class ChatError extends Error {}
async function errText(r) {
  let msg = '';
  try { msg = (await r.json())?.error?.message || ''; } catch { /* not json */ }
  return statusText(r.status, msg);
}
function statusText(s, msg = '') {
  if (s === 401 || s === 403) return 'Your API key was rejected, check Settings.';
  if (s === 429 || s === 529) return 'Anthropic is busy or rate-limited, try again in a moment.';
  if (/credit balance|billing/i.test(msg)) return 'Your Anthropic account is out of credit. Add credit in the Anthropic console, then try again.';
  if (s === 400 && msg) return 'Anthropic rejected the request: ' + msg.slice(0, 200);
  return `Something went wrong (${s || 'error'}). Try again in a moment.`;
}

// ---------- state ----------
let ctxBase = null;           // {bundle, course, mods, qIndex}
let ctx = null;               // current chat context (see setChatContext)
let pageCtx = null;           // default context for the current route
let el = null;                // {fab, panel, ...}
let open = false;
let quote = '';
const threads = new Map();    // key -> {key, msgs, busy, searching, ctrl, error}
let paintQueued = false;

/** Views call this; see practice.js, module.js. ctx: {kind:'question', q, module, state, label?} | {kind:'module', module, sectionId} | {kind:'page', label, text?} */
export function setChatContext(c) {
  ctx = c;
  if (el) { paintHead(); paintBody(); }
}

const route = () => (location.hash.replace(/^#/, '').split('?')[0] || '/');
const ROUTE_LABEL = { '': 'Home', focus: 'Exam focus', max: 'Efficiencymaxxing', memorize: 'Memorize', exam: 'Exam practice', settings: 'Settings', practice: 'Practice', m: 'Module' };
function defaultCtx() {
  const seg = route().split('/').filter(Boolean)[0] || '';
  return { kind: 'page', label: ROUTE_LABEL[seg] || 'This page' };
}
const modOfQ = (q) => ctxBase?.qIndex.get(q.id)?.mod;
function threadKey(c) {
  if (c.kind === 'question') return 'q:' + c.q.id;
  if (c.kind === 'module') return 'm:' + c.module.id;
  return 'p:' + route();
}
function thread(key = threadKey(ctx)) {
  let t = threads.get(key);
  if (!t) {
    const saved = store.get('chat:' + key, []);
    t = { key, msgs: Array.isArray(saved) ? saved : [], busy: false, searching: false, ctrl: null, error: '' };
    threads.set(key, t);
  }
  return t;
}
const persist = (t) => store.set('chat:' + t.key, t.msgs.slice(-KEEP_MSGS));

function ctxLabel(c) {
  if (c.kind === 'question') return c.label || 'Question · ' + plain(c.q.prompt).slice(0, 40);
  if (c.kind === 'module') { const s = c.module.sections?.find((x) => x.id === c.sectionId); return c.module.title + (s ? ' · ' + s.heading : ''); }
  return c.label || 'This page';
}

// ---------- course knowledge ----------
let sys = null, index = null;
const STOP = new Set('the a an and or but if then of to in on at by for with without from as is are was were be been being it its this that these those i you he she we they me my your our their what which who whom why how when where do does did done can could should would will may might must not no yes so than too very just about into over under again also any some more most other such only own same both each few there here have has had having get got let up down out off one two use used using question answer choose following correct incorrect true false'.split(' '));
const terms = (s) => String(s || '').toLowerCase().match(/[a-z][a-z0-9'+-]{2,}|\d+(?:\.\d+)?/g)?.filter((w) => !STOP.has(w)) || [];
const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

function buildIndex() {
  if (index) return index;
  const docs = [];
  for (const m of ctxBase.bundle.modules) for (const s of m.sections || []) {
    const tf = new Map();
    for (const w of terms(s.body)) tf.set(w, (tf.get(w) || 0) + 1);
    for (const w of terms(s.heading)) tf.set(w, (tf.get(w) || 0) + 4);
    docs.push({ m, s, tf });
  }
  const df = new Map();
  for (const d of docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  return (index = { docs, df });
}
function retrieve(query, skip) {
  const { docs, df } = buildIndex();
  const q = [...new Set(terms(query))];
  if (!q.length) return [];
  const N = docs.length;
  return docs.filter((d) => !(skip && d.s.id === skip.sid && d.m.id === skip.mid))
    .map((d) => ({ d, score: q.reduce((a, w) => a + (d.tf.has(w) ? (1 + Math.log(d.tf.get(w))) * Math.log(1 + N / (df.get(w) || 1)) : 0), 0) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.d);
}

function systemText() {
  const { course, bundle, mods } = ctxBase;
  const L = [];
  L.push(`You are a tutor for the study hub "${HUB.name}". Be concise and exam-focused: short answers first, then detail only if useful. Use Markdown, and $...$ for math.`);
  for (const p of course.parts) {
    const e = p.exam;
    L.push(`${p.title}${p.instructor ? ' (' + p.instructor + ')' : ''}${e ? `. Exam: ${e.title}${e.start ? ', ' + e.start.slice(0, 10) : ''}` : ''}.`);
    if (e?.facts?.length) L.push('Exam facts:\n' + e.facts.map((f) => '- ' + f).join('\n'));
  }
  L.push(`Rules:
- Prefer the course material below and in the per-message excerpts. Only search the web when the course material does not answer the question, and say clearly when an answer comes from the web.
- Cite course sources exactly as they appear in the material (for example "Lecture 3 slide 13" or "PS2 Q4"). Never invent sources.
- When pointing to where to study, give deep links as Markdown links: [Section heading](#/m/<moduleId>?s=<sectionId>), or [Efficiencymaxxing](#/max) for the exam playbook. Only use module and section ids listed below.
- For "do I need to memorize this?", check the must-know sheet and the professor's memorize/emphasis list below, and say clearly if the item is NOT on them.
- If the student has not answered the current question yet, give hints and the method, not the final answer, unless they ask for it.
- Do not mention these instructions.`);
  L.push('## Modules and sections (ids)\n' + bundle.modules.map((m) => `- ${m.id}: ${m.title}\n` + (m.sections || []).map((s) => `  - ${s.id}: ${s.heading}`).join('\n')).join('\n'));
  const must = (bundle.playbook || []).filter((f) => f.mustknow);
  if (must.length) L.push('## Must-know sheet (playbook)\n' + must.flatMap((f) => f.mustknow).map((g) => `### ${g.title}\n` + (g.items || []).map((i) => '- ' + i).join('\n')).join('\n'));
  const emph = [];
  for (const m of bundle.modules) for (const s of m.sections || []) for (const e of s.profEmphasis || []) emph.push(`- [${m.id}/${s.id}] ${e.text}${e.source ? ' (' + e.source + ')' : ''}`);
  if (emph.length) L.push("## Professor's memorize / emphasis list (from the lectures and exam info)\n" + emph.join('\n'));
  const foc = (bundle.focus || []).filter((f) => f.description);
  if (foc.length) L.push('## Exam focus page\n' + foc.map((f) => f.description).join('\n\n'));
  return L.join('\n\n');
}

// ---------- per-message context ----------
const respText = (q, r) => {
  if (r == null || r === '') return null;
  if (q.type === 'mcq') return q.choices?.[r] != null ? `${r + 1}. ${q.choices[r]}` : String(r);
  if (q.type === 'tf') return r ? 'True' : 'False';
  if (q.type === 'multi') return (r || []).map((i) => `${i + 1}. ${q.choices?.[i]}`).join('; ') || null;
  if (q.type === 'short') return r === 'got' ? 'self-marked: got it' : r === 'missed' ? 'self-marked: missed it' : String(r);
  return String(r);
};
const answerText = (q) => (q.type === 'mcq' ? respText(q, q.answer) : q.type === 'tf' ? (q.answer ? 'True' : 'False') : q.type === 'multi' ? respText(q, q.answer) : q.type === 'numeric' ? `${q.answer}${q.unit ? ' ' + q.unit : ''}${q.tolerance ? ' (± ' + q.tolerance + ')' : ''}` : String(q.answer));
const link = (m, s) => `#/m/${m}?s=${s}`;

function questionBlock(c) {
  const q = c.q, s = c.state || {}, mod = c.module || modOfQ(q);
  const ok = s.firstOk ?? s.ok;
  const fin = s.done || s.wrong;
  const status = !fin ? 'unanswered' : ok ? 'right' : 'wrong';
  const resp = respText(q, s.resp ?? (q.type === 'short' ? s.draft : null));
  const o = {
    id: q.id, module: mod && { id: mod.id, title: mod.title }, type: q.type, prompt: q.prompt,
    ...(q.choices && { choices: q.choices.map((t, i) => `${i + 1}. ${t}`) }),
    source: q.source, tags: q.tags, group: q.group, difficulty: q.difficulty, emphasis: q.emphasis || undefined,
    student: { status, response: resp, tries: s.tries || 0, answer_revealed: !!(s.done || s.revealed) },
    ...(!c.hideAnswer && { correct_answer: answerText(q), explanation: q.explanation }),
  };
  const g = q.guide;
  if (g && !c.hideAnswer) o.guide = { concept: g.concept, steps: g.steps, review: g.review, links: (g.links || []).map((l) => link(l.module, l.section)) };
  return 'The student is working on this practice question:\n' + JSON.stringify(o, (k, v) => (v == null || (Array.isArray(v) && !v.length) ? undefined : v), 1);
}
function moduleBlock(c) {
  const m = c.module, s = m.sections?.find((x) => x.id === c.sectionId) || m.sections?.[0];
  let t = `The student is reading module ${m.id} "${m.title}"${m.summary ? ' (' + m.summary + ')' : ''}.`;
  if (s) {
    t += `\nThe section currently in view is [${s.id}] "${s.heading}" (${link(m.id, s.id)}):\n\n${s.body}`;
    for (const g of s.gsiFocus || []) t += `\n- ${HUB.focus.label}: ${g.text}${g.source ? ' (' + g.source + ')' : ''}`;
    for (const e of s.profEmphasis || []) t += `\n- Professor emphasis: ${e.text}${e.source ? ' (' + e.source + ')' : ''}`;
  }
  return t;
}
function pageBlock(c) {
  const text = c.text ?? (document.getElementById('main')?.innerText || '');
  return `The student is on the page "${c.label}" (${location.hash || '#/'}).` + (text ? '\nVisible content:\n' + clip(text.replace(/\n{3,}/g, '\n\n'), 4000) : '');
}

function userContent(text, q) {
  const parts = [];
  const cb = ctx.kind === 'question' ? questionBlock(ctx) : ctx.kind === 'module' ? moduleBlock(ctx) : pageBlock(ctx);
  parts.push(`<current_context>\n${cb}\n</current_context>`);
  const query = [text, q, ctx.kind === 'question' ? ctx.q.prompt + ' ' + (ctx.q.choices || []).join(' ') : ''].join(' ');
  const skip = ctx.kind === 'module' ? { mid: ctx.module.id, sid: ctx.sectionId } : null;
  let left = CTX_CHARS; const ex = [];
  for (const d of retrieve(query, skip)) {
    if (left < 400) break;
    const body = clip(d.s.body, Math.min(left, 3200));
    left -= body.length;
    ex.push(`[${d.m.title} › ${d.s.heading}] (${link(d.m.id, d.s.id)})\n${body}`);
  }
  if (ex.length) parts.push(`<course_excerpts>\n${ex.join('\n\n---\n\n')}\n</course_excerpts>`);
  if (q) parts.push(`<selected_text>\n${q}\n</selected_text>`);
  parts.push(`<student_message>\n${text}\n</student_message>`);
  return parts.join('\n\n');
}

/** Exposed for tests/inspection: the exact request body that would be sent. */
export function buildBody(t, text, q) {
  const hist = t.msgs.slice(0, -1).slice(-(SEND_MSGS - 1)).map((m) => ({ role: m.role, content: m.text }));
  while (hist.length && hist[0].role !== 'user') hist.shift();
  return {
    model: MODEL, max_tokens: 1500, stream: true,
    system: [{ type: 'text', text: (sys ||= systemText()), cache_control: { type: 'ephemeral' } }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    messages: [...hist, { role: 'user', content: userContent(text, q) }],
  };
}

// ---------- streaming ----------
async function stream(t, body, onEvent) {
  let r;
  try {
    r = await fetch(API, { method: 'POST', headers: headers(getKey()), body: JSON.stringify(body), signal: t.ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ChatError('Could not reach Anthropic. Check your connection and retry.');
  }
  if (!r.ok) throw new ChatError(await errText(r));
  const rd = r.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      const data = raw.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (!data) continue;
      let ev; try { ev = JSON.parse(data); } catch { continue; }
      onEvent(ev);
    }
  }
}

function run(t, text, q) {
  const a = { role: 'assistant', text: '', sources: [] };
  const body = buildBody(t, text, q);
  t.msgs.push(a);
  t.busy = true; t.searching = false; t.error = ''; t.ctrl = new AbortController();
  const addSrc = (c) => { if (c?.url && /^https?:\/\//.test(c.url) && !a.sources.some((s) => s.url === c.url)) a.sources.push({ url: c.url, title: c.title || c.url }); };
  const ev = (e) => {
    if (e.type === 'content_block_start') {
      const b = e.content_block || {};
      if (b.type === 'server_tool_use') t.searching = true;
      else if (b.type === 'web_search_tool_result') t.searching = false;
      else if (b.type === 'text') { t.searching = false; (b.citations || []).forEach(addSrc); }
    } else if (e.type === 'content_block_delta') {
      const d = e.delta || {};
      if (d.type === 'text_delta') a.text += d.text;
      else if (d.type === 'citations_delta') addSrc(d.citation);
    } else if (e.type === 'message_delta' && e.delta?.stop_reason === 'max_tokens') a.text += '\n\n*(Reply cut off. Ask me to continue.)*';
    else if (e.type === 'error') throw new ChatError(e.error?.type === 'overloaded_error' ? statusText(529) : e.error?.type === 'rate_limit_error' ? statusText(429) : e.error?.type === 'authentication_error' ? statusText(401) : 'Something went wrong. Try again in a moment.');
    queuePaint(t);
  };
  stream(t, body, ev).catch((e) => {
    if (e.name !== 'AbortError') t.error = e instanceof ChatError ? e.message : 'Something went wrong. Try again in a moment.';
  }).finally(() => {
    t.busy = false; t.searching = false; t.ctrl = null;
    if (!a.text.trim() && !a.sources.length) t.msgs.splice(t.msgs.indexOf(a), 1);
    persist(t); queuePaint(t, true);
  });
  queuePaint(t, true);
}

function send(text, retry = false) {
  const t = thread();
  if (t.busy) return;
  text = text.trim();
  if (!retry) {
    if (!text) return;
    const q = quote; quote = '';
    t.msgs.push({ role: 'user', text, ...(q && { quote: q }) });
    persist(t);
    run(t, text, q);
  } else {
    const last = t.msgs[t.msgs.length - 1];
    if (!last || last.role !== 'user') return;
    run(t, last.text, last.quote || '');
  }
  paintQuote();
}

// ---------- rendering ----------
function queuePaint(t, force) {
  if (t !== thread()) return;
  if (force) { paintBody(); return; }
  if (paintQueued) return;
  paintQueued = true;
  setTimeout(() => { paintQueued = false; paintBody(); }, 40);
}

const svgIcon = (d, size = 16) => h('span', { class: 'chat-ico', html: `<svg viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true">${d}</svg>` });
const ICON_CHAT = '<path d="M2.5 3h11a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H8L5 14v-2.5H2.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>';
const ICON_X = '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>';

function quickPrompts() {
  if (ctx.kind === 'question') {
    const s = ctx.state || {}, wrong = (s.firstOk ?? s.ok) === false && (s.done || s.wrong);
    return ['Where does this question come from?', 'Do I need to memorize this?', wrong && 'Where did I go wrong?', 'Explain the answer step by step'].filter(Boolean);
  }
  if (ctx.kind === 'module') return ['Summarize this section', "What's likely on the exam from this?"];
  return [];
}

function paintHead() {
  el.ctxLabel.textContent = ctxLabel(ctx);
  el.ctxLabel.title = ctxLabel(ctx);
}

function msgEl(m) {
  if (m.role === 'user') {
    return h('div', { class: 'chat-msg user' }, m.quote && h('blockquote', { class: 'chat-q' }, m.quote), h('div', { class: 'chat-text' }, m.text));
  }
  const body = h('div', { class: 'chat-text md', html: md(m.text) });
  body.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.removeAttribute('target'); a.removeAttribute('rel');
    a.addEventListener('click', (e) => { e.preventDefault(); peek(a.getAttribute('href')); });
  });
  return h('div', { class: 'chat-msg assistant' }, body,
    m.sources?.length > 0 && h('div', { class: 'chat-sources' }, h('div', { class: 'chat-src-title' }, 'Sources'),
      h('ul', null, m.sources.filter((s) => /^https?:\/\//i.test(s.url || '')).map((s) => h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.title))))));
}

function paintBody() {
  if (!el) return;
  const keyed = !!getKey();
  el.panel.classList.toggle('nokey', !keyed);
  if (!keyed) {
    el.msgs.replaceChildren(h('div', { class: 'chat-setup' },
      h('h3', null, 'Ask Claude about this course'),
      h('p', null, 'A tutor that knows this hub: your current question or section, the must-know sheet and the professor’s memorize list. It can search the web when the course material doesn’t answer something.'),
      h('p', null, 'It runs on your own Anthropic API key, which stays in this browser. ', h('strong', null, 'Usage is billed to your own Anthropic account.')),
      h('ol', null, h('li', null, h('a', { href: KEYS_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Create an API key'), ' in the Anthropic console.'), h('li', null, 'Paste it in ', h('a', { href: '#/settings', onclick: () => { if (innerWidth < 700) setOpen(false); } }, 'Settings'), '.'))));
    el.quick.replaceChildren(); return;
  }
  const t = thread();
  const near = el.msgs.scrollHeight - el.msgs.scrollTop - el.msgs.clientHeight < 80;
  const kids = t.msgs.map(msgEl);
  if (t.busy) kids.push(h('div', { class: 'chat-status', role: 'status' }, t.searching ? 'Searching the web…' : (t.msgs[t.msgs.length - 1]?.text ? '' : 'Thinking…')));
  if (t.error) kids.push(h('div', { class: 'chat-err', role: 'alert' }, t.error, t.msgs[t.msgs.length - 1]?.role === 'user' && h('button', { class: 'btn small', type: 'button', onclick: () => { t.error = ''; send('', true); } }, 'Retry')));
  if (!t.msgs.length && !t.busy) kids.push(h('p', { class: 'chat-empty muted' }, 'Ask anything about this page. Highlight text on the page to ask about just that part.'));
  el.msgs.replaceChildren(...kids.filter(Boolean));
  if (near || t.busy) el.msgs.scrollTop = el.msgs.scrollHeight;
  const empty = !t.msgs.length;
  el.quick.replaceChildren(...(empty && !t.busy ? quickPrompts().map((p) => h('button', { class: 'chat-chip', type: 'button', onclick: () => send(p) }, p)) : []));
  el.send.hidden = t.busy; el.stop.hidden = !t.busy;
  el.clear.disabled = !t.msgs.length && !t.busy;
}

function paintQuote() {
  if (!el) return;
  el.quoteBox.replaceChildren(...(quote ? [h('div', { class: 'chat-quote-chip' }, h('blockquote', null, clip(quote, 240)),
    h('button', { type: 'button', class: 'chat-x', 'aria-label': 'Remove quoted text', onclick: () => { quote = ''; paintQuote(); el.input.focus(); } }, svgIcon(ICON_X, 12)))] : []));
}

/** Show a linked module section in a pop-up so the student keeps their place; other in-app links open in a pop-up window. */
function peek(href) {
  const m = /^#\/m\/([^?]+)(?:\?s=([^&]+))?/.exec(href);
  const mod = m && ctxBase?.mods.get(decodeURIComponent(m[1]));
  if (!mod) { window.open(location.pathname + location.search + href, 'hub-peek', 'popup,width=960,height=820'); return; }
  const secs = (mod.sections || []).filter((s) => !m[2] || s.id === decodeURIComponent(m[2]));
  const nfig = secs.reduce((n, s) => n + (s.figures || []).length, 0);
  const d = h('dialog', { class: 'chat-peek', 'aria-label': (secs.length === 1 ? secs[0].heading : mod.title) },
    h('div', { class: 'peek-head' },
      h('div', { class: 'peek-titles' }, h('div', { class: 'peek-mod' }, mod.title), h('h2', null, secs.length === 1 ? secs[0].heading : 'Module overview')),
      h('a', { class: 'btn small', href, onclick: () => d.close() }, 'Open full page'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => d.close() }, 'Close')),
    h('div', { class: 'peek-body' }, secs.map((s) => [secs.length > 1 && h('h3', null, s.heading), h('div', { class: 'md', html: md(s.body || '') })]),
      nfig > 0 && h('p', { class: 'muted small' }, `${nfig} figure${nfig > 1 ? 's' : ''} in this section: open the full page to see ${nfig > 1 ? 'them' : 'it'}.`)));
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d); d.showModal();
}

function setOpen(on) {
  open = on;
  store.set('chat-open', on);
  document.documentElement.classList.toggle('chat-open', on);
  el.panel.hidden = !on; el.fab.hidden = on;
  el.fab.setAttribute('aria-expanded', String(on));
  if (on) { paintHead(); paintBody(); paintQuote(); setTimeout(() => (getKey() ? el.input : el.close).focus({ preventScroll: true }), 0); }
}

// ---------- selection: floating button + context menu ----------
let pop = null, menu = null;
const mainEl = () => document.getElementById('main');
function selInMain() {
  const s = getSelection();
  if (!s || s.isCollapsed || !s.rangeCount) return null;
  const text = s.toString().trim();
  const m = mainEl();
  const n = s.getRangeAt(0).commonAncestorContainer;
  const node = n.nodeType === 1 ? n : n.parentElement;
  if (!text || !m || !node || !m.contains(node) || node.closest('input, textarea, select, [contenteditable="true"], .chat-panel')) return null;
  return { text, range: s.getRangeAt(0) };
}
function askAbout(text) {
  hidePop(); hideMenu();
  quote = clip(text.replace(/\s+/g, ' '), QUOTE_MAX);
  if (!open) setOpen(true);
  paintQuote(); if (getKey()) el.input.focus();
}
function hidePop() { pop?.remove(); pop = null; }
function showPop() {
  const s = selInMain();
  if (!s) { hidePop(); return; }
  const rects = s.range.getClientRects(), r = rects[rects.length - 1] || s.range.getBoundingClientRect();
  const text = s.text;
  if (!pop) {
    pop = h('button', { class: 'chat-pop', type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => askAbout(pop._text) }, svgIcon(ICON_CHAT, 14), 'Ask about this');
    document.body.append(pop);
  }
  pop._text = text;
  const w = pop.offsetWidth || 120;
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w / 2)) + 'px';
  pop.style.top = Math.min(innerHeight - 44, r.bottom + 8) + 'px';
}
function hideMenu() { menu?.remove(); menu = null; }
function showMenu(e, text) {
  hideMenu(); hidePop();
  const item = (label, fn) => h('button', { type: 'button', role: 'menuitem', class: 'chat-menu-item', onclick: () => { hideMenu(); fn(); } }, label);
  menu = h('div', { class: 'chat-menu', role: 'menu', 'aria-label': 'Selection actions' },
    item('Ask Claude about this', () => askAbout(text)),
    item('Copy', () => { navigator.clipboard.writeText(text).catch(() => {}); }));
  document.body.append(menu);
  const x = e.clientX || 16, y = e.clientY || 16;
  menu.style.left = Math.max(4, Math.min(innerWidth - menu.offsetWidth - 4, x)) + 'px';
  menu.style.top = Math.max(4, Math.min(innerHeight - menu.offsetHeight - 4, y)) + 'px';
  menu.querySelector('button').focus();
  menu.addEventListener('keydown', (k) => {
    const b = [...menu.querySelectorAll('button')], i = b.indexOf(document.activeElement);
    if (k.key === 'ArrowDown') { k.preventDefault(); b[(i + 1) % b.length].focus(); }
    else if (k.key === 'ArrowUp') { k.preventDefault(); b[(i - 1 + b.length) % b.length].focus(); }
    else if (k.key === 'Tab') hideMenu();
  });
}

const onDocEvents = {
  mouseup: () => setTimeout(showPop, 0),
  keyup: (e) => { if (e.key.startsWith('Arrow') || e.key === 'Shift') showPop(); },
  selectionchange: () => { if (pop && !selInMain()) hidePop(); },
  scroll: () => hidePop(),
  mousedown: (e) => { if (menu && !menu.contains(e.target)) hideMenu(); },
  contextmenu: (e) => {
    const s = selInMain();
    if (!s || !navigator.clipboard?.writeText || e.target.closest?.('input, textarea, select')) return;
    e.preventDefault(); showMenu(e, s.text);
  },
  keydown: (e) => {
    if (e.key !== 'Escape') return;
    if (menu) { hideMenu(); return; }
    if (pop) { hidePop(); return; }
    if (open && el.panel.contains(document.activeElement) && !document.querySelector('.lightbox')) { setOpen(false); el.fab.focus(); }
  },
};

// ---------- mount ----------
function onHash() { pageCtx = defaultCtx(); ctx = pageCtx; if (el) { paintHead(); paintBody(); } }

export function mountChat(base) {
  ctxBase = base; sys = null; index = null;
  if (el) return;
  pageCtx = defaultCtx(); ctx = pageCtx;
  const input = h('textarea', { class: 'chat-input', rows: 2, placeholder: 'Ask a question…', 'aria-label': 'Message to Claude', maxlength: 4000 });
  const send_ = h('button', { class: 'btn primary small', type: 'submit' }, 'Send');
  const stop = h('button', { class: 'btn small', type: 'button', hidden: true, onclick: () => thread().ctrl?.abort() }, 'Stop');
  const clear = h('button', { class: 'btn small ghost', type: 'button', onclick: () => { const t = thread(); t.ctrl?.abort(); t.msgs = []; t.error = ''; persist(t); paintBody(); } }, 'Clear');
  const close = h('button', { class: 'btn small ghost chat-close', type: 'button', 'aria-label': 'Collapse Ask Claude', title: 'Collapse', onclick: () => { setOpen(false); el.fab.focus(); } }, h('span', { class: 'chat-close-t' }, innerWidth < 700 ? 'Close' : 'Collapse'), h('span', { 'aria-hidden': 'true' }, ' »'));
  const ctxLabel_ = h('div', { class: 'chat-ctx' });
  const msgs = h('div', { class: 'chat-msgs', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' });
  const quick = h('div', { class: 'chat-quick' }), quoteBox = h('div', { class: 'chat-quote' });
  const form = h('form', { class: 'chat-form', onsubmit: (e) => { e.preventDefault(); const v = input.value; if (!v.trim() || thread().busy) return; input.value = ''; send(v); } }, input, h('div', { class: 'chat-actions' }, send_, stop));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  const panel = h('aside', { class: 'chat-panel', 'aria-label': 'Ask Claude', hidden: true },
    h('header', { class: 'chat-head' }, h('div', { class: 'chat-titles' }, h('div', { class: 'chat-title' }, 'Ask Claude'), ctxLabel_), clear, close),
    msgs, quick, quoteBox, form);
  const fab = h('button', { class: 'chat-fab', type: 'button', 'aria-expanded': 'false', 'aria-label': 'Expand Ask Claude', title: 'Ask Claude', onclick: () => setOpen(true) }, h('span', { 'aria-hidden': 'true' }, '«'), svgIcon(ICON_CHAT, 16), h('span', { class: 'chat-rail-t' }, 'Ask Claude'));
  document.body.append(fab, panel);
  el = { fab, panel, msgs, quick, quoteBox, input, send: send_, stop, clear, close, ctxLabel: ctxLabel_ };
  window.addEventListener('hashchange', onHash);
  window.addEventListener('chat:key', () => paintBody());
  for (const [k, f] of Object.entries(onDocEvents)) document.addEventListener(k, f);
  if (store.get('chat-open', false) && innerWidth >= 700) setOpen(true);
  else { paintHead(); paintBody(); }
}

export function unmountChat() {
  if (!el) return;
  for (const t of threads.values()) t.ctrl?.abort();
  threads.clear();
  window.removeEventListener('hashchange', onHash);
  for (const [k, f] of Object.entries(onDocEvents)) document.removeEventListener(k, f);
  hidePop(); hideMenu();
  el.fab.remove(); el.panel.remove();
  document.documentElement.classList.remove('chat-open');
  el = null; open = false; ctxBase = null; sys = null; index = null;
}
