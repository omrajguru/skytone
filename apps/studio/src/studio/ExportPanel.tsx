import { useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, IconButton, Segmented } from '../components/controls.tsx';
import { type ExportFormat, useStudio } from '../state/studio.ts';
import type { SkyView } from '../state/sky.ts';
import { download, runExport, slug } from '../lib/exporter.ts';
import { stamp, startOfDay } from '../lib/time.ts';

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'svg', label: 'SVG' },
  { value: 'mp4', label: 'MP4' },
];


export function ExportPanel({ sky }: { sky: SkyView }) {
  const s = useStudio();
  const [progress, setProgress] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = progress !== null;
  const isVideo = s.exportFormat === 'mp4';

  const run = async () => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setProgress(0);
    try {
      const { blob, filename } = await runExport({
        format: s.exportFormat,
        width: s.frame.width,
        height: s.frame.height,
        plate: sky.plate,
        look: s.look,
        storm: sky.conditions.storm,
        plateAt: sky.plateAt,
        dayStart: startOfDay(s.time, sky.place.timezone),
        videoSeconds: s.videoSeconds,
        videoMotion: s.videoMotion,
        filename: `skytone-${slug(sky.place.name)}-${stamp(s.time, sky.place.timezone)}`,
        onProgress: (p) => setProgress(p),
        signal: ctrl.signal,
      });
      download(blob, filename);
      toast.success(`Saved ${filename}`, { description: `${(blob.size / 1024 / 1024).toFixed(blob.size > 1e6 ? 1 : 2)} MB` });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast.error((e as Error)?.message || 'Export failed.');
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  return (
    <div className="export">
      <Segmented label="Format" value={s.exportFormat} options={FORMATS} onChange={(v) => s.setExport({ exportFormat: v })} size="sm" />
      {s.exportFormat === 'svg' && <p className="hint">SVG keeps the washes; paper texture, drift and grain are left out.</p>}

      {isVideo && (
        <div className="export-video">
          <div className="field-row">
            <span className="field-label">Length</span>
            <Segmented
              label="Length"
              size="sm"
              value={String(s.videoSeconds)}
              options={[{ value: '5', label: '5s' }, { value: '10', label: '10s' }, { value: '15', label: '15s' }, { value: '30', label: '30s' }]}
              onChange={(v) => s.setExport({ videoSeconds: Number(v) })}
            />
          </div>
          <div className="field-row">
            <span className="field-label">Movement</span>
            <Segmented
              label="Movement"
              size="sm"
              value={s.videoMotion}
              options={[{ value: 'ambient', label: 'This moment' }, { value: 'day', label: 'Whole day' }]}
              onChange={(v) => s.setExport({ videoMotion: v })}
            />
          </div>
        </div>
      )}

      <div className="export-action">
        <Button
          variant="primary"
          size="lg"
          onClick={run}
          disabled={busy}
          className="export-btn"
          style={{ '--progress': `${(progress ?? 0) * 100}%` } as React.CSSProperties}
          data-busy={busy || undefined}
        >
          <span className="export-fill" aria-hidden />
          <span className="export-label">
            {busy ? (
              isVideo ? <span className="mono">{Math.round((progress ?? 0) * 100)}%</span> : 'Rendering'
            ) : (
              <>
                <Download size={15} />
                Export {s.exportFormat.toUpperCase()}
              </>
            )}
          </span>
        </Button>
        {busy && isVideo && (
          <IconButton label="Cancel export" onClick={() => abort.current?.abort()}>
            <X size={15} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
