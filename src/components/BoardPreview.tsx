import { type BoardDocument, type BoardItem, pinPosition } from '../model';
import { ropePath } from './Ropes';

// A static, vector rendition of a board, used for archive thumbnails and the full-size archive viewer.
function PreviewItem({ item }: { item: BoardItem }) {
  const { x, y, width: w, height: h, data } = item;
  const transform = `rotate(${item.rotation} ${x + w / 2} ${y + h / 2})`;
  const shadow = 'drop-shadow(0 3px 4px #28140866)';
  if (data.type === 'tape') return <rect x={x} y={y} width={w} height={h} fill="#e9dfc4" opacity=".72" transform={transform} />;
  if (data.type === 'sticky') {
    const label = !!data.variant;
    return <g transform={transform} style={{ filter: shadow }}>
      <rect x={x} y={y} width={w} height={h} fill={data.color} />
      <foreignObject x={x} y={y} width={w} height={h}>
        <div style={{ boxSizing: 'border-box', padding: label ? '4px 10px' : `${h * .09}px ${w * .06}px`, font: `300 ${data.fontSize ?? (label ? 17 : 22)}px/1.22 Kalam, cursive`, color: label ? '#ece7da' : '#494639', whiteSpace: 'pre-wrap', overflow: 'hidden', height: '100%' }}>{data.text}</div>
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
      <div style={{ boxSizing: 'border-box', padding: '14px 16px', font: '600 20px/1.2 "DM Sans", sans-serif', color: '#2b2a27', overflow: 'hidden', height: '100%' }}>
        <div style={{ font: '400 12px "DM Sans", sans-serif', color: '#8a867b', marginBottom: 6 }}>{data.domain}</div>{data.title}
      </div>
    </foreignObject>
  </g>;
}

export function BoardPreview({ doc, className }: { doc: BoardDocument; className?: string }) {
  const items = Object.values(doc.items).sort((a, b) => a.zIndex - b.zIndex);
  const position = (pinId: string) => { const pin = doc.pins[pinId]; return pin ? pinPosition(pin, pin.itemId ? doc.items[pin.itemId] : undefined) : null; };
  return <svg className={className} viewBox={`0 0 ${doc.board.width} ${doc.board.height}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Board: ${doc.board.title}`}>
    {Object.values(doc.connections).map(c => {
      const a = position(c.fromPinId), b = position(c.toPinId); if (!a || !b) return null;
      const d = ropePath(a, b);
      return <g key={c.id} fill="none" strokeLinecap="round"><path d={d} stroke="#281a10" strokeWidth="3.2" opacity=".3" transform="translate(2 6)" /><path d={d} stroke="#554234" strokeWidth="2.2" /></g>;
    })}
    {items.map(item => <PreviewItem key={item.id} item={item} />)}
    {Object.values(doc.pins).map(pin => { const p = position(pin.id); return p && <g key={pin.id}><circle cx={p.x + 2} cy={p.y + 5} r="7" fill="#20140e" opacity=".35" /><circle cx={p.x} cy={p.y} r="7" fill={pin.color} /><circle cx={p.x - 2} cy={p.y - 2.5} r="2" fill="#fff" opacity=".7" /></g>; })}
  </svg>;
}
