import { useEffect, useState } from 'react';
import { cloud, useCloud } from '../cloud/sync';
import { isExtension, redirectUrl } from '../cloud/auth';

const ago = (t: number, now: number) => { const s = Math.max(0, Math.round((now - t) / 1000)); return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };

export function CloudPanel() {
  const state = useCloud();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const busy = state.status === 'connecting';

  if (state.status === 'unconfigured') return <div className="cloud-panel">
    <button className="cloud-google" disabled>Sign in with Google</button>
    <p className="cloud-note">Cloud sync isn't set up yet. Add a Google client ID to <code>.env.local</code> (see docs/google-drive-setup.md).{isExtension() && <> Register this redirect URI on the client: <code>{redirectUrl()}</code></>}</p>
  </div>;

  if (state.status === 'signed-out' || busy || !state.user) return <div className="cloud-panel">
    <button className="cloud-google" onClick={() => void cloud.signIn()} disabled={busy}><span className="g-mark" aria-hidden="true">G</span>{busy ? 'Connecting…' : 'Sign in with Google'}</button>
    <p className="cloud-note">{state.error ?? 'Sync your boards and archives across devices through your Google Drive.'}</p>
    {isExtension() && <p className="cloud-note">Redirect URI for the Google OAuth client: <code className="cloud-uri">{redirectUrl()}</code></p>}
  </div>;

  return <div className="cloud-panel signed-in">
    <div className="cloud-user">
      {state.user.picture ? <img src={state.user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="cloud-avatar">{state.user.name[0]}</span>}
      <span><b>{state.user.name}</b><i>{state.user.email}</i></span>
    </div>
    <div className="cloud-actions">
      <span className={`cloud-status ${state.status}`}>
        {state.status === 'syncing' ? 'Syncing…' : state.status === 'needs-reconnect' ? 'Session expired' : state.status === 'error' ? 'Sync failed' : state.lastSyncedAt ? `Synced ${ago(state.lastSyncedAt, now)}` : 'Connected'}
      </span>
      {state.status === 'needs-reconnect'
        ? <button onClick={() => void cloud.signIn()}>Reconnect</button>
        : <button onClick={() => void cloud.syncNow()} disabled={state.status === 'syncing'}>Sync now</button>}
      <button onClick={() => void cloud.signOut()}>Sign out</button>
    </div>
    {state.error && <p className="cloud-note error">{state.error}</p>}
  </div>;
}
