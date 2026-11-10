import { localDate } from '../lib/time.js';
import { id, now, publicToken } from '../lib/util.js';
import { applyItems } from '../modules/essentials/catalogue.js';
import { handleSocial } from '../modules/messaging/social.js';

/**
 * Demo data for Automations → Essentials:
 *   - Swift Plumbing & Heating has the core automations on (and a few still to add)
 *   - Bright Path Coaching answers Instagram DMs and comments automatically,
 *     tags where leads came from, and has a customer whose birthday is today
 *   - Glow Studio has been sent the starter offer by the agency and hasn't answered yet
 */
export async function seedEssentials(db, engine, { owner }) {
  if (db.get(`SELECT value FROM org_meta WHERE key = 'essentials_seeded' LIMIT 1`)) return false;
  const ctx = { db, engine };
  const org = (name) => db.get('SELECT * FROM organizations WHERE name = ?', name);
  const swift = org('Swift Plumbing & Heating');
  const bright = org('Bright Path Coaching');
  const glow = org('Glow Studio');
  if (!swift && !bright && !glow) return false;

  if (swift) {
    applyItems(ctx, swift.id, ['new_customer_welcome', 'thank_you', 'review_request', 'quote_follow_up', 'reply_watch', 'invoice_reminders'].map((key) => ({ key, on: true })));
  }

  if (bright) {
    applyItems(ctx, bright.id, [
      { key: 'lead_source', on: true },
      { key: 'occasions', on: true },
      {
        key: 'social_replies', on: true, options: {
          keyword_replies: 'price, cost, how much, prices → Hi{{first_name_spaced}}! 1:1 coaching starts at £150 a session, and the 12-week Confidence Accelerator is £1,800. Happy to answer anything – or grab a free 20-minute call:{{book_line}}\nfree call, discovery, chat → Of course! Pick a time for a free 20-minute call here:{{book_line}}',
        },
      },
    ]);
    // A customer whose birthday is today, and one with a work anniversary.
    const today = localDate(new Date(), bright.timezone || 'Europe/London').slice(5);
    const customers = db.all(`SELECT id FROM contacts WHERE org_id = ? AND lifecycle = 'customer' ORDER BY created_at LIMIT 2`, bright.id);
    if (customers[0]) db.update('contacts', customers[0].id, { birthday: `1989-${today}` });
    if (customers[1]) db.update('contacts', customers[1].id, { special_date: '03-14', special_date_label: 'new job anniversary' });
    // Instagram DMs and a comment, answered automatically.
    await handleSocial(ctx, bright.id, { platform: 'instagram', type: 'dm', from: 'hannah.career.change', name: 'Hannah Lewis', text: 'Hi! How much is your 1:1 coaching? I’m thinking about a career change' });
    await handleSocial(ctx, bright.id, { platform: 'instagram', type: 'comment', from: 'tom_in_tech', name: 'Tom Price', text: 'This is exactly me 😩 how do I start?', comment_id: 'demo-comment-1', post: '“3 signs you’ve outgrown your job” reel' });
    await handleSocial(ctx, bright.id, { platform: 'tiktok', type: 'dm', from: 'leah.writes', name: 'Leah', text: 'Do you do group sessions?' });
  }

  if (glow && owner) {
    db.insert('automation_offers', {
      id: id('off'), org_id: glow.id, token: publicToken(),
      items: ['lead_reply', 'missed_call', 'social_replies', 'booking_confirmation', 'reminder_day_before', 'reminder_hour_before', 'no_show_rebook', 'review_request', 'occasions'],
      note: 'Hi Mia – these are the ones we talked about. Instagram replies and birthday messages should make a big difference for the salon.',
      status: 'sent', created_by: owner.id, created_at: new Date(Date.now() - 26 * 3600_000).toISOString(), viewed_at: null, accepted_at: null, accepted_by: null,
    });
  }

  db.run(`INSERT INTO org_meta (org_id, key, value) VALUES (?, 'essentials_seeded', ?) ON CONFLICT(org_id, key) DO UPDATE SET value = excluded.value`, (bright || swift || glow)?.id, now());
  return true;
}
