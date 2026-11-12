import { setSetting } from '../lib/settings.js';
import { id, now, publicToken } from '../lib/util.js';
import { enrichContact } from '../modules/crm/enrich.js';
import { analyseTranscript } from '../modules/dialer/analyse.js';
import { recordScriptVersion } from '../modules/dialer/scripts.js';
import { DIALER_DEFAULTS, callbackPage, createPage, createSequence, nextGoodTime } from '../modules/dialer/service.js';

/**
 * Demo data for the CRM dialer. CM Automations (Callum's agency) is calling
 * UK and US businesses about automations; Bright Path Coaching has a few
 * coaching leads. There are past calls with transcripts (so the script has
 * learnt something), call backs, follow-up sequences and personal pages.
 */

const CALLS = {
  booked1: [
    'You: Hi Dave, it’s Callum from CM Automations – you filled in our form about missed calls. Have you got two minutes?',
    'Them: Yeah, go on. We miss calls all the time when we’re on a job, it’s a nightmare.',
    'You: What happens to those calls now?',
    'Them: They go to voicemail and most people never leave one. How much does this cost though?',
    'You: Fair question – what’s one missed job worth to you? If it doesn’t pay for itself in the first month, it’s not worth doing.',
    'Them: A boiler install is a couple of grand. That sounds good, can you show me how it works?',
    'You: Of course – shall we do a 30 minute demo on Thursday at 10?',
    'Them: Perfect, let’s do it.',
  ],
  booked2: [
    'You: Hi Sarah, Callum from CM Automations – I saw your enquiry come in and wanted to catch you while it’s fresh. Is now still good?',
    'Them: Yes, thanks for calling so quickly. We get loads of DMs on Instagram and can’t keep up.',
    'You: How many would you say a week?',
    'Them: Maybe forty, and people book with whoever answers first. I’m spending my evenings on admin.',
    'You: That’s exactly what the DM replies fix – every message gets an answer with your booking link in seconds.',
    'Them: I need to speak to my business partner first.',
    'You: Totally – why don’t we book a short call with both of you so she can ask her own questions? Tuesday or Thursday?',
    'Them: Thursday works. That would help a lot.',
  ],
  interested1: [
    'You: Hi Marcus, it’s Callum from CM Automations. You came through our website – what made you get in touch?',
    'Them: We’re a dental practice in Austin and no-shows are killing us. Probably eight a week.',
    'You: Ouch. What do you do now to remind people?',
    'Them: The front desk calls them the day before, when they remember. Can you send me some info?',
    'You: Happy to – so I send the right thing, is it mainly the no-shows you’d want fixed first?',
    'Them: Yes, no-shows and the reviews. We’re thinking about it for next month.',
  ],
  not_interested: [
    'You: Hi Paul, Callum from CM Automations – quick question: when someone calls and you can’t pick up, what happens?',
    'Them: We’ve got a receptionist, we already have something for that. Not interested, thanks.',
  ],
  callback1: [
    'You: Hi Jenna, Callum from CM Automations – is now a good time?',
    'Them: Not right now, I’m with a client. Can you call me back tomorrow afternoon?',
    'You: Of course – I’ll call you tomorrow at 4.',
  ],
};
const text = (k) => CALLS[k].join('\n');

