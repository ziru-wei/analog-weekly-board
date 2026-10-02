import { expect, test } from 'vitest';
import { createDocumentStore } from '../src/store';
import { isCompactWebsiteCard, toggleWebsiteCard } from '../src/socialEmbed';
import { createDemo } from '../src/demo';

test.each([
  ['https://www.instagram.com/p/ABC123/', true],
  ['https://twitter.com/nasa/status/123456', true],
  ['https://x.com/nasa/status/123456', true],
  ['https://www.xiaohongshu.com/explore/67b72e69000000002903fdb4', true],
  ['https://youtu.be/M7lc1UVf-VE', true],
  ['https://www.sony.com/', true],
])('pasted %s has the expected default pin', (url, pinned) => {
  const store = createDocumentStore(createDemo());
  const id = store.commands.createItem({ type: 'website', url, title: '', domain: new URL(url).hostname, description: '' });
  const pin = Object.values(store.getSnapshot().pins).find(pin => pin.itemId === id);
  expect(pin).toMatchObject({ color: '#e52e35', xRatio: .94, yRatio: .065 });
  expect(store.getSnapshot().items[id].pins).toHaveLength(pinned ? 1 : 0);
  expect(Object.values(store.getSnapshot().pins).filter(pin => pin.itemId === id)).toHaveLength(pinned ? 1 : 0);
});


test('resizing a preset compact card switches layout in both directions, including after reload', () => {
  const store = createDocumentStore(createDemo());
  const id = store.commands.createItem({ type: 'website', url: 'https://example.com', title: '', domain: 'example.com', description: '' }, undefined, { width: 360, height: 300 });
  store.commands.updateItem(id, toggleWebsiteCard(store.getSnapshot().items[id])!);
  const restored = createDocumentStore(store.getSnapshot());
  const compact = () => { const item = restored.getSnapshot().items[id]; return isCompactWebsiteCard(item.width, item.height); };
  expect(compact()).toBe(true);
  restored.commands.updateItem(id, { width: 400, height: 320 });
  expect(compact()).toBe(false);
  // The next shortcut follows the current size, even with a legacy compact flag.
  expect(toggleWebsiteCard(restored.getSnapshot().items[id])?.height).toBe(96);
  restored.commands.updateItem(id, { width: 320, height: 96 });
  expect(compact()).toBe(true);
  restored.commands.undo();
  expect(compact()).toBe(false);
});
