// ─────────────────────────────────────────────────────────────────────────────
//  Results: each client's goal (e.g. £20k → £50k–£100k a month in 6 months),
//  the daily actions that build up to it, and what's been done over any period.
//  Pure functions only – the pages live in app.js.
// ─────────────────────────────────────────────────────────────────────────────
import { DAY, addDaysIso, daysSince, today } from './util.js';

export const PERIODS = [
  [7, 'Last 7 days'],
  [30, 'Last 30 days'],
  [90, 'Last 3 months'],
  [180, 'Last 6 months'],
];

/** Day number of the programme (1 on the start date). */
export const programmeDay = (r, date = today()) => Math.max(0, Math.round((new Date(date + 'T12:00:00') - new Date(r.startDate + 'T12:00:00')) / DAY) + 1);
export const totalDays = (r) => (Number(r.months) || 6) * 30;
export const monthOf = (r, date = today()) => Math.min(Number(r.months) || 6, Math.max(1, Math.ceil(programmeDay(r, date) / 30)));
export const endDate = (r) => addDaysIso(totalDays(r) - 1, new Date(r.startDate + 'T12:00:00'));

/** Daily actions that apply on a given date (some only run in certain months). */
export function actionsOn(r, date = today()) {
  if (date < r.startDate) return [];
  const m = monthOf(r, date);
  return (r.actions || []).filter((a) => (Number(a.fromMonth) || 1) <= m && m <= (Number(a.toMonth) || 99));
}
export const doneOn = (r, date) => new Set((r.log || {})[date] || []);

export function toggleAction(r, actionId, date = today()) {
  r.log = r.log || {};
  const set = doneOn(r, date);
  if (set.has(actionId)) set.delete(actionId); else set.add(actionId);
  if (set.size) r.log[date] = [...set]; else delete r.log[date];
  return set.has(actionId);
}

