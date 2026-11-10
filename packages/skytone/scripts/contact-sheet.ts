// Paints a grid of skies (hours × conditions) and writes raw plates for ffmpeg to upscale
// with a cubic B-spline (the same filter the shader uses). Usage:
//   node --experimental-strip-types scripts/contact-sheet.ts <outDir> [lat] [lon] [isoDate] [tzOffset]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { skyAt } from '../src/scene.ts';
import { presetConditions, type ConditionPreset } from '../src/conditions.ts';
import { PLATE_W, PLATE_H } from '../src/plate.ts';

const [out = 'sheet', lat = '22.5626', lon = '88.3630', date = '2026-11-10', tz = '+05:30'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const hours = ['05:15', '05:50', '06:30', '09:00', '13:00', '16:40', '17:10', '17:35', '18:05', '21:30'];
const conditions: ConditionPreset[] = ['clear', 'partly', 'cloudy', 'overcast', 'rain', 'fog', 'snow', 'storm'];

let n = 0;
for (const c of conditions) {
  for (const h of hours) {
    const time = Date.parse(`${date}T${h}:00${tz}`);
    const { plate } = skyAt({ latitude: +lat, longitude: +lon, time, conditions: presetConditions(c) });
    const bytes = new Uint8Array(PLATE_W * PLATE_H * 3);
    for (let i = 0; i < plate.length; i++) bytes[i] = Math.round(plate[i]);
    writeFileSync(join(out, `${String(n++).padStart(3, '0')}.rgb`), bytes);
  }
}
console.log(`${n} plates · rows: ${conditions.join(', ')} · cols: ${hours.join(' ')}`);
