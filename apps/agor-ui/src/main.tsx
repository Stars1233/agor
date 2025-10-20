import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeHandlebarsHelpers } from './utils/handlebars-helpers';

// Cleanup WebSocket connections on Vite HMR
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log('🔌 HMR: Cleaning up WebSocket connections...');
    // Close all open socket.io connections
    // biome-ignore lint/suspicious/noExplicitAny: Global window extension for HMR cleanup
    if (typeof window !== 'undefined' && (window as any).__agorClient) {
      // biome-ignore lint/suspicious/noExplicitAny: Global window extension for HMR cleanup
      const client = (window as any).__agorClient;
      if (client?.io) {
        client.io.removeAllListeners();
        client.io.close();
        console.log('✅ HMR: Closed existing WebSocket connection');
      }
      // biome-ignore lint/suspicious/noExplicitAny: Global window extension for HMR cleanup
      delete (window as any).__agorClient;
    }
  });
}

// Initialize Handlebars helpers
initializeHandlebarsHelpers();

// biome-ignore lint/style/noNonNullAssertion: root element is guaranteed to exist in index.html
createRoot(document.getElementById('root')!).render(
  // Temporarily disable StrictMode to avoid double socket connections in dev
  // TODO: Make useAgorClient StrictMode-compatible by handling double-mount properly
  // <StrictMode>
  <App />
  // </StrictMode>
);
