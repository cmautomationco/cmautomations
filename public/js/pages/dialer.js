import { get, patch, post, put } from '../api.js';
import { CHANNEL_LABELS, ago, avatar, channelIcon, copyText, date, dateTime, field, formData, h, icon, modal, mount, select, showError, titleCase, toast } from '../ui.js';
import { bookingModal } from './bookings.js';

/**
 * CRM → Dialer, Calendar, Scripts and the full lead profile.
 * Everything scrolls with the page (no boxed-in scroll areas), so it works
 * the same with a mouse wheel, a trackpad or a phone.
 */

const OUTCOME_BUTTONS = [
  ['booked', 'Booked', 'calendar', 'primary'], ['interested', 'Interested', 'heart', 'soft'], ['callback', 'Call back later', 'clock', 'soft'],
  ['not_interested', 'Not interested', 'x', ''], ['no_answer', 'No answer', 'phone', ''], ['voicemail', 'Voicemail', 'inbox', ''],
  ['wrong_number', 'Wrong number', 'alert', ''], ['do_not_call', 'Do not call', 'x', 'danger'],
];
const STATUS_TEXT = { best: 'Best time to call', open: 'OK to call', closed: 'Outside their calling hours' };
const DIAL_STATUS = { new: 'New', no_answer: 'No answer', interested: 'Interested', callback: 'Call back', booked: 'Booked', not_interested: 'Not interested', wrong_number: 'Wrong number', do_not_call: 'Do not call' };

