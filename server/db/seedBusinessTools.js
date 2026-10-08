import { addDays, addHours, id, now, publicToken } from '../lib/util.js';
import { setSetting } from '../lib/settings.js';
import { addLocalDays, localDate, zonedToUtc } from '../lib/time.js';
import { provisionOrganization } from '../modules/core/routes.js';
import { createContact } from '../modules/crm/service.js';
import { MESSAGING_DEFAULTS, handleInbound, handleMissedCall, sendMessage } from '../modules/messaging/service.js';
import { bookingDefaults, createBooking, setBookingStatus } from '../modules/bookings/service.js';
import { BILLING_DEFAULTS, createDocument, documentVars, getDocument, recordPayment, sendDocument } from '../modules/billing/service.js';
import { publicLink } from '../lib/links.js';
import { AGENCY_DEFAULTS, CLIENT_DEFAULTS, analyseAudit, generateReport, previousPeriod } from '../modules/agency/service.js';
import { suggestedTasks } from '../modules/agency/audit.js';
import { createTask } from '../modules/tasks/service.js';
import { parseJson } from './index.js';

/**
 * Demo data for the business tools: the agency (CM Automations) with its
 * clients, and a plumbing business whose phone and WhatsApp are linked in –
 * missed calls texted back, an emergency WhatsApp, bookings with reminders,
 * quotes, invoices being chased and a monthly report.
 */

const TZ = 'Europe/London';
const svg = (s) => `data:image/svg+xml;base64,${btoa(s)}`;
const SWIFT_LOGO = svg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#0e7490'/><path d='M32 11c-7 10-14 17-14 25a14 14 0 0 0 28 0c0-8-7-15-14-25z' fill='#fff'/><path d='M25 37a7 7 0 0 0 7 7' stroke='#0e7490' stroke-width='3.5' fill='none' stroke-linecap='round'/></svg>");

/** Moves a row's timestamps into the past so the demo has a believable history. */
const backdate = (db, table, rowId, iso, cols = ['created_at']) => db.run(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map(() => iso), rowId);
const hoursAgo = (h) => addHours(now(), -h);

