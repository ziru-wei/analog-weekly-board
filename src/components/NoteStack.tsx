import type { CSSProperties, PointerEvent } from 'react';
export const NOTE_STACK_POSITION = { x: -12, y: 890 };
export function NoteStack({ color, onPointerDown }: { color: string; onPointerDown: (event: PointerEvent) => void }) {
  return <div className="note-stack" aria-label="Drag a fresh sticky note onto the board" title="Drag a fresh note onto the board"
    style={{ left: NOTE_STACK_POSITION.x, top: NOTE_STACK_POSITION.y, '--stack-paper': color } as CSSProperties} onPointerDown={onPointerDown} onDoubleClick={event => event.stopPropagation()}>
    {[0, 1, 2, 3].map(sheet => <div className="note-stack-sheet" key={sheet} />)}
    <div className="note-stack-clip" aria-hidden="true"><img src="/note-stack-clip.png" alt="" draggable={false} /></div>
  </div>;
}