export const clock = (iso, tz) => { try { return new Date(iso).toLocaleTimeString('en-GB', { timeZone: tz || undefined, hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '').toLowerCase(); } catch { return ''; } };
export const dayClock = (iso, tz) => { try { return `${new Date(iso).toLocaleDateString('en-GB', { timeZone: tz || undefined, weekday: 'short', day: 'numeric', month: 'short' })}, ${clock(iso, tz)}`; } catch { return ''; } };
const dot = (status) => h('span', { class: `dl-dot ${status}`, title: STATUS_TEXT[status] || '' });
const safeObj = (v) => (v && typeof v === 'object' ? v : (() => { try { return JSON.parse(v || '{}') || {}; } catch { return {}; } })());
const fullName = (c) => [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Lead';
const plural = (n, one, many) => `${n || 0} ${(n || 0) === 1 ? one : many}`;
const mins = (s) => (s ? `${Math.max(1, Math.round(s / 60))} min` : '');
const section = (title, ...children) => h('section', { class: 'card card-pad dl-section' }, h('h3', title), ...children);
const kv = (label, value) => (value || value === 0 ? h('div', { class: 'dl-kv' }, h('div', { class: 'muted small' }, label), h('div', value)) : null);

// ───────────────────────── Dialer ─────────────────────────

let speech = null;

export async function renderDialer(el, query = {}) {
  const [queue, script] = await Promise.all([get('/dialer/queue'), get('/dialer/script').catch(() => null)]);
  const state = { list: 'now', lead: query.lead || queue.now[0]?.contact.id || queue.later[0]?.contact.id || null };
  const listWrap = h('div', { class: 'stack', style: { gap: '0' } });
  const work = h('div', { class: 'dl-work' });
  const reload = () => renderDialer(el, { lead: state.lead });

  const mode = queue.call_mode;
  const modeLine = mode.mode === 'bridge'
    ? h('div', { class: 'dl-mode' }, icon('phone'), h('div', h('b', 'Calls go through your business number. '), 'Press Call and your phone rings first – answer it and you’re connected to the lead. Live transcription runs on every call.'))
    : mode.mode === 'demo'
      ? h('div', { class: 'dl-mode' }, icon('phone'), h('div', h('b', 'Practice mode (test build). '), 'No real calls are made here. Open a lead, read the opener, take notes or turn on live transcription, then log what happened – everything that follows happens for real in the system.'))
      : h('div', { class: 'dl-mode' }, icon('phone'), h('div', h('b', 'Calls open your phone’s dialler. '), `To ring and connect leads from here: ${mode.missing.join(' · ')}.`));

  const zones = h('div', { class: 'dl-zones' },
    h('div', { class: 'dl-zone me' }, h('div', { class: 'small muted' }, 'You'), h('b', queue.me.time), h('div', { class: 'small' }, queue.me.zone)),
    queue.zones.slice(0, 5).map((z) => h('div', { class: 'dl-zone' }, h('div', { class: 'small muted row', style: { gap: '6px' } }, dot(z.status), z.zone), h('b', z.local), h('div', { class: 'small' }, `${z.now} to call now${z.later ? ` · ${z.later} later` : ''}`))));

  const drawList = () => {
    const items = state.list === 'now' ? queue.now : state.list === 'later' ? queue.later : null;
    if (state.list === 'callbacks') {
      return mount(listWrap, queue.upcoming_callbacks.length ? queue.upcoming_callbacks.map((cb) => h('button', { class: `dl-item ${state.lead === cb.contact_id ? 'active' : ''}`, onclick: () => { state.lead = cb.contact_id; drawList(); openLead(); } },
        h('div', { class: 'grow' }, h('b', `${cb.first_name} ${cb.last_name || ''}`), h('div', { class: 'small muted' }, `${cb.mode === 'call' ? 'Call back' : 'Text back'} at ${cb.mine} your time${cb.theirs !== cb.mine ? ` · ${cb.theirs} theirs` : ''}`), cb.topic ? h('div', { class: 'small' }, cb.topic) : null))) : h('div', { class: 'empty small' }, 'No more call backs today.'));
    }
    mount(listWrap, items.length ? items.map((i) => h('button', { class: `dl-item ${state.lead === i.contact.id ? 'active' : ''}`, onclick: () => { state.lead = i.contact.id; drawList(); openLead(); } },
      h('div', { class: 'dl-score', title: 'Lead score' }, i.contact.lead_score ?? '–'),
      h('div', { class: 'grow' },
        h('div', { class: 'row', style: { gap: '6px', justifyContent: 'space-between', flexWrap: 'nowrap' } }, h('b', { class: 'dl-name' }, i.contact.name), h('span', { class: 'small row', style: { gap: '5px', flexWrap: 'nowrap', whiteSpace: 'nowrap' } }, dot(i.window.status), i.contact.flag || '', i.their_time)),
        h('div', { class: 'small muted dl-why' }, i.why),
        state.list === 'later' ? h('div', { class: 'small blue' }, `Opens ${i.opens_mine} your time · ${i.opens_theirs} theirs`) : null))) : h('div', { class: 'empty small' }, state.list === 'now' ? 'Nobody to call right now – check “Later”.' : 'Nothing waiting.'),
    (state.list === 'now' ? queue.total_now : queue.total_later) > items.length ? h('div', { class: 'small muted', style: { padding: '10px' } }, `Showing the top ${items.length}.`) : null);
  };
  const listTabs = h('div', { class: 'dl-listtabs' }, [['now', `Call now (${queue.total_now})`], ['later', `Later (${queue.total_later})`], ['callbacks', `Call backs (${queue.upcoming_callbacks.length})`]].map(([k, l]) => {
    const b = h('button', { class: `chip ${state.list === k ? 'active' : ''}`, onclick: () => { state.list = k; listTabs.querySelectorAll('.chip').forEach((c) => c.classList.remove('active')); b.classList.add('active'); drawList(); } }, l);
    return b;
  }));

  const openLead = async () => {
    if (!state.lead) return mount(work, h('div', { class: 'card card-pad empty' }, 'Add leads with a phone number and they appear here, ordered by who’s best to call right now in their own time zone.'));
    mount(work, h('div', { class: 'card card-pad muted' }, 'Loading lead…'));
    try {
      const lead = await get(`/dialer/leads/${state.lead}`);
      leadWorkspace(work, lead, script, { onNext: () => {
        const list = queue.now.filter((i) => i.contact.id !== state.lead);
        state.lead = list[0]?.contact.id || null;
        renderDialer(el, { lead: state.lead });
      }, reload });
    } catch (err) { mount(work, h('div', { class: 'card card-pad' }, err.message)); }
  };

  mount(el,
    h('div', { class: 'grid g4 dl-stats' },
      kpi('Calls today', queue.today.calls, `${queue.today.minutes} min on the phone`, 'accent'),
      kpi('Conversations', queue.today.connected, queue.today.calls ? `${Math.round((queue.today.connected / queue.today.calls) * 100)}% picked up` : 'people you spoke to'),
      kpi('Booked today', queue.today.booked, 'calls and demos'),
      kpi('To call now', queue.total_now, `${queue.total_later} more when their day starts`)),
    modeLine,
    h('div', { class: 'row', style: { justifyContent: 'space-between', margin: '4px 0 12px' } },
      h('p', { class: 'small muted', style: { maxWidth: '720px', margin: 0 } }, 'The list is ordered by what time it is for each lead: people in their best pick-up window first (mid-morning and late afternoon, their time), new leads straight away, and anyone outside their calling hours waits in “Later” with the time it opens – in your time and theirs.'),
      h('button', { class: 'btn sm', onclick: () => dialerSettings(reload) }, icon('cog'), 'Dialer settings')),
    zones,
    h('div', { class: 'dl-layout' },
      h('div', { class: 'card dl-list' }, listTabs, listWrap),
      work));
  drawList();
  openLead();
}

const kpi = (label, value, sub, cls = '') => h('div', { class: `card kpi ${cls}` }, h('div', { class: 'label' }, label), h('div', { class: `value ${cls ? '' : 'blue'}` }, value), h('div', { class: 'sub' }, sub));

function leadWorkspace(el, lead, script, { onNext, reload }) {
  const c = lead.contact;
  const e = c.enrichment || {};
  const q = c.qualification || {};
  const w = lead.window;
  const state = { opener: lead.openers.find((o) => o.best) || lead.openers[0] || null, call: null, started: 0, timer: null };
  const live = h('div');
  const openerList = h('div', { class: 'stack', style: { gap: '8px' } });
  const drawOpeners = () => mount(openerList, lead.openers.map((o) => h('button', { class: `dl-opener ${state.opener?.key === o.key ? 'active' : ''}`, onclick: () => { state.opener = o; drawOpeners(); } },
    h('div', { class: 'row', style: { justifyContent: 'space-between', gap: '6px' } }, h('b', { class: 'small blue' }, o.label), o.best ? h('span', { class: 'small blue' }, o.stats?.connected >= 2 ? `★ ${o.stats.booked} of ${o.stats.connected} booked` : '★ Suggested') : o.stats?.connected ? h('span', { class: 'small muted' }, `${o.stats.booked} of ${o.stats.connected} booked`) : null),
    h('div', { class: 'dl-opener-text' }, `“${o.text}”`), h('div', { class: 'small muted' }, o.why))));
  drawOpeners();

  const startCall = async (btn) => {
    btn.disabled = true;
    try {
      const res = await post('/dialer/calls', { contact_id: c.id, opener_key: state.opener?.key, opener_text: state.opener?.text });
      state.call = res.call;
      state.started = Date.now();
      if (res.error) toast(res.error, 'error'); else toast(res.message);
      if (res.call.mode === 'phone') location.href = res.tel;
      liveCall();
    } catch (err) { showError(err); btn.disabled = false; }
  };

  const liveCall = () => {
    const timer = h('b', { class: 'blue' }, '0:00');
    clearInterval(state.timer);
    state.timer = setInterval(() => { if (!document.body.contains(timer)) return clearInterval(state.timer); const s = Math.round((Date.now() - state.started) / 1000); timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
    const notes = h('textarea', { placeholder: 'Notes: what they said, numbers, names, next steps…', style: { minHeight: '90px' } });
    const transcript = h('textarea', { placeholder: 'Transcript appears here as you talk (You: … / Them: …). You can also paste one in.', style: { minHeight: '140px' } });
    const coach = h('div', { class: 'stack', style: { gap: '8px' } }, h('div', { class: 'small muted' }, 'As the conversation is transcribed, problems and objections are picked out here with the answer that has worked best on your calls.'));
    let speaker = 'Them';
    const speakerBtns = h('div', { class: 'row', style: { gap: '6px' } }, ['You', 'Them'].map((s) => h('button', { class: `chip ${speaker === s ? 'active' : ''}`, type: 'button', onclick: (ev) => { speaker = s; speakerBtns.querySelectorAll('.chip').forEach((x) => x.classList.remove('active')); ev.target.classList.add('active'); } }, s)));
    const micBtn = h('button', { class: 'btn sm soft', type: 'button' }, icon('play'), 'Start live transcription');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    micBtn.onclick = () => {
      if (!SR) return toast('This browser can’t transcribe – use Chrome or Edge, or paste the transcript in.', 'error');
      if (speech) { speech.stop(); speech = null; micBtn.replaceChildren(icon('play'), 'Start live transcription'); return; }
      speech = new SR();
      speech.lang = 'en-GB';
      speech.continuous = true;
      speech.interimResults = false;
      speech.onresult = (ev) => {
        for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) transcript.value += `${transcript.value ? '\n' : ''}${speaker}: ${ev.results[i][0].transcript.trim()}`;
        transcript.scrollTop = transcript.scrollHeight;
      };
      speech.onerror = (ev) => { toast(ev.error === 'not-allowed' ? 'Allow the microphone to transcribe the call' : `Transcription stopped (${ev.error})`, 'error'); speech = null; micBtn.replaceChildren(icon('play'), 'Start live transcription'); };
      speech.onend = () => { if (speech) speech.start(); };
      speech.start();
      micBtn.replaceChildren(icon('x'), 'Stop transcription');
    };
    // Live coaching: re-read the conversation every few seconds.
    let last = '';
    const coachTimer = setInterval(async () => {
      if (!document.body.contains(coach)) { clearInterval(coachTimer); return; }
      const text = transcript.value;
      if (text === last || !text.trim()) return;
      last = text;
      try {
        const a = await post('/dialer/analyse', { transcript: text, notes: notes.value });
        const handlers = (a.objections || []).map((o) => script?.objections.find((x) => x.key === o.key)).filter(Boolean);
        mount(coach,
          a.pains.length ? h('div', h('div', { class: 'small muted' }, 'Problems they’ve mentioned'), h('div', { class: 'blue small', style: { fontWeight: 700 } }, a.pains.map((p) => p.label).join(' · '))) : null,
          handlers.map((o) => h('div', { class: 'dl-coach' }, h('div', { class: 'small blue', style: { fontWeight: 700 } }, `They said: ${o.label}`), h('div', `“${o.handler}”`), o.from_calls ? h('div', { class: 'small muted' }, 'This answer has booked calls for you before.') : null)),
          a.signals.length ? h('div', { class: 'small' }, h('b', 'Buying signals: '), a.signals.slice(0, 4).join(', '), ' – go for the booking.') : null,
          a.questions.length ? h('div', { class: 'small' }, h('b', 'They asked: '), a.questions.slice(-2).join(' · ')) : null);
      } catch { /* keep going */ }
    }, 5000);
    // Twilio's own transcription arrives on the call record: pull it in while live.
    const pull = state.call.mode === 'bridge' ? setInterval(async () => {
      if (!document.body.contains(transcript)) { clearInterval(pull); return; }
      try { const fresh = await get(`/dialer/calls/${state.call.id}`); if (fresh.transcript && fresh.transcript.length > transcript.value.length) transcript.value = fresh.transcript; } catch { /* ignore */ }
    }, 4000) : null;

    const finish = (outcome, extra = {}) => async () => {
      if (speech) { speech.onend = null; speech.stop(); speech = null; }
      try {
        const res = await post(`/dialer/calls/${state.call.id}/end`, { outcome, notes: notes.value, transcript: transcript.value, duration_seconds: Math.round((Date.now() - state.started) / 1000), ...extra });
        clearInterval(state.timer); clearInterval(coachTimer); if (pull) clearInterval(pull);
        afterCall(res);
      } catch (err) { showError(err); }
    };
    const outcomeBtn = ([key, label, ic, cls]) => h('button', { class: `btn sm ${cls}`, onclick: () => {
      if (key === 'booked') return bookOnCall(lead, finish);
      if (key === 'callback') return callbackOnCall(lead, finish);
      return finish(key)();
    } }, icon(ic), label);
    mount(live, h('div', { class: 'card card-pad dl-live stack' },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', '● On the call with ', h('span', { class: 'blue' }, c.first_name), ' – ', timer),
        state.call.mode === 'phone' ? h('a', { class: 'btn sm', href: `tel:${c.phone_e164}` }, icon('phone'), 'Dial again') : null),
      state.opener ? h('div', { class: 'why small' }, h('b', 'Open with: '), `“${state.opener.text}”`) : null,
      h('div', { class: 'grid g2 dl-live-grid' },
        h('div', { class: 'stack' }, field('Notes', notes),
          h('div', h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '6px' } }, h('span', { class: 'small', style: { fontWeight: 700 } }, 'Transcript'), h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'small muted' }, 'Speaking:'), speakerBtns)), transcript,
            h('div', { class: 'row', style: { marginTop: '6px' } }, micBtn, h('span', { class: 'small muted' }, state.call.mode === 'bridge' ? 'Twilio is transcribing both sides automatically.' : 'Uses your microphone (Chrome/Edge). Put the call on speaker to catch both sides.')))),
        h('div', { class: 'stack' }, h('div', { class: 'small', style: { fontWeight: 700 } }, 'Live coaching'), coach)),
      h('div', h('div', { class: 'small', style: { fontWeight: 700, marginBottom: '6px' } }, 'How did it go?'), h('div', { class: 'row', style: { gap: '6px' } }, OUTCOME_BUTTONS.map(outcomeBtn)))));
    live.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const afterCall = (res) => {
    const seq = res.sequence;
    mount(live, h('div', { class: 'card card-pad stack dl-done' },
      h('h3', '✓ Logged: ', h('span', { class: 'blue' }, titleCase(res.outcome))),
      res.analysis?.summary ? h('div', { class: 'small' }, h('b', 'Picked out: '), res.analysis.summary) : null,
      h('div', { class: 'small muted' }, 'Saved to their record: notes, transcript, problems, objections, budget and timeline, lead score and timeline entry.'),
      res.booking ? h('div', h('b', '📅 Booked: '), dateTime(res.booking.starts_at), ' – confirmation sent.') : null,
      res.callback ? h('div', h('b', `📞 ${res.callback.mode === 'call' ? 'Call back' : 'Text back'}: `), `${dayClock(res.callback.due_at)} your time · ${dayClock(res.callback.due_at, c.timezone)} theirs`) : null,
      res.text_back ? h('div', h('b', '💬 Text back sent: '), h('span', { class: 'small' }, res.text_back.body)) : null,
      res.next_dial_at ? h('div', h('b', '⏭ Next try: '), `${dayClock(res.next_dial_at)} your time (${dayClock(res.next_dial_at, c.timezone)} for them – a good time in their day)`) : null,
      Object.entries(res.pages || {}).map(([k, p]) => h('div', { class: 'copy-row' }, h('span', { class: 'small', style: { fontWeight: 700, minWidth: '110px' } }, k === 'demo' ? 'Their demo page' : 'Confirmation page'), h('input', { value: p.link, readOnly: true }), h('button', { class: 'btn sm', onclick: () => copyText(p.link, 'Link copied') }, icon('copy')), h('a', { class: 'btn sm', href: p.link.slice(p.link.indexOf('#')), target: '_blank' }, 'Open'))),
      seq ? h('div', h('div', { style: { fontWeight: 700, marginBottom: '4px' } }, `Follow-up sequence: ${seq.name}`), seq.steps.map((s) => h('div', { class: 'small dl-step' }, h('span', { class: 'blue' }, s.type === 'call' ? '📞' : '💬'), ` ${dayClock(s.due_at)} – ${s.label}`))) : null,
      res.script_version?.changes?.length ? h('div', { class: 'small' }, h('b', 'Script updated: '), res.script_version.changes.join(' · ')) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: onNext }, 'Next lead ›'), h('a', { class: 'btn', href: `#/crm/lead/${c.id}` }, 'Open full profile'))));
  };

  const told = lead.told_us.slice(0, 4);
  mount(el,
    h('div', { class: 'card card-pad stack dl-head' },
      h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'flex-start' } },
        h('div', { class: 'row', style: { alignItems: 'flex-start' } }, avatar(fullName(c)), h('div',
          h('h2', fullName(c)), h('div', { class: 'small muted' }, [c.company || e.company, e.location, c.phone].filter(Boolean).join(' · ')),
          h('div', { class: 'small row', style: { gap: '6px', marginTop: '4px' } }, dot(w.status), h('b', `${w.label} for them`), `(${w.zone})`, h('span', { class: 'blue' }, STATUS_TEXT[w.status]), w.status === 'closed' && w.next_open_at ? h('span', { class: 'muted' }, `· opens ${dayClock(w.next_open_at)} your time`) : null))),
        h('div', { class: 'dl-bigscore', title: (e.score_reasons || []).join('\n') }, h('b', c.lead_score ?? '–'), h('span', { class: 'small muted' }, 'lead score'))),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', disabled: !c.phone_e164 || c.dial_status === 'do_not_call', onclick: (ev) => startCall(ev.currentTarget) }, icon('phone'), c.phone_e164 ? 'Call now' : 'No number'),
        h('a', { class: 'btn', href: `#/messages/${c.id}` }, icon('chat'), 'Message'),
        h('button', { class: 'btn', onclick: () => bookingModal({ contact: c, onDone: reload }) }, icon('calendar'), 'Book'),
        h('button', { class: 'btn', onclick: () => callbackOnCall(lead, null, reload) }, icon('clock'), 'Call back'),
        h('a', { class: 'btn ghost', href: `#/crm/lead/${c.id}` }, 'Full profile ›')),
      c.dial_status && c.dial_status !== 'new' ? h('div', { class: 'small' }, h('b', 'Status: '), DIAL_STATUS[c.dial_status] || titleCase(c.dial_status), c.dial_attempts ? ` · ${c.dial_attempts} call${c.dial_attempts === 1 ? '' : 's'}` : '', c.last_dialed_at ? ` · last ${ago(c.last_dialed_at)}` : '') : null),
    live,
    h('div', { class: 'grid g2 dl-panels' },
      section(h('span', 'Opening ', h('span', { class: 'blue' }, 'lines')), h('p', { class: 'small muted' }, 'Written for this lead from what they’ve told you. The one that books the most calls for you is marked ★.'), openerList),
      h('div', { class: 'stack' },
        section(h('span', 'What we ', h('span', { class: 'blue' }, 'know')), enrichmentBlock(c), qualificationBlock(q)),
        told.length ? section(h('span', 'What they ', h('span', { class: 'blue' }, 'told us')), told.map((t) => h('div', { class: 'dl-told' }, h('div', { class: 'small muted' }, `${t.from} · ${ago(t.at)}`), t.items.map(([k, v]) => h('div', { class: 'small' }, h('b', `${k}: `), v))))) : null,
        lead.calls.length ? section(h('span', 'Past ', h('span', { class: 'blue' }, 'calls')), lead.calls.slice(0, 4).map((x) => h('div', { class: 'small dl-told' }, h('b', titleCase(x.outcome || 'live')), ` · ${ago(x.started_at)}${x.duration_seconds ? ` · ${mins(x.duration_seconds)}` : ''}${x.caller ? ` · ${x.caller}` : ''}`, x.analysis?.summary ? h('div', { class: 'muted' }, x.analysis.summary) : null, x.notes ? h('div', x.notes) : null))) : null)),
    h('div', { class: 'grid g2 dl-panels' },
      section(h('span', 'How we’d ', h('span', { class: 'blue' }, 'help')), h('p', { class: 'small muted' }, 'Talk to the problems they have – these go on their personal demo page too.'),
        lead.solutions.map((s) => h('div', { class: 'dl-told' }, h('b', { class: 'blue' }, s.problem), h('div', { class: 'small' }, s.fix), s.items.length ? h('div', { class: 'small muted' }, s.items.map((i) => i.name).join(' · ')) : null))),
      script ? section(h('span', 'Quick ', h('span', { class: 'blue' }, 'script')),
        h('div', { class: 'small', style: { fontWeight: 700 } }, 'Questions to ask'), h('ol', { class: 'small dl-ol' }, script.script.discovery.slice(0, 5).map((d) => h('li', d))),
        h('div', { class: 'small', style: { fontWeight: 700 } }, 'If they say…'), script.script.objections.slice(0, 4).map((o) => h('div', { class: 'small dl-told' }, h('b', { class: 'blue' }, o.label), h('div', `“${o.handler}”`))),
        h('div', { class: 'small', style: { fontWeight: 700 } }, 'Close'), h('div', { class: 'small' }, `“${script.script.close}”`)) : null));
}

