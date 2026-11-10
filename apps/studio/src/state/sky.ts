import { useEffect, useMemo, useState } from 'react';
import {
  type Conditions, type Forecast, type Place, type Plate, type SceneInput,
  conditionsAt, fetchForecast, paintPlate, placeQueryFromTimezone, presetConditions, sceneFor, searchPlaces, seedFor, phaseOf, describe,
  plateAverage, toHex,
} from 'skytone';
import { whenIdle } from '../lib/swatch.ts';
import { FALLBACK_PLACE, placeKey, useStudio } from './studio.ts';
import { HOUR, offsetMs } from '../lib/time.ts';

const weatherOpts = {
  baseUrl: import.meta.env.VITE_OPEN_METEO_URL as string | undefined,
  apiKey: import.meta.env.VITE_OPEN_METEO_KEY as string | undefined,
};

// Legacy zone names some systems still report, mapped to the city's current name.
const LEGACY_CITY: Record<string, string> = {
  Calcutta: 'Kolkata', Saigon: 'Ho Chi Minh City', Kiev: 'Kyiv', Katmandu: 'Kathmandu', Rangoon: 'Yangon',
  Bombay: 'Mumbai', Ulan_Bator: 'Ulaanbaatar', Godthab: 'Nuuk', Dacca: 'Dhaka', Thimbu: 'Thimphu',
};

/**
 * Where the visitor probably is, from the device timezone alone (no permission prompt).
 * A result only counts if its zone keeps the same clock as the device right now.
 */
export async function guessPlace(): Promise<Place> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const raw = placeQueryFromTimezone(tz);
  if (!raw) return FALLBACK_PLACE;
  const q = LEGACY_CITY[raw.replace(/ /g, '_')] ?? raw;
  try {
    const now = Date.now();
    const device = offsetMs(now, tz);
    const results = await searchPlaces(q, weatherOpts);
    return (
      results.find((r) => r.timezone === tz) ??
      results.find((r) => offsetMs(now, r.timezone) === device) ??
      FALLBACK_PLACE
    );
  } catch {
    return FALLBACK_PLACE;
  }
}

export const findPlaces = (q: string, signal?: AbortSignal) => searchPlaces(q, { ...weatherOpts, signal });

/** Make sure there is a place, then keep its forecast fresh. */
export function useWeatherSync() {
  const place = useStudio((s) => s.place);
  const setPlace = useStudio((s) => s.setPlace);
  const setForecast = useStudio((s) => s.setForecast);

  useEffect(() => {
    if (!place) guessPlace().then((p) => useStudio.getState().place ?? setPlace(p));
  }, [place, setPlace]);

  const key = place ? placeKey(place) : null;
  useEffect(() => {
    const p = useStudio.getState().place;
    if (!key || !p) return;
    const ctrl = new AbortController();
    const load = () => {
      const s = useStudio.getState();
      setForecast(key, s.forecastFor === key ? s.forecast : null, 'loading');
      fetchForecast(p.latitude, p.longitude, { ...weatherOpts, signal: ctrl.signal })
        .then((f) => {
          setForecast(key, f, 'ready');
          const now = useStudio.getState().place;
          if (now && placeKey(now) === key && f.timezone && f.timezone !== now.timezone) setPlace({ ...now, timezone: f.timezone });
        })
        .catch((e) => {
          if (e?.name !== 'AbortError') setForecast(key, useStudio.getState().forecast, 'error');
        });
    };
    load();
    const id = setInterval(load, 30 * 60_000);
    return () => { ctrl.abort(); clearInterval(id); };
  }, [key, setForecast, setPlace]);
}

