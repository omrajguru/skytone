import { useMemo } from 'react';
import { useRibbon } from '../lib/swatch.ts';
import type { Look, Plate } from 'skytone';
import { Roll, Stage, Window, type Act } from './kit';
import { SkyCanvas } from '../components/SkyCanvas.tsx';
import { HOUR } from '../lib/time.ts';
import './scrub-day.css';

// Scrubbing the day, after stageshow's chart-scrub. Beats: the pointer comes onto
// the day's ribbon in the morning, a hairline picks up the hour, the headline reads
// the time and the sky above changes with it; one eased stroke runs to sunset and
// rests on the result; the pointer leaves and the readout returns to now. Loops.
//
// - The headline is the readout: only the digits that change roll.
// - The sky is the real renderer, painted for every hour the pointer passes.
// - One stroke, not hops. The hairline sits at the pointer.
//
// Real strings: the conditions, the time, the two ends of the axis.

const FROM = 5;
const SPAN = 16;
type S = { f: number | null; x: number | null };
const W = { wide: 492, compact: 280 };

export function ScrubDemo({ plateAt, dayStart, now, sunsetFrac, clock, summary, look }: {
  plateAt: (t: number) => Plate;
  dayStart: number;
  now: number;
  sunsetFrac: number;
  clock: (t: number) => string;
  summary: string;
  look: Look;
}) {
  const timeAt = (f: number) => dayStart + (FROM + SPAN * f) * HOUR;
  const ribbon = useRibbon(plateAt, dayStart + FROM * HOUR, SPAN * HOUR, 24);

  const script = useMemo(
    () =>
      async (a: Act<S>) => {
        await a.wait(900);
        const box = a.rect('ribbon');
        const at = (f: number) => ({ x: box.x + f * box.width, y: box.y + box.height / 2 });
        const start = 2 / SPAN;
        a.mark('hover');
        await a.move(at(start), { duration: 700 });
        a.put({ f: start, x: start * box.width });
        await a.wait(600);
        a.mark('scrub');
        await a.move(at(sunsetFrac), {
          duration: 2400,
          path: (e, from, to) => ({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }),
          onMove: (pt) => {
            const x = Math.max(0, Math.min(box.width, pt.x - box.x));
            a.put({ f: x / box.width, x });
          },
        });
        await a.wait(2200);
        a.mark('leave');
        let gone = false;
        await a.move({ x: box.x + box.width + 40, y: box.y + box.height + 70 }, {
          duration: 600,
          onMove: (pt) => {
            if (!gone && (pt.x > box.x + box.width || pt.y > box.y + box.height)) {
              gone = true;
              a.put({ f: null, x: null });
            }
          },
        });
        await a.wait(1600);
      },
    [sunsetFrac],
  );

  return (
    <Stage<S>
      width={640}
      height={400}
      compact={{ below: 520, width: 358, height: 400 }}
      initial={{ f: null, x: null }}
      poster={{ f: sunsetFrac, x: null }}
      script={script}
      cursor={{ at: { x: 560, y: 360 } }}
      palette="mono"
      className="sd"
    >
      {(s, _rect, layout) => {
        const w = layout === 'compact' ? W.compact : W.wide;
        const t = s.f === null ? now : timeAt(s.f);
        const hx = s.x ?? (s.f === null ? null : s.f * w);
        return (
          <Window className="sd-win">
            <div className="sd-body">
              <div className="sd-head">
                <div className="sd-label">
                  <Roll variant="fade">{s.f === null ? `Now, ${summary.toLowerCase()}` : summary}</Roll>
                </div>
                <div className="sd-value">
                  <Roll stagger={25}>{clock(t)}</Roll>
                </div>
              </div>
              <div className="sd-sky" style={{ width: w }}>
                <SkyCanvas className="sd-canvas" plate={plateAt(t)} look={look} />
              </div>
              <div className="sd-ribbon" data-target="ribbon" data-cursor="resize-ew" style={{ width: w }}>
                <span className="sd-track" style={{ background: ribbon || 'var(--ss-well)' }} />
                <span className="sd-hair" data-on={hx !== null ? '' : undefined} style={hx !== null ? { left: hx } : undefined} />
              </div>
              <div className="sd-axis" style={{ width: w }}>
                <span>{clock(timeAt(0))}</span>
                <span>{clock(timeAt(1))}</span>
              </div>
            </div>
          </Window>
        );
      }}
    </Stage>
  );
}