const AGENCY_LEADS = [
  // [key, first, last, company, phone, email, source, minutesAgo, dial status, attempts]
  ['dave', 'Dave', 'Hughes', 'Hughes Heating', '+447700900311', 'dave@hughesheating.co.uk', 'Website form', 60 * 24 * 6, 'booked', 1],
  ['sarah', 'Sarah', 'Okafor', 'Glow & Go Salon', '+447700900312', 'sarah@glowandgo.co.uk', 'Instagram', 60 * 24 * 3, 'booked', 1],
  ['marcus', 'Marcus', 'Reid', 'Lakeside Dental', '+15125550147', 'marcus@lakesidedental.com', 'Website form', 60 * 24 * 2, 'interested', 1],
  ['paul', 'Paul', 'Grant', 'Grant & Co Lettings', '+447700900314', 'paul@grantlettings.co.uk', 'Cold list', 60 * 24 * 5, 'not_interested', 1],
  ['jenna', 'Jenna', 'Walsh', 'Walsh Physio', '+447700900315', 'jenna@walshphysio.co.uk', 'Referral', 60 * 24, 'callback', 1],
  ['amir', 'Amir', 'Khan', 'Khan Electrical', '+447700900316', 'amir@khanelectrical.co.uk', 'Website form', 9, 'new', 0],
  ['olivia', 'Olivia', 'Brooks', 'Brooks Family Dentistry', '+12125550188', 'olivia@brooksdentistry.com', 'Google', 35, 'new', 0],
  ['tyler', 'Tyler', 'Nguyen', 'Coastline Roofing', '+13105550162', 'tyler@coastlineroofing.com', 'Facebook', 60 * 5, 'new', 0],
  ['megan', 'Megan', 'Price', 'Price Fitness', '+13125550175', 'megan@pricefitness.com', 'Instagram', 60 * 26, 'no_answer', 1],
  ['liam', 'Liam', 'Carter', 'Carter Landscapes', '+447700900320', 'liam@carterlandscapes.co.uk', 'Checkatrade', 60 * 30, 'no_answer', 2],
  ['emily', 'Emily', 'Stone', 'Stone & Bloom Florist', '+447700900321', 'emily.stone@gmail.com', 'Instagram', 60 * 48, 'new', 0],
  ['ryan', 'Ryan', 'Fox', 'Fox Auto Repairs', '+447700900322', 'ryan@foxautos.co.uk', 'Website form', 60 * 3, 'new', 0],
  ['chloe', 'Chloe', 'Martin', 'Bayview Spa', '+14165550190', 'chloe@bayviewspa.ca', 'Google', 60 * 20, 'new', 0],
  ['jack', 'Jack', 'Wilson', 'Wilson Builders', '+61412555019', 'jack@wilsonbuilders.com.au', 'Website form', 60 * 10, 'new', 0],
  ['hannah', 'Hannah', 'Lee', 'Peak Performance PT', '+17205550133', 'hannah@peakpt.com', 'TikTok', 60 * 4, 'new', 0],
];

const COACH_LEADS = [
  ['rachel', 'Rachel', 'Adams', null, '+447700900411', 'rachel.adams@gmail.com', 'Lead magnet', 25, 'new', 0],
  ['sophie', 'Sophie', 'Turner', null, '+447700900412', 'sophie.t@outlook.com', 'Instagram', 60 * 7, 'new', 0],
  ['nina', 'Nina', 'Patel', null, '+16465550121', 'nina.patel@gmail.com', 'Podcast', 60 * 3, 'new', 0],
  ['grace', 'Grace', 'Hall', null, '+447700900414', 'grace.hall@hotmail.co.uk', 'Website', 60 * 30, 'no_answer', 1],
];

