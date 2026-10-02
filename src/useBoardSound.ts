import { useEffect, useState } from 'react';
import { BoardSound } from './boardSound';

const STORAGE_KEY = 'analog-board-sound';
export function useBoardSound() {
  const [sound] = useState(() => new BoardSound());
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
  });
  useEffect(() => { sound.setEnabled(enabled); }, [sound, enabled]);
  useEffect(() => {
    const unlock = (event: Event) => { if (event.isTrusted) sound.unlock(); };
    const stop = () => sound.stop();
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener('pointerdown', unlock, true); window.addEventListener('keydown', unlock, true);
    window.addEventListener('blur', stop); document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', visibility);
      sound.dispose();
    };
  }, [sound]);
  const toggle = () => {
    const next = !enabled;
    setEnabled(next); sound.setEnabled(next);
    try { localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off'); } catch { /* Keep the in-session preference. */ }
    if (next) sound.unlock();
  };
  return { sound, enabled, toggle };
}
