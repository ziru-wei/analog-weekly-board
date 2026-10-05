import { useEffect, useRef, useState } from 'react';
import type { Point } from '../model';
import type { createSilverPinViewer, SilverPinVisual } from './silverPinViewer';

export function SilverPins({ pins, center }: { pins: SilverPinVisual[]; center: Point }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ReturnType<typeof createSilverPinViewer> | null>(null);
  const latest = useRef({ pins, center }); latest.current = { pins, center };
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let state: ReturnType<typeof createSilverPinViewer> | undefined;
    import('./silverPinViewer').then(({ createSilverPinViewer }) => {
      if (cancelled || !canvas.current) return;
      state = createSilverPinViewer(canvas.current); renderer.current = state;
      state.update(latest.current.pins, latest.current.center);
      requestAnimationFrame(() => requestAnimationFrame(() => { if (!cancelled) setReady(true); }));
    });
    return () => { cancelled = true; renderer.current = null; state?.viewer.dispose(); };
  }, []);
  useEffect(() => { renderer.current?.update(pins, center); }, [pins, center]);
  return <canvas ref={canvas} className="silver-pins-canvas" data-canvas-loading={!ready || undefined} aria-hidden="true" />;
}
