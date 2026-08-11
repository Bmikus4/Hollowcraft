# BLOOD DECAL ASSETS (Ben 08-11, two watercolour blood scans). Bakes assets/blood/splat*.png from the source scans, and
# the game does nothing at runtime but load them — see the BLOOD ASSETS block in index.html for why the keying cannot
# happen in the browser (a canvas refuses to hand back pixels of a decoded JPEG over file://).
#   Re-run only if a source changes. SRC points at where Ben dropped the files; the shipped PNGs are the output.
#     python tools/blood-assets.py
import numpy as np, os
from PIL import Image, ImageFilter

SRC = [
    (r"C:\Users\thera\Desktop\e71b1a690969e3a2b1c096fe44377b7a.jpg", "splat1"),
    (r"C:\Users\thera\Desktop\15b3b3a5b61497568ea49365b7f6c977.jpg", "splat2"),
]
OUT = r"D:\Code\Minecraft\assets\blood"
os.makedirs(OUT, exist_ok=True)

for path, name in SRC:
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    mx = a.max(2); mn = a.min(2)
    # ink density: how far from white. white paper -> 0, saturated red -> ~1
    dens = 1.0 - mn / 255.0
    # saturation gate: kills the grey watermark text and jpeg grey mush entirely
    sat = np.where(mx > 1, (mx - mn) / np.maximum(mx, 1), 0.0)
    ink = np.clip(dens * np.clip(sat * 2.6, 0, 1), 0, 1)
    # STOCK-LIBRARY WATERMARK REMOVAL. The source is a watermarked scan: the tiled "dreamstime" text is a thin
    # low-saturation lightening, so it survives the white key as a legible ghost inside the dense core. A greyscale
    # morphological closing (dilate then erode) fills thin light lines without eroding the thin DARK features —
    # the flung spatter streaks are high-ink, so they come through the dilation intact.
    ik = Image.fromarray((ink * 255).astype(np.uint8), "L")
    ink = np.asarray(ik.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))).astype(np.float32) / 255.0
    alpha = ink ** 0.72 * 1.12
    alpha = np.clip(alpha, 0, 1)
    alpha[alpha < 0.08] = 0.0                      # hard floor: no 2% haze over the whole quad
    # COLOUR FROM DENSITY, NOT FROM THE SOURCE PIXEL. The scan is a watercolour on white, so its pale washes are
    # light PINK — kept as-is they render as a translucent pink film, which reads as spilled paint. Blood is the
    # other way round: thick pools go near-black maroon, thin smears dry rusty brown. So the source only supplies
    # the shape and its internal variation; the ramp supplies the colour.
    d = ink[..., None]
    thin = np.array([0x74, 0x27, 0x1c], np.float32)
    thick = np.array([0x24, 0x05, 0x05], np.float32)
    rgb = thin + (thick - thin) * (d ** 0.85)
    out = np.dstack([rgb, alpha * 255.0]).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    bb = img.split()[3].point(lambda v: 255 if v > 3 else 0).getbbox()
    if bb: img = img.crop(bb)
    s = max(img.size)
    sq = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sq.paste(img, ((s - img.size[0]) // 2, (s - img.size[1]) // 2))
    sq = sq.resize((512, 512), Image.LANCZOS)
    p = os.path.join(OUT, name + ".png")
    sq.save(p, optimize=True)
    cov = (np.asarray(sq)[..., 3] > 8).mean()
    print(name, sq.size, f"{os.path.getsize(p)/1024:.0f}KB", f"coverage {cov*100:.1f}%")
