import { del, get, post, put } from '../api.js';
import { state } from '../app.js';
import { ago, confirmDialog, copyText, field, formData, h, icon, modal, mount, select, showError, toast } from '../ui.js';
import { progressChart, progressNote, resultsPanel } from '../progress-chart.js';
import { feelLine, recentFirst } from '../coach-portal.js';

/**
 * Coaching: every client from the first conversation to fully onboarded, and
 * their progress after. The list shows whose turn it is for each client; one
 * client's screen shows their whole journey, the conversation and their chart.
 */

const canEdit = () => state.me.role !== 'member';
// Step updates read as updates; real messages and check-ins say who said them.
const lastLabel = (u) => (u.step_key && !/^(checkin|prompt)_/.test(u.step_key) ? 'Update' : u.author === 'client' ? 'They said' : u.author === 'coach' ? 'You said' : 'Update');
const OWNER_LABEL = { coach: 'Your turn', client: 'Their turn', system: 'Automatic' };
const MET_VIA = ['Instagram DM', 'TikTok DM', 'Facebook', 'Phone call', 'WhatsApp', 'Referral', 'Website', 'In person', 'Other'];

export async function render(el, route) {
  if (route.parts[1]) return clientPage(el, route.parts[1]);
  const data = await get('/coaching');
  const reload = () => render(el, route);
  const r = data.report;
  const onboarding = data.clients.filter((c) => c.status === 'onboarding');
  const active = data.clients.filter((c) => c.status === 'active');
  const other = data.clients.filter((c) => !['onboarding', 'active'].includes(c.status));

  const reportCard = (title, list, empty, line) => h('div', { class: 'card card-pad co-report' },
    h('div', { class: 'eyebrow' }, title),
    h('div', { class: 'co-report-n' }, String(list.length)),
    list.length ? h('ul', list.slice(0, 4).map((x) => h('li', h('a', { href: `#/coaching/${x.id}` }, x.name), h('span', { class: 'muted' }, line(x))))) : h('div', { class: 'small muted' }, empty));

  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('div', { class: 'eyebrow' }, 'Coaching'),
        h('h1', { style: { marginTop: '6px' } }, 'Every client, ', h('span', { class: 'blue' }, 'first chat to fully onboarded')),
        h('p', 'Each client has their own page: their onboarding, their progress chart and every message, in one place. You can always see whose turn it is.')),
      h('div', { class: 'row' },
        canEdit() ? h('button', { class: 'btn', onclick: () => settingsModal(data.settings, reload) }, icon('cog'), 'Programme & agreement') : null,
        canEdit() ? h('button', { class: 'btn primary', onclick: () => newClientModal(data.settings) }, icon('plus'), 'New client') : null)),
    h('div', { class: 'grid co-reports' },
      reportCard('Waiting on you', r.waiting_on_you, 'Nothing waiting on you.', (x) => ` · ${x.step}`),
      reportCard('Needs a word', r.needs_word, 'Everyone’s on track.', (x) => ` · ${x.reason}`),
      reportCard('Started this week', r.started, 'No new starters this week.', () => ''),
      reportCard('Checked in this week', r.checking_in, 'No check-ins yet this week.', (x) => ` · week ${x.week}`)),
    section('Onboarding', onboarding, 'No one onboarding. Add a client from your first conversation.'),
    section('Active clients', active, 'Clients appear here after their first check-in.'),
    other.length ? section('Paused or finished', other, '') : null);
}