/** Latest measured value (check-ins), or the starting point. */
export function currentValue(r, date = today()) {
  const past = (r.checkins || []).filter((c) => c.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  return past.length ? Number(past[past.length - 1].value) : Number(r.baseline) || 0;
}

/** Where they should be by now on a straight line from start to goal. */
export function expectedValue(r, date = today()) {
  const f = Math.min(1, programmeDay(r, date) / totalDays(r));
  return Number(r.baseline) + (Number(r.goal) - Number(r.baseline)) * f;
}

export function progress(r) {
  const base = Number(r.baseline) || 0;
  const now = currentValue(r);
  const gain = (Number(r.goal) || 0) - base;
  const stretchGain = (Number(r.stretch) || Number(r.goal) || 0) - base;
  const day = programmeDay(r);
  const expectedGain = expectedValue(r) - base;
  const pace = expectedGain > 0 ? (now - base) / expectedGain : 1;
  let status = 'on-track';
  if (day > totalDays(r) && now >= Number(r.goal)) status = 'achieved';
  else if (day <= 14 || (!(r.checkins || []).length && day <= 35)) status = 'starting'; // no fair read until the first check-in
  else if (pace >= 1.1) status = 'ahead';
  else if (pace < 0.8) status = 'behind';
  return {
    now, day, month: monthOf(r), totalDays: totalDays(r),
    toGoal: gain > 0 ? Math.max(0, Math.min(1, (now - base) / gain)) : 1,
    toStretch: stretchGain > 0 ? Math.max(0, Math.min(1, (now - base) / stretchGain)) : 1,
    timeUsed: Math.min(1, day / totalDays(r)),
    expected: expectedValue(r), pace, status,
    growth: base ? (now - base) / base : 0,
  };
}
export const STATUS = {
  achieved: ['Goal hit', 'green'], ahead: ['Ahead', 'green'], 'on-track': ['On track', 'blue'], behind: ['Behind', 'red'], starting: ['Just started', ''],
};

/** Consecutive days (up to today, or yesterday if today isn't started) with every action done. */
export function streak(r) {
  let n = 0;
  let d = today();
  const full = (date) => { const acts = actionsOn(r, date); return acts.length > 0 && acts.every((a) => doneOn(r, date).has(a.id)); };
  if (!full(d)) d = addDaysIso(-1);
  while (d >= r.startDate && full(d)) { n++; d = addDaysIso(-1, new Date(d + 'T12:00:00')); }
  return n;
}

/** Everything that happened in the last `days` days. */
export function periodSummary(r, days) {
  const end = today();
  const startCut = addDaysIso(-(days - 1));
  const from = startCut > r.startDate ? startCut : r.startDate;
  const dates = [];
  for (let d = from; d <= end; d = addDaysIso(1, new Date(d + 'T12:00:00'))) dates.push(d);
  let done = 0; let possible = 0;
  const perAction = {};
  const perDay = dates.map((date) => {
    const acts = actionsOn(r, date);
    const set = doneOn(r, date);
    const n = acts.filter((a) => set.has(a.id)).length;
    done += n; possible += acts.length;
    for (const a of acts) {
      perAction[a.id] ||= { action: a, done: 0, possible: 0 };
      perAction[a.id].possible++;
      if (set.has(a.id)) perAction[a.id].done++;
    }
    return { date, done: n, possible: acts.length, items: acts.filter((a) => set.has(a.id)).map((a) => a.title) };
  });
  const startValue = currentValue(r, addDaysIso(-1, new Date(from + 'T12:00:00')));
  const endValue = currentValue(r, end);
  return {
    from, to: end, days: dates.length, done, possible, rate: possible ? done / possible : 0, perDay,
    perAction: Object.values(perAction).sort((a, b) => b.done - a.done),
    perfectDays: perDay.filter((d) => d.possible && d.done === d.possible).length,
    startValue, endValue, change: endValue - startValue,
    wins: (r.wins || []).filter((w) => w.date >= from && w.date <= end).sort((a, b) => b.date.localeCompare(a.date)),
    checkins: (r.checkins || []).filter((c) => c.date >= from && c.date <= end).sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/** Monthly milestones on the way from the starting point to the goal. */
export function milestones(r) {
  const months = Number(r.months) || 6;
  return Array.from({ length: months }, (_, i) => {
    const m = i + 1;
    const date = addDaysIso(m * 30 - 1, new Date(r.startDate + 'T12:00:00'));
    const target = Math.round(Number(r.baseline) + ((Number(r.goal) - Number(r.baseline)) * m) / months);
    const reached = currentValue(r, date);
    const note = (r.milestoneNotes || {})[m] || '';
    return { month: m, date, target, value: reached, passed: date < today(), hit: reached >= target, current: monthOf(r) === m && programmeDay(r) <= totalDays(r), note };
  });
}

/** Is a monthly check-in due? (none logged in the last 30 days, programme running) */
export function checkinDue(r) {
  const last = [...(r.checkins || [])].sort((a, b) => b.date.localeCompare(a.date))[0];
  return programmeDay(r) <= totalDays(r) + 7 && programmeDay(r) >= 28 && (!last || daysSince(last.date) >= 30);
}

/** Days in a row (before today) where nothing was ticked off. */
export function quietDays(r) {
  let n = 0;
  let d = addDaysIso(-1);
  while (d >= r.startDate && actionsOn(r, d).length && doneOn(r, d).size === 0) { n++; d = addDaysIso(-1, new Date(d + 'T12:00:00')); }
  return n;
}

/** Totals across every client for the overview. */
export function portfolio(list) {
  const rows = list.map((r) => ({ r, p: progress(r) }));
  return {
    clients: rows.length,
    baseline: rows.reduce((s, x) => s + (Number(x.r.baseline) || 0), 0),
    now: rows.reduce((s, x) => s + x.p.now, 0),
    goal: rows.reduce((s, x) => s + (Number(x.r.goal) || 0), 0),
    onTrack: rows.filter((x) => ['ahead', 'on-track', 'achieved', 'starting'].includes(x.p.status)).length,
    behind: rows.filter((x) => x.p.status === 'behind').length,
    actionsToday: rows.reduce((s, x) => s + actionsOn(x.r).length, 0),
    doneToday: rows.reduce((s, x) => s + actionsOn(x.r).filter((a) => doneOn(x.r, today()).has(a.id)).length, 0),
  };
}
