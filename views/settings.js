import { HUB } from '../hub.js?v=b8ec976334';
import { h, applyTheme, fill, put } from '../lib/render.js?v=b8ec976334';
import * as store from '../lib/store.js?v=b8ec976334';
import { keyHint, setKey, clearKey, testKey } from '../lib/chat.js?v=b8ec976334';

export function render(ctx) {
  document.title = 'Settings · ' + HUB.short;
  const wrap = h('div', { class: 'wrap' });
  ctx.root.append(wrap);
  function draw() {
    const theme = store.get('theme', 'auto');
    const resetBox = h('div', null);
    const showReset = (confirming) => {
      resetBox.replaceChildren(confirming
        ? h('div', { class: 'confirm-box' }, h('p', null, 'Erase all attempts, reading progress, flashcard boxes and exam scores in this browser? This cannot be undone.'),
          h('button', { class: 'btn danger', type: 'button', onclick: () => { store.resetProgress(); ctx.refreshNav(); showReset(false); resetBox.append(h('p', { class: 'good-text', role: 'status' }, 'Progress reset.')); } }, 'Yes, reset everything'),
          h('button', { class: 'btn', type: 'button', onclick: () => showReset(false) }, 'Cancel'))
        : h('button', { class: 'btn danger-outline', type: 'button', onclick: () => showReset(true) }, 'Reset my progress'));
    };
    showReset(false);
    const keyMsg = h('p', { class: 'small', role: 'status' });
    const say = (t, cls) => { keyMsg.textContent = t; keyMsg.className = 'small ' + (cls || 'muted'); };
    const keyIn = h('input', { type: 'password', class: 'num-input', autocomplete: 'off', spellcheck: 'false', placeholder: 'sk-ant-…', 'aria-label': 'Anthropic API key' });
    const hint = keyHint();
    const keyBox = hint
      ? h('div', { class: 'row-actions' }, h('code', { 'aria-label': 'Saved key, last four characters' }, hint),
        h('button', { class: 'btn small', type: 'button', onclick: async (e) => { e.target.disabled = true; say('Testing…'); const r = await testKey(); e.target.disabled = false; say(r.message, r.ok ? 'good-text' : 'warn-text'); } }, 'Test key'),
        h('button', { class: 'btn small danger-outline', type: 'button', onclick: () => { clearKey(); draw(); } }, 'Remove'))
      : h('form', { class: 'row-actions', onsubmit: (e) => { e.preventDefault(); if (setKey(keyIn.value)) draw(); else say('That does not look like an Anthropic API key (it starts with sk-ant-).', 'warn-text'); } },
        keyIn, h('button', { class: 'btn small primary', type: 'submit' }, 'Save key'));
    fill(wrap, 
      h('a', { class: 'back', href: '#/' }, 'Home'), h('h1', null, 'Settings'),
      h('section', { class: 'card-box' }, h('h2', null, 'Theme'),
        h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Theme' }, ['auto', 'light', 'dark'].map((t) =>
          h('button', { class: 'seg-btn' + (theme === t ? ' active' : ''), type: 'button', role: 'radio', 'aria-checked': theme === t ? 'true' : 'false', onclick: () => { store.set('theme', t); applyTheme(t); draw(); } }, t[0].toUpperCase() + t.slice(1))))),
      h('section', { class: 'card-box' }, h('h2', null, 'Ask Claude'),
        h('p', { class: 'muted' }, 'The chat tutor uses your own Anthropic API key. Get one in the ', h('a', { href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener noreferrer' }, 'Anthropic console'), '. It is stored only in this browser and sent only to api.anthropic.com. Usage is billed to your own Anthropic account.'),
        keyBox, keyMsg),
      h('section', { class: 'card-box' }, h('h2', null, 'Your progress'),
        h('p', { class: 'muted' }, 'Your progress (answers, sections read, flashcard boxes, exam scores) is stored only in this browser, on this device. It is never uploaded or shared, and clearing site data or switching browsers starts you fresh.'),
        !store.persistent() && h('p', { class: 'warn-text' }, 'Storage looks unavailable here (private mode?), so progress will be lost when you close this tab.'),
        resetBox),
      HUB.mode !== 'local' && h('section', { class: 'card-box' }, h('h2', null, 'Passcode'),
        h('p', { class: 'muted' }, 'Lock forgets the saved passcode on this device. You will need to enter it again to open the hub.'),
        h('button', { class: 'btn', type: 'button', onclick: () => ctx.lock() }, 'Lock and forget passcode')),
      h('p', { class: 'muted small' }, 'Content updated ' + (ctx.bundle.builtAt ? new Date(ctx.bundle.builtAt).toLocaleString() : '')));
  }
  draw();
}