function section(title, clients, empty) {
  return h('div', { class: 'card co-list' },
    h('div', { class: 'card-head' }, h('h3', title, h('span', { class: 'muted', style: { fontWeight: 600 } }, ` · ${clients.length}`))),
    h('div', { class: 'card-body' }, clients.length ? clients.map((c) => h('a', { class: 'co-row', href: `#/coaching/${c.id}` },
      h('div', { class: 'grow' },
        h('b', c.name),
        h('div', { class: 'small muted' }, c.status === 'active' ? `Week ${c.week} of ${c.weeks}${c.to_goal_pct !== null ? ` · ${c.to_goal_pct}% of the way to their goal` : ''}` : c.current ? `${c.current.title}` : 'Onboarded'),
        c.last_update ? h('div', { class: 'small muted co-last' }, `${lastLabel(c.last_update)}: ${c.last_update.body.slice(0, 90)}${c.last_update.body.length > 90 ? '…' : ''} · ${ago(c.last_update.created_at)}`) : null),
      c.status === 'onboarding' ? h('div', { class: 'co-row-side' },
        c.current ? h('span', { class: `badge ${c.current.owner === 'coach' ? 'amber' : 'blue'}` }, OWNER_LABEL[c.current.owner]) : null,
        h('div', { class: 'progress', title: `${c.done} of ${c.total} steps`, role: 'progressbar', 'aria-valuenow': String(c.done), 'aria-valuemax': String(c.total) }, h('span', { style: { width: `${Math.round((c.done / c.total) * 100)}%` } })),
        h('div', { class: 'small muted' }, `${c.done} of ${c.total} steps`)) : h('span', { class: 'badge green' }, 'Active'))) : h('div', { class: 'small muted' }, empty)));
}

function newClientModal(settings) {
  const body = h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, 'Start from your first conversation. Their page is made straight away, and the next steps are set up for both of you.'),
    field('Name', h('input', { name: 'name', id: 'co-name', required: true }), { required: true }),
    h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr' } },
      field('Email', h('input', { name: 'email', id: 'co-email', type: 'email' })),
      field('Mobile', h('input', { name: 'phone', id: 'co-phone', type: 'tel' }))),
    h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr' } },
      field('Instagram', h('input', { name: 'instagram', id: 'co-ig', placeholder: '@handle' })),
      field('Where you spoke', select('met_via', MET_VIA, 'Instagram DM'))),
    field('What they told you', h('textarea', { name: 'notes', id: 'co-notes', rows: 3, placeholder: 'What they want, what’s getting in the way…' })),
    field('Their goal', h('input', { name: 'goal', id: 'co-goal', placeholder: 'e.g. Squat 100kg by summer' })),
    h('div', { class: 'grid', style: { gridTemplateColumns: '2fr 1fr' } },
      field('What to track on their chart', h('input', { name: 'metric_label', id: 'co-metric', placeholder: 'e.g. Squat, Body weight, Weekly score' })),
      field('Unit', h('input', { name: 'metric_unit', id: 'co-unit', placeholder: 'kg' }))),
    h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'call_done', style: { width: 'auto' } }), 'We’ve already had the discovery call'),
    h('p', { class: 'small muted' }, `Programme: ${settings.programme} (${settings.weeks} weeks). Change it under Programme & agreement.`));
  modal('New client', body, { actions: [
    { label: 'Cancel' },
    { label: 'Create their page', primary: true, onClick: async () => {
      const v = formData(body);
      if (!v.name.trim()) { toast('Add their name', 'error'); return false; }
      const c = await post('/coaching/clients', v);
      toast(`${c.name}’s page is ready`);
      location.hash = `#/coaching/${c.id}`;
      return true;
    } }] });
}

