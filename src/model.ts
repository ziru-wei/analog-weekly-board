export type ItemData =
  | { type: 'tape' }
  | { type: 'sticky'; text: string; color: string; fontSize?: number; variant?: 'label' | 'vellum'; labelWidth?: number }
  | { type: 'image'; src: string; alt: string; aspectRatio: number; frame: 'white' | 'black' | 'worn'; caption?: string; sourceAspect?: number; crop?: { x: number; y: number; w: number; h: number } }
  | { type: 'website'; url: string; title: string; domain: string; description: string; image?: string; media?: { images: string[]; video?: { url: string; width: number; height: number } }; compact?: boolean; expandedSize?: { width: number; height: number } };
export interface BoardItem {
  id: string; type: ItemData['type']; x: number; y: number; width: number; height: number;
  rotation: number; zIndex: number; data: ItemData; pins: string[];
  /** Stable origin used only by automatically carried weekly copies. */
  carryOrigin?: string;
}
export interface Pin { id: string; itemId: string | null; x?: number; y?: number; xRatio: number; yRatio: number; color: string; kind?: 'silver'; carryId?: string }
export const SILVER_PIN_COLOR = '#b9c2cc';
export interface Connection { id: string; fromPinId: string; toPinId: string }
export interface BoardDocument {
  board: { id: string; title: string; width: number; height: number };
  items: Record<string, BoardItem>; pins: Record<string, Pin>; connections: Record<string, Connection>;
}
export type Point = { x: number; y: number };
export function photoMargins(frame: Extract<ItemData, { type: 'image' }>['frame']) {
  return frame === 'white' ? { x: 22, y: 48 } : frame === 'black' ? { x: 0, y: 16 } : { x: 0, y: 0 };
}
export const PIN_BOARD_INSET = 9;
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export function variation(id: string) {
  let hash = 2166136261;
  for (const ch of id) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}
