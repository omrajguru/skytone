export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string, opts: Intl.DateTimeFormatOptions) {
  const key = tz + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts });
    } catch {
      f = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts });
    }
    cache.set(key, f);
  }
  return f;
}

/** Offset of a zone from UTC at an instant, in ms. */
export function offsetMs(time: number, tz: string) {
  const parts = dtf(tz, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(time);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(time / 1000) * 1000;
}

/** Local midnight in the zone, for the day containing `time`. DST-safe. */
export function startOfDay(time: number, tz: string) {
  const local = time + offsetMs(time, tz);
  const midnight = Math.floor(local / DAY) * DAY;
  return midnight - offsetMs(midnight - offsetMs(time, tz), tz);
}

export const clock = (time: number, tz: string) =>
  dtf(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(time);

export const longDate = (time: number, tz: string) =>
  dtf(tz, { weekday: 'long', day: 'numeric', month: 'long' }).format(time);

export function dayChip(time: number, tz: string) {
  const parts = dtf(tz, { weekday: 'short', day: 'numeric' }).formatToParts(time);
  return {
    weekday: parts.find((p) => p.type === 'weekday')?.value ?? '',
    day: parts.find((p) => p.type === 'day')?.value ?? '',
  };
}

export function utcLabel(time: number, tz: string) {
  const m = Math.round(offsetMs(time, tz) / MINUTE);
  const sign = m < 0 ? '−' : '+';
  const a = Math.abs(m);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
}

/** yyyy-mm-dd of the local day, for <input type="date">. */
export function isoDay(time: number, tz: string) {
  const parts = dtf(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Same local clock time on another local date. */
export function onDay(isoDate: string, time: number, tz: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return time;
  const sinceMidnight = time - startOfDay(time, tz);
  const guess = Date.UTC(y, m - 1, d, 12);
  return startOfDay(guess - offsetMs(guess, tz), tz) + sinceMidnight;
}

export const stamp = (time: number, tz: string) => {
  const parts = dtf(tz, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(time);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}`;
};
