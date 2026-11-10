import { type RGB, mix, desaturate, scale, smoothstep, clamp, luminance } from './color.ts';
import { type Palette, paletteAt } from './palette.ts';
import type { Conditions } from './conditions.ts';
import type { MoonPosition, SunPosition } from './astro.ts';

/**
 * A plate is the whole sky as a small colour grid, painted the way a watercolourist paints
 * a sky: a graded wash, then soft brush strokes laid wet into it. The renderer upsamples it
 * with a smooth cubic filter. Row 0 is the top of the sky. Values are sRGB 0..255.
 */
export const PLATE_W = 128;
export const PLATE_H = 72;
const ASPECT = PLATE_W / PLATE_H;
const CELLS = PLATE_W * PLATE_H;
export type Plate = Float32Array;

export const createPlate = (): Plate => new Float32Array(CELLS * 3);

export interface SceneInput {
  /** Epoch ms. Drives the slow drift of cloud across the frame. */
  time: number;
  sun: SunPosition;
  moon: MoonPosition;
  conditions: Conditions;
  /** Compass direction the view faces, degrees. */
  viewAzimuth: number;
  /** Varies the composition. Same seed, same sky. */
  seed: number;
}

type Pt = [number, number];

/** A brush stroke: a path, a width that tapers along it, and when it appears. */
type Stroke = {
  pts: Pt[];
  w0: number;
  w1: number;
  /** Cover (0..1) at which this stroke has fully arrived. */
  threshold: number;
  shade: number;
  warm: number;
  speed: number;
};

type Layout = {
  sweeps: Stroke[];
  wisps: Stroke[];
  curtains: Stroke[];
  washes: { x: number; y: number; rx: number; ry: number; rot: number; role: 'deep' | 'highlight' | 'shadow' | 'warm'; a: number }[];
  mounds: { x: number; rx: number; ry: number }[];
  streaks: number[];
  drift: number;
};

function rng(seed: number) {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The painter's style: every number that decides how the watercolour looks.
 * Tuned against a reference by measuring colour, texture, edges and direction.
 */
export const STYLE = {
  sweepCount: 14,
  sweepWidth: 0.688,
  sweepLength: 0.303,
  sweepTilt: 1.563,
  sweepAlpha: 1.563,
  crestAlpha: 1.25,
  shadowAlpha: 1,
  wispAlpha: 1,
  curtainAlpha: 1,
  curtainWidth: 1,
  washAlpha: 1,
  bloomAlpha: 1,
  wetEdge: 0.3,
  pool: 1,
};
export type Style = typeof STYLE;

/** Override style values (used by tuning tools). Clears cached layouts. */
export function setStyle(next: Partial<Style>) {
  Object.assign(STYLE, next);
  layoutCache.clear();
}

const layoutCache = new Map<number, Layout>();

/** A path that starts at (x, y), heads along `angle` for `len`, and meanders by `wobble`. */
function path(r: () => number, x: number, y: number, angle: number, len: number, wobble: number, hook = 0): Pt[] {
  const pts: Pt[] = [];
  const n = 5;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const off = (r() - 0.5) * 2 * wobble * Math.sin(Math.PI * t) + (i === n - 1 ? hook : 0);
    pts.push([x + (dx * len * t) / ASPECT - (dy * off) / ASPECT, y + dy * len * t + dx * off]);
  }
  return pts;
}

