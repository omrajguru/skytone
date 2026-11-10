import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CONDITION_PRESETS, renderStill, sunEvents } from 'skytone';
import { GithubMark, Logo } from '../components/brand.tsx';
import { ScrubDemo } from '../stage/ScrubDemo.tsx';
import { useStudio } from '../state/studio.ts';
import { useClock, useSky, useWeatherSync } from '../state/sky.ts';
import { REPO_URL } from '../lib/config.ts';
import { HOUR, clock, startOfDay } from '../lib/time.ts';
import { skyTheme, whenIdle } from '../lib/swatch.ts';

const SUMMARY: Record<string, string> = Object.fromEntries(CONDITION_PRESETS.map((p) => [p.id, p.name]));

const SNIPPET = `import { SkyRenderer, skyAt, presetConditions } from 'skytone';

const sky = new SkyRenderer(canvas);
const { plate } = skyAt({
  latitude: 19.08,
  longitude: 72.88,
  time: Date.now(),
  conditions: presetConditions('partly'),
});

sky.setPlate(plate);
sky.start();`;

/** One story on one grid: a day of sky over the visitor's place. */
export default function Landing() {
  useWeatherSync();
  useClock();
  const sky = useSky({ forecastOnly: true });
  const look = useStudio((s) => s.look);
  const { place, plateAt } = sky;
  const tz = place.timezone;

  useEffect(() => {
    document.title = 'Skytone, the sky over anywhere at any hour';
    if (!useStudio.getState().live) useStudio.getState().goLive();
  }, []);

  // The page takes its colours from the sky over this place right now.
  const hourKey = Math.floor(sky.scene.time / HOUR);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = useMemo(() => skyTheme(sky.plate), [hourKey, place.latitude, place.longitude, sky.summary]);

  const today = startOfDay(Date.now(), tz);
  const events = useMemo(() => sunEvents(today, place.latitude, place.longitude), [today, place.latitude, place.longitude]);
  const sunset = events.sunset;
  const sunsetFrac = sunset ? Math.min(0.97, Math.max(0.3, ((sunset - today) / HOUR - 5) / 16)) : 0.8;

  // Six moments that follow this place's own day: dawn, morning, midday, afternoon, sunset, dusk.
  const times = useMemo(() => {
    const rise = events.sunrise ?? today + 6 * HOUR;
    const set = events.sunset ?? today + 18 * HOUR;
    const noon = (rise + set) / 2;
    return [rise - 0.3 * HOUR, rise + 1.2 * HOUR, noon, set - 2 * HOUR, set, set + 0.45 * HOUR];
  }, [events, today]);

  const [moments, setMoments] = useState<string[]>([]);
  useEffect(
    () =>
      whenIdle(() => {
        try {
          setMoments(times.map((t) => renderStill(plateAt(t), { width: 480, height: 600, look: { grain: 0.1 } }).toDataURL('image/jpeg', 0.85)));
        } catch {
          setMoments([]);
        }
      }, 800),
    [plateAt, times],
  );

  return (
    <div className="landing" style={theme as React.CSSProperties}>
      <div className="landing-inner">
        <header className="landing-nav">
          <Logo />
          <nav>
            {REPO_URL && (
              <a href={REPO_URL} className="lbtn lbtn-ghost" target="_blank" rel="noreferrer">
                <GithubMark />
                Source
              </a>
            )}
            <Link to="/studio" className="lbtn lbtn-ink">
              Open Studio
            </Link>
          </nav>
        </header>

        <section className="hero">
          <div className="hero-copy">
            <h1>The sky over anywhere, at any hour.</h1>
            <p className="lede">
              Skytone paints the real sky for a place and a moment, from the sun’s position and the live forecast. Drag through the day,
              look two weeks ahead, and export it for any screen.
            </p>
            <div className="hero-actions">
              <Link to="/studio" className="lbtn lbtn-ink lbtn-lg">
                Open Studio
              </Link>
              <span className="hero-note">Free and open source. No account.</span>
            </div>
          </div>
          <div className="hero-demo">
            <ScrubDemo
              plateAt={plateAt}
              dayStart={today}
              now={sky.scene.time}
              sunsetFrac={sunsetFrac}
              clock={(x) => clock(x, tz)}
              summary={SUMMARY[sky.summary]}
              look={look}
            />
          </div>
        </section>

        <section className="band" aria-labelledby="moments-title">
          <div className="band-copy">
            <h2 id="moments-title">One place, one day</h2>
            <p>The sky over {place.name} today, painted at six moments from the same forecast.</p>
          </div>
          <div className="moment-row">
            {times.map((t, i) => (
              <figure key={i} className="moment">
                <div className="moment-sky">{moments[i] && <img src={moments[i]} alt={`The sky over ${place.name} at ${clock(t, tz)}`} />}</div>
                <figcaption>{clock(t, tz)}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="band band-split" aria-labelledby="engine-title">
          <div className="band-copy">
            <h2 id="engine-title">The engine is yours too</h2>
            <p>
              Studio runs on <code>skytone</code>, a small TypeScript package with no dependencies. Put the same sky behind your own app and
              keep it true to the hour.
            </p>
            {REPO_URL && (
              <a href={REPO_URL} className="lbtn lbtn-ghost" target="_blank" rel="noreferrer">
                <GithubMark />
                Read the source
              </a>
            )}
          </div>
          <pre className="code" aria-label="Example code">
            <code>{SNIPPET}</code>
          </pre>
        </section>

        <footer className="landing-foot">
          <span>Skytone is MIT licensed.</span>
          <span>
            Weather data by{' '}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>
          </span>
        </footer>
      </div>
    </div>
  );
}
