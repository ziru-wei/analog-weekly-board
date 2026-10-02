import { useLayoutEffect, type RefObject } from 'react';
import { clamp, type BoardItem } from '../model';
import { labelFontSize } from '../labelLayout';

/** Keep live notes and Dashboard previews sized with the same loaded fonts. */
export function useNoteTextLayout(item: BoardItem, ref: RefObject<HTMLElement | null>) {
  const { width, height, data } = item;
  useLayoutEffect(() => {
    const element = ref.current;
    if (data.type !== 'sticky' || !element) return;
    let disposed = false;
    const fit = () => {
      if (disposed) return;
      if (data.variant) { element.style.fontSize = `${labelFontSize(data)}px`; return; }
      let size = clamp(Math.min(width * .08, height * .12), 14, 22);
      element.style.fontSize = `${size}px`;
      while (size > 14 && element.scrollHeight > element.clientHeight + 1) element.style.fontSize = `${--size}px`;
    };
    fit();
    void document.fonts.ready.then(fit);
    document.fonts.addEventListener('loadingdone', fit);
    return () => { disposed = true; document.fonts.removeEventListener('loadingdone', fit); };
  }, [width, height, data, ref]);
}