function layout(seed: number): Layout {
  let cached = layoutCache.get(seed);
  if (cached) return cached;
  const r = rng(seed);

  // Broad sweeps: the day's main washes of cloud, laid on a slight diagonal.
  const sweeps: Stroke[] = Array.from({ length: STYLE.sweepCount }, (_, i) => {
    // The first two are the shadow band: a long diagonal that arrives with the first cloud.
    const band = i < 2;
    const y = band ? 0.12 + r() * 0.2 : i < STYLE.sweepCount * 0.66 ? -0.02 + r() * 0.34 : 0.3 + r() * 0.3;
    const len = (band ? 1.1 + r() * 0.6 : 0.9 + r() * 0.8) * STYLE.sweepLength;
    const tilt = (r() < 0.5 ? -1 : 1) * (0.1 + r() * 0.16);
    return {
      pts: path(r, -0.45 + r() * 0.9, y, (band ? tilt : (r() - 0.5) * 0.7) * STYLE.sweepTilt, len, band ? 0.02 + r() * 0.03 : 0.07 + r() * 0.09),
      w0: (band ? 0.14 + r() * 0.1 : 0.18 + r() * 0.16) * STYLE.sweepWidth,
      w1: (band ? 0.1 + r() * 0.08 : 0.12 + r() * 0.14) * STYLE.sweepWidth,
      threshold: band ? 0.18 + r() * 0.15 : r(),
      shade: band ? 0.1 + r() * 0.2 : 0.38 + r() * 0.62,
      warm: r(),
      speed: 0.8 + r() * 0.5,
    };
  });

  // Wisps: thin high strokes that end in a curl, like smoke caught by wind.
  const wisps: Stroke[] = Array.from({ length: 6 }, () => {
    const len = 0.35 + r() * 0.45;
    return {
      pts: path(r, -0.15 + r() * 1.1, 0.58 + r() * 0.38, (r() - 0.5) * 0.8, len, 0.04 + r() * 0.05, (r() - 0.5) * 0.12),
      w0: 0.06 + r() * 0.05,
      w1: 0.035,
      threshold: r(),
      shade: r(),
      warm: r(),
      speed: 1.3 + r() * 0.6,
    };
  });

  // Curtains: at low sun, light stands up from the horizon in tapering columns.
  const curtains: Stroke[] = Array.from({ length: 8 }, (_, i) => {
    const x = (i + 0.5 + (r() - 0.5) * 0.8) / 8;
    const h = 0.3 + r() * 0.5;
    return {
      pts: path(r, x, -0.08, Math.PI / 2 + (r() - 0.5) * 0.7, h, 0.03 + r() * 0.04),
      w0: (0.13 + r() * 0.12) * STYLE.curtainWidth,
      w1: (0.09 + r() * 0.07) * STYLE.curtainWidth,
      threshold: r(),
      shade: r(),
      warm: r(),
      speed: 0.6 + r() * 0.3,
    };
  });

  // Huge, faint washes that keep even a clear sky from being a plain gradient.
  const roles = ['deep', 'shadow', 'highlight', 'warm'] as const;
  const washes = roles.map((role, i) => ({
    x: 0.1 + r() * 0.8,
    y: role === 'deep' ? 0.8 + r() * 0.2 : role === 'warm' ? r() * 0.2 : 0.25 + r() * 0.4,
    rx: 0.6 + r() * 0.5,
    ry: 0.22 + r() * 0.18,
    rot: (r() - 0.5) * (i === 1 ? 1.4 : 0.6),
    role,
    a: 0.16 + r() * 0.12,
  }));
  const mounds = Array.from({ length: 4 }, (_, i) => ({ x: 0.08 + i * 0.28 + (r() - 0.5) * 0.12, rx: 0.13 + r() * 0.1, ry: 0.06 + r() * 0.04 }));
  const streaks = Array.from({ length: 7 }, () => r());
  cached = { sweeps, wisps, curtains, washes, mounds, streaks, drift: r() < 0.5 ? -1 : 1 };
  layoutCache.set(seed, cached);
  return cached;
}

