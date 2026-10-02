import { requestSiteAccess } from '../sitePermissions';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { type ItemData, clamp } from '../model';
import { youtubeVideo, youtubeTitle } from '../youtube';
import { clearLinkPreviewCache, loadLinkPreview, type LinkPreview } from '../linkPreview';
import { socialPost, isCompactWebsiteCard } from '../socialEmbed';
import { SocialEmbed } from './SocialEmbed';
import { YouTubePlayer } from './YouTubePlayer';

// Website clipping styled as a clean printed ticket / receipt.
export function WebsiteCard({
  data: savedData,
  width,
  height, editing, onEdit, onText, onFinishEdit,
}: {
  data: Extract<ItemData, { type: 'website' }>;
  width: number;
  height: number;
  editing: boolean; onEdit: () => void; onText: (text: string) => void; onFinishEdit: () => void;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const video = youtubeVideo(savedData.url), post = socialPost(savedData.url);
  const [permissionRevision, setPermissionRevision] = useState(0);
  useEffect(() => { const retry = () => { clearLinkPreviewCache(); setPermissionRevision(n => n + 1); }; window.addEventListener('site-permissions-changed', retry); return () => window.removeEventListener('site-permissions-changed', retry); }, []);
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  useEffect(() => {
    let active = true;
    setPreview(null); setPreviewReady(false); setImageReady(false);
    const request = video ? youtubeTitle(video.id).then(title => ({ title, description: '', image: '' }))
      : !post || post.provider === 'xiaohongshu' ? loadLinkPreview(savedData.url) : Promise.resolve(null);
    void request.then(result => { if (active) { setPreview(result); setPreviewReady(true); } });
    return () => { active = false; };
  }, [savedData.url, permissionRevision]);
  const automaticTitle = !savedData.title || savedData.title === savedData.domain || savedData.title === 'YouTube video' || savedData.title === post?.label;
  const data = { ...savedData, title: automaticTitle && preview?.title ? preview.title : savedData.title,
    description: savedData.description || preview?.description || '', image: savedData.image || preview?.image || '' };
  useEffect(() => { if (editing) editor.current?.focus(); }, [editing]);
  const compact = width < 245 || height < 112;
  const minimal = width < 185 || height < 94;
  const displayTitle = data.title;
  const videoHeight = Math.min((width - 32) * 9 / 16, Math.max(60, height - 88));
  const showVideo = !!video;
  const showImage = !video && !post && !!data.image && width >= 180 && height >= 180;
  // A failed thumbnail must not keep the entire board behind its loading screen.
  useEffect(() => { if (!showImage) return; const timer = setTimeout(() => setImageReady(true), 8000); return () => clearTimeout(timer); }, [data.image, showImage]);

  const padding = minimal ? 8 : compact ? 10 : 12;
  const gap = minimal ? 3 : 4;
  const titleSize = clamp(width * 0.055, 16, 21);
  const titleLines = 2;
  const imageHeight = Math.max(40, height - padding * 2 - 4 - 17 - gap * 3 - titleSize * 1.16 * titleLines);

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
    {video ? 'Open on YouTube' : post ? `Open on ${post.label}` : data.domain} ↗
  </a>;

  if (isCompactWebsiteCard(width, height)) {
    const thumbnail = video ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : data.image;
    return <div className="clipping compact-link" style={paperStyle} data-canvas-loading={!previewReady || undefined}>
      {domainLink}
      <div className="compact-link-body">
      <div className="compact-link-image" style={{ flexBasis: Math.min(76, width * .24), height: '100%' }} aria-hidden="true"><span>{video ? '▶' : post?.label ?? data.domain[0]?.toUpperCase()}</span>{thumbnail && <img src={thumbnail} alt="" draggable={false} referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }} />}</div>
      <div className="compact-link-perforation" aria-hidden="true" />
      <div className="compact-link-content">
        {editing ? <textarea ref={editor} aria-label="Website title" value={savedData.title} onChange={e => onText(e.target.value)} onBlur={onFinishEdit} onPointerDown={e => e.stopPropagation()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); onFinishEdit(); } }} />
          : <div className="website-title" onDoubleClick={e => { e.stopPropagation(); onEdit(); }}>{displayTitle}</div>}
        {preview?.needsPermission && <button className="compact-preview-permission" onPointerDown={e => e.stopPropagation()} onClick={() => { void requestSiteAccess(['https://*/*', 'http://*/*']).catch(() => {}); }}>Enable website previews</button>}
      </div>
      </div>
    </div>;
  }

  return (
    <div
      className="clipping" data-canvas-loading={!previewReady || (showImage && !imageReady) || undefined}
      data-density={
        minimal
          ? 'minimal'
          : compact
            ? 'compact'
            : 'full'
      }
      style={{
        position: 'relative',
        height: '100%',
        overflow: 'hidden',

        padding: `${padding + 4}px ${padding + 6}px ${padding}px ${padding}px`,

        display: 'flex',
        flexDirection: 'column',
        gap,

        color: '#30343a',

        ...paperStyle,
      }}
    >
      {domainLink}
      {showImage && (
        <img
          src={data.image}
          onLoad={() => setImageReady(true)} onError={() => setImageReady(true)} referrerPolicy="no-referrer"
          alt=""
          draggable={false}
          style={{
            width: '100%',
            height: imageHeight,
            flex: '1 1 0',
            minHeight: 0,
            objectFit: 'cover',

            // Keep image slightly "printed" rather than glossy.
            filter:
              'saturate(.78) contrast(.96) brightness(1.025)',
          }}
        />
      )}

      {/* Full-width perforation line */}
      <div
        aria-hidden
        style={{
          height: 0,
          flexShrink: 0,

          marginLeft: -padding,
          marginRight: -(padding + 6),

          borderTop:
            '1.5px dashed rgba(48, 55, 64, .62)',
        }}
      />

      <div
        className="website-title"
        role="heading" aria-level={2} tabIndex={editing ? -1 : 0}
        onDoubleClick={event => { event.stopPropagation(); onEdit(); }}
        onKeyDown={event => { if (!editing && event.key === 'F2') { event.stopPropagation(); onEdit(); } }}
        style={{
          color: 'inherit',

          fontFamily:
            "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",

          fontSize: titleSize,
          fontWeight: 620,
          lineHeight: 1.16,

          letterSpacing: '-0.018em',

          textDecoration: 'none',
          overflowWrap: 'anywhere',

          flexShrink: 0,
          ...(!video && !post && !showImage ? { marginBlock: 'auto' } : {}),

          ...(editing ? {} : clampedLines(video ? 1 : titleLines)),
        }}
      >
        {editing ? <textarea ref={editor} aria-label="Website title" value={data.title} rows={titleLines}
          onChange={event => onText(event.target.value)} onBlur={onFinishEdit}
          onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) { event.preventDefault(); onFinishEdit(); } }}
          style={{ display: 'block', width: '100%', padding: 0, margin: 0, font: 'inherit', letterSpacing: 'inherit', color: 'inherit', lineHeight: 'inherit', background: 'transparent', border: 0, outline: 0, resize: 'none' }} /> : displayTitle}
      </div>

      {showVideo && video && <YouTubePlayer key={`${video.id}-${video.start}`} video={video} width={width - 32} height={videoHeight} title={displayTitle} />}

      {post && <SocialEmbed key={post.src} post={post} width={width - 32} height={height - 94} restricted={preview?.restricted} />}
      {preview?.needsPermission && <div className="embed-permission" onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}><p>Allow website access to show page titles, summaries and images.</p><button onClick={() => { void requestSiteAccess(['https://*/*', 'http://*/*']).catch(() => {}); }}>Enable website previews</button></div>}
      {!post && !video && !preview?.needsPermission && previewReady && !data.image && <p className="link-preview-unavailable">{preview?.restricted ? 'This page requires sign-in. Open the original link to read it.' : 'Preview unavailable. Open the original link to read this page.'}</p>}


    </div>
  );
}

function clampedLines(
  count: number,
): CSSProperties {
  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: count,
    overflow: 'hidden',
  };
}
