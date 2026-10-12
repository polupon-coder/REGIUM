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

# Nivelado entre reinos: el amarillo se apaga un poco y los demás se aclaran (gamma por reino)
SATUR_REINO = {"amarillo": 0.86}
GAMMA_REINO = {"amarillo": 1.14, "rojo": 0.86, "verde": 0.78, "azul": 0.88, "morado": 0.8}

def reino_de(name):
    for r in GAMMA_REINO:
        if f"-{r}" in name:
            return r
    return None

def niveles(card, gamma=1.0, satur=1.0):
    """Quita el velo gris: lleva el negro de la carta a negro de verdad (punto negro en el
    percentil 0,5) y estira los blancos si la carta no llega a ellos, con una curva suave."""
    import numpy as np
    a = np.asarray(card).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3:]
    L = rgb.mean(2)[a[..., 3] > 200]
    bp = max(0.0, float(np.percentile(L, 0.5)) - 4)
    wp = max(float(np.percentile(L, 99.7)), 200.0)
    x = np.clip((rgb - bp) / (wp - bp), 0, 1)
    x = x ** (1.08 * gamma)  # un poco más de profundidad en las sombras
    if satur != 1.0:
        gray = x.mean(axis=2, keepdims=True)
        x = gray + (x - gray) * satur
    out = np.concatenate([x * 255, alpha], axis=2)
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype("uint8"), "RGBA")

def esquinas(card, radius):
    m = Image.new("L", card.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, card.size[0] - 1, card.size[1] - 1), radius=radius, fill=255)
    card.putalpha(m); return card

def marco_escudo(dst):
    """Pone a cada escudo un marco del color de su reino, como el que llevan pintado los regentes."""
    import numpy as np
    for r in ESCUDO.values():
        reg = np.asarray(Image.open(os.path.join(dst, f"regente-{r}.webp")).convert("RGB")).astype(int)
        h, w, _ = reg.shape
        strip = reg[h // 4 : 3 * h // 4, 3:14].reshape(-1, 3)
        color = tuple(int(v) for v in np.median(strip, axis=0))
        esc = Image.open(os.path.join(dst, f"escudo-{r}.webp")).convert("RGBA")
        W, H = esc.size
        t = round(W * 0.045)
        frame = Image.new("RGBA", esc.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(frame)
        d.rounded_rectangle((0, 0, W - 1, H - 1), radius=round(W * 0.04), outline=color + (255,), width=t)
        d.rounded_rectangle((t - 1, t - 1, W - t, H - t), radius=round(W * 0.025), outline=tuple(max(0, c - 40) for c in color) + (255,), width=2)
        out = Image.alpha_composite(esc, frame)
        out.putalpha(esc.getchannel("A"))
        out.save(os.path.join(dst, f"escudo-{r}.webp"), quality=82, method=6)

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
        r = reino_de(name)
        card = niveles(card, GAMMA_REINO.get(r, 1.0), SATUR_REINO.get(r, 1.0))
        card = esquinas(card, round(RADIUS_MM * s * scale))
        card.save(os.path.join(dst, name + ".webp"), quality=82, method=6)
    marco_escudo(dst)
    # Fondo de la batalla: el pergamino entero (con su borde de papiro) y sin la esfera de color
    from PIL import ImageFilter
    for r in ESCUDO.values():
        card, sc = recorte(os.path.join(src, f"pergamino-{r}.jpg"))
        card = niveles(card, GAMMA_REINO.get(r, 1.0), SATUR_REINO.get(r, 1.0))
        card = card.resize((900, round(900 * card.height / card.width)), Image.LANCZOS)
        card = esquinas(card, round(RADIUS_MM * sc * 900 / card.width))
        # se tapa la esfera rellenando con el papel de su alrededor (difuminado), sin copiar dibujos
        import numpy as np
        rgb = card.convert("RGB")
        hueco = Image.new("L", card.size, 0)
        ImageDraw.Draw(hueco).ellipse((50, 47, 122, 119), fill=255)
        conocido = Image.eval(hueco, lambda v: 255 - v)
        base = Image.composite(rgb, Image.new("RGB", card.size), conocido)
        capas = []
        for radio in (8, 16, 32):
            num = np.asarray(base.filter(ImageFilter.GaussianBlur(radio))).astype(np.float32)
            den = np.asarray(conocido.filter(ImageFilter.GaussianBlur(radio))).astype(np.float32)[..., None] / 255
            capas.append((num / np.maximum(den, 1e-3), den))
        relleno = capas[-1][0]
        for valor, den in reversed(capas[:-1]):
            peso = np.clip((den - 0.08) / 0.25, 0, 1)
            relleno = valor * peso + relleno * (1 - peso)
        relleno = Image.fromarray(np.clip(relleno, 0, 255).astype("uint8"))
        suave = hueco.filter(ImageFilter.GaussianBlur(4))
        nuevo = Image.composite(relleno, rgb, suave).convert("RGBA")
        nuevo.putalpha(card.getchannel("A"))
        card = nuevo
        card.save(os.path.join(dst, f"fondo-{r}.webp"), quality=80)
    print(len(os.listdir(dst)), "imágenes")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
