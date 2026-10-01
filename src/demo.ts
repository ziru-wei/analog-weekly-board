import { PAPER_COLORS, PIN_COLORS } from './components/ColorPalette';
import { type BoardDocument, type BoardItem, type ItemData, variation } from './model';
export function createDemo(): BoardDocument {
  const items: Record<string, BoardItem> = {};
  const add = (id: string, data: ItemData, x: number, y: number, width: number, height: number, zIndex: number) => {
    items[id] = { id, type: data.type, data, x, y, width, height, zIndex, rotation: variation(id) * 2 - 1, pins: [`pin-${id}`] };
  };
  add('week', { type: 'sticky', text: 'A little less hurry.\nA little more noticing.\n\nThings to make room\nfor this week.', color: PAPER_COLORS[0] }, 165, 130, 200, 185, 1);
  add('outside', { type: 'image', src: '/coast.jpg', alt: 'A quiet stretch of coast, with waves meeting the shore', aspectRatio: 1.5, frame: 'white', caption: 'evening tide · 2026' }, 653, 126, 474, 338, 2);
  add('remember', { type: 'sticky', text: 'Take the long way\nhome.\n\nLeave the phone\nin your pocket.', color: PAPER_COLORS[4] }, 1184, 284, 190, 170, 3);
  add('make', { type: 'sticky', text: 'Make something\nwith your hands.\n\n01  Pick up the clay\n02  Clear the table\n03  Begin anywhere', color: PAPER_COLORS[2] }, 336, 598, 200, 185, 4);
  add('reference', { type: 'website', url: 'https://www.are.na/', title: 'A place for things worth keeping.', domain: 'are.na', description: 'Collect ideas. Follow a thread.' }, 848, 645, 354, 136, 5);
  const colors = [PIN_COLORS[0], PIN_COLORS[5], PIN_COLORS[2], PIN_COLORS[1], PIN_COLORS[0]];
  const pins = Object.fromEntries(Object.values(items).map((item, i) => [`pin-${item.id}`, { id: `pin-${item.id}`, itemId: item.id, xRatio: .48, yRatio: .055, color: colors[i] }]));
  return { board: { id: 'little-things', title: 'Little things', width: 1600, height: 1000 }, items, pins, connections: {
    first: { id: 'first', fromPinId: 'pin-week', toPinId: 'pin-outside' },
    second: { id: 'second', fromPinId: 'pin-week', toPinId: 'pin-make' },
    third: { id: 'third', fromPinId: 'pin-outside', toPinId: 'pin-reference' },
  } };
}
