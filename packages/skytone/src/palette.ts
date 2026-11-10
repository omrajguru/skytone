import { type RGB, mixOklab, smoothstep, mix } from './color.ts';

export interface Palette {
  zenith: RGB;
  mid: RGB;
  horizon: RGB;
  /** Deeper sky pooled at the top of the frame. */
  deep: RGB;
  /** Pale sky showing between masses. */
  highlight: RGB;
  /** The lit side of cloud. */
  light: RGB;
  /** The shaded side of cloud. */
  shadow: RGB;
  /** Warm dust near the horizon. */
  warm: RGB;
  /** Land silhouette at dusk and night. */
  ground: RGB;
  /** Light around the sun. */
  glow: RGB;
}

type Key = { alt: number } & Palette;

// Keyed by sun altitude in degrees, never by clock time: 6 pm in Oslo in December
// and 6 pm in Mumbai in June are different skies.
const KEYS: Key[] = [
  {
    alt: -18,
    zenith: [16, 21, 38], mid: [24, 31, 52], horizon: [36, 40, 60], deep: [12, 16, 31],
    highlight: [34, 42, 66], light: [46, 52, 78], shadow: [22, 26, 44], warm: [34, 34, 50],
    ground: [14, 14, 22], glow: [60, 66, 98],
  },
  {
    alt: -9,
    zenith: [52, 63, 88], mid: [68, 77, 104], horizon: [86, 84, 104], deep: [46, 57, 82],
    highlight: [84, 90, 118], light: [96, 100, 128], shadow: [62, 68, 94], warm: [88, 80, 96],
    ground: [62, 56, 64], glow: [128, 110, 136],
  },
  {
    alt: -4,
    zenith: [70, 83, 110], mid: [104, 106, 134], horizon: [150, 124, 136], deep: [62, 76, 104],
    highlight: [122, 122, 150], light: [176, 132, 144], shadow: [96, 98, 124], warm: [168, 122, 128],
    ground: [92, 80, 88], glow: [214, 146, 140],
  },
  {
    alt: 1,
    zenith: [112, 126, 150], mid: [152, 142, 162], horizon: [200, 152, 152], deep: [98, 114, 144],
    highlight: [166, 156, 176], light: [228, 154, 144], shadow: [140, 138, 154], warm: [218, 162, 150],
    ground: [150, 136, 146], glow: [246, 176, 150],
  },
  {
    alt: 8,
    zenith: [80, 110, 148], mid: [140, 148, 166], horizon: [218, 196, 172], deep: [70, 100, 140],
    highlight: [152, 166, 186], light: [248, 232, 206], shadow: [166, 152, 136], warm: [222, 184, 152],
    ground: [218, 196, 172], glow: [252, 220, 176],
  },
  {
    alt: 30,
    zenith: [62, 98, 135], mid: [100, 135, 165], horizon: [192, 206, 210], deep: [55, 88, 125],
    highlight: [104, 146, 180], light: [238, 240, 232], shadow: [142, 146, 130], warm: [182, 166, 140],
    ground: [192, 206, 210], glow: [255, 250, 236],
  },
];

const ROLES = Object.keys(KEYS[0]).filter((k) => k !== 'alt') as (keyof Palette)[];

// Mornings run a touch cooler and peachier than evenings.
const SUNRISE_TINT: Partial<Palette> = {
  light: [246, 186, 160], horizon: [214, 168, 158], glow: [252, 196, 164], warm: [226, 178, 156],
};

export function paletteAt(altitude: number, rising = false): Palette {
  let i = 0;
  while (i < KEYS.length - 2 && altitude > KEYS[i + 1].alt) i++;
  const t = smoothstep(KEYS[i].alt, KEYS[i + 1].alt, altitude);
  const out = {} as Palette;
  for (const role of ROLES) out[role] = mixOklab(KEYS[i][role], KEYS[i + 1][role], t);
  if (rising) {
    const k = 1 - smoothstep(0, 10, Math.abs(altitude - 1));
    for (const [role, tint] of Object.entries(SUNRISE_TINT) as [keyof Palette, RGB][]) {
      out[role] = mix(out[role], tint, k * 0.45);
    }
  }
  return out;
}