function blob(buf: Plate, x: number, y: number, rx: number, ry: number, rot: number, col: RGB, a: number, falloff = 1.25) {
  if (a <= 0.004 || rx <= 0 || ry <= 0) return;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const ext = Math.max(rx, ry) * 2.7;
  const i0 = Math.max(0, Math.floor((x - ext / ASPECT) * PLATE_W));
  const i1 = Math.min(PLATE_W - 1, Math.ceil((x + ext / ASPECT) * PLATE_W));
  const j0 = Math.max(0, Math.floor((1 - (y + ext)) * PLATE_H));
  const j1 = Math.min(PLATE_H - 1, Math.ceil((1 - (y - ext)) * PLATE_H));
  for (let j = j0; j <= j1; j++) {
    const v = 1 - (j + 0.5) / PLATE_H;
    const dy = v - y;
    for (let i = i0; i <= i1; i++) {
      const dx = ((i + 0.5) / PLATE_W - x) * ASPECT;
      const qx = (dx * cs + dy * sn) / rx;
      const qy = (-dx * sn + dy * cs) / ry;
      const d2 = qx * qx + qy * qy;
      if (d2 > 7) continue;
      const w = Math.min(1, Math.exp(-d2 * falloff) * a);
      const k = (j * PLATE_W + i) * 3;
      buf[k] += (col[0] - buf[k]) * w;
      buf[k + 1] += (col[1] - buf[k + 1]) * w;
      buf[k + 2] += (col[2] - buf[k + 2]) * w;
    }
  }
}

function eachCell(buf: Plate, fn: (c: RGB, u: number, v: number) => RGB) {
  const c: RGB = [0, 0, 0];
  for (let j = 0; j < PLATE_H; j++) {
    const v = 1 - (j + 0.5) / PLATE_H;
    for (let i = 0; i < PLATE_W; i++) {
      const k = (j * PLATE_W + i) * 3;
      c[0] = buf[k]; c[1] = buf[k + 1]; c[2] = buf[k + 2];
      const out = fn(c, (i + 0.5) / PLATE_W, v);
      buf[k] = out[0]; buf[k + 1] = out[1]; buf[k + 2] = out[2];
    }
  }
}

// ---------- Brush strokes ----------

const coverage = new Float32Array(CELLS);

function catmull(p: Pt[], t: number): Pt {
  const n = p.length - 1;
  const s = Math.min(n - 1e-6, Math.max(0, t * n));
  const i = Math.floor(s), f = s - i;
  const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(n, i + 2)];
  const f2 = f * f, f3 = f2 * f;
  const c = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * f + (2 * a - 5 * b + 4 * cc - d) * f2 + (-a + 3 * b - 3 * cc + d) * f3);
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])];
}

/** Lay one stroke's coverage (0..1) into the shared buffer: the max of soft dabs along its path. */
function layStroke(pts: Pt[], dx: number, w0: number, w1: number, fade = 0, stretch = 1) {
  coverage.fill(0);
  const minW = Math.min(w0, w1);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot((pts[i][0] - pts[i - 1][0]) * ASPECT, pts[i][1] - pts[i - 1][1]);
  const steps = Math.max(4, Math.ceil((len * stretch) / (minW * 0.45)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const [px, py0] = catmull(pts, t);
    const x = px + dx, y = py0 * stretch + (1 - stretch) * pts[0][1];
    const w = (w0 + (w1 - w0) * t) * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.92)), fade > 0 ? 0.12 : 0.35);
    if (w <= 0.002) continue;
    const strength = 1 - fade * t * t;
    const ext = w * 2.4;
    const i0 = Math.max(0, Math.floor((x - ext / ASPECT) * PLATE_W)), i1 = Math.min(PLATE_W - 1, Math.ceil((x + ext / ASPECT) * PLATE_W));
    const j0 = Math.max(0, Math.floor((1 - (y + ext)) * PLATE_H)), j1 = Math.min(PLATE_H - 1, Math.ceil((1 - (y - ext)) * PLATE_H));
    const inv = 1 / (w * w);
    for (let j = j0; j <= j1; j++) {
      const dy = 1 - (j + 0.5) / PLATE_H - y;
      for (let i = i0; i <= i1; i++) {
        const ddx = ((i + 0.5) / PLATE_W - x) * ASPECT;
        const g = Math.exp(-(ddx * ddx + dy * dy) * inv * 1.6) * strength;
        const k = j * PLATE_W + i;
        if (g > coverage[k]) coverage[k] = g;
      }
    }
  }
}

/**
 * Wash the laid stroke into the plate. A wet edge: soft, but with a defined boundary, and a
 * faint deeper rim where pigment gathers as the water dries.
 */
