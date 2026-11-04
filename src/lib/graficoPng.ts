// Gráficos de líneas dibujados en una imagen PNG, para pegarlos en el Excel (Excel muestra imágenes en cualquier versión).
export interface SerieGrafico {
  nombre: string;
  valores: (number | null)[];
  color: string;
  punteada?: boolean;
}

export async function graficoPng(p: { titulo: string; unidad: string; etiquetas: string[]; series: SerieGrafico[]; ancho?: number; alto?: number }): Promise<Blob | null> {
  const W = p.ancho ?? 900;
  const H = p.alto ?? 380;
  const escala = 2;
  const lienzo = document.createElement('canvas');
  lienzo.width = W * escala;
  lienzo.height = H * escala;
  const ctx = lienzo.getContext('2d');
  if (!ctx) return null;
  ctx.scale(escala, escala);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const fuente = 'Arial, Helvetica, sans-serif';
  const M = { i: 64, d: 24, a: 64, b: 46 };
  ctx.fillStyle = '#1c282d';
  ctx.font = `bold 18px ${fuente}`;
  ctx.fillText(p.titulo, M.i, 28);
  ctx.font = `13px ${fuente}`;
  ctx.fillStyle = '#56646a';
  ctx.fillText(p.unidad, M.i, 48);
  // Leyenda arriba a la derecha.
  let lx = W - M.d;
  ctx.textAlign = 'right';
  for (const s of [...p.series].reverse()) {
    const w = ctx.measureText(s.nombre).width;
    ctx.fillStyle = '#56646a';
    ctx.fillText(s.nombre, lx, 48);
    lx -= w + 8;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash(s.punteada ? [6, 4] : []);
    ctx.beginPath();
    ctx.moveTo(lx - 22, 44);
    ctx.lineTo(lx, 44);
    ctx.stroke();
    lx -= 36;
  }
  ctx.setLineDash([]);
  ctx.textAlign = 'left';
  const todos = p.series.flatMap((s) => s.valores).filter((v): v is number => v != null && Number.isFinite(v));
  if (!todos.length) return null;
  let lo = Math.min(...todos);
  let hi = Math.max(...todos);
  const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1;
  lo = Math.max(0, lo - pad);
  hi += pad;
  const n = p.etiquetas.length;
  const x = (i: number) => M.i + (n <= 1 ? (W - M.i - M.d) / 2 : (i * (W - M.i - M.d)) / (n - 1));
  const y = (v: number) => M.a + (1 - (v - lo) / (hi - lo || 1)) * (H - M.a - M.b);
  ctx.font = `12px ${fuente}`;
  for (let k = 0; k <= 4; k++) {
    const v = lo + (k / 4) * (hi - lo);
    ctx.strokeStyle = '#e6ebe9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(M.i, y(v));
    ctx.lineTo(W - M.d, y(v));
    ctx.stroke();
    ctx.fillStyle = '#56646a';
    ctx.textAlign = 'right';
    ctx.fillText(v.toLocaleString('es-CL', { maximumFractionDigits: hi - lo < 6 ? 1 : 0 }), M.i - 8, y(v) + 4);
  }
  ctx.textAlign = 'center';
  const paso = Math.max(1, Math.ceil(n / 12));
  p.etiquetas.forEach((e, i) => {
    if (i % paso === 0 || i === n - 1) ctx.fillText(e, x(i), H - 18);
  });
  for (const s of p.series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.punteada ? 2 : 2.5;
    ctx.setLineDash(s.punteada ? [6, 4] : []);
    ctx.beginPath();
    let abierto = false;
    s.valores.forEach((v, i) => {
      if (v == null) return void (abierto = false);
      if (!abierto) ctx.moveTo(x(i), y(v));
      else ctx.lineTo(x(i), y(v));
      abierto = true;
    });
    ctx.stroke();
    ctx.setLineDash([]);
    if (!s.punteada) {
      ctx.fillStyle = s.color;
      s.valores.forEach((v, i) => {
        if (v == null) return;
        ctx.beginPath();
        ctx.arc(x(i), y(v), 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  return new Promise((ok) => lienzo.toBlob((b) => ok(b), 'image/png'));
}
