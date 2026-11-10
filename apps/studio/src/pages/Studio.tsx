import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router';
import { useStudio } from '../state/studio.ts';
import { useClock, useDaySwatches, useSky, useWeatherSync } from '../state/sky.ts';
import { CanvasBox } from '../studio/CanvasBox.tsx';
import { Timeline, forecastDays } from '../studio/Timeline.tsx';
import { Inspector } from '../studio/Inspector.tsx';
import { GithubMark, Logo } from '../components/brand.tsx';
import { REPO_URL } from '../lib/config.ts';

const MIN_W = 280;
const MAX_W = 460;

export default function Studio() {
  useWeatherSync();
  useClock();
  useShortcuts();
  const sky = useSky();
  const width = useStudio((s) => s.inspectorWidth);

  const tz = sky.place.timezone;
  const dayKey = Math.floor(Date.now() / 3_600_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const days = useMemo(() => forecastDays(tz), [tz, dayKey]);
  const swatches = useDaySwatches(sky, days);

  useEffect(() => {
    document.title = `${sky.place.name} · Skytone`;
  }, [sky.place.name]);

  return (
    <div className="studio">
      <header className="topbar">
        <Link to="/" className="topbar-home" aria-label="Skytone home">
          <Logo />
        </Link>
        <nav className="topbar-nav">
          {REPO_URL && (
            <a href={REPO_URL} className="btn btn-quiet btn-sm" target="_blank" rel="noreferrer">
              <GithubMark />
              Source
            </a>
          )}
        </nav>
      </header>
      <main className="workspace" style={{ '--inspector-w': `${width}px` } as React.CSSProperties}>
        <CanvasBox sky={sky} />
        <Timeline sky={sky} days={days} swatches={swatches} />
        <Resizer />
        <Inspector sky={sky} swatches={swatches} />
      </main>
    </div>
  );
}

/** Drag the gutter to resize the inspector. Double-click resets it. */
function Resizer() {
  const setWidth = useStudio((s) => s.setInspectorWidth);
  const width = useStudio((s) => s.inspectorWidth);
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize controls"
      aria-valuemin={MIN_W}
      aria-valuemax={MAX_W}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: width };
        document.body.dataset.resizing = '';
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const w = start.current.w - (e.clientX - start.current.x);
        setWidth(Math.round(Math.min(MAX_W, Math.max(MIN_W, w))));
      }}
      onPointerUp={() => { start.current = null; delete document.body.dataset.resizing; }}
      onPointerCancel={() => { start.current = null; delete document.body.dataset.resizing; }}
      onDoubleClick={() => setWidth(320)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') setWidth(Math.min(MAX_W, width + 16));
        else if (e.key === 'ArrowRight') setWidth(Math.max(MIN_W, width - 16));
      }}
    />
  );
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, button, [role="slider"], [role="combobox"], [contenteditable]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useStudio.getState();
      if (e.code === 'Space') { s.setPlaying(!s.playing); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { s.setTime(s.time + (e.shiftKey ? 60 : 15) * 60_000); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { s.setTime(s.time - (e.shiftKey ? 60 : 15) * 60_000); e.preventDefault(); }
      else if (e.key.toLowerCase() === 'n') s.goLive();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
