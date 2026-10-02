import { useEffect, useState } from 'react';
import type { SocialPost } from '../socialEmbed';

export function SocialEmbed({ post, width, height, restricted, interactive }: { post: SocialPost; width: number; height: number; restricted?: boolean; interactive: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const timeout = setTimeout(() => setReady(true), 10000); return () => clearTimeout(timeout); }, [post.src]);
  const nativeWidth = Math.max(540, width), scale = width / nativeWidth;
  return <div className="social-embed" inert={!interactive} data-canvas-loading={!ready && !restricted || undefined} style={{ height }} onKeyDown={e => { if (interactive) e.stopPropagation(); }} onWheel={e => { if (interactive) e.stopPropagation(); }}>
    {restricted ? <div className="embed-unavailable"><strong>{post.label}</strong><p>This post requires sign-in. Open the original post to view it.</p></div> : <iframe style={{ width: nativeWidth, height: height / scale, transform: `scale(${scale})`, transformOrigin: '0 0' }} src={post.src} aria-label={`${post.label} post`} referrerPolicy="strict-origin-when-cross-origin" onLoad={() => setReady(true)} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation" allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen />}
  </div>;
}
