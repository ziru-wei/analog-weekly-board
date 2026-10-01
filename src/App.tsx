import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Dashboard } from './components/Dashboard';
import { ImageLightbox } from './components/ImageLightbox';
import { type WeekState, acknowledgeUpload, archiveOf, newRev, rollover, saveWeekState } from './weeks';
import { writeCurrent } from './storage';
import { cloud, useCloud } from './cloud/sync';
import { type BoardItem, type Pin as PinModel, type Point, clamp, localPoint, photoMargins, pinPosition } from './model';
import { createDocumentStore, useDocument } from './store';
import { renderCork } from './texture';
import { QuickLabel } from './components/QuickLabel';
import { Item } from './components/Item';
import { Pin } from './components/Pin';
import { ColorPalette, PAPER_COLORS } from './components/ColorPalette';
import { PinSupply } from './components/PinSupply';
import { NoteStack, NOTE_STACK_POSITION } from './components/NoteStack';
import { Tape } from './components/Tape';
import { TapeRoll, TAPE_WIDTH } from './components/TapeRoll';
import { AccessoryTray } from './components/AccessoryTray';
import { Ropes } from './components/Ropes';

// Blob URLs die with the tab, so pasted photos are stored as downscaled JPEG data URLs that survive reloads and archiving.
function persistentImage(img: HTMLImageElement) {
  const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = window.document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const g = c.getContext('2d'); if (!g) return img.src;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .84);
}
let initialWeek: WeekState;
let store: ReturnType<typeof createDocumentStore>;
let commands: ReturnType<typeof createDocumentStore>['commands'];
/** Called once from main.tsx, after the saved week state has been read from IndexedDB. */
export function initApp(week: WeekState) { initialWeek = week; store = createDocumentStore(week.current.doc); commands = store.commands; }
const HOLD_MS = 480, MAX_ZOOM = 2.5;
type Selection = { type: 'item' | 'pin' | 'rope'; id: string } | null;
type Gesture =
  | { kind: 'drag' | 'resize'; start: Point; item: BoardItem; moved: boolean; side?: 'left' | 'right' }
  | { kind: 'pin'; start: Point; pin: PinModel; mode: 'pending' | 'connect' | 'move'; moved: boolean }
  | { kind: 'tape'; start: Point; end: Point; moved: boolean }
  | { kind: 'pin-supply'; start: Point; color: string; moved: boolean }
  | { kind: 'supply'; start: Point; color: string; item?: BoardItem; moved: boolean }
  | { kind: 'pan'; start: Point; pan: Point; moved: boolean };
