import { useEffect, useState } from 'react';
import { type Plate, type RGB, oklabToRgb, plateAverage, rgbToOklab, toHex } from 'skytone';

/**
 * A light page palette taken from the sky overhead right now: paper from the horizon,
 * ink from the zenith. Lightness is fixed so contrast holds at any hour.
 */
export function skyTheme(plate: Plate) {
  // Hue from the upper sky, which is where the day's colour lives (blue, lilac, indigo);
  // the horizon's warm haze would turn every morning into the same cream.
  const low = rgbToOklab(plateAverage(plate, 0.5, 1));
  const top = rgbToOklab(plateAverage(plate, 0.7, 1));
  const at = (L: number, src: RGB, k: number) => toHex(oklabToRgb([L, src[1] * k, src[2] * k]));
  // Ink stays near neutral: a strongly tinted dark would read as navy at midday.
  const ink = oklabToRgb([0.2, top[1] * 0.1, top[2] * 0.1]);
  return {
    '--paper': at(0.962, low, 0.32),
    '--paper-2': at(0.915, low, 0.42),
    '--card': at(0.985, low, 0.18),
    '--ink': toHex(ink),
    '--ink-2': at(0.44, top, 0.12),
    '--ink-3': at(0.58, top, 0.12),
    '--rule': `rgb(${ink.map(Math.round).join(' ')} / 0.12)`,
  } as Record<string, string>;
}
import { DAY } from './time.ts';

/** Three horizontal bands of a plate, top to bottom, as hex colours. */
export function bands(plate: Plate): [string, string, string] {
  return [toHex(plateAverage(plate, 0.68, 1)), toHex(plateAverage(plate, 0.33, 0.68)), toHex(plateAverage(plate, 0, 0.33))];
}

/** A vertical gradient that reads as a tiny sky. */
export const miniSky = (plate: Plate) => {
  const [a, b, c] = bands(plate);
  return `linear-gradient(180deg, ${a}, ${b} 55%, ${c})`;
};

/**
 * A span of time as a horizontal ribbon of its sky colours, painted a few plates at a time
 * while the browser is idle, so a long day never blocks a frame.
 */
export function useRibbon(plateAt: (t: number) => Plate, start: number, span = DAY, stops = 48) {
  const [ribbon, setRibbon] = useState('');
  useEffect(() => {
    let cancelled = false;
    const parts: string[] = [];
    let i = 0;
    const work = () => {
      if (cancelled) return;
      const until = performance.now() + 10;
      while (i <= stops && performance.now() < until) {
        const c = plateAverage(plateAt(start + (i / stops) * span), 0.2, 0.9);
        parts.push(`${toHex(c)} ${((i / stops) * 100).toFixed(2)}%`);
        i++;
      }
      if (i > stops) setRibbon(`linear-gradient(90deg, ${parts.join(', ')})`);
      else cancel = whenIdle(work);
    };
    let cancel = whenIdle(work);
    return () => { cancelled = true; cancel(); };
  }, [plateAt, start, span, stops]);
  return ribbon;
}

/** Run work when the browser is idle, cancellable. */
export function whenIdle(fn: () => void, timeout = 300) {
  if ('requestIdleCallback' in window) {
    const id = requestIdleCallback(fn, { timeout });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 30);
  return () => clearTimeout(id);
}
