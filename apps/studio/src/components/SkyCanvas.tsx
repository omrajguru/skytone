import { useEffect, useRef, useState } from 'react';
import { type Look, type Plate, PLATE_H, PLATE_W, SkyRenderer } from 'skytone';
import { useReducedMotion } from '../state/sky.ts';

interface Props {
  plate: Plate;
  look: Look;
  storm?: number;
  className?: string;
}

/** The live sky. WebGL2 when available, a softened 2D canvas otherwise. */
export function SkyCanvas({ plate, look, storm = 0, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<SkyRenderer | null>(null);
  const [fallback, setFallback] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!ref.current || fallback) return;
    try {
      renderer.current = new SkyRenderer(ref.current, { look });
      renderer.current.setPlate(plate, { instant: true, storm });
      renderer.current.start();
    } catch {
      setFallback(true);
    }
    return () => {
      renderer.current?.destroy();
      renderer.current = null;
    };
    // The renderer is created once; plate and look flow in through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback]);

  useEffect(() => {
    renderer.current?.setPlate(plate, { storm: reduce ? 0 : storm });
  }, [plate, storm, reduce]);

  useEffect(() => {
    renderer.current?.setLook(reduce ? { ...look, motion: 0 } : look);
  }, [look, reduce]);

  useEffect(() => {
    if (!fallback || !ref.current) return;
    const c = ref.current;
    c.width = PLATE_W;
    c.height = PLATE_H;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(PLATE_W, PLATE_H);
    for (let i = 0, j = 0; i < plate.length; i += 3, j += 4) {
      img.data[j] = plate[i]; img.data[j + 1] = plate[i + 1]; img.data[j + 2] = plate[i + 2]; img.data[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [fallback, plate]);

  return (
    <canvas
      ref={ref}
      className={className}
      data-fallback={fallback || undefined}
      aria-hidden="true"
    />
  );
}
