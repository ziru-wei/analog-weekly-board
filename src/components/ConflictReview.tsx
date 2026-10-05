import { useEffect, useId, useRef, useState } from 'react';
import { conflictBoard, weekLabel, type Board, type ConflictCopy, type WeekState } from '../weeks';
import { BoardPreview } from './BoardPreview';

function ReadonlyBoard({ doc, label }: { doc: Board['doc']; label: string }) {
  const [zoom, setZoom] = useState(1);
  return <>
    <div className="conflict-preview-tools"><span>Read only</span><div>
      <button aria-label={`Zoom out ${label}`} disabled={zoom === 1} onClick={() => setZoom(n => Math.max(1, n - .5))}>−</button>
      <button aria-label={`Reset zoom ${label}`} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
      <button aria-label={`Zoom in ${label}`} disabled={zoom === 3} onClick={() => setZoom(n => Math.min(3, n + .5))}>+</button>
    </div></div>
    <div className="conflict-preview" aria-label={`${label}, read-only board preview`}>
      <div style={{ width: `${zoom * 100}%` }}><BoardPreview doc={doc} className="conflict-board" /></div>
    </div>
  </>;
}

export function ConflictReview({ state, copy, reviewed, onResolve, onLater }: {
  state: WeekState; copy: ConflictCopy; reviewed: number;
  onResolve: (id: string, action: 'restore' | 'discard') => void; onLater: () => void;
}) {
  const original = conflictBoard(state, copy);
  const dialog = useRef<HTMLDivElement>(null), title = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onLater(); }
      if (event.key === 'Tab') {
        const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [onLater]);
  const saved = (time: number) => new Date(time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return <div className="conflict-review-backdrop">
    <div ref={dialog} className="conflict-review" role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1}>
      <header><div><p>Duplicate board · {reviewed + 1} of {reviewed + state.conflicts.length}</p><h2 id={title}>Choose one version to keep</h2></div>
        <button className="conflict-later" onClick={onLater}>Later</button></header>
      <p className="conflict-review-date">{weekLabel(copy.weekStart, copy.startedOn)}</p>
      <div className="conflict-comparison">
        <section><h3>Current version</h3>
          <p className="conflict-version-date">{original ? `Saved ${saved(original.updatedAt || original.createdAt)}` : 'Original board unavailable'}</p>
          {original ? <ReadonlyBoard doc={original.doc} label="current version" /> : <div className="conflict-missing">The original board was removed or could not be matched. You can keep your existing boards or recover this saved copy.</div>}
          <button className="conflict-keep" onClick={() => onResolve(copy.id, 'discard')}>{original ? 'Keep this version' : 'Keep existing boards'}</button>
        </section>
        <section><h3>Other version</h3><p className="conflict-version-date">Saved {saved(copy.createdAt)}</p>
          <ReadonlyBoard doc={copy.doc} label="other version" />
          <button className="conflict-keep" onClick={() => onResolve(copy.id, 'restore')}>Keep this version</button>
        </section>
      </div>
      <p className="conflict-review-note">The other version will be removed. You can review the remaining duplicates later from your account menu.</p>
    </div>
  </div>;
}
