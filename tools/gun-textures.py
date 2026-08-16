# CUT BEN'S METAL SHEET INTO TILEABLE GUN TEXTURES.
#
# Ben 08-12: "shiny guns should be shiny, they should have hd metal textures", with one 1536x1024 sheet of six
# vertical photo strips, then "dont use the corrugated or rusty ones". The seams were measured off the sheet, not
# guessed: 244, 491, 749, 1026, 1271.
#
#   strip 1  0-244      matte near-black, faint scratches  -> blued steel
#   strip 2  247-491    brushed bright nickel              -> the shiny one, the point of the ask
#   strip 3  494-749    dark mottled cast/worn steel       -> worn gunmetal
#   strip 4  752-1026   rusty brown                        EXCLUDED by Ben
#   strip 5  1039-1271  diamond plate                      EXCLUDED by Ben
#   strip 6  1281-1536  brown woven canvas                 -> slings and bags, not metal
#
# THEY ARE MADE SEAMLESS HERE, NOT AT RUNTIME. boxUV projects at roughly 2.6 repeats across a gun, so a raw photo
# strip shows its own edge as a hard line down the receiver every repeat. The offset-and-feather below is the
# standard fix and it is an OFFLINE one: doing it in a shader would cost a branch per fragment on every gun in the
# game to solve a problem that has one answer per texture.
#
# Run: python tools/gun-textures.py            (writes assets/tex/metal-{blued,nickel,steel}.jpg + canvas.jpg)
import os, sys
from PIL import Image, ImageChops

SRC = sys.argv[1] if len(sys.argv) > 1 else r'M:\Downloads\a823b6c6-02be-44e2-8558-d94abca2e46b.png'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'tex')
SEAMS = [0, 244, 491, 749, 1026, 1271, 1536]
WANT = {1: 'metal-blued', 2: 'metal-nickel', 3: 'metal-steel', 6: 'canvas'}   # 4 and 5 are Ben's two exclusions
SIZE = 512

def seamless(im):
    """Offset by half, then feather the cross that the offset puts in the middle."""
    w, h = im.size
    off = ImageChops.offset(im, w // 2, h // 2)
    # A feather band a sixteenth of the image wide either side of each seam: wide enough to hide a hard edge,
    # narrow enough that the photograph's own grain still reads as grain rather than as blur.
    band = max(8, w // 16)
    blur = off.copy()
    from PIL import ImageFilter
    blur = blur.filter(ImageFilter.GaussianBlur(band / 3.0))
    mask = Image.new('L', (w, h), 0)
    px = mask.load()
    for x in range(w):
        dx = abs(x - w // 2)
        for y in range(h):
            dy = abs(y - h // 2)
            d = min(dx, dy)
            px[x, y] = 0 if d > band else int(255 * (1.0 - d / band))
    return Image.composite(blur, off, mask)

def main():
    if not os.path.exists(SRC):
        print('no sheet at', SRC); return 1
    sheet = Image.open(SRC).convert('RGB')
    os.makedirs(OUT, exist_ok=True)
    for i, name in WANT.items():
        x0, x1 = SEAMS[i - 1], SEAMS[i]
        strip = sheet.crop((x0 + 3, 0, x1 - 3, sheet.size[1]))          # 3 px in from each seam: the seams are soft
        side = min(strip.size)
        strip = strip.crop((0, 0, side, side)).resize((SIZE, SIZE), Image.LANCZOS)
        out = seamless(strip)
        p = os.path.join(OUT, name + '.jpg')
        out.save(p, quality=92)
        print('wrote', p, out.size)
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
