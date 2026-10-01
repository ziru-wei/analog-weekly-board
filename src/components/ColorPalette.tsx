import { useEffect, useRef, type CSSProperties } from 'react';
import type { createTrayViewer as CreateTrayViewer } from './trayViewer';

// Visual approximations of Post-it bright collections (Power/Tropical Pink, Acid Lime).
export const PAPER_COLORS = ['#fff17a', '#e5e8ec', '#ffad70', '#ff4fa4', '#91e447', '#8fd8f5'];
export const PIN_COLORS = ['#e52e35', '#168cde', '#ffc528', '#24af5a', '#454951', '#fff6dd'];

const TRAY_W = 96;
const TRAY_H = 18;
const TRAY_PAD = 6;

const paletteStyles = `
.metal-palette {
  position: fixed;
  z-index: 30;
  transform: translateX(-50%);
  width: ${TRAY_W * 2}px;
  height: ${TRAY_H * 2}px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  isolation: isolate;
  filter: drop-shadow(0 .5px .5px #000000a0) drop-shadow(0 2px 1.5px #00000066) drop-shadow(0 6px 5px #00000055) drop-shadow(0 14px 12px #00000040);
}
.tray-stage { position: absolute; inset: -${TRAY_PAD * 2}px; z-index: -1; pointer-events: none; }
.tray-canvas { display: block; width: 100%; height: 100%; opacity: 0; transition: opacity 200ms; }
.tray-canvas.ready { opacity: 1; }
.swatch {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}
.swatch.active { box-shadow: 0 0 0 1px #ffffffe6, 0 0 0 1.5px #00000066; }
`;

export function ColorPalette({
  kind,
  value,
  x,
  y,
  onChange,
}: {
  kind: 'pin' | 'paper';
  value: string;
  x: number;
  y: number;
  onChange: (color: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = kind === 'pin' ? PIN_COLORS : PAPER_COLORS;
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const stateRef = useRef<ReturnType<typeof CreateTrayViewer> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let state: ReturnType<typeof CreateTrayViewer> | null = null;
    // WebGi is heavy; load it on demand so it stays out of the main bundle.
    import('./trayViewer').then(({ createTrayViewer }) => {
      if (cancelled) return;
      state = createTrayViewer(canvas);
      stateRef.current = state;
      state.setColors(colorsRef.current);
      canvas.classList.add('ready');
    });
    return () => {
      cancelled = true;
      stateRef.current = null;
      state?.viewer.dispose();
    };
  }, []);

  useEffect(() => {
    stateRef.current?.setColors(colors);
  }, [colors]);

  // Hover steers the highlight: the light follows the cursor and the reflected environment swings with it.
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = stateRef.current;
    if (!state) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    state.light.position.set(nx * TRAY_W * 0.5, -ny * TRAY_H * 0.9, 70);
    state.viewer.scene.environmentRotation.set(ny * 0.25, nx * 0.9, 0);
    state.viewer.scene.setDirty();
  };

  return (
    <>
      <style>{paletteStyles}</style>

      <div
        className="metal-palette"
        role="group"
        aria-label={kind === 'pin' ? 'Pin colors' : 'Paper colors'}
        style={{ left: x, top: y } as CSSProperties}
        onPointerMove={handlePointerMove}
      >
        <div className="tray-stage" aria-hidden="true">
          <canvas ref={canvasRef} className="tray-canvas" />
        </div>

        {colors.map(
          (color, index) => (
            <button
              key={color}
              className={`swatch ${value === color ? 'active' : ''}`}
                            aria-label={`${kind === 'pin' ? 'Pin' : 'Paper'} color ${index + 1}`}
              onClick={() => onChange(color)}
            />
          ),
        )}
      </div>
    </>
  );
}
