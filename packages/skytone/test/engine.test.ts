import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunEvents, sunPosition } from '../src/astro.ts';
import { skyAt } from '../src/scene.ts';
import { presetConditions } from '../src/conditions.ts';
import { plateAverage } from '../src/plate.ts';
import { luminance, rgbToOklab } from '../src/color.ts';
import { plateToSVG } from '../src/still.ts';

const minutes = (a: number, b: number) => Math.abs(a - b) / 60_000;

test('Mumbai sunrise and sunset match published times within 3 minutes', () => {
  // 10 Nov 2026, IST (UTC+5:30). Published: sunrise 06:43, sunset 18:04.
  const start = Date.parse('2026-11-10T00:00:00+05:30');
  const ev = sunEvents(start, 19.076, 72.877);
  assert.ok(ev.sunrise && ev.sunset);
  assert.ok(minutes(ev.sunrise!, Date.parse('2026-11-10T06:43:00+05:30')) < 3, new Date(ev.sunrise!).toISOString());
  assert.ok(minutes(ev.sunset!, Date.parse('2026-11-10T18:04:00+05:30')) < 3, new Date(ev.sunset!).toISOString());
});

test('London midsummer sunrise and sunset match published times within 3 minutes', () => {
  const start = Date.parse('2026-06-21T00:00:00+01:00');
  const ev = sunEvents(start, 51.5074, -0.1278);
  assert.ok(minutes(ev.sunrise!, Date.parse('2026-06-21T04:43:00+01:00')) < 3, new Date(ev.sunrise!).toISOString());
  assert.ok(minutes(ev.sunset!, Date.parse('2026-06-21T21:21:00+01:00')) < 3, new Date(ev.sunset!).toISOString());
});

test('polar night in Tromsø: the sun never rises at midwinter', () => {
  const ev = sunEvents(Date.parse('2026-12-21T00:00:00+01:00'), 69.6492, 18.9553);
  assert.equal(ev.always, 'down');
});

test('the sun is in the south at local noon in the northern hemisphere', () => {
  const s = sunPosition(Date.parse('2026-11-10T12:30:00+05:30'), 19.076, 72.877);
  assert.ok(s.azimuth > 160 && s.azimuth < 200, String(s.azimuth));
  assert.ok(s.altitude > 45);
});

const at = (iso: string, preset: Parameters<typeof presetConditions>[0] = 'partly') =>
  skyAt({ latitude: 19.076, longitude: 72.877, time: Date.parse(iso), conditions: presetConditions(preset) });

test('plates are deterministic', () => {
  const a = at('2026-11-10T10:00:00+05:30').plate;
  const b = at('2026-11-10T10:00:00+05:30').plate;
  assert.deepEqual(Array.from(a), Array.from(b));
});

test('day is brighter than dusk, dusk brighter than night', () => {
  const day = luminance(plateAverage(at('2026-11-10T11:00:00+05:30').plate));
  const dusk = luminance(plateAverage(at('2026-11-10T18:25:00+05:30').plate));
  const night = luminance(plateAverage(at('2026-11-10T23:30:00+05:30').plate));
  assert.ok(day > dusk && dusk > night, `${day} ${dusk} ${night}`);
});

test('sunset is warmer than midday', () => {
  const chroma = (iso: string) => rgbToOklab(plateAverage(at(iso).plate, 0, 0.5))[1];
  assert.ok(chroma('2026-11-10T17:58:00+05:30') > chroma('2026-11-10T12:00:00+05:30') + 0.02);
});

test('overcast is greyer than clear', () => {
  const sat = (preset: 'clear' | 'overcast') => {
    const [, a, b] = rgbToOklab(plateAverage(at('2026-11-10T11:00:00+05:30', preset).plate));
    return Math.hypot(a, b);
  };
  assert.ok(sat('overcast') < sat('clear') * 0.7, `${sat('overcast')} ${sat('clear')}`);
});

test('plate values stay in range', () => {
  for (const p of ['clear', 'rain', 'snow', 'fog', 'storm'] as const) {
    for (const v of at('2026-11-10T06:50:00+05:30', p).plate) assert.ok(v >= 0 && v <= 255);
  }
});

test('SVG export covers the frame and is well formed', () => {
  const svg = plateToSVG(at('2026-11-10T10:00:00+05:30').plate, 1179, 2556);
  assert.match(svg, /^<svg[^>]+width="1179" height="2556"/);
  assert.ok(svg.endsWith('</svg>'));
  assert.ok(svg.length < 400_000, String(svg.length));
});
