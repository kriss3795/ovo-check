// Arma un archivo .zip sin compresión (las fotos JPEG ya vienen comprimidas).
const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLA[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export class Zip {
  private partes: BlobPart[] = [];
  private central: Uint8Array[] = [];
  private posicion = 0;
  cantidad = 0;
  peso = 0;

  async agregar(nombre: string, blob: Blob, fecha = new Date()) {
    const datos = new Uint8Array(await blob.arrayBuffer());
    const nom = new TextEncoder().encode(nombre);
    const crc = crc32(datos);
    const hora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | (fecha.getSeconds() >> 1);
    const dia = ((fecha.getFullYear() - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate();

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(8, 0, true); // sin compresión
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nom.length, true);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, hora, true);
    cd.setUint16(14, dia, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, datos.length, true);
    cd.setUint32(24, datos.length, true);
    cd.setUint16(28, nom.length, true);
    cd.setUint32(42, this.posicion, true);
    const entrada = new Uint8Array(46 + nom.length);
    entrada.set(new Uint8Array(cd.buffer), 0);
    entrada.set(nom, 46);
    this.central.push(entrada);

    this.partes.push(local.buffer, nom, blob);
    this.posicion += 30 + nom.length + datos.length;
    this.cantidad++;
    this.peso += datos.length;
  }

  cerrar(): Blob {
    const largoCentral = this.central.reduce((n, e) => n + e.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, this.cantidad, true);
    fin.setUint16(10, this.cantidad, true);
    fin.setUint32(12, largoCentral, true);
    fin.setUint32(16, this.posicion, true);
    return new Blob([...this.partes, ...(this.central as BlobPart[]), fin.buffer], { type: 'application/zip' });
  }
}
