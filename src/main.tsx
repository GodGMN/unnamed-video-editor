import { I18nProvider } from './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import '@fontsource/figtree/800.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles.css';
import { App } from './App';
import { Toaster } from './components/Toaster';

document.addEventListener('contextmenu', (event) => event.preventDefault(), { capture: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider><App /><Toaster /></I18nProvider>
  </StrictMode>,
);
