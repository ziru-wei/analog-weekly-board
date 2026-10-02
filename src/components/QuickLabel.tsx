import { useEffect, useLayoutEffect, useRef, useState } from 'react';
export function QuickLabel({ enabled, boardBottom, onCommit }: { enabled: boolean; boardBottom: number; onCommit: (text: string, size: { width: number; height: number }) => void }) {
  const [text, setText] = useState('');
  const [paperHeight, setPaperHeight] = useState(36);
  const value = useRef('');
  const update = (text: string) => { value.current = text; setText(text); };
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    const measure = () => setPaperHeight(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const commit = () => { const text = value.current; const rect = input.current?.getBoundingClientRect(); update(''); if (text.trim() && rect) onCommit(text, { width: rect.width, height: rect.height }); };
  useEffect(() => {
    if (!enabled) return;
    if (document.activeElement === document.body) input.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input, textarea, button, a, [contenteditable="true"]')) return;
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;
      event.preventDefault(); update(value.current + event.key); input.current?.focus({ preventScroll: true });
    };
    const focus = (event: PointerEvent) => { if (event.target instanceof Element && event.target.matches('.workspace, .board, .cork-texture')) input.current?.focus({ preventScroll: true }); };
    window.addEventListener('keydown', key); window.addEventListener('pointerup', focus);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerup', focus); };
  }, [enabled]);
  return <div className={`quick-label ${text && enabled ? 'visible' : ''}`} style={{ height: paperHeight }}>
    <textarea ref={input} data-quick-label aria-label="Type a tracing-paper label" value={text} disabled={!enabled}
      onChange={event => update(event.target.value)} onBlur={commit}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); update(''); }
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); commit(); }
      }} rows={1} style={{ width: 250, maxHeight: Math.max(36, boardBottom) }} />
  </div>;
}
