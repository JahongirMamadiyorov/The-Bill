import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* HashRouter, not BrowserRouter — no web server in production, just file:// */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
