#!/usr/bin/env python
"""Measure a gun GLB's cylinder -- its two end faces and its outer wall -- off the mesh itself.

Written for the revolver's loaded chambers. assets/models/placement-data.json has no cylinder landmark: the generic
detector labels the region under the barrel `magRange`, and on guns/revolver that box (x 0.246..0.346, top 0.057) is
the TRIGGER GUARD, 0.37 below the bore. So the numbers in GLB_GUNS.revolver.cyl come from here.

Two traps this script exists to avoid:
  * The node carries a -90 degrees X rotation and a scale of 100, so raw vertices are neither in placement space nor
    in placement units. placement = (x, z, -y) * 100, which is what makes the bbox printed here match the JSON's.
  * Radius has to be measured from the BORE AXIS, not from the model origin. Measured from the origin the grip is the
    widest thing on the gun and the cylinder does not stand out at all.

    python tools/gun-cylinder.py                  # the revolver
    python tools/gun-cylinder.py guns/shotgun     # any other model
"""
import json, os, struct, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = sys.argv[1] if len(sys.argv) > 1 else 'guns/revolver'
GLB = os.path.join(ROOT, 'assets', 'models', *MODEL.split('/')) + '.glb'
PLACE = os.path.join(ROOT, 'assets', 'models', 'placement-data.json')


def load(path):
    d = open(path, 'rb').read()
    off, js, bins = 12, None, []
    while off < len(d):
        ln, ty = struct.unpack_from('<II', d, off); off += 8
        if ty == 0x4E4F534A: js = json.loads(d[off:off + ln].decode('utf-8'))
        elif ty == 0x004E4942: bins.append(d[off:off + ln])
        off += ln
    return js, bins[0]


def positions(js, buf):
    out = []
    for mesh in js['meshes']:
        for pr in mesh['primitives']:
            a = js['accessors'][pr['attributes']['POSITION']]
            v = js['bufferViews'][a['bufferView']]
            o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
            st = v.get('byteStride') or 12
            out.append(np.array([struct.unpack_from('<3f', buf, o + k * st) for k in range(a['count'])], np.float32))
    return np.concatenate(out)


js, buf = load(GLB)
scale = 1.0
for nd in js['nodes']:
    if nd.get('scale'): scale = float(nd['scale'][0])
raw = positions(js, buf) * scale
P = np.stack([raw[:, 0], raw[:, 2], -raw[:, 1]], 1)      # the node's -90 X rotation, applied
bore = json.load(open(PLACE))['models'][MODEL]['boreY']
r = np.hypot(P[:, 1] - bore, P[:, 2])

print('%s  verts=%d  scale=%g  boreY=%.4f' % (MODEL, len(P), scale, bore))
print('placement bbox  min=%s  max=%s' % (P.min(0).round(4), P.max(0).round(4)))
# THE BAND IS BOUNDED BY THE TOP OF THE GUN, and getting that wrong is the whole trap. A drum wider than the distance
# from the bore up to the rib would stand out of the gun's own silhouette, so on this model nothing above r=0.14 can be
# cylinder -- it is grip, trigger guard or hammer. The first version of this script swept 0.20..0.34, found the grip,
# and reported a wall of 0.33: cartridges came out as bananas the length of the barrel.
top = json.load(open(PLACE))['models'][MODEL]['bbox']['max'][1]
hi = min(0.34, (top - bore) * 1.05)
lo = hi * 0.5
wall = (r > lo) & (r < hi)
print('\nouter-wall vertices by x slice (radius %.2f..%.2f from the bore axis, ceiling = gun top):' % (lo, hi))
rows = []
for a in np.arange(0.0, P[:, 0].max(), 0.025):
    m = wall & (P[:, 0] >= a) & (P[:, 0] < a + 0.025)
    if m.sum():
        rows.append((a, m.sum(), r[m].mean(), r[m].max()))
        print('  x %5.3f  n=%4d  meanR=%.3f  maxR=%.3f' % rows[-1])
if rows:
    dense = [t for t in rows if t[1] >= max(t[1] for t in rows) * 0.25]
    print('\nthe two END FACES are the dense rings: a fluted circle is many vertices at one x.')
    print('  suggested cyl:{rear:%.3f, front:%.3f, wall:%.2f}'
          % (dense[0][0], dense[-1][0] + 0.025, max(t[3] for t in dense)))
