import './utils/invalidateCache';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { initTemplateStoreOnStartup } from './stores/data/templateStore';

initTemplateStoreOnStartup();


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
