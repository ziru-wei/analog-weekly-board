import { useEffect, useRef } from 'react';
import './AccessoryTray.css';
import { TapeRoll } from './TapeRoll';
import type { createAccessoryViewer } from './accessoryViewer';

export function AccessoryTray({ held, onPickUp }: { held: boolean; onPickUp: (event: React.MouseEvent) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ReturnType<typeof createAccessoryViewer> | null>(null);
  useEffect(() => {
    let cancelled = false;
    let viewer: ReturnType<typeof createAccessoryViewer> | undefined;
    import('./accessoryViewer').then(module => {
      if (cancelled || !canvas.current) return;
      viewer = module.createAccessoryViewer(canvas.current); renderer.current = viewer;
    });
    return () => { cancelled = true; renderer.current = null; viewer?.viewer.dispose(); };
  }, []);
  return <div className="accessory-tray" onPointerMove={event => {
    const rect = event.currentTarget.getBoundingClientRect();
    renderer.current?.hover((event.clientX - rect.left) / rect.width * 2 - 1, (event.clientY - rect.top) / rect.height * 2 - 1);
  }} onPointerLeave={() => renderer.current?.hover(0, 0)} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    <canvas ref={canvas} className="accessory-metal" aria-hidden="true" />
    {!held && <div className="tape-seat" aria-hidden="true" />}
    <button className={`blue-tape-roll ${held ? 'is-empty' : ''}`} aria-label={held ? 'Return blue painter’s tape' : 'Pick up blue painter’s tape'} title={held ? 'Return tape · Escape' : 'Pick up tape, then drag on the board'} onClick={onPickUp}>
      {!held && <TapeRoll />}
    </button>
  </div>;
}
