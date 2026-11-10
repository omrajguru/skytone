import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LoaderCircle, LocateFixed, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { Place } from 'skytone';
import { useStudio } from '../state/studio.ts';
import { findPlaces, useReducedMotion } from '../state/sky.ts';
import { IconButton } from '../components/controls.tsx';

const describePlace = (p: Place) => [p.region, p.country].filter(Boolean).join(', ');

export function PlaceSearch() {
  const place = useStudio((s) => s.place);
  const setPlace = useStudio((s) => s.setPlace);
  const reduce = useReducedMotion();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      setBusy(true);
      findPlaces(q, ctrl.signal)
        .then((r) => { setResults(r); setActive(0); setOpen(true); })
        .catch(() => {})
        .finally(() => setBusy(false));
    }, 220);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [query]);

  const choose = (p: Place) => {
    setPlace(p);
    setQuery('');
    setResults([]);
    setOpen(false);
    input.current?.blur();
  };

  const locate = () => {
    if (!('geolocation' in navigator)) return toast.error('This browser cannot share its location.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPlace({
          name: 'Current location',
          latitude: +pos.coords.latitude.toFixed(4),
          longitude: +pos.coords.longitude.toFixed(4),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === err.PERMISSION_DENIED ? 'Location access was declined.' : 'Your location could not be found.');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };

  const showList = open && query.trim().length >= 2;

  return (
    <div className="place-search">
      <div className="search-field">
        <Search size={14} className="search-icon" aria-hidden />
        <input
          ref={input}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          aria-label="Search for a place"
          placeholder={place?.name ?? 'Search for a place'}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { setActive((a) => Math.min(results.length - 1, a + 1)); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { setActive((a) => Math.max(0, a - 1)); e.preventDefault(); }
            else if (e.key === 'Enter' && results[active]) choose(results[active]);
            else if (e.key === 'Escape') { setQuery(''); setOpen(false); }
          }}
        />
        {busy && <LoaderCircle size={14} className="spin search-busy" aria-label="Searching" />}
        <IconButton label="Use my location" onClick={locate} disabled={locating}>
          {locating ? <LoaderCircle size={15} className="spin" /> : <LocateFixed size={15} />}
        </IconButton>
      </div>

      <AnimatePresence>
        {showList && (
          <motion.ul
            id={listId}
            role="listbox"
            className="search-results"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            {results.length === 0 && !busy && <li className="search-empty">No places match “{query.trim()}”.</li>}
            {results.map((r, i) => (
              <li
                key={`${r.latitude},${r.longitude}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className="search-option"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(r); }}
              >
                <span>{r.name}</span>
                <span className="dim">{describePlace(r)}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
