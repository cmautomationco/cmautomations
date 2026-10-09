import { parseJson } from '../../db/index.js';
import { formatClock, formatDay, localDate, zonedToUtc } from '../../lib/time.js';
import { id, now } from '../../lib/util.js';
import { alertStaff, baseVars, bookingVars, closeReplyTasks, ensureTask, sendMessage } from '../messaging/service.js';
import { ACTIVE, availableDays, createBooking, getBooking, getBookingSettings, listServices, setBookingStatus, slotsFor, updateBooking } from './service.js';

/**
 * The WhatsApp (and text) booking assistant. Customers book, move or cancel
 * by replying with numbers – no app, no website:
 *
 *   Customer: BOOK
 *   Business: What do you need? 1. Boiler service (£85)  2. Leak call-out (£95) …
 *   Customer: 1   → days → times → name / address / problem → YES → booked
 *
 * Replying R to a reminder offers new times; CANCEL cancels (within the
 * notice period). Anything it can't follow is handed to a person.
 */

const EXPIRES_MINUTES = 120;
const BOOK_START = /^(book|booking|book in|book me in|book a|book an|i'?d like to book|can i book|appointment|availability|any availability|free slots?|slots?)\b/i;
const RESCHEDULE = /^(r|reschedule|rearrange|change|change it|move|move it|can we change|different time)[.!]*$/i;
const CANCEL = /^(cancel|cancel it|cancel booking|cancel my booking|x)[.!]*$/i;
const YES = /^(y|yes|yep|yeah|yes please|ok|okay|confirm|book it|go ahead|sounds good|perfect|👍)[.! ]*$/i;
const NO = /^(n|no|nope|no thanks|change|another time|different time)[.! ]*$/i;
const EXIT = /^(0|exit|quit|nevermind|never mind|no thanks|forget it)[.! ]*$/i;
const SKIP = /^(skip|none|no|n\/a|-)[.! ]*$/i;
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const PLACEHOLDER = /^(new contact|caller|whatsapp enquiry|text enquiry|website enquiry)$/i;

function getConversation(db, orgId, contactId) {
  const conv = parseJson(db.get('SELECT * FROM conversations WHERE org_id = ? AND contact_id = ?', orgId, contactId), 'data');
  if (!conv) return null;
  if (Date.now() - new Date(conv.updated_at).getTime() > EXPIRES_MINUTES * 60_000) {
    db.run('DELETE FROM conversations WHERE id = ?', conv.id);
    return null;
  }
  return conv;
}

function saveConversation(db, conv) {
  const ts = now();
  if (db.get('SELECT 1 FROM conversations WHERE id = ?', conv.id)) {
    db.update('conversations', conv.id, { step: conv.step, data: conv.data, misses: conv.misses || 0, updated_at: ts, channel: conv.channel });
  } else {
    db.run('DELETE FROM conversations WHERE org_id = ? AND contact_id = ?', conv.org_id, conv.contact_id);
    db.insert('conversations', { ...conv, misses: conv.misses || 0, created_at: ts, updated_at: ts });
  }
}
const endConversation = (db, conv) => db.run('DELETE FROM conversations WHERE id = ?', conv.id);

/** Matches a reply to a numbered option, or to words in it ("friday", "10am", "boiler"). */
export function pickOption(text, options) {
  const t = String(text).trim().toLowerCase().replace(/[.!]+$/, '');
  if (/^\d{1,2}$/.test(t)) return options[Number(t) - 1] || null;
  const hits = options.filter((o) => (o.keys || []).includes(t) || (t.length >= 3 && o.label.toLowerCase().includes(t)));
  return hits.length === 1 ? hits[0] : null;
}

const numbered = (options) => options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
const money = (p) => `£${(p / 100).toFixed(p % 100 ? 2 : 0)}`;

/** Up to n items spread across a list (so morning and afternoon times both show). */
function spread(list, n) {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]);
}

function timeKeys(label) {
  const m = label.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (!m) return [label];
  const h12 = Number(m[1]);
  const h24 = (h12 % 12) + (m[3] === 'pm' ? 12 : 0);
  const mm = m[2] || '00';
  return [label, `${h12}${m[3]}`, `${h12}:${mm}`, `${h12}.${mm}`, `${h24}:${mm}`, `${h24}.${mm}`, ...(mm === '00' ? [String(h12), String(h24)] : [])];
}

