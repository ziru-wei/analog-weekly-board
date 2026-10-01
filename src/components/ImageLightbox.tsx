import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { BoardItem } from '../model';
import { PhotoImage } from './PhotoImage';
import './Overlays.css';

// Enlarged view: the photo flies from its spot on the board to the middle of the screen while everything else dims and blurs.
export function ImageLightbox({ item, from, boardScale, onClose }: { item: BoardItem; from: { x: number; y: number }; boardScale: number; onClose: () => void }) {
  const data = item.data.type === 'image' ? item.data : null;
  const [phase, setPhase] = useState<'start' | 'open' | 'closing'>('start');
  const closing = useRef(false);
  const target = Math.min((window.innerWidth * .88) / item.width, (window.innerHeight * .84) / item.height);
  const centered = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const transforms = {
    start: `translate(${from.x - centered.x}px, ${from.y - centered.y}px) rotate(${item.rotation}deg) scale(${boardScale})`,
    open: `translate(0px, 0px) rotate(0deg) scale(${target})`,
  };
  useLayoutEffect(() => { const frame = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('open'))); return () => cancelAnimationFrame(frame); }, []);
  const close = () => {
    if (closing.current) return; closing.current = true; setPhase('closing');
    setTimeout(onClose, 230);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (['Escape', 'Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); close(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  if (!data) return null;
  const shown = phase === 'open';
  return <div className={`lightbox ${shown ? 'is-open' : ''}`} onPointerDown={close} role="dialog" aria-label="Enlarged photo">
    <article className={`board-item image photo-${data.frame} lb-photo`}
      style={{ left: centered.x - item.width / 2, top: centered.y - item.height / 2, width: item.width, height: item.height, transform: shown ? transforms.open : transforms.start, '--paper': '#f1eddf', '--lift': '6px', '--shade': .04 } as CSSProperties}>
      <div className="photo-surface"><PhotoImage data={data} /><div className="photo-reflection" /></div>
      {data.frame === 'white' && <div className="photo-caption"><span>{data.caption}</span></div>}
    </article>
    <p className="overlay-hint">space · esc &nbsp;close</p>
  </div>;
}
