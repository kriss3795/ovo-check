"""Genera los íconos de la app a partir de recursos/logo-original.png.
Uso: python3 recursos/generar_iconos.py   (requiere Pillow)"""
from PIL import Image
import numpy as np, os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
im = Image.open(os.path.join(RAIZ, "recursos/logo-original.png")).convert("RGB")
a = np.asarray(im).astype(int)
tinta = a.min(axis=2) < 235

def caja(y0, y1):
    sub = tinta[y0:y1 + 1]
    cols = np.where(sub.any(axis=0))[0]
    return (int(cols.min()), y0, int(cols.max()) + 1, y1 + 1)

marca = im.crop(caja(161, 641))          # huevo + gallina + check
completo = im.crop((52 - 8, 161 - 8, 1027 + 8, 918 + 8))

def cuadrado(img, lado, ocupa):
    """Centra img en un cuadrado blanco; 'ocupa' = fracción del lado que usa la marca."""
    lienzo = Image.new("RGB", (lado, lado), "white")
    esc = lado * ocupa / max(img.size)
    r = img.resize((round(img.width * esc), round(img.height * esc)), Image.LANCZOS)
    lienzo.paste(r, ((lado - r.width) // 2, (lado - r.height) // 2))
    return lienzo

pub = os.path.join(RAIZ, "public")
os.makedirs(pub, exist_ok=True)
cuadrado(marca, 192, 0.80).save(os.path.join(pub, "icon-192.png"), optimize=True)
cuadrado(marca, 512, 0.80).save(os.path.join(pub, "icon-512.png"), optimize=True)
cuadrado(marca, 512, 0.58).save(os.path.join(pub, "icon-maskable.png"), optimize=True)
cuadrado(marca, 64, 0.92).save(os.path.join(pub, "favicon.png"), optimize=True)
cuadrado(marca, 240, 0.96).save(os.path.join(pub, "marca.webp"), quality=90)
w = 760
completo.resize((w, round(completo.height * w / completo.width)), Image.LANCZOS).save(os.path.join(pub, "logo.webp"), quality=90)

# Insignia de las notificaciones (Android la muestra en blanco sobre la barra de estado)
from PIL import ImageDraw
ins = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
d = ImageDraw.Draw(ins)
d.ellipse((20, 6, 76, 90), fill=(255, 255, 255, 255))
d.line((33, 50, 44, 62, 64, 36), fill=(0, 0, 0, 0), width=9, joint="curve")
ins.save(os.path.join(pub, "insignia.png"))

# Íconos de Android (si ya existe la carpeta android/)
res = os.path.join(RAIZ, "android/app/src/main/res")
if os.path.isdir(res):
    dens = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for d, f in dens.items():
        carpeta = os.path.join(res, f"mipmap-{d}")
        os.makedirs(carpeta, exist_ok=True)
        cuadrado(marca, round(48 * f), 0.80).save(os.path.join(carpeta, "ic_launcher.png"))
        cuadrado(marca, round(48 * f), 0.66).save(os.path.join(carpeta, "ic_launcher_round.png"))
        cuadrado(marca, round(108 * f), 0.50).save(os.path.join(carpeta, "ic_launcher_foreground.png"))
    print("Íconos de Android actualizados")
print("Listo")