function enrichmentBlock(c) {
  const e = c.enrichment || {};
  const eng = e.engagement || {};
  return h('div', { class: 'dl-kvs' },
    kv('Where', [e.phone?.flag, e.location].filter(Boolean).join(' ') || null),
    kv('Time zone', c.timezone ? `${c.timezone.replace(/_/g, ' ')}${e.timezone_source ? ` (from ${e.timezone_source})` : ''}` : 'Unknown – set it on their profile'),
    kv('Phone', e.phone ? [e.phone.line && e.phone.line !== 'unknown' ? titleCase(e.phone.line) : null, e.phone.region, e.phone.country].filter(Boolean).join(' · ') || null : null),
    kv('Email', e.email ? `${titleCase(e.email.type)}${e.email.domain ? ` · ${e.email.domain}` : ''}` : null),
    kv('Company', e.company ? `${e.company}${e.company_guessed ? ' (from their email)' : ''}` : null),
    kv('Website', e.website ? h('a', { href: e.website, target: '_blank', rel: 'noopener' }, e.website.replace(/^https?:\/\//, '')) : null),
    kv('Came from', c.source || null),
    kv('Engagement', [plural(eng.msgs_in, 'message from them', 'messages from them'), plural(eng.calls_made, 'call made', 'calls made'), plural(eng.forms, 'form', 'forms'), plural(eng.bookings, 'booking', 'bookings')].join(' · ')),
    e.score_reasons?.length ? h('details', { class: 'small span2' }, h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, `Why the score is ${e.score}`), h('div', { class: 'muted' }, e.score_reasons.join(' · '))) : null);
}

function qualificationBlock(q) {
  const items = [kv('Main problem', q.pain), kv('Budget', q.budget), kv('Timeline', q.timeline), kv('Decides?', q.decision_maker), kv('Concerns', (q.objections || []).join(', ') || null), kv('Last call', q.last_summary)].filter(Boolean);
  return items.length ? h('div', { class: 'dl-kvs', style: { marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--line-soft)' } }, items) : h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Nothing from calls yet – it fills in as you talk.');
}

async function bookOnCall(lead, finish) {
  const c = lead.contact;
  if (!lead.services.length) return toast('Add a service in Bookings first (e.g. “Discovery call – 30 min”)', 'error');
  const serviceSel = select('service_id', lead.services.map((s) => [s.id, `${s.name} · ${s.duration_min} min`]), lead.demo_service_id);
  const dateIn = h('input', { type: 'date', value: new Date(Date.now() + 86400_000).toISOString().slice(0, 10) });
  const slots = h('div', { class: 'dl-slots' });
  let chosen = null;
  const load = async () => {
    chosen = null;
    const list = await get(`/bookings/slots?service=${serviceSel.value}&date=${dateIn.value}`).catch(() => []);
    mount(slots, list.length ? list.map((s) => h('button', { class: 'chip', type: 'button', onclick: (ev) => { chosen = s.starts_at; slots.querySelectorAll('.chip').forEach((x) => x.classList.remove('active')); ev.currentTarget.classList.add('active'); } },
      `${clock(s.starts_at)}${c.timezone ? ` · ${clock(s.starts_at, c.timezone)} theirs` : ''}`)) : h('div', { class: 'small muted' }, 'No free times that day – try another.'));
  };
  serviceSel.onchange = load; dateIn.onchange = load;
  const body = h('div', { class: 'stack' }, h('div', { class: 'why small' }, `Times show in your time, then theirs (${c.timezone ? c.timezone.replace(/_/g, ' ') : 'unknown'}). They get a confirmation, a personal confirmation page and a preview of the demo.`),
    field('What are you booking?', serviceSel), field('Day', dateIn), slots);
  modal(`Book ${c.first_name} in`, body, { actions: [{ label: 'Cancel' }, { label: 'Book & log call', primary: true, onClick: async () => {
    if (!chosen) { toast('Pick a time', 'error'); return false; }
    await finish('booked', { booking: { service_id: serviceSel.value, starts_at: chosen } })();
  } }] });
  load();
}

function callbackOnCall(lead, finish, reload) {
  const c = lead.contact;
  const tz = c.timezone;
  const suggested = lead.window.next_best_at || new Date(Date.now() + 86400_000).toISOString();
  const local = (iso) => { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const when = h('input', { type: 'datetime-local', value: local(suggested) });
  const theirs = h('div', { class: 'small blue' });
  const show = () => { theirs.textContent = when.value && tz ? `That’s ${dayClock(new Date(when.value).toISOString(), tz)} for them.` : ''; };
  when.oninput = show; show();
  const body = h('div', { class: 'stack' },
    field('When (your time)', when), theirs,
    field('Call or text?', select('mode', [['call', 'Call them back'], ['text', 'Text them instead']], c.call_pref || 'call')),
    field('What about?', h('input', { name: 'topic', placeholder: 'e.g. after they’ve spoken to their partner' })),
    h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'confirm', checked: true, style: { width: 'auto' } }), 'Text them to confirm the time (in their time zone)'));
  modal(`Call ${c.first_name} back`, body, { actions: [{ label: 'Cancel' }, { label: finish ? 'Save & log call' : 'Book call back', primary: true, onClick: async () => {
    const d = formData(body);
    const due = new Date(when.value).toISOString();
    if (finish) await finish('callback', { callback: { due_at: due, mode: d.mode, topic: d.topic, confirm: d.confirm } })();
    else { await post('/dialer/callbacks', { contact_id: c.id, due_at: due, mode: d.mode, topic: d.topic, confirm: d.confirm }); toast('Call back booked – it’s in the calendar'); reload?.(); }
  } }] });
}

async function dialerSettings(reload) {
  const { settings: s, call_mode: m, timezone } = await get('/dialer/settings');
  const services = await get('/bookings/services').catch(() => []);
  const win = (name, w) => h('div', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } },
    h('input', { type: 'time', name: `${name}_start`, value: w?.[0] || '' }), h('span', '–'), h('input', { type: 'time', name: `${name}_end`, value: w?.[1] || '' }));
  const zones = ['', 'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Australia/Sydney', 'Asia/Dubai'];
  const body = h('div', { class: 'stack' },
    h('div', { class: 'why small' }, m.bridge ? 'Calls ring your phone first, then connect the lead from your business number.' : `To ring and connect leads from the dialer: ${m.missing.join(' · ') || 'all set'}.`),
    h('div', { class: 'grid g2' },
      field('Your phone (the dialer rings this)', h('input', { name: 'my_phone', value: s.my_phone || '', placeholder: '07700 900123' })),
      field('Your time zone', select('my_timezone', zones.map((z) => [z, z ? z.replace(/_/g, ' ') : `Business time zone (${timezone})`]), s.my_timezone || ''))),
    h('h3', 'Calling hours – in the lead’s own time'),
    h('div', { class: 'grid g3' }, field('Mon–Fri', win('weekday', s.hours.weekday)), field('Saturday', win('sat', s.hours.sat)), field('Sunday', win('sun', s.hours.sun))),
    h('div', { class: 'grid g2' }, field('Best pick-up time 1', win('best0', s.best[0])), field('Best pick-up time 2', win('best1', s.best[1]))),
    h('div', { class: 'grid g3' },
      field('Hours between tries', h('input', { name: 'retry_hours', value: s.retry_hours.join(', '), help: '' }), { help: 'After each missed call, e.g. 3, 24, 48' }),
      field('Max tries', h('input', { name: 'max_attempts', type: 'number', min: 1, max: 20, value: s.max_attempts })),
      field('New lead = call within (min)', h('input', { name: 'speed_to_lead_minutes', type: 'number', min: 5, value: s.speed_to_lead_minutes }))),
    h('h3', 'Call backs leads can choose (your business’s time)'),
    h('div', { class: 'grid g3' }, field('Mon–Fri', win('cb_weekday', s.callback_hours.weekday)), field('Saturday', win('cb_sat', s.callback_hours.sat)), field('Sunday', win('cb_sun', s.callback_hours.sun))),
    field('Meetings booked on calls', select('demo_service_id', [['', 'Pick each time'], ...services.filter((x) => x.active).map((x) => [x.id, x.name])], s.demo_service_id || '')),
    ['text_back:Text them straight after a missed call, offering a call back or a text back', 'auto_demo:Make a personal demo page for everyone interested', 'auto_sequences:Start follow-up sequences after each call', 'transcribe:Transcribe calls made through Twilio', 'record:Record calls through Twilio (tell people you’re recording)']
      .map((x) => { const [k, l] = x.split(':'); return h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: k, checked: Boolean(s[k]), style: { width: 'auto' } }), l); }));
  modal('Dialer settings', body, { wide: true, actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: async () => {
    const d = formData(body);
    const pair = (n) => (d[`${n}_start`] && d[`${n}_end`] ? [d[`${n}_start`], d[`${n}_end`]] : null);
    await fetchPut({
      my_phone: d.my_phone, my_timezone: d.my_timezone, hours: { weekday: pair('weekday'), sat: pair('sat'), sun: pair('sun') }, best: [pair('best0'), pair('best1')].filter(Boolean),
      callback_hours: { weekday: pair('cb_weekday'), sat: pair('cb_sat'), sun: pair('cb_sun') }, retry_hours: d.retry_hours.split(',').map((x) => Number(x.trim())).filter(Boolean),
      max_attempts: Number(d.max_attempts), speed_to_lead_minutes: Number(d.speed_to_lead_minutes), demo_service_id: d.demo_service_id || null,
      text_back: d.text_back, auto_demo: d.auto_demo, auto_sequences: d.auto_sequences, transcribe: d.transcribe, record: d.record,
    });
    toast('Dialer settings saved');
    reload();
  } }] });
}
const fetchPut = (body) => put('/dialer/settings', body);

