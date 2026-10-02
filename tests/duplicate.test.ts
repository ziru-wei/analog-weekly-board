import { expect, test } from 'vitest';
import { createDemo } from '../src/demo';
import { createDocumentStore } from '../src/store';
import { encodeBoardClipboard, readBoardClipboard } from '../src/boardClipboard';

test('duplicates every item type with independent data and pins in one undo step', () => {
  for (const source of Object.values(createDemo().items)) {
    const store = createDocumentStore(createDemo());
    const before = store.getSnapshot();
    const payload = readBoardClipboard(encodeBoardClipboard(source, source.pins.map(id => before.pins[id])))!;
    expect(payload).not.toBeNull();
    const id = store.commands.duplicateItem(payload.item, payload.pins);
    const after = store.getSnapshot(), copy = after.items[id];
    expect(copy.data).toEqual(source.data);
    expect(copy.data).not.toBe(source.data);
    expect(copy.pins).toHaveLength(source.pins.length);
    for (const pinId of copy.pins) {
      expect(source.pins).not.toContain(pinId);
      expect(after.pins[pinId].itemId).toBe(id);
    }
    expect(after.connections).toEqual(before.connections);
    store.commands.undo();
    expect(store.getSnapshot()).toEqual(before);
    store.commands.redo();
    expect(store.getSnapshot().items[id]).toEqual(copy);
  }
});

test('cancelled duplication drag removes the entire copy and its pins', () => {
  const store = createDocumentStore(createDemo()), before = store.getSnapshot();
  const source = Object.values(before.items).find(item => item.data.type === 'sticky')!;
  store.commands.beginTransaction();
  const id = store.commands.duplicateItem(source, source.pins.map(id => before.pins[id]), source);
  store.commands.updateItem(id, { x: 400, y: 350 });
  store.commands.cancelTransaction();
  expect(store.getSnapshot()).toEqual(before);
});

test('ordinary clipboard content and malformed board payloads fall through safely', () => {
  for (const value of ['https://example.com', 'hello', 'AnalogWeeklyBoard/1\n{}', 'AnalogWeeklyBoard/1\nnull', 'AnalogWeeklyBoard/1\n{']) expect(readBoardClipboard(value)).toBeNull();
  const item = Object.values(createDemo().items).find(item => item.data.type === 'sticky')!;
  expect(readBoardClipboard(encodeBoardClipboard({ ...item, width: Infinity }, []))).toBeNull();
});

test('group copies preserve geometry and internal ropes, but omit external ropes', async () => {
  const { encodeBoardGroup, readBoardGroup } = await import('../src/boardClipboard');
  const store = createDocumentStore(createDemo());
  const before = store.getSnapshot();
  const connection = Object.values(before.connections)[0];
  const selectedIds = [before.pins[connection.fromPinId].itemId!, before.pins[connection.toPinId].itemId!];
  const sources = [...new Set(selectedIds)].map(id => before.items[id]);
  const pins = Object.values(before.pins).filter(pin => sources.some(item => item.pins.includes(pin.id)));
  const payload = readBoardGroup(encodeBoardGroup(sources, pins, before.connections))!;
  const ids = store.commands.duplicateItems(payload.items, payload.pins, payload.connections);
  const after = store.getSnapshot();
  for (const id of ids) {
    const copy = after.items[id], source = sources.find(item => JSON.stringify(item.data) === JSON.stringify(copy.data))!;
    expect(copy.x - source.x).toBeCloseTo(24);
    expect(copy.y - source.y).toBeCloseTo(24);
  }
  const internal = Object.values(payload.connections);
  expect(Object.keys(after.connections).length - Object.keys(before.connections).length).toBe(internal.length);
  const copiedPinIds = new Set(ids.flatMap(id => after.items[id].pins));
  for (const connection of Object.values(after.connections).filter(c => !before.connections[c.id])) {
    expect(copiedPinIds.has(connection.fromPinId)).toBe(true);
    expect(copiedPinIds.has(connection.toPinId)).toBe(true);
  }
  store.commands.undo();
  expect(store.getSnapshot()).toEqual(before);
});
