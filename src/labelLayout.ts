import { type BoardItem, clamp } from './model';

/** Measure with the same fonts, wrapping and padding as the rendered label. */
export function toggleLabel(item: BoardItem): Partial<BoardItem> | null {
  if (item.data.type !== 'sticky' || !item.data.variant) return null;
  const variant = item.data.variant === 'vellum' ? 'label' : 'vellum';
  const fontSize = variant === 'vellum' ? 16 : 14;
  const paper = document.createElement('div');
  paper.className = `small-label ${variant === 'vellum' ? 'vellum-label' : ''}`;
  paper.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;width:max-content;';
  const text = document.createElement('div');
  text.className = 'note-text';
  text.textContent = item.data.text || ' ';
  text.style.cssText = `width:max-content;height:auto;font-size:${fontSize}px;overflow:visible;`;
  paper.append(text);
  document.body.append(paper);
  try {
    const naturalWidth = Math.ceil(text.getBoundingClientRect().width);
    const width = clamp(naturalWidth + 2, variant === 'vellum' ? 120 : 200, variant === 'vellum' ? 220 : 640);
    paper.style.width = `${width}px`;
    text.style.width = '100%';
    const height = Math.max(variant === 'vellum' ? 56 : 28, Math.ceil(text.getBoundingClientRect().height) + 2);
    return {
      width, height,
      x: item.x + (item.width - width) / 2,
      data: { ...item.data, variant, fontSize, color: variant === 'vellum' ? '#ffffff70' : '#202120' },
    };
  } finally { paper.remove(); }
}
