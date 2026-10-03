import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const el = document.getElementById('root');
if (el) {
  // Intentionally no StrictMode: it double-invokes effects in development,
  // which would open two camera streams and build two WebGL contexts.
  createRoot(el).render(<App />);
}
