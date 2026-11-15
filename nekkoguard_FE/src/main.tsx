import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/base.css';

import { setNonce } from 'get-nonce';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

// The CSP allows <style> tags only with this request's nonce (nginx puts it in the page).
// Radix's scroll lock adds such tags; get-nonce hands them the nonce.
const nonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
if (nonce && !nonce.startsWith('__')) setNonce(nonce);

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
