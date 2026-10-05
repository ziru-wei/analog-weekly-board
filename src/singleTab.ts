import { useSyncExternalStore } from 'react';
import { stopWriting } from './storage';

// Only one tab may own the board: two tabs would overwrite each other's saves. A newly opened tab asks the
// open one to save and step aside; that tab then closes itself.
const LOCK = 'analog-weekly-board-owner';
type Message = { type: 'claim'; from: string } | { type: 'released'; to: string };
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('analog-weekly-board-tab');
const me = crypto.randomUUID();
let retired = false, beforeRetire: (() => Promise<void> | void) | null = null;
const listeners = new Set<() => void>();

async function stepAside() {
  if (retired) return;
  try { await beforeRetire?.(); } catch { /* still step aside: the new tab must not be overwritten */ }
  retired = true; stopWriting(); listeners.forEach(l => l());
}
type Tabs = { getCurrent(): Promise<{ id?: number } | undefined>; remove(id: number): Promise<void> };
function closeSelf() {
  const scope = globalThis as typeof globalThis & { browser?: { tabs?: Tabs }; chrome?: { tabs?: Tabs } };
  const tabs = scope.browser?.tabs ?? scope.chrome?.tabs;
  if (tabs) void tabs.getCurrent().then(tab => { if (tab?.id !== undefined) return tabs.remove(tab.id); }).catch(() => {});
  else window.close(); // outside the extension this only works for script-opened windows; the overlay explains the rest
}
channel?.addEventListener('message', async (event: MessageEvent<Message>) => {
  if (event.data.type !== 'claim' || event.data.from === me) return;
  await stepAside();
  channel.postMessage({ type: 'released', to: event.data.from } satisfies Message);
  closeSelf();
});

/** Run before loading the board: the previous tab's last edits are saved before this tab reads them. */
export async function claimBoardTab() {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  const held = await locks?.query().then(state => state.held?.some(lock => lock.name === LOCK), () => true) ?? true;
  if (held && channel) await new Promise<void>(resolve => {
    let timer = setTimeout(done, 1500);
    function done() { channel!.removeEventListener('message', onMessage); resolve(); }
    function onMessage(event: MessageEvent<Message>) { if (event.data.type === 'released' && event.data.to === me) { clearTimeout(timer); timer = setTimeout(done, 100); } }
    channel.addEventListener('message', onMessage);
    channel.postMessage({ type: 'claim', from: me } satisfies Message);
  });
  // Holding the lock marks this tab as the owner; a tab that loses it (stolen by a newer one) steps aside.
  void locks?.request(LOCK, { steal: true }, () => new Promise<never>(() => {})).catch(() => stepAside().then(closeSelf));
}
/** Save everything still pending; called once when a newer tab takes over. */
export function onRetire(handler: () => Promise<void> | void) { beforeRetire = handler; }
export const useRetired = () => useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => retired);
