import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type ConditionPreset, type Forecast, type Look, type Place, DEFAULT_LOOK } from 'skytone';

export type ExportFormat = 'png' | 'jpg' | 'jpeg' | 'svg' | 'mp4';
export type VideoMotion = 'ambient' | 'day';

export interface FramePreset {
  id: string;
  name: string;
  width: number;
  height: number;
}

export const FRAMES: FramePreset[] = [
  { id: 'desktop', name: 'Desktop', width: 1920, height: 1080 },
  { id: '4k', name: '4K', width: 3840, height: 2160 },
  { id: 'ultrawide', name: 'Ultrawide', width: 3440, height: 1440 },
  { id: 'phone', name: 'Phone', width: 1179, height: 2556 },
  { id: 'tablet', name: 'Tablet', width: 2048, height: 2732 },
  { id: 'square', name: 'Square', width: 1080, height: 1080 },
  { id: 'story', name: 'Story', width: 1080, height: 1920 },
];

export const FALLBACK_PLACE: Place = {
  name: 'Mumbai', region: 'Maharashtra', country: 'India', latitude: 19.076, longitude: 72.8777, timezone: 'Asia/Kolkata',
};

interface StudioState {
  place: Place | null;
  time: number;
  /** Follow the real clock. */
  live: boolean;
  playing: boolean;
  /** The playhead is being dragged. */
  scrubbing: boolean;
  weatherMode: 'live' | 'custom';
  preset: ConditionPreset;
  intensity: number;
  look: Look;
  variation: number;
  frame: { id: string; width: number; height: number };
  exportFormat: ExportFormat;
  videoSeconds: number;
  videoMotion: VideoMotion;
  inspectorWidth: number;

  forecast: Forecast | null;
  forecastFor: string | null;
  forecastStatus: 'idle' | 'loading' | 'ready' | 'error';

  setPlace: (place: Place) => void;
  setTime: (time: number) => void;
  goLive: () => void;
  setPlaying: (playing: boolean) => void;
  setScrubbing: (scrubbing: boolean) => void;
  setWeatherMode: (mode: 'live' | 'custom') => void;
  setPreset: (preset: ConditionPreset) => void;
  setIntensity: (v: number) => void;
  setLook: (look: Partial<Look>) => void;
  reshuffle: () => void;
  setFrame: (frame: { id: string; width: number; height: number }) => void;
  setExport: (o: Partial<Pick<StudioState, 'exportFormat' | 'videoSeconds' | 'videoMotion'>>) => void;
  setInspectorWidth: (w: number) => void;
  setForecast: (key: string, f: Forecast | null, status: StudioState['forecastStatus']) => void;
}

export const placeKey = (p: Place) => `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;

export const useStudio = create<StudioState>()(
  persist(
    (set) => ({
      place: null,
      time: Date.now(),
      live: true,
      playing: false,
      scrubbing: false,
      weatherMode: 'live',
      preset: 'partly',
      intensity: 0.5,
      look: DEFAULT_LOOK,
      variation: 0,
      frame: { id: 'desktop', width: 1920, height: 1080 },
      exportFormat: 'png',
      videoSeconds: 10,
      videoMotion: 'ambient',
      inspectorWidth: 320,
      forecast: null,
      forecastFor: null,
      forecastStatus: 'idle',

      setPlace: (place) => set({ place }),
      setTime: (time) => set({ time, live: false }),
      goLive: () => set({ time: Date.now(), live: true, playing: false }),
      setPlaying: (playing) => set(playing ? { playing, live: false } : { playing }),
      setScrubbing: (scrubbing) => set({ scrubbing }),
      setWeatherMode: (weatherMode) => set({ weatherMode }),
      setPreset: (preset) => set({ preset, weatherMode: 'custom' }),
      setIntensity: (intensity) => set({ intensity }),
      setLook: (look) => set((s) => ({ look: { ...s.look, ...look } })),
      reshuffle: () => set((s) => ({ variation: (s.variation + 1 + Math.floor(Math.random() * 1000)) % 100000 })),
      setFrame: (frame) => set({ frame }),
      setExport: (o) => set(o),
      setInspectorWidth: (inspectorWidth) => set({ inspectorWidth }),
      setForecast: (forecastFor, forecast, forecastStatus) => set({ forecastFor, forecast, forecastStatus }),
    }),
    {
      name: 'skytone.studio',
      version: 2,
      // v2 turns watercolour off by default; earlier saves get the new default once.
      migrate: (saved, version) => {
        const s = (saved ?? {}) as Partial<StudioState>;
        if (version < 2 && s.look) s.look = { ...s.look, watercolor: 0 };
        return s as StudioState;
      },
      // Older saves predate newer look settings; fill them from today's defaults.
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<StudioState>;
        return { ...current, ...s, look: { ...current.look, ...(s.look ?? {}) } };
      },
      partialize: (s) => ({
        place: s.place, weatherMode: s.weatherMode, preset: s.preset, intensity: s.intensity, look: s.look,
        variation: s.variation, frame: s.frame, exportFormat: s.exportFormat, videoSeconds: s.videoSeconds,
        videoMotion: s.videoMotion, inspectorWidth: s.inspectorWidth,
      }),
    },
  ),
);
