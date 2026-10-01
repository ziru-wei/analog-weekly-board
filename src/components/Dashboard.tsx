import { useEffect, useState } from 'react';
import { type Archive, type ConflictCopy, type CurrentWeek, isPartial, weekLabel } from '../weeks';
import { BoardPreview } from './BoardPreview';
import { CloudPanel } from './CloudPanel';
import './Dashboard.css';

const countItems = (doc: Archive['doc']) => Object.values(doc.items).filter(i => i.type !== 'tape').length;

export function Dashboard({ archives, conflicts, current, onResolve, onClose }: { archives: Archive[]; conflicts: ConflictCopy[]; current: CurrentWeek; onResolve: (id: string, action: 'current' | 'archive' | 'discard') => void; onClose: () => void }) {
  const [open, setOpen] = useState<Archive | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (open) setOpen(null); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const sorted = [...archives].sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  return <div className="dashboard" role="dialog" aria-label="Dashboard">
    <header className="dash-head">
      <div>
        <h1>Dashboard</h1>
        <p>{sorted.length ? `${sorted.length} archived ${sorted.length === 1 ? 'week' : 'weeks'}` : 'Nothing archived yet'} · weeks run Monday to Sunday</p>
      </div>
      <button className="dash-back" onClick={onClose}>Back to this week <kbd>esc</kbd></button>
    </header>
    <CloudPanel />

    <div className="dash-grid">
      <button className="dash-card current" onClick={onClose}>
        <BoardPreview doc={current.doc} className="dash-thumb" />
        <span className="dash-meta"><b>This week</b><i>{weekLabel(current.weekStart, current.startedOn)}</i><em>In progress</em></span>
      </button>
      {sorted.map(a => <button key={a.id} className="dash-card" onClick={() => setOpen(a)}>
        <BoardPreview doc={a.doc} className="dash-thumb" />
        <span className="dash-meta"><b>{weekLabel(a.weekStart, a.startedOn)}</b><i>{countItems(a.doc)} {countItems(a.doc) === 1 ? 'item' : 'items'}</i>{isPartial(a.weekStart, a.startedOn) && <em>Partial week</em>}</span>
      </button>)}
    </div>
    {conflicts.length > 0 && <section className="dash-conflicts">
      <h2>Conflict copies</h2>
      <p>Two devices edited the same board before syncing. The cloud version was kept; the other version is saved here.</p>
      <div className="dash-grid">{conflicts.map(c => {
        const sameWeek = c.weekStart === current.weekStart, canArchive = !archives.some(a => a.weekStart === c.weekStart);
        return <div key={c.id} className="dash-card conflict">
          <BoardPreview doc={c.doc} className="dash-thumb" />
          <span className="dash-meta"><b>{weekLabel(c.weekStart, c.startedOn)}</b><i>Saved {new Date(c.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</i></span>
          <span className="dash-conflict-actions">
            {sameWeek ? <button onClick={() => { if (window.confirm('Replace this week\'s board with this copy?')) onResolve(c.id, 'current'); }}>Make current</button>
              : canArchive && <button onClick={() => onResolve(c.id, 'archive')}>Restore as archive</button>}
            <button onClick={() => onResolve(c.id, 'discard')}>Discard</button>
          </span>
        </div>;
      })}</div>
    </section>}
    {!sorted.length && <p className="dash-empty">Each week's board is archived here automatically when Monday arrives.</p>}

    {open && <div className="dash-viewer" onClick={() => setOpen(null)}>
      <div className="dash-viewer-board" onClick={event => event.stopPropagation()}>
        <BoardPreview doc={open.doc} className="dash-viewer-svg" />
      </div>
      <div className="dash-viewer-bar" onClick={event => event.stopPropagation()}>
        <b>{weekLabel(open.weekStart, open.startedOn)}</b>{isPartial(open.weekStart, open.startedOn) && <em>Partial week</em>}<span>Read-only archive</span>
        <button onClick={() => setOpen(null)}>Close</button>
      </div>
    </div>}
  </div>;
}
