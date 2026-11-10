import { clamp } from './color.ts';

/** Everything the painter needs to know about the weather, normalised to 0..1. */
export interface Conditions {
  /** Total cloud cover. */
  cloud: number;
  /** Low cloud: heavy masses near the horizon. */
  cloudLow: number;
  /** High cloud: thin wisps up top. */
  cloudHigh: number;
  rain: number;
  snow: number;
  fog: number;
  storm: number;
  /** Metres per second. */
  windSpeed: number;
  /** Degrees the wind blows *from*, clockwise from north. */
  windDirection: number;
  /** Celsius, when known. */
  temperature: number | null;
}

export type ConditionPreset =
  | 'clear'
  | 'partly'
  | 'cloudy'
  | 'overcast'
  | 'rain'
  | 'snow'
  | 'fog'
  | 'storm';

export const CONDITION_PRESETS: { id: ConditionPreset; name: string }[] = [
  { id: 'clear', name: 'Clear' },
  { id: 'partly', name: 'Partly cloudy' },
  { id: 'cloudy', name: 'Cloudy' },
  { id: 'overcast', name: 'Overcast' },
  { id: 'rain', name: 'Rain' },
  { id: 'snow', name: 'Snow' },
  { id: 'fog', name: 'Fog' },
  { id: 'storm', name: 'Storm' },
];

const base = (o: Partial<Conditions>): Conditions => ({
  cloud: 0, cloudLow: 0, cloudHigh: 0, rain: 0, snow: 0, fog: 0, storm: 0,
  windSpeed: 4, windDirection: 250, temperature: null, ...o,
});

/** A preset at a given intensity (0..1). Intensity 0.5 is the typical case. */
export function presetConditions(preset: ConditionPreset, intensity = 0.5): Conditions {
  const k = clamp(intensity);
  switch (preset) {
    case 'clear':
      return base({ cloud: 0.05 * k, cloudHigh: 0.25 * k, cloudLow: 0.02 });
    case 'partly':
      return base({ cloud: 0.3 + 0.2 * k, cloudLow: 0.35 + 0.25 * k, cloudHigh: 0.3 });
    case 'cloudy':
      return base({ cloud: 0.6 + 0.2 * k, cloudLow: 0.7 + 0.2 * k, cloudHigh: 0.45 });
    case 'overcast':
      return base({ cloud: 0.88 + 0.12 * k, cloudLow: 0.95, cloudHigh: 0.6 });
    case 'rain':
      return base({ cloud: 0.92, cloudLow: 0.95, cloudHigh: 0.5, rain: 0.25 + 0.75 * k, windSpeed: 6 });
    case 'snow':
      return base({ cloud: 0.9, cloudLow: 0.9, cloudHigh: 0.4, snow: 0.3 + 0.7 * k, windSpeed: 3 });
    case 'fog':
      return base({ cloud: 0.5, cloudLow: 0.6, fog: 0.4 + 0.6 * k, windSpeed: 1 });
    case 'storm':
      return base({ cloud: 1, cloudLow: 1, cloudHigh: 0.7, rain: 0.8, storm: 0.4 + 0.6 * k, windSpeed: 11 });
  }
}

export function lerpConditions(a: Conditions, b: Conditions, t: number): Conditions {
  const l = (x: number, y: number) => x + (y - x) * t;
  const dir = a.windDirection + ((((b.windDirection - a.windDirection) % 360) + 540) % 360 - 180) * t;
  return {
    cloud: l(a.cloud, b.cloud),
    cloudLow: l(a.cloudLow, b.cloudLow),
    cloudHigh: l(a.cloudHigh, b.cloudHigh),
    rain: l(a.rain, b.rain),
    snow: l(a.snow, b.snow),
    fog: l(a.fog, b.fog),
    storm: l(a.storm, b.storm),
    windSpeed: l(a.windSpeed, b.windSpeed),
    windDirection: (dir + 360) % 360,
    temperature: a.temperature === null || b.temperature === null ? a.temperature ?? b.temperature : l(a.temperature, b.temperature),
  };
}

/** A believable sky for dates outside any forecast: some cloud, nothing falling. */
export const SEASONAL_CONDITIONS: Conditions = base({ cloud: 0.32, cloudLow: 0.4, cloudHigh: 0.35 });

/** Which preset best describes some conditions (for labels). */
export function describe(c: Conditions): ConditionPreset {
  if (c.storm > 0.3) return 'storm';
  if (c.snow > 0.15) return 'snow';
  if (c.rain > 0.15) return 'rain';
  if (c.fog > 0.4) return 'fog';
  if (c.cloud > 0.85) return 'overcast';
  if (c.cloud > 0.55) return 'cloudy';
  if (c.cloud > 0.2) return 'partly';
  return 'clear';
}
