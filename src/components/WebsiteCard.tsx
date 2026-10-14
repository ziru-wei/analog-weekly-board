import { requestSiteAccess } from '../sitePermissions';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { type ItemData, clamp } from '../model';
import { youtubeVideo, youtubeTitle } from '../youtube';
import { clearLinkPreviewCache, loadLinkPreview, type LinkPreview } from '../linkPreview';
import { socialPost, isCompactWebsiteCard, isHorizontalWebsiteCard } from '../socialEmbed';
import { cardStock } from '../cardStock';
import { SocialEmbed } from './SocialEmbed';
import { YouTubePlayer } from './YouTubePlayer';
import { bilibiliVideo } from '../bilibili';
import { BilibiliPlayer } from './BilibiliPlayer';
import { XiaohongshuPost } from './XiaohongshuPost';

/** The path of a link, shortened for printing under a card whose page gave no title of its own. */
export function linkPath(url: string) {
  try { const { pathname, search } = new URL(url); const path = decodeURIComponent(pathname + search).replace(/\/$/, ''); return path.length > 42 ? `${path.slice(0, 41)}…` : path; } catch { return ''; }
}

// Website cards are printed on card stock: plain links as a letterpress card, videos and posts framed on the same paper.
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
  const embed = showVideo || !!livePost;
  useLayoutEffect(() => {
    const measure = () => {
      const element = root.current, title = footer.current;
      if (!element || !title) return;
      if (!embed) {
        if (editor.current) { editor.current.style.height = '0px'; editor.current.style.height = `${editor.current.scrollHeight}px`; }
        const lineHeight = parseFloat(getComputedStyle(title).lineHeight) || 20;
        const foot = element.querySelector<HTMLElement>('.link-card-foot')?.offsetHeight ?? 14;
        minimumHeight.current(Math.ceil(24 + foot + 6 + lineHeight + 2));
        // The description keeps only whole lines that fit; with no room it goes entirely (the picture stays).
        const text = element.querySelector<HTMLElement>('.link-card-text'), description = element.querySelector<HTMLElement>('.link-card-description');
        if (text && description) {
          description.style.display = ''; description.style.webkitLineClamp = '';
          const room = element.classList.contains('tall') ? element.clientHeight * .5 - foot - 30 - title.offsetHeight : text.clientHeight - title.offsetHeight - 6;
          const lines = Math.floor(room / (parseFloat(getComputedStyle(description).lineHeight) || 18));
          if (lines < 1) description.style.display = 'none'; else description.style.webkitLineClamp = String(lines);
        }
        return;
      }
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
  }, [width, height, displayTitle, editing, compact, horizontal, padding, showVideo, mediaAspect, preview?.needsPermission, embed]);
  // A failed thumbnail must not keep the entire board behind its loading screen.
  useEffect(() => { if (!showImage) return; const timer = setTimeout(() => setImageReady(true), 8000); return () => clearTimeout(timer); }, [data.image, showImage]);

  const stock = cardStock(savedData.paper);
  const paperStyle = { '--paper': stock.paper, '--ink': stock.ink } as CSSProperties;
  const domainLink = <a href={data.url} target="_blank" rel="noopener noreferrer" draggable={false}
    className="clipping-domain">
    {video ? 'Open on YouTube' : bilibili ? 'Open on Bilibili' : post ? `Open on ${post.label}` : data.domain} ↗
  </a>;

  const thumbnail = video ? `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg` : data.image;
  const hasPreview = !!preview?.title || !!data.description || !!data.image;
  const loading = !previewReady || (showImage && !imageReady && !compact) || undefined;
  const permission = preview?.needsPermission && <button className="compact-preview-permission" onPointerDown={event => event.stopPropagation()} onClick={() => { void requestSiteAccess(['https://*/*', 'http://*/*']).catch(() => {}); }}>Enable website previews</button>;
  const titleEditor = <textarea ref={editor} aria-label="Website title" value={data.title} rows={1}
    onChange={event => onText(event.target.value)} onBlur={onFinishEdit}
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) { event.preventDefault(); onFinishEdit(); } }} />;

  if (!embed) {
    // A plain link: a printed card. Wide cards put the picture beside the words, taller ones above them.
    const short = height < 110, untitled = !data.title || data.title === data.domain;
    // The picture is never dropped for lack of room; the description is the first thing to go.
    const layout = !showImage ? 'text' : width / height >= 1.2 || height < 200 ? 'wide' : 'tall';
    const perforation = <div className="website-perforation" aria-hidden="true" />;
    // Beside a picture the words keep at least 100px; the picture shrinks before the title does.
    const thumb = Math.round(Math.max(48, Math.min(width * .45, (height - 20) * 1.4, width - 151)));
    const roomy = layout === 'tall' ? height >= 280 : layout !== 'wide' || width - thumb - 51 >= 140;
    const description = !short && roomy && data.description && data.description !== displayTitle ? data.description : '';
    return <div ref={root} className={`clipping card-stock link-card ${layout} ${short ? 'short' : ''}`} data-canvas-loading={loading}
      style={{ ...paperStyle, ...(layout === 'wide' ? { gridTemplateColumns: `${thumb}px 1px minmax(0, 1fr)` } : {}) } as CSSProperties}>
      {layout !== 'text' && <div className="link-card-image"><img src={data.image} alt="" draggable={false} referrerPolicy="no-referrer" onLoad={() => setImageReady(true)} onError={() => { setImageReady(true); setImageFailed(true); }} /></div>}
      {layout !== 'text' && perforation}
      <div className="link-card-text">
        <div ref={footer} className="link-card-title" role="heading" aria-level={2} tabIndex={editing ? -1 : 0}
          style={{ fontSize: short ? 14 : clamp(width * .055, 15, 19) }}
          onDoubleClick={event => { event.stopPropagation(); onEdit(); }}
          onKeyDown={event => { if (!editing && event.key === 'F2') { event.stopPropagation(); onEdit(); } }}>
          {editing ? titleEditor : displayTitle}
        </div>
        {description && <p className="link-card-description">{description}</p>}
        {!previewReady && !description && <p className="link-card-description">Loading preview…</p>}
      </div>
      {layout === 'text' && perforation}
      <div className="link-card-foot">{untitled && linkPath(data.url) ? <a href={data.url} target="_blank" rel="noopener noreferrer" draggable={false} className="clipping-domain">{linkPath(data.url)} ↗</a> : domainLink}{permission}</div>
    </div>;
  }
  return <div ref={root} className={`clipping card-stock website-clipping ${compact ? 'compact-link' : ''} ${horizontal ? 'is-horizontal' : ''}`}
    data-canvas-loading={loading}
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
      {editing ? titleEditor : displayTitle}
    </div>
    {permission}
  </div>;
}