function settingsModal(s, reload) {
  const body = h('div', { class: 'stack' },
    h('div', { class: 'grid', style: { gridTemplateColumns: '2fr 1fr' } },
      field('Programme name', h('input', { name: 'programme', id: 'co-s-prog', value: s.programme })),
      field('Weeks', h('input', { name: 'weeks', id: 'co-s-weeks', type: 'number', min: 1, max: 104, value: s.weeks }))),
    field('Price (as clients see it)', h('input', { name: 'price_text', id: 'co-s-price', value: s.price_text, placeholder: 'e.g. £150 a month' })),
    field('What’s included (one per line)', h('textarea', { name: 'includes', id: 'co-s-incl', rows: 4 }, s.includes.join('\n'))),
    field('Coaching agreement', h('textarea', { name: 'agreement', id: 'co-s-agree', rows: 5 }, s.agreement)),
    field('Kickoff call note', h('input', { name: 'kickoff_note', id: 'co-s-kick', value: s.kickoff_note })),
    field('Check-in day', select('checkin_day', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], s.checkin_day)));
  modal('Programme & agreement', body, { wide: true, actions: [
    { label: 'Cancel' },
    { label: 'Save', primary: true, onClick: async () => {
      const v = formData(body);
      await put('/coaching/settings', { ...v, weeks: Number(v.weeks), includes: v.includes.split('\n').map((x) => x.trim()).filter(Boolean) });
      toast('Saved');
      reload();
    } }] });
}

