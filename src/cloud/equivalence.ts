import { pinPosition, type BoardDocument, type ItemData } from '../model';

// Board coordinates are independent of browser zoom. Only translation gets a tolerance.
export const POSITION_TOLERANCE = 5;
const text = (value: string) => value.replace(/[^\S\r\n]+/gu, '');
const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) <= POSITION_TOLERANCE;

// Compare JSON values without depending on object insertion order.
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]));
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter(k => left[k] !== undefined);
  return keys.length === Object.keys(right).filter(k => right[k] !== undefined).length && keys.every(k => equal(left[k], right[k]));
}

function content(data: ItemData): ItemData {
  switch (data.type) {
    case 'sticky': return { ...data, text: text(data.text) };
    case 'image': return { ...data, alt: text(data.alt), caption: text(data.caption ?? '') };
    case 'website': return { ...data, title: text(data.title), description: text(data.description) };
    default: return data;
  }
}

/** Ignore horizontal text whitespace and tiny movements, never assets, URLs, or structure. */
export function equivalentBoards(a: BoardDocument, b: BoardDocument): boolean {
  if (!equal({ ...a.board, title: text(a.board.title) }, { ...b.board, title: text(b.board.title) }) || !equal(a.connections, b.connections)) return false;
  if (Object.keys(a.items).length !== Object.keys(b.items).length || Object.keys(a.pins).length !== Object.keys(b.pins).length) return false;
  for (const [id, item] of Object.entries(a.items)) {
    const other = b.items[id];
    if (!other || !near(item, other)) return false;
    const { x: _x, y: _y, data, ...rest } = item;
    const { x: _ox, y: _oy, data: otherData, ...otherRest } = other;
    if (!equal(rest, otherRest) || !equal(content(data), content(otherData))) return false;
  }
  for (const [id, pin] of Object.entries(a.pins)) {
    const other = b.pins[id];
    if (!other) return false;
    const { x: _x, y: _y, xRatio: _xr, yRatio: _yr, ...rest } = pin;
    const { x: _ox, y: _oy, xRatio: _oxr, yRatio: _oyr, ...otherRest } = other;
    if (!equal(rest, otherRest) || !near(pinPosition(pin, pin.itemId ? a.items[pin.itemId] : undefined), pinPosition(other, other.itemId ? b.items[other.itemId] : undefined))) return false;
  }
  return true;
}