// ───────────────────────── Calendar ─────────────────────────

const CAL_TYPES = { booking: ['📅', 'Booking'], callback: ['📞', 'Call back'], textback: ['💬', 'Text back'], follow_call: ['📞', 'Follow-up call'], follow_message: ['✉️', 'Follow-up text'] };

export async function renderCalendar(el, query = {}) {
  const start = query.week ? new Date(`${query.week}T00:00:00`) : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const [cal, links] = await Promise.all([get(`/dialer/calendar?from=${start.toISOString()}&to=${end.toISOString()}`), get('/dialer/callbacks')]);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shift = (days) => { const d = new Date(start); d.setDate(d.getDate() + days); return `#/crm/calendar?week=${ymd(d)}`; };
  const reload = () => renderCalendar(el, query);
  const filter = query.show || 'all';
  const items = cal.items.filter((i) => filter === 'all' || (filter === 'calls' ? ['callback', 'textback', 'follow_call'].includes(i.type) : filter === 'bookings' ? i.type === 'booking' : i.type === 'follow_message'));
  const days = [...Array(7)].map((_, n) => { const d = new Date(start); d.setDate(d.getDate() + n); return d; });
  const today = ymd(new Date());
  mount(el,
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '12px' } },
      h('div', { class: 'row' },
        h('a', { class: 'btn sm', href: shift(-7) }, '‹ Previous'),
        h('b', `${date(start.toISOString(), { day: 'numeric', month: 'short' })} – ${date(new Date(end - 1).toISOString(), { day: 'numeric', month: 'short', year: 'numeric' })}`),
        h('a', { class: 'btn sm', href: shift(7) }, 'Next ›'),
        h('a', { class: 'btn sm ghost', href: '#/crm/calendar' }, 'This week')),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => newCallback(reload) }, icon('clock'), 'Add call back'),
        h('button', { class: 'btn sm primary', onclick: () => bookingModal({ onDone: reload }) }, icon('calendar'), 'Book a meeting'))),
    h('div', { class: 'row', style: { marginBottom: '12px' } }, [['all', 'Everything'], ['bookings', 'Bookings'], ['calls', 'Calls & call backs'], ['messages', 'Follow-up texts']].map(([k, l]) => h('a', { class: `chip ${filter === k ? 'active' : ''}`, href: `#/crm/calendar?${new URLSearchParams({ ...(query.week ? { week: query.week } : {}), show: k })}` }, l))),
    h('p', { class: 'small muted' }, `Bookings, call backs and text backs (booked by you or chosen by the lead), and every follow-up from your sequences – in your time (${cal.timezone.replace(/_/g, ' ')}), with theirs alongside when it’s different. ${links.length} call back${links.length === 1 ? '' : 's'} waiting.`),
    h('div', { class: 'dl-cal' }, days.map((d) => {
      const key = ymd(d);
      const list = items.filter((i) => ymd(new Date(i.at)) === key);
      return h('div', { class: `card dl-day ${key === today ? 'today' : ''}` },
        h('div', { class: 'dl-day-head' }, h('b', d.toLocaleDateString('en-GB', { weekday: 'long' })), h('span', { class: 'small muted' }, d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })), key === today ? h('span', { class: 'small blue' }, 'Today') : null),
        list.length ? list.map((i) => calItem(i, reload)) : h('div', { class: 'small muted', style: { padding: '8px 0' } }, 'Nothing booked'));
    })));
}

