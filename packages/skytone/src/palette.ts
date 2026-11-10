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

export type Key = { alt: number } & Palette;

// The day, sunset (1°) and dusk (−9°) keys are fitted to a reference watercolour sky, band by band in OKLab.
// Keyed by sun altitude in degrees, never by clock time: 6 pm in Oslo in December
// and 6 pm in Mumbai in June are different skies.
/** Palette keyframes by sun altitude. Exported for tuning tools; treat as read-only. */
export const KEYS: Key[] = [
  {
    alt: -18,
    zenith: [16, 21, 38], mid: [24, 31, 52], horizon: [36, 40, 60], deep: [12, 16, 31],
    highlight: [34, 42, 66], light: [46, 52, 78], shadow: [22, 26, 44], warm: [34, 34, 50],
    ground: [14, 14, 22], glow: [60, 66, 98],
  },
  {
    alt: -9,
    zenith: [69, 81, 101], mid: [66, 82, 114], horizon: [69, 69, 75], deep: [62, 75, 95],
    highlight: [94, 99, 121], light: [95, 100, 123], shadow: [60, 71, 100], warm: [76, 69, 76],
    ground: [54, 48, 48], glow: [121, 103, 123],
  },
  {
    alt: -4,
    zenith: [70, 83, 110], mid: [104, 106, 134], horizon: [150, 124, 136], deep: [62, 76, 104],
    highlight: [122, 122, 150], light: [176, 132, 144], shadow: [96, 98, 124], warm: [168, 122, 128],
    ground: [92, 80, 88], glow: [214, 146, 140],
  },
  {
    alt: 1,
    zenith: [120, 135, 152], mid: [177, 152, 170], horizon: [135, 123, 129], deep: [105, 123, 146],
    highlight: [181, 164, 176], light: [220, 150, 140], shadow: [159, 146, 160], warm: [171, 141, 134],
    ground: [112, 117, 133], glow: [217, 164, 141],
  },
  {
    alt: 8,
    zenith: [80, 110, 148], mid: [140, 148, 166], horizon: [218, 196, 172], deep: [70, 100, 140],
    highlight: [152, 166, 186], light: [248, 232, 206], shadow: [166, 152, 136], warm: [222, 184, 152],
    ground: [218, 196, 172], glow: [252, 220, 176],
  },
  {
    alt: 30,
    zenith: [59, 98, 133], mid: [55, 103, 141], horizon: [224, 228, 214], deep: [52, 88, 122],
    highlight: [70, 119, 163], light: [224, 229, 223], shadow: [109, 123, 113], warm: [202, 181, 141],
    ground: [210, 220, 212], glow: [255, 255, 238],
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
