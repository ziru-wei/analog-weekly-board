import { useEffect, useState, type PointerEvent } from 'react';
import type { Point } from '../model';
import { Pin } from './Pin';
const OFFSETS = [[51, 27], [94, 20], [131, 30], [33, 61], [74, 57], [115, 67], [157, 58]];
export function PinSupply({ center, onDrag }: { center: Point; onDrag: (event: PointerEvent, color: string) => void }) {
  const [day, setDay] = useState(() => (new Date().getDay() + 6) % 7 + 1);
  useEffect(() => { const timer = setInterval(() => setDay((new Date().getDay() + 6) % 7 + 1), 60_000); return () => clearInterval(timer); }, []);
  return <div className="pin-supply" aria-label="Spare pushpins: drag to copy" onDoubleClick={event => event.stopPropagation()}>
    {OFFSETS.map(([x, y], index) => {
      const color = index < day ? '#e52e35' : '#f5f5f0';
      return <div key={index} data-supply-pin={index}>
        <Pin pin={{ id: `supply-${index}`, itemId: null, xRatio: 0, yRatio: 0, color }} center={center}
          position={{ x: 190 + x, y: 920 + y }} moving={false} connecting={false} decorative
          label={`Drag a ${index < day ? 'red' : 'white'} pushpin to copy`}
          onPointerDown={event => onDrag(event, color)} onPalette={() => {}} />
      </div>;
    })}
  </div>;
}
