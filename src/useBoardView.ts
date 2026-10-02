import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { boardScale, constrainPan, panBy, pinchAt, zoomAt, type BoardView, type PinchStart, type ViewportSize, type ZoomInput } from './boardView';
import type { Point } from './model';

export function useBoardView(size: ViewportSize) {
  const [view, setView] = useState<BoardView>({ zoom: 1, x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef(view), target = useRef(view), viewportSize = useRef(size);
  const frame = useRef<number | null>(null);
  const lastTime = useRef(0);
  const input = useRef<ZoomInput | 'pan'>('wheel');
  const pinch = useRef<PinchStart | null>(null);
  viewportSize.current = size;

  const stopZoom = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    target.current = current.current;
    pinch.current = null;
  }, []);

  const publish = useCallback((next: BoardView) => {
    current.current = next;
    setView(next);
  }, []);

  const setPan = useCallback((pan: Point) => {
    stopZoom();
    const size = viewportSize.current;
    publish({ zoom: current.current.zoom, ...constrainPan(pan, size, boardScale(size, current.current.zoom)) });
    target.current = current.current;
  }, [publish, stopZoom]);

  const schedule = useCallback(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const next = target.current;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      publish(next);
      target.current = next;
      return;
    }
    if (frame.current !== null) return;
    lastTime.current = performance.now();
    const animate = (time: number) => {
      const direct = input.current !== 'wheel';
      const amount = direct ? 1 : 1 - Math.exp(-(time - lastTime.current) / 45);
      lastTime.current = time;
      const from = current.current, to = target.current;
      const done = direct || (Math.abs(to.zoom - from.zoom) < .0001 && Math.hypot(to.x - from.x, to.y - from.y) < .05);
      const zoom = done ? to.zoom : from.zoom + (to.zoom - from.zoom) * amount;
      const size = viewportSize.current;
      publish({ zoom, ...constrainPan(done ? to : {
        x: from.x + (to.x - from.x) * amount,
        y: from.y + (to.y - from.y) * amount,
      }, size, boardScale(size, zoom)) });
      frame.current = done ? null : requestAnimationFrame(animate);
    };
    frame.current = requestAnimationFrame(animate);
  }, [publish]);

  const onZoom = useCallback((delta: number, cursor: Point, kind: ZoomInput) => {
    if (!delta) return;
    if (input.current !== kind) {
      if (input.current === 'pinch' || kind === 'pinch') stopZoom();
      input.current = kind;
    }
    // Continuous events can arrive several times in one frame. Compose each
    // event on the pending view so changing cursor coordinates remain accurate.
    const from = kind === 'wheel' ? current.current : target.current;
    const next = zoomAt(from, target.current.zoom, delta, cursor, viewportSize.current, kind);
    if (next.zoom === target.current.zoom) return;
    target.current = next;
    schedule();
  }, [schedule, stopZoom]);

  const onPan = useCallback((delta: Point) => {
    if (!delta.x && !delta.y) return;
    if (target.current.zoom > 1) {
      setPanning(true);
      if (panIdle.current !== null) clearTimeout(panIdle.current);
      panIdle.current = setTimeout(() => { panIdle.current = null; setPanning(false); }, 180);
    }
    const next = panBy(target.current, delta, viewportSize.current);
    if (next.x === target.current.x && next.y === target.current.y) return;
    target.current = next;
    input.current = 'pan';
    pinch.current = null;
    schedule();
  }, [schedule]);

  const startPinch = useCallback((cursor: Point) => {
    stopZoom();
    input.current = 'pinch';
    pinch.current = { view: current.current, cursor };
  }, [stopZoom]);

  const changePinch = useCallback((scale: number, cursor: Point) => {
    if (!pinch.current || !Number.isFinite(scale) || scale <= 0) return;
    target.current = pinchAt(pinch.current, scale, cursor, viewportSize.current);
    schedule();
  }, [schedule]);

  const endPinch = useCallback(() => { pinch.current = null; }, []);

  useLayoutEffect(() => { setPan(current.current); }, [size.width, size.height, setPan]);
  useEffect(() => () => {
    stopZoom();
    if (panIdle.current !== null) clearTimeout(panIdle.current);
  }, [stopZoom]);

  return { view, scale: boardScale(size, view.zoom), pan: constrainPan(view, size, boardScale(size, view.zoom)), panning, setPan, onPan, onZoom, stopZoom, startPinch, changePinch, endPinch };
}
