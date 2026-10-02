import type { BoardItem, Pin, Connection } from './model';
export const BOARD_CLIPBOARD_TYPE = 'application/x-analog-weekly-board';
const prefix = 'AnalogWeeklyBoard/1\n';
export function encodeBoardClipboard(item: BoardItem, pins: Pin[]) {
  return prefix + JSON.stringify({ item, pins });
}
export function readBoardClipboard(text: string): { item: BoardItem; pins: Pin[] } | null {
  if (!text.startsWith(prefix)) return null;
  try {
    const { item, pins } = JSON.parse(text.slice(prefix.length));
    if (!item || !Array.isArray(pins) || typeof item.id !== 'string' || !Array.isArray(item.pins) || !item.pins.every((id: unknown) => typeof id === 'string')) return null;
    if (!['x', 'y', 'width', 'height', 'rotation', 'zIndex'].every(key => Number.isFinite(item[key])) || item.width <= 0 || item.height <= 0) return null;
    const data = item.data;
    if (!data || data.type !== item.type) return null;
    const strings = (...keys: string[]) => keys.every(key => typeof data[key] === 'string');
    if (data.type === 'sticky') {
      if (!strings('text', 'color') || (data.variant !== undefined && !['label', 'vellum'].includes(data.variant)) || (data.fontSize !== undefined && (!Number.isFinite(data.fontSize) || data.fontSize <= 0))) return null;
    } else if (data.type === 'website') {
      if (!strings('url', 'title', 'domain', 'description') || !/^https?:\/\//i.test(data.url) || (data.image !== undefined && typeof data.image !== 'string')) return null;
      if (data.expandedSize && (!Number.isFinite(data.expandedSize.width) || !Number.isFinite(data.expandedSize.height))) return null;
    } else if (data.type === 'image') {
      if (!strings('src', 'alt') || !Number.isFinite(data.aspectRatio) || data.aspectRatio <= 0 || !['white', 'black', 'worn'].includes(data.frame) || (data.caption !== undefined && typeof data.caption !== 'string')) return null;
      if (data.crop && !['x', 'y', 'w', 'h'].every(key => Number.isFinite(data.crop[key]))) return null;
    } else if (data.type !== 'tape') return null;
    if (!pins.every(pin => pin && typeof pin.id === 'string' && item.pins.includes(pin.id) && typeof pin.color === 'string' && Number.isFinite(pin.xRatio) && Number.isFinite(pin.yRatio) && pin.xRatio >= 0 && pin.xRatio <= 1 && pin.yRatio >= 0 && pin.yRatio <= 1)) return null;
    return { item, pins };
  } catch { return null; }
}


export function encodeBoardGroup(items: BoardItem[], pins: Pin[], connections: Record<string, Connection>) {
  return 'AnalogWeeklyBoard/2\n' + JSON.stringify({ items, pins, connections });
}
export function readBoardGroup(text: string) {
  const single = readBoardClipboard(text);
  if (single) return { items: [single.item], pins: single.pins, connections: {} as Record<string, Connection> };
  if (!text.startsWith('AnalogWeeklyBoard/2\n')) return null;
  try {
    const payload = JSON.parse(text.slice('AnalogWeeklyBoard/2\n'.length));
    if (!Array.isArray(payload.items) || !payload.items.length || !Array.isArray(payload.pins) || !payload.connections || typeof payload.connections !== 'object') return null;
    const items: BoardItem[] = [];
    for (const item of payload.items) {
      if (!item || !Array.isArray(item.pins)) return null;
      const checked = readBoardClipboard(encodeBoardClipboard(item, payload.pins.filter((pin: Pin) => pin && item.pins.includes(pin.id))));
      if (!checked) return null;
      items.push(checked.item);
    }
    if (new Set(items.map(item => item.id)).size !== items.length) return null;
    const pinIds = new Set(items.flatMap(item => item.pins));
    const pins: Pin[] = payload.pins.filter((pin: Pin) => pin && pinIds.has(pin.id));
    const connections: Record<string, Connection> = {};
    for (const connection of Object.values(payload.connections) as Connection[]) {
      if (connection && typeof connection.id === 'string' && pinIds.has(connection.fromPinId) && pinIds.has(connection.toPinId)) connections[connection.id] = connection;
    }
    return { items, pins, connections };
  } catch { return null; }
}
