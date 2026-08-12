"""Score the 1080p asset pass: how hard is the frame's edge, in the pixels the player actually sees.

Edge energy (mean |Laplacian| over the border strip) is the number that moves. A frame stretched from a 58px cell
lands as a long soft ramp; the same drawing baked at 4x lands as a step. Both crops are the SAME element at the SAME
screen size, so nothing but the source resolution differs.
"""
import sys, os
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results')


def energy(path, strip=26):
    im = np.asarray(Image.open(os.path.join(OUT, path)).convert('L'), dtype=np.float32)
    h, w = im.shape
    # The border only: the middle of a button is a flat plate and would dilute the score to nothing.
    mask = np.zeros_like(im, dtype=bool)
    mask[:strip, :] = mask[-strip:, :] = True
    mask[:, :strip] = mask[:, -strip:] = True
    lap = np.abs(np.gradient(im)[0]) + np.abs(np.gradient(im)[1])
    return float(lap[mask].mean()), im.shape


rows = []
for name, a, b in [('menu button', 'ui1080-btn-1x.png', 'ui1080-btn-4x.png'),
                   ('pause card', 'ui1080-card-1x.png', 'ui1080-card-4x.png')]:
    e1, s1 = energy(a)
    e4, s4 = energy(b)
    rows.append((name, e1, e4, e4 / e1 if e1 else 0, s1, s4))

print('%-13s %10s %10s %8s   %s' % ('', '1x', '4x', 'gain', 'crop'))
ok = True
for name, e1, e4, g, s1, s4 in rows:
    print('%-13s %10.3f %10.3f %7.2fx   %s' % (name, e1, e4, g, 'x'.join(map(str, s1[::-1]))))
    if s1 != s4:
        print('   MISMATCHED CROPS — the A/B is not comparing the same pixels'); ok = False
    if g <= 1.0:
        print('   NO GAIN — the 4x bake is not sharper here'); ok = False
sys.exit(0 if ok else 1)
