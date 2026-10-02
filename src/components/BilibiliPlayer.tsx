import { useEffect, useRef, useState } from 'react';
import { bilibiliEmbedUrl, type BilibiliVideo } from '../bilibili';

export function BilibiliPlayer({ video, width, height, title, interactive }: {
  video: BilibiliVideo; width: number; height: number; title: string; interactive: boolean;
}) {
  const [ready, setReady] = useState(false), [error, setError] = useState(false);
  const loaded = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => { if (!loaded.current) { setError(true); setReady(true); } }, 12000);
    return () => clearTimeout(timer);
  }, []);
  const playerWidth = Math.max(360, width), playerHeight = playerWidth * 9 / 16;
  const playerScale = Math.min(width / playerWidth, height / playerHeight);
  return <div className="bilibili-player" inert={!interactive} data-canvas-loading={!ready || undefined} style={{ height }}
    onKeyDown={event => { if (interactive) event.stopPropagation(); }}
    onWheel={event => { if (interactive) event.stopPropagation(); }}>
    {error ? <span role="status">Video could not load. Open on Bilibili to watch.</span>
      : <div className="bilibili-viewport" style={{ width: playerWidth, height: playerHeight, transform: `translate(-50%, -50%) scale(${playerScale})` }}>
        <iframe src={bilibiliEmbedUrl(video)} aria-label={`Bilibili: ${title}`} style={{ height: playerHeight }}
          onLoad={() => { loaded.current = true; setReady(true); }} onError={() => { setError(true); setReady(true); }}
          referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
      </div>}
  </div>;
}
