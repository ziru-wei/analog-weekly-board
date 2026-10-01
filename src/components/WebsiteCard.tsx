import { useEffect, useRef, type CSSProperties } from 'react';
import { type ItemData, clamp } from '../model';

// Website clipping styled as a clean printed ticket / receipt.
export function WebsiteCard({
  data,
  width,
  height, editing, onEdit, onText, onFinishEdit,
}: {
  data: Extract<ItemData, { type: 'website' }>;
  width: number;
  height: number;
  editing: boolean; onEdit: () => void; onText: (text: string) => void; onFinishEdit: () => void;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) editor.current?.focus(); }, [editing]);
  const compact = width < 245 || height < 112;
  const minimal = width < 185 || height < 94;
  const showImage = !!data.image && width >= 260 && height >= 270;

  const padding = minimal ? 8 : compact ? 10 : 12;
  const gap = minimal ? 3 : 4;
  const titleSize = clamp(width * 0.055, 16, 21);
  const hasDescription = Boolean(data.description) && width >= 250 && height >= 125;

  const imageHeight = showImage
    ? Math.min(118, height * 0.3)
    : 0;

  const contentHeight =
    height -
    padding * 2 -
    4 -
    17 -
    gap * 2 -
    (showImage ? imageHeight + gap : 0);

  const titleLines = clamp(
    Math.floor(
      (
        contentHeight -
        (hasDescription ? 14 + gap : 0)
      ) /
      (titleSize * 1.16),
    ),
    1,
    height < 112 ? 2 : 3,
  );

  const descriptionLines = !hasDescription
    ? 0
    : clamp(
        Math.floor(
          (
            contentHeight -
            titleLines * titleSize * 1.16 -
            gap
          ) /
          13.4,
        ),
        0,
        3,
      );

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

  return (
    <div
      className="clipping"
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

        // Slight paper thickness, but not a floating card shadow.
        boxShadow: `
          inset 0 0 0 1px rgba(255,255,255,.52),
          inset 0 -1px 0 rgba(115,104,80,.16),
          inset 0 0 12px rgba(110,99,75,.035),
          0 1px 2px rgba(24,30,38,.035)
        `,

        ...ticketMask,
      }}
    >
      {showImage && (
        <img
          src={data.image}
          alt=""
          draggable={false}
          style={{
            width: '100%',
            height: imageHeight,
            flexShrink: 0,
            objectFit: 'cover',

            // Keep image slightly "printed" rather than glossy.
            filter:
              'saturate(.78) contrast(.96) brightness(1.025)',
          }}
        />
      )}

      <a href={data.url} target="_blank" rel="noopener noreferrer" draggable={false}
        className="clipping-domain"
        title={data.domain}
        style={{
          fontFamily:
            "'IBM Plex Mono', 'Roboto Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",

          fontSize: minimal ? 12 : 13,
          fontWeight: 550,
          lineHeight: 1.2,

          fontVariantNumeric:
            'slashed-zero tabular-nums',

          fontFeatureSettings:
            '"zero" 1, "tnum" 1',

          letterSpacing: '-0.045em',

          color: '#454b54', textDecoration: 'none',

          // Slightly compressed receipt-printer feel.
          transform: 'scaleX(.93)',
          transformOrigin: 'left center',
          width: '107.5%',

          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',

          flexShrink: 0,
        }}
      >
        {data.domain} ↗
      </a>

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
        onKeyDown={event => { if (!editing && event.key === 'Enter') { event.stopPropagation(); onEdit(); } }}
        title="Double-click to edit title · open the website using its domain"
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

          ...(editing ? {} : clampedLines(titleLines)),
        }}
      >
        {editing ? <textarea ref={editor} aria-label="Website title" value={data.title} rows={titleLines}
          onChange={event => onText(event.target.value)} onBlur={onFinishEdit}
          onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) { event.preventDefault(); onFinishEdit(); } }}
          style={{ display: 'block', width: '100%', padding: 0, margin: 0, font: 'inherit', letterSpacing: 'inherit', color: 'inherit', lineHeight: 'inherit', background: 'transparent', border: 0, outline: 0, resize: 'none' }} /> : data.title}
      </div>

      {descriptionLines > 0 &&
        data.description && (
          <p
            style={{
              margin: 0,

              fontFamily:
                "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",

              fontSize: 10.5,
              lineHeight: 1.27,

              color: '#747b84',
              letterSpacing: '-0.005em',

              ...clampedLines(
                descriptionLines,
              ),
            }}
          >
            {data.description}
          </p>
        )}
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
