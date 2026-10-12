"""Pergamino de la portada sin recortar: solo se difumina el fondo marrón hacia los bordes
para que se funda con la mesa. Uso: python3 -I tools/pergamino_portada.py"""
from PIL import Image
import numpy as np
im = Image.open('arte/ui/pergamino-portada.webp').convert('RGB')
im.thumbnail((1000, 1400))
w, h = im.size
y, x = np.mgrid[0:h, 0:w].astype(np.float32)
# distancia normalizada al borde más cercano (0 en el borde, 1 a un 16 % hacia dentro)
d = np.minimum(np.minimum(x, w - 1 - x) / (w * 0.16), np.minimum(y, h - 1 - y) / (h * 0.11))
alpha = np.clip(d, 0, 1) ** 1.6
# el fondo marrón (oscuro y con tono rojizo) se apaga un poco; el papel claro queda igual
a = np.asarray(im).astype(np.float32)
lum = a.mean(axis=2, keepdims=True)
k = np.clip((lum - 60) / 70, 0, 1)
a = a * (0.55 + 0.45 * k)
out = np.concatenate([a, (alpha * 255)[..., None]], axis=2)
Image.fromarray(np.clip(out, 0, 255).astype('uint8'), 'RGBA').save('public/ui/pergamino-portada.webp', quality=85)
