import type { BoardItem } from './model';

/**
 * What Enter copies from a selection: each note's text and each website card's link, in reading order
 * (rows top to bottom, each row left to right). `null` when nothing selected is a note or a website card.
 */
export function copyableText(items: BoardItem[]): string | null {
  const sources = items.filter(item => item.data.type === 'sticky' || item.data.type === 'website');
  if (!sources.length) return null;
  const middle = (item: BoardItem) => item.y + item.height / 2;
  // Items whose middles are within a few pixels sit on the same row.
  return [...sources].sort((a, b) => Math.abs(middle(a) - middle(b)) > 24 ? middle(a) - middle(b) : a.x - b.x)
    .map(item => item.data.type === 'sticky' ? item.data.text.trim() : item.data.type === 'website' ? item.data.url : '')
    .filter(Boolean).join('\n');
}