export function pinPosition(pin: Pin, item?: BoardItem): Point {
  if (!item) return { x: pin.x ?? 0, y: pin.y ?? 0 };
  const a = item.rotation * Math.PI / 180;
  const dx = (pin.xRatio - .5) * item.width, dy = (pin.yRatio - .5) * item.height;
  return { x: item.x + item.width / 2 + dx * Math.cos(a) - dy * Math.sin(a), y: item.y + item.height / 2 + dx * Math.sin(a) + dy * Math.cos(a) };
}
/** Snap beyond the pin halo; retain a highlighted target through small release jitter. */
export function pinConnectionTarget(document: BoardDocument, fromPinId: string, point: Point, scale: number, currentTarget?: string) {
  const zoom = Math.max(scale, .01);
  const radius = Math.max(25, 20 + 10 / zoom);
  const held = currentTarget && currentTarget !== fromPinId ? document.pins[currentTarget] : undefined;
  if (held) {
    const position = pinPosition(held, held.itemId ? document.items[held.itemId] : undefined);
    if (Math.hypot(point.x - position.x, point.y - position.y) <= radius + 6 / zoom) {
      return { id: held.id, position };
    }
  }
  let target: { id: string; position: Point } | null = null, closest = radius;
  for (const pin of Object.values(document.pins)) {
    if (pin.id === fromPinId) continue;
    const position = pinPosition(pin, pin.itemId ? document.items[pin.itemId] : undefined);
    const distance = Math.hypot(point.x - position.x, point.y - position.y);
    if (distance <= closest) { target = { id: pin.id, position }; closest = distance; }
  }
  return target;
}
export function localPoint(point: Point, item: BoardItem): Point {
  const a = -item.rotation * Math.PI / 180;
  const dx = point.x - item.x - item.width / 2, dy = point.y - item.y - item.height / 2;
  return { x: item.width / 2 + dx * Math.cos(a) - dy * Math.sin(a), y: item.height / 2 + dx * Math.sin(a) + dy * Math.cos(a) };
}
export function itemBounds(item: BoardItem) {
  const a = item.rotation * Math.PI / 180;
  const hx = (Math.abs(Math.cos(a)) * item.width + Math.abs(Math.sin(a)) * item.height) / 2;
  const hy = (Math.abs(Math.sin(a)) * item.width + Math.abs(Math.cos(a)) * item.height) / 2;
  const cx = item.x + item.width / 2, cy = item.y + item.height / 2;
  return { left: cx - hx, right: cx + hx, top: cy - hy, bottom: cy + hy, hx, hy };
}
export function tapeFits(item: BoardItem, board: BoardDocument['board']) {
  const b = itemBounds(item);
  return b.left >= 0 && b.top >= 0 && b.right <= board.width && b.bottom <= board.height;
}
export function constrainItem(item: BoardItem, board: BoardDocument['board'], pins: Pin[], clip?: { left: number; right: number; top: number; bottom: number }): BoardItem {
  let next = { ...item };
  if (item.type === 'tape') {
    const a = item.rotation * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    next.width = Math.min(item.width, c > 1e-8 ? (board.width - item.height * s) / c : Infinity, s > 1e-8 ? (board.height - item.height * c) / s : Infinity);
    const b = itemBounds(next);
    next.x = clamp(next.x + next.width / 2, b.hx, board.width - b.hx) - next.width / 2;
    next.y = clamp(next.y + next.height / 2, b.hy, board.height - b.hy) - next.height / 2;
    return next;
  }
  if (pins.length) {
    const offsets = pins.map(pin => pinPosition(pin, { ...item, x: 0, y: 0 }));
    next.x = clamp(item.x, PIN_BOARD_INSET - Math.min(...offsets.map(p => p.x)), board.width - PIN_BOARD_INSET - Math.max(...offsets.map(p => p.x)));
    next.y = clamp(item.y, PIN_BOARD_INSET - Math.min(...offsets.map(p => p.y)), board.height - PIN_BOARD_INSET - Math.max(...offsets.map(p => p.y)));
  }
  if (next.data.type === 'sticky' && (next.data.variant || !pins.length)) {
    const margin = next.data.variant ? 0 : next.width / 3;
    const b = itemBounds(next);
    next.x = clamp(next.x + next.width / 2, b.hx - margin, board.width + margin - b.hx) - next.width / 2;
    next.y = clamp(next.y + next.height / 2, b.hy - margin, board.height + margin - b.hy) - next.height / 2;
  }
  if (clip) {
    const b = itemBounds(next);
    if (b.right > clip.left && b.left < clip.right && b.bottom > clip.top && b.top < clip.bottom) {
      // The clip sits on the left edge: papers pass above it or stop to its right.
      const right = clip.right - b.left, up = b.bottom - clip.top;
      if (right <= up) next.x += right; else next.y -= up;
    }
  }
  // The lower-right shelf is a physical stop, including for unpinned labels.
  const b = itemBounds(next);
  if (b.right > board.width - 310 && b.left < board.width + 12 && b.bottom > board.height) next.y -= b.bottom - board.height;
  return next;
}
export function pinIsOnBoard(pin: Pin, item: BoardItem, board: BoardDocument['board']) {
  const p = pinPosition(pin, item);
  return p.x >= PIN_BOARD_INSET && p.x <= board.width - PIN_BOARD_INSET && p.y >= PIN_BOARD_INSET && p.y <= board.height - PIN_BOARD_INSET;
}
// Stop at the board boundary along the drag segment. Both endpoints remain on the paper.
export function constrainPin(previous: Pin, next: Pin, item: BoardItem, board: BoardDocument['board']): Pin {
  const a = pinPosition(previous, item), b = pinPosition(next, item);
  const dx = b.x - a.x, dy = b.y - a.y;
  let t = 1;
  if (dx > 0) t = Math.min(t, (board.width - PIN_BOARD_INSET - a.x) / dx);
  if (dx < 0) t = Math.min(t, (PIN_BOARD_INSET - a.x) / dx);
  if (dy > 0) t = Math.min(t, (board.height - PIN_BOARD_INSET - a.y) / dy);
  if (dy < 0) t = Math.min(t, (PIN_BOARD_INSET - a.y) / dy);
  t = clamp(t, 0, 1);
  const local = localPoint({ x: a.x + dx * t, y: a.y + dy * t }, item);
  return { ...next, xRatio: local.x / item.width, yRatio: local.y / item.height };
}
