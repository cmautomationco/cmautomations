import { toE164 } from '../lib/phone.js';

/**
 * Adds columns introduced after a database was created, so existing data
 * (including test data saved in a browser) keeps working after an upgrade.
 */
const COLUMNS = {
  organizations: [
    ['kind', "TEXT NOT NULL DEFAULT 'business'"],
    ['agency_id', 'TEXT'],
    ['brand', "TEXT NOT NULL DEFAULT '{}'"],
    ['slug', 'TEXT'],
  ],
  contacts: [
    ['phone_e164', 'TEXT'],
    ['address', 'TEXT'],
    ['postcode', 'TEXT'],
    ['preferred_channel', "TEXT NOT NULL DEFAULT 'auto'"],
    ['sms_opt_out', 'INTEGER NOT NULL DEFAULT 0'],
    ['email_opt_out', 'INTEGER NOT NULL DEFAULT 0'],
    ['whatsapp_opt_in', 'INTEGER NOT NULL DEFAULT 0'],
    // Essentials offer: social handles (for DM & comment replies), birthdays and special dates.
    ['socials', "TEXT NOT NULL DEFAULT '{}'"],
    ['birthday', 'TEXT'],
    ['special_date', 'TEXT'],
    ['special_date_label', 'TEXT'],
    // CRM dialer: where they are, what we've worked out about them, and where they are in the calling.
    ['timezone', 'TEXT'],
    ['enrichment', "TEXT NOT NULL DEFAULT '{}'"],
    ['qualification', "TEXT NOT NULL DEFAULT '{}'"],
    ['lead_score', 'INTEGER'],
    ['call_pref', 'TEXT'],
    ['dial_status', "TEXT NOT NULL DEFAULT 'new'"],
    ['dial_attempts', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_dialed_at', 'TEXT'],
    ['next_dial_at', 'TEXT'],
  ],
};

export function migrate(db) {
  for (const [table, cols] of Object.entries(COLUMNS)) {
    const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    for (const [name, ddl] of cols) {
      if (!have.has(name)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
        if (table === 'contacts' && name === 'phone_e164') {
          for (const c of db.prepare('SELECT id, phone FROM contacts WHERE phone IS NOT NULL').all()) {
            db.prepare('UPDATE contacts SET phone_e164 = ? WHERE id = ?').run(toE164(c.phone), c.id);
          }
        }
      }
    }
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(org_id, phone_e164)');
  allowSocialMessages(db);
  backfillPhones(db);
  // Every business gets a web-address-friendly name for its booking page.
  for (const o of db.prepare('SELECT id, name FROM organizations WHERE slug IS NULL').all()) {
    db.prepare('UPDATE organizations SET slug = ? WHERE id = ?').run(uniqueSlug(db, o.name), o.id);
  }
}

export function uniqueSlug(db, name) {
  const base = String(name).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'business';
  let slug = base;
  for (let i = 2; db.prepare('SELECT 1 FROM organizations WHERE slug = ?').get(slug); i++) slug = `${base}-${i}`;
  return slug;
}

/** Fills in the standard phone format for contacts that don't have it yet. */
export function backfillPhones(db) {
  const raw = db.raw || db;
  for (const c of raw.prepare('SELECT id, phone FROM contacts WHERE phone IS NOT NULL AND phone_e164 IS NULL').all()) {
    raw.prepare('UPDATE contacts SET phone_e164 = ? WHERE id = ?').run(toE164(c.phone), c.id);
  }
}

/**
 * Databases made before Instagram, Facebook and TikTok messages only allowed
 * email, SMS and WhatsApp in the messages table. SQLite can't change a CHECK
 * rule in place, so the table is rebuilt once with the same columns and data.
 */
function allowSocialMessages(db) {
  const raw = db.raw || db;
  const row = raw.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'messages'`).get();
  if (!row || row.sql.includes("'instagram'")) return;
  const sql = row.sql.replace("CHECK (channel IN ('email','sms','whatsapp'))", "CHECK (channel IN ('email','sms','whatsapp','instagram','facebook','tiktok'))");
  if (sql === row.sql) return;
  raw.exec('PRAGMA foreign_keys = OFF');
  raw.exec('BEGIN');
  try {
    raw.exec(sql.replace(/^CREATE TABLE "?messages"?/, 'CREATE TABLE messages_new'));
    raw.exec('INSERT INTO messages_new SELECT * FROM messages');
    raw.exec('DROP TABLE messages');
    raw.exec('ALTER TABLE messages_new RENAME TO messages');
    raw.exec('CREATE INDEX IF NOT EXISTS idx_messages_org ON messages(org_id, created_at)');
    raw.exec('CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id, created_at)');
    raw.exec('COMMIT');
  } catch (err) {
    raw.exec('ROLLBACK');
    throw err;
  } finally {
    raw.exec('PRAGMA foreign_keys = ON');
  }
}
