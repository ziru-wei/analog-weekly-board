import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { measureLabel } from '../labelLayout';
export function QuickLabel({ enabled, boardBottom, onAppear, onCommit }: { enabled: boolean; boardBottom: number; onAppear: () => void; onCommit: (text: string, size: { width: number; height: number }) => void }) {
  const [text, setText] = useState('');
  const [paperSize, setPaperSize] = useState({ width: 60, height: 36 });
  const value = useRef('');
  const appear = useRef(onAppear); appear.current = onAppear;
  const update = (text: string) => { if (text && !value.current) appear.current(); value.current = text; setText(text); };
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    let active = true;
    const measure = () => { if (active) setPaperSize(measureLabel({ type: 'sticky', variant: 'vellum', text, color: '#ffffff88', fontSize: 16 }, { width: Math.max(40, Math.min(240, window.innerWidth - 40)), height: Math.max(36, boardBottom) })); };
    measure(); void document.fonts.ready.then(measure);
    document.fonts.addEventListener('loadingdone', measure); window.addEventListener('resize', measure);
    return () => { active = false; document.fonts.removeEventListener('loadingdone', measure); window.removeEventListener('resize', measure); };
  }, [text, boardBottom]);
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
  return <div className={`quick-label ${text && enabled ? 'visible' : ''}`} style={{ height: paperSize.height }}>
    <textarea ref={input} data-quick-label aria-label="Type a tracing-paper label" value={text} disabled={!enabled}
      onChange={event => update(event.target.value)} onBlur={commit}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); update(''); }
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); commit(); }
      }} rows={1} style={{ width: paperSize.width, height: paperSize.height }} />
  </div>;
}
