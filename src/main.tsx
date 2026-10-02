import { createRoot } from 'react-dom/client';
import App, { initApp } from './App';
import { loadWeekState } from './weeks';
import './styles.css';
loadWeekState().then(week => {
  initApp(week);
  createRoot(document.getElementById('root')!).render(<App />);
}).catch(() => {
  const loader = document.querySelector('.canvas-loader');
  if (loader) { loader.textContent = 'Could not load your board. Please reload to try again.'; loader.setAttribute('role', 'alert'); }
});
