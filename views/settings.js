import { HUB } from '../hub.js?v=6f7658f99f';
import { h, applyTheme, fill, put } from '../lib/render.js?v=6f7658f99f';
import * as store from '../lib/store.js?v=6f7658f99f';

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
    fill(wrap, 
      h('a', { class: 'back', href: '#/' }, 'Home'), h('h1', null, 'Settings'),
      h('section', { class: 'card-box' }, h('h2', null, 'Theme'),
        h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Theme' }, ['auto', 'light', 'dark'].map((t) =>
          h('button', { class: 'seg-btn' + (theme === t ? ' active' : ''), type: 'button', role: 'radio', 'aria-checked': theme === t ? 'true' : 'false', onclick: () => { store.set('theme', t); applyTheme(t); draw(); } }, t[0].toUpperCase() + t.slice(1))))),
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
