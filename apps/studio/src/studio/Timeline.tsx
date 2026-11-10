import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { moonPosition, sunEvents, sunPosition } from 'skytone';
import clsx from 'clsx';
import { useStudio } from '../state/studio.ts';
import type { DaySwatch, SkyView } from '../state/sky.ts';
import { useReducedMotion } from '../state/sky.ts';
import { DAY, HOUR, MINUTE, clock, dayChip, startOfDay } from '../lib/time.ts';
import { dayRibbon, whenIdle } from '../lib/swatch.ts';
import { IconButton } from '../components/controls.tsx';

const W = 1000;
const H = 64;
const HORIZON = 46;

/** The day: the sun's arc above, the sky's own colours below, one playhead through both. */
export function Timeline({ sky, days, swatches }: { sky: SkyView; days: number[]; swatches: Map<number, DaySwatch> }) {
  const { place, plateAt } = sky;
  const tz = place.timezone;
  const time = useStudio((s) => s.time);
  const live = useStudio((s) => s.live);
  const playing = useStudio((s) => s.playing);
  const setTime = useStudio((s) => s.setTime);
  const goLive = useStudio((s) => s.goLive);
  const setPlaying = useStudio((s) => s.setPlaying);
  const reduce = useReducedMotion();

  const dayStart = startOfDay(time, tz);
  const today = startOfDay(Date.now(), tz);

  const [ribbon, setRibbon] = useState('');
  useEffect(() => whenIdle(() => setRibbon(dayRibbon(plateAt, dayStart))), [dayStart, plateAt]);

  const { lat, lon } = { lat: place.latitude, lon: place.longitude };
  const events = useMemo(() => sunEvents(dayStart, lat, lon), [dayStart, lat, lon]);
  const arc = useMemo(() => {
    const pts: [number, number][] = [];
    let peak = 0;
    for (let i = 0; i <= 96; i++) {
      const alt = sunPosition(dayStart + (i / 96) * DAY, lat, lon).altitude;
      peak = Math.max(peak, alt);
      pts.push([i / 96, alt]);
    }
    const scale = (HORIZON - 8) / Math.max(30, peak);
    const toY = (alt: number) => HORIZON - Math.max(-18, alt) * scale;
    const d = pts.map(([f, a], i) => `${i ? 'L' : 'M'}${(f * W).toFixed(1)},${toY(a).toFixed(1)}`).join('');
    return { d, toY };
  }, [dayStart, lat, lon]);

  const frac = Math.min(1, Math.max(0, (time - dayStart) / DAY));
  const sun = sky.scene.sun;
  const moon = useMemo(() => moonPosition(time, lat, lon), [time, lat, lon]);
  const sunUp = sun.altitude > -0.8;

  const area = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [jumping, setJumping] = useState(false);
  const timeFromX = (clientX: number) => {
    const r = area.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return dayStart + Math.round((f * DAY) / MINUTE) * MINUTE;
  };
  const jump = (t: number) => { setJumping(!reduce); setTime(t); };

  const chipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [dayStart, reduce]);

  return (
    <div className="box timeline">
      <div className="timeline-head">
        <div className="timeline-actions">
          <IconButton label={playing ? 'Pause (Space)' : 'Play the day (Space)'} onClick={() => setPlaying(!playing)} className="play-btn" data-playing={playing || undefined}>
            {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
          </IconButton>
          <button type="button" className="live-btn" onClick={() => { setJumping(!reduce); goLive(); }} aria-pressed={live} title="Back to now (N)">
            {live ? 'Live' : 'Now'}
          </button>
        </div>
        <div className="day-chips" ref={chipsRef} role="tablist" aria-label="Day">
          {days.map((d) => {
            const c = dayChip(d, tz);
            const selected = d === dayStart;
            const sw = swatches.get(d);
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={selected}
                className={clsx('day-chip', d === today && 'is-today', d < today && 'is-past')}
                onClick={() => jump(d + (time - dayStart))}
              >
                <span className="day-chip-name">{d === today ? 'Today' : c.weekday}</span>
                <span className="day-chip-date">{c.day}</span>
                <span className="day-chip-sky" style={{ background: sw?.ribbon }} aria-hidden />
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={area}
        className={clsx('day', dragging && 'is-dragging', jumping && !dragging && !playing && 'is-jumping')}
        role="slider"
        tabIndex={0}
        aria-label="Time of day"
        aria-valuemin={0}
        aria-valuemax={1440}
        aria-valuenow={Math.round((time - dayStart) / MINUTE)}
        aria-valuetext={clock(time, tz)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          setPlaying(false);
          setTime(timeFromX(e.clientX));
        }}
        onPointerMove={(e) => dragging && setTime(timeFromX(e.clientX))}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onTransitionEnd={() => setJumping(false)}
        onKeyDown={(e) => {
          const step = (e.shiftKey ? 60 : 15) * MINUTE;
          if (e.key === 'ArrowRight') setTime(time + step);
          else if (e.key === 'ArrowLeft') setTime(time - step);
          else if (e.key === 'Home') setTime(dayStart);
          else if (e.key === 'End') setTime(dayStart + DAY - MINUTE);
          else return;
          e.preventDefault();
        }}
      >
        <svg className="arc" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <clipPath id="above">
              <rect x="0" y="0" width={W} height={HORIZON} />
            </clipPath>
          </defs>
          <line x1="0" x2={W} y1={HORIZON} y2={HORIZON} className="arc-horizon" />
          <path d={arc.d} className="arc-path" />
          <path d={arc.d} className="arc-path is-day" clipPath="url(#above)" />
        </svg>
        <div className="arc-marks" aria-hidden>
          {[events.sunrise, events.sunset].map((t, i) =>
            t === null ? null : (
              <span key={i} className="arc-mark mono" style={{ left: `${((t - dayStart) / DAY) * 100}%` }}>
                {clock(t, tz)}
              </span>
            ),
          )}
          <span
            className={clsx('body', sunUp ? 'is-sun' : 'is-down')}
            style={{ transform: `translate(calc(${frac} * 100cqw), ${arc.toY(sun.altitude).toFixed(1)}px)` }}
          />
          {!sunUp && moon.altitude > 0 && (
            <span
              className="body is-moon"
              style={{ transform: `translate(calc(${frac} * 100cqw), ${arc.toY(moon.altitude).toFixed(1)}px)`, opacity: 0.45 + 0.55 * moon.fraction }}
            />
          )}
        </div>
        <div className="ribbon" style={{ background: ribbon || 'var(--panel-3)' }} />
        <div className="playhead" style={{ transform: `translateX(calc(${frac} * 100cqw))` }}>
          <span className="playhead-time mono">{clock(time, tz)}</span>
        </div>
      </div>

      <div className="hours mono" aria-hidden>
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <span key={h}>{String(h).padStart(2, '0')}</span>
        ))}
      </div>
    </div>
  );
}

export function forecastDays(tz: string) {
  const today = startOfDay(Date.now(), tz);
  return Array.from({ length: 23 }, (_, i) => startOfDay(today + (i - 7) * DAY + 2 * HOUR, tz));
}
