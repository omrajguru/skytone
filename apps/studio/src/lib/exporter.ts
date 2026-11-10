import { type Look, type Plate, SkyRenderer, plateToSVG, stillBlob } from 'skytone';
import type { ExportFormat, VideoMotion } from '../state/studio.ts';

export interface ExportJob {
  format: ExportFormat;
  width: number;
  height: number;
  plate: Plate;
  look: Look;
  storm: number;
  /** Paints the sky at any instant (for the day-in-motion video). */
  plateAt: (time: number) => Plate;
  dayStart: number;
  videoSeconds: number;
  videoMotion: VideoMotion;
  filename: string;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
}

const MAX_VIDEO_PIXELS = 3840 * 2160;
const FPS = 30;

export async function runExport(job: ExportJob): Promise<{ blob: Blob; filename: string }> {
  const name = `${job.filename}.${job.format}`;
  switch (job.format) {
    case 'png':
      return { blob: await stillBlob(job.plate, { width: job.width, height: job.height, look: job.look }, 'image/png'), filename: name };
    case 'jpg':
    case 'jpeg':
      return { blob: await stillBlob(job.plate, { width: job.width, height: job.height, look: job.look }, 'image/jpeg', 0.94), filename: name };
    case 'svg':
      return { blob: new Blob([plateToSVG(job.plate, job.width, job.height)], { type: 'image/svg+xml' }), filename: name };
    case 'mp4':
      return { blob: await encodeVideo(job), filename: name };
  }
}

async function encodeVideo(job: ExportJob): Promise<Blob> {
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH, canEncodeVideo } = await import('mediabunny');

  let { width, height } = job;
  const k = Math.min(1, Math.sqrt(MAX_VIDEO_PIXELS / (width * height)));
  width = Math.max(2, Math.round((width * k) / 2) * 2);
  height = Math.max(2, Math.round((height * k) / 2) * 2);

  const codecs = ['avc', 'hevc', 'vp9', 'av1'] as const;
  let codec: (typeof codecs)[number] | null = null;
  for (const c of codecs) {
    if (await canEncodeVideo(c, { width, height })) { codec = c; break; }
  }
  if (!codec) throw new Error('This browser cannot encode video. Chrome, Edge and Safari can.');

  const canvas = document.createElement('canvas');
  const renderer = new SkyRenderer(canvas, { size: { width, height }, look: job.look, preserveDrawingBuffer: true });
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();

  const frames = Math.round(job.videoSeconds * FPS);
  const driftRate = 0.25 + job.look.motion * 1.5;
  try {
    renderer.setPlate(job.plate, { instant: true, storm: job.storm });
    for (let i = 0; i < frames; i++) {
      if (job.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      const t = i / FPS;
      if (job.videoMotion === 'day') renderer.setPlate(job.plateAt(job.dayStart + (i / frames) * 86_400_000), { instant: true, storm: job.storm });
      renderer.renderFrame(t * driftRate);
      await source.add(t, 1 / FPS);
      job.onProgress?.((i + 1) / frames);
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  } finally {
    renderer.destroy({ releaseContext: true });
  }
  const buffer = (output.target as InstanceType<typeof BufferTarget>).buffer;
  if (!buffer) throw new Error('Video encoding produced no data.');
  return new Blob([buffer], { type: 'video/mp4' });
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const slug = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sky';
