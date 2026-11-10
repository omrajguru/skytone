import { useLayoutEffect, useRef, useState } from 'react';
import { SkyCanvas } from '../components/SkyCanvas.tsx';
import { useStudio } from '../state/studio.ts';
import type { SkyView } from '../state/sky.ts';

/** The sky, framed at the export size and fitted into the box. Nothing sits on top of it. */
export function CanvasBox({ sky }: { sky: SkyView }) {
  const frame = useStudio((s) => s.frame);
  const look = useStudio((s) => s.look);
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = box.current!;
    const measure = () => {
      const pad = el.clientWidth < 600 ? 20 : 48;
      setAvail({ w: Math.max(0, el.clientWidth - pad * 2), h: Math.max(0, el.clientHeight - pad * 2 - 20) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const k = Math.min(avail.w / frame.width, avail.h / frame.height) || 0;
  const w = Math.floor(frame.width * k);
  const h = Math.floor(frame.height * k);

  return (
    <div className="box canvas-box" ref={box}>
      {w > 0 && (
        <figure className="frame" style={{ width: w, height: h }}>
          <div className="frame-clip">
            <SkyCanvas className="frame-sky" plate={sky.plate} look={look} storm={sky.conditions.storm} />
          </div>
        </figure>
      )}
    </div>
  );
}
