import { type Plate, PLATE_H, PLATE_W } from './plate.ts';
import { type Look, SkyRenderer } from './renderer.ts';
import { toHex } from './color.ts';

export interface StillOptions {
  width: number;
  height: number;
  look?: Partial<Look>;
  storm?: number;
  /** Seconds on the drift clock. */
  time?: number;
}

/** Render a plate at full resolution into a fresh canvas. */
export function renderStill(plate: Plate, o: StillOptions): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const r = new SkyRenderer(canvas, { size: { width: o.width, height: o.height }, look: o.look, preserveDrawingBuffer: true });
  r.setPlate(plate, { instant: true, storm: 0 });
  r.renderFrame(o.time ?? 0);
  const out = document.createElement('canvas');
  out.width = o.width;
  out.height = o.height;
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  r.destroy({ releaseContext: true });
  return out;
}

export function stillBlob(plate: Plate, o: StillOptions, type: 'image/png' | 'image/jpeg', quality = 0.95): Promise<Blob> {
  const canvas = renderStill(plate, o);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality),
  );
}

/**
 * A resolution-independent SVG: the plate as a grid of colour cells under a Gaussian blur.
 * Edge cells are repeated outward so the blur never darkens the frame's edges.
 */
export function plateToSVG(plate: Plate, width: number, height: number): string {
  const pa = PLATE_W / PLATE_H, va = width / height;
  const cell = va > pa ? width / PLATE_W : height / PLATE_H;
  const gridW = cell * PLATE_W, gridH = cell * PLATE_H;
  const ox = (width - gridW) / 2, oy = (height - gridH) / 2;
  const PAD = 3;
  const rects: string[] = [];
  const f = (n: number) => +n.toFixed(2);
  for (let j = -PAD; j < PLATE_H + PAD; j++) {
    const jj = Math.max(0, Math.min(PLATE_H - 1, j));
    let run = 0;
    for (let i = -PAD; i < PLATE_W + PAD; i++) {
      const ii = Math.max(0, Math.min(PLATE_W - 1, i));
      const k = (jj * PLATE_W + ii) * 3;
      const hex = toHex([plate[k], plate[k + 1], plate[k + 2]]);
      const nextI = i + 1;
      const nk = nextI < PLATE_W + PAD ? (jj * PLATE_W + Math.max(0, Math.min(PLATE_W - 1, nextI))) * 3 : -1;
      const nextHex = nk >= 0 ? toHex([plate[nk], plate[nk + 1], plate[nk + 2]]) : '';
      run++;
      if (nextHex === hex) continue;
      const x0 = i - run + 1;
      rects.push(`<rect x="${f(ox + x0 * cell)}" y="${f(oy + j * cell)}" width="${f(run * cell + 0.5)}" height="${f(cell + 0.5)}" fill="${hex}"/>`);
      run = 0;
    }
  }
  const sigma = f(cell * 0.8);
  const m = f(PAD * cell);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><filter id="s" x="${-m}" y="${-m}" width="${f(width + 2 * m)}" height="${f(height + 2 * m)}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${sigma}"/></filter><clipPath id="c"><rect width="${width}" height="${height}"/></clipPath></defs>
<g clip-path="url(#c)"><g filter="url(#s)">${rects.join('')}</g></g>
</svg>`;
}
