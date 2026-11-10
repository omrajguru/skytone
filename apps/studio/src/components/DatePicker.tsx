import { useEffect, useMemo, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { HOUR, isoDay, longDate } from '../lib/time.ts';
import type { DaySwatch } from '../state/sky.ts';
import { useReducedMotion } from '../state/sky.ts';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fullName = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const toIso = (d: Date) => d.toISOString().slice(0, 10);
const fromIso = (iso: string) => new Date(`${iso}T00:00:00Z`);
const addDays = (iso: string, n: number) => {
  const d = fromIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
};
const addMonths = (iso: string, n: number) => {
  const d = fromIso(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return toIso(d);
};
const monthKey = (iso: string) => iso.slice(0, 7);

function grid(month: string) {
  const first = fromIso(`${month}-01`);
  const lead = (first.getUTCDay() + 6) % 7;
  const start = toIso(new Date(first.getTime() - lead * 86_400_000));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function DatePicker({ time, tz, swatches, onPick }: {
  time: number;
  tz: string;
  swatches: Map<number, DaySwatch>;
  onPick: (iso: string) => void;
}) {
  const reduce = useReducedMotion();
  const selected = isoDay(time, tz);
  const today = isoDay(Date.now(), tz);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(selected);
  const [dir, setDir] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const swatchByIso = useMemo(() => {
    const m = new Map<string, DaySwatch>();
    for (const [d, s] of swatches) m.set(isoDay(d + 2 * HOUR, tz), s);
    return m;
  }, [swatches, tz]);

  useEffect(() => { if (open) { setFocus(selected); setDir(0); } }, [open, selected]);

  const month = monthKey(focus);
  const cells = useMemo(() => grid(month), [month]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focus}"]`)?.focus());
    return () => cancelAnimationFrame(id);
  }, [focus, open]);

  const move = (next: string) => {
    if (monthKey(next) !== month) setDir(next > focus ? 1 : -1);
    setFocus(next);
  };

  const pick = (iso: string) => { onPick(iso); setOpen(false); };

  const slide = reduce ? 0 : 14;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="date-trigger">
        <CalendarDays size={14} className="dim" />
        <span>{longDate(time, tz)}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="start" className="popover-positioner">
          <Popover.Popup className="popover calendar" aria-label="Choose a date">
            <header className="calendar-head">
              <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                <motion.h3
                  key={month}
                  custom={dir}
                  initial={{ opacity: 0, x: dir * slide }}
                  animate={{ opacity: 1, x: 0, transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] } }}
                  exit={{ opacity: 0, x: -dir * slide, transition: { duration: 0.12 } }}
                >
                  {monthName.format(fromIso(`${month}-01`))}
                </motion.h3>
              </AnimatePresence>
              <div className="calendar-nav">
                <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => move(addMonths(focus, -1))}>
                  <ChevronLeft size={15} />
                </button>
                <button type="button" className="icon-btn" aria-label="Next month" onClick={() => move(addMonths(focus, 1))}>
                  <ChevronRight size={15} />
                </button>
              </div>
            </header>

            <div className="calendar-weekdays mono" aria-hidden>
              {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
            </div>

            <div className="calendar-viewport">
              <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                <motion.div
                  key={month}
                  ref={gridRef}
                  className="calendar-grid"
                  role="grid"
                  initial={{ opacity: 0, x: dir * slide * 1.5 }}
                  animate={{ opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] } }}
                  exit={{ opacity: 0, x: -dir * slide * 1.5, transition: { duration: 0.12 } }}
                  onKeyDown={(e) => {
                    const map: Record<string, () => string> = {
                      ArrowLeft: () => addDays(focus, -1),
                      ArrowRight: () => addDays(focus, 1),
                      ArrowUp: () => addDays(focus, -7),
                      ArrowDown: () => addDays(focus, 7),
                      PageUp: () => addMonths(focus, -1),
                      PageDown: () => addMonths(focus, 1),
                      Home: () => addDays(focus, -((fromIso(focus).getUTCDay() + 6) % 7)),
                      End: () => addDays(focus, 6 - ((fromIso(focus).getUTCDay() + 6) % 7)),
                    };
                    const f = map[e.key];
                    if (!f) return;
                    e.preventDefault();
                    move(f());
                  }}
                >
                  {cells.map((iso) => {
                    const sw = swatchByIso.get(iso);
                    const inMonth = monthKey(iso) === month;
                    return (
                      <button
                        key={iso}
                        type="button"
                        data-iso={iso}
                        tabIndex={iso === focus ? 0 : -1}
                        aria-label={fullName.format(fromIso(iso))}
                        aria-pressed={iso === selected}
                        aria-current={iso === today ? 'date' : undefined}
                        className={clsx('calendar-day', !inMonth && 'is-outside', iso === today && 'is-today', iso === selected && 'is-selected')}
                        onClick={() => pick(iso)}
                      >
                        <span className="calendar-num">{Number(iso.slice(8))}</span>
                        <span className="calendar-sky" style={sw ? { background: sw.ribbon } : undefined} aria-hidden />
                      </button>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="calendar-foot">
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => pick(today)}>Today</button>
            </footer>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
