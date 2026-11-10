// Sun and moon positions. Formulas follow the low-precision algorithms used by SunCalc
// (Vladimir Agafonkin, BSD-2), which are accurate to well under a degree: plenty for a sky.

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2_440_588;
const J2000 = 2_451_545;
const OBLIQUITY = RAD * 23.4397;

export interface BodyPosition {
  /** Degrees above the horizon. Negative below. */
  altitude: number;
  /** Degrees clockwise from north. */
  azimuth: number;
}

export interface SunPosition extends BodyPosition {
  /** True while the sun climbs (morning). */
  rising: boolean;
}

export interface MoonPosition extends BodyPosition {
  /** Illuminated fraction, 0 (new) to 1 (full). */
  fraction: number;
}

const toDays = (ms: number) => ms / DAY_MS - 0.5 + J1970 - J2000;
const rightAscension = (l: number, b: number) =>
  Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
const declination = (l: number, b: number) =>
  Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
const siderealTime = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw;

function sunCoords(d: number) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

function moonCoords(d: number) {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385_001 - 20_905 * Math.cos(M) };
}

function horizontal(ra: number, dec: number, d: number, lat: number, lon: number): BodyPosition {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const H = siderealTime(d, lw) - ra;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { altitude: alt / RAD, azimuth: ((az / RAD + 180) % 360 + 360) % 360 };
}

export function sunPosition(time: number, lat: number, lon: number): SunPosition {
  const d = toDays(time);
  const { ra, dec } = sunCoords(d);
  const now = horizontal(ra, dec, d, lat, lon);
  const later = sunCoords(toDays(time + 600_000));
  const next = horizontal(later.ra, later.dec, toDays(time + 600_000), lat, lon);
  return { ...now, rising: next.altitude > now.altitude };
}

export function moonPosition(time: number, lat: number, lon: number): MoonPosition {
  const d = toDays(time);
  const m = moonCoords(d);
  const s = sunCoords(d);
  const pos = horizontal(m.ra, m.dec, d, lat, lon);
  const SUN_DIST = 149_598_000;
  const phi = Math.acos(
    Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra),
  );
  const inc = Math.atan2(SUN_DIST * Math.sin(phi), m.dist - SUN_DIST * Math.cos(phi));
  return { ...pos, fraction: (1 + Math.cos(inc)) / 2 };
}

export interface SunEvents {
  sunrise: number | null;
  sunset: number | null;
  /** Polar day or night: the sun never crosses the horizon in this window. */
  always: 'up' | 'down' | null;
}

/** Sunrise and sunset inside [start, start + 24h), found by scanning altitude. */
export function sunEvents(start: number, lat: number, lon: number): SunEvents {
  const STEP = 5 * 60_000;
  let prev = sunPosition(start, lat, lon).altitude + 0.833;
  let sunrise: number | null = null;
  let sunset: number | null = null;
  let up = prev > 0;
  let everUp = up, everDown = !up;
  for (let t = start + STEP; t <= start + DAY_MS; t += STEP) {
    const alt = sunPosition(t, lat, lon).altitude + 0.833;
    if (prev <= 0 && alt > 0 && sunrise === null) sunrise = t - STEP * (alt / (alt - prev));
    if (prev > 0 && alt <= 0 && sunset === null) sunset = t - STEP * (alt / (alt - prev));
    up = alt > 0;
    everUp ||= up;
    everDown ||= !up;
    prev = alt;
  }
  return { sunrise, sunset, always: everUp && !everDown ? 'up' : everDown && !everUp ? 'down' : null };
}
