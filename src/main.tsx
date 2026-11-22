import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { startBeregning } from './state/beregning';
import { startLagring, useStore } from './state/store';
import './styles.css';

registerSW({
  immediate: true,
  onOfflineReady() {
    useStore.getState().melding('Appen er klar til bruk uten nett.', 'ok');
  },
});

startLagring();
void useStore
  .getState()
  .lastInn()
  .then(() => startBeregning());

// clock for "time since last seen"
setInterval(() => useStore.getState().set({ naa: Date.now() }), 30_000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
