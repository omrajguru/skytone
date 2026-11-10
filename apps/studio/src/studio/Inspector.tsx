import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import NumberFlow from '@number-flow/react';
import { RectangleHorizontal, RectangleVertical, Shuffle } from 'lucide-react';
import { CONDITION_PRESETS, conditionsAt, paintPlate, presetConditions, sunEvents } from 'skytone';
import clsx from 'clsx';
import { AspectThumb, IconButton, NumberField, Section, Segmented, Select, Slider } from '../components/controls.tsx';
import { DatePicker } from '../components/DatePicker.tsx';
import { FRAMES, useStudio } from '../state/studio.ts';
import type { DaySwatch, SkyView } from '../state/sky.ts';
import { makeScene, useReducedMotion } from '../state/sky.ts';
import { PlaceSearch } from './PlaceSearch.tsx';
import { ExportPanel } from './ExportPanel.tsx';
import { clock, onDay, startOfDay, utcLabel } from '../lib/time.ts';
import { miniSky } from '../lib/swatch.ts';

const SUMMARY: Record<string, string> = Object.fromEntries(CONDITION_PRESETS.map((p) => [p.id, p.name]));
const PHASE: Record<string, string> = {
  night: 'Night', astronomical: 'Astronomical twilight', nautical: 'Nautical twilight', civil: 'Civil twilight', golden: 'Golden hour', day: 'Daylight',
};
const ease = [0.23, 1, 0.32, 1] as const;

export function Inspector({ sky, swatches }: { sky: SkyView; swatches: Map<number, DaySwatch> }) {
  return (
    <aside className="box inspector" aria-label="Controls">
      <FrameSection />
      <PlaceSection sky={sky} />
      <TimeSection sky={sky} swatches={swatches} />
      <WeatherSection sky={sky} />
      <LookSection />
      <Section title="Export" index={5}>
        <ExportPanel sky={sky} />
      </Section>
    </aside>
  );
}

function FrameSection() {
  const frame = useStudio((s) => s.frame);
  const setFrame = useStudio((s) => s.setFrame);
  const items = [
    ...FRAMES.map((f) => ({ value: f.id, label: f.name, detail: `${f.width} × ${f.height}`, icon: <AspectThumb width={f.width} height={f.height} /> })),
    { value: 'custom', label: 'Custom', detail: `${frame.width} × ${frame.height}`, icon: <AspectThumb width={frame.width} height={frame.height} /> },
  ];
  const portrait = frame.height > frame.width;
  return (
    <Section
      title="Frame"
      index={0}
      action={
        <IconButton label={portrait ? 'Make landscape' : 'Make portrait'} onClick={() => setFrame({ id: frame.id, width: frame.height, height: frame.width })}>
          {portrait ? <RectangleHorizontal size={15} /> : <RectangleVertical size={15} />}
        </IconButton>
      }
    >
      <Select
        label="Frame size"
        value={FRAMES.some((f) => f.id === frame.id && f.width === frame.width) ? frame.id : 'custom'}
        items={items}
        onChange={(id) => {
          const f = FRAMES.find((x) => x.id === id);
          if (f) setFrame({ id: f.id, width: f.width, height: f.height });
          else setFrame({ ...frame, id: 'custom' });
        }}
      />
      <div className="field-pair">
        <NumberField label="W" value={frame.width} onCommit={(width) => setFrame({ id: 'custom', width, height: frame.height })} />
        <NumberField label="H" value={frame.height} onCommit={(height) => setFrame({ id: 'custom', width: frame.width, height })} />
      </div>
    </Section>
  );
}

function PlaceSection({ sky }: { sky: SkyView }) {
  const { place } = sky;
  const lat = `${Math.abs(place.latitude).toFixed(2)}° ${place.latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(place.longitude).toFixed(2)}° ${place.longitude >= 0 ? 'E' : 'W'}`;
  return (
    <Section title="Place" index={1}>
      <PlaceSearch />
      <div className="place-line">
        <span className="place-name">{[place.name, place.country].filter(Boolean).join(', ')}</span>
        <span className="mono dim">{lat} {lon}</span>
      </div>
    </Section>
  );
}

function TimeSection({ sky, swatches }: { sky: SkyView; swatches: Map<number, DaySwatch> }) {
  const time = useStudio((s) => s.time);
  const setTime = useStudio((s) => s.setTime);
  const tz = sky.place.timezone;
  const dayStart = startOfDay(time, tz);
  const ev = useMemo(() => sunEvents(dayStart, sky.place.latitude, sky.place.longitude), [dayStart, sky.place.latitude, sky.place.longitude]);
  const alt = sky.scene.sun.altitude;

  return (
    <Section title="Time" index={2}>
      <div className="clock-row">
        <span className="clock">{clock(time, tz)}</span>
        <span className="clock-meta">
          <span>{PHASE[sky.phase]}</span>
          <span className="mono dim">{utcLabel(time, tz)}</span>
        </span>
      </div>
      <DatePicker time={time} tz={tz} swatches={swatches} onPick={(iso) => setTime(onDay(iso, time, tz))} />
      <dl className="facts">
        <div><dt>Sunrise</dt><dd className="mono">{ev.sunrise ? clock(ev.sunrise, tz) : ev.always === 'up' ? 'Up all day' : 'None'}</dd></div>
        <div><dt>Sunset</dt><dd className="mono">{ev.sunset ? clock(ev.sunset, tz) : ev.always === 'down' ? 'Down all day' : 'None'}</dd></div>
        <div><dt>Sun height</dt><dd className="mono">{alt >= 0 ? '+' : '−'}{Math.abs(alt).toFixed(1)}°</dd></div>
      </dl>
    </Section>
  );
}

