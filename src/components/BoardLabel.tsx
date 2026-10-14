import { fromISO, seasonOf, weekNumber } from '../weeks';

const day = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();

/**
 * The board's own title block, pasted at the lower right like a label on flight hardware.
 * Part of the board itself: it cannot be selected, moved or deleted, and notes can cover it.
 */
export function BoardLabel({ weekStart, weekEnd }: { weekStart: string; weekEnd: string }) {
  const { year, week } = weekNumber(weekStart);
  return <div className="board-title-block" aria-label={`Weekly board, week ${week} of ${year}`}>
    <div className="title-block-head">Weekly Board</div>
    <div className="title-block-title">{day(weekStart)} – {day(weekEnd)}, {fromISO(weekEnd).getFullYear()}</div>
    <div className="title-block-grid">
      <span>Week No</span><span>Season</span>
      <b className="title-block-hand"><span>{year}-W{String(week).padStart(2, '0')}</span></b><b>{seasonOf(weekStart)}</b>
    </div>
  </div>;
}
