import { memo, useRef, type CSSProperties } from 'react';
import { type BoardDocument, type BoardItem, clamp, pinPosition } from '../model';
import { ropePath } from './Ropes';
import { Tape } from './Tape';
import { useNoteTextLayout } from './useNoteTextLayout';

// A static, vector rendition of a board, used for archive thumbnails and the full-size archive viewer.
function PreviewItem({ item }: { item: BoardItem }) {
  const note = useRef<HTMLDivElement>(null);
  useNoteTextLayout(item, note);
  const { x, y, width: w, height: h, data } = item;
  const transform = `rotate(${item.rotation} ${x + w / 2} ${y + h / 2})`;
  const shadow = 'drop-shadow(0 3px 4px #28140866)';
  if (data.type === 'tape') return <foreignObject x={x} y={y} width={w} height={h} transform={transform} style={{ overflow: 'visible' }}>
    <div style={{ position: 'relative', width: '100%', height: '100%' }}><Tape /></div>
  </foreignObject>;
  if (data.type === 'sticky') {
    return <g transform={transform} style={{ filter: shadow }}>
      <rect x={x} y={y} width={w} height={h} fill={data.color} />
      <foreignObject x={x} y={y} width={w} height={h}>
        <div className={`${data.variant ? 'small-label' : ''} ${data.variant === 'vellum' ? 'vellum-label' : ''}`} style={{ height: '100%', '--note-pad': `${clamp(w * .06, 9, 18)}px`, '--note-top': `${clamp(h * .09, 14, 25)}px` } as CSSProperties}>
          <div ref={note} className="note-text" style={{ overflow: 'hidden' }}>{data.text}</div>
        </div>
      </foreignObject>
    </g>;
  }
  if (data.type === 'image') {
    const white = data.frame === 'white', black = data.frame === 'black';
    const pad = white ? { l: 11, t: 11, r: 11, b: 37 } : black ? { l: 0, t: 0, r: 0, b: 16 } : { l: 0, t: 0, r: 0, b: 0 };
    return <g transform={transform} style={{ filter: shadow }}>
      <rect x={x} y={y} width={w} height={h} fill={white ? '#f1eddf' : black ? '#151515' : '#d8d2c2'} />
      <image href={data.src} x={x + pad.l} y={y + pad.t} width={w - pad.l - pad.r} height={h - pad.t - pad.b} preserveAspectRatio="xMidYMid slice" />
    </g>;
  }
  return <g transform={transform} style={{ filter: shadow }}>
    <rect x={x} y={y} width={w} height={h} fill="#f7f6f1" />
    <foreignObject x={x} y={y} width={w} height={h}>
      <div style={{ boxSizing: 'border-box', padding: '14px 16px', font: "620 20px/1.16 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: '#2b2a27', overflowWrap: 'anywhere', overflow: 'hidden', height: '100%' }}>
        <div style={{ font: "550 12px/1.2 'IBM Plex Mono', 'Roboto Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace", color: '#8a867b', marginBottom: 6 }}>{data.domain}</div>{data.title}
      </div>
    </foreignObject>
  </g>;
}

function SimpleItem({ item }: { item: BoardItem }) {
  const { x, y, width, height, data } = item;
  const text = data.type === 'sticky' ? data.text : data.type === 'website' ? data.title : '';
  const rows = text.trim() ? Math.min(4, Math.max(1, Math.ceil(text.length / 24)), Math.max(1, Math.floor((height - 20) / 20))) : 0;
  return <g transform={`rotate(${item.rotation} ${x + width / 2} ${y + height / 2})`}>
    <rect x={x} y={y} width={width} height={height} fill={data.type === 'tape' ? '#3f83b7' : data.type === 'sticky' ? data.color : data.type === 'image' ? '#b0aaa0' : '#f7f6f1'} />
    {data.type === 'image' && <image href={data.src} x={x + 6} y={y + 6} width={Math.max(1, width - 12)} height={Math.max(1, height - 12)} preserveAspectRatio="xMidYMid slice" />}
    {Array.from({ length: rows }, (_, i) => <rect key={i} x={x + width * .08} y={y + 12 + i * 20} width={width * (i === rows - 1 ? .48 : .8)} height={5} rx={2} fill="#77756f" opacity=".55" />)}
  </g>;
}

export const BoardPreview = memo(function BoardPreview({ doc, className, simplified = false }: { doc: BoardDocument; className?: string; simplified?: boolean }) {
  const items = Object.values(doc.items).sort((a, b) => a.zIndex - b.zIndex);
  const position = (pinId: string) => { const pin = doc.pins[pinId]; return pin ? pinPosition(pin, pin.itemId ? doc.items[pin.itemId] : undefined) : null; };
  return <svg className={className} viewBox={`0 0 ${doc.board.width} ${doc.board.height}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Board: ${doc.board.title}`}>
    {Object.values(doc.connections).map(c => {
      const a = position(c.fromPinId), b = position(c.toPinId); if (!a || !b) return null;
      const d = ropePath(a, b);
      if (simplified) return <path key={c.id} d={d} fill="none" stroke="#554234" strokeWidth="2.2" />;
      return <g key={c.id} fill="none" strokeLinecap="round"><path d={d} stroke="#281a10" strokeWidth="3.2" opacity=".3" transform="translate(2 6)" /><path d={d} stroke="#554234" strokeWidth="2.2" /></g>;
    })}
    {items.map(item => simplified ? <SimpleItem key={item.id} item={item} /> : <PreviewItem key={item.id} item={item} />)}
    {Object.values(doc.pins).map(pin => { const p = position(pin.id); return p && (simplified ? <circle key={pin.id} cx={p.x} cy={p.y} r="7" fill={pin.color} /> : <g key={pin.id}><circle cx={p.x + 2} cy={p.y + 5} r="7" fill="#20140e" opacity=".35" /><circle cx={p.x} cy={p.y} r="7" fill={pin.color} /><circle cx={p.x - 2} cy={p.y - 2.5} r="2" fill="#fff" opacity=".7" /></g>); })}
  </svg>;
});
