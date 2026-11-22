import { get, post } from './api.js';
import { field, h, icon, mount, showError, toast } from './ui.js';
import { progressChart, progressNote } from './progress-chart.js';

/**
 * The client's own coaching page, from their link. Three parts, one tap apart:
 *  - Onboarding: every step from the first conversation, what's done (with dates),
 *    what's theirs to do now, and what happens next.
 *  - Progress: their chart and their weekly check-ins, with the coach's feedback.
 *  - Messages: everything said between them and their coach, in one place.
 */

const when = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const whenTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const read = (el) => Object.fromEntries([...el.querySelectorAll('[name]')].map((i) => [i.name, i.value]));

export async function coachPortal(shell, token, { header, footer }, tab = null) {
  const data = await get(`/public/coach/${token}`);
  const b = data.business;
  const j = data.journey;
  const current = j.current;
  const yourTurn = current && current.owner === 'client';
  const active = tab || (yourTurn || !j.onboarded ? 'onboarding' : 'progress');
  const reload = (t) => coachPortal(shell, token, { header, footer }, t);
  const act = async (path, body, msg) => {
    try { await post(`/public/coach/${token}/${path}`, body); if (msg) toast(msg); await reload(); window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (err) { showError(err); }
  };

  const status = j.onboarded
    ? h('div', { class: 'cp-status good' }, icon('tick'), h('div', h('b', `You’re all set up${data.progress.current_week ? ` · week ${data.progress.current_week} of ${data.weeks}` : ''}`), h('div', { class: 'small' }, `Check in every ${data.checkin_day} on the Progress tab.`)))
    : yourTurn
      ? h('div', { class: 'cp-status turn' }, icon('flag'), h('div', h('b', `Your next step: ${current.title}`), h('div', { class: 'small' }, current.text)))
      : h('div', { class: 'cp-status wait' }, icon('clock'), h('div', h('b', current ? `Next: ${current.title}` : 'Nearly there'), h('div', { class: 'small' }, 'Nothing for you to do right now. Your coach is on it, and you’ll get a message when it’s your turn.')));

  const tabs = [['onboarding', 'Onboarding', `${j.done}/${j.total}`], ['progress', 'Progress', null], ['messages', 'Messages', String(data.updates.length)]];
  const nav = h('nav', { class: 'cp-tabs', role: 'tablist' }, tabs.map(([k, label, count]) => h('button', {
    role: 'tab', 'aria-selected': String(k === active), class: k === active ? 'on' : '', onclick: () => reload(k),
  }, label, count ? h('span', { class: 'cp-count' }, count) : null)));

  const body = active === 'onboarding' ? onboarding(data, act) : active === 'progress' ? progress(data, act) : messages(data, act);
  mount(shell, header(b), h('main', { class: 'pub-main wide cp' },
    h('div', { class: 'cp-hero' },
      h('div', { class: 'eyebrow' }, data.programme),
      h('h1', `Hi ${data.first_name}`),
      h('div', { class: 'cp-meter', role: 'progressbar', 'aria-valuenow': String(j.done), 'aria-valuemin': '0', 'aria-valuemax': String(j.total), 'aria-label': 'Onboarding steps done' },
        h('span', { style: { width: `${Math.round((j.done / j.total) * 100)}%` } })),
      h('div', { class: 'small muted' }, j.onboarded ? 'Onboarding complete' : `${j.done} of ${j.total} onboarding steps done`),
      status),
    nav, body), footer(b));
}

function onboarding(data, act) {
  const j = data.journey;
  return h('section', { class: 'stack' }, j.phases.map((phase) => {
    const done = phase.steps.every((s) => s.status === 'done');
    return h('div', { class: 'pub-card cp-phase' },
      h('div', { class: 'cp-phase-head' }, h('h2', phase.title), done ? h('span', { class: 'badge green' }, 'Done') : null),
      h('p', { class: 'small muted' }, phase.blurb),
      h('ol', { class: 'cp-steps' }, phase.steps.map((s) => h('li', { class: `cp-step ${s.status}${s.status === 'open' && s.owner === 'client' ? ' yours' : ''}` },
        h('span', { class: 'cp-dot', 'aria-hidden': 'true' }, s.status === 'done' ? icon('tick') : ''),
        h('div', { class: 'grow' },
          h('div', { class: 'cp-step-title' }, h('b', s.title),
            s.status === 'done' ? h('span', { class: 'small muted' }, `Done ${when(s.done_at)}`)
              : s.status === 'open' ? h('span', { class: `badge ${s.owner === 'client' ? 'blue' : ''}` }, s.owner === 'client' ? 'Your turn' : 'Your coach is on it')
                : h('span', { class: 'small muted' }, 'Coming up')),
          h('div', { class: 'small muted' }, s.text),
          s.status === 'open' && s.owner === 'client' ? actionFor(s, data, act) : null,
          s.key === 'kickoff' && s.data?.times && s.status !== 'done' ? h('div', { class: 'small', style: { marginTop: '6px' } }, s.data.confirmed ? `Booked: ${s.data.confirmed}` : `You suggested: ${s.data.times}. Your coach will confirm one.`) : null,
          s.key === 'programme' && s.data?.link ? h('a', { class: 'btn sm soft', href: s.data.link, target: '_blank', rel: 'noopener', style: { marginTop: '8px' } }, icon('link'), 'Open your programme') : null)))));
  }));
}

function actionFor(step, data, act) {
  if (step.client_action === 'accept_offer') {
    const o = data.offer;
    return h('div', { class: 'cp-action stack' },
      h('div', h('b', o.programme), h('span', { class: 'muted' }, ` · ${o.weeks} weeks`), o.price_text ? h('div', { class: 'small' }, o.price_text) : null),
      h('ul', o.includes.map((x) => h('li', x))),
      h('button', { class: 'btn primary', onclick: () => act('accept', {}, 'Brilliant, welcome aboard!') }, icon('tick'), 'Yes, I’m in'));
  }
  if (step.client_action === 'intake') {
    const form = h('form', { class: 'cp-action stack', onsubmit: (e) => { e.preventDefault(); const v = read(form); if (!v.goals.trim()) return toast('Please tell your coach your goals', 'error'); act('intake', v, 'Thank you! Your coach has it.'); } },
      field('What do you want to achieve, and by when?', h('textarea', { name: 'goals', id: 'cp-goals', rows: 3, required: true })),
      field('Your training or coaching history', h('textarea', { name: 'history', id: 'cp-history', rows: 2 })),
      field('Injuries or anything your coach should know', h('textarea', { name: 'injuries', id: 'cp-injuries', rows: 2 })),
      field('What does a normal week look like for you?', h('textarea', { name: 'schedule', id: 'cp-schedule', rows: 2 })),
      h('div', { class: 'grid cp-two' },
        field('Where you’re starting from (a number)', h('input', { name: 'starting_value', id: 'cp-start', inputmode: 'decimal', placeholder: 'e.g. 60' }), { help: 'Your coach will tell you what to measure. It’s the first point on your chart.' }),
        field('Your goal (a number)', h('input', { name: 'goal_value', id: 'cp-goal', inputmode: 'decimal', placeholder: 'e.g. 100' }))),
      h('button', { class: 'btn primary', type: 'submit' }, icon('send'), 'Send to my coach'));
    return form;
  }
  if (step.client_action === 'agreement') {
    const name = h('input', { id: 'cp-sign', placeholder: 'Type your full name', 'aria-label': 'Type your full name to agree' });
    return h('div', { class: 'cp-action stack' },
      h('div', { class: 'cp-agreement' }, data.agreement),
      field('Type your full name to agree', name),
      h('button', { class: 'btn primary', onclick: () => { if (!name.value.trim()) return toast('Please type your name', 'error'); act('agreement', { signed_name: name.value }, 'Agreed. Thank you!'); } }, icon('tick'), 'I agree'));
  }
  if (step.client_action === 'kickoff') {
    if (step.data?.times) return null;
    const times = h('textarea', { id: 'cp-times', rows: 2, placeholder: 'e.g. Tuesday after 6pm, or Wednesday 7am' });
    return h('div', { class: 'cp-action stack' },
      h('div', { class: 'small' }, data.kickoff_note),
      field('Times that suit you', times),
      h('button', { class: 'btn primary', onclick: () => { if (!times.value.trim()) return toast('Please add a time or two', 'error'); act('kickoff', { times: times.value }, 'Sent. Your coach will confirm a time.'); } }, icon('calendar'), 'Send my times'));
  }
  if (step.client_action === 'checkin') return checkinForm(data, act, 'Do my first check-in');
  return null;
}

function checkinForm(data, act, label = 'Send my check-in') {
  const p = data.progress;
  const form = h('form', { class: 'cp-action stack', onsubmit: (e) => { e.preventDefault(); act('checkin', read(form), 'Check-in sent. Your coach will reply with feedback.'); } },
    h('div', { class: 'grid cp-two' },
      field(`${p.metric_label || 'Your number this week'}${p.metric_unit ? ` (${p.metric_unit})` : ''}`, h('input', { name: 'value', id: 'cp-value', inputmode: 'decimal', placeholder: p.actual.length ? String(p.actual[p.actual.length - 1].value) : '' })),
      field('Energy this week (1–5)', h('select', { name: 'energy', id: 'cp-energy' }, ['', '1', '2', '3', '4', '5'].map((x) => h('option', { value: x }, x || 'Choose'))))),
    field('A win from this week', h('textarea', { name: 'wins', id: 'cp-wins', rows: 2 })),
    field('Anything that was tough', h('textarea', { name: 'struggles', id: 'cp-struggles', rows: 2 })),
    h('button', { class: 'btn primary', type: 'submit' }, icon('send'), label));
  return form;
}

function progress(data, act) {
  const p = data.progress;
  const started = p.actual.length > 1;
  const last = p.actual[p.actual.length - 1];
  const sign = (n) => (n > 0 ? '+' : '');
  return h('section', { class: 'stack' },
    h('div', { class: 'pub-card stack' },
      h('div', { class: 'cp-phase-head' }, h('h2', 'Your progress'), p.current_week ? h('span', { class: 'badge blue' }, `Week ${p.current_week} of ${p.weeks}`) : null),
      started ? h('div', { class: 'cp-stats' },
        h('div', h('div', { class: 'small muted' }, 'Started at'), h('b', `${p.actual[0].value}${p.metric_unit ? ` ${p.metric_unit}` : ''}`)),
        h('div', h('div', { class: 'small muted' }, 'Now'), h('b', `${last.value}${p.metric_unit ? ` ${p.metric_unit}` : ''}`)),
        h('div', h('div', { class: 'small muted' }, 'Change'), h('b', `${sign(p.change)}${p.change}${p.metric_unit ? ` ${p.metric_unit}` : ''}`)),
        p.to_goal_pct !== null ? h('div', h('div', { class: 'small muted' }, 'Of the way to your goal'), h('b', `${p.to_goal_pct}%`)) : null) : null,
      progressChart(p, { audience: 'client' }),
      h('p', { class: 'cp-note' }, progressNote(p, { audience: 'client' }))),
    data.status === 'active' ? h('div', { class: 'pub-card stack' }, h('h2', `Check in for week ${p.next_checkin_week || 1}`), checkinForm(data, act)) : null,
    p.checkins.length ? h('div', { class: 'pub-card stack' }, h('h2', 'Your check-ins'),
      recentFirst(p.checkins, (c) => h('div', { class: 'cp-checkin' },
        h('div', { class: 'cp-step-title' }, h('b', `Week ${c.week}`), c.value !== null ? h('span', `${c.value}${p.metric_unit ? ` ${p.metric_unit}` : ''}`) : null, c.energy ? h('span', { class: 'small muted' }, `Energy ${c.energy}/5`) : null),
        c.wins ? h('div', { class: 'small' }, h('b', 'Win: '), c.wins) : null,
        c.struggles ? h('div', { class: 'small' }, h('b', 'Tough: '), c.struggles) : null,
        c.coach_reply ? h('div', { class: 'cp-reply' }, h('b', 'Your coach: '), c.coach_reply) : h('div', { class: 'small muted' }, 'Feedback on its way.')))) : null);
}

/** The latest three check-ins, with earlier weeks one tap away. */
export function recentFirst(checkins, row, show = 3) {
  const list = [...checkins].reverse();
  const older = list.slice(show);
  return [list.slice(0, show).map(row), older.length ? h('details', { class: 'cp-older' }, h('summary', `Earlier weeks (${older.length})`), older.map(row)) : null];
}

function messages(data, act) {
  const box = h('textarea', { id: 'cp-message', rows: 3, placeholder: 'Ask your coach anything…', 'aria-label': 'Message your coach' });
  return h('section', { class: 'pub-card stack' },
    h('h2', 'Messages'),
    h('p', { class: 'small muted' }, 'Everything between you and your coach, in order. Messages also come to you by text or email.'),
    h('div', { class: 'cp-thread' }, data.updates.map((u) => h('div', { class: `cp-msg ${u.author}` },
      h('div', { class: 'small muted' }, `${u.author === 'client' ? 'You' : u.author === 'coach' ? 'Your coach' : 'Update'} · ${whenTime(u.created_at)}`),
      h('div', u.body)))),
    box,
    h('button', { class: 'btn primary', onclick: () => { if (!box.value.trim()) return; act('messages', { body: box.value }, 'Sent to your coach'); } }, icon('send'), 'Send'));
}
