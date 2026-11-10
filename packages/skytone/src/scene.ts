import { moonPosition, sunPosition } from './astro.ts';
import type { Conditions } from './conditions.ts';
import { type Plate, type SceneInput, createPlate, foregroundFor, paintPlate } from './plate.ts';

export type Phase = 'night' | 'astronomical' | 'nautical' | 'civil' | 'golden' | 'day';

export function phaseOf(altitude: number): Phase {
  if (altitude < -18) return 'night';
  if (altitude < -12) return 'astronomical';
  if (altitude < -6) return 'nautical';
  if (altitude < 0) return 'civil';
  if (altitude < 6) return 'golden';
  return 'day';
}

/** A stable seed for a place, so a city keeps its own character. */
export function seedFor(latitude: number, longitude: number): number {
  const s = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface SkyOptions {
  latitude: number;
  longitude: number;
  time: number;
  conditions: Conditions;
  seed?: number;
  /** Defaults to facing the equator, so the sun arcs left to right. */
  viewAzimuth?: number;
}

export function sceneFor(o: SkyOptions): SceneInput {
  return {
    time: o.time,
    sun: sunPosition(o.time, o.latitude, o.longitude),
    moon: moonPosition(o.time, o.latitude, o.longitude),
    conditions: o.conditions,
    viewAzimuth: o.viewAzimuth ?? (o.latitude >= 0 ? 180 : 0),
    seed: o.seed ?? seedFor(o.latitude, o.longitude),
  };
}

export interface SkyState {
  scene: SceneInput;
  plate: Plate;
  phase: Phase;
  foreground: 'light' | 'dark';
}

export function skyAt(o: SkyOptions, out: Plate = createPlate()): SkyState {
  const scene = sceneFor(o);
  const plate = paintPlate(scene, out);
  return { scene, plate, phase: phaseOf(scene.sun.altitude), foreground: foregroundFor(plate) };
}
