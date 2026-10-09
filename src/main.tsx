import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { iniciar } from './lib/app';
import { poner } from './lib/estado';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
iniciar();

// El service worker deja la app disponible sin señal y recibe las notificaciones.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Si ya había una versión instalada y llega otra, se avisa para aplicarla (no se recarga sola: alguien puede
  // estar a medio registrar).
  const habiaVersion = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (habiaVersion) poner({ actualizacion: true });
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
