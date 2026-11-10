import { publicToken, id, now, render } from '../../lib/util.js';
import { setSetting } from '../../lib/settings.js';
import { createContact, getContactRow } from '../crm/service.js';
import {
  CHANNEL_NAMES, SOCIAL_CHANNELS, alertStaff, baseVars, deliverMessage, ensureTask, getMessagingSettings, queueMessage, sentRecently,
} from './service.js';

/**
 * Instagram, Facebook and TikTok DMs and comments (Essentials → DM & comment
 * auto replies). They arrive from the business's ManyChat, Make or Zapier
 * step at the social address, land in Messages like any other message, and
 * get an instant reply: a keyword rule if one matches, otherwise the standard
 * DM reply – and for comments a public reply plus a DM.
 *
 * Replies go back out through the business's social connection (a web address
 * their ManyChat/Make/Zapier step listens on). Without one, the reply is
 * returned in the response so the step that sent the message can post it.
 */

/** The private address ManyChat / Make / Zapier send DMs and comments to. Made the first time it's needed. */
export function socialToken(db, orgId) {
  const settings = getMessagingSettings(db, orgId);
  if (settings.social_token) return settings.social_token;
  const token = publicToken();
  setSetting(db, orgId, 'messaging', { ...settings, social_token: token });
  return token;
}

/** "price, cost, how much → Our prices start at £45" – one rule per line. */
export function parseKeywordRules(text) {
  return String(text || '').split('\n').map((line) => {
    const [words, ...reply] = line.split(/\s*(?:→|->|=>)\s*/);
    return { words: String(words || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean), reply: reply.join(' → ').trim() };
  }).filter((r) => r.words.length && r.reply);
}

const cleanHandle = (h) => String(h || '').trim().replace(/^@/, '').toLowerCase().slice(0, 60);

function contactForSocial(ctx, orgId, platform, handle, name) {
  const { db } = ctx;
  const found = db.get(`SELECT * FROM contacts WHERE org_id = ? AND socials LIKE ?`, orgId, `%"${platform}":"${handle.replace(/[%_"]/g, '')}"%`);
  if (found) return { contact: getContactRow(db, found.id), created: false };
  const [first, ...rest] = String(name || '').trim().split(/\s+/).filter(Boolean);
  const { contact } = createContact(ctx, orgId, {
    first_name: first || `@${handle}`, last_name: rest.join(' ') || null, source: CHANNEL_NAMES[platform], socials: { [platform]: handle },
  }, { emit: false });
  return { contact: getContactRow(db, contact.id), created: true };
}

/**
 * Handles one DM or comment. input: { platform, type: 'dm' | 'comment', from (handle), name, text, comment_id, post }
 * Returns { contact, message, replies: [{ type, text, to, comment_id }], sent_via }.
 */
