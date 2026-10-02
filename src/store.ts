import { useSyncExternalStore } from 'react';
import { type BoardDocument, type BoardItem, type ItemData, type Pin, type Point, PIN_BOARD_INSET, localPoint, clamp, constrainItem, constrainPin, pinIsOnBoard, tapeFits, variation } from './model';
import { PIN_COLORS } from './components/ColorPalette';

export function createDocumentStore(initial: BoardDocument) {
  let document = initial;
  let clipBounds: { left: number; right: number; top: number; bottom: number } | undefined;
  const listeners = new Set<() => void>();
  const history: BoardDocument[] = [];
  const future: BoardDocument[] = [];
  let transaction: BoardDocument | null = null;
  const notify = () => listeners.forEach(listener => listener());
  const remember = (snapshot: BoardDocument) => { future.length = 0; history.push(snapshot); if (history.length > 80) history.shift(); };
  const publish = (next: BoardDocument) => { if (!transaction) remember(document); document = next; notify(); };
  const commands = {
    setClipBounds(bounds: typeof clipBounds) { clipBounds = bounds; },
    /** Replace the whole board (new week, restore) and drop undo history. */
    load(next: BoardDocument) { transaction = null; history.length = 0; future.length = 0; document = next; notify(); },
    beginTransaction() { if (!transaction) transaction = document; },
    finishTransaction(record = true) {
      if (transaction && transaction !== document && record) remember(transaction);
      transaction = null; notify();
    },
    cancelTransaction() { if (transaction) document = transaction; transaction = null; notify(); },
    undo() { if (transaction) { commands.cancelTransaction(); return; } const previous = history.pop(); if (previous) { future.push(document); document = previous; notify(); } },
    redo() { if (transaction) return; const next = future.pop(); if (next) { history.push(document); document = next; notify(); } },
    createItem(data: ItemData, position = { x: 620, y: 340 }, size = { width: 190, height: 165 }, rotation?: number) {
      const id = crypto.randomUUID();
      const pinId = crypto.randomUUID();
      const pin: Pin = { id: pinId, itemId: id, xRatio: data.type === 'website' ? .94 : .5, yRatio: .065, color: data.type === 'image' ? '#f5f5f0' : PIN_COLORS[0] };
      const hasPin = data.type === 'image' || data.type === 'website';
      const item: BoardItem = constrainItem({ id, type: data.type, ...position, ...size, rotation: rotation ?? variation(id) * 2 - 1, zIndex: Math.max(0, ...Object.values(document.items).map(i => i.zIndex)) + 1, data, pins: hasPin ? [pinId] : [] }, document.board, hasPin ? [pin] : [], clipBounds);
      publish({ ...document, items: { ...document.items, [id]: item }, pins: hasPin ? { ...document.pins, [pinId]: pin } : document.pins });
      return id;
    },
    moveItems(sources: BoardItem[], offset: Point) {
      let dx = offset.x, dy = offset.y;
      for (const source of sources) {
        const next = constrainItem({ ...source, x: source.x + offset.x, y: source.y + offset.y }, document.board,
          source.pins.map(id => document.pins[id]).filter(Boolean), clipBounds);
        const allowedX = next.x - source.x, allowedY = next.y - source.y;
        dx = offset.x >= 0 ? Math.min(dx, Math.max(0, allowedX)) : Math.max(dx, Math.min(0, allowedX));
        dy = offset.y >= 0 ? Math.min(dy, Math.max(0, allowedY)) : Math.max(dy, Math.min(0, allowedY));
      }
      const items = { ...document.items };
      for (const source of sources) if (items[source.id]) items[source.id] = { ...items[source.id], x: source.x + dx, y: source.y + dy };
      publish({ ...document, items });
    },
    duplicateItems(sources: BoardItem[], sourcePins: Pin[], sourceConnections: BoardDocument['connections'], offset = { x: 24, y: 24 }) {
      const items = { ...document.items }, pins = { ...document.pins }, connections = { ...document.connections };
      const pinIds = new Map<string, string>();
      const ids: string[] = [];
      const top = Math.max(0, ...Object.values(items).map(item => item.zIndex));
      for (const [index, source] of [...sources].sort((a, b) => a.zIndex - b.zIndex).entries()) {
        const id = crypto.randomUUID(); ids.push(id);
        const attached = sourcePins.filter(pin => source.pins.includes(pin.id)).map(pin => {
          const copy = { ...pin, id: crypto.randomUUID(), itemId: id }; pinIds.set(pin.id, copy.id); pins[copy.id] = copy; return copy;
        });
        items[id] = { ...structuredClone(source), id, x: source.x + offset.x, y: source.y + offset.y,
          zIndex: top + index + 1, pins: attached.map(pin => pin.id) };
      }
      for (const connection of Object.values(sourceConnections)) {
        const fromPinId = pinIds.get(connection.fromPinId), toPinId = pinIds.get(connection.toPinId);
        if (fromPinId && toPinId) { const id = crypto.randomUUID(); connections[id] = { id, fromPinId, toPinId }; }
      }
      publish({ ...document, items, pins, connections });
      return ids;
    },
    duplicateItem(source: BoardItem, sourcePins: Pin[], position = { x: source.x + 24, y: source.y + 24 }) {
      const id = crypto.randomUUID();
      const copiedPins = sourcePins.filter(pin => source.pins.includes(pin.id)).map(pin => ({ ...pin, id: crypto.randomUUID(), itemId: id }));
      const item = constrainItem({ ...structuredClone(source), id, ...position,
        zIndex: Math.max(0, ...Object.values(document.items).map(item => item.zIndex)) + 1,
        pins: copiedPins.map(pin => pin.id) }, document.board, copiedPins, clipBounds);
      publish({ ...document, items: { ...document.items, [id]: item },
        pins: { ...document.pins, ...Object.fromEntries(copiedPins.map(pin => [pin.id, pin])) } });
      return id;
    },
    updateItem(id: string, patch: Partial<Pick<BoardItem, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'zIndex' | 'data'>>) {
      const item = document.items[id]; if (!item) return;
      const next = { ...item, ...patch };
      next.width = clamp(next.width, next.type === 'tape' ? 8 : next.data.type === 'sticky' && !!next.data.variant ? 50 : 150, next.type === 'tape' ? Math.hypot(document.board.width, document.board.height) : document.board.width - 30);
      next.height = clamp(next.height, next.type === 'tape' ? 20 : next.data.type === 'sticky' && !!next.data.variant ? 26 : next.type === 'website' ? 76 : 110, next.data.type === 'sticky' && next.data.variant === 'vellum' ? document.board.height : document.board.height - 30);
      if (item.type === 'tape' && patch.width !== undefined && patch.rotation === undefined && tapeFits(item, document.board) && !tapeFits(next, document.board)) {
        let low = 0, high = 1;
        const at = (t: number) => ({ ...next, x: item.x + (next.x - item.x) * t, y: item.y + (next.y - item.y) * t, width: item.width + (next.width - item.width) * t });
        for (let step = 0; step < 28; step++) { const t = (low + high) / 2; if (tapeFits(at(t), document.board)) low = t; else high = t; }
        Object.assign(next, at(low));
      }
      publish({ ...document, items: { ...document.items, [id]: constrainItem(next, document.board, item.pins.map(pinId => document.pins[pinId]), clipBounds) } });
    },
    deleteItem(id: string) {
      const item = document.items[id]; if (!item) return;
      const pins = Object.fromEntries(Object.entries(document.pins).filter(([, p]) => p.itemId !== id));
      const connections = Object.fromEntries(Object.entries(document.connections).filter(([, c]) => !item.pins.includes(c.fromPinId) && !item.pins.includes(c.toPinId)));
      const items = { ...document.items }; delete items[id];
      publish({ ...document, items, pins, connections });
    },
    createPin(itemId: string, xRatio = .5, yRatio = .065) {
      const item = document.items[itemId]; if (!item) return;
      const id = crypto.randomUUID();
      const pin: Pin = { id, itemId, xRatio: clamp(xRatio, .03, .97), yRatio: clamp(yRatio, .03, .97), color: PIN_COLORS[0] };
      if (!pinIsOnBoard(pin, item, document.board)) return;
      publish({ ...document, pins: { ...document.pins, [id]: pin }, items: { ...document.items, [itemId]: { ...item, pins: [...item.pins, id] } } });
      return id;
    },
    placePin(point: Point, color: string, itemId?: string) {
      const id = crypto.randomUUID();
      const item = itemId ? document.items[itemId] : undefined;
      const p = { x: clamp(point.x, PIN_BOARD_INSET, document.board.width - PIN_BOARD_INSET), y: clamp(point.y, PIN_BOARD_INSET, document.board.height - PIN_BOARD_INSET) };
      const local = item ? localPoint(p, item) : null;
      const pin: Pin = { id, itemId: item?.id ?? null, x: p.x, y: p.y, xRatio: local && item ? local.x / item.width : 0, yRatio: local && item ? local.y / item.height : 0, color };
      publish({ ...document, pins: { ...document.pins, [id]: pin }, items: item ? { ...document.items, [item.id]: { ...item, pins: [...item.pins, id] } } : document.items });
      return id;
    },
    movePin(id: string, point: Point, itemId?: string) {
      const pin = document.pins[id]; if (!pin) return;
      const item = itemId ? document.items[itemId] : undefined;
      const previous = pin.itemId ? document.items[pin.itemId] : undefined;
      const p = { x: clamp(point.x, PIN_BOARD_INSET, document.board.width - PIN_BOARD_INSET), y: clamp(point.y, PIN_BOARD_INSET, document.board.height - PIN_BOARD_INSET) };
      const local = item ? localPoint(p, item) : null;
      const next: Pin = { ...pin, itemId: item?.id ?? null, x: p.x, y: p.y, xRatio: local && item ? local.x / item.width : 0, yRatio: local && item ? local.y / item.height : 0 };
      const items = { ...document.items };
      if (previous) items[previous.id] = { ...previous, pins: previous.pins.filter(pinId => pinId !== id) };
      if (item) items[item.id] = { ...items[item.id], pins: [...items[item.id].pins, id] };
      publish({ ...document, items, pins: { ...document.pins, [id]: next } });
    },
    updatePin(id: string, patch: Partial<Pick<Pin, 'xRatio' | 'yRatio' | 'color'>>) {
      const pin = document.pins[id]; if (!pin) return;
      const next = { ...pin, ...patch };
      next.xRatio = clamp(next.xRatio, .03, .97); next.yRatio = clamp(next.yRatio, .03, .97);
      publish({ ...document, pins: { ...document.pins, [id]: pin.itemId ? constrainPin(pin, next, document.items[pin.itemId], document.board) : next } });
    },
    deletePin(id: string) {
      const pin = document.pins[id]; if (!pin) return;
      const pins = { ...document.pins }; delete pins[id];
      const item = pin.itemId ? document.items[pin.itemId] : undefined;
      const connections = Object.fromEntries(Object.entries(document.connections).filter(([, c]) => c.fromPinId !== id && c.toPinId !== id));
      const remaining = item?.pins.filter(p => p !== id) ?? [];
      publish({ ...document, pins, connections, items: item ? { ...document.items, [item.id]: constrainItem({ ...item, pins: remaining }, document.board, remaining.map(id => pins[id]), clipBounds) } : document.items });
    },
    createConnection(fromPinId: string, toPinId: string) {
      if (fromPinId === toPinId || !document.pins[fromPinId] || !document.pins[toPinId]) return;
      if (Object.values(document.connections).some(c => (c.fromPinId === fromPinId && c.toPinId === toPinId) || (c.fromPinId === toPinId && c.toPinId === fromPinId))) return;
      const id = crypto.randomUUID();
      publish({ ...document, connections: { ...document.connections, [id]: { id, fromPinId, toPinId } } });
    },
    deleteConnection(id: string) {
      const connections = { ...document.connections }; delete connections[id]; publish({ ...document, connections });
    },
  };
  return { canUndo: () => history.length > 0, getSnapshot: () => document, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, commands };
}
export type DocumentStore = ReturnType<typeof createDocumentStore>;
export function useDocument(store: DocumentStore) { return useSyncExternalStore(store.subscribe, store.getSnapshot); }
