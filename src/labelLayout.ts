import { type ItemData, clamp } from './model';

export function labelFontSize(data: Extract<ItemData, { type: 'sticky' }>) {
  const size = data.fontSize ?? (data.variant === 'vellum' ? 16 : 14);
  return data.variant === 'vellum' ? size * .875 : size;
}

/** Measure content at its rendered font size before wrapping at the label's width limit. */
export function measureLabel(data: Extract<ItemData, { type: 'sticky' }>, bounds = { width: 1600, height: 1000 }) {
  const vellum = data.variant === 'vellum';
  const fontSize = labelFontSize(data), fontScale = fontSize / 14;
  const maxWidth = Math.min(bounds.width, (vellum ? 240 : 320) * fontScale);
  const minWidth = Math.min(maxWidth, (vellum ? 60 : 50) * fontScale);
  const paper = document.createElement('div');
  paper.className = `small-label ${vellum ? 'vellum-label' : ''}`;
  paper.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;width:max-content;';
  const text = document.createElement('div');
  text.className = 'note-text'; text.textContent = data.text || ' ';
  text.style.cssText = `width:max-content;height:auto;font-size:${fontSize}px;overflow:visible;`;
  paper.append(text); document.body.append(paper);
  try {
    const width = Math.ceil(data.labelWidth ? clamp(data.labelWidth, 50, bounds.width) : clamp(text.getBoundingClientRect().width + 2, minWidth, maxWidth));
    paper.style.width = `${width}px`; text.style.width = '100%';
    const height = Math.min(bounds.height, Math.max(vellum ? 36 * fontScale : 28 * fontScale, Math.ceil(text.getBoundingClientRect().height) + 2));
    return { width, height };
  } finally { paper.remove(); }
}
