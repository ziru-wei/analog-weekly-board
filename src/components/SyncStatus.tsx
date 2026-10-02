import { useEffect, useState } from 'react';
import { type CloudState } from '../cloud/sync';

export function SyncStatus({ state }: { state: CloudState }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  if (state.status === 'syncing') return <>Syncing…</>;
  if (state.status === 'connecting') return <>Connecting…</>;
  if (state.status === 'needs-reconnect') return <>Sync paused</>;
  if (state.status === 'error') return <>Sync failed</>;
  if (state.status !== 'idle') return <>Local only</>;
  if (!state.lastSyncedAt) return <>Not synced yet</>;
  const seconds = Math.max(0, Math.floor((now - state.lastSyncedAt) / 1000));
  const ago = seconds < 60 ? 'just now' : seconds < 3600 ? `${Math.floor(seconds / 60)} min ago` : seconds < 86400 ? `${Math.floor(seconds / 3600)} h ago` : `${Math.floor(seconds / 86400)} d ago`;
  return <>Synced {ago}</>;
}
