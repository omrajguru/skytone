import { type Conditions, lerpConditions, SEASONAL_CONDITIONS } from './conditions.ts';
import { clamp, smoothstep } from './color.ts';

export interface Place {
  name: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  /** IANA zone, e.g. "Asia/Kolkata". */
  timezone: string;
}

export interface Forecast {
  latitude: number;
  longitude: number;
  timezone: string;
  /** Hour starts, epoch ms. */
  times: number[];
  hours: Conditions[];
  /** Raw readings for display, aligned with `times`. */
  readings: { cloudCover: number; precipitation: number; snowfall: number; code: number; windKmh: number; temperature: number }[];
}

export interface OpenMeteoOptions {
  /** Override for the commercial endpoint, e.g. https://customer-api.open-meteo.com */
  baseUrl?: string;
  geocodingUrl?: string;
  apiKey?: string;
  pastDays?: number;
  forecastDays?: number;
  signal?: AbortSignal;
}

const HOURLY = [
  'cloud_cover', 'cloud_cover_low', 'cloud_cover_high', 'precipitation', 'rain', 'snowfall',
  'weather_code', 'visibility', 'wind_speed_10m', 'wind_direction_10m', 'temperature_2m',
] as const;

type HourlyResponse = {
  latitude: number;
  longitude: number;
  timezone: string;
  hourly: Record<(typeof HOURLY)[number], (number | null)[]> & { time: number[] };
};

const n = (v: number | null | undefined, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** WMO weather code + readings → normalised conditions. */
export function conditionsFromReading(r: {
  cloud: number; low: number; high: number; precip: number; rain: number; snowfall: number;
  code: number; visibility: number; wind: number; windDir: number; temp: number | null;
}): Conditions {
  const fogCode = r.code === 45 || r.code === 48 ? 0.75 : 0;
  const fogVis = 1 - smoothstep(400, 4000, r.visibility);
  const snowCode = r.code >= 71 && r.code <= 77 ? 0.35 : r.code === 85 || r.code === 86 ? 0.5 : 0;
  return {
    cloud: clamp(r.cloud / 100),
    cloudLow: clamp(r.low / 100),
    cloudHigh: clamp(r.high / 100),
    rain: clamp(Math.max(smoothstep(0.05, 4, r.rain), r.code >= 51 && r.code <= 67 ? 0.25 : 0, r.code >= 80 && r.code <= 82 ? 0.45 : 0)),
    snow: clamp(Math.max(smoothstep(0.02, 1.5, r.snowfall), snowCode)),
    fog: clamp(Math.max(fogCode, fogVis)),
    storm: r.code >= 95 ? (r.code === 99 ? 1 : r.code === 96 ? 0.8 : 0.6) : 0,
    windSpeed: r.wind / 3.6,
    windDirection: r.windDir,
    temperature: r.temp,
  };
}

export async function fetchForecast(latitude: number, longitude: number, opts: OpenMeteoOptions = {}): Promise<Forecast> {
  const base = opts.baseUrl ?? 'https://api.open-meteo.com';
  const q = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: HOURLY.join(','),
    timezone: 'auto',
    timeformat: 'unixtime',
    past_days: String(opts.pastDays ?? 7),
    forecast_days: String(opts.forecastDays ?? 16),
  });
  if (opts.apiKey) q.set('apikey', opts.apiKey);
  const res = await fetch(`${base}/v1/forecast?${q}`, { signal: opts.signal });
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  const data = (await res.json()) as HourlyResponse;
  const h = data.hourly;
  const times = h.time.map((s) => s * 1000);
  const hours: Conditions[] = [];
  const readings: Forecast['readings'] = [];
  for (let i = 0; i < times.length; i++) {
    const reading = {
      cloud: n(h.cloud_cover[i]), low: n(h.cloud_cover_low[i]), high: n(h.cloud_cover_high[i]),
      precip: n(h.precipitation[i]), rain: n(h.rain[i]), snowfall: n(h.snowfall[i]),
      code: n(h.weather_code[i]), visibility: n(h.visibility[i], 20000),
      wind: n(h.wind_speed_10m[i]), windDir: n(h.wind_direction_10m[i], 250),
      temp: h.temperature_2m[i] ?? null,
    };
    hours.push(conditionsFromReading(reading));
    readings.push({
      cloudCover: reading.cloud, precipitation: reading.precip, snowfall: reading.snowfall,
      code: reading.code, windKmh: reading.wind, temperature: n(reading.temp),
    });
  }
  return { latitude: data.latitude, longitude: data.longitude, timezone: data.timezone, times, hours, readings };
}

/** Conditions at any instant: interpolated inside the forecast, seasonal outside it. */
export function conditionsAt(forecast: Forecast | null, time: number): { conditions: Conditions; known: boolean; index: number } {
  if (!forecast || forecast.times.length === 0) return { conditions: SEASONAL_CONDITIONS, known: false, index: -1 };
  const t = forecast.times;
  const HOUR = 3_600_000;
  if (time < t[0] - HOUR || time > t[t.length - 1] + HOUR) return { conditions: SEASONAL_CONDITIONS, known: false, index: -1 };
  let i = Math.floor((time - t[0]) / HOUR);
  i = Math.max(0, Math.min(t.length - 1, i));
  const j = Math.min(t.length - 1, i + 1);
  const k = j === i ? 0 : clamp((time - t[i]) / (t[j] - t[i]));
  return { conditions: lerpConditions(forecast.hours[i], forecast.hours[j], k), known: true, index: k < 0.5 ? i : j };
}

export async function searchPlaces(query: string, opts: OpenMeteoOptions = {}): Promise<Place[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const base = opts.geocodingUrl ?? 'https://geocoding-api.open-meteo.com';
  const q = new URLSearchParams({ name: term, count: '6', language: 'en', format: 'json' });
  if (opts.apiKey) q.set('apikey', opts.apiKey);
  const res = await fetch(`${base}/v1/search?${q}`, { signal: opts.signal });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const data = (await res.json()) as {
    results?: { name: string; latitude: number; longitude: number; country?: string; admin1?: string; timezone?: string }[];
  };
  return (data.results ?? []).map((r) => ({
    name: r.name,
    region: r.admin1,
    country: r.country,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone ?? 'UTC',
  }));
}

/**
 * A place guessed from the device timezone alone: no permission prompt, no network.
 * "Asia/Kolkata" → search "Kolkata". Callers refine it with geolocation if granted.
 */
export function placeQueryFromTimezone(tz = Intl.DateTimeFormat().resolvedOptions().timeZone): string | null {
  const city = tz.split('/').pop();
  if (!city || city === 'UTC' || city.startsWith('GMT')) return null;
  return city.replace(/_/g, ' ');
}
