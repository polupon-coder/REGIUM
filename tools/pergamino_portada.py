"""Recorta el pergamino de la portada (sin el fondo marrón). Uso: python3 -I tools/pergamino_portada.py"""
from PIL import Image, ImageFilter, ImageDraw
import numpy as np
im = Image.open('arte/ui/pergamino-portada.webp').convert('RGB')
k = 0.7
im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
a = np.asarray(im).astype(np.float32)
lum = a.mean(2)
# Hoja: lo claro, con los huecos interiores (letras) rellenos
m = Image.fromarray(((lum > 105) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
s = lambda *v: [round(x * k) for x in v]
# Rollo superior: su contorno, trazado a mano (su sombra se confunde con el fondo marrón)
ROLLO = [(150, 200), (175, 182), (330, 192), (700, 215), (930, 232), (1180, 252), (1232, 300), (1240, 380),
         (1232, 440), (1185, 432), (1150, 410), (930, 402), (600, 405), (230, 412), (175, 405), (150, 380), (145, 290)]
ImageDraw.Draw(m).polygon([(round(x * k), round(y * k)) for x, y in ROLLO], fill=255)
fill = m.copy()
ImageDraw.floodfill(fill, (0, 0), 128)
keep = np.asarray(fill) != 128
alpha = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.3))
out = im.convert('RGBA')
out.putalpha(alpha)
# Se quita la franja vacía entre el rollo y la hoja para que la hoja cuelgue del rollo
a_ = np.asarray(out)
g0, g1 = round(418 * k), round(462 * k)
out = Image.fromarray(np.concatenate([a_[:g0], a_[g1:]]))
out = out.crop(out.getchannel('A').getbbox())
out.save('public/ui/pergamino-portada.webp', quality=85)
