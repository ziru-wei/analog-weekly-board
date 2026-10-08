import { removeLaterSilverPins } from './carryForward';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { BOARD_CLIPBOARD_TYPE, encodeBoardGroup, readBoardGroup } from './boardClipboard';
import { measureLabel, toggleLabel } from './labelLayout';
import { youtubeVideo } from './youtube';
import { bilibiliVideo } from './bilibili';
import { socialPost, websiteCardSize, toggleWebsiteCard } from './socialEmbed';
import { websitePaste } from './websitePaste';
import { useCanvasReady } from './useCanvasReady';
import { useBoardView } from './useBoardView';
import { useBoardSound } from './useBoardSound';
import { boardCenter, wheelPixels } from './boardView';
import { SyncStatus } from './components/SyncStatus';
import { Dashboard } from './components/Dashboard';
import { ImageLightbox } from './components/ImageLightbox';
import { type WeekState, DASHBOARD_OPEN_KEY, acknowledgeUpload, activeBoard, addBoard, deleteBoard, newRev, openBoard, resolveBoardConflict, rollover, saveWeekState } from './weeks';
import { writeBoard, writeKv } from './storage';
import { onRetire, useRetired } from './singleTab';
import { cloud, useCloud } from './cloud/sync';
import { type BoardItem, type Pin as PinModel, type Point, clamp, localPoint, photoMargins, pinPosition, pinConnectionTarget } from './model';
import { createDocumentStore, useDocument } from './store';
import { renderCork } from './texture';
import { QuickLabel } from './components/QuickLabel';
import { Item } from './components/Item';
import { Pin } from './components/Pin';
import { ColorPalette, PAPER_COLORS } from './components/ColorPalette';
import { PinSupply } from './components/PinSupply';
import { SilverPins } from './components/SilverPins';
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
export function initApp(week: WeekState) { initialWeek = week; store = createDocumentStore(activeBoard(week).doc); commands = store.commands; }
const HOLD_MS = 480;
type Selection = { type: 'item' | 'pin' | 'rope'; id: string; ids?: string[]; pinIds?: string[] } | null;
type Gesture =
  | { kind: 'drag' | 'resize'; start: Point; item: BoardItem; moved: boolean; side?: 'left' | 'right'; duplicate?: boolean; items?: BoardItem[] }
  | { kind: 'pin'; start: Point; pin: PinModel; mode: 'pending' | 'connect' | 'move'; moved: boolean; target?: string }
  | { kind: 'tape'; start: Point; end: Point; moved: boolean; sounded?: boolean }
  | { kind: 'pin-supply'; start: Point; color: string; pinKind?: PinModel['kind']; moved: boolean }
  | { kind: 'supply'; start: Point; color: string; item?: BoardItem; moved: boolean }
  | { kind: 'pan'; start: Point; pan: Point; moved: boolean };
