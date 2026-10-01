import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { BoardItem, ItemData } from '../model';

type ImageData = Extract<ItemData, { type: 'image' }>;
type Mode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type Rect = { x: number; y: number; w: number; h: number };
export type CropPatch = Partial<Pick<BoardItem, 'x' | 'y' | 'width' | 'height' | 'data'>>;
const MIN = 24;
// Where the photo sits inside each frame (offset) and how much the frame adds to the photo's size (margin).
const FRAME = { white: { off: { x: 11, y: 11 }, m: { x: 22, y: 48 } }, black: { off: { x: 0, y: 8 }, m: { x: 0, y: 16 } }, worn: { off: { x: 0, y: 0 }, m: { x: 0, y: 0 } } };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * In-place crop editor, drawn inside the photo's own (rotated) box. The whole source image is laid out at the
 * scale the photo is currently shown at; the frame you drag is the new visible area. Applying shrinks the photo
 * to that frame without moving the pixels you kept.
 */
export function CropLayer({ item, boardScale, onApply, onCancel }: { item: BoardItem; boardScale: number; onApply: (patch: CropPatch) => void; onCancel: () => void }) {
  const data = item.data as ImageData;
  const { off, m } = FRAME[data.frame];
  const sw = item.width - m.x, sh = item.height - m.y, c0 = data.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const img = { w: sw / c0.w, h: sh / c0.h, l: off.x - c0.x * (sw / c0.w), t: off.y - c0.y * (sh / c0.h) };
  const [rect, setRect] = useState<Rect>({ x: off.x, y: off.y, w: sw, h: sh });
  const layer = useRef<HTMLDivElement>(null), drag = useRef<{ mode: Mode; x: number; y: number; start: Rect } | null>(null);
  const rectRef = useRef(rect); rectRef.current = rect;

  const apply = () => {
    const r = rectRef.current;
    if (Math.abs(r.x - off.x) < .5 && Math.abs(r.y - off.y) < .5 && Math.abs(r.w - sw) < .5 && Math.abs(r.h - sh) < .5) return onCancel();
    const crop = { x: (r.x - img.l) / img.w, y: (r.y - img.t) / img.h, w: r.w / img.w, h: r.h / img.h };
    const full = crop.w > .995 && crop.h > .995;
    const width = r.w + m.x, height = r.h + m.y;
    // New box in the old box's local space, then through the item's rotation into board space.
    const local = { x: r.x - off.x + width / 2 - item.width / 2, y: r.y - off.y + height / 2 - item.height / 2 };
    const a = item.rotation * Math.PI / 180, cx = item.x + item.width / 2 + local.x * Math.cos(a) - local.y * Math.sin(a), cy = item.y + item.height / 2 + local.x * Math.sin(a) + local.y * Math.cos(a);
    onApply({ data: { ...data, crop: full ? undefined : crop, sourceAspect: data.sourceAspect ?? data.aspectRatio, aspectRatio: r.w / r.h }, width, height, x: cx - width / 2, y: cy - height / 2 });
  };
  const reset = () => setRect({ x: img.l, y: img.t, w: img.w, h: img.h });
  const latest = useRef({ apply, reset }); latest.current = { apply, reset };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); latest.current.apply(); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
      else if (event.key.toLowerCase() === 'r') { event.stopPropagation(); latest.current.reset(); }
    };
    const onOutside = (event: globalThis.PointerEvent) => { if (!layer.current?.contains(event.target as Node)) latest.current.apply(); };
    window.addEventListener('keydown', onKey, true); window.addEventListener('pointerdown', onOutside, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onOutside, true); };
  }, []);

  const down = (mode: Mode) => (event: PointerEvent) => {
    event.preventDefault(); event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    drag.current = { mode, x: event.clientX, y: event.clientY, start: rect };
  };
  const move = (event: PointerEvent) => {
    const d = drag.current; if (!d) return;
    // screen delta -> board px -> the (slightly rotated) photo's own axes
    const a = -item.rotation * Math.PI / 180, bx = (event.clientX - d.x) / boardScale, by = (event.clientY - d.y) / boardScale;
    const dx = bx * Math.cos(a) - by * Math.sin(a), dy = bx * Math.sin(a) + by * Math.cos(a), s = d.start;
    const L = img.l, T = img.t, R = img.l + img.w, B = img.t + img.h;
    let { x, y, w, h } = s;
    if (d.mode === 'move') { x = clamp(s.x + dx, L, R - s.w); y = clamp(s.y + dy, T, B - s.h); }
    else {
      if (d.mode.includes('w')) { x = clamp(s.x + dx, L, s.x + s.w - MIN); w = s.x + s.w - x; }
      if (d.mode.includes('e')) w = clamp(s.w + dx, MIN, R - s.x);
      if (d.mode.includes('n')) { y = clamp(s.y + dy, T, s.y + s.h - MIN); h = s.y + s.h - y; }
      if (d.mode.includes('s')) h = clamp(s.h + dy, MIN, B - s.y);
    }
    setRect({ x, y, w, h });
  };
  const handles: Mode[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const place: CSSProperties = { left: img.l, top: img.t, width: img.w, height: img.h };
  const clip = `inset(${rect.y - img.t}px ${img.l + img.w - rect.x - rect.w}px ${img.t + img.h - rect.y - rect.h}px ${rect.x - img.l}px)`;
  return <div ref={layer} className="crop-layer" style={{ '--u': 1 / boardScale } as CSSProperties} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    <img className="crop-ghost" src={data.src} alt="" draggable={false} style={place} />
    <img className="crop-lit" src={data.src} alt="" draggable={false} style={{ ...place, clipPath: clip }} />
    <div className="crop-frame" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} onPointerDown={down('move')} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {handles.map(h => <span key={h} className={`crop-handle ${h}`} onPointerDown={down(h)} onPointerMove={move} onPointerUp={() => { drag.current = null; }} />)}
    </div>
  </div>;
}
