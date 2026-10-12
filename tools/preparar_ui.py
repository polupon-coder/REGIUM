"""Prepara las texturas de la interfaz (madera, botón y marco de bronce) en public/ui/.
Uso: python3 -I tools/preparar_ui.py arte/ui public/ui"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from PIL import Image, ImageDraw, ImageFilter

def main(src, dst):
    os.makedirs(dst, exist_ok=True)
    # Fondo de mesa
    m = Image.open(os.path.join(src, "madera.webp")).convert("RGB")
    m = m.resize((1600, round(1600 * m.height / m.width)), Image.LANCZOS)
    m.save(os.path.join(dst, "madera.webp"), quality=80)
    # Versión girada para pantallas en vertical (móvil): la veta no se amplía tanto
    m.transpose(Image.Transpose.ROTATE_90).save(os.path.join(dst, "madera-vertical.webp"), quality=80)
    # Botón redondo: recorte circular con borde suave
    b = Image.open(os.path.join(src, "boton.webp")).convert("RGB")
    cx, cy, r = 617, 597, 484
    b = b.crop((cx - r, cy - r, cx + r, cy + r)).resize((256, 256), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (1024, 1024), 0)
    ImageDraw.Draw(mask).ellipse((8, 8, 1016, 1016), fill=255)
    b.putalpha(mask.resize((256, 256), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6)))
    b.save(os.path.join(dst, "boton.webp"), quality=85)
    # Botón de gema (cristal en aro de bronce)
    b = Image.open(os.path.join(src, "boton-gema.webp")).convert("RGB")
    cx, cy, r = 619, 586, 458
    b = b.crop((cx - r, cy - r, cx + r, cy + r)).resize((256, 256), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (1024, 1024), 0)
    ImageDraw.Draw(mask).ellipse((10, 14, 1014, 1004), fill=255)
    b.putalpha(mask.resize((256, 256), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6)))
    b.save(os.path.join(dst, "boton-gema.webp"), quality=85)
    # Portada: el dorso de REGIUM sin el borde negro de la carta
    import glob
    from preparar_cartas import recorte, niveles
    card, _ = recorte(os.path.join(os.path.dirname(src), "originales", "dorso-regium.jpg"))
    card = niveles(card).convert("RGB")
    w, h = card.size
    card = card.crop((round(w * 0.075), round(h * 0.06), round(w * 0.925), round(h * 0.94)))
    card = card.resize((900, round(900 * card.height / card.width)), Image.LANCZOS)
    card.save(os.path.join(dst, "portada.webp"), quality=84)
    # Marco simple (botones de iniciar)
    f2 = Image.open(os.path.join(src, "marco-simple.webp")).convert("RGB").crop((46, 78, 1403, 976))
    f2.resize((f2.width // 2, f2.height // 2), Image.LANCZOS).save(os.path.join(dst, "marco-simple.webp"), quality=85)
    # Marco de bronce: solo el rectángulo del marco, para usarlo con border-image
    full = Image.open(os.path.join(src, "marco.webp")).convert("RGB")
    # Centro del marco (metal liso) como fondo de las ventanas
    c = full.crop((170, 260, 1280, 840))
    c.resize((c.width // 2, c.height // 2), Image.LANCZOS).save(os.path.join(dst, "marco-centro.webp"), quality=80)
    f = full.crop((38, 127, 1407, 974))
    f = f.resize((f.width // 2, f.height // 2), Image.LANCZOS)
    f.save(os.path.join(dst, "marco.webp"), quality=85)
    print("marco", f.size)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
