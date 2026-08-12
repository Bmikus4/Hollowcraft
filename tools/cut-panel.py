#!/usr/bin/env python
"""Cut Ben's slate panels out of a game screenshot, and take the button texture off one.

Why it is not a colour key: the panel INTERIOR is as dark as the world behind it (max-channel
~8-40 for both), so nothing separates them by value. What IS separable is the gold FRAME, which
is the only bright thing in the shot besides the HUD bars. So the outline is found from the frame
and the panel is everything INSIDE that outline -- a filled quad, not a keyed region. The interior
never has to be distinguished from the background at all.

The two panels abut at x~682: the left one's right frame and the right one's left frame are the
same bright band, so a connected-component pass returns ONE blob spanning both. The seam is a
constant here rather than something detected, because there is nothing in the pixels that says
where one panel stops and the other starts.

    python tools/cut-panel.py            # writes assets/ui/plate_slate*.png + tex_slate.png
    python tools/cut-panel.py --proof    # also writes bench/results/cut-panel-proof.png
"""
import os, sys
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'ui', 'src', 'panel-shot.png')
OUT = os.path.join(ROOT, 'assets', 'ui')

# ONLY THE RIGHT PANEL. The two share their middle frame band, and on the left panel that band belongs to the
# neighbour -- its own frame comes back as three disconnected pieces, so minAreaRect fits the largest of them and
# returns a rectangle 200px short. Both panels are the same slate and the same trim, so the wider one is the asset and
# the narrow one is not worth a second heuristic.
HALVES = {'plate_slate': (682, 100, 1360, 820)}
FRAME_V = 45          # max-channel above which a pixel is gold frame rather than stone or world
TEX = (76, 70, 588, 582)     # interior crop for the button plate, in the CUT PLATE's own pixels (663x651)


def quad_of(sub):
    """The panel's outline, as a rotated rectangle fitted to its frame."""
    v = np.asarray(Image.fromarray(sub).convert('RGB'), dtype=np.float32).max(2)
    m = ((v > FRAME_V) * 255).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n < 2:
        sys.exit('no frame found')
    keep = 1 + int(np.argmax(stats[1:, 4]))
    pts = cv2.findNonZero((lab == keep).astype(np.uint8))
    return cv2.minAreaRect(pts)


def cut(name, box, proof=None):
    x0, y0, x1, y1 = box
    sub = np.asarray(Image.open(SRC).convert('RGB'))[y0:y1, x0:x1]
    (cx, cy), (w, h), ang = quad_of(sub)
    # minAreaRect reports the angle in [0,90); anything near 90 is the same rectangle stood on end.
    if ang > 45:
        ang -= 90; w, h = h, w
    M = cv2.getRotationMatrix2D((cx, cy), ang, 1.0)
    rot = cv2.warpAffine(sub, M, (sub.shape[1], sub.shape[0]), flags=cv2.INTER_LANCZOS4,
                         borderMode=cv2.BORDER_REPLICATE)
    # HALF A PIXEL IN, not on the line: the outermost row of the frame is half world colour after the
    # rotate, and left in, it shows as a dark hairline on every edge once the plate is on a light UI.
    w, h = int(round(w)) - 2, int(round(h)) - 2
    l, t = max(0, int(round(cx - w / 2))), max(0, int(round(cy - h / 2)))
    plate = rot[t:t + h, l:l + w]
    h, w = plate.shape[:2]                                 # the rect can run off the half it was cut from
    img = Image.fromarray(plate).convert('RGBA')
    a = np.full((h, w), 255, np.uint8)
    a[0, :] = a[-1, :] = a[:, 0] = a[:, -1] = 170          # one row of feather, so the edge is not a stair
    img.putalpha(Image.fromarray(a, 'L'))
    img.save(os.path.join(OUT, name + '.png'))
    if proof is not None:
        proof.append((name, img.copy()))
    return img


def main():
    if not os.path.exists(SRC):
        sys.exit('missing %s -- copy the screenshot there first' % SRC)
    proof = [] if '--proof' in sys.argv else None
    plates = {}
    for name, box in HALVES.items():
        plates[name] = cut(name, box, proof)
        print('%-18s %dx%d' % (name, plates[name].width, plates[name].height))

    # THE BUTTON TEXTURE. A menu button is 618x72 at 1080p, so a `repeat` of a small tile reads as
    # wallpaper; this is one generous piece of the slate, drawn with `cover`, and the stone's own
    # blotches carry it. Taken from the right panel, well inside its frame.
    x0, y0, x1, y1 = TEX
    tex = plates['plate_slate'].crop((x0, y0, x1, y1)).convert('RGB')
    tex.save(os.path.join(OUT, 'tex_slate.png'))
    print('%-18s %dx%d' % ('tex_slate', tex.width, tex.height))

    if proof is not None:
        pad = 12
        W = sum(p.width for _, p in proof) + pad * (len(proof) + 1) + tex.width
        H = max([p.height for _, p in proof] + [tex.height]) + pad * 2
        sheet = Image.new('RGB', (W, H), (150, 40, 140))    # magenta: any leaked transparency screams
        x = pad
        for _, p in proof:
            sheet.paste(p, (x, pad), p); x += p.width + pad
        sheet.paste(tex, (x, pad))
        out = os.path.join(ROOT, 'bench', 'results', 'cut-panel-proof.png')
        sheet.save(out); print('proof -> ' + out)


main()
