# MENU KEY ART (Ben 08-11: "remove the loading cinematics and replace it with this image, add grain, and wash the
# colors very slightly"). Both grades are baked HERE rather than done in CSS at runtime:
#   · a CSS filter on a full-screen image is a full-screen composite every frame the menu is up, for a still;
#   · grain is the one effect CSS cannot do at all without a second texture or a shader.
# So the shipped file already looks like the finished frame and the page just draws it.
# WASH = desaturate toward the frame's own mean, plus a lifted black point. Pulling toward grey rather than toward
# white keeps the night blue and the lamp orange in the same relationship; a white wash would fog the whole image.
import os
import numpy as np
from PIL import Image

SRC = r"C:\Users\thera\Desktop\70adf15a-b922-4645-996b-14bffd2cb56b (1).png"
OUT = r"D:\Code\Minecraft\assets\menu"
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert("RGB")
if im.width > 1920:
    im = im.resize((1920, round(im.height * 1920 / im.width)), Image.LANCZOS)
a = np.asarray(im).astype(np.float32)

SAT, LIFT, GRAIN = 0.86, 10.0, 4.2          # "very slightly": 14% of the saturation, a 4% black lift, grain at ~1.6% of range
lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2])[..., None]
a = lum + (a - lum) * SAT                    # wash: toward the pixel's own luminance
a = LIFT + a * (1.0 - LIFT / 255.0)          # lifted black point — nothing sits at pure black any more
rng = np.random.default_rng(11)              # fixed seed: the shipped file is reproducible from this script
a += rng.normal(0.0, GRAIN, a.shape[:2])[..., None] * 0.75 + rng.normal(0.0, GRAIN, a.shape)*0.25   # mostly luma grain, a little chroma
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB").save(
    os.path.join(OUT, "keyart.jpg"), quality=88, optimize=True, progressive=True)
p = os.path.join(OUT, "keyart.jpg")
print("keyart.jpg", im.size, f"{os.path.getsize(p)/1024:.0f}KB")
