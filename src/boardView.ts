import { clamp, type Point } from './model';

export type BoardView = Point & { zoom: number };
export type ViewportSize = { width: number; height: number };
export type ZoomInput = 'wheel' | 'pinch';
export type PinchStart = { view: BoardView; cursor: Point };
const MAX_ZOOM = 2.5;
const ZOOM_PER_PIXEL = .0015;
const PINCH_ZOOM_PER_PIXEL = .01;
const FIT_GAP = 8;
// Keep the tray's canvas, including its horizontal skew, inside the viewport.
// The overflowing note stack and left clip do not reduce the fitted scale.
const FITTED_WIDTH = 1628, FITTED_HEIGHT = 1032;

export function boardScale(size: ViewportSize, zoom: number) {
  return Math.max(.01, Math.min((size.width - FIT_GAP * 2) / FITTED_WIDTH, (size.height - FIT_GAP * 2) / FITTED_HEIGHT)) * zoom;
}

export function boardCenter(size: ViewportSize): Point {
  return { x: size.width / 2, y: (size.height - (FITTED_HEIGHT - 1000) * boardScale(size, 1)) / 2 };
}

export function constrainPan(pan: Point, size: ViewportSize, scale: number): Point {
  const zoom = scale / boardScale(size, 1);
  const margin = Math.min(96, Math.max(0, zoom - 1) * Math.min(size.width, size.height) / 2);
  const maxX = Math.max(0, (1600 * scale - size.width + FIT_GAP * 2) / 2) + margin;
  const maxY = Math.max(0, (1000 * scale - size.height + FIT_GAP * 2) / 2) + margin;
  return { x: clamp(pan.x, -maxX, maxX) || 0, y: clamp(pan.y, -maxY, maxY) || 0 };
}

export function wheelPixels(delta: number, mode: number, pageSize: number) {
  return delta * (mode === 1 ? 16 : mode === 2 ? pageSize : 1);
}

export function panBy(view: BoardView, delta: Point, size: ViewportSize): BoardView {
  return { zoom: view.zoom, ...constrainPan({ x: view.x - delta.x, y: view.y - delta.y }, size, boardScale(size, view.zoom)) };
}

export function viewAtZoom(current: BoardView, requestedZoom: number, cursor: Point, size: ViewportSize, anchorCursor = cursor): BoardView {
  const zoom = clamp(requestedZoom, 1, MAX_ZOOM);
  const ratio = zoom / current.zoom;
  const center = boardCenter(size);
  const offset = { x: cursor.x - center.x, y: cursor.y - center.y };
  const anchor = { x: anchorCursor.x - center.x, y: anchorCursor.y - center.y };
  return { zoom, ...constrainPan({
    x: offset.x - (anchor.x - current.x) * ratio,
    y: offset.y - (anchor.y - current.y) * ratio,
  }, size, boardScale(size, zoom)) };
}

export function zoomAt(current: BoardView, targetZoom: number, delta: number, cursor: Point, size: ViewportSize, input: ZoomInput = 'wheel'): BoardView {
  // Pinch deltas encode proportional magnification. Preserve that relationship
  // instead of applying the small additive step used for physical scroll wheels.
  const zoom = input === 'pinch' ? targetZoom * Math.exp(-delta * PINCH_ZOOM_PER_PIXEL)
    : targetZoom - delta * ZOOM_PER_PIXEL;
  return viewAtZoom(current, zoom, cursor, size);
}

export function pinchAt(start: PinchStart, scale: number, cursor: Point, size: ViewportSize): BoardView {
  return viewAtZoom(start.view, start.view.zoom * scale, cursor, size, start.cursor);
}
