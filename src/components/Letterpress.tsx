/**
 * SVG filters that make card text look letterpressed: the ink spreads a little into the paper with ragged edges,
 * the paper shows through where the ink is thin, a lit lip sits under each stroke where the type pressed in,
 * a soft shadow rims the top edge, and the top of each stroke is shaded. The press is uneven, like a real one:
 * a slow wave of pressure along the line makes some letters inkier and deeper than others.
 * Used by `.card-stock` text via `filter: url(#letterpress)`.
 */
function Press({ id, lip, rim, shade }: { id: string; lip: number; rim: number; shade: number }) {
  return <filter id={id} x="-4%" y="-40%" width="108%" height="180%" colorInterpolationFilters="sRGB">
    <feMorphology in="SourceAlpha" operator="dilate" radius=".1" result="spread" />
    <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5" result="noise" />
    <feDisplacementMap in="spread" in2="noise" scale=".7" xChannelSelector="R" yChannelSelector="G" result="shape" />
    {/* Pressure varies slowly along the line (every few letters) and hardly at all across it. */}
    <feTurbulence type="fractalNoise" baseFrequency=".035 .2" numOctaves="2" seed="11" result="wave" />
    <feColorMatrix in="wave" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .6 0 0 0 .78" result="inkPressure" />
    <feColorMatrix in="wave" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2 0 0 0 -.25" result="depth" />
    <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -.15 0 0 0 1.05" result="density" />
    <feMorphology in="SourceGraphic" operator="dilate" radius=".1" result="wideInk" />
    <feComposite in="wideInk" in2="shape" operator="in" result="ink0" />
    <feComposite in="ink0" in2="density" operator="in" result="ink1" />
    <feComposite in="ink1" in2="inkPressure" operator="in" result="ink" />
    <feOffset in="shape" dy="1.3" result="down" />
    <feComposite in="down" in2="shape" operator="out" result="lipEdge" />
    <feGaussianBlur in="lipEdge" stdDeviation=".3" result="lipShape" />
    <feFlood floodColor="#fff" floodOpacity={lip} />
    <feComposite in2="lipShape" operator="in" result="lip0" />
    <feComposite in="lip0" in2="depth" operator="in" result="lip" />
    <feOffset in="shape" dy="-.65" result="up" />
    <feComposite in="up" in2="shape" operator="out" result="rimEdge" />
    <feGaussianBlur in="rimEdge" stdDeviation=".3" result="rimShape" />
    <feFlood floodColor="#000" floodOpacity={rim} />
    <feComposite in2="rimShape" operator="in" result="rim0" />
    <feComposite in="rim0" in2="depth" operator="in" result="rim" />
    <feOffset in="shape" dy=".8" result="down2" />
    <feComposite in="shape" in2="down2" operator="out" result="topEdge" />
    <feFlood floodColor="#000" floodOpacity={shade} />
    <feComposite in2="topEdge" operator="in" result="shade" />
    <feMerge><feMergeNode in="lip" /><feMergeNode in="rim" /><feMergeNode in="ink" /><feMergeNode in="shade" /></feMerge>
  </filter>;
}
export function LetterpressFilters() {
  return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
    <Press id="letterpress" lip={.85} rim={.24} shade={.4} />
  </svg>;
}
