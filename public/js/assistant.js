// The in-app assistant: a chat panel available on every page. It answers
// questions, takes people to the screen that solves their problem (pointing
// at the right button), and can create tasks and raise Help Desk issues.
import { get, post } from './api.js';
import { h, icon, showError } from './ui.js';

const STORE_KEY = 'cm_assistant_chat';
let ui = null;
let messages = [];
let meta = null;
let sending = false;

const load = () => { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]'); } catch { return []; } };
const persist = () => { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-30))); } catch { /* storage blocked */ } };

/** Shows or hides the assistant (it is only available when signed in). */
export function setAssistantVisible(visible) {
  if (!visible) {
    ui?.fab.remove(); ui?.panel.remove(); ui = null;
    messages = []; persist();
    return;
  }
  if (ui) return;
  messages = load();
  build();
}

function build() {
  const list = h('div', { class: 'as-msgs', role: 'log', 'aria-live': 'polite' });
  const input = h('textarea', { id: 'assistant-input', rows: 1, placeholder: 'Ask a question or describe a problem…', 'aria-label': 'Message the assistant',
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } },
    oninput: () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; } });
  const sendBtn = h('button', { class: 'btn primary as-send', title: 'Send', 'aria-label': 'Send', onclick: () => send(input.value) }, icon('send'));
  const badge = h('span', { class: 'badge blue', hidden: true }, 'AI');

  const panel = h('section', { class: 'as-panel', hidden: true, role: 'dialog', 'aria-label': 'Assistant', onkeydown: (e) => { if (e.key === 'Escape') toggle(false); } },
    h('div', { class: 'as-head' },
      h('div', { class: 'row', style: { gap: '10px', flexWrap: 'nowrap' } },
        h('div', { class: 'as-avatar' }, icon('chat')),
        h('div', h('div', { class: 'row', style: { gap: '6px' } }, h('b', 'CM Assistant'), badge), h('div', { class: 'small muted' }, 'Finds the answer and takes you there'))),
      h('div', { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } },
        h('button', { class: 'btn sm ghost', title: 'Start a new conversation', onclick: () => { messages = []; persist(); render(); greet(); } }, 'New chat'),
        h('button', { class: 'icon-btn', title: 'Close assistant', onclick: () => toggle(false) }, icon('x')))),
    list,
    h('div', { class: 'as-compose' }, input, sendBtn));

  const fab = h('button', { class: 'as-fab', title: 'Ask the assistant', 'aria-label': 'Open the assistant', onclick: () => toggle() }, icon('chat'));
  document.body.append(panel, fab);
  ui = { panel, fab, list, input, badge };

  get('/assistant/meta').then((m) => { meta = m; badge.hidden = !m.ai_enabled; if (!messages.length) render(); }).catch(() => {});
  render();
}

function toggle(open = ui.panel.hidden) {
  ui.panel.hidden = !open;
  ui.fab.classList.toggle('open', open);
  if (open) {
    if (!messages.length) greet();
    setTimeout(() => ui.input.focus(), 50);
  }
}

/** Opens the assistant from elsewhere in the app, optionally with a question. */
export function openAssistant(question) {
  if (!ui) return;
  toggle(true);
  if (question) send(question);
}

function greet() { send('', { silent: true }); }

async function send(text, { silent = false } = {}) {
  if (sending || !ui) return;
  const message = String(text || '').trim();
  if (!message && !silent) return;
  if (message) messages.push({ role: 'user', text: message });
  ui.input.value = '';
  ui.input.style.height = 'auto';
  sending = true;
  render(true);
  try {
    const history = messages.slice(0, -1).slice(-8).map((m) => ({ role: m.role, text: m.text }));
    const res = await post('/assistant/chat', { message, page: location.hash || '#/', history });
    messages.push({ role: 'assistant', text: res.reply, actions: res.actions || [], navigate: res.navigate || null });
    persist();
    if (res.navigate) goTo(res.navigate);
  } catch (err) {
    showError(err);
    messages.push({ role: 'assistant', text: 'Sorry – I couldn’t reach the system just then. Please try again.' });
  } finally {
    sending = false;
    render();
  }
}

function goTo({ hash, highlight }) {
  if (hash && location.hash !== hash) location.hash = hash;
  if (highlight) spotlight(highlight);
  // On small screens, get out of the way so the person can see the page.
  if (window.innerWidth < 760) toggle(false);
}

/** Points at a button or link by its text once the page has rendered. */
function spotlight(text, tries = 0) {
  const target = [...document.querySelectorAll('.content button, .content a, .modal button, .tb-panel button')]
    .find((el) => el.textContent.trim() === text);
  if (!target) { if (tries < 30) setTimeout(() => spotlight(text, tries + 1), 100); return; }
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.add('as-spotlight');
  setTimeout(() => target.classList.remove('as-spotlight'), 4500);
  // If the chat panel is covering the button, tuck it away so the person can see it.
  setTimeout(() => {
    if (!ui || ui.panel.hidden) return;
    const a = target.getBoundingClientRect();
    const b = ui.panel.getBoundingClientRect();
    if (a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom) toggle(false);
  }, 450);
}

function renderText(text) {
  return String(text).split('\n').map((line) => h('p', line || ' '));
}

function render(thinking = false) {
  if (!ui) return;
  const { list } = ui;
  const items = messages.map((m, idx) => {
    const isLast = idx === messages.length - 1;
    return h('div', { class: `as-msg ${m.role === 'user' ? 'user' : 'bot'}` },
      h('div', { class: 'as-bubble' }, renderText(m.text)),
      m.navigate ? h('button', { class: 'as-opened', onclick: () => goTo(m.navigate) }, icon('send'), `Opened ${m.navigate.label}${m.navigate.highlight ? ` · “${m.navigate.highlight}”` : ''}`) : null,
      m.actions?.length && (isLast || m.role !== 'user') ? h('div', { class: 'as-chips' }, m.actions.map((a) => h('button', {
        class: 'chip',
        onclick: () => {
          if (a.hash) goTo({ hash: a.hash });
          else if (a.say?.endsWith(': ')) { ui.input.value = a.say; ui.input.focus(); }
          else if (a.say) send(a.say);
        },
      }, a.label))) : null);
  });
  if (!messages.length && meta?.starters) {
    items.push(h('div', { class: 'as-chips' }, meta.starters.map((s) => h('button', { class: 'chip', onclick: () => { if (s.endsWith(': ')) { ui.input.value = s; ui.input.focus(); } else send(s); } }, s.trim()))));
  }
  if (thinking) items.push(h('div', { class: 'as-msg bot' }, h('div', { class: 'as-bubble as-typing' }, h('span'), h('span'), h('span'))));
  list.replaceChildren(...items);
  list.scrollTop = list.scrollHeight;
}
