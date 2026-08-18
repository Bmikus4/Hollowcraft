# Build assets/horizon/pines-original.png from the image Ben supplied as the source
# (docs/ref/pines-target-source-strip.png).
#
# WHY THIS EXISTS. His file is 1964x801 and FULLY OPAQUE -- measured, alpha 255 on every row. It looks
# transparent because the background is white, not because it carries a matte. Drawn on a quad as-is it is a
# white rectangle on the horizon. So the background is keyed out here, once, into an asset the game loads.
#
# KEYED FROM THE BORDER INWARD, not by "is this pixel white". A global white test also removes the bright water
# highlights and the pale sky caught between the trunks, which are part of the picture. A flood fill from the
# edges only takes background that is actually connected to the outside.
import sys
from collections import deque
from PIL import Image

SRC = 'docs/ref/pines-target-source-strip.png'
OUT = 'assets/horizon/pines-original.png'
THRESH = 234        # min channel value to count as background white
FEATHER = 2         # px of soft edge, so the cut does not alias against the sky

im = Image.open(SRC).convert('RGBA')
w, h = im.size
px = im.load()

bg = bytearray(w * h)
q = deque()
def push(x, y):
    if 0 <= x < w and 0 <= y < h and not bg[y*w+x]:
        r, g, b, _ = px[x, y]
        if min(r, g, b) >= THRESH:
            bg[y*w+x] = 1
            q.append((x, y))

for x in range(w):
    push(x, 0); push(x, h-1)
for y in range(h):
    push(0, y); push(w-1, y)
while q:
    x, y = q.popleft()
    push(x+1, y); push(x-1, y); push(x, y+1); push(x, y-1)

# Distance-to-background feather: a pixel one step from the cut keeps part of its alpha, so the treetops do not
# come out as a hard stencil.
alpha = [255] * (w*h)
for i in range(w*h):
    if bg[i]:
        alpha[i] = 0
for _ in range(FEATHER):
    nxt = alpha[:]
    for y in range(h):
        for x in range(w):
            i = y*w+x
            if alpha[i] == 0:
                continue
            lo = 255
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx, ny = x+dx, y+dy
                if 0 <= nx < w and 0 <= ny < h:
                    lo = min(lo, alpha[ny*w+nx])
            if lo < alpha[i]:
                nxt[i] = min(alpha[i], lo + 255//(FEATHER+1))
    alpha = nxt

out = Image.new('RGBA', (w, h))
op = out.load()
for y in range(h):
    for x in range(w):
        r, g, b, _ = px[x, y]
        op[x, y] = (r, g, b, alpha[y*w+x])
out.save(OUT)

cut = sum(bg)
print(f'{SRC} {w}x{h} aspect {w/h:.4f}')
print(f'  background keyed from the border: {cut} px ({100*cut/(w*h):.1f}%) -> alpha 0')
print(f'  wrote {OUT}')
# Where the trees actually are, so the game can be told what fraction of the image is sky.
first = None
for y in range(h):
    if any(alpha[y*w+x] > 128 for x in range(0, w, 7)):
        first = y; break
print(f'  first row with any opaque content: {first} ({first/h:.3f} from the top)')
