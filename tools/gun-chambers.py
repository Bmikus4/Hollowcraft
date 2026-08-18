#!/usr/bin/env python
"""Measure a revolver GLB's CHAMBERS -- the bolt circle they sit on and their bore radius -- off the mesh itself.

WHY THIS EXISTS. GLB_GUNS.revolver.cyl declares bolt:0.057 chamber:0.026, and the comment beside the cartridge builder
says both came from tools/gun-cylinder.py's sweep. They did not: that script measures the drum's two end faces and its
outer wall and has no bolt-circle code in it at all. Photographed with the brass painted through the gun
(bench/tmp-rev-chambers.mjs), the six cases come out as a tight rosette around the bore, entirely buried inside the
drum's metal -- invisible in play, which is Ben's "the chambers are still empty", reported four times.

THE TRAP THAT MADE THE OLD NUMBER WRONG. gun-cylinder.py measures radius from the BARREL BORE. The drum does not turn
about the bore -- it turns about an axis one bolt-circle radius BELOW it, because the chamber that lines up with the
barrel is the top one. Measuring a circle from a point offset from its centre returns everything between R-offset and
R+offset, which is why that script reports meanR 0.111 against maxR 0.149 on the same dense slice. So this script finds
the drum axis first and measures everything from there.

HOW THE AXIS IS FOUND. The gun is symmetric about z, so the axis is z=0 and only its height is unknown. The drum's
outer wall is a circle about that axis; sweep candidate heights and keep the one that makes the outer envelope most
nearly constant. That is a fit to the mesh, not a ratio taken from another gun.

HOW THE CHAMBERS ARE FOUND. With the axis known, every vertex in the drum's x range has an angle about it. Six bores
give six clusters at 60 degrees apart; each cluster's centroid distance from the axis IS the bolt circle, and its
spread about that centroid IS the chamber radius. Both are reported with their scatter, because a tight number from a
loose cluster is the same lie as an unmeasured one.

    python tools/gun-chambers.py                  # the revolver
    python tools/gun-chambers.py guns/revolver-rail
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
P = np.stack([raw[:, 0], raw[:, 2], -raw[:, 1]], 1)          # the node's -90 X rotation, applied (same as gun-cylinder.py)
place = json.load(open(PLACE))['models'][MODEL]
bore = place['boreY']

print('%s  verts=%d  scale=%g  boreY=%.4f' % (MODEL, len(P), scale, bore))

# ---- THE DRUM'S X RANGE ----
# The two end faces are the dense vertex rings a fluted circle produces, which is gun-cylinder.py's own finding; taken
# from the mesh here rather than trusted from the JSON so this script stands alone.
rb = np.hypot(P[:, 1] - bore, P[:, 2])
top = place['bbox']['max'][1]
hi = min(0.34, (top - bore) * 1.05)
band = (rb > hi * 0.5) & (rb < hi)
slices = []
for a in np.arange(0.0, P[:, 0].max(), 0.025):
    m = band & (P[:, 0] >= a) & (P[:, 0] < a + 0.025)
    if m.sum(): slices.append((a, int(m.sum())))
peak = max(n for _, n in slices)
dense = [a for a, n in slices if n >= peak * 0.25]
x0, x1 = dense[0], dense[-1] + 0.025
print('drum x range from the dense rings: %.3f .. %.3f' % (x0, x1))

drum = (P[:, 0] >= x0) & (P[:, 0] <= x1)
D = P[drum]
print('drum verts=%d' % len(D))

# ---- THE DRUM AXIS ----
# Sweep the axis height; score each candidate by how constant the OUTER envelope is about it. The envelope is the top
# decile of radius, which is the outer wall wherever the drum is not hollowed.
best = None
for y0 in np.arange(bore - 0.20, bore + 0.02, 0.0005):
    r = np.hypot(D[:, 1] - y0, D[:, 2])
    env = r[r >= np.quantile(r, 0.90)]
    if len(env) < 8: continue
    score = env.std() / max(env.mean(), 1e-6)
    if best is None or score < best[0]: best = (score, y0, env.mean())
score, yAxis, rDrum = best
print('drum axis  y=%.4f  (%.4f below the bore)   outer radius=%.4f   envelope cv=%.4f'
      % (yAxis, bore - yAxis, rDrum, score))

r = np.hypot(D[:, 1] - yAxis, D[:, 2])
th = np.arctan2(D[:, 2], D[:, 1] - yAxis)

# ---- THE CHAMBERS ----
# Everything inside the outer wall is a candidate: the bores, the flutes between them and the end faces. Six bores at
# 60 degrees apart fold onto one lobe when the angle is taken modulo 60, so the fold is what finds them without having
# to guess which one is at top dead centre.
inner = r < rDrum * 0.92
print('inner verts=%d of %d' % (int(inner.sum()), len(D)))
fold = (np.degrees(th[inner]) % 60.0)
rr = r[inner]
print('\nradius profile of the inner surfaces, by folded angle (6-fold):')
for a in range(0, 60, 5):
    m = (fold >= a) & (fold < a + 5)
    if m.sum():
        print('  %2d-%2d deg  n=%4d  meanR=%.4f  minR=%.4f  maxR=%.4f' % (a, a + 5, m.sum(), rr[m].mean(), rr[m].min(), rr[m].max()))

# Cluster properly: assign each inner vertex to its nearest of six spokes, then take each spoke's centroid in the plane.
# A bore's vertices ring its own centre, so the centroid IS the chamber centre and the mean distance to it is the radius.
print('\nper-chamber fit (six spokes):')
Rb, Rc = [], []
for k in range(6):
    a0 = -180 + k * 60
    m = inner & (np.degrees(th) >= a0) & (np.degrees(th) < a0 + 60)
    if m.sum() < 6:
        print('  spoke %d: n=%d, too few to fit' % (k, int(m.sum()))); continue
    S = D[m]
    cy, cz = S[:, 1].mean(), S[:, 2].mean()
    d = np.hypot(S[:, 1] - cy, S[:, 2] - cz)
    rad = np.hypot(cy - yAxis, cz)
    Rb.append(rad); Rc.append(np.quantile(d, 0.75))
    print('  spoke %d: n=%4d  centre=(%.4f,%.4f)  boltR=%.4f  spread p75=%.4f' % (k, int(m.sum()), cy, cz, rad, np.quantile(d, 0.75)))

if Rb:
    print('\n---- WHAT TO DECLARE ----')
    print('  measured boltR    = %.4f  (sd %.4f over %d spokes)' % (np.mean(Rb), np.std(Rb), len(Rb)))
    print('  measured chamberR = %.4f  (sd %.4f)' % (np.mean(Rc), np.std(Rc)))
    print('  drum outer radius = %.4f' % rDrum)
    print('  bolt/outer        = %.3f      chamber/outer = %.3f' % (np.mean(Rb) / rDrum, np.mean(Rc) / rDrum))
    print('  axis sits %.4f below the bore; for a top-chamber-on-bore revolver that SHOULD equal boltR.' % (bore - yAxis))
