import { expect, test } from 'vitest';
import { equivalentBoards } from '../src/cloud/equivalence';
import { archiveOf, emptyBoard, reconcile, weekStartISO, type CurrentWeek, type WeekState } from '../src/weeks';
import type { BoardDocument } from '../src/model';

function board(): BoardDocument {
  const doc = emptyBoard(weekStartISO(new Date()));
  doc.items.note = { id: 'note', type: 'sticky', x: 100, y: 100, width: 200, height: 150, rotation: 0, zIndex: 1, pins: [], data: { type: 'sticky', text: 'Buy milk\n买牛奶', color: '#ffff00' } };
  doc.pins.pin = { id: 'pin', itemId: null, x: 50, y: 50, xRatio: 0, yRatio: 0, color: 'blue' };
  return doc;
}
const current = (doc: BoardDocument, rev: string): CurrentWeek => ({ doc, rev, baseRev: 'base', updatedAt: 1, weekStart: weekStartISO(new Date()), startedOn: weekStartISO(new Date()) });
const state = (doc: BoardDocument): WeekState => ({ v: 1, current: current(doc, 'local'), archives: [], conflicts: [] });

test('spaces, tabs and movement within five board pixels do not produce a conflict', () => {
  const a = board(), b = structuredClone(a);
  b.items.note.x += 3; b.items.note.y += 4;
  if (b.items.note.data.type === 'sticky') b.items.note.data.text = ' Buy  milk \t\n买 牛奶 ';
  expect(equivalentBoards(a, b)).toBe(true);
  const merged = reconcile(state(a), current(b, 'remote'), [], []);
  expect(merged.state.conflicts).toHaveLength(0);
  expect(merged.state.current.rev).toBe('remote');
  expect(merged.state.current.baseRev).toBe('remote');
  expect(merged.pushCurrent).toBe(false);
  expect(reconcile(merged.state, current(b, 'remote'), [], []).state.conflicts).toHaveLength(0);
});

test.each([
  ['larger translation', (b: BoardDocument) => { b.items.note.x += 5.1; }],
  ['diagonal translation beyond tolerance', (b: BoardDocument) => { b.items.note.x += 4; b.items.note.y += 4; }],
  ['content', (b: BoardDocument) => { if (b.items.note.data.type === 'sticky') b.items.note.data.text += '!'; }],
  ['line breaks', (b: BoardDocument) => { if (b.items.note.data.type === 'sticky') b.items.note.data.text += '\n'; }],
  ['size', (b: BoardDocument) => { b.items.note.width++; }],
  ['rotation', (b: BoardDocument) => { b.items.note.rotation++; }],
  ['layer order', (b: BoardDocument) => { b.items.note.zIndex++; }],
  ['deletion', (b: BoardDocument) => { delete b.items.note; }],
  ['pin color', (b: BoardDocument) => { b.pins.pin.color = 'red'; }],
] as const)('%s remains a meaningful conflict', (_name, edit) => {
  const a = board(), b = structuredClone(a); edit(b);
  expect(equivalentBoards(a, b)).toBe(false);
  expect(reconcile(state(a), current(b, 'remote'), [], []).state.conflicts).toHaveLength(1);
});

test('URLs and image sources retain whitespace exactly', () => {
  for (const data of [
    { type: 'website', url: 'https://example.com/a', title: 'Title', domain: 'example.com', description: '' },
    { type: 'image', src: 'data:image/png;base64,abc', alt: '', aspectRatio: 1, frame: 'white' },
  ] as const) {
    const a = board(); a.items.note = { ...a.items.note, type: data.type, data };
    const b = structuredClone(a);
    if (b.items.note.data.type === 'website') b.items.note.data.url += ' ';
    if (b.items.note.data.type === 'image') b.items.note.data.src += ' ';
    expect(equivalentBoards(a, b)).toBe(false);
  }
});

test('pin movements use board pixels for both attached and free pins', () => {
  const a = board(), b = structuredClone(a);
  b.pins.pin.x! += 5;
  expect(equivalentBoards(a, b)).toBe(true);
  a.pins.pin.itemId = b.pins.pin.itemId = 'note';
  b.pins.pin.xRatio = .025;
  expect(equivalentBoards(a, b)).toBe(true);
  b.pins.pin.xRatio = .03;
  expect(equivalentBoards(a, b)).toBe(false);
});

test('near-identical archives converge without a conflict copy', () => {
  const a = board(), b = structuredClone(a); b.items.note.x++;
  const local = state(a), remote = archiveOf({ ...current(b, 'remote-archive'), updatedAt: 2 });
  local.archives = [archiveOf(current(a, 'local-archive'))];
  const merged = reconcile(local, local.current, [remote], []);
  expect(merged.state.archives[0].rev).toBe('remote-archive');
  expect(merged.state.conflicts).toHaveLength(0);
});

test('a new revision similar to an existing conflict does not make another copy', () => {
  const a = board(), b = structuredClone(a);
  if (b.items.note.data.type === 'sticky') b.items.note.data.text = 'Different content';
  const first = reconcile(state(a), current(b, 'remote'), [], []).state;
  const newer = structuredClone(a); newer.items.note.x++;
  const second = reconcile({ ...first, current: current(newer, 'local-again') }, current(b, 'remote'), [], []);
  expect(second.state.conflicts).toHaveLength(1);
});

test('object key insertion order does not change equivalence', () => {
  const a = board(), b = structuredClone(a);
  b.items.note = Object.fromEntries(Object.entries(b.items.note).reverse()) as typeof b.items.note;
  expect(equivalentBoards(a, b)).toBe(true);
});
