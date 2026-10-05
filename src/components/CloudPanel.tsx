import { useEffect, useRef, useState } from 'react';
import { cloud, useCloud } from '../cloud/sync';
import { SyncStatus } from './SyncStatus';
import { setWeekStartDay, useWeekPreference } from '../weekPreferences';
import { fromISO } from '../weeks';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function CloudPanel({ unresolvedCount = 0, onSolve }: { unresolvedCount?: number; onSolve?: () => void }) {
  const state = useCloud();
  const [open, setOpen] = useState(false);
  const preference = useWeekPreference();
  const [savingDay, setSavingDay] = useState(false);
  const [preferenceError, setPreferenceError] = useState('');
  const pending = preference.effectiveFrom && fromISO(preference.effectiveFrom) > new Date() ? fromISO(preference.effectiveFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopImmediatePropagation(); setOpen(false); trigger.current?.focus(); } };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape, true); };
  }, [open]);
  const busy = state.status === 'connecting' || state.status === 'syncing';
  return <div className="cloud-profile" ref={root}>
    <button ref={trigger} className="cloud-profile-button" aria-label="Google Drive account" aria-expanded={open} aria-controls="cloud-account-menu" onClick={() => setOpen(!open)}>
      {state.user?.picture ? <img src={state.user.picture} alt="" referrerPolicy="no-referrer" /> : <span>{state.user?.name?.[0] ?? 'G'}</span>}
    </button>
    {unresolvedCount > 0 && <span className="cloud-conflict-warning" role="img" aria-label={`${unresolvedCount} unresolved duplicate boards`} title="Unresolved duplicate boards">!</span>}
    <span className={`cloud-status ${state.status}`}><SyncStatus state={state} /></span>
    {open && <div id="cloud-account-menu" className="cloud-account-menu">
      {unresolvedCount > 0 && <button className="cloud-solve-duplicates" onClick={() => { setOpen(false); onSolve?.(); }}>Solve duplicates <span>{unresolvedCount}</span></button>}
      {state.user && <div className="cloud-account-identity"><b>{state.user.name}</b><span>{state.user.email}</span></div>}
      {state.status === 'unconfigured' ? <p>Cloud sync is unavailable.</p> : state.user ? <>
        <button disabled={busy} onClick={() => { setOpen(false); void (state.status === 'needs-reconnect' ? cloud.signIn() : cloud.syncNow()); }}>{state.status === 'needs-reconnect' ? 'Reconnect' : 'Sync now'}</button>
        <button disabled={state.status === 'connecting'} onClick={() => { setOpen(false); void cloud.signOut(); }}>Sign out</button>
      </> : <button disabled={busy} onClick={() => void cloud.signIn()}>{busy ? 'Connecting…' : 'Sign in with Google'}</button>}
      {state.error && <p className="cloud-account-error" role="alert">{state.error}</p>}
      <div className="cloud-account-setting">
        <label>Week begins on <select aria-label="Week begins on" value={preference.day} disabled={savingDay} onChange={async event => {
          const day = Number(event.target.value); setSavingDay(true); setPreferenceError('');
          try { await setWeekStartDay(day); cloud.changed(); } catch { setPreferenceError('Could not save week preference. Try again.'); } finally { setSavingDay(false); }
        }}>{DAYS.map((day, i) => <option key={day} value={i}>{day}</option>)}</select></label>
        {pending && <p>Starts with the week of {pending}.</p>}
        {preferenceError && <p className="cloud-account-error" role="alert">{preferenceError}</p>}
      </div>
    </div>}
  </div>;
}
