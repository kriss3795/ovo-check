import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { iniciar } from './lib/app';
import { leerEstado, poner } from './lib/estado';

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
    if (!habiaVersion) return;
    // Fuera de la app (entrada, desvinculado) o en una pantalla principal, se aplica sola: nada se pierde, todo está
    // guardado en el teléfono. A medio registrar, se avisa y la persona decide.
    const e = leerEstado();
    if (e.fase !== 'app' || e.ruta.length <= 1) window.location.reload();
    else poner({ actualizacion: true });
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((r) => {
        // Busca versiones nuevas al volver a la app y cada 30 minutos.
        const revisar = () => r.update().catch(() => {});
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && revisar());
        setInterval(revisar, 30 * 60000);
      })
      .catch(() => {});
  });
}