type Palette = { type: 'pin' | 'paper'; id: string } | null;
export default function App() {
  const document = useDocument(store);
  const viewport = useRef<HTMLDivElement>(null), board = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null), holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureTarget = useRef<{ element: Element; pointerId: number } | null>(null);
  const objectUrls = useRef<string[]>([]);
  const [tapeHeld, setTapeHeld] = useState(false);
  const [tapeCursor, setTapeCursor] = useState({ x: 0, y: 0 });
  const [tapePreview, setTapePreview] = useState<{ start: Point; end: Point } | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [palette, setPalette] = useState<Palette>(null);
  const [weeks, setWeeks] = useState<WeekState>(initialWeek);
  const cloudState = useCloud();
  const [dashboard, setDashboard] = useState(false);
  const [lightbox, setLightbox] = useState<{ id: string; from: Point } | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const weeksRef = useRef(weeks);
  const dashboardRef = useRef(false); dashboardRef.current = dashboard || !!lightbox || !!cropping; // any full-screen layer owns the keyboard
  const replacing = useRef(false);
  const liveState = (): WeekState => { const w = weeksRef.current; return { ...w, current: { ...w.current, doc: store.getSnapshot() } }; };
  // Replace the whole board (new week, or newer data arriving from another device).
  const commit = (next: WeekState, replaceBoard: boolean) => {
    weeksRef.current = next; setWeeks(next);
    if (replaceBoard) { replacing.current = true; store.commands.load(next.current.doc); replacing.current = false; setSelection(null); setEditing(null); setPalette(null); }
    void saveWeekState(next);
  };
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => { void writeCurrent(liveState().current); };
    const unsubscribe = store.subscribe(() => {
      if (replacing.current) return;
      const doc = store.getSnapshot();
      if (doc === weeksRef.current.current.doc) return;
      weeksRef.current = { ...weeksRef.current, current: { ...weeksRef.current.current, doc, updatedAt: Date.now(), rev: newRev() } };
      clearTimeout(timer); timer = setTimeout(flush, 400); cloud.changed();
    });
    cloud.attach({
      getState: liveState,
      apply: next => commit(next, next.current.rev !== weeksRef.current.current.rev),
      markSynced: uploaded => { weeksRef.current = acknowledgeUpload(liveState(), uploaded); void writeCurrent(liveState().current); },
    });
    void cloud.resume();
    window.addEventListener('pagehide', flush);
    return () => { unsubscribe(); clearTimeout(timer); window.removeEventListener('pagehide', flush); flush(); };
  }, []);
  const cycleFrame = (item: BoardItem) => {
    if (item.data.type !== 'image') return;
    const frame = item.data.frame === 'white' ? 'black' : item.data.frame === 'black' ? 'worn' : 'white';
    const previous = photoMargins(item.data.frame), next = photoMargins(frame), width = item.width - previous.x + next.x, height = item.height - previous.y + next.y;
    commands.updateItem(item.id, { data: { ...item.data, frame }, width, height, x: item.x + (item.width - width) / 2, y: item.y + (item.height - height) / 2 });
  };
  const openLightbox = (item: BoardItem) => {
    const el = window.document.querySelector(`[data-item-id="${item.id}"]`), r = el?.getBoundingClientRect();
    setLightbox({ id: item.id, from: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: size.width / 2, y: size.height / 2 } });
  };
  // Conflict copies: bring one back as the live board (same week), restore it as an archive, or throw it away.
  const resolveConflict = (id: string, action: 'current' | 'archive' | 'discard') => {
    const w = liveState(), copy = w.conflicts.find(c => c.id === id); if (!copy) return;
    const conflicts = w.conflicts.filter(c => c.id !== id);
    if (action === 'current' && copy.weekStart === w.current.weekStart) commit({ ...w, conflicts, current: { ...w.current, doc: copy.doc, updatedAt: Date.now(), rev: newRev() } }, true);
    else if (action === 'archive' && !w.archives.some(a => a.weekStart === copy.weekStart)) commit({ ...w, conflicts, archives: [...w.archives, archiveOf({ weekStart: copy.weekStart, startedOn: copy.startedOn, updatedAt: Date.now(), rev: newRev(), baseRev: '', doc: copy.doc })] }, false);
    else if (action === 'discard') commit({ ...w, conflicts }, false);
    else return;
    void cloud.discardConflict(id); cloud.changed();
  };
  // Pull other devices' changes when the tab regains focus, and every few minutes while it stays open.
  useEffect(() => {
    const pull = () => { if (!window.document.hidden) void cloud.syncNow(); };
    const timer = setInterval(pull, 120_000);
    window.document.addEventListener('visibilitychange', pull);
    return () => { clearInterval(timer); window.document.removeEventListener('visibilitychange', pull); };
  }, []);
  // When Monday arrives the finished week is archived and a fresh board replaces it.
  useEffect(() => {
    const check = () => {
      const live = liveState(), next = rollover(live);
      if (next === live) return;
      commit(next, true); cloud.changed();
    };
    const timer = setInterval(check, 30_000);
    window.document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); window.document.removeEventListener('visibilitychange', check); };
  }, []);
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const track = (event: MouseEvent) => { pointer.current = { x: event.clientX, y: event.clientY }; };
    for (const type of ['pointermove', 'pointerdown', 'contextmenu']) window.addEventListener(type, track as EventListener, true);
    return () => { for (const type of ['pointermove', 'pointerdown', 'contextmenu']) window.removeEventListener(type, track as EventListener, true); };
  }, []);
  // The palette opens next to the cursor that summoned it.
  const palettePos = useMemo(() => (palette ? { ...pointer.current } : null), [palette]);
  const [pinPreview, setPinPreview] = useState<{ position: Point; color: string } | null>(null);
  const [pinDropTarget, setPinDropTarget] = useState<string | null>(null);
  const [movingPin, setMovingPin] = useState<string | null>(null);
  const [temporary, setTemporary] = useState<{ from: string; to: Point } | null>(null);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [stackColor, setStackColor] = useState(() => PAPER_COLORS[Math.floor(Math.random() * PAPER_COLORS.length)]);
  const [notice, setNotice] = useState('');
  const [activeGesture, setActiveGesture] = useState(false);
  const scale = Math.min((size.width - 32) / 1600, (size.height - 112) / 1000) * view.zoom;
  const constrainPan = (x: number, y: number, nextScale = scale) => ({ x: clamp(x, -Math.max(0, (1600 * nextScale - size.width + 32) / 2), Math.max(0, (1600 * nextScale - size.width + 32) / 2)), y: clamp(y, -Math.max(0, (1000 * nextScale - size.height + 32) / 2), Math.max(0, (1000 * nextScale - size.height + 32) / 2)) });
  const pan = constrainPan(view.x, view.y);
  useLayoutEffect(() => {
    const clip = window.document.querySelector('.note-stack-clip img');
    const update = () => {
      if (!clip || !board.current) return;
      const r = clip.getBoundingClientRect(), b = board.current.getBoundingClientRect();
      commands.setClipBounds({ left: (r.left - b.left) / scale, right: (r.right - b.left) / scale, top: (r.top - b.top) / scale, bottom: (r.bottom - b.top) / scale });
    };
    update(); const observer = new ResizeObserver(update); if (clip) observer.observe(clip);
    return () => observer.disconnect();
  }, [scale, pan.x, pan.y]);
  const lightingCenter = { x: 800 - pan.x / scale, y: 500 + (40 - pan.y) / scale };
  useEffect(() => { if (canvas.current) renderCork(canvas.current); }, []);
  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => () => { objectUrls.current.forEach(URL.revokeObjectURL); if (holdTimer.current) clearTimeout(holdTimer.current); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3200); return () => clearTimeout(timer); }, [notice]);
  const clearHold = () => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null; };
  const releaseCapture = () => {
    const target = captureTarget.current; captureTarget.current = null;
    if (target?.element.hasPointerCapture(target.pointerId)) target.element.releasePointerCapture(target.pointerId);
  };
  const clearGesture = () => { clearHold(); gesture.current = null; setPinDropTarget(null); setPinPreview(null); setTapePreview(null); setTemporary(null); setMovingPin(null); setActiveGesture(false); releaseCapture(); };
  const finishEdit = () => { if (editing) commands.finishTransaction(); setEditing(null); };
  const cancelGesture = () => { const g = gesture.current; if (g?.kind === 'pan') setView(current => ({ ...current, ...g.pan })); commands.cancelTransaction(); clearGesture(); setPalette(null); };
  const travelHistory = (redo: boolean) => { finishEdit(); cancelGesture(); if (redo) commands.redo(); else commands.undo(); setSelection(null); };
  const removeSelection = () => {
    if (!selection) return;
    if (selection.type === 'item') commands.deleteItem(selection.id);
    else if (selection.type === 'pin') commands.deletePin(selection.id);
    else commands.deleteConnection(selection.id);
    setSelection(null); setPalette(null);
  };
  const point = (event: { clientX: number; clientY: number }): Point => {
    const rect = board.current!.getBoundingClientRect(); return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };
  const itemAt = (event: { clientX: number; clientY: number }) => window.document.elementsFromPoint(event.clientX, event.clientY)
    .map(element => element.closest<HTMLElement>('[data-item-id]')?.dataset.itemId).find(Boolean);
  const capture = (event: ReactPointerEvent, stable = false) => {
    // Pins change DOM order when their attachment changes. Capture on the stable
    // workspace so reordering a pin cannot cancel and roll back its drag.
    const element = stable ? viewport.current! : event.currentTarget;
    element.setPointerCapture(event.pointerId); captureTarget.current = { element, pointerId: event.pointerId }; setActiveGesture(true);
  };
  const selectItem = (id: string) => {
    setSelection({ type: 'item', id });
    commands.updateItem(id, { zIndex: Math.max(0, ...Object.values(store.getSnapshot().items).map(item => item.zIndex)) + 1 });
  };
  const startEdit = (id: string) => { finishEdit(); commands.beginTransaction(); selectItem(id); setEditing(id); setPalette(null); };
  const itemDown = (event: ReactPointerEvent, item: BoardItem) => {
    if (event.button !== 0 || editing === item.id) return;
    event.stopPropagation(); finishEdit(); setPalette(null); commands.beginTransaction(); selectItem(item.id);
    gesture.current = { kind: 'drag', start: point(event), item, moved: false }; capture(event);
  };
  const resizeDown = (event: ReactPointerEvent, item: BoardItem, side?: 'left' | 'right') => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); commands.beginTransaction();
    gesture.current = { kind: 'resize', start: point(event), item, side, moved: false }; capture(event);
  };
  const pinDown = (event: ReactPointerEvent, pin: PinModel) => {
    if (event.button !== 0 || gesture.current) return;
    event.preventDefault(); event.stopPropagation(); finishEdit(); setPalette(null); setSelection({ type: 'pin', id: pin.id });
    commands.beginTransaction();
    const g: Gesture = { kind: 'pin', start: point(event), pin, mode: 'pending', moved: false };
    gesture.current = g; capture(event, true);
    holdTimer.current = setTimeout(() => {
      if (gesture.current !== g || g.moved) return;
      g.mode = 'move'; setMovingPin(pin.id);
    }, HOLD_MS);
  };
  const pointerMove = (event: ReactPointerEvent) => {
    const g = gesture.current; if (!g) return;
    if (g.kind === 'pin-supply') {
      const p = point(event);
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) * scale > 5) g.moved = true;
      if (g.moved) { setPinPreview({ position: p, color: g.color }); setPinDropTarget(itemAt(event) ?? null); }
      return;
    }
    if (g.kind === 'tape') {
      const p = point(event);
      g.end = { x: clamp(p.x, TAPE_WIDTH / 2, 1600 - TAPE_WIDTH / 2), y: clamp(p.y, TAPE_WIDTH / 2, 1000 - TAPE_WIDTH / 2) };
      g.moved = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y) > 8;
      setTapePreview({ start: g.start, end: g.end }); return;
    }
    if (g.kind === 'pan') {
      const dx = event.clientX - g.start.x, dy = event.clientY - g.start.y;
      if (Math.hypot(dx, dy) > 5) g.moved = true;
      setView(current => ({ ...current, ...constrainPan(g.pan.x + dx, g.pan.y + dy) })); return;
    }
    const p = point(event), dx = p.x - g.start.x, dy = p.y - g.start.y;
    if (Math.hypot(dx, dy) * scale > 5) g.moved = true;
    if (!g.moved) return;
    clearHold();
    if (g.kind === 'supply') {
      if (!g.item) {
        const id = commands.createItem({ type: 'sticky', text: '', color: g.color }, NOTE_STACK_POSITION);
        g.item = store.getSnapshot().items[id]; setSelection({ type: 'item', id });
      }
      commands.updateItem(g.item.id, { x: NOTE_STACK_POSITION.x + dx, y: NOTE_STACK_POSITION.y + dy });
    } else if (g.kind === 'drag') commands.updateItem(g.item.id, { x: g.item.x + dx, y: g.item.y + dy });
    else if (g.kind === 'resize') {
      const angle = g.item.rotation * Math.PI / 180;
      if (g.item.type === 'tape') {
        const sign = g.side === 'left' ? -1 : 1;
        const distance = dx * Math.cos(angle) + dy * Math.sin(angle);
        const width = clamp(g.item.width + sign * distance, 8, Math.hypot(1600, 1000));
        const change = width - g.item.width;
        commands.updateItem(g.item.id, { width, height: TAPE_WIDTH,
          x: g.item.x + sign * change / 2 * Math.cos(angle) - change / 2,
          y: g.item.y + sign * change / 2 * Math.sin(angle) });
        return;
      }
      const label = g.item.data.type === 'sticky' && !!g.item.data.variant;
      let width = clamp(g.item.width + dx * Math.cos(angle) + dy * Math.sin(angle), label ? 100 : 150, 1550);
      let height = clamp(g.item.height - dx * Math.sin(angle) + dy * Math.cos(angle), label ? 26 : 110, 950);
      if (g.item.data.type === 'image' && !event.shiftKey) { const { x: edgeX, y: edgeY } = photoMargins(g.item.data.frame); width = Math.min(width, (950 - edgeY) * g.item.data.aspectRatio + edgeX); height = (width - edgeX) / g.item.data.aspectRatio + edgeY; }
      commands.updateItem(g.item.id, { width, height });
    } else if (g.kind === 'pin') {
      setPalette(null);
      if (g.mode === 'pending') g.mode = 'connect';
      if (g.mode === 'move') {
        const target = itemAt(event);
        setPinDropTarget(target ?? null);
        commands.movePin(g.pin.id, p, target);
      } else setTemporary({ from: g.pin.id, to: p });
    }
  };
  const pointerUp = (event: ReactPointerEvent) => {
    const g = gesture.current; if (!g) return;
    if (g.kind === 'pin-supply') {
      const p = point(event);
      if (g.moved && p.x >= 0 && p.y >= 0 && p.x <= 1600 && p.y <= 1000) {
        const id = commands.placePin(p, g.color, itemAt(event)); setSelection({ type: 'pin', id }); commands.finishTransaction();
      } else commands.cancelTransaction();
      clearGesture(); return;
    }
    if (g.kind === 'tape') {
      if (g.moved) {
        const length = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);
        commands.createItem({ type: 'tape' }, { x: (g.start.x + g.end.x) / 2 - length / 2, y: (g.start.y + g.end.y) / 2 - TAPE_WIDTH / 2 }, { width: length, height: TAPE_WIDTH }, Math.atan2(g.end.y - g.start.y, g.end.x - g.start.x) * 180 / Math.PI);
      }
      commands.finishTransaction(g.moved); clearGesture(); return;
    }
    if (g.kind === 'supply') {
      const p = point(event);
      if (!g.item || p.x < 0 || p.x > 1600 || p.y < 0 || p.y > 1000) { commands.cancelTransaction(); setSelection(null); clearGesture(); return; }
      const colors = PAPER_COLORS.filter(color => color !== g.color);
      setStackColor(colors[Math.floor(Math.random() * colors.length)]);
    }
    if (g.kind === 'pin' && g.mode === 'move' && g.moved) commands.movePin(g.pin.id, point(event), itemAt(event));
    if (g.kind === 'pin' && g.mode === 'connect' && g.moved) {
      const hit = window.document.elementFromPoint(event.clientX, event.clientY);
      const target = hit?.closest<HTMLElement>('[data-pin-id]')?.dataset.pinId;
      if (target) commands.createConnection(g.pin.id, target);
    }
    if (g.kind === 'drag' && !g.moved && g.item.data.type === 'website') {
      const target = window.document.elementFromPoint(event.clientX, event.clientY)?.closest('a');
      if (target) window.open(g.item.data.url, '_blank', 'noopener,noreferrer');
    }
    commands.finishTransaction(g.moved); clearGesture();
  };
  const addNote = (p: Point) => {
    finishEdit(); const id = commands.createItem({ type: 'sticky', text: '', color: '#202120', variant: 'label' }, { x: p.x - 90, y: p.y - 14 }, { width: 180, height: 28 }); startEdit(id);
  };
  const pasteCenter = () => point({ clientX: size.width / 2, clientY: size.height / 2 });
  const pasteImages = async (files: File[]) => {
    for (const [index, file] of files.entries()) {
      const blobUrl = URL.createObjectURL(file), img = new Image(); img.src = blobUrl; let src = blobUrl;
      try {
        await img.decode(); objectUrls.current.push(blobUrl);
        src = persistentImage(img);
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        const width = Math.max(150, Math.min(440, 700 * aspectRatio)), height = Math.max(110, Math.min(950, width / aspectRatio));
        const p = pasteCenter();
        const id = commands.createItem({ type: 'image', src, alt: file.name || 'Pasted photograph', aspectRatio, frame: 'worn', caption: '' }, { x: p.x - width / 2 + index * 20, y: p.y - height / 2 + index * 20 }, { width, height });
        setSelection({ type: 'item', id });
      } catch { URL.revokeObjectURL(blobUrl); setNotice('This image could not be pasted. Try a PNG, JPG, or WebP.'); }
    }
  };
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (dashboardRef.current) return;
      if (((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]') && !((event.target as HTMLTextAreaElement).hasAttribute('data-quick-label') && !(event.target as HTMLTextAreaElement).value)) || gesture.current) return;
      const files = Array.from(event.clipboardData?.items ?? []).filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file);
      if (files.length) { event.preventDefault(); finishEdit(); void pasteImages(files); return; }
      const text = event.clipboardData?.getData('text/plain').trim(); if (!text) return;
      try {
        const url = new URL(text); if (!['http:', 'https:'].includes(url.protocol)) return;
        event.preventDefault(); finishEdit(); const p = pasteCenter(), domain = url.hostname.replace(/^www\./, '');
        const width = 300;
        const height = domain.length > 26 ? 102 : 76;
        const id = commands.createItem({ type: 'website', url: url.href, domain, title: domain, description: '' }, { x: p.x - width / 2, y: p.y - height / 2 }, { width, height }); setSelection({ type: 'item', id });
      } catch { /* Plain text stays in the clipboard until a note is being edited. */ }
    };
    const onKey = (event: KeyboardEvent) => {
      if (dashboardRef.current) return;
      const g = gesture.current;
      if (event.code === 'Space' && g?.kind === 'pin' && g.mode === 'connect' && g.moved) {
        event.preventDefault();
        if (event.repeat) return;
        const cursor = { clientX: pointer.current.x, clientY: pointer.current.y };
        const p = point(cursor), bounds = store.getSnapshot().board;
        if (p.x < 0 || p.y < 0 || p.x > bounds.width || p.y > bounds.height) return;
        const id = commands.placePin(p, g.pin.color, itemAt(cursor));
        commands.createConnection(g.pin.id, id);
        commands.finishTransaction();
        clearGesture();
        setSelection({ type: 'pin', id });
        return;
      }
      if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]') && !((event.target as HTMLTextAreaElement).hasAttribute('data-quick-label') && !(event.target as HTMLTextAreaElement).value)) return;
      const selected = selection?.type === 'item' ? document.items[selection.id] : undefined;
      if (selected?.data.type === 'image' && !editing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.key === 'Enter') { event.preventDefault(); if (!event.repeat) { finishEdit(); cycleFrame(selected); } return; }
        if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) openLightbox(selected); return; }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); travelHistory(event.shiftKey); }
      if (event.key === 'Escape') { setTapeHeld(false); cancelGesture(); setPalette(null); setSelection(null); }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !gesture.current) { event.preventDefault(); removeSelection(); }
    };
    const onBlur = () => { if (gesture.current) cancelGesture(); };
    window.addEventListener('paste', onPaste); window.addEventListener('keydown', onKey); window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('paste', onPaste); window.removeEventListener('keydown', onKey); window.removeEventListener('blur', onBlur); };
  });
  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest('textarea, input')) return;
      event.preventDefault(); if (gesture.current) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
      const nextZoom = clamp(view.zoom * Math.exp(-delta * .002), 1, MAX_ZOOM);
      const nextScale = scale * nextZoom / view.zoom;
      const p = point(event);
      setView({ zoom: nextZoom, ...constrainPan(event.clientX - size.width / 2 - (p.x - 800) * nextScale, event.clientY - size.height / 2 + 40 - (p.y - 500) * nextScale, nextScale) });
      setPalette(null);
    };
    element.addEventListener('wheel', onWheel, { passive: false }); return () => element.removeEventListener('wheel', onWheel);
  });
  const palettePin = palette?.type === 'pin' ? document.pins[palette.id] : null;
  const paletteItem = palette?.type === 'paper' ? document.items[palette.id] : null;
  const palettePoint = palettePin ? pinPosition(palettePin, palettePin.itemId ? document.items[palettePin.itemId] : undefined) : paletteItem ? { x: paletteItem.x + paletteItem.width / 2, y: paletteItem.y + paletteItem.height } : null;
  const isBlank = (target: EventTarget) => target instanceof Element && (target.classList.contains('board') || target.classList.contains('cork-texture'));
  const tapeGeometry = tapePreview ? {
    left: tapePreview.start.x, top: tapePreview.start.y - TAPE_WIDTH / 2,
    width: Math.hypot(tapePreview.end.x - tapePreview.start.x, tapePreview.end.y - tapePreview.start.y), height: TAPE_WIDTH,
    transformOrigin: '0 50%', transform: `rotate(${Math.atan2(tapePreview.end.y - tapePreview.start.y, tapePreview.end.x - tapePreview.start.x) * 180 / Math.PI}deg)`,
  } : undefined;
  const renderItem = (item: BoardItem) => <Item key={item.id} item={item} pinTarget={pinDropTarget === item.id} selected={selection?.type === 'item' && selection.id === item.id} editing={editing === item.id}
            onAddPin={(event, target) => { finishEdit(); const p = localPoint(point(event), target); commands.createPin(target.id, p.x / target.width, p.y / target.height); }}
            cropping={cropping === item.id} boardScale={scale} onCropCancel={() => setCropping(null)}
            onCropApply={patch => { commands.beginTransaction(); commands.updateItem(item.id, patch); commands.finishTransaction(); setCropping(null); }}
            onCrop={() => { finishEdit(); setSelection({ type: 'item', id: item.id }); setCropping(item.id); }}
            onPointerDown={itemDown} onResize={resizeDown} onEdit={() => startEdit(item.id)} onFinishEdit={finishEdit}
            onContextMenu={(event, target) => { event.preventDefault(); finishEdit(); if (target.data.type === 'sticky') setPalette({ type: 'paper', id: target.id }); }}
            onText={text => { if (item.data.type === 'sticky') commands.updateItem(item.id, { data: { ...item.data, text } }); else if (item.data.type === 'image') commands.updateItem(item.id, { data: { ...item.data, caption: text } }); else if (item.data.type === 'website') commands.updateItem(item.id, { data: { ...item.data, title: text } }); }} />;
  return <div className={`app-shell ${tapeHeld ? 'tape-equipped' : ''}`}>
    <main className="workspace" ref={viewport} onDoubleClick={event => { if (event.target === event.currentTarget && !tapeHeld) { finishEdit(); setSelection(null); setPalette(null); setDashboard(true); } }} aria-label="Corkboard. Double-click cork to add a note. Paste images or URLs. Scroll to zoom; drag empty cork to pan."
      onPointerDownCapture={event => {
        if (!tapeHeld || event.button !== 0 || (event.target as Element).closest('.accessory-tray')) return;
        const p = point(event); if (p.x < 0 || p.x > 1600 || p.y < 0 || p.y > 1000) return;
        event.preventDefault(); event.stopPropagation(); finishEdit(); setSelection(null); commands.beginTransaction();
        const start = { x: clamp(p.x, TAPE_WIDTH / 2, 1600 - TAPE_WIDTH / 2), y: clamp(p.y, TAPE_WIDTH / 2, 1000 - TAPE_WIDTH / 2) };
        gesture.current = { kind: 'tape', start, end: start, moved: false }; capture(event);
      }}
      onPointerDown={event => { if (event.target === event.currentTarget) { finishEdit(); setSelection(null); setPalette(null); } }}
      onDoubleClickCapture={event => { if (tapeHeld) { event.preventDefault(); event.stopPropagation(); } }}
      onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()}
      onPointerMove={event => { if (tapeHeld) setTapeCursor({ x: event.clientX, y: event.clientY }); pointerMove(event); }} onPointerUp={pointerUp} onPointerCancel={cancelGesture} onLostPointerCapture={event => { const captured = captureTarget.current; if (gesture.current && captured?.element === event.target && captured.pointerId === event.pointerId) cancelGesture(); }}>
      <div className="board-size" style={{ width: 1600 * scale, height: 1000 * scale, left: size.width / 2 + pan.x, top: size.height / 2 - 40 + pan.y }}>
        <div ref={board} className={`board ${activeGesture ? 'interacting' : ''} ${temporary ? 'connecting' : ''}`} style={{ transform: `scale(${scale})` }}
          onPointerDown={event => {
            if (event.button !== 0 || !isBlank(event.target)) return;
            finishEdit(); setSelection(null); setPalette(null);
            if (view.zoom > 1) { gesture.current = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, pan, moved: false }; capture(event); }
          }}
          onDoubleClick={event => { if (!tapeHeld && isBlank(event.target)) addNote(point(event)); }}
          onClickCapture={event => { if (event.detail !== 0 && (event.target as HTMLElement).closest('a')) event.preventDefault(); }}>
          <canvas ref={canvas} className="cork-texture" aria-hidden="true" />
          <div className="panel-joint" aria-hidden="true" />
          <NoteStack color={stackColor} onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault(); event.stopPropagation(); finishEdit(); setPalette(null); commands.beginTransaction();
            gesture.current = { kind: 'supply', start: point(event), color: stackColor, moved: false }; capture(event);
          }} />
          <PinSupply center={lightingCenter} onDrag={(event, color) => {
            if (event.button !== 0 || gesture.current) return;
            event.preventDefault(); event.stopPropagation(); finishEdit(); setPalette(null); commands.beginTransaction();
            gesture.current = { kind: 'pin-supply', start: point(event), color, moved: false }; capture(event, true);
          }} />
          <div className="items-layer">{Object.values(document.items).filter(item => !(item.data.type === 'sticky' && item.data.variant === 'vellum')).map(renderItem)}</div>
          <div className="vellum-layer">{Object.values(document.items).filter(item => item.data.type === 'sticky' && item.data.variant === 'vellum').map(renderItem)}</div>
          <AccessoryTray held={tapeHeld} onPickUp={event => {
            finishEdit(); cancelGesture(); setSelection(null);
            setTapeCursor({ x: event.clientX, y: event.clientY }); setTapeHeld(held => !held);
          }} />
          {tapeGeometry && <div className="tape-preview" style={tapeGeometry}><Tape /></div>}
          <Ropes document={document} selected={selection?.type === 'rope' ? selection.id : undefined} temporary={temporary} onSelect={id => { finishEdit(); setPalette(null); setSelection({ type: 'rope', id }); }} />
          {pinPreview && <div className="pin-preview"><Pin decorative center={lightingCenter} pin={{ id: 'preview', itemId: null, xRatio: 0, yRatio: 0, color: pinPreview.color }} position={pinPreview.position} moving connecting={false} onPointerDown={() => {}} onPalette={() => {}} /></div>}
          <div className="pins-layer">{Object.values(document.pins).sort((a, b) => (a.itemId ? document.items[a.itemId].zIndex : 0) - (b.itemId ? document.items[b.itemId].zIndex : 0)).map(pin => <Pin key={pin.id} center={lightingCenter} pin={pin} position={pinPosition(pin, pin.itemId ? document.items[pin.itemId] : undefined)} moving={movingPin === pin.id} connecting={!!temporary && temporary.from !== pin.id} onPointerDown={pinDown} onPalette={pin => { finishEdit(); cancelGesture(); setPalette({ type: 'pin', id: pin.id }); }} />)}</div>
        </div>
      </div>
    </main>
    {tapeHeld && <div className="tape-cursor" style={{ left: tapeCursor.x, top: tapeCursor.y, width: 160 * scale, height: 91 * scale, transform: `translate(-50%, -50%) rotate(${tapePreview ? Math.atan2(tapePreview.end.y - tapePreview.start.y, tapePreview.end.x - tapePreview.start.x) * 180 / Math.PI : -12}deg)` }}><TapeRoll /></div>}
    <QuickLabel boardBottom={size.height / 2 - 40 + pan.y + 500 * scale} enabled={!dashboard && !selection && !editing && !palette && !tapeHeld && !activeGesture} onCommit={(text, measured) => {
      const width = measured.width / scale, height = Math.min(measured.height / scale, document.board.height);
      const p = point({ clientX: size.width / 2, clientY: 32 });
      const id = commands.createItem({ type: 'sticky', variant: 'vellum', color: '#ffffff70', text, fontSize: 16 / scale }, { x: p.x - width / 2, y: p.y - 14 }, { width, height }, 0);
      setSelection({ type: 'item', id });
    }} />
    {lightbox && document.items[lightbox.id] && <ImageLightbox item={document.items[lightbox.id]} from={lightbox.from} boardScale={scale} onClose={() => setLightbox(null)} />}
    {selection?.type === 'item' && document.items[selection.id]?.data.type === 'image' && !editing && !dashboard && !lightbox && !tapeHeld &&
      <p className="photo-hint" style={{ top: Math.min(size.height - 24, size.height / 2 - 40 + pan.y + 500 * scale + 12) }}>{cropping
        ? <><b>drag</b> to crop &nbsp;·&nbsp; <b>enter</b> apply &nbsp;·&nbsp; <b>esc</b> cancel &nbsp;·&nbsp; <b>r</b> reset</>
        : <><b>enter</b> frame &nbsp;·&nbsp; <b>space</b> enlarge &nbsp;·&nbsp; <b>double-click</b> crop</>}</p>}
    {dashboard && <Dashboard archives={weeks.archives} conflicts={weeks.conflicts} onResolve={resolveConflict} current={{ ...weeks.current, doc: store.getSnapshot() }} onClose={() => setDashboard(false)} />}
    <div className="board-status"><span className={`sync-${cloudState.status}`} title="Saved in this browser. Each Monday-to-Sunday week is archived automatically; double-click outside the board for the dashboard."><i />{
      cloudState.status === 'syncing' ? 'Syncing…' : cloudState.status === 'idle' ? `Synced${cloudState.user ? ` · ${cloudState.user.email}` : ''}`
      : cloudState.status === 'needs-reconnect' ? 'Sync paused · reconnect in dashboard' : cloudState.status === 'error' ? 'Sync failed' : cloudState.status === 'connecting' ? 'Connecting…' : 'Local only'}</span></div>
    <p className="board-hint"><b>double-click</b> outside the board &nbsp;·&nbsp; dashboard</p>
    {palettePoint && palettePos && <ColorPalette kind={palettePin ? 'pin' : 'paper'} value={palettePin?.color ?? (paletteItem?.data.type === 'sticky' ? paletteItem.data.color : '')}
      x={clamp(palettePos.x, 116, size.width - 116)} y={clamp(palettePos.y + 16, 14, size.height - 64)}
      onChange={color => { if (palettePin) commands.updatePin(palettePin.id, { color }); else if (paletteItem?.data.type === 'sticky') commands.updateItem(paletteItem.id, { data: { ...paletteItem.data, color } }); setPalette(null); }} />}
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>;
}