function washStroke(buf: Plate, col: RGB, alpha: number, pool: number) {
  if (alpha <= 0.004) return;
  const L = luminance(col);
  const deep: RGB = [(L + (col[0] - L) * 1.25) * 0.93, (L + (col[1] - L) * 1.25) * 0.93, (L + (col[2] - L) * 1.25) * 0.93];
  for (let k = 0; k < CELLS; k++) {
    const c = coverage[k];
    if (c < 0.01) continue;
    const a = alpha * ((1 - STYLE.wetEdge) * c + STYLE.wetEdge * smoothstep(0.05, 0.6, c));
    const rim = smoothstep(0.08, 0.3, c) * (1 - smoothstep(0.3, 0.7, c)) * pool * STYLE.pool;
    const i = k * 3;
    for (let ch = 0; ch < 3; ch++) {
      const target = col[ch] + (deep[ch] - col[ch]) * rim;
      buf[i + ch] += (target - buf[i + ch]) * a;
    }
  }
}

const signedAngle = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

function glowStrength(alt: number) {
  if (alt < -12) return 0;
  if (alt < -4) return 0.3 * smoothstep(-12, -4, alt);
  if (alt < 3) return 0.3 + 0.5 * smoothstep(-4, 1, alt);
  if (alt < 15) return 0.8 - 0.45 * smoothstep(3, 15, alt);
  return 0.35;
}

const wrap = (x: number, span: number) => ((x % span) + span) % span;

