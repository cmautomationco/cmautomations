/**
 * Local-time helpers. Bookings, reminders, quiet hours and job sheets all work
 * in the business's own time zone (Europe/London by default), including the
 * clock changes in March and October.
 */
const formatters = new Map();
function partsFormatter(tz) {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    }));
  }
  return formatters.get(tz);
}

/** The wall-clock parts of a moment in a time zone. */
export function zonedParts(when, tz = 'Europe/London') {
  const out = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(when))) out[p.type] = p.value;
  return {
    year: Number(out.year), month: Number(out.month), day: Number(out.day),
    hour: Number(out.hour) % 24, minute: Number(out.minute), second: Number(out.second),
    weekday: out.weekday.toLowerCase().slice(0, 3),
    date: `${out.year}-${out.month}-${out.day}`,
    time: `${String(Number(out.hour) % 24).padStart(2, '0')}:${out.minute}`,
  };
}

/** Converts a local date ('2026-10-08') and time ('09:30') in a time zone to an ISO timestamp. */
export function zonedToUtc(date, time, tz = 'Europe/London') {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (at) => {
    const p = zonedParts(at, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - at;
  };
  let utc = guess - offset(guess);
  const second = offset(utc);
  if (guess - second !== utc) utc = guess - second;
  return new Date(utc).toISOString();
}

export const localDate = (when, tz) => zonedParts(when, tz).date;
export const localTime = (when, tz) => zonedParts(when, tz).time;

/** Adds days to a 'YYYY-MM-DD' date. */
export function addLocalDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const weekdayOf = (date) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];

/** "Thu 8 Oct" */
export function formatDay(when, tz = 'Europe/London') {
  return new Date(when).toLocaleDateString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
}

/** "9:30am" */
export function formatClock(when, tz = 'Europe/London') {
  const { hour, minute } = zonedParts(when, tz);
  const h12 = hour % 12 || 12;
  return `${h12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour < 12 ? 'am' : 'pm'}`;
}

const minutesOf = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };

/** True when the local time falls in a quiet window such as 20:00–08:00. */
export function inQuietHours(when, tz, start, end) {
  const { hour, minute } = zonedParts(when, tz);
  const t = hour * 60 + minute;
  const s = minutesOf(start);
  const e = minutesOf(end);
  return s > e ? t >= s || t < e : t >= s && t < e;
}

/** The next moment the quiet window ends (when held messages can go). */
export function quietHoursEnd(when, tz, end) {
  const today = localDate(when, tz);
  const candidate = zonedToUtc(today, end, tz);
  return new Date(candidate) > new Date(when) ? candidate : zonedToUtc(addLocalDays(today, 1), end, tz);
}
