import type { BoardDocument, Pin } from './model';
import type { Board, WeekState } from './weeks';

/** Copy silver-pinned items once into the destination, retaining layout and internal ropes. */
export function carryPinnedItems(sources: Board[], target: BoardDocument, week: string): BoardDocument {
  const items = { ...target.items }, pins = { ...target.pins }, connections = { ...target.connections };
  let changed = false;
  for (const source of sources) {
    const pinIds = new Map<string, string>();
    for (const item of Object.values(source.doc.items)) {
      const attached = item.pins.map(id => source.doc.pins[id]).filter(pin => pin?.itemId === item.id);
      if (!attached.some(pin => pin.kind === 'silver')) continue;
      const origin = item.carryOrigin ?? `${source.id}/${item.id}`;
      const id = `carry:${week}:${origin}`;
      const copies = attached.map((pin, index) => {
        const pinId = `carry-pin:${week}:${origin}:${index}`;
        pinIds.set(pin.id, pinId);
        return { ...structuredClone(pin), id: pinId, itemId: id, ...(pin.kind === 'silver' ? { carryId: pin.carryId ?? pin.id } : {}) };
      });
      // Another device may already have created and edited this week's copy.
      if (items[id]) {
        const existing = items[id];
        const roots = new Set(existing.pins.map(pinId => pins[pinId]).filter(pin => pin?.kind === 'silver').map(pin => pin.carryId ?? pin.id));
        const missing = copies.filter(pin => pin.kind === 'silver' && !roots.has(pin.carryId ?? pin.id));
        if (missing.length) {
          items[id] = { ...existing, pins: [...existing.pins, ...missing.map(pin => pin.id)] };
          for (const pin of missing) pins[pin.id] = { ...pin, x: (pin.x ?? item.x) + existing.x - item.x, y: (pin.y ?? item.y) + existing.y - item.y };
          changed = true;
        }
        continue;
      }
      items[id] = { ...structuredClone(item), id, carryOrigin: origin, pins: copies.map(pin => pin.id) };
      for (const pin of copies) pins[pin.id] = pin;
      changed = true;
    }
    for (const connection of Object.values(source.doc.connections)) {
      const fromPinId = pinIds.get(connection.fromPinId), toPinId = pinIds.get(connection.toPinId);
      if (!fromPinId || !toPinId || !pins[fromPinId] || !pins[toPinId]) continue;
      const id = `carry-rope:${fromPinId}:${toPinId}`;
      if (connections[id] || Object.values(connections).some(c => (c.fromPinId === fromPinId && c.toPinId === toPinId) || (c.fromPinId === toPinId && c.toPinId === fromPinId))) continue;
      connections[id] = { id, fromPinId, toPinId }; changed = true;
    }
  }
  return changed ? { ...target, items, pins, connections } : target;
}

/** Retain past content and ordinary pins after handing silver pins to the current week. */
export function clearPastSilverPins(doc: BoardDocument): BoardDocument {
  const ids = new Set(Object.values(doc.pins).filter(pin => pin.kind === 'silver').map(pin => pin.id));
  if (!ids.size) return doc;
  return {
    ...doc,
    pins: Object.fromEntries(Object.entries(doc.pins).filter(([id]) => !ids.has(id))),
    items: Object.fromEntries(Object.entries(doc.items).map(([id, item]) => [id, item.pins.some(pin => ids.has(pin)) ? { ...item, pins: item.pins.filter(pin => !ids.has(pin)) } : item])),
    connections: Object.fromEntries(Object.entries(doc.connections).filter(([, rope]) => !ids.has(rope.fromPinId) && !ids.has(rope.toPinId))),
  };
}

/** Remove matching later silver pins, preserving every item's content and placement. */
export function removeLaterSilverPins(state: WeekState, sourceBoardId: string, removed: Pin[], now = new Date()): WeekState {
  const source = state.boards.find(board => board.id === sourceBoardId);
  if (!source) return state;
  const removedRoots = new Set(removed.filter(pin => pin.kind === 'silver' && pin.itemId).map(pin => pin.carryId ?? pin.id));
  if (!removedRoots.size) return state;
  const latestWeek = state.boards.reduce((latest, board) => board.weekStart > latest ? board.weekStart : latest, source.weekStart);
  const roots = new Set(state.boards.filter(board => board.weekStart === latestWeek && board.weekStart > source.weekStart)
    .flatMap(board => Object.values(board.doc.pins).filter(pin => pin.kind === 'silver' && pin.itemId && board.doc.items[pin.itemId] && removedRoots.has(pin.carryId ?? pin.id)).map(pin => pin.carryId ?? pin.id)));
  // Older intermediate copies do not trigger a prompt after the latest week has already stopped.
  if (!roots.size) return state;
  let changed = false;
  const boards = state.boards.map(board => {
    if (board.weekStart <= source.weekStart) return board;
    const ids = new Set(Object.values(board.doc.pins).filter(pin => pin.kind === 'silver' && pin.itemId && board.doc.items[pin.itemId] && roots.has(pin.carryId ?? pin.id)).map(pin => pin.id));
    if (!ids.size) return board;
    changed = true;
    const pins = Object.fromEntries(Object.entries(board.doc.pins).filter(([id]) => !ids.has(id)));
    const connections = Object.fromEntries(Object.entries(board.doc.connections).filter(([, connection]) => !ids.has(connection.fromPinId) && !ids.has(connection.toPinId)));
    const items = Object.fromEntries(Object.entries(board.doc.items).map(([id, item]) => [id, item.pins.some(pinId => ids.has(pinId)) ? { ...item, pins: item.pins.filter(pinId => !ids.has(pinId)) } : item]));
    return { ...board, doc: { ...board.doc, items, pins, connections }, rev: crypto.randomUUID(), updatedAt: now.getTime() };
  });
  return changed ? { ...state, boards } : state;
}