function WeatherSection({ sky }: { sky: SkyView }) {
  const mode = useStudio((s) => s.weatherMode);
  const setMode = useStudio((s) => s.setWeatherMode);
  const preset = useStudio((s) => s.preset);
  const setPreset = useStudio((s) => s.setPreset);
  const intensity = useStudio((s) => s.intensity);
  const setIntensity = useStudio((s) => s.setIntensity);
  const variation = useStudio((s) => s.variation);
  const forecast = useStudio((s) => s.forecast);
  const status = useStudio((s) => s.forecastStatus);
  const time = useStudio((s) => s.time);
  const reduce = useReducedMotion();

  const at = conditionsAt(forecast, time);
  const r = at.index >= 0 ? forecast?.readings[at.index] : undefined;

  // Each tile previews its own sky at this place and hour.
  const hourKey = Math.floor(time / 900_000);
  const previews = useMemo(
    () => Object.fromEntries(CONDITION_PRESETS.map((p) => [p.id, miniSky(paintPlate(makeScene(sky.place, time, presetConditions(p.id, intensity), variation)))])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sky.place, hourKey, intensity, variation],
  );

  return (
    <Section title="Weather" index={3}>
      <Segmented
        label="Weather source"
        value={mode}
        options={[{ value: 'live', label: 'Forecast' }, { value: 'custom', label: 'Custom' }]}
        onChange={setMode}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          className="weather-body"
          initial={reduce ? { opacity: 0 } : { opacity: 0, filter: 'blur(2px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)', transition: { duration: 0.18, ease } }}
          exit={{ opacity: 0, filter: reduce ? 'blur(0px)' : 'blur(2px)', transition: { duration: 0.12 } }}
        >
          {mode === 'live' ? (
            r ? (
              <>
                <p className="weather-summary">{SUMMARY[sky.summary]}</p>
                <dl className="readings">
                  <div><dt>Cloud</dt><dd><NumberFlow value={Math.round(r.cloudCover)} suffix="%" /></dd></div>
                  <div><dt>Rain</dt><dd><NumberFlow value={r.precipitation} format={{ maximumFractionDigits: 1 }} suffix=" mm" /></dd></div>
                  <div><dt>Wind</dt><dd><NumberFlow value={Math.round(r.windKmh)} suffix=" km/h" /></dd></div>
                  <div><dt>Temperature</dt><dd><NumberFlow value={Math.round(r.temperature)} suffix="°" /></dd></div>
                </dl>
              </>
            ) : (
              <p className="hint">
                {status === 'loading'
                  ? 'Loading the forecast.'
                  : status === 'error'
                    ? 'The forecast could not be reached, so this is a typical sky.'
                    : 'Forecasts reach sixteen days ahead. Beyond that, this is a typical sky.'}
              </p>
            )
          ) : (
            <>
              <div className="tiles" role="radiogroup" aria-label="Conditions">
                {CONDITION_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={preset === p.id}
                    className={clsx('tile', preset === p.id && 'is-on')}
                    onClick={() => setPreset(p.id)}
                  >
                    <span className="tile-sky" style={{ background: previews[p.id] }} aria-hidden />
                    <span className="tile-name">{p.name}</span>
                  </button>
                ))}
              </div>
              <Slider label="Intensity" value={intensity} onChange={setIntensity} />
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </Section>
  );
}

function LookSection() {
  const look = useStudio((s) => s.look);
  const setLook = useStudio((s) => s.setLook);
  const reshuffle = useStudio((s) => s.reshuffle);
  return (
    <Section
      title="Look"
      index={4}
      action={
        <IconButton label="Rearrange the clouds" onClick={reshuffle}>
          <Shuffle size={15} />
        </IconButton>
      }
    >
      <Slider label="Watercolor" value={look.watercolor ?? 0.85} onChange={(watercolor) => setLook({ watercolor })} />
      <Slider label="Drift" value={look.motion} onChange={(motion) => setLook({ motion })} />
      <Slider label="Softness" value={look.softness} max={2} onChange={(softness) => setLook({ softness })} format={(v) => String(Math.round(v * 50))} />
      <Slider label="Grain" value={look.grain} onChange={(grain) => setLook({ grain })} />
    </Section>
  );
}
