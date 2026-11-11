import { setSetting } from '../lib/settings.js';
import { id, now } from '../lib/util.js';

/**
 * Demo data for SEO: Swift Plumbing & Heating is part-way through its local
 * SEO (profile done, reviews flowing) and tracks a few searches climbing the
 * rankings; Bright Path Coaching has made a start on content.
 */
export function seedSeo(db) {
  if (db.get(`SELECT 1 FROM org_meta WHERE key = 'setting:seo' LIMIT 1`)) return false;
  const org = (name) => db.get('SELECT * FROM organizations WHERE name = ?', name);
  const swift = org('Swift Plumbing & Heating');
  const bright = org('Bright Path Coaching');
  const day = (daysAgo) => new Date(Date.now() - daysAgo * 86400_000).toISOString().slice(0, 10);
  const items = (keys, status = 'done') => Object.fromEntries(keys.map((k) => [k, { status, updated_at: now() }]));
  const kw = (phrase, intent, page, positions) => ({
    id: id('kw'), phrase, intent, page, position: positions.at(-1), previous: positions.length > 1 ? positions.at(-2) : null,
    history: positions.map((p, i) => ({ date: day((positions.length - 1 - i) * 30), position: p })), added_at: `${day(positions.length * 30)}T09:00:00.000Z`,
  });
  if (swift) {
    setSetting(db, swift.id, 'seo', {
      profile: { location: 'Bristol', areas: ['Clifton', 'Bishopston', 'Keynsham'], services: ['boiler service', 'boiler repair', 'emergency plumber', 'bathroom installation'] },
      items: {
        ...items(['gbp_claim', 'gbp_category', 'gbp_complete', 'gbp_name', 'gbp_photos', 'rev_reply', 'tech_https', 'tech_gsc', 'page_titles', 'page_nap', 'link_no_buying']),
        ...items(['page_services', 'link_directories', 'content_questions'], 'doing'),
      },
      keywords: [
        kw('emergency plumber bristol', 'urgent', 'Google Business Profile + Service page: Emergency plumber', [18, 11, 6]),
        kw('boiler service bristol', 'ready', 'Service page: Boiler service', [24, 15, 9]),
        kw('plumber near me', 'ready', 'Google Business Profile', [9, 5, 3]),
        kw('boiler repair clifton', 'ready', 'Location page: Clifton', [null, 31, 17]),
        kw('how much does a new boiler cost', 'learn', 'Blog post', [null, 42]),
      ],
    });
  }
  if (bright) {
    setSetting(db, bright.id, 'seo', {
      profile: { location: 'Bristol', areas: [], services: ['career coaching', 'confidence coaching', 'interview coaching'] },
      items: items(['tech_https', 'tech_gsc', 'content_questions', 'content_author', 'page_titles']),
      keywords: [kw('career coach for women', 'ready', 'Service page: Career coaching', [33, 21]), kw('how to change career at 40', 'learn', 'Blog post', [27])],
    });
  }
  return Boolean(swift || bright);
}
