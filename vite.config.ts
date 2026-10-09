import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Genera sw.js con la lista de archivos de la app, para que abra sin señal. */
function trabajadorOffline(): Plugin {
  let salida = 'dist';
  return {
    name: 'ovocheck-offline',
    apply: 'build',
    configResolved(c) {
      salida = c.build.outDir;
    },
    closeBundle() {
      const archivos: string[] = [];
      const recorrer = (dir: string) => {
        for (const n of readdirSync(dir)) {
          const ruta = join(dir, n);
          if (statSync(ruta).isDirectory()) recorrer(ruta);
          else if (n !== 'sw.js') archivos.push('/' + relative(salida, ruta).replace(/\\/g, '/'));
        }
      };
      recorrer(salida);
      const huella = createHash('sha1');
      for (const a of archivos.sort()) huella.update(a).update(readFileSync(join(salida, a)));
      const lista = ['/', ...archivos.filter((a) => a !== '/index.html')];
      const sw = `// Generado al compilar. No editar.
const VERSION = 'ovocheck-${huella.digest('hex').slice(0, 12)}';
const ARCHIVOS = ${JSON.stringify(lista)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('ovocheck-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (err) {
    d = { texto: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(d.titulo || 'Ovo Check', {
      body: d.texto || '',
      icon: '/icon-192.png',
      badge: '/insignia.png',
      tag: d.etiqueta || 'ovocheck',
      renotify: true,
      data: { url: d.url || '/' },
    }),
  );
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) if ('focus' in v) return v.focus();
      return self.clients.openWindow(destino);
    }),
  );
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(
    caches.open(VERSION).then(async (c) => {
      const esPagina = e.request.mode === 'navigate';
      const esInicio = esPagina && (u.pathname === '/' || u.pathname === '/index.html');
      const guardado = await c.match(esInicio ? '/' : e.request, { ignoreSearch: esPagina });
      if (guardado) return guardado;
      try {
        return await fetch(e.request);
      } catch (err) {
        if (esPagina) return (await c.match('/')) || Response.error();
        throw err;
      }
    }),
  );
});
`;
      writeFileSync(join(salida, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  plugins: [react(), trabajadorOffline()],
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  server: { host: true },
});