/** Paint a scene into `out` (or a new plate). Pure: same input, same plate. */
export function paintPlate(scene: SceneInput, out: Plate = createPlate()): Plate {
  const { sun, moon, conditions: cond } = scene;
  const P: Palette = paletteAt(sun.altitude, sun.rising);
  const L = layout(scene.seed);

  const sunDiff = signedAngle(sun.azimuth - scene.viewAzimuth);
  const sunX = 0.5 + clamp(sunDiff / 95, -1.25, 1.25) * 0.34;
  const sunY = 0.04 + clamp(sun.altitude / 70, -0.4, 1) * 0.68;
  const facing = Math.max(0.35, 1 - smoothstep(85, 135, Math.abs(sunDiff)));
  const gs = glowStrength(sun.altitude) * facing * (1 - 0.6 * cond.cloud) * (1 - 0.5 * cond.fog);
  const curtain = (1 - smoothstep(2, 14, sun.altitude)) * smoothstep(-13, -4, sun.altitude);
  const hours = scene.time / 3_600_000;

  // 1. The first wash: a graded sky, deeper at the top, warmer toward the sun near the horizon.
  eachCell(out, (_, u, v) => {
    let c = mix(P.horizon, P.mid, smoothstep(0, 0.72, v));
    c = mix(c, P.zenith, smoothstep(0.5, 1.02, v));
    c = mix(c, P.deep, smoothstep(0.7, 1, v) * (0.3 + 1.6 * (u - 0.5) * (u - 0.5)));
    const side = Math.exp(-(((u - sunX) * ASPECT * 0.55) ** 2));
    return mix(c, P.warm, side * (1 - v) ** 2 * gs * 0.7);
  });
  for (const w of L.washes) {
    const col = w.role === 'shadow' ? mix(P.shadow, P.mid, 0.55) : P[w.role];
    blob(out, w.x, w.y, w.rx, w.ry, w.rot, col, w.a * STYLE.washAlpha * (1 - 0.5 * cond.fog), 0.9);
  }

  // 2. Light around the sun, and a cream bloom beneath it on cloudy days.
  blob(out, sunX, sunY, 0.62, 0.38, 0, P.glow, gs * 0.85);
  const bloom = smoothstep(0.15, 0.6, cond.cloud) * (1 - smoothstep(0.85, 1, cond.cloud)) * smoothstep(-2, 10, sun.altitude);
  blob(out, clamp(sunX, 0.2, 0.8) + 0.08, 0.12, 0.42, 0.24, 0, P.light, 0.55 * bloom * STYLE.bloomAlpha, 1.0);

  // 3. Moonlight.
  if (moon.altitude > 0) {
    const night = 1 - smoothstep(-8, 2, sun.altitude);
    const k = moon.fraction * night * (1 - 0.6 * cond.cloud);
    if (k > 0.02) {
      const mx = 0.5 + clamp(signedAngle(moon.azimuth - scene.viewAzimuth) / 95, -1.25, 1.25) * 0.34;
      const my = 0.1 + clamp(moon.altitude / 70) * 0.72;
      blob(out, mx, my, 0.45, 0.32, 0, mix(P.highlight, [150, 160, 190], 0.5), 0.22 * k);
      blob(out, mx, my, 0.12, 0.1, 0, [196, 206, 228], 0.4 * k);
    }
  }

  // 4. Brush strokes, laid wet and drifting slowly with the hours.
  const low = Math.max(cond.cloudLow, cond.cloud * 0.8);
  const high = Math.max(cond.cloudHigh, cond.cloud * 0.45);
  const arrive = (s: Stroke, cover: number) => smoothstep(s.threshold - 0.12, s.threshold + 0.08, cover * 1.08);
  const shift = (s: Stroke, span: number) => wrap(L.drift * hours * 0.035 * s.speed + 0.7, span) - 0.35;

  // Wisps first, so lower cloud sits in front of them.
  for (const s of L.wisps) {
    const a = arrive(s, high) * 0.28 * STYLE.wispAlpha;
    if (a <= 0.004) continue;
    layStroke(s.pts, shift(s, 1.7), s.w0, s.w1);
    washStroke(out, mix(P.highlight, P.light, 0.45 + 0.3 * s.shade), a, 0.5);
  }

  // Lit strokes first, then the shadow strokes laid over them, as the teal-olive band sits over the blue.
  for (const pass of ['lit', 'shadow'] as const) {
    for (const s of L.sweeps) {
      const isShadow = s.shade < 0.38;
      if ((pass === 'shadow') !== isShadow) continue;
      const a = arrive(s, low) * (1 - 0.75 * curtain);
      if (a <= 0.004) continue;
      const dx = shift(s, 1.7);
      const mid = catmull(s.pts, 0.5);
      const near = Math.exp(-(((mid[0] + dx - sunX) * ASPECT) ** 2)) * gs;
      // In full daylight the shadow band reads teal-olive; as the sun drops it fades toward the sky
      // itself, so it can never become a dark stripe against a twilight sky.
      const day = smoothstep(4, 18, sun.altitude);
      const shade = mix(mix(P.mid, P.shadow, 0.35 + 0.5 * day), mix(P.deep, P.warm, s.warm), 0.12 * day);
      const lit = mix(mix(P.light, P.highlight, 0.3 * s.warm), P.glow, near * 0.4);
      layStroke(s.pts, dx, s.w0, s.w1);
      if (isShadow) {
        washStroke(out, shade, a * (0.18 + 0.2 * smoothstep(4, 18, sun.altitude)) * STYLE.shadowAlpha, 0.5);
        continue;
      }
      const isWarm = s.warm > 0.78 && mid[1] < 0.2;
      washStroke(out, isWarm ? mix(P.warm, P.light, 0.35) : mix(shade, lit, 0.62 + 0.3 * s.shade), a * (0.28 + 0.12 * s.shade) * STYLE.sweepAlpha, 0.6);
      layStroke(s.pts.map(([px, py]) => [px + 0.03, py + s.w0 * 0.35] as Pt), dx, s.w0 * 0.7, s.w1 * 0.7);
      washStroke(out, lit, a * 0.26 * STYLE.crestAlpha, 0.3);
    }
  }

  if (curtain > 0.01) {
    for (const s of L.curtains) {
      const a = arrive(s, Math.max(low, 0.55)) * curtain;
      if (a <= 0.004) continue;
      const dx = (shift(s, 0.5) - 0.1) * 0.15;
      // Every third column is the cool shadow between the lit ones.
      const cool = s.warm < 0.33;
      const col = cool ? mix(desaturate(P.shadow, 0.2), P.mid, 0.35) : mix(P.light, P.glow, 0.2 + 0.35 * s.shade);
      layStroke(s.pts, dx, s.w0 * (cool ? 0.7 : 1), s.w1 * (cool ? 0.6 : 1), 0.85);
      washStroke(out, col, a * (cool ? 0.45 : 0.62) * STYLE.curtainAlpha, 0.7);
    }
  }

  // 5. Overcast: a soft lid in the sky's own grey, never olive.
  const lid = smoothstep(0.68, 1, Math.max(cond.cloud, cond.snow > 0 ? 0.92 + 0.08 * cond.snow : 0));
  if (lid > 0) {
    const base = mix(mix(P.shadow, P.light, 0.4), P.mid, 0.3);
    const lowLid = desaturate(scale(base, 0.94), 0.62);
    const highLid = desaturate(mix(base, P.light, 0.3), 0.62);
    eachCell(out, (c, _, v) => mix(c, mix(mix(lowLid, highLid, v), c, 0.3), lid * 0.82));
  }

  // 6. Rain and storm: darker, greyer, faint falling streaks.
  const wet = Math.max(cond.rain, cond.storm);
  if (wet > 0) {
    const stormTint = mix(scale(P.shadow, 0.55), [70, 66, 88], 0.3);
    eachCell(out, (c) => mix(scale(desaturate(c, 0.45 * wet), 1 - 0.22 * cond.rain), stormTint, cond.storm * 0.5));
    const streak = scale(desaturate(P.mid, 0.4), 0.8);
    for (const s of L.streaks) {
      const x = -0.1 + wrap(s * 1.2 + L.drift * hours * 0.05, 1.2);
      blob(out, x, 0.3, 0.035, 0.42, 0.08 * L.drift, streak, 0.2 * cond.rain);
    }
  }

  // 7. Land at dusk and night.
  const dark = (1 - smoothstep(-3, 9, sun.altitude)) * (1 - 0.7 * cond.fog);
  if (dark > 0.01) for (const m of L.mounds) blob(out, m.x, -0.1, m.rx * 1.6, m.ry * 0.8, 0, mix(P.ground, P.horizon, 0.35), 0.55 * dark, 1.0);

  // 8. Snow brightens and cools.
  if (cond.snow > 0) {
    eachCell(out, (c) => {
      const y = luminance(c);
      return mix(desaturate(c, 0.55 * cond.snow), [y * 0.96 + 16, y + 18, y * 1.05 + 22], 0.32 * cond.snow);
    });
  }

  // 9. Fog veils, heaviest near the ground.
  if (cond.fog > 0) {
    const fog = desaturate(mix(mix(P.horizon, P.mid, 0.4), P.highlight, 0.25), 0.35);
    eachCell(out, (c, _, v) => mix(c, fog, cond.fog * 0.82 * (0.55 + 0.45 * (1 - v))));
  }

  for (let k = 0; k < out.length; k++) out[k] = clamp(out[k], 0, 255);
  return out;
}

/** Average colour of the plate (or a horizontal band of it, v from 0 bottom to 1 top). */
export function plateAverage(plate: Plate, v0 = 0, v1 = 1): RGB {
  const sum: RGB = [0, 0, 0];
  let n = 0;
  for (let j = 0; j < PLATE_H; j++) {
    const v = 1 - (j + 0.5) / PLATE_H;
    if (v < v0 || v > v1) continue;
    for (let i = 0; i < PLATE_W; i++) {
      const k = (j * PLATE_W + i) * 3;
      sum[0] += plate[k]; sum[1] += plate[k + 1]; sum[2] += plate[k + 2];
      n++;
    }
  }
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

/** Light or dark text reads best on this sky. */
export function foregroundFor(plate: Plate): 'light' | 'dark' {
  return luminance(plateAverage(plate, 0.2, 0.8)) > 150 ? 'dark' : 'light';
}