export function seedDialer(db) {
  if (db.get('SELECT 1 FROM dial_calls LIMIT 1')) return false;
  const agency = db.get(`SELECT * FROM organizations WHERE kind = 'agency' ORDER BY created_at LIMIT 1`);
  const bright = db.get(`SELECT * FROM organizations WHERE name = 'Bright Path Coaching'`);
  const callum = db.get(`SELECT * FROM users WHERE email = 'demo@cmautomations.com'`);
  if (!agency || !callum) return false;
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

  const addLeads = (org, list) => {
    const out = {};
    for (const [key, first, last, company, phone, email, source, minutesAgo, status, attempts] of list) {
      const c = {
        id: id('con'), org_id: org.id, first_name: first, last_name: last, email, phone, phone_e164: phone, company, source, lifecycle: 'lead', owner_id: callum.id,
        tags: JSON.stringify([`Source: ${source}`]), preferred_channel: 'auto', whatsapp_opt_in: 0, created_at: ago(minutesAgo), updated_at: ago(Math.min(minutesAgo, 60)),
        dial_status: status, dial_attempts: attempts, last_dialed_at: attempts ? ago(Math.max(5, minutesAgo - 30)) : null,
      };
      db.insert('contacts', c);
      out[key] = c;
    }
    return out;
  };

  // CM Automations: services to book demos into.
  let demoService = db.get('SELECT * FROM services WHERE org_id = ? AND active = 1 ORDER BY position LIMIT 1', agency.id);
  if (!demoService) {
    for (const [name, mins, pos, desc] of [['Discovery call', 30, 1, 'A short call to see where automations would save you the most time.'], ['Automation demo', 45, 2, 'We show the automations working for your business, live.']]) {
      db.insert('services', { id: id('svc'), org_id: agency.id, name, description: desc, kind: 'appointment', duration_min: mins, buffer_min: 15, price_pence: 0, deposit_pence: 0, online: 1, active: 1, position: pos, created_at: now() });
    }
    demoService = db.get('SELECT * FROM services WHERE org_id = ? AND active = 1 ORDER BY position LIMIT 1', agency.id);
  }
  setSetting(db, agency.id, 'dialer', { ...DIALER_DEFAULTS, my_timezone: 'Europe/London', demo_service_id: demoService.id });

  const L = addLeads(agency, AGENCY_LEADS);
  // What they told us before anyone called.
  const inbound = (c, channel, body, minutesAgo) => db.insert('messages', {
    id: id('msg'), org_id: c.org_id, contact_id: c.id, channel, direction: 'in', to_addr: null, from_addr: c.phone_e164, subject: null, body, status: 'received',
    provider: null, provider_id: null, error: null, template_key: null, related_type: null, related_id: null, send_after: null, read: 1, created_by: null, created_at: ago(minutesAgo), sent_at: null,
  });
  inbound(L.amir, 'sms', 'Hi, saw your ad. We miss loads of calls when we’re out on jobs and lose work to other sparkies. Can you help?', 8);
  inbound(L.olivia, 'email', 'We’re a 3-chair practice in Brooklyn. No-shows and reminder calls take hours every week – interested in automating it.', 33);
  inbound(L.tyler, 'sms', 'Quotes go out and we never hear back. Need a follow up system.', 60 * 5 - 3);
  inbound(L.hannah, 'sms', 'Saw your TikTok about DM auto replies – I get 50+ DMs a week and can’t keep up', 60 * 4 - 2);

  // Past calls with transcripts and outcomes.
  const call = (c, outcome, key, minutesAgo, openerKey, openerText, duration, notes) => {
    const t = key ? text(key) : '';
    const analysis = analyseTranscript(t, notes || '');
    db.insert('dial_calls', {
      id: id('dcl'), org_id: c.org_id, contact_id: c.id, user_id: callum.id, mode: 'phone', status: 'ended', outcome, opener_key: openerKey, opener_text: openerText,
      notes: notes || null, transcript: t, analysis: JSON.stringify(analysis), duration_seconds: duration, provider_id: null, recording_url: null, started_at: ago(minutesAgo), ended_at: ago(minutesAgo - Math.ceil(duration / 60)),
    });
    if (analysis.pains.length || analysis.budget || analysis.timeline) {
      const q = { pain_keys: analysis.pains.map((p) => p.key), pain: analysis.pains[0]?.label, objections: analysis.objections.map((o) => o.label), budget: analysis.budget, timeline: analysis.timeline, decision_maker: analysis.decision_maker, last_summary: analysis.summary, updated_at: now() };
      db.update('contacts', c.id, { qualification: JSON.stringify(Object.fromEntries(Object.entries(q).filter(([, v]) => v && (!Array.isArray(v) || v.length)))) });
    }
    db.insert('activities', { id: id('act'), org_id: c.org_id, contact_id: c.id, deal_id: null, type: 'call', body: `📞 ${outcome.replace(/_/g, ' ')}${analysis.summary ? ` – ${analysis.summary}` : ''}`, created_by: callum.id, created_at: ago(minutesAgo) });
    return analysis;
  };
  call(L.dave, 'booked', 'booked1', 60 * 24 * 6 - 20, 'form', 'Hi Dave, it’s Callum from CM Automations. You filled in our form about missed calls – have you got two minutes?', 420);
  call(L.sarah, 'booked', 'booked2', 60 * 24 * 3 - 5, 'speed', 'Hi Sarah, Callum here from CM Automations – I saw your enquiry come in and wanted to catch you while it’s fresh. Is now still a good time?', 380);
  call(L.marcus, 'interested', 'interested1', 60 * 24 * 2 - 30, 'source', 'Hi Marcus, it’s Callum from CM Automations – you got in touch through our website, so I wanted to give you a quick call. What made you get in touch?', 300, 'Practice manager. Wants info first, decision next month.');
  call(L.paul, 'not_interested', 'not_interested', 60 * 24 * 5 - 60, 'curiosity', 'Hi Paul, Callum from CM Automations – quick question: when someone calls you and you can’t pick up, what happens to that enquiry?', 60);
  call(L.jenna, 'callback', 'callback1', 60 * 23, 'referral', 'Hi Jenna, it’s Callum from CM Automations – you were recommended to us, so I thought I’d say hello personally. Is now an OK time?', 45);
  call(L.megan, 'no_answer', null, 60 * 25, 'source', null, 25);
  call(L.liam, 'no_answer', null, 60 * 29, 'permission', null, 20);
  call(L.liam, 'voicemail', null, 60 * 6, 'permission', null, 40);

  // What came of them: bookings, pages, call backs and sequences.
  const book = (c, daysAhead, hourUk) => {
    const d = new Date(Date.now() + daysAhead * 86400_000);
    d.setUTCHours(hourUk, 0, 0, 0);
    const b = { id: id('bkg'), org_id: agency.id, service_id: demoService.id, contact_id: c.id, staff_id: null, starts_at: d.toISOString(), ends_at: new Date(d.getTime() + demoService.duration_min * 60_000).toISOString(),
      status: 'confirmed', urgency: 'normal', source: 'phone', address: null, postcode: null, notes: 'Booked on a call from the dialer', customer_confirmed_at: null, reschedule_requested: 0, deposit_pence: 0, price_pence: 0,
      public_token: publicToken(), created_by: callum.id, created_at: now(), updated_at: now() };
    db.insert('bookings', b);
    return b;
  };
  const dealFor = (c, stage, value) => db.insert('deals', { id: id('deal'), org_id: agency.id, contact_id: c.id, title: `${c.company} – automations`, value, stage, owner_id: callum.id, expected_close: null, closed_at: null, created_at: now(), updated_at: now() });
  const pagesFor = (c, booking) => {
    const fresh = db.get('SELECT * FROM contacts WHERE id = ?', c.id);
    const demo = createPage(db, agency, fresh, 'demo', { highlights: [] });
    const conf = booking ? createPage(db, agency, fresh, 'confirmation', { booking_id: booking.id, demo_token: demo.token }) : null;
    return { demo, conf, contact: fresh };
  };
  const daveB = book(L.dave, 1, 10);
  const daveP = pagesFor(L.dave, daveB);
  db.update('lead_pages', daveP.conf.id, { viewed_at: ago(60 * 20) });
  dealFor(L.dave, 'qualified', 1500);
  const sarahB = book(L.sarah, 3, 14);
  const sarahP = pagesFor(L.sarah, sarahB);
  dealFor(L.sarah, 'qualified', 1200);
  createSequence(db, agency, sarahP.contact, 'booked', { booking: sarahB, vars: { first: 'Sarah', me: 'Callum', business: 'CM Automations', confirm_link: sarahP.conf.link, demo_link: sarahP.demo.link } });
  const marcusP = pagesFor(L.marcus, null);
  db.update('lead_pages', marcusP.demo.id, { viewed_at: ago(60 * 30) });
  dealFor(L.marcus, 'new', 900);
  const book_link = `#/book/${agency.slug}`;
  createSequence(db, agency, marcusP.contact, 'interested', {
    at: new Date(Date.now() - (60 * 24 * 2 - 30) * 60_000),
    vars: { first: 'Marcus', me: 'Callum', business: 'CM Automations', pain_line: ' showing how we’d fix no-shows and cancellations', pain_short: 'no-shows', demo_link: marcusP.demo.link, book_link },
  });
  // The first follow-up text went out after the call.
  db.run(`UPDATE sequence_steps SET status = 'done', result = 'Sent by text', done_at = due_at WHERE contact_id = ? AND step_no = 1`, L.marcus.id);
  // Jenna asked for a call back tomorrow afternoon, her time (UK).
  const jennaDue = nextGoodTime('Europe/London', { ...DIALER_DEFAULTS, best: [['16:00', '17:30']] }, 20);
  db.insert('callbacks', { id: id('cbk'), org_id: agency.id, contact_id: L.jenna.id, due_at: jennaDue, mode: 'call', status: 'pending', topic: 'Was with a client – call back in the afternoon', source: 'dialer', notified: 0, created_by: callum.id, created_at: ago(60 * 23), done_at: null });
  db.update('contacts', L.jenna.id, { next_dial_at: jennaDue, call_pref: 'call' });
  // Megan picked a call back on her page; Ryan asked to be texted instead.
  const meganDue = nextGoodTime('America/Chicago', DIALER_DEFAULTS, 2);
  db.insert('callbacks', { id: id('cbk'), org_id: agency.id, contact_id: L.megan.id, due_at: meganDue, mode: 'call', status: 'pending', topic: 'Chose this time on her call-back page', source: 'lead', notified: 0, created_by: null, created_at: ago(60 * 3), done_at: null });
  db.insert('callbacks', { id: id('cbk'), org_id: agency.id, contact_id: L.ryan.id, due_at: new Date(Date.now() + 90 * 60_000).toISOString(), mode: 'text', status: 'pending', topic: 'Replied “TEXT” – prefers messages', source: 'reply', notified: 0, created_by: null, created_at: ago(60), done_at: null });
  db.update('contacts', L.ryan.id, { call_pref: 'text' });
  // Liam: missed twice – the no-answer sequence is running and he's due another try.
  const liam = db.get('SELECT * FROM contacts WHERE id = ?', L.liam.id);
  createSequence(db, agency, liam, 'no_answer', { at: new Date(Date.now() - 60 * 29 * 60_000), vars: { first: 'Liam', me: 'Callum', business: 'CM Automations', callback_link: callbackPage(db, agency, liam).link } });
  db.update('contacts', L.liam.id, { next_dial_at: ago(30) });
  db.update('contacts', L.megan.id, { next_dial_at: meganDue });

  // Bright Path Coaching: a few coaching leads to call.
  if (bright) {
    setSetting(db, bright.id, 'dialer', { ...DIALER_DEFAULTS, my_timezone: 'Europe/London' });
    const B = addLeads(bright, COACH_LEADS);
    inbound(B.rachel, 'email', 'Downloaded your confidence guide. I’ve been in the same role 9 years and freeze in interviews – would love some help.', 22);
    inbound(B.nina, 'sms', 'Heard you on the podcast! Looking for a career coach, I’m in New York – do you work with people in the US?', 60 * 3 - 4);
  }

  // Everyone is enriched (including older demo contacts), and the script learns from the calls.
  for (const c of db.all('SELECT * FROM contacts')) enrichContact(db, c);
  recordScriptVersion(db, agency.id, 'Built from your first calls');
  return true;
}
