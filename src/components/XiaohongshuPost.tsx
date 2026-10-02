import { useEffect, useRef, useState } from 'react';
import type { XiaohongshuMedia } from '../../worker/xiaohongshu.js';

export function XiaohongshuPost({ media, description, image, width, height, interactive, onError }: {
  media: XiaohongshuMedia; description: string; image: string; width: number; height: number;
  interactive: boolean; onError: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false), [index, setIndex] = useState(0);
  const [imageAspect, setImageAspect] = useState<{ url: string; ratio: number } | null>(null);
  const imageUrl = media.images[index] || image;
  useEffect(() => { if (!interactive) video.current?.pause(); }, [interactive]);
  useEffect(() => { setReady(false); const timeout = setTimeout(() => setReady(true), 8000); return () => clearTimeout(timeout); }, [media.video?.url, media.images[index]]);
  const aspect = media.video ? media.video.width / media.video.height : imageAspect?.url === imageUrl ? imageAspect.ratio : 3 / 4;
  const mediaWidth = Math.min(width, height * aspect);
  const showCopy = !!description && width - mediaWidth >= 100;
  return <div className="social-embed xiaohongshu-post" inert={!interactive} data-canvas-loading={!ready || undefined} style={{ height }}
    onPointerDown={event => { if (interactive && (event.target as Element).closest('video, button, .xhs-note-copy')) event.stopPropagation(); }}
    onDoubleClick={event => { if (interactive && (event.target as Element).closest('video, button, .xhs-note-copy')) event.stopPropagation(); }}
    onWheel={event => { if (interactive) event.stopPropagation(); }}
    onKeyDown={event => { if (interactive) event.stopPropagation(); }}>
    <div className="xhs-media" style={{ width: showCopy ? mediaWidth : '100%' }}>
      {media.video ? <video ref={video} src={media.video.url} poster={image || undefined} controls playsInline preload="metadata"
        aria-label="小红书视频" onLoadedMetadata={() => setReady(true)} onError={onError} />
        : <img src={imageUrl} alt="小红书笔记图片" draggable={false} referrerPolicy="no-referrer" onLoad={event => {
          const image = event.currentTarget;
          if (image.naturalWidth && image.naturalHeight) setImageAspect({ url: imageUrl, ratio: image.naturalWidth / image.naturalHeight });
          setReady(true);
        }} onError={onError} />}
      {!media.video && media.images.length > 1 && <button className="xhs-next-image" onClick={() => setIndex(current => (current + 1) % media.images.length)} aria-label="Next note image">{index + 1} / {media.images.length} →</button>}
    </div>
    {showCopy && <div className="xhs-note-copy">{description}</div>}
  </div>;
}
