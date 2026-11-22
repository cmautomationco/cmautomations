import { addLocalDays, localDate } from '../lib/time.js';
import { id } from '../lib/util.js';
import { addUpdate, completeStep, confirmKickoff, createClient, proposeKickoff } from '../modules/coaching/service.js';

/**
 * Demo data for Coaching (Bright Path Coaching). Clients at every point:
 *   - Hannah: first chat on Instagram, discovery call waiting on the coach
 *   - Tom: paid, sent his intake form, agreement still to sign (reminded once)
 *   - Leah: suggested kickoff times, waiting on the coach to confirm
 *   - Priya: week 4, a flat start (normal, and the page says so)
 *   - Sam: week 9, past the foundation weeks and picking up fast
 * All names and numbers are made up for the demo.
 */
export function seedCoaching(db, engine) {
  const org = db.get('SELECT * FROM organizations WHERE name = ?', 'Bright Path Coaching');
  if (!org || db.get(`SELECT 1 FROM org_meta WHERE org_id = ? AND key = 'coaching_seeded'`, org.id)) return false;
  const ctx = { db, engine };
  const owner = db.get(`SELECT user_id FROM memberships WHERE org_id = ? AND role = 'owner'`, org.id)?.user_id || null;
  const tz = org.timezone || 'Europe/London';
  const today = localDate(new Date(), tz);
  const daysAgo = (d, hour = 10) => new Date(Date.now() - d * 86400_000 - (new Date().getHours() - hour) * 3600_000).toISOString();
  const get = (cid) => db.get('SELECT * FROM coaching_clients WHERE id = ?', cid);
  const make = (input) => createClient(ctx, org.id, input, { actorId: owner });
  const done = (c, key, data = {}) => completeStep(ctx, get(c.id), key, { by: ['offer', 'intake', 'agreement', 'first_checkin'].includes(key) ? 'client' : 'coach', data });
  // Spreads a client's history (steps and timeline) back over the days it really took.
  const backdate = (c, fromDays, toDays = 0) => {
    const ups = db.all('SELECT id FROM coaching_updates WHERE client_id = ? ORDER BY created_at, rowid', c.id);
    ups.forEach((u, i) => db.run('UPDATE coaching_updates SET created_at = ? WHERE id = ?', daysAgo(fromDays - ((fromDays - toDays) * i) / Math.max(1, ups.length - 1)), u.id));
    const steps = db.all(`SELECT id, key FROM coaching_steps WHERE client_id = ? AND status != 'locked' ORDER BY position`, c.id);
    steps.forEach((s, i) => {
      const at = daysAgo(fromDays - ((fromDays - toDays) * i) / Math.max(1, steps.length - 1));
      db.run(`UPDATE coaching_steps SET opened_at = ?, done_at = CASE WHEN status = 'done' THEN ? ELSE done_at END WHERE id = ?`, at, at, s.id);
    });
    db.run('UPDATE coaching_clients SET created_at = ?, updated_at = ? WHERE id = ?', daysAgo(fromDays), daysAgo(toDays), c.id);
  };
  // Each check-in lands at the end of its week, counted from the day the programme started.
  const checkins = (c, startDaysAgo, values, notes) => {
    values.forEach((value, i) => {
      const week = i + 1;
      const at = daysAgo(startDaysAgo - week * 7);
      const n = notes[i] || {};
      db.insert('coaching_checkins', { id: id('cchk'), org_id: org.id, client_id: c.id, week, value, energy: n.energy || 4, wins: n.wins || null, struggles: n.struggles || null, coach_reply: n.reply || null, created_at: at, replied_at: n.reply ? at : null });
      db.insert('coaching_updates', { id: id('cupd'), org_id: org.id, client_id: c.id, author: 'client', body: `Week ${week} check-in · ${get(c.id).metric_label}: ${value} ${get(c.id).metric_unit}${n.wins ? ` · Win: ${n.wins}` : ''}`, step_key: `checkin_${week}`, created_at: at });
      if (n.reply) db.insert('coaching_updates', { id: id('cupd'), org_id: org.id, client_id: c.id, author: 'coach', body: `Week ${week} feedback: ${n.reply}`, step_key: `checkin_${week}`, created_at: at });
    });
  };
  const fullyOnboard = (c, intake, startDaysAgo) => {
    done(c, 'call'); done(c, 'offer'); done(c, 'payment');
    done(c, 'intake', { ...intake, submitted_at: daysAgo(startDaysAgo + 4) });
    done(c, 'agreement', { signed_name: get(c.id).name, signed_at: daysAgo(startDaysAgo + 3) });
    proposeKickoff(ctx, get(c.id), 'Monday evening or Tuesday lunchtime');
    confirmKickoff(ctx, get(c.id), 'Monday 6:30pm');
    done(c, 'kickoff');
    done(c, 'programme', { link: 'https://example.com/programme' });
    db.update('coaching_clients', c.id, { start_date: addLocalDays(today, -startDaysAgo) });
    done(c, 'first_checkin', { week: 1 });
  };

  // Hannah: just talked on Instagram.
  const hannah = make({ name: 'Hannah Lewis', email: 'hannah@example.com', instagram: 'hannah.moves', met_via: 'Instagram DM', notes: 'Keeps starting programmes and stopping after two weeks. Wants to run a 10k in the spring.', goal: 'Run a 10k by April', metric_label: '5k time', metric_unit: 'min' });
  backdate(hannah, 1);

  // Tom: paid, intake in, agreement waiting.
  const tom = make({ name: 'Tom Price', email: 'tom@example.com', met_via: 'Referral', notes: 'Referred by Sam. Desk job, back aches, wants to feel strong again.', goal: 'Deadlift his body weight', metric_label: 'Deadlift', metric_unit: 'kg', call_done: true });
  done(tom, 'offer'); done(tom, 'payment');
  done(tom, 'intake', { goals: 'Deadlift 85kg (my body weight) and stop my back aching at work', history: 'Gym on and off for years, never followed a plan', injuries: 'Lower back stiffness', schedule: 'Can train Mon, Wed, Sat mornings', starting_value: 50, goal_value: 85, submitted_at: daysAgo(1) });
  db.update('coaching_clients', tom.id, { baseline: 50, target: 85 });
  backdate(tom, 4);
  db.run(`UPDATE coaching_steps SET nudges = 1, last_nudged_at = ? WHERE client_id = ? AND key = 'agreement'`, daysAgo(0, 9), tom.id);
  addUpdate(db, get(tom.id), 'coach', 'Hi Tom, one last thing before we start: your coaching agreement is on your page.', 'agreement');

  // Leah: suggested kickoff times.
  const leah = make({ name: 'Leah Morgan', email: 'leah@example.com', met_via: 'TikTok DM', notes: 'New mum, wants her energy back and to feel strong.', goal: 'Three strength sessions a week, every week', metric_label: 'Sessions done', metric_unit: 'a week', call_done: true });
  done(leah, 'offer'); done(leah, 'payment');
  done(leah, 'intake', { goals: 'Get my energy back and feel strong', history: 'Yoga before having my son', schedule: 'Nap times and evenings', starting_value: 0, goal_value: 3, submitted_at: daysAgo(2) });
  db.update('coaching_clients', leah.id, { baseline: 0, target: 3 });
  done(leah, 'agreement', { signed_name: 'Leah Morgan', signed_at: daysAgo(2) });
  proposeKickoff(ctx, get(leah.id), 'Thursday 8pm, or Saturday morning');
  backdate(leah, 3);

  // Priya: week 4 of a body-weight goal. Flat so far, which is normal.
  const priya = make({ name: 'Priya Shah', email: 'priya@example.com', met_via: 'Instagram DM', notes: 'Tried every diet. Wants something she can keep doing.', goal: 'Lose 8kg and keep it off', metric_label: 'Body weight', metric_unit: 'kg' });
  fullyOnboard(priya, { goals: 'Lose 8kg without giving up the things I love', history: 'Lots of diets', schedule: 'Busy weekdays, free weekends', starting_value: 82, goal_value: 74 }, 22);
  db.update('coaching_clients', priya.id, { baseline: 82, target: 74 });
  db.run('DELETE FROM coaching_checkins WHERE client_id = ?', priya.id);
  backdate(priya, 27, 21);
  checkins(priya, 22, [81.8, 81.9, 81.4], [
    { wins: 'Hit my protein every day', struggles: 'Weekend meals out', reply: 'Brilliant start. The scale barely moves in week 1, that’s normal. Keep the protein going.' },
    { wins: 'Walked 8k steps 5 days', struggles: 'Felt like nothing changed', reply: 'It will look flat for a couple of weeks while the habits settle. You’re doing everything right.' },
    { wins: 'Clothes feel looser', energy: 5 },
  ]);

  // Sam: week 9, past the foundations and picking up week after week.
  const sam = make({ name: 'Sam Kerr', email: 'sam@example.com', instagram: 'samlifts', met_via: 'Instagram DM', notes: 'Wants to get properly strong. Never stuck with a plan past a month.', goal: 'Squat 100kg', metric_label: 'Squat', metric_unit: 'kg' });
  fullyOnboard(sam, { goals: 'Squat 100kg by summer', history: 'Lifted on and off for 3 years', injuries: 'None', schedule: 'Train 4x a week, early mornings', starting_value: 60, goal_value: 100 }, 57);
  db.update('coaching_clients', sam.id, { baseline: 60, target: 100 });
  db.run('DELETE FROM coaching_checkins WHERE client_id = ?', sam.id);
  backdate(sam, 62, 56);
  checkins(sam, 57, [60.5, 61, 62.5, 64, 67.5, 70, 74, 78], [
    { wins: 'Trained all 4 sessions', struggles: 'Sleep', reply: 'Great first week. Numbers won’t move much yet: we’re building the base.' },
    { wins: 'Form felt smoother', reply: 'That smoother form is exactly what we want in these early weeks.' },
    { wins: 'First 62.5 single', reply: 'There it is. This is where it starts to pick up.' },
    { wins: '4 for 4 again', reply: 'Consistency is paying off. Keep sleeping 7+ hours.' },
    { wins: 'New PR 67.5', energy: 5, reply: 'Big jump! The foundation work is showing now.' },
    { wins: 'Hit 70 for a triple', reply: 'Brilliant. Halfway to the goal already.' },
    { wins: 'Squatted 74', energy: 5, reply: 'Flying. Deload next week, then we push on.' },
    { wins: 'Hit 78 for the first time', energy: 5 },
  ]);

  db.run(`INSERT INTO org_meta (org_id, key, value) VALUES (?, 'coaching_seeded', '1') ON CONFLICT(org_id, key) DO NOTHING`, org.id);
  return true;
}
