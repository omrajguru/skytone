// Writes generated plates as JSON ({ w, h, [name]: number[] }) for offline rendering checks.
//   node --experimental-strip-types scripts/dump-plates.ts <out.json>
import { writeFileSync } from 'node:fs';
import { skyAt } from '../src/scene.ts';
import { presetConditions, type ConditionPreset } from '../src/conditions.ts';
import { PLATE_W, PLATE_H } from '../src/plate.ts';

const out: Record<string, unknown> = { w: PLATE_W, h: PLATE_H };
const shots: [string, string, ConditionPreset][] = [
  ['overcast', '10:30', 'overcast'],
  ['partly', '09:30', 'partly'],
  ['cloudy', '15:00', 'cloudy'],
  ['sunset', '16:55', 'partly'],
  ['dusk', '17:25', 'cloudy'],
  ['rain', '13:00', 'rain'],
  ['twilight', '17:13', 'partly'],
  ['twicloud', '17:13', 'cloudy'],
];
for (const [name, hm, preset] of shots) {
  const { plate } = skyAt({ latitude: 22.5626, longitude: 88.363, time: Date.parse(`2026-11-10T${hm}:00+05:30`), conditions: presetConditions(preset) });
  out[name] = Array.from(plate, (v) => Math.round(v));
}
writeFileSync(process.argv[2] ?? 'plates.json', 'window.PLATES = ' + JSON.stringify(out) + ';\n');
