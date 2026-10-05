import { useEffect, useState, type PointerEvent } from 'react';
import { SILVER_PIN_COLOR, type Pin as PinModel, type Point } from '../model';
import { Pin } from './Pin';
const OFFSETS = [[51, 27], [94, 20], [131, 30], [33, 61], [74, 57], [115, 67], [157, 58]];
export function PinSupply({ center, onDrag }: { center: Point; onDrag: (event: PointerEvent, color: string, kind?: PinModel['kind']) => void }) {
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
    <div data-supply-pin="silver">
      <Pin pin={{ id: 'supply-silver', itemId: null, xRatio: 0, yRatio: 0, color: SILVER_PIN_COLOR, kind: 'silver' }} center={center}
        position={{ x: 376, y: 958 }} moving={false} connecting={false} decorative
        label="Drag a silver pushpin onto an item to keep it on future weeks"
        onPointerDown={event => onDrag(event, SILVER_PIN_COLOR, 'silver')} onPalette={() => {}} />
    </div>
  </div>;
}
