import type { CSSProperties } from 'react';
import type { ItemData } from '../model';

type ImageData = Extract<ItemData, { type: 'image' }>;
// The photo itself. A crop is a normalized rectangle of the source; the oversized <img> is positioned so only it shows.
export function PhotoImage({ data }: { data: ImageData }) {
  const c = data.crop;
  if (!c) return <img className="photo" src={data.src} alt={data.alt} draggable={false} />;
  const style: CSSProperties = { position: 'absolute', maxWidth: 'none', objectFit: 'fill', width: `${100 / c.w}%`, height: `${100 / c.h}%`, left: `${-c.x / c.w * 100}%`, top: `${-c.y / c.h * 100}%` };
  return <img className="photo" src={data.src} alt={data.alt} draggable={false} style={style} />;
}