export function createChat(ctx) {
  const { db } = ctx;

  async function say(org, contact, channel, template, vars = {}, related = null) {
    return sendMessage(ctx, org.id, { contact, channel, template, vars, audience: 'system', force: true, strict: true, related: related || { type: 'assistant', id: contact.id } });
  }

  function serviceOptions(org) {
    return listServices(db, org.id, { onlineOnly: true }).map((s) => ({
      value: s.id, label: `${s.name}${s.price_pence ? ` (${money(s.price_pence)})` : s.kind === 'quote_visit' ? ' (free)' : ''}`, keys: [s.name.toLowerCase()],
    }));
  }

  function dayOptions(org, service, settings, excludeId = null) {
    const tz = org.timezone;
    const today = localDate(new Date(), tz);
    return availableDays(db, org, service, settings, { days: Math.min(21, settings.max_days_ahead + 1) })
      .filter((d) => (excludeId ? slotsFor(db, org, service, d.date, settings, { excludeId }).length : d.slots) > 0)
      .slice(0, 7)
      .map((d) => {
        const weekday = formatDay(zonedToUtc(d.date, '12:00', tz), tz).split(' ')[0].toLowerCase();
        const keys = [weekday, d.label.toLowerCase(), ...(d.date === today ? ['today'] : []), ...(d.date === addOneDay(today) ? ['tomorrow', 'tmrw', 'tomoz'] : [])];
        return { value: d.date, label: d.date === today ? `Today (${d.label})` : d.date === addOneDay(today) ? `Tomorrow (${d.label})` : d.label, keys };
      });
  }

  function timeOptions(org, service, settings, date, excludeId = null) {
    return spread(slotsFor(db, org, service, date, settings, { excludeId }), 8).map((s) => ({ value: s.starts_at, label: s.label, keys: timeKeys(s.label) }));
  }

  /** Starts a conversation. flow: book | reschedule | cancel */
  async function start(org, contact, channel, flow, { booking = null } = {}) {
    const settings = getBookingSettings(db, org);
    const conv = { id: id('cnv'), org_id: org.id, contact_id: contact.id, channel, flow, step: '', data: {}, misses: 0 };
    if (flow === 'cancel') {
      conv.step = 'confirm_cancel';
      conv.data.booking_id = booking.id;
      saveConversation(db, conv);
      await say(org, contact, channel, 'chat_cancel_confirm', bookingVars(booking, { name: booking.service_name }, org.timezone), { type: 'booking', id: booking.id });
      return 'chat_cancel_asked';
    }
    if (flow === 'reschedule') {
      conv.data.booking_id = booking.id;
      conv.data.service_id = booking.service_id;
      const out = await askDay(org, contact, conv, settings);
      return out === 'chat_handoff' ? out : 'chat_started';
    }
    const services = serviceOptions(org);
    if (!services.length) return null;
    if (services.length === 1) {
      conv.data.service_id = services[0].value;
      const out = await askDay(org, contact, conv, settings);
      return out === 'chat_handoff' ? out : 'chat_started';
    }
    conv.step = 'service';
    conv.data.options = services;
    saveConversation(db, conv);
    await say(org, contact, channel, 'chat_start', { options: numbered(services) });
    return 'chat_started';
  }

  async function askDay(org, contact, conv, settings) {
    const service = db.get('SELECT * FROM services WHERE id = ?', conv.data.service_id);
    const days = dayOptions(org, service, settings, conv.flow === 'reschedule' ? conv.data.booking_id : null);
    if (!days.length) {
      endConversation(db, conv);
      await say(org, contact, conv.channel, 'chat_full');
      return 'chat_handoff';
    }
    conv.step = 'day';
    conv.data.options = days;
    saveConversation(db, conv);
    await say(org, contact, conv.channel, 'chat_pick_day', { service: service.name, options: numbered(days) });
    return 'chat_continued';
  }

  async function askTime(org, contact, conv, settings, { taken = false } = {}) {
    const service = db.get('SELECT * FROM services WHERE id = ?', conv.data.service_id);
    const times = timeOptions(org, service, settings, conv.data.date, conv.flow === 'reschedule' ? conv.data.booking_id : null);
    if (!times.length) return askDay(org, contact, conv, settings);
    conv.step = 'time';
    conv.data.options = times;
    saveConversation(db, conv);
    const date = formatDay(zonedToUtc(conv.data.date, '12:00', org.timezone), org.timezone);
    await say(org, contact, conv.channel, taken ? 'chat_taken' : 'chat_pick_time', { date, options: numbered(times) });
    return 'chat_continued';
  }

  /** After the time: ask for anything we still need, then confirm. */
  async function askNext(org, contact, conv, settings) {
    const fresh = db.get('SELECT * FROM contacts WHERE id = ?', contact.id);
    if (conv.flow === 'book' && !conv.data.name && PLACEHOLDER.test(fresh.first_name || '')) return ask(org, contact, conv, 'name', 'chat_ask_name');
    if (conv.flow === 'book' && settings.require_address && !conv.data.address && !(fresh.address && fresh.postcode)) return ask(org, contact, conv, 'address', 'chat_ask_address');
    if (conv.flow === 'book' && settings.require_address && conv.data.notes === undefined) return ask(org, contact, conv, 'notes', 'chat_ask_notes');
    const service = db.get('SELECT * FROM services WHERE id = ?', conv.data.service_id);
    const address = [conv.data.address || fresh.address, conv.data.postcode || fresh.postcode].filter(Boolean).join(', ');
    conv.step = 'confirm';
    delete conv.data.options;
    saveConversation(db, conv);
    const vars = { service: service.name, date: formatDay(conv.data.starts_at, org.timezone), time: formatClock(conv.data.starts_at, org.timezone), address_line: address && settings.require_address ? `\n${address}` : '' };
    await say(org, contact, conv.channel, conv.flow === 'reschedule' ? 'chat_confirm_move' : 'chat_confirm', vars);
    return 'chat_continued';
  }

  async function ask(org, contact, conv, step, template) {
    conv.step = step;
    delete conv.data.options;
    saveConversation(db, conv);
    await say(org, contact, conv.channel, template);
    return 'chat_continued';
  }

  /** A reply the assistant can't follow: ask again once, then hand over to a person. */
  async function miss(org, contact, conv) {
    conv.misses = (conv.misses || 0) + 1;
    if (conv.misses >= 2) {
      endConversation(db, conv);
      await say(org, contact, conv.channel, 'chat_handoff');
      return 'chat_handoff';
    }
    saveConversation(db, conv);
    await say(org, contact, conv.channel, 'chat_not_understood');
    return 'chat_continued';
  }

  /** Carries on a conversation with the customer's latest reply. */
  async function reply(org, contact, conv, text) {
    const settings = getBookingSettings(db, org);
    if (EXIT.test(text) && !['name', 'address', 'notes'].includes(conv.step)) {
      endConversation(db, conv);
      await say(org, contact, conv.channel, conv.flow === 'book' ? 'chat_stopped' : 'chat_kept');
      return 'chat_stopped';
    }
    const opts = conv.data.options || [];
    switch (conv.step) {
      case 'service': {
        const choice = pickOption(text, opts);
        if (!choice) return miss(org, contact, conv);
        conv.data.service_id = choice.value;
        conv.misses = 0;
        return askDay(org, contact, conv, settings);
      }
      case 'day': {
        const choice = pickOption(text, opts);
        if (!choice) return miss(org, contact, conv);
        conv.data.date = choice.value;
        conv.misses = 0;
        return askTime(org, contact, conv, settings);
      }
      case 'time': {
        if (/^9$/.test(text.trim())) return askDay(org, contact, conv, settings);
        const choice = pickOption(text, opts);
        if (!choice) return miss(org, contact, conv);
        conv.data.starts_at = choice.value;
        conv.misses = 0;
        return askNext(org, contact, conv, settings);
      }
      case 'name': {
        const name = text.replace(/^(hi|hello|hey)[,!.]?\s+/i, '').replace(/^(it[’']?s|i[’']?m|i am|my name is|my name[’']?s|this is|name[:\s]+)\s*/i, '').replace(/[.!]+$/, '').trim().slice(0, 80);
        if (!/[a-z]/i.test(name)) return miss(org, contact, conv);
        conv.data.name = name;
        const [first, ...rest] = name.split(/\s+/);
        db.update('contacts', contact.id, { first_name: first.charAt(0).toUpperCase() + first.slice(1), last_name: rest.join(' ') || null, updated_at: now() });
        return askNext(org, contact, conv, settings);
      }
      case 'address': {
        const m = text.match(POSTCODE);
        if (!m) {
          conv.misses = (conv.misses || 0) + 1;
          if (conv.misses >= 3) return miss(org, contact, { ...conv, misses: 2 });
          saveConversation(db, conv);
          await sendMessage(ctx, org.id, { contact, channel: conv.channel, body: 'Please include the postcode, e.g. 12 High Street, BS1 4DJ', audience: 'system', force: true, strict: true, related: { type: 'assistant', id: contact.id } });
          return 'chat_continued';
        }
        const postcode = `${m[1]} ${m[2]}`.toUpperCase();
        const address = text.replace(m[0], '').replace(/[\s,]+$/, '').replace(/^[\s,]+/, '').slice(0, 200) || null;
        conv.data.address = address;
        conv.data.postcode = postcode;
        conv.misses = 0;
        db.update('contacts', contact.id, { address, postcode, updated_at: now() });
        return askNext(org, contact, conv, settings);
      }
      case 'notes': {
        conv.data.notes = SKIP.test(text) ? '' : text.slice(0, 500);
        return askNext(org, contact, conv, settings);
      }
      case 'confirm': {
        if (NO.test(text)) { conv.misses = 0; return askDay(org, contact, conv, settings); }
        if (!YES.test(text)) return miss(org, contact, conv);
        return conv.flow === 'reschedule' ? finishMove(org, contact, conv, settings) : finishBooking(org, contact, conv, settings);
      }
      case 'confirm_cancel': {
        if (NO.test(text)) { endConversation(db, conv); await say(org, contact, conv.channel, 'chat_kept'); return 'chat_kept'; }
        if (!YES.test(text)) return miss(org, contact, conv);
        return finishCancel(org, contact, conv, settings);
      }
      default:
        endConversation(db, conv);
        return null;
    }
  }

  async function finishBooking(org, contact, conv, settings) {
    const fresh = db.get('SELECT * FROM contacts WHERE id = ?', contact.id);
    try {
      const { booking } = await createBooking(ctx, org.id, {
        service_id: conv.data.service_id, starts_at: conv.data.starts_at, contact_id: contact.id,
        address: conv.data.address || fresh.address, postcode: conv.data.postcode || fresh.postcode, notes: conv.data.notes || null,
      }, { source: conv.channel === 'whatsapp' ? 'whatsapp' : 'phone', selfBooked: true });
      endConversation(db, conv);
      closeReplyTasks(db, org.id, contact.id);
      return { handled: 'chat_booked', booking };
    } catch (err) {
      if (/taken|available/i.test(err.message)) return askTime(org, contact, conv, settings, { taken: true });
      throw err;
    }
  }

  async function finishMove(org, contact, conv, settings) {
    const booking = getBooking(db, org.id, conv.data.booking_id);
    const service = db.get('SELECT * FROM services WHERE id = ?', booking.service_id);
    const free = slotsFor(db, org, service, localDate(conv.data.starts_at, org.timezone), settings, { excludeId: booking.id }).some((s) => s.starts_at === conv.data.starts_at);
    if (!free) return askTime(org, contact, conv, settings, { taken: true });
    const before = bookingVars(booking, service, org.timezone);
    const { booking: moved } = await updateBooking(ctx, org.id, booking.id, { starts_at: conv.data.starts_at });
    db.update('bookings', booking.id, { customer_confirmed_at: now(), reschedule_requested: 0 });
    endConversation(db, conv);
    closeReplyTasks(db, org.id, contact.id);
    const after = bookingVars(moved, service, org.timezone);
    alertStaff(ctx, org.id, 'staff_booking_update', { ...after, name: baseVars(org, contact).name, update: `moved their booking by ${conv.channel === 'whatsapp' ? 'WhatsApp' : 'text'} (was ${before.date} ${before.time}) to` }, { title: `Moved: ${baseVars(org, contact).name} → ${after.date} ${after.time}`, link: `#/bookings/${booking.id}` });
    return { handled: 'chat_moved', booking: moved };
  }

  async function finishCancel(org, contact, conv, settings) {
    const booking = getBooking(db, org.id, conv.data.booking_id);
    endConversation(db, conv);
    if (!ACTIVE.includes(booking.status)) return 'chat_kept';
    const hoursAway = (new Date(booking.starts_at).getTime() - Date.now()) / 3600_000;
    const vars = bookingVars(booking, { name: booking.service_name }, org.timezone);
    if (hoursAway < settings.cancel_notice_hours) {
      await say(org, contact, conv.channel, 'chat_cancel_too_late', { hours: String(settings.cancel_notice_hours) });
      alertStaff(ctx, org.id, 'staff_booking_update', { ...vars, name: baseVars(org, contact).name, update: 'wants to cancel (inside the notice period)' }, { title: `Wants to cancel: ${baseVars(org, contact).name}`, link: `#/bookings/${booking.id}` });
      return { handled: 'chat_cancel_late', handoff: true };
    }
    const res = await setBookingStatus(ctx, org.id, booking.id, 'cancelled', { reason: `Cancelled by the customer by ${conv.channel === 'whatsapp' ? 'WhatsApp' : 'text'}` });
    alertStaff(ctx, org.id, 'staff_booking_update', { ...vars, name: baseVars(org, contact).name, update: 'cancelled' }, { title: `Cancelled: ${baseVars(org, contact).name} – ${vars.date} ${vars.time}`, link: `#/bookings/${booking.id}` });
    return { handled: 'chat_cancelled', booking: res.booking };
  }

  /**
   * Called for each incoming WhatsApp or text. Returns { handled, handoff?, booking? }
   * when the assistant dealt with it, or null to let a person handle it.
   */
  async function handle({ org, contact, channel, text, nextBooking }) {
    const settings = getBookingSettings(db, org);
    if (!settings.enabled || !settings.chat_booking || channel === 'email') return null;
    const conv = getConversation(db, org.id, contact.id);
    if (conv && !BOOK_START.test(text)) {
      if (conv.channel !== channel) conv.channel = channel;
      const out = await reply(org, contact, conv, text);
      return out ? (typeof out === 'string' ? { handled: out, handoff: out === 'chat_handoff' } : out) : null;
    }
    if (nextBooking && RESCHEDULE.test(text)) return { handled: await start(org, contact, channel, 'reschedule', { booking: nextBooking }), booking: nextBooking };
    if (nextBooking && CANCEL.test(text)) return { handled: await start(org, contact, channel, 'cancel', { booking: nextBooking }) };
    if (BOOK_START.test(text) || (text.length <= 60 && /\bbook\b/i.test(text))) {
      const started = await start(org, contact, channel, 'book');
      return started ? { handled: started, handoff: started === 'chat_handoff' } : null;
    }
    return null;
  }

  return { handle, pickOption };
}

/**
 * Scheduler step: a customer who started booking (or rearranging) on WhatsApp
 * and then went quiet is handed to a person, so the job isn't lost.
 */
export function followUpAbandoned(ctx, at = new Date()) {
  const { db } = ctx;
  const cutoff = new Date(at.getTime() - EXPIRES_MINUTES * 60_000).toISOString();
  let count = 0;
  for (const conv of parseJson(db.all('SELECT * FROM conversations WHERE updated_at < ?', cutoff), 'data')) {
    db.run('DELETE FROM conversations WHERE id = ?', conv.id);
    const contact = db.get('SELECT * FROM contacts WHERE id = ?', conv.contact_id);
    const org = db.get('SELECT * FROM organizations WHERE id = ?', conv.org_id);
    if (!contact || !org || conv.flow === 'cancel') continue;
    const name = baseVars(org, contact).name;
    const service = conv.data.service_id ? db.get('SELECT name FROM services WHERE id = ?', conv.data.service_id)?.name : null;
    const how = conv.channel === 'whatsapp' ? 'WhatsApp' : 'text';
    ensureTask(ctx, org.id, contact, conv.flow === 'reschedule'
      ? { title: `Reply to ${name} – wants to rearrange but didn’t pick a new time`, description: `They started moving their booking by ${how} and stopped replying. Message them to agree a time.`, priority: 'high' }
      : { title: `Reply to ${name} – started booking by ${how} but didn’t finish`, description: `They got as far as ${{ service: 'choosing a service', day: 'choosing a day', time: 'choosing a time', name: 'giving their name', address: 'giving the address', notes: 'describing the problem', confirm: 'confirming' }[conv.step] || 'starting'}${service ? ` for ${service}` : ''}. A quick message usually wins the job.`, priority: 'high' });
    alertStaff(ctx, org.id, 'staff_custom', { message: `${name} started booking${service ? ` ${service}` : ''} by ${how} but didn’t finish – worth a message.` }, { title: `Unfinished booking: ${name}`, link: `#/messages/${contact.id}` });
    count++;
  }
  return count;
}

function addOneDay(date) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