export async function seedBusinessTools(db, engine, { owner, priya, user, clientOrgs }) {
  const ctx = { db, engine };

  // ── The agency ──
  const agency = provisionOrganization(db, { name: 'CM Automations', niche: 'agency', business_type: 'service', ownerId: owner.id, kind: 'agency' });
  db.insert('memberships', { org_id: agency.id, user_id: priya.id, role: 'admin' });
  db.update('organizations', agency.id, { brand: { display_name: 'CM Automations' } });
  setSetting(db, agency.id, 'agency', { ...AGENCY_DEFAULTS });
  setSetting(db, agency.id, 'messaging', { ...MESSAGING_DEFAULTS, email_from_name: 'CM Automations', email_reply_to: 'hello@cmautomations.com' });
  for (const [org, profile] of clientOrgs) {
    db.update('organizations', org.id, { agency_id: agency.id });
    setSetting(db, org.id, 'client_profile', { ...CLIENT_DEFAULTS, ...profile, started_at: addDays(now(), -75).slice(0, 10) });
  }

  // ── Swift Plumbing & Heating (a trade business on the phone and WhatsApp) ──
  const dave = user('Dave Hughes', 'dave@swiftplumbing.co.uk');
  const kyle = user('Kyle Bennett', 'kyle@swiftplumbing.co.uk');
  const swift = provisionOrganization(db, { name: 'Swift Plumbing & Heating', niche: 'local_services', business_type: 'service', ownerId: dave.id });
  db.insert('memberships', { org_id: swift.id, user_id: owner.id, role: 'admin' });
  db.insert('memberships', { org_id: swift.id, user_id: kyle.id, role: 'member' });
  db.update('organizations', swift.id, { agency_id: agency.id, brand: { display_name: 'Swift Plumbing & Heating', color: '#0e7490', logo: SWIFT_LOGO } });
  db.run('UPDATE organizations SET created_at = ? WHERE id = ?', addDays(now(), -60), swift.id);
  setSetting(db, swift.id, 'client_profile', { ...CLIENT_DEFAULTS, contact_name: 'Dave Hughes', email: 'dave@swiftplumbing.co.uk', phone: '+447700900001', monthly_fee_pence: 29900, hourly_cost_pence: 4500, started_at: addDays(now(), -60).slice(0, 10) });
  setSetting(db, swift.id, 'messaging', {
    ...MESSAGING_DEFAULTS, business_number: '+441174960123', whatsapp_number: '+441174960123', forward_to: '+447700900001',
    alert_channel: 'whatsapp', review_link: 'https://g.page/r/swift-plumbing-bristol/review', email_from_name: 'Swift Plumbing & Heating', email_reply_to: 'office@swiftplumbing.co.uk',
  });
  setSetting(db, swift.id, 'bookings', { ...bookingDefaults('local_services'), capacity: 2, calendar_token: publicToken() });
  setSetting(db, swift.id, 'billing', {
    ...BILLING_DEFAULTS, address: 'Unit 4, Avon Trade Park\nBristol BS2 0QF', bank_name: 'Starling Bank', account_name: 'Swift Plumbing & Heating Ltd',
    sort_code: '60-83-71', account_number: '12345678', company_number: '12345678', footer: 'Thank you for choosing Swift. All work guaranteed for 12 months.',
  });

  const service = (name, kind, duration, price, extra = {}) => {
    const row = { id: id('svc'), org_id: swift.id, name, description: extra.description || null, kind, duration_min: duration, buffer_min: extra.buffer ?? 30, price_pence: price, deposit_pence: extra.deposit || 0, online: extra.online === false ? 0 : 1, active: 1, position: extra.position || 0, created_at: now() };
    db.insert('services', row);
    return row;
  };
  const boiler = service('Annual boiler service', 'appointment', 60, 8500, { description: 'Gas Safe engineer, full safety check and certificate.', position: 1 });
  const leak = service('Leak or blockage call-out', 'callout', 90, 9500, { description: 'First 90 minutes on site. Parts charged at cost.', position: 2 });
  const quoteVisit = service('Free quote visit', 'quote_visit', 30, 0, { description: 'For new boilers, bathrooms and bigger jobs.', position: 3, buffer: 15 });
  const radiator = service('Radiator supply & fit', 'job', 180, 22000, { description: 'Supply and fit a new radiator, including valves.', deposit: 5000, position: 4 });
  service('Emergency call-out (out of hours)', 'callout', 60, 15000, { description: 'Book by phone or WhatsApp.', online: false, position: 5 });

  const people = {};
  const person = (key, first, last, phone, address, postcode, extra = {}) => {
    const { contact } = createContact(ctx, swift.id, { first_name: first, last_name: last, phone, address, postcode, email: extra.email || null, source: extra.source || 'Google', lifecycle: extra.lifecycle || 'customer', whatsapp_opt_in: extra.whatsapp ?? true, owner_id: dave.id }, { emit: false });
    backdate(db, 'contacts', contact.id, addDays(now(), -(extra.ageDays ?? 20)), ['created_at', 'updated_at']);
    people[key] = contact;
    return contact;
  };
  person('sarah', 'Sarah', 'Jones', '07700 900201', '12 Gloucester Road', 'BS7 8AE', { email: 'sarah.jones@example.com' });
  person('mark', 'Mark', 'Ellis', '07700 900202', '45 Coronation Road', 'BS3 1AS');
  person('priyaN', 'Priya', 'Nair', '07700 900203', '8 Redland Grove', 'BS6 6PR', { lifecycle: 'lead', source: 'Checkatrade' });
  person('james', 'James', 'O’Brien', '07700 900204', '22 St Marks Road', 'BS5 6JH', { email: 'james.obrien@example.com', whatsapp: false });
  person('emily', 'Emily', 'Carter', '07700 900205', '3 Clifton Down Road', 'BS8 4AD', { email: 'emily.carter@example.com' });
  person('tom', 'Tom', 'Fletcher', '07700 900206', '17 Wells Road', 'BS4 2AX', { email: 'tom.fletcher@example.com', lifecycle: 'prospect', source: 'Facebook', whatsapp: false });
  person('lucy', 'Lucy', 'Grant', '07700 900209', '9 Ashley Road', 'BS6 5NL', { email: 'lucy.grant@example.com', ageDays: 40 });
  person('robert', 'Robert', 'Hill', '07700 900210', '31 Ridgeway Road', 'BS16 3EA', { email: 'rob.hill@example.com', ageDays: 35 });
  person('olivia', 'Olivia', 'Shaw', '07700 900211', '5 Mina Road', 'BS2 9YJ', { ageDays: 25 });

  const today = localDate(new Date(), TZ);
  const at = (dayOffset, time) => zonedToUtc(addLocalDays(today, dayOffset), time, TZ);
  const book = async (who, svc, dayOffset, time, extra = {}) => {
    // Seeded online bookings skip the live availability check (the demo can be seeded on a Sunday).
    const { booking } = await createBooking(ctx, swift.id, { service_id: svc.id, starts_at: at(dayOffset, time), contact_id: people[who].id, address: people[who].address, postcode: people[who].postcode, staff_id: extra.staff || dave.id, notes: extra.notes || null, urgency: extra.urgency, notify: extra.notify ?? true }, { actorId: 'actor' in extra ? extra.actor : dave.id, source: extra.source === 'online' ? 'manual' : extra.source || 'phone' });
    if (extra.source === 'online') db.update('bookings', booking.id, { source: 'online', customer_confirmed_at: booking.created_at });
    if (extra.createdHoursAgo) backdate(db, 'bookings', booking.id, hoursAgo(extra.createdHoursAgo), ['created_at', 'updated_at']);
    return booking;
  };

  // Last month's calls, bookings and payments, so the monthly report has real numbers.
  const lastMonth = previousPeriod(TZ);
  let historyInvoices = 0;
  for (let i = 0; i < 9; i++) {
    const when = zonedToUtc(`${lastMonth}-${String(3 + i * 3).padStart(2, '0')}`, '11:00', TZ);
    db.insert('calls', { id: id('cal'), org_id: swift.id, contact_id: null, from_number: `+4477009003${String(10 + i)}`, to_number: '+441174960123', status: i % 3 ? 'missed' : 'answered', duration_seconds: i % 3 ? null : 95, recording_url: null, provider_id: null, texted_back: i % 3 ? 1 : 0, handled: 1, created_at: when });
    const c = createContact(ctx, swift.id, { first_name: ['Amir', 'Beth', 'Carl', 'Dina', 'Ewan', 'Faye', 'Gus', 'Hollie', 'Ian'][i], last_name: ['Khan', 'Morris', 'Doyle', 'Ahmed', 'Price', 'Little', 'Brennan', 'Webb', 'Fraser'][i], phone: `07700 900${320 + i}`, source: ['Phone call', 'WhatsApp', 'Online booking'][i % 3], lifecycle: 'customer' }, { emit: false }).contact;
    backdate(db, 'contacts', c.id, when, ['created_at', 'updated_at', 'last_contacted_at']);
    const b = { id: id('bkg'), org_id: swift.id, service_id: [boiler, leak, radiator][i % 3].id, contact_id: c.id, staff_id: i % 2 ? kyle.id : dave.id, starts_at: addDays(when, 2), ends_at: addHours(addDays(when, 2), 1), status: i === 4 ? 'no_show' : 'completed', urgency: 'normal', source: ['phone', 'whatsapp', 'online'][i % 3], customer_confirmed_at: when, reschedule_requested: 0, deposit_pence: 0, price_pence: [8500, 9500, 22000][i % 3], public_token: publicToken(), check_notified: 1, created_at: when, updated_at: when, completed_at: i === 4 ? null : addDays(when, 2), reminder_24h_at: addDays(when, 1), reminder_2h_at: addDays(when, 2) };
    db.insert('bookings', b);
    db.insert('messages', { id: id('msg'), org_id: swift.id, contact_id: c.id, channel: i % 2 ? 'whatsapp' : 'sms', direction: 'out', to_addr: c.phone_e164, from_addr: '+441174960123', subject: null, body: `Hi ${c.first_name}, a reminder that we’re booked for ${[boiler, leak, radiator][i % 3].name} tomorrow at 11am. Reply C to confirm or R to rearrange. – Swift Plumbing & Heating`, status: 'demo', provider: 'demo', provider_id: null, error: null, template_key: 'booking_reminder_24h', related_type: 'booking', related_id: b.id, send_after: null, read: 1, created_by: null, created_at: addDays(when, 1), sent_at: addDays(when, 1) });
    if (i !== 4) {
      historyInvoices++;
      const svcName = [boiler, leak, radiator][i % 3].name;
      const inv = { id: id('inv'), org_id: swift.id, kind: 'invoice', purpose: 'standard', number: `INV-${String(historyInvoices).padStart(4, '0')}`, contact_id: c.id, deal_id: null, booking_id: b.id, status: 'paid', title: svcName, issue_date: addDays(when, 2).slice(0, 10), due_date: addDays(when, 16).slice(0, 10), line_items: [{ description: svcName, quantity: 1, unit_pence: b.price_pence, vat_rate: 0, total_pence: b.price_pence, vat_pence: 0 }], subtotal_pence: b.price_pence, vat_pence: 0, total_pence: b.price_pence, paid_pence: b.price_pence, public_token: publicToken(), chase: 1, reminders_sent: i % 4 === 0 ? 1 : 0, followed_up: 0, created_at: addDays(when, 2), updated_at: addDays(when, 5), sent_at: addDays(when, 2), paid_at: addDays(when, 5) };
      db.insert('invoices', inv);
      db.insert('payments', { id: id('pay'), org_id: swift.id, invoice_id: inv.id, amount_pence: inv.total_pence, method: i % 2 ? 'card' : 'bank_transfer', reference: null, provider_id: null, created_by: null, created_at: addDays(when, 5) });
    }
  }
  // New invoices carry on from the old numbers.
  db.run(`INSERT INTO org_meta (org_id, key, value) VALUES (?, 'counter:invoice', ?) ON CONFLICT(org_id, key) DO UPDATE SET value = excluded.value`, swift.id, String(historyInvoices));

  // Past jobs: done, invoiced (one paid by card, one overdue and being chased), one no-show.
  const robertJob = await book('robert', leak, -9, '10:00', { notes: 'Leaking kitchen waste pipe', createdHoursAgo: 24 * 10 });
  await setBookingStatus(ctx, swift.id, robertJob.id, 'completed', { actorId: dave.id });
  const lucyJob = await book('lucy', boiler, -12, '09:00', { createdHoursAgo: 24 * 16 });
  await setBookingStatus(ctx, swift.id, lucyJob.id, 'completed', { actorId: kyle.id, notify: false });
  const oliviaJob = await book('olivia', boiler, -5, '15:00', { createdHoursAgo: 24 * 9, staff: kyle.id });
  await setBookingStatus(ctx, swift.id, oliviaJob.id, 'no_show', { actorId: kyle.id });

  for (const [job, ago] of [[robertJob, 9], [lucyJob, 12], [oliviaJob, 5]]) {
    db.run(`UPDATE messages SET created_at = ?, sent_at = ?, send_after = NULL, status = 'demo' WHERE related_type = 'booking' AND related_id = ?`, addDays(now(), -ago), addDays(now(), -ago), job.id);
  }
  const invoices = parseJson(db.all(`SELECT * FROM invoices WHERE org_id = ? AND kind = 'invoice' ORDER BY created_at`, swift.id), 'line_items');
  const robertInv = invoices.find((i) => i.booking_id === robertJob.id);
  const lucyInv = invoices.find((i) => i.booking_id === lucyJob.id) || createDocument(ctx, swift.id, { kind: 'invoice', contact_id: people.lucy.id, booking_id: lucyJob.id, title: 'Annual boiler service', line_items: [{ description: 'Annual boiler service', quantity: 1, unit_pence: 8500 }, { description: 'Replacement pressure relief valve', quantity: 1, unit_pence: 6000 }] }, { actorId: dave.id });
  if (robertInv) {
    db.update('invoices', robertInv.id, { line_items: [{ description: 'Leak repair – kitchen waste pipe', quantity: 1, unit_pence: 9500, vat_rate: 0, total_pence: 9500, vat_pence: 0 }, { description: 'Parts: 40mm waste fittings', quantity: 1, unit_pence: 1850, vat_rate: 0, total_pence: 1850, vat_pence: 0 }], subtotal_pence: 11350, total_pence: 11350 });
    await sendDocument(ctx, swift.id, robertInv.id, { actorId: dave.id });
    await recordPayment(ctx, swift.id, robertInv.id, { amount_pence: 11350, method: 'card', provider_id: 'demo_seed_card_1', reference: 'Paid online by card' });
    db.run('UPDATE invoices SET created_at = ?, issue_date = ?, due_date = ?, sent_at = ?, paid_at = ? WHERE id = ?', addDays(now(), -9), addDays(now(), -9).slice(0, 10), addDays(now(), 5).slice(0, 10), addDays(now(), -9), addDays(now(), -8), robertInv.id);
    db.run('UPDATE payments SET created_at = ? WHERE invoice_id = ?', addDays(now(), -8), robertInv.id);
  }
  db.update('invoices', lucyInv.id, { line_items: [{ description: 'Annual boiler service', quantity: 1, unit_pence: 8500, vat_rate: 0, total_pence: 8500, vat_pence: 0 }, { description: 'Replacement pressure relief valve', quantity: 1, unit_pence: 6000, vat_rate: 0, total_pence: 6000, vat_pence: 0 }], subtotal_pence: 14500, total_pence: 14500 });
  await sendDocument(ctx, swift.id, lucyInv.id, { actorId: dave.id });
  db.run(`UPDATE invoices SET status = 'overdue', created_at = ?, issue_date = ?, sent_at = ?, due_date = ?, reminders_sent = 1, last_reminder_at = ? WHERE id = ?`,
    addDays(now(), -12), addDays(now(), -12).slice(0, 10), addDays(now(), -12), addDays(now(), -3).slice(0, 10), addDays(now(), -2), lucyInv.id);
  const swiftOrg = db.get('SELECT * FROM organizations WHERE id = ?', swift.id);
  await sendMessage(ctx, swift.id, { contactId: people.lucy.id, template: 'invoice_reminder_1', vars: documentVars(getDocument(db, swift.id, lucyInv.id), swiftOrg), related: { type: 'invoice', id: lucyInv.id }, force: true });
  db.run(`UPDATE messages SET created_at = ?, sent_at = ? WHERE related_id = ? AND template_key = 'invoice_reminder_1'`, addDays(now(), -2), addDays(now(), -2), lucyInv.id);
  db.run(`UPDATE messages SET created_at = ?, sent_at = ? WHERE related_id = ? AND template_key = 'invoice_sent'`, addDays(now(), -12), addDays(now(), -12), lucyInv.id);

  // Those two invoices have gone out, so their "check & send" tasks are done.
  db.run(`UPDATE tasks SET status = 'done', completed_at = ? WHERE org_id = ? AND (title LIKE ? OR title LIKE ?)`, addDays(now(), -8), swift.id, `Check & send invoice ${robertInv?.number}%`, `Check & send invoice ${lucyInv.number}%`);

  // A quote for a new boiler, sent and waiting.
  const deal = { id: id('del'), org_id: swift.id, contact_id: people.tom.id, title: 'New combi boiler – Tom Fletcher', value: 2150, stage: 'proposal', owner_id: dave.id, expected_close: addDays(now(), 10).slice(0, 10), created_at: addDays(now(), -4), updated_at: addDays(now(), -2) };
  db.insert('deals', deal);
  const quote = createDocument(ctx, swift.id, { kind: 'quote', contact_id: people.tom.id, deal_id: deal.id, title: 'New combi boiler – supply & fit', notes: 'Includes removal of the old boiler, system flush and Gas Safe certificate. 10-year manufacturer warranty.', line_items: [
    { description: 'Worcester Bosch Greenstar 4000 30kW combi boiler', quantity: 1, unit_pence: 135000 },
    { description: 'Magnetic system filter', quantity: 1, unit_pence: 12000 },
    { description: 'Labour – remove old boiler, fit and commission (2 days)', quantity: 2, unit_pence: 34000 },
  ] }, { actorId: dave.id });
  await sendDocument(ctx, swift.id, quote.id, { actorId: dave.id });
  db.run('UPDATE invoices SET created_at = ?, sent_at = ?, issue_date = ? WHERE id = ?', addDays(now(), -2), addDays(now(), -2), addDays(now(), -2).slice(0, 10), quote.id);
  db.run(`UPDATE messages SET created_at = ?, sent_at = ? WHERE related_id = ?`, addDays(now(), -2), addDays(now(), -2), quote.id);

  // Today's jobs and the next few days.
  const nowMs = Date.now();
  const sarahJob = await book('sarah', boiler, 0, '09:00', { createdHoursAgo: 24 * 6, notes: 'Combi boiler in the loft – ladder on the landing' });
  const markJob = await book('mark', leak, 0, '13:30', { createdHoursAgo: 26, staff: kyle.id, notes: 'Dripping under the bath. Side gate code 1925.' });
  for (const job of [sarahJob, markJob]) {
    db.run('UPDATE messages SET created_at = ?, sent_at = ? WHERE related_id = ?', hoursAgo(24 * (job === sarahJob ? 6 : 1) + 2), hoursAgo(24 * (job === sarahJob ? 6 : 1) + 2), job.id);
    if (new Date(job.ends_at).getTime() < nowMs) await setBookingStatus(ctx, swift.id, job.id, 'completed', { actorId: job.staff_id });
    else db.update('bookings', job.id, { customer_confirmed_at: hoursAgo(20), reminder_24h_at: hoursAgo(22) });
  }
  const priyaJob = await book('priyaN', quoteVisit, 1, '10:00', { createdHoursAgo: 50, source: 'online', actor: null, notes: 'Thinking about moving the bathroom upstairs – would like a quote.' });
  const jamesJob = await book('james', boiler, 1, '14:00', { createdHoursAgo: 72, staff: kyle.id });
  const emilyJob = await book('emily', radiator, 2, '11:00', { createdHoursAgo: 96, notes: 'Replace the living room radiator (1200mm double panel).' });
  for (const job of [priyaJob, jamesJob, emilyJob]) {
    db.run('UPDATE messages SET created_at = ?, sent_at = ? WHERE related_id = ?', hoursAgo(job === priyaJob ? 50 : job === jamesJob ? 72 : 96), hoursAgo(job === priyaJob ? 50 : job === jamesJob ? 72 : 96), job.id);
  }

  // Customers replying on WhatsApp: Priya confirms (C), Emily asks to rearrange (R).
  await handleInbound(ctx, swift.id, { channel: 'whatsapp', from: '+447700900203', to: '+441174960123', body: 'C', profileName: 'Priya Nair' });
  db.run(`UPDATE messages SET created_at = ?, sent_at = CASE WHEN direction = 'out' THEN ? END WHERE contact_id = ? AND created_at > ?`, hoursAgo(20), hoursAgo(20), people.priyaN.id, hoursAgo(1));
  db.update('bookings', priyaJob.id, { customer_confirmed_at: hoursAgo(20) });
  await handleInbound(ctx, swift.id, { channel: 'whatsapp', from: '+447700900205', to: '+441174960123', body: 'R', profileName: 'Emily Carter' });
  db.run(`UPDATE messages SET created_at = ?, sent_at = CASE WHEN direction = 'out' THEN ? END WHERE contact_id = ? AND created_at > ?`, hoursAgo(4), hoursAgo(4), people.emily.id, hoursAgo(1));

  // A quote request by text that Dave has already answered.
  await handleInbound(ctx, swift.id, { channel: 'sms', from: '+447700900206', to: '+441174960123', body: 'Hi, our boiler is 15 years old and keeps losing pressure. Could you quote for a new combi? Tom, BS4 2AX' });
  await sendMessage(ctx, swift.id, { contactId: people.tom.id, channel: 'sms', body: 'Hi Tom, thanks for getting in touch. I’ve sent your quote over by email – any questions just give me a shout. Dave', actorId: dave.id, audience: 'system', force: true });
  db.run(`UPDATE tasks SET status = 'done', completed_at = ? WHERE org_id = ? AND source_ref = ? AND title LIKE 'Reply to%'`, addDays(now(), -2), swift.id, people.tom.id);
  db.run(`UPDATE messages SET created_at = ?, read = 1 WHERE contact_id = ? AND direction = 'in'`, addDays(now(), -3), people.tom.id);
  db.run(`UPDATE messages SET created_at = ?, sent_at = ? WHERE contact_id = ? AND direction = 'out' AND template_key IS NULL`, hoursAgo(24 * 2 + 1), hoursAgo(24 * 2 + 1), people.tom.id);

  // A missed call this morning: texted straight back.
  const missed = await handleMissedCall(ctx, swift.id, { from: '+447700900208', to: '+441174960123', providerId: 'CA_demo_1' });
  backdate(db, 'calls', missed.call.id, hoursAgo(0.4));
  db.run('UPDATE messages SET created_at = ?, sent_at = ? WHERE related_id = ?', hoursAgo(0.4), hoursAgo(0.4), missed.call.id);
  const answered = await handleMissedCall(ctx, swift.id, { from: '+447700900202', to: '+441174960123', providerId: 'CA_demo_2', status: 'answered', duration: 140 });
  backdate(db, 'calls', answered.call.id, hoursAgo(27));

  // And an emergency on WhatsApp a few minutes ago – not answered yet.
  await handleInbound(ctx, swift.id, { channel: 'whatsapp', from: '+447700900207', to: '+441174960123', profileName: 'Hannah Price', body: 'Hi, water is pouring through our kitchen ceiling – think a pipe has burst in the bathroom upstairs!! Can someone come today? 14 Cotham Hill, BS6 6LA' });
  const hannahMsg = db.get(`SELECT m.id, m.contact_id FROM messages m JOIN contacts c ON c.id = m.contact_id WHERE c.org_id = ? AND c.phone_e164 = '+447700900207' AND m.direction = 'in'`, swift.id);
  backdate(db, 'messages', hannahMsg.id, hoursAgo(0.1));
  db.update('contacts', hannahMsg.contact_id, { address: '14 Cotham Hill', postcode: 'BS6 6LA' });


  // A booking that came in online earlier, for next week.
  const { contact: ben } = createContact(ctx, swift.id, { first_name: 'Ben', last_name: 'Taylor', phone: '07700 900212', email: 'ben.taylor@example.com', source: 'Online booking', whatsapp_opt_in: true }, { emit: false });
  people.ben = ben;
  const benJob = await book('ben', boiler, 6, '08:30', { source: 'online', actor: null, createdHoursAgo: 3, staff: null });
  db.run('UPDATE messages SET created_at = ?, sent_at = ? WHERE related_id = ?', hoursAgo(3), hoursAgo(3), benJob.id);

  // A website form for quotes.
  db.insert('forms', {
    id: id('frm'), org_id: swift.id, name: 'Website – free quote', title: 'Get a free, no-obligation quote', intro: 'Tell us what you need and we’ll get back to you the same day.',
    fields: [
      { key: 'first_name', label: 'First name', type: 'text', required: true }, { key: 'phone', label: 'Mobile', type: 'tel', required: true },
      { key: 'email', label: 'Email', type: 'email', required: false }, { key: 'postcode', label: 'Postcode', type: 'postcode', required: true },
      { key: 'job', label: 'What do you need?', type: 'select', required: true, options: ['New boiler', 'Boiler repair or service', 'Leak or blockage', 'Bathroom', 'Radiators', 'Something else'] },
      { key: 'details', label: 'Anything else we should know?', type: 'textarea', required: false },
    ],
    button_label: 'Get my quote', thank_you: 'Thanks! We’ll be in touch today – usually within the hour.', send_thank_you: 1, tags: ['website'], active: 1, submissions: 3, created_at: addDays(now(), -50), updated_at: addDays(now(), -1),
  });
  const formId = db.get('SELECT id FROM forms WHERE org_id = ?', swift.id).id;
  for (const [who, job, details, daysAgo] of [['tom', 'New boiler', 'Boiler is 15 years old and losing pressure.', 3], ['priyaN', 'Bathroom', 'Thinking of moving the bathroom upstairs.', 4], ['james', 'Boiler repair or service', 'Annual service please – any weekday afternoon.', 6]]) {
    const p = people[who];
    db.insert('form_submissions', { id: id('sub'), form_id: formId, org_id: swift.id, contact_id: p.id, data: { first_name: p.first_name, phone: p.phone, email: p.email || '', postcode: p.postcode, job, details }, created_at: addDays(now(), -daysAgo) });
  }

  // Two months of work done by the system, for the dashboard, control centre and report.
  const runs = [
    ['Missed-call text-back', 'call.missed', 'Texted the caller back and made a call-back task', 4],
    ['Booking reminder', 'booking.reminder', 'Day-before reminder sent', 3],
    ['Booking reminder', 'booking.reminder', '2-hour reminder sent', 2],
    ['Booking', 'booking.created', 'Booked online – contact created, confirmation sent', 10],
    ['Invoice chaser', 'invoice.overdue', 'Friendly reminder sent', 8],
    ['New lead → welcome call task', 'contact.created', 'Created task · Follow-up set · Logged activity', 7],
    ['Morning job sheet', 'schedule.daily', 'Sent today’s jobs to the team', 10],
    ['Job done → draft the invoice', 'booking.completed', 'Drafted invoice', 10],
    ['On-my-way text', 'booking.on_the_way', 'Told the customer we’re on the way', 2],
    ['Card payment', 'invoice.paid', 'Paid online and matched automatically', 5],
  ];
  for (let day = 58; day >= 1; day--) {
    const count = day % 7 === 0 ? 2 : 5 + (day % 4);
    for (let i = 0; i < count; i++) {
      const [name, event, detail, minutes] = runs[(day * 3 + i) % runs.length];
      db.insert('automation_runs', { id: id('run'), org_id: swift.id, automation_id: null, name, event, status: 'success', detail, minutes_saved: minutes, created_at: addHours(addDays(now(), -day), 7 + i * 1.5) });
    }
  }
  // Somebody on the team still has a couple of things to do.
  createTask(ctx, swift.id, { title: 'Order Worcester Bosch boiler for Tom Fletcher (if he accepts)', priority: 'medium', due_at: addDays(now(), 3), assignee_id: dave.id, source: 'crm', source_ref: people.tom.id });
  createTask(ctx, swift.id, { title: 'Renew Gas Safe registration', priority: 'high', due_at: addDays(now(), -1), assignee_id: dave.id });

  // ── Bright Path (coaching) gets bookable sessions too ──
  const [brightPath] = clientOrgs[0];
  setSetting(db, brightPath.id, 'bookings', { ...bookingDefaults('coaching'), calendar_token: publicToken() });
  for (const [name, mins, price, pos] of [['Free discovery call', 30, 0, 1], ['Career strategy session', 90, 15000, 2]]) {
    db.insert('services', { id: id('svc'), org_id: brightPath.id, name, description: null, kind: 'appointment', duration_min: mins, buffer_min: 15, price_pence: price, deposit_pence: 0, online: 1, active: 1, position: pos, created_at: now() });
  }

  // ── Agency audits & proposals ──
  const auditRow = (data) => {
    const row = { id: id('aud'), org_id: agency.id, contact_email: null, contact_phone: null, team_size: 1, hourly_cost_pence: 3500, discovery: {}, analysis: {}, proposal: {}, status: 'draft', public_token: publicToken(), client_org_id: null, created_by: owner.id, created_at: addDays(now(), -5), updated_at: addDays(now(), -1), ...data };
    db.insert('audits', row);
    return row;
  };
  const swiftAudit = auditRow({
    client_name: 'Swift Plumbing & Heating', contact_name: 'Dave Hughes', contact_email: 'dave@swiftplumbing.co.uk', contact_phone: '07700 900001', niche: 'local_services', team_size: 2, hourly_cost_pence: 4500,
    setup_fee_pence: 120000, monthly_fee_pence: 29900, status: 'accepted', client_org_id: swift.id, created_at: addDays(now(), -70), sent_at: addDays(now(), -66), accepted_at: addDays(now(), -62), accepted_by: 'Dave Hughes',
    discovery: { goals: 'Stop losing jobs while I’m on the tools, and get my evenings back.', frustrations: 'Evenings doing quotes and invoices; calls I can’t answer under a sink.', tools: 'WhatsApp, paper diary, Xero', lead_sources: 'Phone, WhatsApp, Checkatrade, Facebook', enquiries_per_week: 25, missed_calls_per_week: 12, response_time: 'Same evening', avg_job_value: 240, no_shows_per_month: 4, unpaid_invoices: 3200 },
    tasks: suggestedTasks('local_services').map((t) => ({ ...t, per_week: t.key === 'missed_calls' ? 12 : t.per_week, pain: ['missed_calls', 'quotes', 'chasing'].includes(t.key) ? 5 : t.pain })),
  });
  analyseAudit(db, agency, swiftAudit.id, { preparedBy: 'Alex Morgan' });
  const sparks = auditRow({
    client_name: 'Bright Sparks Electrical', contact_name: 'Gemma Lewis', contact_email: 'gemma@brightsparks-electrical.co.uk', contact_phone: '07700 900051', niche: 'local_services', team_size: 3, hourly_cost_pence: 4000,
    setup_fee_pence: 150000, monthly_fee_pence: 34900, status: 'proposal_sent', sent_at: addDays(now(), -2),
    discovery: { goals: 'Grow to 5 electricians without hiring an office manager.', frustrations: 'Chasing payments and juggling the diary on WhatsApp.', tools: 'WhatsApp, Google Calendar, QuickBooks', lead_sources: 'Google, Checkatrade, word of mouth', enquiries_per_week: 30, missed_calls_per_week: 15, response_time: 'Next morning', avg_job_value: 320, no_shows_per_month: 3, unpaid_invoices: 5400 },
    tasks: suggestedTasks('local_services').map((t) => ({ ...t, people: ['job_sheets', 'team_chasing'].includes(t.key) ? 2 : 1 })),
  });
  analyseAudit(db, agency, sparks.id, { preparedBy: 'Alex Morgan' });
  auditRow({ client_name: 'Harbour View Dental', contact_name: 'Dr Sam Patel', niche: 'beauty', setup_fee_pence: 180000, monthly_fee_pence: 39900, tasks: suggestedTasks('beauty') });
  const sent = await sendMessage(ctx, agency.id, { to: 'gemma@brightsparks-electrical.co.uk', channel: 'email', template: 'proposal_sent', vars: { first_name_spaced: ' Gemma', first_name: 'Gemma', doc_link: publicLink(`proposal/${sparks.public_token}`) }, force: true, related: { type: 'audit', id: sparks.id } });
  if (sent.message) backdate(db, 'messages', sent.message.id, addDays(now(), -2), ['created_at', 'sent_at']);

  // The agency's own system does work too (proposals, new client set-ups, reports).
  for (let day = 40; day >= 1; day -= 3) {
    const [name, event, detail, minutes] = [['Monthly reports', 'report.generated', 'Reports built for 3 clients', 135], ['New lead → welcome call task', 'contact.created', 'Created task · Follow-up set', 7], ['Proposal follow-up', 'deal.stage_changed', 'Created task', 4], ['Daily digest', 'schedule.daily', 'Sent everyone their plan for the day', 10]][day % 4];
    db.insert('automation_runs', { id: id('run'), org_id: agency.id, automation_id: null, name, event, status: 'success', detail, minutes_saved: minutes, created_at: addHours(addDays(now(), -day), 9) });
  }

  // ── Last month's reports: Swift's has gone out, Bright Path's is waiting for review ──
  const swiftReport = generateReport(db, db.get('SELECT * FROM organizations WHERE id = ?', swift.id), lastMonth);
  db.update('reports', swiftReport.id, { status: 'sent', sent_at: addDays(now(), -6) });
  generateReport(db, db.get('SELECT * FROM organizations WHERE id = ?', brightPath.id), lastMonth);
  createTask(ctx, agency.id, { title: 'Review & send last month’s report for Bright Path Coaching', priority: 'medium', due_at: addDays(now(), 1), assignee_id: owner.id, source: 'automation' });
  createTask(ctx, agency.id, { title: 'Follow up proposal with Gemma (Bright Sparks Electrical)', priority: 'high', due_at: addDays(now(), 1), assignee_id: owner.id, source: 'crm' });

  return { agency, swift, dave, kyle };
}
