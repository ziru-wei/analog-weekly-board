import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { type Board, type WeekState, addDays, fromISO, isPartial, weekEndOf, weekLabel, weekMonth } from '../weeks';
import { BoardPreview } from './BoardPreview';
import { ConflictReview } from './ConflictReview';
import { CloudPanel } from './CloudPanel';
import './Dashboard.css';

const INK = { stroke: '#f1e8d8', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const jitter = (i: number) => { const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); };
/** A loose mound of acorns, bottom row first: one acorn per board, up to a dozen. */
function acornSpots(count: number) {
  const spots: { x: number; y: number; turn: number; size: number }[] = [];
  for (let row = 0, left = Math.min(count, 12); left > 0; row++) {
    const inRow = Math.min(5 - row, left);
    for (let j = 0; j < inRow; j++, left--) {
      const i = spots.length;
      spots.push({ x: 80 + row * 6.5 + j * 13 + (jitter(i) - .5) * 4, y: 67 - row * 9 + (jitter(i + 9) - .5) * 2.5, turn: (jitter(i + 3) - .5) * 80, size: .8 + jitter(i + 7) * .35 });
    }
  }
  return spots.reverse(); // upper rows drawn last, resting on the lower ones
}
function Acorn({ wobble }: { wobble: string }) {
  return <>
    <g filter={wobble} transform="translate(.8 .7)">
      <path d="M-3.8 -1C-4.2 3 -2.3 6.8 0 7.8 2.3 6.8 4.2 3 3.8 -1Z" fill="#c39459" />
      <path d="M-4.8 -1C-4.8 -3.8 -2.5 -5.4 0 -5.4 2.5 -5.4 4.8 -3.8 4.8 -1Z" fill="#6e4a2c" />
    </g>
    <g filter={wobble} {...INK} strokeWidth="1">
      <path d="M-3.6 -.6C-3.8 3 -2.2 6.6 0 7.6 2 6.8 3.6 3.6 3.7 -.4" />
      <path d="M-4.9 -.9C-4.7 -3.8 -2.4 -5.3 .1 -5.3 2.4 -5.2 4.6 -3.7 4.9 -1.1-1.4-.4-5-.4-4.9-.9" />
      <path d="M.1 -5.3c.3-1.1.9-1.8 1.7-2.1" />
    </g>
  </>;
}
/** A squirrel nibbling beside its stash, drawn like an ink sketch with the colour printed slightly off the line. */
function Stash({ count }: { count: number }) {
  const id = useId().replace(/:/g, ''), wobble = `url(#${id})`;
  const spots = acornSpots(count), width = Math.max(...spots.map(s => s.x), 64) + 10;
  return <svg className="dash-squirrel" width={width * 1.3} height={104} viewBox={`0 4 ${width} 80`} fill="none" aria-hidden="true">
    <defs><filter id={id} x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="7" /><feDisplacementMap in="SourceGraphic" scale="2.2" /></filter></defs>
    <g transform="translate(1.4 1.2)" filter={wobble}>
      <path d="M30 66C13 64 4 51 8 36 11 23 21 13 32 15 42 17 45 26 40 31 36 35 31 32 32 27 34 38 37 47 41 55 43 61 39 66 30 66Z" fill="#8f5f3a" />
      <path d="M47 32C41 36 37 44 38 52 39 60 44 65 52 65 59 65 62 59 61 52 60 46 58 42 57 39 58 35 60 33 62 32 65 32 67 30 67 28 65 24 61 21 57 21 51 21 46 26 47 32Z" fill="#b07c4e" />
      <path d="M51 23.5C50 18 51.5 13.5 54 11.5 55.5 15 56.5 18.5 56 21.5Z" fill="#b07c4e" />
      <path d="M45 51C46 57 49 61 53 61 57 61 58.5 57 58 52 57 47 55 44 52 43" fill="#e2cda8" />
    </g>
    <g transform="translate(64.5 36) rotate(-20) scale(.85)"><Acorn wobble={wobble} /></g>
    <g filter={wobble} {...INK} strokeWidth="1.15">
      <path d="M31 66C13 64 4.5 51 8 36.5 11 23 21 13.5 32 15 42 17 45 26 40.5 30.5 36.5 34.5 31 32 32.2 27.5" />
      <path d="M14.5 42c2.5-3.5 5.5-5 8.5-5.5M14 52c3-2 6.5-3 10-2.6M21 25.5c2.5-1.6 5-1.5 7 .2" strokeWidth=".8" opacity=".55" />
      <path d="M46.5 32.5C41 36.5 37.5 44 38.2 52 39 60 44 64.8 51.5 65 58 65 61.5 60 61 53.5" />
      <path d="M47 32C46 26 51 21 57 21 61.5 21 65 24.5 67 28.6 66.4 31 63.8 32.2 61.5 32" />
      <path d="M51.2 23.4C50.2 18 51.6 13.6 54 11.6 55.4 14.8 56.4 18.2 56.1 21.3" />
      <path d="M57.6 36.8c1.6.9 3.3 1.1 4.6.4M58.5 40.8c1.8.4 3.4 0 4.6-1" />
      <path d="M45.5 64.6c2.4-2.2 6.4-2.6 9.4-1" />
      <path d="M59.4 24.6c.4.6.4 1.4-.1 1.9" strokeWidth="1.6" />
    </g>
    {spots.map((s, i) => <g key={i} transform={`translate(${s.x} ${s.y}) rotate(${s.turn}) scale(${s.size})`}><Acorn wobble={wobble} /></g>)}
  </svg>;
}
/** Velvet theatre drapery, with restrained ink detail and softly offset printed colour. */
function Curtain() {
  const id = useId().replace(/:/g, ''), wobble = `url(#curtain-${id})`;
  const panel = 'M13 21C40 18 85 20 119 22L118 137C110 139 103 138 96 136C88 139 80 139 72 136C64 139 56 139 48 137C35 140 23 140 13 138C15 100 12 62 13 21Z';
  const folds = [21, 41, 62, 84, 105];
  return <svg className="curtain-sketch" viewBox="0 0 240 150" fill="none" aria-hidden="true">
    <defs>
      <filter id={`curtain-${id}`} x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="7" /><feDisplacementMap in="SourceGraphic" scale=".45" /></filter>
    </defs>
    <g filter={wobble} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20H228V138H12Z" fill="#311923" />
      {[false, true].map(right => <g key={String(right)} className={right ? 'curtain-right' : 'curtain-left'}>
        <g transform={right ? 'translate(240 0) scale(-1 1)' : undefined}>
          <path d={panel} fill="#922c3f" transform="translate(.45 .35)" />
          {folds.map((x, i) => <g key={x}>
            <path d={`M${x} 24C${x - 2} 52 ${x + 1} 85 ${x - 1} 136Q${x + 5} 139 ${x + 11} 136C${x + 9} 92 ${x + 10} 56 ${x + 12} 24Z`} fill="#671d30" />
            <path d={`M${x + 7} 26C${x + 5} 61 ${x + 8} 98 ${x + 6} 135L${x + 11} 136C${x + 9} 91 ${x + 10} 56 ${x + 12} 26Z`} fill="#ad4050" />
            <path d={`M${x + 1} ${29 + i % 2 * 5}C${x - 1} 60 ${x + 2} 99 ${x} ${128 - i % 3 * 3}`} stroke="#481224" strokeWidth=".65" opacity=".6" />
            <path d={`M${x + 7} ${36 + i % 3 * 6}C${x + 5} 65 ${x + 8} 105 ${x + 6} 127`} stroke="#d98278" strokeWidth=".45" opacity=".35" />
          </g>)}
          <path d={panel} stroke="#ead6b8" strokeWidth=".6" opacity=".7" />
          <path d="M16 135C29 137 37 137 48 134C57 136 64 136 72 133C80 136 88 136 96 133Q107 137 116 134" stroke="#b69a61" strokeWidth="1" />
          <path d="M115 29C114 64 116 105 114 131" stroke="#ddb879" strokeWidth=".55" opacity=".7" />
        </g>
      </g>)}
      <path d="M9 15Q120 12 231 15L229 27H11Z" fill="#681a2b" />
      {[10, 83, 156].map((x, i) => <g key={x}>
        <path d={`M${x} 18Q${x + 36} 24 ${x + 74} 18C${x + 65} 40 ${x + 47} 47 ${x + 36} 47C${x + 21} 45 ${x + 7} 36 ${x} 18Z`} fill="#9d3043" />
        <path d={`M${x + 3} 23C${x + 15} 40 ${x + 28} 46 ${x + 36} 46C${x + 49} 46 ${x + 65} 37 ${x + 71} 23Q${x + 36} 43 ${x + 3} 23Z`} fill="#721f32" />
        <path d={`M${x + 4} 24Q${x + 37} 47 ${x + 70} 23M${x + 9} 25Q${x + 38} 40 ${x + 65} 25`} stroke="#cb6d6d" strokeWidth=".55" opacity=".48" />
        <path d={`M${x + 1} 21C${x + 10} 38 ${x + 24} 45 ${x + 36} 46C${x + 50} 46 ${x + 65} 37 ${x + 73} 21`} stroke="#c6a66d" strokeWidth="1" />
        {i < 2 && <g transform={`translate(${x + 73} 27)`}>
          <path d="M0 0v14" stroke="#d2b278" strokeWidth=".8" />
          <ellipse cy="13" rx="1.3" ry="1.8" fill="#d2b278" />
          <path d="M0 15l-2 7q2 1 4 0Z" fill="#b99a63" />
          <path d="M0 17v5" stroke="#e1c38b" strokeWidth=".45" />
        </g>}
      </g>)}
      <path d="M8 15Q120 12 232 15" stroke="#ead6b8" strokeWidth=".6" opacity=".75" />
      <path d="M7 12Q120 10 233 12" stroke="#a68554" strokeWidth="2.5" />
      <path d="M8 11Q120 9 232 11" stroke="#d5bc8a" strokeWidth=".65" />
      <circle cx="6" cy="12" r="2" fill="#baa06f" /><circle cx="234" cy="12" r="2" fill="#baa06f" />
    </g>
  </svg>;
}
const greeting = (count: number) => count === 1 ? '「Your first board, tucked away for winter.」' : `「${count} boards tucked away for winter.」`;
const monthLabel = (month: string) => fromISO(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

/** A timeline of every board: one row per month (newest on top), oldest week on the left, a week's boards stacked beneath it. */
export function Dashboard({ state, onOpen, onAdd, onDelete, onResolve, onClose }: {
  state: WeekState; onOpen: (id: string) => void; onAdd: () => void; onDelete: (id: string) => void;
  onResolve: (id: string, action: 'restore' | 'discard') => void; onClose: () => void;
}) {
  const [review, setReview] = useState(true);
  const [reviewed, setReviewed] = useState(0);
  const reviewing = review && state.conflicts.length > 0;
  const postpone = () => setReview(false);
  const [weekMenu, setWeekMenu] = useState<{ x: number; y: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null), weekTrigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || reviewing) return;
      if (weekMenu) { setWeekMenu(null); weekTrigger.current?.focus({ preventScroll: true }); }
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, weekMenu, reviewing]);
  useEffect(() => {
    if (!weekMenu) return;
    menu.current?.querySelector('button')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setWeekMenu(null); };
    const dismiss = () => setWeekMenu(null);
    window.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('scroll', dismiss, true); window.removeEventListener('resize', dismiss); };
  }, [weekMenu]);
  const showWeekMenu = (x: number, y: number) => setWeekMenu({
    x: Math.max(8, Math.min(x, window.innerWidth - 188)),
    y: Math.max(8, Math.min(y, window.innerHeight - 54)),
  });
  const weeks = new Map<string, Board[]>([[state.week, []]]);
  for (const board of state.boards) weeks.set(board.weekStart, [...(weeks.get(board.weekStart) ?? []), board]);
  const weekStarts = [...weeks.keys()];
  // Each week shows the days it was actually in use: from its first board's start to the day before the next week.
  const months = new Map<string, { week: string; boards: Board[]; startedOn: string; label: string; upcoming?: number }[]>();
  for (const week of weekStarts.sort().reverse()) {
    const boards = [...weeks.get(week)!].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const startedOn = boards.reduce((first, b) => b.startedOn < first ? b.startedOn : first, boards[0]?.startedOn ?? week);
    const end = boards.find(b => b.weekEnd)?.weekEnd ?? weekEndOf(week, weekStarts);
    const month = weekMonth(startedOn > week ? startedOn : week, end);
    months.set(month, [...(months.get(month) ?? []), { week, boards, startedOn, label: weekLabel(week, startedOn, end) }]);
  }
  // Include the remaining weeks of the current month, after the weeks already started.
  const thisMonth = [...months].find(([, list]) => list.some(w => w.week === state.week))![0];
  const upcoming = [];
  for (let start = state.week, i = 1; i <= 6; i++) {
    const week = addDays(weekEndOf(start, weekStarts), 1), end = weekEndOf(week, []);
    if (weekMonth(week, end) !== thisMonth) break;
    upcoming.push({ week, boards: [], startedOn: week, label: weekLabel(week, week, end), upcoming: i });
    start = week;
  }
  months.set(thisMonth, [...upcoming, ...months.get(thisMonth)!]);
  const [shake, setShake] = useState(0);

  return <div className="dashboard" role="dialog" aria-label="Dashboard">
    <div inert={reviewing}>
    <header className="dash-head">
      <div className="dash-greeting"><Stash count={state.boards.length} /><p>{greeting(state.boards.length)}</p></div>
      <CloudPanel unresolvedCount={state.conflicts.length} onSolve={() => { setWeekMenu(null); setReviewed(0); setReview(true); }} />
    </header>

    <div className="dash-timeline">
      {[...months].map(([month, monthWeeks]) => <section key={month} className="dash-month" aria-label={monthLabel(month)}>
        <h2>{monthLabel(month)}</h2>
        <div className="dash-weeks">
          {[...monthWeeks].sort((a, b) => a.week.localeCompare(b.week)).map(({ week, boards, startedOn, label, upcoming }) => {
            if (upcoming) return <div key={week} className="dash-week future" role="group" aria-label={`Week of ${label}, not started yet`}>
              <h3 className="dash-week-label"><b>{label}</b></h3>
              {upcoming === 1
                ? <button key={shake} className={`dash-curtain ${shake ? 'shaking' : ''}`} aria-label={`Next week's board opens on ${label.split(' – ')[0]}`} title={`Opens on ${label.split(' – ')[0]}`} onClick={() => setShake(n => n + 1)}><Curtain /></button>
                : <div className="dash-future-slot" />}
            </div>;
            return <div key={week} className={`dash-week ${week === state.week ? 'this-week' : ''}`} role="group" aria-label={`Week of ${label}`}
              onContextMenu={event => { if (week === state.week) { event.preventDefault(); event.stopPropagation(); showWeekMenu(event.clientX, event.clientY); } }}>
              <h3 className="dash-week-label"><b>{label}</b>{week === state.week ? <button ref={weekTrigger} className="dash-current-week" aria-haspopup="menu" aria-expanded={!!weekMenu} aria-controls={weekMenu ? menuId : undefined}
                onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); showWeekMenu(rect.left, rect.bottom + 6); }}
                onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); showWeekMenu(rect.left, rect.bottom + 6); } }}>This week</button> : isPartial(week, startedOn) && <em>Partial week</em>}</h3>
              <div className="dash-board-stack">{boards.map((board, index) => {
                const open = board.id === state.activeId;
                return <div key={board.id} style={{ '--stack-order': boards.length - index } as CSSProperties} className={`dash-card ${open ? 'current' : ''}`}>
                  <button className="dash-open" aria-label={`${open ? 'Return to' : 'Open'} board from ${label}`} onDoubleClick={() => onOpen(board.id)} onClick={event => { if (event.detail === 0) onOpen(board.id); }}>
                    <span className="dash-thumb-frame"><BoardPreview doc={board.doc} className="dash-thumb" simplified /></span>
                  </button>
                  <button className="dash-delete" aria-label={`Delete board from ${label}`} title="Delete board"
                    onClick={() => { if (boards.length > 1 || window.confirm('Delete the last board for this week? It will also disappear from your other synced devices.')) onDelete(board.id); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                  </button>
                </div>;
              })}</div>
            </div>;
          })}
        </div>
      </section>)}
    </div>

    {weekMenu && <div ref={menu} id={menuId} className="dash-week-menu" role="menu" aria-label="This week" style={{ left: weekMenu.x, top: weekMenu.y }}>
      <button role="menuitem" onClick={() => { setWeekMenu(null); onAdd(); }}>Add a board</button>
    </div>}

    </div>
    {reviewing && <ConflictReview key={state.conflicts[0].id} state={state} copy={state.conflicts[0]} reviewed={reviewed}
      onLater={postpone} onResolve={(id, action) => { onResolve(id, action); setReviewed(n => n + 1); }} />}

  </div>;
}