async function clientPage(el, id) {
  const c = await get(`/coaching/clients/${id}`);
  const reload = () => clientPage(el, id);
  const j = c.journey;
  const doStep = async (key, payload = {}, msg = 'Done') => { try { await post(`/coaching/clients/${id}/steps/${key}/done`, payload); toast(msg); reload(); } catch (err) { showError(err); } };

  const stepActions = (s) => {
    if (s.status !== 'open' || s.owner !== 'coach' || !canEdit()) return null;
    if (s.key === 'programme') {
      const link = h('input', { id: 'co-plink', placeholder: 'Link to their programme (optional)', 'aria-label': 'Link to their programme' });
      return h('div', { class: 'co-step-act' }, link, h('button', { class: 'btn sm primary', onclick: () => doStep('programme', link.value ? { link: link.value } : {}, 'Programme sent – week 1 has started') }, icon('send'), 'Send programme'));
    }
    if (s.key === 'kickoff') {
      const when = h('input', { id: 'co-kwhen', placeholder: 'e.g. Tue 12 Dec, 6pm', 'aria-label': 'Kickoff time to confirm' });
      return h('div', { class: 'co-step-act' },
        s.data?.times ? h('div', { class: 'small' }, h('b', 'They suggested: '), s.data.times) : null,
        s.data?.confirmed ? h('div', { class: 'small' }, h('b', 'Booked: '), s.data.confirmed) : h('div', { class: 'row' }, when, h('button', { class: 'btn sm', onclick: async () => { if (!when.value.trim()) return; try { await post(`/coaching/clients/${id}/kickoff`, { when: when.value }); toast('Confirmed – they’ve been told'); reload(); } catch (err) { showError(err); } } }, icon('calendar'), 'Confirm time')),
        h('button', { class: 'btn sm primary', onclick: () => doStep('kickoff', {}, 'Kickoff done') }, icon('tick'), 'Kickoff call done'));
    }
    const labels = { call: 'Call done', payment: 'Mark as paid' };
    return h('div', { class: 'co-step-act' }, h('button', { class: 'btn sm primary', onclick: () => doStep(s.key, {}, s.key === 'payment' ? 'Paid – welcome sent' : 'Done') }, icon('tick'), labels[s.key] || 'Mark done'));
  };

  const journey = h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', 'Onboarding'), h('span', { class: 'small muted' }, `${j.done} of ${j.total} done`)),
    h('div', { class: 'card-body' }, j.phases.map((p) => h('div', { class: 'co-phase' },
      h('div', { class: 'eyebrow' }, p.title),
      h('ol', { class: 'cp-steps' }, p.steps.map((s) => h('li', { class: `cp-step ${s.status}${s.status === 'open' && s.owner === 'coach' ? ' yours' : ''}` },
        h('span', { class: 'cp-dot', 'aria-hidden': 'true' }, s.status === 'done' ? icon('tick') : ''),
        h('div', { class: 'grow' },
          h('div', { class: 'cp-step-title' }, h('b', s.title),
            s.status === 'done' ? h('span', { class: 'small muted' }, `Done ${ago(s.done_at)}`)
              : s.status === 'open' ? h('span', { class: `badge ${s.owner === 'coach' ? 'amber' : 'blue'}` }, OWNER_LABEL[s.owner]) : null),
          s.status === 'open' ? h('div', { class: 'small muted' }, s.text, s.owner === 'client' && s.nudges ? ` Reminded ${s.nudges} time${s.nudges === 1 ? '' : 's'}.` : '') : null,
          s.key === 'intake' && s.status === 'done' && s.data?.goals ? intakeSummary(s.data) : null,
          stepActions(s)))))))));

  const thread = h('div', { class: 'cp-thread' }, c.updates.map((u) => h('div', { class: `cp-msg ${u.author === 'coach' ? 'client' : u.author === 'client' ? 'coach' : 'system'}` },
    h('div', { class: 'small muted' }, `${u.author === 'client' ? c.name.split(' ')[0] : u.author === 'coach' ? 'You' : 'Update'} · ${ago(u.created_at)}`), h('div', u.body))));
  const box = h('textarea', { id: 'co-msg', rows: 2, placeholder: `Message ${c.name.split(' ')[0]}…`, 'aria-label': 'Message the client' });
  const conversation = h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', 'Conversation'), h('span', { class: 'small muted' }, 'They see this on their page too')),
    h('div', { class: 'card-body stack' }, thread, box,
      h('button', { class: 'btn primary sm', onclick: async () => { if (!box.value.trim()) return; try { await post(`/coaching/clients/${id}/messages`, { body: box.value }); toast('Sent'); reload(); } catch (err) { showError(err); } } }, icon('send'), 'Send')));
  setTimeout(() => { thread.scrollTop = thread.scrollHeight; }, 0);

  const p = c.progress;
  const progressCard = h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', 'Progress'), p.current_week ? h('span', { class: 'badge blue' }, `Week ${p.current_week} of ${p.weeks}`) : null),
    h('div', { class: 'card-body stack' },
      progressChart(p, { audience: 'coach' }),
      h('p', { class: 'small muted' }, progressNote(p, { audience: 'coach' })),
      resultsPanel(p, { audience: 'coach' }),
      p.checkins.length ? recentFirst(p.checkins, (ck) => {
        const reply = h('textarea', { id: `co-reply-${ck.week}`, rows: 2, placeholder: 'Your feedback…', 'aria-label': `Feedback for week ${ck.week}` });
        return h('div', { class: 'cp-checkin' },
          h('div', { class: 'cp-step-title' }, h('b', `Week ${ck.week}`), ck.value !== null ? h('span', `${ck.value}${p.metric_unit ? ` ${p.metric_unit}` : ''}`) : null, feelLine(ck)),
          ck.wins ? h('div', { class: 'small' }, h('b', 'Win: '), ck.wins) : null,
          ck.struggles ? h('div', { class: 'small' }, h('b', 'Tough: '), ck.struggles) : null,
          ck.coach_reply ? h('div', { class: 'cp-reply' }, h('b', 'You: '), ck.coach_reply)
            : h('div', { class: 'stack', style: { gap: '6px' } }, reply, h('button', { class: 'btn sm primary', onclick: async () => { if (!reply.value.trim()) return; try { await post(`/coaching/clients/${id}/checkins/${ck.week}/reply`, { reply: reply.value }); toast('Feedback sent'); reload(); } catch (err) { showError(err); } } }, icon('send'), 'Send feedback')));
      }) : h('div', { class: 'small muted' }, 'Check-ins appear here once their programme starts.')));

  const details = h('div', { class: 'card card-pad stack small' },
    c.goal ? h('div', h('b', 'Goal: '), c.goal) : null,
    c.met_via ? h('div', h('b', 'First spoke: '), c.met_via) : null,
    h('div', h('b', 'Tracking: '), c.metric_label ? `${c.metric_label}${c.metric_unit ? ` (${c.metric_unit})` : ''}` : 'Not set yet'),
    c.baseline !== null ? h('div', h('b', 'Start → goal: '), `${c.baseline} → ${c.target ?? '?'}${c.metric_unit ? ` ${c.metric_unit}` : ''}`) : null,
    canEdit() ? h('button', { class: 'btn sm', onclick: () => editModal(c, reload) }, icon('edit'), 'Edit details') : null);

  mount(el,
    h('div', { class: 'page-head' },
      h('div', h('a', { class: 'small', href: '#/coaching' }, '← All clients'),
        h('h1', { style: { marginTop: '6px' } }, c.name),
        h('p', `${c.programme} · ${c.status === 'onboarding' ? (j.current ? `${j.current.title}: ${OWNER_LABEL[j.current.owner].toLowerCase()}` : 'Onboarding') : c.status === 'active' ? 'Fully onboarded' : c.status}`)),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => copyText(c.link, 'Their page link copied') }, icon('copy'), 'Copy their page link'),
        h('a', { class: 'btn', href: c.link, target: '_blank', rel: 'noopener' }, icon('link'), 'See their page'),
        canEdit() ? h('button', { class: 'btn ghost', 'aria-label': 'Remove client', onclick: async () => { if (await confirmDialog(`Remove ${c.name} and their whole history?`, 'Remove')) { await del(`/coaching/clients/${id}`); location.hash = '#/coaching'; } } }, icon('x')) : null)),
    h('div', { class: 'grid co-layout' },
      h('div', { class: 'stack' }, journey, details),
      h('div', { class: 'stack' }, progressCard, conversation)));
}