export async function handleSocial(ctx, orgId, input) {
  const { db, engine } = ctx;
  const platform = SOCIAL_CHANNELS.includes(String(input.platform || '').toLowerCase()) ? String(input.platform).toLowerCase() : 'instagram';
  const type = String(input.type || '').toLowerCase().startsWith('comment') ? 'comment' : 'dm';
  const handle = cleanHandle(input.from || input.username || input.handle);
  const text = String(input.text || input.message || '').trim().slice(0, 4000);
  if (!handle) throw Object.assign(new Error('Send who it’s from: { "from": "their_handle" }'), { status: 400 });
  if (!text) throw Object.assign(new Error('Send the message: { "text": "…" }'), { status: 400 });
  const settings = getMessagingSettings(db, orgId);
  const org = db.get('SELECT * FROM organizations WHERE id = ?', orgId);
  const { contact, created } = contactForSocial(ctx, orgId, platform, handle, input.name);
  const where = input.post ? ` on ${String(input.post).slice(0, 120)}` : '';

  const message = {
    id: id('msg'), org_id: orgId, contact_id: contact.id, channel: platform, direction: 'in', to_addr: null, from_addr: `@${handle}`,
    subject: null, body: type === 'comment' ? `💬 Comment${where}: ${text}` : text, status: 'received', provider: null, provider_id: input.comment_id || input.message_id || null,
    error: null, template_key: null, related_type: type === 'comment' ? 'comment' : null, related_id: input.comment_id || null,
    send_after: null, read: 0, created_by: null, created_at: now(), sent_at: null,
  };
  db.insert('messages', message);
  db.update('contacts', contact.id, { last_contacted_at: now(), updated_at: now() });

  const replies = [];
  let answered = false;
  if (settings.social_enabled) {
    const vars = { ...baseVars(org, contact, settings), book_line: bookLineFor(db, org) };
    const lower = text.toLowerCase();
    const rule = parseKeywordRules(settings.keyword_replies).find((r) => r.words.some((w) => lower.includes(w)));
    const reply = async (kind, body, templateKey) => {
      const queued = queueMessage(ctx, orgId, {
        contact, channel: platform, body: render(body, vars), audience: 'system', force: true, strict: true, templateKey,
        related: kind === 'comment_reply' ? { type: 'comment_reply', id: input.comment_id || message.id } : { type: 'social', id: message.id },
      });
      if (!queued.message) return;
      let sent = queued.message;
      if (sent.status === 'queued') {
        // No social connection: hand the reply back to the step that sent the message, to post.
        if (sent.provider === 'none') { db.update('messages', sent.id, { status: 'sent', provider: 'reply', sent_at: now() }); sent = { ...sent, status: 'sent', provider: 'reply' }; }
        else sent = await deliverMessage(ctx, sent, queued.settings, queued.extra, queued.creds);
      }
      replies.push({ type: kind, text: sent.body, to: `@${handle}`, comment_id: kind === 'comment_reply' ? input.comment_id || null : null, status: sent.status });
    };
    if (type === 'comment' && settings.comment_auto_reply) {
      if (settings.comment_public_reply) await reply('comment_reply', settings.comment_public_reply, 'social_comment_reply');
      const dm = rule?.reply || settings.comment_dm;
      if (dm) await reply('dm', dm, rule ? 'social_keyword_reply' : 'social_comment_dm');
      answered = Boolean(rule);
    } else if (type === 'dm') {
      if (rule) { await reply('dm', rule.reply, 'social_keyword_reply'); answered = true; }
      else if (settings.dm_auto_reply && settings.dm_reply && !sentRecently(db, contact.id, 12)) await reply('dm', settings.dm_reply, 'social_dm_reply');
    }
  }

  // A keyword rule answered the question; anything else needs a person.
  const who = baseVars(org, contact).name;
  const label = `${CHANNEL_NAMES[platform]} ${type === 'comment' ? 'comment' : 'DM'}`;
  if (answered) db.update('messages', message.id, { read: 1 });
  else {
    ensureTask(ctx, orgId, contact, { title: `Reply to ${who} (${label})`, description: `“${text.slice(0, 400)}”\n\nReply from Messages so it's saved on their record.`, priority: 'high' });
    alertStaff(ctx, orgId, 'staff_new_message', { urgent_prefix: '', channel: label, name: who, phone: `@${handle}`, message: text.slice(0, 300) }, { title: `New ${label} from ${who}`, link: `#/messages/${contact.id}` });
  }
  if (replies.length) engine.logSystemRun(orgId, 'DM & comment auto reply', 'message.received', `Replied to ${label} from @${handle}${answered ? ' (keyword rule)' : ''}`, 2 * replies.length);
  const automations = engine.emit(orgId, 'message.received', { message, contact, urgent: false, channel: platform });
  return { contact, created, message, replies, answered, sent_via: settings.social_webhook_url ? 'connection' : 'response', automations };
}

function bookLineFor(db, org) {
  return org?.slug && db.get('SELECT 1 FROM services WHERE org_id = ? AND active = 1 AND online = 1 LIMIT 1', org.id)
    ? ` Book here: ${baseVars(org, null).booking_link}` : '';
}
