import { useId, type PointerEvent } from 'react';
import type { Pin as PinModel, Point } from '../model';
export function Pin({ pin, position, center = { x: 800, y: 500 }, moving, connecting, decorative = false, metallic = false, label, onPointerDown, onPalette }: {
  pin: PinModel; position: Point; center?: Point; moving: boolean; connecting: boolean; decorative?: boolean; metallic?: boolean; label?: string;
  onPointerDown: (event: PointerEvent, pin: PinModel) => void; onPalette: (pin: PinModel) => void;
}) {
  const id = useId().replace(/:/g, '');
  // Project the upright shaft away from the viewer, using its live board position.
  const dx = ((position.x - 800) / 800) * 7;
  const dy = ((position.y - 500) / 500) * 8 - 4;
  const angle = Math.atan2(dx, -dy) * 180 / Math.PI;
  const rise = Math.max(5, Math.min(13, Math.hypot(dx, dy)));
  const capY = 20 - rise;
  const lightX = center.x - position.x, lightY = center.y - position.y;
  const distance = Math.hypot(lightX, lightY);
  const shadowLength = Math.min(5.5, distance / 130);
  const shadowAngle = Math.atan2(lightY, lightX) * 180 / Math.PI;

  return <button className={`pin ${moving ? 'repositioning' : ''} ${connecting ? 'connect-target' : ''}`} data-pin-id={decorative ? undefined : pin.id} tabIndex={decorative ? -1 : undefined}
    aria-label={label ?? "Pushpin: drag to connect; hold to move; right-click to recolor"} title={label ?? "Drag to connect · Drop on cork to remove · Hold to move · Right-click to recolor"}
    style={{ left: position.x, top: position.y }}
    onPointerDown={event => onPointerDown(event, pin)} onDoubleClick={event => event.stopPropagation()}
    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); onPalette(pin); }} onClick={event => { event.stopPropagation(); if (event.detail === 0) onPalette(pin); }}>
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-dome`} cx="32%" cy="22%" r="80%">
          <stop stopColor="white" stopOpacity={metallic ? .88 : .36}/><stop offset=".3" stopColor="white" stopOpacity=".16"/>
          <stop offset=".7" stopColor="#071429" stopOpacity={metallic ? .38 : .08}/><stop offset="1" stopColor="#071429" stopOpacity=".32"/>
        </radialGradient>
        <linearGradient id={`${id}-shaft`}>
          <stop stopColor="white" stopOpacity=".26"/><stop offset=".3" stopColor="white" stopOpacity={metallic ? .8 : .28}/>
          <stop offset="1" stopColor="#071429" stopOpacity=".25"/>
        </linearGradient>
        <linearGradient id={`${id}-cap`} x1="0" y1="0" x2=".35" y2="1">
          <stop stopColor="white" stopOpacity={metallic ? .95 : .46}/><stop offset=".4" stopColor="white" stopOpacity=".12"/>
          <stop offset="1" stopColor="#071429" stopOpacity=".18"/>
        </linearGradient>
        <filter id={`${id}-gloss`} x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation=".55"/></filter>
        <filter id={`${id}-cast`} x="-60%" y="-100%" width="220%" height="300%"><feGaussianBlur stdDeviation="1.3"/></filter>
        <filter id={`${id}-contact`} x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation=".8"/></filter>
      </defs>
      <g className="pin-cast-shadow" transform={`rotate(${shadowAngle} 20 20)`}>
        <ellipse cx={20 + shadowLength} cy="20" rx={8 + shadowLength * .45} ry="5.8" fill="#302016" opacity=".34" filter={`url(#${id}-cast)`}/>
      </g>
      <ellipse cx="20" cy="20.6" rx="9.5" ry="6.3" fill="#26180f" opacity=".38" filter={`url(#${id}-contact)`}/>
      <g className="pin-body" transform={`rotate(${angle} 20 20)`}>
        <path d="M10.6 20 C10.6 15.7 14.8 12.7 20 12.7 C25.2 12.7 29.4 15.7 29.4 20 C29.4 23.8 25.4 26.5 20 26.5 C14.6 26.5 10.6 23.8 10.6 20Z" fill={pin.color}/>
        <path d="M10.6 20 C10.6 15.7 14.8 12.7 20 12.7 C25.2 12.7 29.4 15.7 29.4 20 C29.4 23.8 25.4 26.5 20 26.5 C14.6 26.5 10.6 23.8 10.6 20Z" fill={`url(#${id}-dome)`}/>
        <path d="M12.7 17.5 Q13.8 14.7 17 14.5 L16.3 18.5 Q14.3 19 13 20.4Z" fill="white" opacity={metallic ? .55 : .32} filter={`url(#${id}-gloss)`}/>
        <path d={`M16 ${capY + 1} L15.5 19 Q15.5 23 20 23 Q24.5 23 24.5 19 L24 ${capY + 1} Z`} fill={pin.color}/>
        <path d={`M16 ${capY + 1} L15.5 19 Q15.5 23 20 23 Q24.5 23 24.5 19 L24 ${capY + 1} Z`} fill={`url(#${id}-shaft)`}/>
        <ellipse cx="20" cy={capY + 1} rx="7.7" ry="4.8" fill={pin.color}/>
        <ellipse cx="20" cy={capY + 1} rx="7.7" ry="4.8" fill="#071429" opacity=".18"/>
        <ellipse cx="20" cy={capY} rx="7.7" ry="4.5" fill={pin.color}/>
        <ellipse cx="20" cy={capY} rx="7.7" ry="4.5" fill={`url(#${id}-cap)`}/>
        <path d={`M14 ${capY - 1.1} Q17 ${capY - 3.5} 23.5 ${capY - 2} L24 ${capY - .8} Q18 ${capY - 1.6} 14.5 ${capY + .4}Z`} fill="white" opacity={metallic ? .6 : .37} filter={`url(#${id}-gloss)`}/>
      </g>
    </svg>
  </button>;
}