function calItem(i, reload) {
  const [emoji, label] = CAL_TYPES[i.type] || ['•', i.type];
  const done = i.status === 'done' || i.status === 'completed';
  const actions = i.type === 'callback' || i.type === 'textback' ? h('div', { class: 'row', style: { gap: '4px', marginTop: '4px' } },
    i.status === 'pending' ? h('a', { class: 'btn sm', href: i.type === 'callback' ? `#/crm/dialer?lead=${i.contact_id}` : `#/messages/${i.contact_id}` }, i.type === 'callback' ? 'Call' : 'Text') : null,
    i.status === 'pending' ? h('button', { class: 'btn sm ghost', onclick: async () => { await patch(`/dialer/callbacks/${i.id}`, { status: 'done' }); toast('Marked done'); reload(); } }, 'Done') : null,
    i.status === 'pending' ? h('button', { class: 'btn sm ghost', onclick: async () => { await patch(`/dialer/callbacks/${i.id}`, { status: 'cancelled' }); toast('Cancelled'); reload(); } }, 'Cancel') : null) : null;
  return h('div', { class: `dl-cal-item ${done ? 'done' : ''}` },
    h('div', { class: 'small blue', style: { fontWeight: 700 } }, `${clock(i.at)} ${emoji} ${label}`),
    i.link ? h('a', { href: i.link, class: 'small', style: { fontWeight: 600 } }, i.title.replace(/^.*? – /, '')) : h('a', { href: `#/crm/lead/${i.contact_id}`, class: 'small', style: { fontWeight: 600 } }, i.title.replace(/^.*? – /, '')),
    i.theirs ? h('div', { class: 'small muted' }, i.theirs) : null,
    i.topic ? h('div', { class: 'small muted' }, i.topic) : null,
    done ? h('div', { class: 'small muted' }, '✓ Done') : null,
    actions);
}

