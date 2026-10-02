import { requestSiteAccess } from '../sitePermissions';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { type ItemData, clamp } from '../model';
import { youtubeVideo, youtubeTitle } from '../youtube';
import { clearLinkPreviewCache, loadLinkPreview, type LinkPreview } from '../linkPreview';
import { socialPost, isCompactWebsiteCard, isHorizontalWebsiteCard } from '../socialEmbed';
import { SocialEmbed } from './SocialEmbed';
import { YouTubePlayer } from './YouTubePlayer';
import { bilibiliVideo } from '../bilibili';
import { BilibiliPlayer } from './BilibiliPlayer';
import { XiaohongshuPost } from './XiaohongshuPost';

// Website clipping styled as a clean printed ticket / receipt.
export function WebsiteCard({
  data: savedData,
  width,
  height, interactive, editing, onEdit, onText, onFinishEdit, onMinHeight, onPreview,
}: {
  data: Extract<ItemData, { type: 'website' }>;
  width: number;
  height: number;
  interactive: boolean;
  onMinHeight: (height: number) => void;
  onPreview: (preview: LinkPreview) => void;
  editing: boolean; onEdit: () => void; onText: (text: string) => void; onFinishEdit: () => void;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const video = youtubeVideo(savedData.url), post = socialPost(savedData.url);
  const bilibili = bilibiliVideo(savedData.url);
  const [permissionRevision, setPermissionRevision] = useState(0);
  useEffect(() => { const retry = () => { clearLinkPreviewCache(); setPermissionRevision(n => n + 1); }; window.addEventListener('site-permissions-changed', retry); return () => window.removeEventListener('site-permissions-changed', retry); }, []);
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setPreview(null); setPreviewReady(false); setImageReady(false); setImageFailed(false); setMediaFailed(false);
    const request = video ? youtubeTitle(video.id).then(title => ({ title, description: '', image: '' }))
      : loadLinkPreview(savedData.url);
    void request.then(result => { if (active) { setPreview(result); setPreviewReady(true); } });
    return () => { active = false; };
  }, [savedData.url, permissionRevision]);
  const automaticTitle = !savedData.title || savedData.title === savedData.domain || savedData.title === 'YouTube video' || savedData.title === 'Bilibili video' || savedData.title === post?.label;
  const data = { ...savedData, title: automaticTitle && preview?.title ? preview.title : savedData.title,
    description: preview?.media ? preview.description : savedData.description || preview?.description || '', image: preview?.media ? preview.image : savedData.image || preview?.image || '', media: preview?.media ?? savedData.media };
  const savePreview = useRef(onPreview); savePreview.current = onPreview;
  useEffect(() => { if (preview && !preview.needsPermission && !preview.restricted) savePreview.current(preview); }, [preview]);
  useEffect(() => { if (editing) editor.current?.focus(); }, [editing]);
  const horizontal = isHorizontalWebsiteCard(width, height);
  const compact = isCompactWebsiteCard(width, height);
  const displayTitle = data.title || data.domain;
  const showVideo = !!video || !!bilibili;
  const mediaAspect = data.media?.video ? data.media.video.width / data.media.video.height : 16 / 9;
  const videoPreview = showVideo || !!data.media?.video;
  const nativePost = post?.provider === 'xiaohongshu' && !mediaFailed && data.media && (data.media.video || data.media.images.length) ? data.media : null;
  const livePost = post;
  const showImage = !showVideo && !livePost && !!data.image && !imageFailed;
  const root = useRef<HTMLDivElement>(null), footer = useRef<HTMLDivElement>(null), frame = useRef<HTMLDivElement>(null);
  const minimumHeight = useRef(onMinHeight); minimumHeight.current = onMinHeight;
  const [mediaHeight, setMediaHeight] = useState(80);
  const padding = compact ? 8 : 10;
  const titleSize = compact ? 13 : clamp(width * .05, 16, 18);
  const thumbnailWidth = Math.min(width * .42, Math.max(24, (height - padding * 2 - (compact ? 12 : 16) - 8) * mediaAspect));
  const mediaWidth = horizontal ? thumbnailWidth : width - 30;
  useLayoutEffect(() => {
    const measure = () => {
      const element = root.current, title = footer.current;
      if (!element || !title) return;
      if (editor.current) { editor.current.style.height = '0px'; editor.current.style.height = `${editor.current.scrollHeight}px`; }
      const headerHeight = element.querySelector<HTMLElement>('.clipping-domain')?.offsetHeight ?? 16;
      const permissionHeight = element.querySelector<HTMLElement>('.compact-preview-permission')?.offsetHeight ?? 0;
      const permissionSpace = permissionHeight ? permissionHeight + 6 : 0;
      if (horizontal) {
        const overhead = padding * 2 + headerHeight + 6 + permissionSpace;
        minimumHeight.current(overhead + Math.max(24, title.scrollHeight) + 2);
        setMediaHeight(Math.max(1, frame.current?.clientHeight ?? element.clientHeight - overhead));
        return;
      }
      const overhead = padding * 2 + headerHeight + 18 + 2 + title.scrollHeight + permissionSpace;
      const minFrame = compact ? 20 : showVideo ? 80 : 48;
      minimumHeight.current(overhead + minFrame + 2);
      setMediaHeight(Math.max(1, frame.current?.clientHeight ?? element.clientHeight - overhead));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    if (footer.current) observer.observe(footer.current);
    if (frame.current) observer.observe(frame.current);
    return () => observer.disconnect();
  }, [width, height, displayTitle, editing, compact, horizontal, padding, showVideo, mediaAspect, preview?.needsPermission]);
  // A failed thumbnail must not keep the entire board behind its loading screen.
  useEffect(() => { if (!showImage) return; const timer = setTimeout(() => setImageReady(true), 8000); return () => clearTimeout(timer); }, [data.image, showImage]);

  const ticketMask: CSSProperties = {
    WebkitMaskImage: `
      radial-gradient(
        circle 7px at 0 54%,
        transparent 0 6.5px,
        #000 7px
      ),
      radial-gradient(
        circle 3.2px at 100% 5px,
        transparent 0 2.8px,
        #000 3.2px
      )
    `,
    WebkitMaskSize: `
      100% 100%,
      100% 10px
    `,
    WebkitMaskPosition: `
      0 0,
      0 0
    `,
    WebkitMaskRepeat: `
      no-repeat,
      repeat-y
    `,
    WebkitMaskComposite: 'source-in',

    maskImage: `
      radial-gradient(
        circle 7px at 0 54%,
        transparent 0 6.5px,
        #000 7px
      ),
      radial-gradient(
        circle 3.2px at 100% 5px,
        transparent 0 2.8px,
        #000 3.2px
      )
    `,
    maskSize: `
      100% 100%,
      100% 10px
    `,
    maskPosition: `
      0 0,
      0 0
    `,
    maskRepeat: `
      no-repeat,
      repeat-y
    `,
    maskComposite: 'intersect',
  };

  const paperStyle: CSSProperties = {
        // Slightly off-white uncoated paper.
        backgroundColor: '#f4f3ee',

        // Very subtle paper grain / fiber texture.
        backgroundImage: `url('/paper-fibers.svg'),
          linear-gradient(112deg, #ffffff38, transparent 32%, #b4ab9910 72%, #ffffff30),
          linear-gradient(to bottom, #e0ded421, transparent 12%, transparent 88%, #c3bca51c)`,
        backgroundSize: '240px 240px, 100% 100%, 100% 100%',

        borderTop: '1px solid rgba(38, 44, 52, .14)',
        borderBottom: '1px solid rgba(38, 44, 52, .14)',
        borderLeft: '1px solid rgba(38, 44, 52, .14)',
        borderRight: video ? '1px solid transparent' : undefined,

        // Slight paper thickness, but not a floating card shadow.
        boxShadow: `
          inset 0 0 0 1px rgba(255,255,255,.52),
          inset 0 -1px 0 rgba(115,104,80,.16),
          inset 0 0 12px rgba(110,99,75,.035),
          0 1px 2px rgba(24,30,38,.035)
        `,

        ...ticketMask,
  };
  const domainLink = <a href={data.url} target="_blank" rel="noopener noreferrer" draggable={false}
    className="clipping-domain">
    {video ? 'Open on YouTube' : bilibili ? 'Open on Bilibili' : post ? `Open on ${post.label}` : data.domain} ↗
  </a>;

  const thumbnail = video ? `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg` : data.image;
  const hasPreview = !!preview?.title || !!data.description || !!data.image;
  return <div ref={root} className={`clipping website-clipping ${compact ? 'compact-link' : ''} ${horizontal ? 'is-horizontal' : ''}`}
    data-canvas-loading={!previewReady || (showImage && !imageReady && !compact) || undefined}
    style={{ ...paperStyle, padding: `${padding}px 16px ${padding}px 12px`, '--media-aspect': mediaAspect, ...(horizontal ? { gridTemplateColumns: `${thumbnailWidth}px 1px minmax(0, 1fr)` } : {}) } as CSSProperties}>
    {domainLink}
    <div ref={frame} className={`website-frame ${videoPreview ? 'video-preview' : ''} ${interactive ? 'is-interactive' : ''}`} style={{ height: mediaHeight }}>
      {compact ? <div className={`compact-link-image ${videoPreview ? 'video-thumbnail' : ''}`} aria-hidden="true"><span>{videoPreview ? '▶' : post?.label ?? data.domain}</span>{thumbnail && <img src={thumbnail} alt="" draggable={false} referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; }} />}</div>
        : video ? <YouTubePlayer key={`${video.id}-${video.start}`} video={video} width={mediaWidth} height={mediaHeight} title={displayTitle} interactive={interactive} />
        : bilibili ? <BilibiliPlayer key={`${bilibili.kind}-${bilibili.id}-${bilibili.page}-${bilibili.cid ?? ''}-${bilibili.start}`} video={bilibili} width={mediaWidth} height={mediaHeight} title={displayTitle} interactive={interactive} />
        : nativePost ? <XiaohongshuPost key={nativePost.video?.url ?? nativePost.images[0]} media={nativePost} description={data.description} image={data.image} width={mediaWidth} height={mediaHeight} interactive={interactive} onError={() => setMediaFailed(true)} />
        : livePost ? <SocialEmbed key={livePost.src} post={livePost} width={mediaWidth} height={mediaHeight} restricted={livePost.provider === 'xiaohongshu' ? undefined : preview?.restricted} interactive={interactive} />
        : showImage ? <img className="website-cover" src={data.image} alt="" draggable={false} referrerPolicy="no-referrer" onLoad={() => setImageReady(true)} onError={() => { setImageReady(true); setImageFailed(true); }} />
        : <div className="website-summary"><span>{data.domain}</span><p>{data.description || (!previewReady ? 'Loading preview…' : preview?.restricted ? 'This page requires sign-in. Open the original link to read it.' : hasPreview ? 'Open the original page to read more.' : 'Preview unavailable. Open the original link to read this page.')}</p></div>}
    </div>
    <div className="website-perforation" aria-hidden="true" />
    <div ref={footer} className="website-title" role="heading" aria-level={2} tabIndex={editing ? -1 : 0}
      style={{ fontSize: titleSize, maxHeight: Math.max(20, height - (horizontal ? padding * 2 + 26 : 70)) }}
      onDoubleClick={event => { event.stopPropagation(); onEdit(); }}
      onKeyDown={event => { if (!editing && event.key === 'F2') { event.stopPropagation(); onEdit(); } }}>
      {editing ? <textarea ref={editor} aria-label="Website title" value={data.title} rows={1}
        onChange={event => onText(event.target.value)} onBlur={onFinishEdit}
        onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
        onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) { event.preventDefault(); onFinishEdit(); } }} /> : displayTitle}
    </div>
    {preview?.needsPermission && <button className="compact-preview-permission" onPointerDown={event => event.stopPropagation()} onClick={() => { void requestSiteAccess(['https://*/*', 'http://*/*']).catch(() => {}); }}>Enable website previews</button>}
  </div>;
}
