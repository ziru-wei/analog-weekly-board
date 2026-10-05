import { createRoot } from 'react-dom/client';
import App, { initApp } from './App';
import { DASHBOARD_OPEN_KEY, latestEditedBoard, loadWeekState, openBoard, saveWeekState } from './weeks';
import { readKv } from './storage';
import { claimBoardTab } from './singleTab';
import './styles.css';
(async () => {
  await claimBoardTab();
  let week = await loadWeekState();
  // Reopen the board the tab was closed on; if it was closed on the Dashboard, this week's latest edited board.
  if (await readKv<boolean>(DASHBOARD_OPEN_KEY).catch(() => false)) {
    const latest = latestEditedBoard(week);
    if (latest && latest.id !== week.activeId) { week = openBoard(week, latest.id); await saveWeekState(week); }
  }
  return week;
})().then(week => {
  initApp(week);
  createRoot(document.getElementById('root')!).render(<App />);
}).catch(() => {
  const loader = document.querySelector('.canvas-loader');
  if (loader) { loader.textContent = 'Could not load your board. Please reload to try again.'; loader.setAttribute('role', 'alert'); }
});
