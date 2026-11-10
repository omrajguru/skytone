import { type ButtonHTMLAttributes, type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronsUpDown } from 'lucide-react';
import clsx from 'clsx';

export function Section({ title, action, children, index = 0 }: { title: string; action?: ReactNode; children: ReactNode; index?: number }) {
  const id = useId();
  return (
    <section className="section" aria-labelledby={id} style={{ '--i': index } as React.CSSProperties}>
      <header className="section-head">
        <h2 id={id}>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Button({ variant = 'ghost', size = 'md', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'quiet'; size?: 'sm' | 'md' | 'lg' }) {
  return <button type="button" className={clsx('btn', `btn-${variant}`, `btn-${size}`, className)} {...rest} />;
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className={clsx('icon-btn', className)} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

/** Options in a row with an indicator that slides between them. */
export function Segmented<T extends string>({ value, options, onChange, label, size = 'md' }: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const active = options.findIndex((o) => o.value === value);

  useLayoutEffect(() => {
    const el = ref.current?.querySelectorAll<HTMLButtonElement>('button')[active];
    if (!el) return;
    const measure = () => setBox({ x: el.offsetLeft, w: el.offsetWidth });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, [active, options.length]);

  return (
    <div ref={ref} className={clsx('segmented', `segmented-${size}`)} role="radiogroup" aria-label={label}>
      {box && <span className="segmented-thumb" style={{ transform: `translateX(${box.x}px)`, width: box.w }} aria-hidden />}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className="segmented-item"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ label, value, min = 0, max = 1, step = 0.01, onChange, format }: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{format ? format(value) : Math.round(pct)}</output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
      />
    </div>
  );
}

export function Select<T extends string>({ value, items, onChange, label }: {
  value: T;
  items: { value: T; label: string; detail?: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const current = items.find((i) => i.value === value);
  return (
    <BaseSelect.Root value={value} onValueChange={(v) => v !== null && onChange(v as T)}>
      <BaseSelect.Trigger className="select-trigger" aria-label={label}>
        <BaseSelect.Value>
          {() => (
            <span className="select-value">
              {current?.icon && <span className="select-thumb">{current.icon}</span>}
              <span>{current?.label}</span>
              {current?.detail && <span className="mono dim">{current.detail}</span>}
            </span>
          )}
        </BaseSelect.Value>
        <BaseSelect.Icon className="select-icon">
          <ChevronsUpDown size={14} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="select-positioner" sideOffset={6} alignItemWithTrigger={false}>
          <BaseSelect.Popup className="select-popup">
            <BaseSelect.List>
              {items.map((i) => (
                <BaseSelect.Item key={i.value} value={i.value} className="select-item">
                  <span className="select-thumb">{i.icon}</span>
                  <BaseSelect.ItemText className="select-item-text">{i.label}</BaseSelect.ItemText>
                  <span className="select-item-detail mono dim">{i.detail}</span>
                  <BaseSelect.ItemIndicator className="select-check" keepMounted>
                    <Check size={13} />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

/** A rectangle drawn at the frame's real aspect ratio. */
export function AspectThumb({ width, height }: { width: number; height: number }) {
  const k = 16 / Math.max(width, height);
  return <span className="aspect-thumb" style={{ width: Math.max(4, width * k), height: Math.max(4, height * k) }} aria-hidden />;
}

export function NumberField({ label, value, onCommit, min = 16, max = 7680 }: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const scrub = useRef<{ x: number; v: number } | null>(null);
  const clampV = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (Number.isFinite(n) && draft !== '') onCommit(clampV(n));
    setDraft(null);
  };
  return (
    <label className="number-field">
      <span
        className="number-scrub"
        title={`Drag to change ${label}`}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          scrub.current = { x: e.clientX, v: value };
          document.body.dataset.scrubbing = '';
        }}
        onPointerMove={(e) => {
          if (!scrub.current) return;
          const dx = e.clientX - scrub.current.x;
          onCommit(clampV(scrub.current.v + dx * (e.shiftKey ? 10 : 2)));
        }}
        onPointerUp={() => { scrub.current = null; delete document.body.dataset.scrubbing; }}
        onPointerCancel={() => { scrub.current = null; delete document.body.dataset.scrubbing; }}
      >
        {label}
      </span>
      <input
        inputMode="numeric"
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setDraft(null); (e.target as HTMLInputElement).blur(); }
        }}
      />
    </label>
  );
}