type Palette = { type: 'pin' | 'paper'; id: string } | null;
export default function App() {
  const document = useDocument(store);
  const { sound, enabled: soundEnabled, toggle: toggleSound } = useBoardSound();
  const canvasReady = useCanvasReady();
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
  const [, setWeeks] = useState<WeekState>(initialWeek);
  const cloudState = useCloud();
  const [dashboard, setDashboard] = useState(false);
  const retired = useRetired();
  useEffect(() => { void writeKv(DASHBOARD_OPEN_KEY, dashboard).catch(() => {}); }, [dashboard]);
  const [lightbox, setLightbox] = useState<{ id: string; from: Point } | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const weeksRef = useRef(initialWeek);
  const dashboardRef = useRef(false); dashboardRef.current = dashboard || !!lightbox || !!cropping; // any full-screen layer owns the keyboard
  const replacing = useRef(false);
  const liveState = (): WeekState => {
    const w = weeksRef.current, doc = store.getSnapshot();
    return activeBoard(w).doc === doc ? w : { ...w, boards: w.boards.map(b => b.id === w.activeId ? { ...b, doc } : b) };
  };
  // Adopt a new state; when the open board changed (another board opened, a new week, or newer data from another device), load it.
  const commit = (next: WeekState) => {
    const replaceBoard = activeBoard(next).doc !== store.getSnapshot();
    weeksRef.current = next; setWeeks(next);
    if (replaceBoard) { replacing.current = true; store.commands.load(activeBoard(next).doc); replacing.current = false; setSelection(null); setEditing(null); setPalette(null); setCropping(null); setLightbox(null); }
    void saveWeekState(next);
  };
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => { void writeBoard(activeBoard(liveState())); };
    const unsubscribe = store.subscribe(() => {
      if (replacing.current) return;
      const doc = store.getSnapshot(), w = weeksRef.current;
      if (doc === activeBoard(w).doc) return;
      weeksRef.current = { ...w, boards: w.boards.map(b => b.id === w.activeId ? { ...b, doc, updatedAt: Date.now(), rev: newRev() } : b) };
      clearTimeout(timer); timer = setTimeout(flush, 400); cloud.changed();
    });
    cloud.attach({
      getState: liveState,
      apply: commit,
      markSynced: uploaded => {
        weeksRef.current = acknowledgeUpload(liveState(), uploaded);
        const board = weeksRef.current.boards.find(b => b.id === uploaded.id); if (board) void writeBoard(board);
      },
    });
    void cloud.resume();
    onRetire(async () => { cloud.detach(); clearTimeout(timer); await saveWeekState(liveState()); });
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
  // Resolve a divergent version in place, keeping exactly one version of its board.
  const resolveConflict = (id: string, action: 'restore' | 'discard') => {
    const w = liveState(); if (!w.conflicts.some(c => c.id === id)) return;
    commit(resolveBoardConflict(w, id, action));
    void cloud.discardConflict(id); cloud.changed();
  };
  const changeBoards = (next: WeekState, synced = true) => { if (next !== weeksRef.current) { commit(next); if (synced) cloud.changed(); } };
  // Pull other devices' changes when the tab regains focus, and every few minutes while it stays open.
  useEffect(() => {
    const pull = () => { if (!window.document.hidden) void cloud.syncNow(); };
    const timer = setInterval(pull, 120_000);
    window.document.addEventListener('visibilitychange', pull);
    return () => { clearInterval(timer); window.document.removeEventListener('visibilitychange', pull); };
  }, []);
  // When a new week begins, its fresh board is opened; earlier boards stay in the Dashboard.
  useEffect(() => {
    const check = () => {
      const live = liveState(), next = rollover(live);
      if (next === live) return;
      commit(next); cloud.changed();
    };
    const timer = setInterval(check, 30_000);
    window.document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); window.document.removeEventListener('visibilitychange', check); };
  }, []);
  const pointer = useRef({ x: 0, y: 0 });
  const doubleClickStartedOnPin = useRef(false);
  const doubleClickStartedOutside = useRef(false);
  const doubleClickItemId = useRef<string | null>(null);
  const doubleClickStartedOnBlank = useRef(false);
  const doubleClickPinId = useRef<string | null>(null);
  useEffect(() => {
    const track = (event: MouseEvent) => { pointer.current = { x: event.clientX, y: event.clientY }; };
    for (const type of ['pointermove', 'pointerdown', 'contextmenu']) window.addEventListener(type, track as EventListener, true);
    return () => { for (const type of ['pointermove', 'pointerdown', 'contextmenu']) window.removeEventListener(type, track as EventListener, true); };
  }, []);
  // The palette opens next to the cursor that summoned it.
  const palettePos = useMemo(() => (palette ? { ...pointer.current } : null), [palette]);
  const [pinPreview, setPinPreview] = useState<{ position: Point; color: string; kind?: PinModel['kind'] } | null>(null);
  const [pinDropTarget, setPinDropTarget] = useState<string | null>(null);
  const [movingPin, setMovingPin] = useState<string | null>(null);
  const [temporary, setTemporary] = useState<{ from: string; to: Point; target?: string } | null>(null);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const { view, scale, pan, panning, setPan, onPan, onZoom, stopZoom, startPinch, changePinch, endPinch } = useBoardView(size);
  const center = boardCenter(size);
  const [stackColor, setStackColor] = useState(() => PAPER_COLORS[Math.floor(Math.random() * PAPER_COLORS.length)]);
  const [notice, setNotice] = useState('');
  const [activeGesture, setActiveGesture] = useState(false);
  useLayoutEffect(() => {
    const clip = window.document.querySelector('.note-stack-clip img');
    const update = () => {
      if (!clip || !board.current) return;
      const r = clip.getBoundingClientRect(), b = board.current.getBoundingClientRect();
      const boardScale = b.width / 1600;
      commands.setClipBounds({ left: (r.left - b.left) / boardScale, right: (r.right - b.left) / boardScale, top: (r.top - b.top) / boardScale, bottom: (r.bottom - b.top) / boardScale });
    };
    update(); const observer = new ResizeObserver(update); if (clip) observer.observe(clip);
    return () => observer.disconnect();
  }, []);
  const lightingCenter = { x: 800 - pan.x / scale, y: 500 + (size.height / 2 - center.y - pan.y) / scale };
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
  const connectPins = (from: string, to: string, cue: 'tie' | 'pin' = 'tie') => {
    commands.createConnection(from, to);
    sound.play(cue);
  };
  const finishEdit = () => { if (editing) commands.finishTransaction(); setEditing(null); };
  const cancelGesture = () => { const g = gesture.current; if (g?.kind === 'pan') setPan(g.pan); commands.cancelTransaction(); clearGesture(); setPalette(null); };
  const maybeStopLaterCarry = (removed: PinModel[]) => {
    const live = liveState(), next = removeLaterSilverPins(live, live.activeId, removed);
    if (next !== live && window.confirm('Later weeks still have silver pins on this item. Also remove those pins to stop it carrying forward? Existing items will be kept.')) changeBoards(next);
  };
  const removedSilverPins = (before: typeof document, after: typeof document) => Object.values(before.pins).filter(pin =>
    pin.kind === 'silver' && pin.itemId && after.pins[pin.id]?.itemId !== pin.itemId);
  const travelHistory = (redo: boolean) => {
    finishEdit(); cancelGesture(); const before = store.getSnapshot();
    if (redo) commands.redo(); else commands.undo();
    maybeStopLaterCarry(removedSilverPins(before, store.getSnapshot())); setSelection(null);
  };
  const removeSelection = () => {
    if (!selection) return;
    const before = store.getSnapshot();
    if (selection.type === 'item') { commands.beginTransaction(); for (const id of selection.ids ?? [selection.id]) commands.deleteItem(id); for (const id of selection.pinIds ?? []) if (store.getSnapshot().pins[id]) commands.deletePin(id); commands.finishTransaction(); }
    else if (selection.type === 'pin') commands.deletePin(selection.id);
    else commands.deleteConnection(selection.id);
    maybeStopLaterCarry(removedSilverPins(before, store.getSnapshot()));
    setSelection(null); setPalette(null);
  };
  const point = (event: { clientX: number; clientY: number }): Point => {
    const rect = board.current!.getBoundingClientRect(); return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };
  const itemAt = (event: { clientX: number; clientY: number }) => window.document.elementsFromPoint(event.clientX, event.clientY)
    .map(element => element.closest<HTMLElement>('[data-item-id]')?.dataset.itemId).find(Boolean);
  const capture = (event: ReactPointerEvent) => {
    // Pins can change DOM order, and active embeds become inert during dragging.
    // Capture on the workspace so those changes cannot interrupt the gesture.
    const element = viewport.current!;
    element.setPointerCapture(event.pointerId); captureTarget.current = { element, pointerId: event.pointerId }; setActiveGesture(true);
  };
  const selectItem = (id: string) => {
    setSelection({ type: 'item', id });
    commands.updateItem(id, { zIndex: Math.max(0, ...Object.values(store.getSnapshot().items).map(item => item.zIndex)) + 1 });
  };
  const startEdit = (id: string) => { finishEdit(); commands.beginTransaction(); selectItem(id); setEditing(id); setPalette(null); };
  const itemDown = (event: ReactPointerEvent, item: BoardItem) => {
    if (event.button !== 0 || editing === item.id) return;
    event.preventDefault(); event.stopPropagation(); finishEdit(); setPalette(null);
    const currentIds = selection?.type === 'item' ? selection.ids ?? [selection.id] : [];
    if (event.shiftKey) {
      const ids = currentIds.includes(item.id) ? currentIds.filter(id => id !== item.id) : [...currentIds, item.id];
      if (ids.includes(item.id)) { commands.beginTransaction(); commands.updateItem(item.id, { zIndex: Math.max(0, ...Object.values(store.getSnapshot().items).map(target => target.zIndex)) + 1 }); commands.finishTransaction(false); }
      setSelection(ids.length ? { type: 'item', id: ids[ids.length - 1], ids } : null); return;
    }
    commands.beginTransaction();
    const ids = currentIds.includes(item.id) ? currentIds : [item.id];
    setSelection({ type: 'item', id: item.id, ids });
    commands.updateItem(item.id, { zIndex: Math.max(0, ...Object.values(store.getSnapshot().items).map(target => target.zIndex)) + 1 });
    const items = ids.map(id => store.getSnapshot().items[id]).filter(Boolean);
    gesture.current = { kind: 'drag', start: point(event), item, items, moved: false, duplicate: event.altKey }; capture(event);
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
    gesture.current = g; capture(event);
    holdTimer.current = setTimeout(() => {
      if (gesture.current !== g || g.moved) return;
      g.mode = 'move'; setMovingPin(pin.id);
    }, HOLD_MS);
  };
  const pointerMove = (event: ReactPointerEvent) => {
    const g = gesture.current; if (!g) return;
    if (captureTarget.current && event.pointerId !== captureTarget.current.pointerId) return;
    if (g.kind === 'pin-supply') {
      const p = point(event);
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) * scale > 5) g.moved = true;
      if (g.moved) { setPinPreview({ position: p, color: g.color, kind: g.pinKind }); setPinDropTarget(itemAt(event) ?? null); }
      return;
    }
    if (g.kind === 'tape') {
      const p = point(event);
      g.end = { x: clamp(p.x, TAPE_WIDTH / 2, 1600 - TAPE_WIDTH / 2), y: clamp(p.y, TAPE_WIDTH / 2, 1000 - TAPE_WIDTH / 2) };
      g.moved = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y) > 8;
      if (g.moved && !g.sounded) { sound.play('tape'); g.sounded = true; }
      setTapePreview({ start: g.start, end: g.end }); return;
    }
    if (g.kind === 'pan') {
      const dx = event.clientX - g.start.x, dy = event.clientY - g.start.y;
      if (Math.hypot(dx, dy) > 5) g.moved = true;
      setPan({ x: g.pan.x + dx, y: g.pan.y + dy }); return;
    }
    const p = point(event), dx = p.x - g.start.x, dy = p.y - g.start.y;
    if (Math.hypot(dx, dy) * scale > 5) g.moved = true;
    if (!g.moved) return;
    clearHold();
    if (g.kind === 'drag' && g.duplicate) {
      const snapshot = store.getSnapshot();
      const sources = g.items ?? [g.item];
      const ids = commands.duplicateItems(sources, Object.values(snapshot.pins), snapshot.connections, { x: 0, y: 0 });
      g.items = ids.map(id => store.getSnapshot().items[id]);
      g.item = g.items[0]; g.duplicate = false;
      sound.play('paper');
      setSelection({ type: 'item', id: ids[0], ids });
    }
    if (g.kind === 'supply') {
      if (!g.item) {
        const id = commands.createItem({ type: 'sticky', text: '', color: g.color }, NOTE_STACK_POSITION);
        g.item = store.getSnapshot().items[id]; setSelection({ type: 'item', id });
        sound.play('paper');
      }
      commands.updateItem(g.item.id, { x: NOTE_STACK_POSITION.x + dx, y: NOTE_STACK_POSITION.y + dy });
    } else if (g.kind === 'drag') { commands.moveItems(g.items ?? [g.item], { x: dx, y: dy }); }
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
      let width = clamp(g.item.width + dx * Math.cos(angle) + dy * Math.sin(angle), label ? 50 : 150, 1550);
      let height = clamp(g.item.height - dx * Math.sin(angle) + dy * Math.cos(angle), label ? 26 : 110, 950);
      if (g.item.data.type === 'image' && !event.shiftKey) { const { x: edgeX, y: edgeY } = photoMargins(g.item.data.frame); width = Math.min(width, (950 - edgeY) * g.item.data.aspectRatio + edgeX); height = (width - edgeX) / g.item.data.aspectRatio + edgeY; }
      if (g.item.data.type === 'website') { width = Math.max(150, width); height = Math.max(76, g.item.height - dx * Math.sin(angle) + dy * Math.cos(angle)); }
      if (g.item.data.type === 'sticky' && label) {
        const data = { ...g.item.data, labelWidth: width };
        commands.updateItem(g.item.id, { width, height: Math.max(height, measureLabel(data, document.board).height), data });
      } else commands.updateItem(g.item.id, { width, height });
    } else if (g.kind === 'pin') {
      setPalette(null);
      if (g.mode === 'pending') {
        g.mode = 'connect';
      }
      if (g.mode === 'move') {
        const target = itemAt(event);
        setPinDropTarget(target ?? null);
        commands.movePin(g.pin.id, p, target);
      } else {
        const target = pinConnectionTarget(store.getSnapshot(), g.pin.id, p, scale, g.target);
        if (target && target.id !== g.target) sound.play('snap');
        g.target = target?.id;
        setTemporary({ from: g.pin.id, to: target?.position ?? p, target: target?.id });
      }
    }
  };
  const pointerUp = (event: ReactPointerEvent) => {
    const g = gesture.current; if (!g) return;
    // A fast release can arrive before a move event; apply its final position first.
    if (captureTarget.current && event.pointerId !== captureTarget.current.pointerId) return;
    pointerMove(event);
    if (g.kind === 'pin-supply') {
      const p = point(event);
      if (g.moved && p.x >= 0 && p.y >= 0 && p.x <= 1600 && p.y <= 1000) {
        const id = commands.placePin(p, g.color, itemAt(event), g.pinKind); setSelection({ type: 'pin', id }); commands.finishTransaction();
        sound.play('pin');
      } else commands.cancelTransaction();
      clearGesture(); return;
    }
    if (g.kind === 'tape') {
      if (g.moved) {
        const length = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);
        commands.createItem({ type: 'tape' }, { x: (g.start.x + g.end.x) / 2 - length / 2, y: (g.start.y + g.end.y) / 2 - TAPE_WIDTH / 2 }, { width: length, height: TAPE_WIDTH }, Math.atan2(g.end.y - g.start.y, g.end.x - g.start.x) * 180 / Math.PI);
        sound.play('tear');
      }
      commands.finishTransaction(g.moved); clearGesture(); return;
    }
    if (g.kind === 'supply') {
      const p = point(event);
      if (!g.item || p.x < 0 || p.x > 1600 || p.y < 0 || p.y > 1000) { commands.cancelTransaction(); setSelection(null); clearGesture(); return; }
      const colors = PAPER_COLORS.filter(color => color !== g.color);
      setStackColor(colors[Math.floor(Math.random() * colors.length)]);
    }
    if (g.kind === 'pin' && g.mode === 'move' && g.moved) { commands.movePin(g.pin.id, point(event), itemAt(event)); sound.play('pin'); }
    if (g.kind === 'pin' && g.mode === 'connect' && g.moved) {
      const target = pinConnectionTarget(store.getSnapshot(), g.pin.id, point(event), scale, g.target);
      if (target) connectPins(g.pin.id, target.id);
      else { sound.play('retract'); }
    }
    if (g.kind === 'drag' && (g.items?.length ?? 1) === 1 && !g.duplicate && !g.moved && g.item.data.type === 'website') {
      const target = window.document.elementFromPoint(event.clientX, event.clientY)?.closest('a');
      if (target) window.open(g.item.data.url, '_blank', 'noopener,noreferrer');
    }
    if (g.moved && (g.kind === 'drag' || g.kind === 'supply')) sound.play('place');
    const detachedSilver = g.kind === 'pin' && g.mode === 'move' && g.moved && g.pin.kind === 'silver' && g.pin.itemId && store.getSnapshot().pins[g.pin.id]?.itemId !== g.pin.itemId ? g.pin : null;
    if (detachedSilver) commands.updatePin(detachedSilver.id, { carryId: crypto.randomUUID() });
    commands.finishTransaction(g.moved); clearGesture();
    if (detachedSilver) maybeStopLaterCarry([detachedSilver]);
  };
  const addNote = (p: Point) => {
    finishEdit(); const id = commands.createItem({ type: 'sticky', text: '', color: '#202120', variant: 'label' }, { x: p.x - 90, y: p.y - 14 }, { width: 180, height: 28 }); startEdit(id); sound.play('label');
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
        sound.play('paper');
        setSelection({ type: 'item', id });
      } catch { URL.revokeObjectURL(blobUrl); setNotice('This image could not be pasted. Try a PNG, JPG, or WebP.'); }
    }
  };

  useEffect(() => {
    const onCopy = (event: ClipboardEvent) => {
      if (dashboardRef.current || editing || gesture.current || selection?.type !== 'item' || !event.clipboardData) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"]') && !(target.hasAttribute('data-quick-label') && !(target as HTMLTextAreaElement).value)) return;
      const snapshot = store.getSnapshot();
      const items = (selection.ids ?? [selection.id]).map(id => snapshot.items[id]).filter(Boolean);
      const pinIds = new Set([...items.flatMap(item => item.pins), ...(selection.pinIds ?? [])]);
      if (!items.length && !pinIds.size) return;
      const pins = Object.values(snapshot.pins).filter(pin => pinIds.has(pin.id));
      const connections = Object.fromEntries(Object.entries(snapshot.connections).filter(([, c]) => pinIds.has(c.fromPinId) && pinIds.has(c.toPinId)));
      const encoded = encodeBoardGroup(items, pins, connections);
      event.clipboardData.setData(BOARD_CLIPBOARD_TYPE, encoded);
      event.clipboardData.setData('text/plain', encoded);
      event.preventDefault();
    };
    const onPaste = (event: ClipboardEvent) => {
      if (dashboardRef.current) return;
      if (((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]') && !((event.target as HTMLTextAreaElement).hasAttribute('data-quick-label') && !(event.target as HTMLTextAreaElement).value)) || gesture.current) return;
      const copied = readBoardGroup(event.clipboardData?.getData(BOARD_CLIPBOARD_TYPE) || event.clipboardData?.getData('text/plain') || '');
      if (copied) {
        event.preventDefault(); finishEdit();
        const beforePins = new Set(Object.keys(store.getSnapshot().pins));
        const ids = commands.duplicateItems(copied.items, copied.pins, copied.connections, { x: 0, y: 0 }, true);
        const pinIds = Object.keys(store.getSnapshot().pins).filter(id => !beforePins.has(id));
        sound.play('paper');
        setSelection({ type: 'item', id: ids[0] ?? '', ids, pinIds }); return;
      }
      const files = Array.from(event.clipboardData?.items ?? []).filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file);
      if (files.length) { event.preventDefault(); finishEdit(); void pasteImages(files); return; }
      const text = event.clipboardData?.getData('text/plain').trim(); if (!text) return;
      try {
        const pasted = websitePaste(text); if (!pasted) return;
        const url = new URL(pasted.url);
        event.preventDefault(); finishEdit(); const p = pasteCenter(), domain = url.hostname.replace(/^www\./, '');
        const video = youtubeVideo(url.href);
        const { width, height } = websiteCardSize(url.href);
        const id = commands.createItem({ type: 'website', url: url.href, domain, title: pasted.title || (video ? 'YouTube video' : bilibiliVideo(url.href) ? 'Bilibili video' : socialPost(url.href)?.label ?? domain), description: '' }, { x: p.x - width / 2, y: p.y - height / 2 }, { width, height }); setSelection({ type: 'item', id });
        sound.play('paper');
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
        const target = pinConnectionTarget(store.getSnapshot(), g.pin.id, p, scale, g.target);
        const id = target?.id ?? commands.placePin(p, g.pin.color, itemAt(cursor));
        connectPins(g.pin.id, id, target ? 'tie' : 'pin');
        commands.finishTransaction();
        clearGesture();
        setSelection({ type: 'pin', id });
        return;
      }
      if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]') && !((event.target as HTMLTextAreaElement).hasAttribute('data-quick-label') && !(event.target as HTMLTextAreaElement).value)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && !event.altKey && !gesture.current && !editing) {
        event.preventDefault();
        const snapshot = store.getSnapshot(), ids = Object.keys(snapshot.items), pinIds = Object.keys(snapshot.pins);
        setPalette(null); setTapeHeld(false);
        setSelection(ids.length || pinIds.length ? { type: 'item', id: ids[0] ?? '', ids, pinIds } : null);
        return;
      }
      const selected = selection?.type === 'item' && !selection.pinIds && (selection.ids?.length ?? 1) === 1 ? document.items[selection.id] : undefined;
      if (selected?.data.type === 'sticky' && selected.data.variant && !editing && !gesture.current && event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        if (!event.repeat) { const patch = toggleLabel(selected); if (patch) { commands.updateItem(selected.id, patch); if (patch.data?.type === 'sticky' && patch.data.variant === 'label') sound.play('label'); } }
        return;
      }
      if (selected?.data.type === 'website' && !editing && !gesture.current && event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        if (!event.repeat) { const patch = toggleWebsiteCard(selected); if (patch) commands.updateItem(selected.id, patch); }
        return;
      }
      if (selected?.data.type === 'image' && !editing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.key === 'Enter') { event.preventDefault(); if (!event.repeat) { finishEdit(); cycleFrame(selected); } return; }
        if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) openLightbox(selected); return; }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); travelHistory(event.shiftKey); }
      if (event.key === 'Escape') { if (g?.kind === 'pin' && g.mode === 'connect' && g.moved) { sound.play('retract'); } setTapeHeld(false); cancelGesture(); setPalette(null); setSelection(null); }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !gesture.current) { event.preventDefault(); removeSelection(); }
    };
    // A focused rope or button must not consume Space while a pin is being connected.
    const onGestureKey = (event: KeyboardEvent) => {
      const g = gesture.current;
      if (event.code === 'Space' && g?.kind === 'pin' && g.mode === 'connect' && g.moved) { onKey(event); event.stopPropagation(); }
    };
    const onBlur = () => { if (gesture.current) cancelGesture(); };
    window.addEventListener('keydown', onGestureKey, true);
    window.addEventListener('copy', onCopy); window.addEventListener('paste', onPaste); window.addEventListener('keydown', onKey); window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('keydown', onGestureKey, true); window.removeEventListener('copy', onCopy); window.removeEventListener('paste', onPaste); window.removeEventListener('keydown', onKey); window.removeEventListener('blur', onBlur); };
  });
  useEffect(() => {
    const element = viewport.current; if (!element) return;
    // Safari exposes native GestureEvents; suppress wheel duplicates while one
    // of those gestures is active. Chromium and Firefox use Ctrl-wheel.
    let nativePinch = false;
    type NativeGesture = Event & { scale: number; clientX: number; clientY: number };
    const cursor = (event: { clientX: number; clientY: number }) => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey && (event.target as Element).closest('textarea, input')) return;
      if ((event.target as Element).closest('.youtube-player:not([inert]), .bilibili-player:not([inert]), .social-embed:not([inert])')) return;
      event.preventDefault(); if (gesture.current || nativePinch) return;
      if (event.ctrlKey || event.metaKey) {
        onZoom(wheelPixels(event.deltaY, event.deltaMode, element.clientHeight), cursor(event), event.ctrlKey ? 'pinch' : 'wheel');
      } else {
        const x = wheelPixels(event.deltaX, event.deltaMode, element.clientWidth);
        const y = wheelPixels(event.deltaY, event.deltaMode, element.clientHeight);
        onPan(event.shiftKey && !x ? { x: y, y: 0 } : { x, y });
      }
      setPalette(null);
    };
    const onGestureStart = (event: Event) => {
      event.preventDefault(); if (gesture.current) return;
      nativePinch = true;
      startPinch(cursor(event as NativeGesture));
      setPalette(null);
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault(); if (!nativePinch || gesture.current) return;
      const native = event as NativeGesture;
      changePinch(native.scale, cursor(native));
    };
    const onGestureEnd = (event: Event) => {
      onGestureChange(event);
      nativePinch = false;
      endPinch();
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('gesturestart', onGestureStart, { passive: false });
    element.addEventListener('gesturechange', onGestureChange, { passive: false });
    element.addEventListener('gestureend', onGestureEnd, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('gesturestart', onGestureStart);
      element.removeEventListener('gesturechange', onGestureChange);
      element.removeEventListener('gestureend', onGestureEnd);
    };
  }, [onPan, onZoom, startPinch, changePinch, endPinch]);
  const palettePin = palette?.type === 'pin' ? document.pins[palette.id] : null;
  const paletteItem = palette?.type === 'paper' ? document.items[palette.id] : null;
  const palettePoint = palettePin ? pinPosition(palettePin, palettePin.itemId ? document.items[palettePin.itemId] : undefined) : paletteItem ? { x: paletteItem.x + paletteItem.width / 2, y: paletteItem.y + paletteItem.height } : null;
  const isBlank = (target: EventTarget) => target instanceof Element && (target.classList.contains('board') || target.classList.contains('cork-texture'));
  const tapeGeometry = tapePreview ? {
    left: tapePreview.start.x, top: tapePreview.start.y - TAPE_WIDTH / 2,
    width: Math.hypot(tapePreview.end.x - tapePreview.start.x, tapePreview.end.y - tapePreview.start.y), height: TAPE_WIDTH,
    transformOrigin: '0 50%', transform: `rotate(${Math.atan2(tapePreview.end.y - tapePreview.start.y, tapePreview.end.x - tapePreview.start.x) * 180 / Math.PI}deg)`,
  } : undefined;
  const renderItem = (item: BoardItem) => <Item key={item.id} item={item} pinTarget={pinDropTarget === item.id} selected={selection?.type === 'item' && (selection.ids ?? [selection.id]).includes(item.id)} editing={editing === item.id}
            webInteractive={selection?.type === 'item' && selection.id === item.id && !selection.pinIds && (selection.ids?.length ?? 1) === 1 && !activeGesture && !panning}
            onAddPin={(event, target) => { finishEdit(); const p = localPoint(point(event), target); commands.createPin(target.id, p.x / target.width, p.y / target.height); sound.play('pin'); }}
            cropping={cropping === item.id} boardScale={scale} onCropCancel={() => setCropping(null)}
            onCropApply={patch => { commands.beginTransaction(); commands.updateItem(item.id, patch); commands.finishTransaction(); setCropping(null); }}
            onCrop={() => { finishEdit(); setSelection({ type: 'item', id: item.id }); setCropping(item.id); }}
            onPointerDown={itemDown} onResize={resizeDown} onEdit={() => startEdit(item.id)} onFinishEdit={finishEdit}
            onWebsiteMinHeight={height => { if (gesture.current?.kind === 'resize') return; const current = store.getSnapshot().items[item.id]; const needed = Math.min(970, Math.ceil(height)); if (current && needed > current.height) commands.updateItem(item.id, { height: needed }); }}
            onWebsitePreview={preview => {
              const current = store.getSnapshot().items[item.id]; if (current?.data.type !== 'website') return;
              const data = current.data;
              const automatic = !data.title || data.title === data.domain || ['YouTube video', 'Bilibili video', socialPost(data.url)?.label].includes(data.title);
              const next = { ...data, title: automatic && preview.title ? preview.title : data.title, description: preview.media ? preview.description : data.description || preview.description, image: preview.media ? preview.image : data.image || preview.image, media: preview.media ?? data.media };
              if (next.title !== data.title || next.description !== data.description || next.image !== data.image || JSON.stringify(next.media) !== JSON.stringify(data.media)) commands.updateItem(item.id, { data: next });
            }}
            onContextMenu={(event, target) => { event.preventDefault(); finishEdit(); setPalette(target.data.type === 'sticky' && !target.data.variant ? { type: 'paper', id: target.id } : null); }}
            onText={text => { if (item.data.type === 'sticky') { const data = { ...item.data, text }; commands.updateItem(item.id, { data, ...(data.variant ? measureLabel(data, document.board) : {}) }); } else if (item.data.type === 'image') commands.updateItem(item.id, { data: { ...item.data, caption: text } }); else if (item.data.type === 'website') commands.updateItem(item.id, { data: { ...item.data, title: text } }); }} />;
  const hintItem = selection?.type === 'item' && !selection.pinIds && (selection.ids?.length ?? 1) === 1 ? document.items[selection.id] : undefined;
  return <div className={`app-shell ${tapeHeld ? 'tape-equipped' : ''} ${canvasReady ? '' : 'canvas-loading'}`} aria-busy={!canvasReady}>
    {!canvasReady && <div className="canvas-loader" role="status" aria-label="Loading board"><span className="loading-spinner" /></div>}
    <main className="workspace" ref={viewport} onDoubleClick={event => { if (event.target === event.currentTarget && doubleClickStartedOutside.current && !tapeHeld) { const rect = board.current?.getBoundingClientRect(); if (rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) return; finishEdit(); setSelection(null); setPalette(null); setDashboard(true); } }} aria-label="Corkboard. Double-click cork to add a note. Paste images or URLs. Pinch or Ctrl/Cmd-scroll to zoom; scroll or drag empty space to pan."
      onPointerDownCapture={event => {
        const rect = board.current?.getBoundingClientRect();
        const onBoard = rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        doubleClickStartedOutside.current = event.target === event.currentTarget && !onBoard;
        doubleClickItemId.current = (event.target as Element).closest<HTMLElement>('[data-item-id]')?.dataset.itemId ?? null;
        doubleClickStartedOnBlank.current = isBlank(event.target);
        const pinTarget = (event.target as Element).closest<HTMLElement>('.pin');
        doubleClickStartedOnPin.current = !!pinTarget;
        doubleClickPinId.current = pinTarget?.dataset.pinId ?? null;
        stopZoom();
        if (!tapeHeld || event.button !== 0 || (event.target as Element).closest('.accessory-tray')) return;
        const p = point(event); if (p.x < 0 || p.x > 1600 || p.y < 0 || p.y > 1000) return;
        event.preventDefault(); event.stopPropagation(); finishEdit(); setSelection(null); commands.beginTransaction();
        const start = { x: clamp(p.x, TAPE_WIDTH / 2, 1600 - TAPE_WIDTH / 2), y: clamp(p.y, TAPE_WIDTH / 2, 1000 - TAPE_WIDTH / 2) };
        gesture.current = { kind: 'tape', start, end: start, moved: false }; capture(event);
      }}
      onPointerDown={event => {
        if (event.button !== 0 || event.target !== event.currentTarget) return;
        finishEdit(); setSelection(null); setPalette(null);
        if (view.zoom > 1 && !tapeHeld) { gesture.current = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, pan, moved: false }; capture(event); }
      }}
      onDoubleClickCapture={event => {
        if (tapeHeld || doubleClickStartedOnPin.current || (event.target as Element).closest('.pin')) {
          event.preventDefault(); event.stopPropagation();
          const id = doubleClickPinId.current, pin = id ? store.getSnapshot().pins[id] : undefined;
          if (!tapeHeld && pin) { commands.deletePin(pin.id); maybeStopLaterCarry([pin]); setSelection(null); setPalette(null); }
        } else if (event.target === event.currentTarget && !doubleClickStartedOutside.current) {
          // Stable pointer capture retargets double-clicks; keep their original board action.
          event.preventDefault(); event.stopPropagation();
          const item = doubleClickItemId.current ? store.getSnapshot().items[doubleClickItemId.current] : undefined;
          if (item && event.shiftKey) {
            finishEdit(); const p = localPoint(point(event), item); commands.createPin(item.id, p.x / item.width, p.y / item.height); sound.play('pin');
          } else if (item?.data.type === 'sticky' || item?.data.type === 'website') startEdit(item.id);
          else if (item?.data.type === 'image' && cropping !== item.id) { finishEdit(); setSelection({ type: 'item', id: item.id }); setCropping(item.id); }
          else if (!item && doubleClickStartedOnBlank.current) addNote(point(event));
        }
      }}
      onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()}
      onPointerMove={event => { if (tapeHeld) setTapeCursor({ x: event.clientX, y: event.clientY }); pointerMove(event); }} onPointerUp={pointerUp} onPointerCancel={cancelGesture} onLostPointerCapture={event => { const captured = captureTarget.current; if (gesture.current && captured?.element === event.target && captured.pointerId === event.pointerId) cancelGesture(); }}>
      <div className="board-size" style={{ top: center.y, transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})` }}>
        <div ref={board} className={`board ${activeGesture ? 'interacting' : ''} ${temporary ? 'connecting' : ''}`}
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
          <PinSupply center={lightingCenter} onDrag={(event, color, pinKind) => {
            if (event.button !== 0 || gesture.current) return;
            event.preventDefault(); event.stopPropagation(); finishEdit(); setPalette(null); commands.beginTransaction();
            gesture.current = { kind: 'pin-supply', start: point(event), color, pinKind, moved: false }; capture(event);
          }} />
          <div className="items-layer">{Object.values(document.items).filter(item => !(item.data.type === 'sticky' && item.data.variant === 'vellum')).map(renderItem)}</div>
          <div className="vellum-layer">{Object.values(document.items).filter(item => item.data.type === 'sticky' && item.data.variant === 'vellum').map(renderItem)}</div>
          <AccessoryTray held={tapeHeld} onPickUp={event => {
            finishEdit(); cancelGesture(); setSelection(null);
            const rect = event.currentTarget.getBoundingClientRect();
            // Keyboard-generated clicks have (0, 0) coordinates: lift from the roll itself.
            setTapeCursor(event.detail === 0
              ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
              : { x: event.clientX, y: event.clientY });
            setTapeHeld(held => !held);
          }} />
          {tapeGeometry && <div className="tape-preview" style={tapeGeometry}><Tape /></div>}
          <Ropes document={document} selected={selection?.type === 'rope' ? selection.id : undefined} selectedPins={selection?.type === 'item' ? selection.pinIds : undefined} temporary={temporary} onSelect={id => { finishEdit(); setPalette(null); setSelection({ type: 'rope', id }); sound.play('pluck'); }} />
          {pinPreview && <div className="pin-preview"><Pin decorative center={lightingCenter} pin={{ id: 'preview', itemId: null, xRatio: 0, yRatio: 0, color: pinPreview.color, kind: pinPreview.kind }} position={pinPreview.position} moving connecting={false} onPointerDown={() => {}} onPalette={() => {}} /></div>}
          <div className="pins-layer">{Object.values(document.pins).sort((a, b) => (a.itemId ? document.items[a.itemId].zIndex : 0) - (b.itemId ? document.items[b.itemId].zIndex : 0)).map(pin => <Pin key={pin.id} center={lightingCenter} pin={pin} position={pinPosition(pin, pin.itemId ? document.items[pin.itemId] : undefined)} selected={selection?.type === 'item' && !!selection.pinIds?.includes(pin.id)} moving={movingPin === pin.id} connecting={temporary?.target === pin.id} onPointerDown={pinDown} onPalette={pin => { finishEdit(); cancelGesture(); setPalette({ type: 'pin', id: pin.id }); }} />)}</div>
          <SilverPins center={lightingCenter} pins={[
            { id: 'supply-silver', x: 376, y: 958 },
            ...Object.values(document.pins).filter(pin => pin.kind === 'silver').map(pin => ({ id: pin.id, ...pinPosition(pin, pin.itemId ? document.items[pin.itemId] : undefined) })),
            ...(pinPreview?.kind === 'silver' ? [{ id: 'preview', ...pinPreview.position }] : []),
          ]} />
        </div>
      </div>
    </main>
    {tapeHeld && <div className="tape-cursor" style={{ left: tapeCursor.x, top: tapeCursor.y, width: 160 * scale, height: 91 * scale, transform: `translate(-50%, -50%) rotate(${tapePreview ? Math.atan2(tapePreview.end.y - tapePreview.start.y, tapePreview.end.x - tapePreview.start.x) * 180 / Math.PI : -12}deg)` }}><TapeRoll /></div>}
    <QuickLabel boardBottom={center.y + pan.y + 500 * scale} enabled={!dashboard && !selection && !editing && !palette && !tapeHeld && !activeGesture} onAppear={() => sound.play('paper')} onCommit={(text, measured) => {
      const width = measured.width / scale, height = Math.min(measured.height / scale, document.board.height);
      const p = point({ clientX: size.width / 2, clientY: 32 });
      const id = commands.createItem({ type: 'sticky', variant: 'vellum', color: '#ffffff88', text, fontSize: 16 / scale }, { x: p.x - width / 2, y: p.y - 14 }, { width, height }, 0);
      sound.play('launch');
      setSelection({ type: 'item', id });
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(() => {
        const paper = board.current?.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
        if (!paper) return;
        const startY = -paper.getBoundingClientRect().top / scale;
        paper.animate([
          { transform: `translateY(${startY}px) rotate(0deg)` },
          { transform: 'translateY(10px) rotate(.7deg)', offset: .7 },
          { transform: 'translateY(0) rotate(0deg)' },
        ], { duration: 360, easing: 'cubic-bezier(.16,.75,.3,1)' });
      });
    }} />

    {lightbox && document.items[lightbox.id] && <ImageLightbox item={document.items[lightbox.id]} from={lightbox.from} boardScale={scale} onClose={() => setLightbox(null)} />}
    {!dashboard && !lightbox && !palette && <p className="board-hint" style={{ top: Math.min(size.height - 22, center.y + pan.y + 500 * scale + 7), maxWidth: Math.max(200, Math.min(560, 950 * scale)) }}>
      {cropping ? <><b>drag</b> crop · <b>enter</b> apply · <b>esc</b> cancel · <b>r</b> reset</>
        : editing ? <><b>esc</b> finish editing</>
        : tapeHeld ? <><b>drag</b> place tape · <b>esc</b> put away</>
        : temporary ? <><b>space</b> connect pin · <b>esc</b> cancel</>
        : selection?.type === 'pin' && document.pins[selection.id]?.kind === 'silver' ? <>{document.pins[selection.id].itemId ? 'Keeps this item on future weeks' : 'Pin onto an item to keep it on future weeks'} · <b>hold</b> move pin · <b>delete</b> remove</>
        : hintItem?.data.type === 'image' ? <><b>enter</b> frame · <b>space</b> enlarge · <b>double-click</b> crop</>
        : hintItem?.data.type === 'website' ? <><b>enter</b> compact / expand · <b>double-click title</b> edit · <b>esc</b> deactivate</>
        : hintItem?.data.type === 'sticky' && hintItem.data.variant ? <><b>enter</b> change label · <b>double-click</b> edit</>
        : selection?.type === 'item' && selection.pinIds ? <><b>⌘C</b> copy · <b>⌘V</b> paste on another board · <b>delete</b> remove · <b>esc</b> deselect</>
        : selection ? <><b>delete</b> remove · <b>esc</b> deselect</>
        : <><b>pinch</b> zoom · <b>scroll</b> pan · <b>double-click outside</b> dashboard</>}
    </p>}

    {dashboard && <Dashboard state={liveState()} onResolve={resolveConflict} onClose={() => setDashboard(false)}
      onOpen={id => { changeBoards(openBoard(liveState(), id), false); setDashboard(false); }}
      onAdd={() => { changeBoards(addBoard(liveState())); setDashboard(false); sound.play('paper'); }}
      onDelete={id => changeBoards(deleteBoard(liveState(), id))} />}
    <div className="board-status">
      <button className="board-sound-toggle" onClick={toggleSound} aria-label="Board sound effects" aria-pressed={soundEnabled} title={soundEnabled ? 'Mute board sounds' : 'Enable board sounds'}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4Z" />
          {soundEnabled ? <><path d="M15 8a6 6 0 0 1 0 8" /><path d="M18 5a10 10 0 0 1 0 14" /></> : <path d="m16 9 5 6m0-6-5 6" />}
        </svg>
      </button>
      <span className={`sync-${cloudState.status}`}><i /><SyncStatus state={cloudState} /></span>
    </div>
    {palettePoint && palettePos && <ColorPalette kind={palettePin ? 'pin' : 'paper'} value={palettePin?.color ?? (paletteItem?.data.type === 'sticky' ? paletteItem.data.color : '')}
      x={clamp(palettePos.x, 116, size.width - 116)} y={clamp(palettePos.y + 16, 14, size.height - 64)}
      onChange={color => { if (palettePin) commands.updatePin(palettePin.id, { color }); else if (paletteItem?.data.type === 'sticky') commands.updateItem(paletteItem.id, { data: { ...paletteItem.data, color } }); setPalette(null); }} />}
    {notice && <div className="toast" role="status">{notice}</div>}
    {retired && <div className="retired-overlay" role="alert">Weekly Board is open in another tab.</div>}
  </div>;
}
