import { ITEMS } from '../essentials/catalogue.js';
import { PAINS } from './analyse.js';

/**
 * Turns a lead's problems into "here's how we'd fix it" for their personal
 * demo page and confirmation page. An automation agency's fixes come from the
 * Essentials automations; any other business's from its own services.
 */

export const PAIN_FIXES = {
  missed_calls: { fix: 'Every missed call gets a text back within seconds, so the caller waits for you instead of ringing someone else.', items: ['missed_call', 'lead_reply'] },
  slow_reply: { fix: 'Every new enquiry gets a reply within a minute – day or night – and you get a nudge to follow it up.', items: ['lead_reply', 'reply_watch'] },
  admin: { fix: 'Confirmations, reminders, thank-yous and chasers go out by themselves, so evenings stay yours.', items: ['booking_confirmation', 'thank_you', 'invoice_reminders'] },
  no_shows: { fix: 'Two automatic reminders before every appointment, and a rebooking message if someone doesn’t turn up.', items: ['reminder_day_before', 'reminder_hour_before', 'no_show_rebook'] },
  invoices: { fix: 'Polite reminders go out on unpaid invoices until they’re paid – no awkward calls.', items: ['invoice_reminders'] },
  quotes: { fix: 'Every quote gets followed up automatically, so none are forgotten.', items: ['quote_follow_up'] },
  reviews: { fix: 'Happy customers get a review request at the right moment, with a one-tap link.', items: ['review_request', 'thank_you'] },
  leads: { fix: 'Old enquiries get a friendly check-in, referrals get asked for, and you can see which channels actually bring work.', items: ['cold_lead_check_in', 'referral_task', 'lead_source'] },
  social: { fix: 'Instagram, Facebook and TikTok DMs and comments get answered straight away with your booking link.', items: ['social_replies'] },
  bookings: { fix: 'People book themselves into your diary and get confirmed straight away – no back-and-forth.', items: ['booking_confirmation', 'reminder_day_before'] },
  google: { fix: 'More reviews and a booking page that works feed straight into how you show up on Google.', items: ['review_request', 'lead_source'] },
  staff: { fix: 'The team gets the right jobs, reminders and follow-ups without anyone chasing them.', items: ['reply_watch', 'referral_task'] },
};

const painLabel = (key) => PAINS.find((p) => p.key === key)?.label || key;
const words = (s) => new Set(String(s || '').toLowerCase().match(/[a-z]{4,}/g) || []);

/** The lead's problems, most important first: what they told us on calls, then the main one we noted. */
export function painsOf(contact) {
  const q = contact.qualification && typeof contact.qualification === 'object' ? contact.qualification : {};
  const keys = [...new Set([...(q.pain_keys || []), ...(q.pains || []).map((p) => (typeof p === 'string' ? PAINS.find((x) => x.label === p)?.key : p.key)).filter(Boolean)])];
  return keys;
}

/** "How we'd fix it" for each of a lead's problems. */
export function solutionsFor(db, org, painKeys, { mainPain = null } = {}) {
  const keys = painKeys.length ? painKeys.slice(0, 4) : ['missed_calls', 'slow_reply', 'no_shows'];
  if (org.niche === 'agency') {
    return keys.map((k) => {
      const f = PAIN_FIXES[k] || PAIN_FIXES.admin;
      return { key: k, problem: painLabel(k), fix: f.fix, items: f.items.map((i) => ITEMS.find((x) => x.key === i)).filter(Boolean).map((i) => ({ name: i.name, does: i.does, result: i.result })) };
    });
  }
  // Any other business: match its services to what the lead said.
  const services = db.all('SELECT name, description, price_pence, duration_min FROM services WHERE org_id = ? AND active = 1 ORDER BY position, name', org.id);
  const used = new Set();
  const out = keys.map((k) => {
    const want = new Set([...(PAINS.find((p) => p.key === k)?.words || []).flatMap((w) => [...words(w)]), ...words(mainPain)]);
    const ranked = services.map((s) => ({ s, hits: [...words(`${s.name} ${s.description}`)].filter((w) => want.has(w)).length })).sort((a, b) => b.hits - a.hits);
    const pickS = ranked.find((r) => r.hits && !used.has(r.s.name)) || ranked.find((r) => !used.has(r.s.name));
    if (pickS) used.add(pickS.s.name);
    return {
      key: k, problem: painLabel(k), fix: pickS ? `${pickS.s.name}${pickS.s.description ? ` – ${pickS.s.description}` : ''}` : 'We’ll go through exactly how we’d help on the call.',
      items: pickS ? [{ name: pickS.s.name, does: pickS.s.description || '', result: pickS.s.price_pence ? `From £${(pickS.s.price_pence / 100).toFixed(0)}` : '' }] : [],
    };
  });
  return out;
}
