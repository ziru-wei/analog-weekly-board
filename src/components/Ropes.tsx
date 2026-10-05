import { useEffect, useRef, useState } from 'react';
import { type BoardDocument, type Point, clamp, pinPosition } from '../model';
export function ropePath(a: Point, b: Point, slack = 1) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const sag = clamp(distance * .07, 8, 42);
  return `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + sag * 2 * slack} ${b.x} ${b.y}`;
}
export function Ropes({ document, selected, selectedPins, temporary, onSelect }: {
  document: BoardDocument; selected?: string; selectedPins?: string[]; temporary: { from: string; to: Point } | null; onSelect: (id: string) => void;
}) {
  const position = (id: string) => { const pin = document.pins[id]; return pin ? pinPosition(pin, pin.itemId ? document.items[pin.itemId] : undefined) : null; };
  const start = temporary && position(temporary.from);
  return <svg className="ropes" viewBox="0 0 1600 1000" aria-label="Strings between pins">
    {Object.values(document.connections).map(connection => {
      const a = position(connection.fromPinId), b = position(connection.toPinId); if (!a || !b) return null;
      return <Rope key={connection.id} a={a} b={b} selected={selected === connection.id || !!(selectedPins?.includes(connection.fromPinId) && selectedPins.includes(connection.toPinId))} onSelect={() => onSelect(connection.id)} />;
    })}
    {temporary && start && <path d={ropePath(start, temporary.to)} className="rope-thread temporary" />}
  </svg>;
}

function Rope({ a, b, selected, onSelect }: { a: Point; b: Point; selected: boolean; onSelect: () => void }) {
  const [slack, setSlack] = useState(1);
  const currentSlack = useRef(1);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const target = selected ? .08 : 1;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || currentSlack.current === target) { currentSlack.current = target; setSlack(target); return; }
    let frame = 0;
    const start = performance.now();
    const stops = selected ? [[0, currentSlack.current], [.55, .04], [.8, .11], [1, .08]] : [[0, currentSlack.current], [.48, 1.08], [.74, .96], [1, 1]];
    const duration = selected ? 200 : 360;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const i = Math.max(1, stops.findIndex(stop => stop[0] >= t));
      const [t0, v0] = stops[i - 1], [t1, v1] = stops[i];
      const progress = (t - t0) / (t1 - t0);
      currentSlack.current = v0 + (v1 - v0) * (1 - Math.cos(progress * Math.PI)) / 2;
      setSlack(currentSlack.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [selected, pulse]);
  const select = () => { setPulse(value => value + 1); onSelect(); };
  const d = ropePath(a, b, slack);
  return <g className={selected ? 'rope selected' : 'rope'}>
    <path d={d} className="rope-shadow" transform="translate(2 7)" />
    <path d={d} className="rope-thread" />
    <path d={d} className="rope-hit" role="button" tabIndex={0} aria-label="Select string"
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); select(); }}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); select(); } }} />
  </g>;
}
