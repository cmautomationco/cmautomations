// Test-build helper: a walkthrough panel and a reset button. Not part of the product UI.
import { confirmDialog, h, icon, toast } from '../public/js/ui.js';
import { GUIDE } from './guide.js';


const DONE_KEY = 'cm_walkthrough_done';
const readDone = () => { try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')); } catch { return new Set(); } };
const writeDone = (set) => { try { localStorage.setItem(DONE_KEY, JSON.stringify([...set])); } catch { /* storage blocked */ } };

export function mountTestBuildBar({ onReset }) {
  const done = readDone();
  let panel = null;

  const renderPanel = () => {
    const total = GUIDE.reduce((n, s) => n + s.steps.length, 0);
    const el = h('aside', { class: 'tb-panel', 'aria-label': 'Walkthrough' },
      h('div', { class: 'tb-head' },
        h('div', h('div', { class: 'eyebrow' }, 'Test build'), h('h2', 'Walkthrough'),
          h('div', { class: 'small muted' }, `${done.size} of ${total} steps tried`)),
        h('button', { class: 'icon-btn', title: 'Close walkthrough', onclick: togglePanel }, icon('x'))),
      h('div', { class: 'tb-body' }, GUIDE.map((section, si) => h('section', { class: 'tb-section' },
        h('h3', h('span', { class: 'num' }, `${si + 1}`), ' ', section.title),
        h('p', { class: 'small muted' }, section.intro),
        h('ol', { class: 'tb-steps' }, section.steps.map(([text, hash], i) => {
          const key = `${si}.${i}`;
          const box = h('input', { type: 'checkbox', id: `tb-${key}`, checked: done.has(key), onchange: () => {
            if (box.checked) done.add(key); else done.delete(key);
            writeDone(done);
            panel.querySelector('.tb-head .small').textContent = `${done.size} of ${total} steps tried`;
          } });
          return h('li', box,
            h('label', { for: `tb-${key}` }, text),
            hash ? h('button', { class: 'btn sm soft', onclick: () => { location.hash = hash; } }, 'Open') : null);
        }))))));
    return el;
  };

  function togglePanel() {
    if (panel) { panel.remove(); panel = null; return; }
    panel = renderPanel();
    document.body.append(panel);
  }

  const bar = h('div', { class: 'tb-bar', role: 'region', 'aria-label': 'Test build controls' },
    h('span', { class: 'tb-dot' }), h('b', 'Test build'),
    h('button', { class: 'btn sm soft', onclick: togglePanel }, icon('book'), 'Walkthrough'),
    h('button', { class: 'btn sm ghost', onclick: async () => {
      if (!(await confirmDialog('This clears everything you have changed and restores the demo business.', 'Reset data'))) return;
      await onReset();
      toast('Demo data restored');
    } }, 'Reset data'));
  document.body.append(bar);
  return { openWalkthrough: () => { if (!panel) togglePanel(); } };
}
