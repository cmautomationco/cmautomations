import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { config } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { buildScript, splitCards } from '../server/modules/vsl/builder.js';
import { PACKS } from '../server/modules/vsl/niches.js';
import { money, numbersLine } from '../server/modules/vsl/proof.js';

/** VSL: the foundation, niche packs, honest proof, scripts in three formats, pages, prospect links and hook tests. */

let server;
let base;
let db;
const saved = { ...config };

before(() => {
  config.requirePasswords = true;
  const made = createApp(openDatabase(':memory:'));
  db = made.ctx.db;
  server = made.app.listen(0);
  base = `http://localhost:${server.address().port}`;
  config.publicUrl = base;
});
after(() => { Object.assign(config, saved); server.close(); });

const call = async (method, p, body, token) => {
  const res = await fetch(`${base}/api${p}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
let n = 0;
async function business(name = 'CM Automations') {
  const reg = await call('POST', '/auth/register', { name: 'Owner', email: `owner${++n}@vsl.test`, password: 'password123', business_name: name, niche: 'agency' });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  return { token: reg.body.token, org: reg.body.org };
}
const line = (built, key) => built.sections.flatMap((s) => s.lines).find((l) => l.key === key);
const complete = (over = {}) => ({
  business_name: 'Swift Plumbing', short_name: 'The plumber', owner_name: 'Dave', kind: 'plumber', paid: false,
  period_start: '2026-10-03', period_end: '2026-10-31', numbers: { enquiries_caught: 41, recovered: 9, bookings: 4, value_pence: 124000 },
  quote: 'I stopped losing jobs while I was under a sink.', permission: true,
  screenshots: [{ kind: 'log_sheet', blurred: true }, { kind: 'weekly_report', blurred: true }], ...over,
});

describe('the foundation', () => {
  test('five sections with the agreed timings, slots and filming notes', async () => {
    const biz = await business();
    const f = (await call('GET', '/vsl/foundation', null, biz.token)).body;
    assert.deepEqual(f.sections.map((s) => [s.title, s.start, s.end]), [
      ['The Hook', 0, 5], ['Problem & Agitation', 5, 50], ['The Solution', 50, 140], ['Social Proof & Authority', 140, 190], ['Call to Action', 190, 210],
    ]);
    assert.equal(f.sections[0].slot, '[who you’re talking to] + [the problem costing them right now]');
    assert.equal(f.sections[4].filming, 'On camera. Point down towards the link and say it once, clearly.');
    assert.equal(f.page.button_text, 'Watch the full breakdown');
    assert.equal(f.open_decisions[0].key, 'breakdown_cta');
    assert.deepEqual(f.formats.map((x) => [x.key, x.status]), [['faceless', 'now'], ['voiceover', 'next'], ['on_camera', 'later']]);
    assert.ok(f.niches.some((x) => x.key === 'aesthetics_clinic' && x.status === 'v1'));
    // The principle every VSL proves: problem → solution → their result → their customers' result.
    assert.deepEqual(f.principle.links.map((l) => l.key), ['problem', 'solution', 'business_result', 'customer_result']);
  });

  test('every built-in pack fills every slot', () => {
    for (const [key, pack] of Object.entries(PACKS)) {
      const b = buildScript({ pack, packKey: key });
      assert.ok(!b.checks.errors.some((e) => e.rule === 'pack'), key);
      assert.ok(!JSON.stringify(b.sections).includes('{{'), `${key} has an unfilled token`);
    }
  });
});

describe('scripts', () => {
  test('the default is the aesthetics clinic v1, faceless, word for word', async () => {
    const biz = await business();
    const res = await call('POST', '/vsl/scripts', {}, biz.token);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const b = res.body.built;
    assert.equal(b.format.key, 'faceless');
    assert.equal(b.hook.text, 'If you run an aesthetics clinic, every DM you can’t answer mid-treatment is a booking going to the clinic down the road.');
    assert.equal(b.hook.options.length, 3);
    assert.equal(line(b, 'problem.sample').text, 'You didn’t get into aesthetics to sit on your phone at night. But right now, if you don’t reply fast, someone else does.');
    assert.equal(line(b, 'solution.method').text, 'I set up a system that replies to every enquiry within seconds, follows up for you, and shows you each week how many bookings it saved.');
    assert.equal(line(b, 'solution.what_changes').text, 'You treat clients. The system catches the enquiries. You check one report on a Friday.');
    assert.equal(b.sections[2].demo_steps[0].text, 'Send a test DM to a demo clinic account.');
    assert.match(line(b, 'proof.framing').text, /For a clinic, it catches Instagram DMs\.$/);
    assert.equal(line(b, 'cta.line').text, 'Right under this video there’s a full breakdown. It shows how this works for clinics like yours, the problems it solves, and what it’s done for the businesses I’ve worked with. Watch that next.');
    assert.equal(b.page.button_text, 'Watch the full breakdown');
    // The solution ends on the result, and the chain travels with the script.
    assert.equal(b.sections[2].lines.at(-1).key, 'solution.result');
    assert.ok(b.result_chain.business_result && b.result_chain.customer_result);
    // No proof yet, so it can't leave draft.
    assert.equal(b.checks.ready, false);
    const ready = await call('PUT', `/vsl/scripts/${res.body.id}`, { status: 'ready' }, biz.token);
    assert.equal(ready.status, 400);
    // Faceless cards never overlap, even when the hook runs past 0:05.
    for (let i = 1; i < b.cards.length; i++) assert.ok(b.cards[i].start >= b.cards[i - 1].end - 1e-9, `card ${i} overlaps`);
    assert.ok(b.cards.every((c) => c.clip || c.text.split(/\s+/).length <= 9));
  });

  test('picking another hook, rewriting a line and putting it back', async () => {
    const biz = await business();
    const s = (await call('POST', '/vsl/scripts', { hook: 2 }, biz.token)).body;
    assert.equal(s.built.hook.text, 'If you’re still answering Instagram DMs at 10pm, this is for you.');
    let u = (await call('PUT', `/vsl/scripts/${s.id}`, { overrides: { 'problem.cost': 'Every missed DM is a lost treatment.' } }, biz.token)).body;
    assert.equal(line(u.built, 'problem.cost').text, 'Every missed DM is a lost treatment.');
    u = (await call('PUT', `/vsl/scripts/${s.id}`, { overrides: { 'problem.cost': null } }, biz.token)).body;
    assert.equal(line(u.built, 'problem.cost').text, PACKS.aesthetics_clinic.problem_lines.cost);
  });

  test('one script becomes the voiceover and on-camera versions, and another niche', async () => {
    const biz = await business();
    const s = (await call('POST', '/vsl/scripts', { overrides: { 'problem.day': 'Custom day.' } }, biz.token)).body;
    const vo = (await call('POST', `/vsl/scripts/${s.id}/copy`, { format: 'voiceover' }, biz.token)).body;
    assert.equal(vo.built.format.key, 'voiceover');
    assert.equal(vo.parent_id, s.id);
    assert.equal(line(vo.built, 'problem.day').text, 'Custom day.');
    assert.match(vo.built.sections[0].direction, /first word is on the first frame/);
    const cam = (await call('POST', `/vsl/scripts/${s.id}/copy`, { format: 'on_camera' }, biz.token)).body;
    assert.equal(cam.built.sections[0].direction, 'On camera, in a tight shot. No logo intro or music build-up first, so your first word is in the first frame.');
    const trades = (await call('POST', `/vsl/scripts/${s.id}/copy`, { niche_key: 'trades' }, biz.token)).body;
    assert.equal(trades.niche_key, 'trades');
    assert.notEqual(line(trades.built, 'problem.day').text, 'Custom day.');
    assert.ok(trades.built.checks.warnings.some((w) => w.rule === 'draft_pack'));
  });

  test('trades pack swaps the trade word everywhere', async () => {
    const biz = await business();
    const s = (await call('POST', '/vsl/scripts', { niche_key: 'trades', vars: { trade: 'electrician', trade_plural: 'electricians' } }, biz.token)).body;
    assert.equal(s.built.hook.text, 'If you’re an electrician, every call you miss on a job is work going to the next number on Google.');
    assert.equal(s.built.niche.vars.business, 'electrician');
    assert.equal(s.built.sections[2].demo_steps[0].text, 'Send a test call to a demo electrician account.');
    assert.match(line(s.built, 'cta.line').text, /electricians like you/);
    assert.equal(s.built.niche.proof_relation, 'same_niche');
  });

  test('a new niche of your own, based on a built-in pack', async () => {
    const biz = await business();
    const made = await call('POST', '/vsl/niches', { label: 'Dog groomers', based_on: 'aesthetics_clinic', data: {
      vars: { business: 'grooming salon', business_plural: 'grooming salons', who: 'dog groomers', message: 'DM', front_door: 'Instagram DMs' },
      hooks: ['If you groom dogs, every DM you can’t answer mid-groom is a booking going elsewhere.'],
      what_changes: 'You groom dogs. The system catches the enquiries. You check one report on a Friday.',
    } }, biz.token);
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.key, 'dog_groomers');
    assert.deepEqual(made.body.gaps, []);
    const s = (await call('POST', '/vsl/scripts', { niche_key: 'dog_groomers' }, biz.token)).body;
    assert.equal(s.built.sections[2].demo_steps[0].text, 'Send a test DM to a demo grooming salon account.');
    assert.equal(line(s.built, 'solution.what_changes').text, 'You groom dogs. The system catches the enquiries. You check one report on a Friday.');
    assert.equal((await call('DELETE', '/vsl/niches/dog_groomers', null, biz.token)).status, 400);
    assert.equal((await call('PUT', '/vsl/niches/trades', { label: 'x' }, biz.token)).status, 400);
  });

  test('exports: script text, captions and shot list', async () => {
    const biz = await business();
    const s = (await call('POST', '/vsl/scripts', {}, biz.token)).body;
    const txt = (await call('GET', `/vsl/scripts/${s.id}/export?as=text`, null, biz.token)).body;
    assert.match(txt.content, /1\. THE HOOK \(0:00–0:05\)/);
    assert.match(txt.content, /Button: Watch the full breakdown/);
    assert.match(txt.content, /Still to decide/);
    const srt = (await call('GET', `/vsl/scripts/${s.id}/export?as=srt`, null, biz.token)).body;
    assert.match(srt.content, /^1\n00:00:00,000 --> /);
    const shots = (await call('GET', `/vsl/scripts/${s.id}/export?as=shots`, null, biz.token)).body;
    assert.equal(shots.shots.length, 5);
    assert.equal(shots.shots[2].screen_recording.length, 5);
  });
});

describe('proof and the honesty rules', () => {
  test('numbers are printed exactly as recorded', () => {
    assert.equal(money(124000), '£1,240');
    assert.equal(money(124050), '£1,240.50');
    assert.equal(numbersLine(complete()), 'The plumber, 3 Oct to 31 Oct 2026: 41 enquiries answered. 9 of them would have been missed. 4 turned into bookings, worth an estimated £1,240.');
    assert.equal(numbersLine(complete({ numbers: { enquiries_caught: 1, bookings: 1 } })), 'The plumber, 3 Oct to 31 Oct 2026: 1 enquiry answered. 1 turned into a booking.');
  });

  test('bad numbers are refused', async () => {
    const biz = await business();
    assert.equal((await call('POST', '/vsl/proof', complete({ numbers: { enquiries_caught: 5, recovered: 9 } }), biz.token)).status, 400);
    assert.equal((await call('POST', '/vsl/proof', complete({ numbers: { bookings: 4.5 } }), biz.token)).status, 400);
    assert.equal((await call('POST', '/vsl/proof', complete({ numbers: { bookings: -1 } }), biz.token)).status, 400);
  });

  test('a script only leaves draft when the proof is real, exact and blurred', async () => {
    const biz = await business();
    const plumber = (await call('POST', '/vsl/proof', complete({ screenshots: [{ kind: 'log_sheet', blurred: false }, { kind: 'weekly_report', blurred: true }] }), biz.token)).body;
    assert.equal(plumber.checklist.complete, true);
    const internet = (await call('POST', '/vsl/proof', { business_name: 'Internet connections company', paid: false, numbers: { enquiries_caught: 3 } }, biz.token)).body;
    assert.equal(internet.checklist.complete, false);
    const s = (await call('POST', '/vsl/scripts', {}, biz.token)).body;
    const rules = s.built.checks.errors.map((e) => e.rule);
    assert.ok(rules.includes('blur'));
    assert.ok(rules.includes('checklist'));

    await call('PUT', `/vsl/proof/${plumber.id}`, { screenshots: [{ kind: 'log_sheet', blurred: true }, { kind: 'weekly_report', blurred: true }] }, biz.token);
    await call('PUT', `/vsl/proof/${internet.id}`, complete({ business_name: 'Internet connections company', short_name: 'The internet company', numbers: { enquiries_caught: 3, recovered: 1, bookings: 0 }, quote: 'It answers when we can’t.' }), biz.token);
    let b = (await call('GET', `/vsl/scripts/${s.id}`, null, biz.token)).body.built;
    assert.deepEqual(b.checks.errors, []);
    // A small number is still shown.
    assert.match(line(b, `proof.numbers.${internet.id}`).text, /3 enquiries answered\. 1 of them would have been missed\. 0 turned into bookings\./);

    // "Clients" when nobody paid, a rounded-up number and a vague claim are all stopped.
    let u = (await call('PUT', `/vsl/scripts/${s.id}`, { overrides: { 'proof.framing': 'I’ve built this for my clients, a plumber and an internet company.' } }, biz.token)).body;
    assert.ok(u.built.checks.errors.some((e) => e.rule === 'clients_word'));
    u = (await call('PUT', `/vsl/scripts/${s.id}`, { overrides: { 'proof.framing': null, [`proof.numbers.${plumber.id}`]: 'The plumber: 50 enquiries answered.' } }, biz.token)).body;
    assert.ok(u.built.checks.errors.some((e) => e.rule === 'no_rounding' && /50/.test(e.text)));
    u = (await call('PUT', `/vsl/scripts/${s.id}`, { overrides: { [`proof.numbers.${plumber.id}`]: 'The plumber: over 40 enquiries answered.' } }, biz.token)).body;
    assert.ok(u.built.checks.errors.some((e) => e.rule === 'no_rounding'));
    assert.equal((await call('PUT', `/vsl/scripts/${s.id}`, { status: 'ready' }, biz.token)).status, 400);

    // Once they've paid, "client" is fine.
    await call('PUT', `/vsl/proof/${plumber.id}`, { paid: true }, biz.token);
    await call('PUT', `/vsl/proof/${internet.id}`, { paid: true }, biz.token);
    u = (await call('PUT', `/vsl/scripts/${s.id}`, { overrides: { [`proof.numbers.${plumber.id}`]: null, 'proof.framing': 'I’ve built this for two clients, a plumber and an internet company.' } }, biz.token)).body;
    assert.deepEqual(u.built.checks.errors, []);
    const ready = await call('PUT', `/vsl/scripts/${s.id}`, { status: 'ready' }, biz.token);
    assert.equal(ready.status, 200, JSON.stringify(ready.body));
    assert.equal((await call('PUT', `/vsl/scripts/${s.id}`, { status: 'filmed' }, biz.token)).status, 400);
    assert.equal((await call('PUT', `/vsl/scripts/${s.id}`, { status: 'filmed', video_url: 'https://www.loom.com/share/abc' }, biz.token)).status, 200);
  });
});

describe('the page, prospect links and the hook test', () => {
  test('two hook variants, a personal link, and watching tracked to the follow-up task', async () => {
    const biz = await business();
    await call('POST', '/vsl/proof', complete(), biz.token);
    const a = (await call('POST', '/vsl/scripts', { hook: 0 }, biz.token)).body;
    const bScr = (await call('POST', `/vsl/scripts/${a.id}/copy`, { hook: 1, name: 'Hook B' }, biz.token)).body;
    for (const s of [a, bScr]) assert.equal((await call('PUT', `/vsl/scripts/${s.id}`, { status: 'ready' }, biz.token)).status, 200);

    const page = (await call('POST', '/vsl/pages', { name: 'Clinic VSL', variants: [{ script_id: a.id }, { script_id: bScr.id }] }, biz.token)).body;
    assert.equal(page.button_text, 'Watch the full breakdown');
    assert.match(page.link, /#\/vsl\/clinic-vsl$/);
    const notYet = await call('PUT', `/vsl/pages/${page.id}`, { status: 'live' }, biz.token);
    assert.equal(notYet.status, 400);
    assert.ok(notYet.body.details.some((d) => /breakdown video/.test(d)));
    const live = await call('PUT', `/vsl/pages/${page.id}`, {
      status: 'live', breakdown_video_url: 'https://www.loom.com/share/breakdown',
      variants: [{ script_id: a.id, video_url: 'https://www.loom.com/share/a' }, { script_id: bScr.id, video_url: 'https://www.loom.com/share/b' }],
    }, biz.token);
    assert.equal(live.status, 200, JSON.stringify(live.body));

    // The same visitor always gets the same hook.
    const v1 = (await call('GET', '/public/vsl/clinic-vsl?visitor=visitor-0001')).body;
    const v1again = (await call('GET', '/public/vsl/clinic-vsl?visitor=visitor-0001')).body;
    assert.equal(v1.video.variant, v1again.video.variant);
    assert.equal(v1.button_text, 'Watch the full breakdown');
    assert.equal(v1.breakdown.cta, null);

    // A personal link for one prospect, tied to their CRM record and pinned to hook B.
    const { contact } = (await call('POST', '/crm/contacts', { first_name: 'Glow', company: 'Glow Aesthetics', email: 'hi@glow.test' }, biz.token)).body;
    const share = (await call('POST', `/vsl/pages/${page.id}/shares`, { contact_id: contact.id, variant_key: 'B' }, biz.token)).body;
    assert.equal(share.label, 'Glow Aesthetics');
    const token = share.link.split('/').pop();
    const seen = (await call('GET', `/public/vsl/clinic-vsl?share=${token}&visitor=glow-visitor-1`)).body;
    assert.equal(seen.video.variant, 'B');
    for (const sec of [3, 30, 95, 150]) await call('POST', '/public/vsl/clinic-vsl/events', { visitor: 'glow-visitor-1', share: token, type: 'progress', seconds: sec });
    assert.equal((await call('POST', '/public/vsl/clinic-vsl/events', { visitor: 'glow-visitor-1', share: token, type: 'cta_click' })).status, 200);
    await call('POST', '/public/vsl/clinic-vsl/events', { visitor: 'glow-visitor-1', share: token, type: 'cta_click' });
    assert.equal((await call('POST', '/public/vsl/clinic-vsl/events', { visitor: 'glow-visitor-1', type: 'nonsense' })).status, 400);

    const detail = (await call('GET', `/vsl/pages/${page.id}`, null, biz.token)).body;
    const sh = detail.shares[0];
    assert.equal(sh.opened, true);
    assert.equal(sh.clicked, true);
    assert.equal(sh.watched_seconds, 150);
    assert.equal(sh.watched_to, 'Social Proof & Authority');
    const tasks = db.all(`SELECT * FROM tasks WHERE source_ref = ?`, share.id);
    assert.equal(tasks.length, 1, 'one follow-up task, however many clicks');
    assert.match(tasks[0].title, /Glow Aesthetics/);
    const timeline = db.all('SELECT body FROM activities WHERE contact_id = ? ORDER BY created_at', contact.id).map((x) => x.body);
    assert.ok(timeline.some((t) => /Opened the VSL/.test(t)));
    assert.ok(timeline.some((t) => /to 150s and clicked “Watch the full breakdown”/.test(t)));

    const stats = detail.stats;
    const B = stats.variants.find((v) => v.key === 'B');
    assert.equal(B.plays, 1);
    assert.equal(B.hook_held, 1);
    assert.deepEqual(B.sections.map((s) => s.reached), [1, 1, 1, 1, 0]);
    assert.equal(B.cta_clicks, 1);
    assert.equal(stats.hook_test.status, 'collecting');

    // Deciding the breakdown video's CTA.
    const decided = (await call('PUT', `/vsl/pages/${page.id}`, { breakdown_cta: { kind: 'book_call', url: 'https://cal.com/cm/intro' } }, biz.token)).body;
    assert.deepEqual(decided.breakdown_cta, { kind: 'book_call', label: 'Book a call', url: 'https://cal.com/cm/intro' });
    assert.equal((await call('GET', '/public/vsl/clinic-vsl?visitor=visitor-0001')).body.breakdown.cta.label, 'Book a call');

    // Paused pages disappear; drafts are a preview that records nothing.
    await call('PUT', `/vsl/pages/${page.id}`, { status: 'paused' }, biz.token);
    assert.equal((await call('GET', '/public/vsl/clinic-vsl')).status, 404);
    assert.equal((await call('DELETE', `/vsl/scripts/${a.id}`, null, biz.token)).status, 400);
  });

  test('another business can’t see or use your scripts and pages', async () => {
    const me = await business();
    const other = await business('Someone else');
    const s = (await call('POST', '/vsl/scripts', {}, me.token)).body;
    assert.equal((await call('GET', `/vsl/scripts/${s.id}`, null, other.token)).status, 404);
    assert.equal((await call('POST', '/vsl/pages', { name: 'Steal', variants: [{ script_id: s.id }] }, other.token)).status, 400);
    const page = (await call('POST', '/vsl/pages', { name: 'Mine', variants: [{ script_id: s.id }] }, me.token)).body;
    assert.equal((await call('GET', `/vsl/pages/${page.id}`, null, other.token)).status, 404);
  });
});

test('long lines split into readable cards', () => {
  const cards = splitCards('So you reply between clients. Or late at night. Or you hope reception covers it, or a basic auto-reply that sounds like a robot.', 9);
  assert.ok(cards.length >= 4);
  assert.ok(cards.every((c) => c.split(/\s+/).length <= 9));
});
