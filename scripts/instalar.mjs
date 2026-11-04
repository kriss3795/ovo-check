// Instala o actualiza la base de datos antes de publicar la app (Vercel lo ejecuta en cada publicación).
// El esquema se puede ejecutar muchas veces sin perder datos. Si no hay base de datos conectada, se avisa y la
// publicación sigue, para que la app no deje de publicarse por eso.
import fs from 'node:fs';
import pg from 'pg';

const url = String(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.STORAGE_URL || '').trim();
const ambiente = process.env.VERCEL_ENV;
if (!url) {
  console.warn('Ovo Check: no hay base de datos conectada (Vercel > Storage). La app se publica, pero no funcionará hasta conectarla.');
  process.exit(0);
}
// En las versiones de prueba (otras ramas) no se toca la base de datos real.
if (ambiente && ambiente !== 'production' && !process.env.INSTALAR_SIEMPRE) {
  console.log(`Ovo Check: ambiente ${ambiente}, la base de datos no se modifica.`);
  process.exit(0);
}
const local = /@(localhost|127\.0\.0\.1)[:/]|host=\//.test(url);
const cliente = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: true }, connectionTimeoutMillis: 30000 });
const sql = fs.readFileSync(new URL('../db/esquema.sql', import.meta.url), 'utf8');
try {
  await cliente.connect();
  // Si dos publicaciones coinciden, la segunda espera a que termine la primera.
  await cliente.query('select pg_advisory_lock(73101)');
  await cliente.query(sql);
  console.log('Ovo Check: base de datos al día.');
} catch (e) {
  console.error('Ovo Check: no se pudo instalar la base de datos:', e.message);
  process.exit(1);
} finally {
  await cliente.end().catch(() => {});
}
