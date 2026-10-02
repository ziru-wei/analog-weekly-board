import { useEffect, useRef, useState } from 'react';
import { SitePermissionError, requestSiteAccess, YOUTUBE_ORIGINS } from '../sitePermissions';
import { prepareYouTubePlayer, youtubeEmbedUrl, type YouTubeVideo } from '../youtube';

export function YouTubePlayer({ video, width, height, title, interactive }: { video: YouTubeVideo; width: number; height: number; title: string; interactive: boolean }) {
  const [prepared, setPrepared] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [needsPermission, setNeedsPermission] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => { const retry = () => { if (needsPermission) setAttempt(n => n + 1); }; window.addEventListener('site-permissions-changed', retry); return () => window.removeEventListener('site-permissions-changed', retry); }, [needsPermission]);
  const loaded = useRef(false);
  useEffect(() => {
    let active = true; loaded.current = false; setError(''); setNeedsPermission(false); setReady(false); setPrepared(false);
    const timeout = setTimeout(() => { if (active && !loaded.current) { setError('Video could not load. Open on YouTube to watch.'); setReady(true); } }, 12000);
    void prepareYouTubePlayer().then(() => { if (active) setPrepared(true); }).catch(reason => {
      if (reason instanceof SitePermissionError) { if (active) { clearTimeout(timeout); setNeedsPermission(true); setReady(true); } return; }
      if (active && !loaded.current) { setError('Video could not load. Open on YouTube to watch.'); setReady(true); }
    });
    return () => { active = false; clearTimeout(timeout); };
  }, [attempt]);
  const playerWidth = Math.max(360, width), playerHeight = playerWidth * 9 / 16;
  const playerScale = Math.min(width / playerWidth, height / playerHeight);
  return <div className="youtube-player" inert={!interactive} data-canvas-loading={!ready || undefined} style={{ height }} onKeyDown={e => { if (interactive) e.stopPropagation(); }} onWheel={e => { if (interactive) e.stopPropagation(); }}>
    {prepared && !error && <div className="youtube-viewport" style={{ width: playerWidth, height: playerHeight, transform: `translate(-50%, -50%) scale(${playerScale})` }}><iframe src={youtubeEmbedUrl(video)} aria-label={`YouTube: ${title}`} style={{ height: playerHeight }} onLoad={() => { loaded.current = true; setReady(true); }} referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen /></div>}
    {needsPermission && <div className="embed-permission"><p>Firefox needs permission to identify this video player to YouTube.</p><button onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onClick={() => { void requestSiteAccess(YOUTUBE_ORIGINS).catch(() => setError('Permission could not be granted. Check extension site permissions.')); }}>Allow YouTube playback</button></div>}
    {error && <span role="status">{error}</span>}
  </div>;
}
