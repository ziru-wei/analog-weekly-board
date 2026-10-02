import { useEffect, useState } from 'react';

/** Mount normally behind the loading screen so layout, fonts and WebGL can settle. */
export function useCanvasReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const imageReady = (image: HTMLImageElement) => image.decode().catch(() => {});
    const prepare = async () => {
      await frame();
      const root = document.querySelector('.app-shell');
      if (!root || disposed) return;
      const images = Array.from(root.querySelectorAll('img')).map(imageReady);
      const backgrounds = new Set<string>();
      for (const element of root.querySelectorAll('*')) {
        for (const match of getComputedStyle(element).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) backgrounds.add(match[1]);
      }
      for (const url of backgrounds) { const image = new Image(); image.src = url; images.push(imageReady(image)); }
      await Promise.allSettled([document.fonts.ready, ...images]);
      if (disposed || controller.signal.aborted) return;
      await new Promise<void>(resolve => {
        const observer = new MutationObserver(check);
        function check() {
          if (controller.signal.aborted || !root!.querySelector('[data-canvas-loading="true"]')) { observer.disconnect(); resolve(); }
        }
        observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-canvas-loading'] });
        controller.signal.addEventListener('abort', check, { once: true });
        check();
      });
      // Link metadata can add a thumbnail after the first image scan.
      await Promise.allSettled(Array.from(root.querySelectorAll('img')).map(imageReady));
      await frame(); await frame();
      if (!disposed) setReady(true);
    };
    // Failed remote resources must not prevent access to the user's local board.
    const deadline = setTimeout(() => { controller.abort(); if (!disposed) setReady(true); }, 15000);
    void prepare().finally(() => clearTimeout(deadline));
    return () => { disposed = true; controller.abort(); clearTimeout(deadline); };
  }, []);
  return ready;
}