/** Follow the real clock while live; advance an hour per second while playing. */
export function useClock() {
  const live = useStudio((s) => s.live);
  const playing = useStudio((s) => s.playing);

  useEffect(() => {
    if (!live) return;
    const tick = () => useStudio.setState({ time: Date.now() });
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [live]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      useStudio.setState((s) => ({ time: s.time + dt * HOUR }));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}

export function conditionsFor(
  s: { weatherMode: 'live' | 'custom'; preset: Parameters<typeof presetConditions>[0]; intensity: number },
  forecast: Forecast | null,
  time: number,
): { conditions: Conditions; known: boolean } {
  const live = conditionsAt(forecast, time);
  if (s.weatherMode === 'live') return live;
  const c = presetConditions(s.preset, s.intensity);
  if (live.known) {
    c.windSpeed = Math.max(c.windSpeed, live.conditions.windSpeed);
    c.windDirection = live.conditions.windDirection;
    c.temperature = live.conditions.temperature;
  }
  return { conditions: c, known: true };
}

export function makeScene(place: Place, time: number, conditions: Conditions, variation: number): SceneInput {
  return sceneFor({
    latitude: place.latitude, longitude: place.longitude, time, conditions,
    seed: (seedFor(place.latitude, place.longitude) + variation * 2654435761) >>> 0,
  });
}

/** About 10 MB of plates: a day scrubbed at a few minutes' resolution. */
const PLATE_CACHE = 96;

export interface SkyView {
  place: Place;
  scene: SceneInput;
  plate: Plate;
  conditions: Conditions;
  known: boolean;
  phase: ReturnType<typeof phaseOf>;
  summary: ReturnType<typeof describe>;
  /** A plate painter for any instant with the current settings (timeline, video). */
  plateAt: (time: number) => Plate;
}

export function useSky(opts: { forecastOnly?: boolean } = {}): SkyView {
  const place = useStudio((s) => s.place) ?? FALLBACK_PLACE;
  const time = useStudio((s) => s.time);
  const storedMode = useStudio((s) => s.weatherMode);
  const weatherMode = opts.forecastOnly ? 'live' : storedMode;
  const preset = useStudio((s) => s.preset);
  const intensity = useStudio((s) => s.intensity);
  const storedVariation = useStudio((s) => s.variation);
  const variation = opts.forecastOnly ? 0 : storedVariation;
  const forecast = useStudio((s) => s.forecast);

  // Painting is deterministic for a given instant and settings, so plates are kept
  // and reused: scrubbing back over an hour costs nothing, and the plate is the same
  // one an export would paint.
  const plateAt = useMemo(() => {
    const cache = new Map<number, Plate>();
    return (t: number) => {
      const hit = cache.get(t);
      if (hit) {
        cache.delete(t);
        cache.set(t, hit);
        return hit;
      }
      const { conditions } = conditionsFor({ weatherMode, preset, intensity }, forecast, t);
      const plate = paintPlate(makeScene(place, t, conditions, variation));
      cache.set(t, plate);
      if (cache.size > PLATE_CACHE) cache.delete(cache.keys().next().value!);
      return plate;
    };
  }, [place, weatherMode, preset, intensity, variation, forecast]);

  return useMemo(() => {
    const { conditions, known } = conditionsFor({ weatherMode, preset, intensity }, forecast, time);
    const scene = makeScene(place, time, conditions, variation);
    return {
      place, scene, conditions, known, plateAt,
      plate: plateAt(time),
      phase: phaseOf(scene.sun.altitude),
      summary: describe(conditions),
    };
  }, [place, time, weatherMode, preset, intensity, variation, forecast, plateAt]);
}

export interface DaySwatch {
  /** Morning, midday and evening colours as a left-to-right gradient. */
  ribbon: string;
  /** Midday colour. */
  noon: string;
}

/** A small painted swatch for each day in a range, computed when the browser is idle. */
export function useDaySwatches(sky: SkyView, days: number[]): Map<number, DaySwatch> {
  const [swatches, setSwatches] = useState(() => new Map<number, DaySwatch>());
  const { plateAt, place } = sky;
  const key = days.join(',');
  useEffect(() => {
    let cancelled = false;
    const out = new Map<number, DaySwatch>();
    const queue = [...days];
    const work = () => {
      if (cancelled) return;
      const until = performance.now() + 12;
      while (queue.length && performance.now() < until) {
        const d = queue.shift()!;
        const at = (h: number) => toHex(plateAverage(plateAt(d + h * HOUR), 0.25, 0.9));
        const noon = at(12.5);
        out.set(d, { noon, ribbon: `linear-gradient(90deg, ${at(6.5)}, ${at(9)} 25%, ${noon} 50%, ${at(16)} 72%, ${at(18.2)})` });
      }
      setSwatches(new Map(out));
      if (queue.length) cancel = whenIdle(work);
    };
    let cancel = whenIdle(work);
    return () => { cancelled = true; cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, plateAt, place.timezone]);
  return swatches;
}

export function useReducedMotion() {
  const [reduce, setReduce] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}
