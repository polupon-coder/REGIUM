"""Genera las imágenes del juego (WebP) a partir de los originales sin recortar.
Uso: python3 -I tools/preparar_cartas.py arte/originales public/cartas"""
import sys, os, glob
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from recortar import PAGE, CUT, RADIUS_MM
from PIL import ImageDraw

SKIP = {"indicador-numeros-vertical-original"}
ESCUDO = {"dragon": "rojo", "aguila": "verde", "serpiente": "amarillo", "cuernos": "azul", "elefante": "morado"}

def recorte(path):
    im = Image.open(path).convert("RGB"); w, h = im.size
    land = w > h
    pw, ph = (PAGE[1], PAGE[0]) if land else PAGE
    cw, ch = (CUT[1], CUT[0]) if land else CUT
    sx, sy = w / pw, h / ph
    l, t = round((pw - cw) / 2 * sx), round((ph - ch) / 2 * sy)
    card = im.crop((l, t, l + round(cw * sx), t + round(ch * sy))).convert("RGBA")
    return card, sx

def esquinas(card, radius):
    m = Image.new("L", card.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, card.size[0] - 1, card.size[1] - 1), radius=radius, fill=255)
    card.putalpha(m); return card

def main(src, dst):
    os.makedirs(dst, exist_ok=True)
    for p in sorted(glob.glob(os.path.join(src, "*.jpg"))):
        name = os.path.splitext(os.path.basename(p))[0]
        if name in SKIP: continue
        if name.startswith("escudo-"): name = "escudo-" + ESCUDO[name[7:]]
        card, s = recorte(p)
        big = name.startswith(("pergamino-", "indicador-"))
        long_side = 1400 if name == "dorso-regium" else 900 if big else 520
        scale = long_side / max(card.size)
        card = card.resize((round(card.width * scale), round(card.height * scale)), Image.LANCZOS)
        card = esquinas(card, round(RADIUS_MM * s * scale))
        card.save(os.path.join(dst, name + ".webp"), quality=82, method=6)
    print(len(os.listdir(dst)), "imágenes")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
