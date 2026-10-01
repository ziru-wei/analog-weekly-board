import { createRoot } from 'react-dom/client';
import App, { initApp } from './App';
import { loadWeekState } from './weeks';
import './styles.css';
loadWeekState().then(week => {
  initApp(week);
  createRoot(document.getElementById('root')!).render(<App />);
});
