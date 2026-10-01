import { useId } from 'react';
export const TAPE_WIDTH = 42;
export function TapeRoll() {
  const id = useId().replace(/:/g, '');
  const body = `M12 25 A68 11 0 0 1 148 25 L148 ${25 + TAPE_WIDTH} A68 13 0 0 1 12 ${25 + TAPE_WIDTH}Z`;
  return <svg viewBox="0 0 160 91" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-side`}><stop stopColor="#24577d"/><stop offset=".25" stopColor="#4186b7"/><stop offset=".65" stopColor="#3d7eae"/><stop offset="1" stopColor="#285e85"/></linearGradient>
      <linearGradient id={`${id}-core`} x2="0" y2="1"><stop stopColor="#766d59"/><stop offset="1" stopColor="#d6c9aa"/></linearGradient>
      <pattern id={`${id}-paper`} width="160" height="90" patternUnits="userSpaceOnUse"><image href="/blue-tape-paper.png" width="160" height="90" preserveAspectRatio="xMidYMid slice"/></pattern>
      <clipPath id={`${id}-body`}><path d={body}/></clipPath>
    </defs>
    <ellipse cx="80" cy="81" rx="65" ry="5" fill="#101b25" opacity=".25" style={{filter:'blur(2px)'}}/>
    <g clipPath={`url(#${id}-body)`}>
      <path d={body} fill={`url(#${id}-side)`}/>
      <rect x="10" y="14" width="140" height="86" fill={`url(#${id}-paper)`} opacity=".46" style={{mixBlendMode:'soft-light'}}/>
      <path d="M12 64 Q80 90 148 64 M12 67 Q80 93 148 67 M12 70 Q80 96 148 70" fill="none" stroke="#163f60" strokeOpacity=".18" strokeWidth=".5"/>
    </g>
    <ellipse cx="80" cy="25" rx="68" ry="11" fill="#4b87b2"/>
    <ellipse cx="80" cy="25" rx="68" ry="11" fill={`url(#${id}-paper)`} opacity=".3"/>
    {[33,42,51,60,66].map(r=><ellipse key={r} cx="80" cy="25" rx={r} ry={r*.155} fill="none" stroke="#163f60" strokeWidth=".45" strokeOpacity=".3"/>)}
    <ellipse cx="80" cy="25" rx="27" ry="5" fill={`url(#${id}-core)`}/>
    <path d="M54 24 Q80 18 106 24" fill="none" stroke="#514839" strokeWidth="2"/>
    <ellipse cx="80" cy="25" rx="27" ry="5" fill="none" stroke="#d2c6a9" strokeWidth="1.4"/>
  </svg>;
}
