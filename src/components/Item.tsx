import { useEffect, useRef, type CSSProperties, type PointerEvent, type MouseEvent } from 'react';
import { useNoteTextLayout } from './useNoteTextLayout';
import { Tape } from './Tape';
import { WebsiteCard } from './WebsiteCard';
import { PhotoImage } from './PhotoImage';
import { CropLayer, type CropPatch } from './CropLayer';
import { type BoardItem, clamp, variation } from '../model';
export function Item({ item, selected, editing, pinTarget, onPointerDown, onResize, onEdit, onText, onFinishEdit, onContextMenu, onAddPin, onCrop, cropping, boardScale, onCropApply, onCropCancel }: {
  cropping: boolean; boardScale: number; onCropApply: (patch: CropPatch) => void; onCropCancel: () => void;
  item: BoardItem; selected: boolean; editing: boolean; pinTarget?: boolean;
  onPointerDown: (event: PointerEvent, item: BoardItem) => void; onResize: (event: PointerEvent, item: BoardItem, side?: 'left' | 'right') => void;
  onCrop: () => void; onEdit: () => void; onText: (text: string) => void; onFinishEdit: () => void; onContextMenu: (event: MouseEvent, item: BoardItem) => void; onAddPin: (event: MouseEvent, item: BoardItem) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null), captionInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) (textarea.current ?? captionInput.current)?.focus(); }, [editing]);
  const data = item.data;
  const note = useRef<HTMLDivElement>(null);
  useNoteTextLayout(item, editing ? textarea : note);
  return <article className={`board-item ${item.type} ${data.type === 'sticky' && data.variant ? `small-label ${data.variant === 'vellum' ? 'vellum-label' : ''}` : ''} ${selected ? 'is-selected' : ''} ${pinTarget ? 'is-pin-target' : ''} ${editing ? 'is-editing' : ''} ${cropping ? 'is-cropping' : ''} ${data.type === 'image' ? `photo-${data.frame}` : ''}`}
    data-item-id={item.id} aria-label={data.type === 'sticky' ? 'Sticky note' : data.type === 'image' ? data.alt : data.type === 'website' ? data.title : 'Blue painter’s tape'}
    style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: item.zIndex + 2, transform: `rotate(${item.rotation}deg)`, '--note-pad': `${clamp(item.width * .06, 9, 18)}px`, '--note-top': `${clamp(item.height * .09, 14, 25)}px`, '--paper': data.type === 'sticky' ? data.color : '#f1eddf', '--shade': .04 + variation(item.id) * .025, '--lift': `${(data.type === 'sticky' ? 1 : 5) + variation(item.id) * (data.type === 'sticky' ? 0.8 : 2)}px` } as CSSProperties}
    onPointerDown={event => onPointerDown(event, item)} onContextMenu={event => onContextMenu(event, item)}
    onDoubleClick={event => { event.stopPropagation(); if (event.shiftKey) onAddPin(event, item); else if (data.type === 'sticky' || data.type === 'website') onEdit(); else if (data.type === 'image' && !cropping) onCrop(); }}>
    {data.type === 'tape' && <Tape />}
    {data.type === 'sticky' && (editing ? <textarea ref={textarea} className="note-text" value={data.text} onChange={event => onText(event.target.value)} onBlur={onFinishEdit} onPointerDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onFinishEdit(); } event.stopPropagation(); }} aria-label="Note text" spellCheck={false} /> : <div ref={note} className="note-text">{data.text}</div>)}
    {data.type === 'image' && <><div className="photo-surface"><PhotoImage data={data} /><div className="photo-reflection" /></div>
      {data.frame === 'white' && <div className="photo-caption" title="Double-click to write a caption" onPointerDown={event => event.stopPropagation()} onDoubleClick={event => { event.stopPropagation(); onEdit(); }}>
        {editing ? <input ref={captionInput} value={data.caption ?? ''} maxLength={80} onChange={event => onText(event.target.value)} onBlur={onFinishEdit} aria-label="Photo caption" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter' || event.key === 'Escape') onFinishEdit(); }} /> : <span>{data.caption}</span>}
      </div>}</>}
    {data.type === 'image' && cropping && <CropLayer item={item} boardScale={boardScale} onApply={onCropApply} onCancel={onCropCancel} />}
    {data.type === 'website' && <WebsiteCard data={data} width={item.width} height={item.height} editing={editing} onEdit={onEdit} onText={onText} onFinishEdit={onFinishEdit} />}
    {selected && !editing && data.type === 'tape' && (['left', 'right'] as const).map(side => <button key={side} className={`tape-length-handle ${side}`} aria-label={`Adjust tape ${side} end`} title="Drag to change length" onPointerDown={event => onResize(event, item, side)} />)}
    {selected && !editing && !cropping && data.type !== 'tape' && <button className="resize-handle" aria-label="Resize item" title="Drag to resize" onPointerDown={event => onResize(event, item)} />}
  </article>;
}