function intakeSummary(d) {
  return h('details', { class: 'co-intake' }, h('summary', 'Their intake form'),
    h('div', { class: 'small stack', style: { gap: '4px', marginTop: '6px' } },
      [['Goals', d.goals], ['History', d.history], ['Injuries', d.injuries], ['Their week', d.schedule], ['Start / goal', d.starting_value !== undefined && d.starting_value !== null ? `${d.starting_value} → ${d.goal_value ?? '?'}` : null]]
        .filter(([, v]) => v).map(([k, v]) => h('div', h('b', `${k}: `), String(v)))));
}

function editModal(c, reload) {
  const body = h('div', { class: 'stack' },
    field('Name', h('input', { name: 'name', id: 'co-e-name', value: c.name })),
    field('Goal', h('input', { name: 'goal', id: 'co-e-goal', value: c.goal || '' })),
    h('div', { class: 'grid', style: { gridTemplateColumns: '2fr 1fr' } },
      field('What to track', h('input', { name: 'metric_label', id: 'co-e-metric', value: c.metric_label || '' })),
      field('Unit', h('input', { name: 'metric_unit', id: 'co-e-unit', value: c.metric_unit || '' }))),
    h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr 1fr' } },
      field('Starting point', h('input', { name: 'baseline', id: 'co-e-base', inputmode: 'decimal', value: c.baseline ?? '' })),
      field('Goal number', h('input', { name: 'target', id: 'co-e-target', inputmode: 'decimal', value: c.target ?? '' })),
      field('Weeks', h('input', { name: 'weeks', id: 'co-e-weeks', type: 'number', min: 1, max: 104, value: c.weeks }))),
    field('Status', select('status', [['onboarding', 'Onboarding'], ['active', 'Active'], ['paused', 'Paused'], ['finished', 'Finished']], c.status)));
  modal(`Edit ${c.name}`, body, { actions: [
    { label: 'Cancel' },
    { label: 'Save', primary: true, onClick: async () => {
      const v = formData(body);
      await put(`/coaching/clients/${c.id}`, { ...v, weeks: Number(v.weeks), baseline: v.baseline === '' ? null : Number(v.baseline), target: v.target === '' ? null : Number(v.target) });
      toast('Saved');
      reload();
    } }] });
}