async function newCallback(reload) {
  const contacts = await get('/crm/contacts');
  const who = select('contact_id', contacts.filter((c) => c.phone_e164 || c.email).map((c) => [c.id, `${c.first_name} ${c.last_name || ''}${c.company ? ` · ${c.company}` : ''}`]));
  const when = h('input', { type: 'datetime-local', name: 'when' });
  const body = h('div', { class: 'stack' }, field('Who', who), field('When (your time)', when),
    field('Call or text?', select('mode', [['call', 'Call them back'], ['text', 'Text them']], 'call')), field('What about?', h('input', { name: 'topic' })),
    h('label', { class: 'row small', style: { gap: '8px', fontWeight: 600 } }, h('input', { type: 'checkbox', name: 'confirm', style: { width: 'auto' } }), 'Text them to confirm the time'));
  modal('Add a call back', body, { actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: async () => {
    const d = formData(body);
    if (!when.value) { toast('Pick a time', 'error'); return false; }
    await post('/dialer/callbacks', { contact_id: d.contact_id, due_at: new Date(when.value).toISOString(), mode: d.mode, topic: d.topic, confirm: d.confirm });
    toast('Call back added');
    reload();
  } }] });
}

// ───────────────────────── Scripts ─────────────────────────

export async function renderScripts(el) {
  const [s, calls] = await Promise.all([get('/dialer/script'), get('/dialer/calls')]);
  const t = s.totals;
  const sc = s.script;
  mount(el,
    h('div', { class: 'grid g4 dl-stats' },
      kpi('Calls logged', t.calls, `${t.transcripts} with a transcript`, 'accent'),
      kpi('Picked up', `${t.connect_rate}%`, `${t.connected} conversations`),
      kpi('Booked', `${t.book_rate}%`, `${t.booked} of the people you spoke to`),
      kpi('Script version', s.versions[0]?.n || 1, s.versions[0] ? `updated ${ago(s.versions[0].at)}` : 'updates after each call')),
    h('div', { class: 'why small', style: { marginBottom: '14px' } }, 'This script rewrites itself from your own calls: the opener that books the most goes to the top, objections are ranked by how often you hear them, and when a call books after an objection, the exact words you used become the suggested answer.'),
    h('div', { class: 'grid g2 dl-panels' },
      h('div', { class: 'stack' },
        section(h('span', 'Your best ', h('span', { class: 'blue' }, 'script')),
          h('div', { class: 'small', style: { fontWeight: 700 } }, '1. Open'), h('div', sc.opener.text ? `“${sc.opener.text}”` : sc.opener.why), h('div', { class: 'small muted' }, sc.opener.text ? sc.opener.why : ''),
          h('div', { class: 'small', style: { fontWeight: 700, marginTop: '10px' } }, '2. Find the problem'), h('ol', { class: 'small dl-ol' }, sc.discovery.map((d) => h('li', d))),
          h('div', { class: 'small', style: { fontWeight: 700 } }, '3. Show the fix'), h('div', { class: 'small' }, sc.pitch),
          h('div', { class: 'small', style: { fontWeight: 700, marginTop: '10px' } }, '4. Book it'), h('div', { class: 'small' }, `“${sc.close}”`),
          h('div', { class: 'small', style: { fontWeight: 700, marginTop: '10px' } }, 'Tips from your calls'), h('ul', { class: 'small dl-ol' }, sc.tips.map((x) => h('li', x)))),
        section(h('span', 'Handling ', h('span', { class: 'blue' }, 'objections')),
          sc.objections.map((o) => h('div', { class: 'dl-told' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', { class: 'blue' }, o.label), h('span', { class: 'small muted' }, o.count ? `heard ${o.count}× · ${o.rate}% still booked` : 'not heard yet')),
            h('div', { class: 'small' }, `“${o.handler}”`), o.from_calls ? h('div', { class: 'small blue' }, '✓ Learnt from a call that booked') : null, o.heard ? h('div', { class: 'small muted' }, `They said: “${o.heard}”`) : null)))),
      h('div', { class: 'stack' },
        section(h('span', 'Openers that ', h('span', { class: 'blue' }, 'work')),
          s.openers.length ? h('table', { class: 'table small' }, h('thead', h('tr', ['Opener', 'Used', 'Spoke', 'Booked', 'Rate'].map((x) => h('th', x)))),
            h('tbody', s.openers.map((o) => h('tr', h('td', titleCase(o.key)), h('td', o.used), h('td', o.connected), h('td', o.booked), h('td', h('b', { class: 'blue' }, `${o.rate}%`))))))
            : h('p', { class: 'small muted' }, 'Pick an opener before each call and the results show here.')),
        section(h('span', 'Problems you ', h('span', { class: 'blue' }, 'hear most')), s.pains.length ? s.pains.map((p) => h('div', { class: 'row small', style: { justifyContent: 'space-between', padding: '4px 0' } }, h('span', p.label), h('b', { class: 'blue' }, `${p.count} call${p.count === 1 ? '' : 's'}`))) : h('p', { class: 'small muted' }, 'Fills in from your transcripts and notes.')),
        s.questions.length ? section(h('span', 'Questions they ', h('span', { class: 'blue' }, 'ask')), s.questions.map((q) => h('div', { class: 'small', style: { padding: '3px 0' } }, `${q.question} `, h('span', { class: 'muted' }, `(${q.count}×)`)))) : null,
        section(h('span', 'Script ', h('span', { class: 'blue' }, 'history')),
          h('button', { class: 'btn sm', onclick: async () => { await post('/dialer/script/rebuild', {}); toast('Script rebuilt from your calls'); renderScripts(el); } }, 'Rebuild now'),
          s.versions.length ? s.versions.slice(0, 8).map((v) => h('div', { class: 'dl-told small' }, h('b', `Version ${v.n}`), ` · ${ago(v.at)} · ${v.calls} calls · ${v.book_rate}% booked`, h('div', { class: 'muted' }, v.reason), v.changes.length ? h('ul', { class: 'dl-ol' }, v.changes.map((c) => h('li', c))) : null)) : h('p', { class: 'small muted' }, 'A new version is saved after each call with a transcript.')))),
    section(h('span', 'Recent ', h('span', { class: 'blue' }, 'calls')),
      calls.length ? calls.slice(0, 25).map((x) => h('details', { class: 'dl-call' },
        h('summary', h('b', `${x.first_name || ''} ${x.last_name || ''}`), ` · ${titleCase(x.outcome || 'live')} · ${ago(x.started_at)}${x.duration_seconds ? ` · ${mins(x.duration_seconds)}` : ''}${x.caller ? ` · ${x.caller}` : ''}`),
        x.analysis?.summary ? h('div', { class: 'small' }, h('b', 'Picked out: '), x.analysis.summary) : null,
        x.opener_text ? h('div', { class: 'small' }, h('b', 'Opener: '), x.opener_text) : null,
        x.notes ? h('div', { class: 'small' }, h('b', 'Notes: '), x.notes) : null,
        x.transcript ? h('pre', { class: 'dl-transcript' }, x.transcript) : h('div', { class: 'small muted' }, 'No transcript.'),
        h('a', { class: 'small', href: `#/crm/lead/${x.contact_id}` }, 'Open their profile ›'))) : h('p', { class: 'small muted' }, 'No calls yet.')));
}

// ───────────────────────── Full lead profile ─────────────────────────

export async function renderLeadProfile(el, contactId) {
  const lead = await get(`/dialer/leads/${contactId}`);
  const c = lead.contact;
  const q = c.qualification || {};
  const reload = () => renderLeadProfile(el, contactId);
  const zones = ['', 'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Toronto', 'Australia/Sydney', 'Asia/Dubai', 'Asia/Singapore'];
  if (c.timezone && !zones.includes(c.timezone)) zones.push(c.timezone);
  const qForm = h('div', { class: 'stack' },
    h('div', { class: 'grid g2' },
      field('Main problem', h('input', { name: 'pain', value: q.pain || '' })), field('Budget', h('input', { name: 'budget', value: q.budget || '' })),
      field('Timeline', h('input', { name: 'timeline', value: q.timeline || '' })), field('Decision maker', h('input', { name: 'decision_maker', value: q.decision_maker || '' })),
      field('Their time zone', select('timezone', zones.map((z) => [z, z ? z.replace(/_/g, ' ') : 'Work it out for me']), c.timezone || '')),
      field('Prefers', select('call_pref', [['', 'No preference'], ['call', 'A call'], ['text', 'A text']], c.call_pref || ''))),
    field('Notes about them', h('textarea', { name: 'notes', value: q.notes || '', style: { minHeight: '70px' } })),
    h('button', { class: 'btn primary', onclick: async () => {
      const d = formData(qForm);
      try {
        await patch(`/crm/contacts/${c.id}`, { qualification: { pain: d.pain, budget: d.budget, timeline: d.timeline, decision_maker: d.decision_maker, notes: d.notes }, ...(d.timezone ? { timezone: d.timezone } : {}), ...(d.call_pref ? { call_pref: d.call_pref } : {}) });
        toast('Saved');
        reload();
      } catch (err) { showError(err); }
    } }, 'Save'));
  mount(el,
    h('a', { href: '#/crm/contacts', class: 'small' }, '‹ All contacts'),
    h('div', { class: 'card card-pad stack dl-head', style: { marginTop: '10px' } },
      h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'flex-start' } },
        h('div', { class: 'row', style: { alignItems: 'flex-start' } }, avatar(fullName(c)), h('div', h('h1', { style: { fontSize: '24px' } }, fullName(c)),
          h('div', { class: 'small muted' }, [c.company || c.enrichment?.company, c.email, c.phone].filter(Boolean).join(' · ')),
          h('div', { class: 'small row', style: { gap: '6px', marginTop: '4px' } }, dot(lead.window.status), `${lead.window.label} for them (${lead.window.zone}) – `, h('span', { class: 'blue' }, STATUS_TEXT[lead.window.status])))),
        h('div', { class: 'dl-bigscore' }, h('b', c.lead_score ?? '–'), h('span', { class: 'small muted' }, 'lead score'))),
      h('div', { class: 'row' },
        h('a', { class: 'btn primary', href: `#/crm/dialer?lead=${c.id}` }, icon('phone'), 'Call in the dialer'),
        h('a', { class: 'btn', href: `#/messages/${c.id}` }, icon('chat'), 'Message'),
        h('button', { class: 'btn', onclick: () => bookingModal({ contact: c, onDone: reload }) }, icon('calendar'), 'Book'),
        h('button', { class: 'btn', onclick: () => callbackOnCall(lead, null, reload) }, icon('clock'), 'Call back'),
        h('button', { class: 'btn ghost', onclick: async () => { await post('/dialer/enrich', { contact_id: c.id }); toast('Details refreshed'); reload(); } }, 'Refresh details'))),
    h('div', { class: 'grid g2 dl-panels' },
      h('div', { class: 'stack' },
        section(h('span', 'Everything we ', h('span', { class: 'blue' }, 'know')), enrichmentBlock(c)),
        section(h('span', 'Qualification', ''), h('p', { class: 'small muted' }, 'Filled in from calls automatically – change anything here.'), qForm),
        section(h('span', 'What they ', h('span', { class: 'blue' }, 'told us')), lead.told_us.length ? lead.told_us.map((t) => h('div', { class: 'dl-told' }, h('div', { class: 'small muted' }, `${t.from} · ${ago(t.at)}`), t.items.map(([k, v]) => h('div', { class: 'small' }, h('b', `${k}: `), v)))) : h('p', { class: 'small muted' }, 'Nothing yet – form answers, booking notes, call notes and their messages show here.')),
        section(h('span', 'Their ', h('span', { class: 'blue' }, 'pages')),
          h('div', { class: 'copy-row' }, h('span', { class: 'small', style: { fontWeight: 700, minWidth: '110px' } }, 'Call-back page'), h('input', { value: lead.links.callback, readOnly: true }), h('button', { class: 'btn sm', onclick: () => copyText(lead.links.callback, 'Link copied') }, icon('copy'))),
          lead.pages.filter((p) => p.kind !== 'callback').map((p) => { const link = `#/${p.kind === 'demo' ? 'demo' : 'confirmed'}/${p.token}`; return h('div', { class: 'row small', style: { justifyContent: 'space-between' } }, h('span', h('b', p.kind === 'demo' ? 'Personal demo' : 'Booking confirmation'), ` · made ${ago(p.created_at)} · ${p.viewed_at ? `opened ${ago(p.viewed_at)}` : 'not opened yet'}`), h('a', { class: 'btn sm', href: link, target: '_blank' }, 'Open')); }),
          h('button', { class: 'btn sm soft', onclick: async () => { const p = await post('/dialer/pages', { contact_id: c.id, kind: 'demo' }); copyText(p.link, 'Demo page made – link copied'); reload(); } }, 'Make a new demo page'))),
      h('div', { class: 'stack' },
        section(h('span', 'Calls & ', h('span', { class: 'blue' }, 'transcripts')), lead.calls.length ? lead.calls.map((x) => h('details', { class: 'dl-call' },
          h('summary', h('b', titleCase(x.outcome || 'live')), ` · ${dateTime(x.started_at)}${x.duration_seconds ? ` · ${mins(x.duration_seconds)}` : ''}${x.caller ? ` · ${x.caller}` : ''}`),
          x.analysis?.summary ? h('div', { class: 'small' }, h('b', 'Picked out: '), x.analysis.summary) : null,
          x.analysis?.highlights?.length ? h('div', { class: 'small' }, h('b', 'Key moments: '), x.analysis.highlights.map((m) => `“${m}”`).join(' ')) : null,
          x.notes ? h('div', { class: 'small' }, h('b', 'Notes: '), x.notes) : null,
          x.transcript ? h('pre', { class: 'dl-transcript' }, x.transcript) : null,
          x.recording_url ? h('a', { class: 'small', href: x.recording_url, target: '_blank', rel: 'noopener' }, 'Listen to the recording') : null)) : h('p', { class: 'small muted' }, 'No calls yet.')),
        section(h('span', 'Follow-up ', h('span', { class: 'blue' }, 'sequences')), lead.sequences.length ? lead.sequences.map((sq) => h('div', { class: 'dl-told' },
          h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', sq.name), h('span', { class: 'small muted' }, sq.status === 'active' ? 'Running' : sq.status === 'done' ? 'Finished' : `Stopped – ${sq.stopped_reason}`)),
          sq.steps.map((st) => h('div', { class: `small dl-step ${st.status}` }, `${st.type === 'call' ? '📞' : '💬'} ${dayClock(st.due_at)} – ${st.label}`, st.status !== 'pending' ? h('span', { class: 'muted' }, ` · ${st.result || titleCase(st.status)}`) : null)),
          sq.status === 'active' ? h('button', { class: 'btn sm ghost', onclick: async () => { await post(`/dialer/sequences/${sq.id}/stop`, {}); toast('Sequence stopped'); reload(); } }, 'Stop this sequence') : null)) : h('p', { class: 'small muted' }, 'Sequences start after a call: no answer, interested, booked or call back.')),
        section(h('span', 'Call backs & ', h('span', { class: 'blue' }, 'bookings')),
          lead.callbacks.map((cb) => h('div', { class: 'small dl-told' }, h('b', cb.mode === 'call' ? '📞 Call back' : '💬 Text back'), ` · ${dayClock(cb.due_at)} your time${c.timezone ? ` · ${dayClock(cb.due_at, c.timezone)} theirs` : ''} · ${titleCase(cb.status)}`, cb.topic ? h('div', { class: 'muted' }, cb.topic) : null)),
          lead.bookings.map((b) => h('a', { class: 'small dl-told', href: `#/bookings/${b.id}`, style: { display: 'block' } }, h('b', `📅 ${b.service_name || 'Booking'}`), ` · ${dateTime(b.starts_at)} · ${titleCase(b.status)}`)),
          !lead.callbacks.length && !lead.bookings.length ? h('p', { class: 'small muted' }, 'Nothing booked yet.') : null),
        lead.messages.length ? section(h('span', 'Messages ', h('a', { class: 'small', href: `#/messages/${c.id}` }, 'Open ›')), lead.messages.slice(0, 8).map((m) => h('div', { class: 'run-item' }, h('div', { class: 'ico' }, channelIcon(m.channel)), h('div', { class: 'grow small' }, h('div', { class: 'muted' }, `${m.direction === 'in' ? 'From them' : 'To them'} · ${CHANNEL_LABELS[m.channel] || m.channel} · ${ago(m.created_at)}`), m.body.length > 200 ? `${m.body.slice(0, 200)}…` : m.body)))) : null,
        section(h('span', 'Timeline'), lead.activities.slice(0, 20).map((a) => h('div', { class: 'small dl-told' }, h('div', { class: 'muted' }, `${a.author || 'System'} · ${ago(a.created_at)}`), a.body))))));
}

