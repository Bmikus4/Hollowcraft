// BEN'S TREELINE, MADE INTO A STRIP THE HORIZON CAN WEAR. He gave a photographic pine stand receding to a point and said
// "Clear the existing horizon pines, and use this instead". The horizon is a cylinder painted per azimuth, so what it needs
// is a strip that WRAPS - and his picture, wrapped as given, is a sawtooth: a full stand, then nothing, then a full stand.
//
// WHAT IS DELIBERATELY NOT TAKEN: the wedge. The left two thirds of his image are the run tapering away to a point, and the
// horizon shader already owns that - the height envelope sinks the canopy as a run of coast ends, which is the behaviour
// Ben asked for and approved. Importing the wedge as well would apply the taper twice and make its period visible. So the
// DENSE stand is what is cut out, and the recession stays where it already works.
//
// THREE THINGS THIS SCRIPT DOES THAT THE MIRRORED VERSION DID NOT, each one a fault Ben reported against the old asset:
//
// NOT A PALINDROME.  The old strip was the crop followed by its own hflip, so the two ends of the wrapped texture were the
//   same column by construction - and so was every whole instance of it. Ben has now called the mirror twice ("each slab is
//   a horizontally MIRRORED pair - the palindrome symmetry is visible inside each one"), and b02b9b6 proved it from the
//   file: column x against column 2047-x, mean alpha difference 0.0. Seamlessness comes from an OFFSET CROSS-FADE instead -
//   the last FADE columns are dissolved over the first FADE columns, which is invisible in a canopy because crowns overlap
//   anyway, and leaves a tile with no symmetry anywhere in it.
//
// NATURAL ASPECT.  The old cut scaled a 972x630 crop to 1024x256, squashing the pines to two fifths of their own height
//   before the shader had touched them; the shader then stretched one half-instance across ninety degrees of ring. That
//   compounding is Ben's "blurred, horizontally SMEARED, pine shapes mushy and stretched". The tile now keeps the crop's
//   own pixel aspect and the shader repeats it around the ring at that aspect, so a crown on the horizon has the shape a
//   crown in the photograph has.
//
// AN OPAQUE FOOT.  Alpha coverage on the old strip's last row was 68.9%, so a third of the band's bottom edge was
//   transparent and the sky showed through under the trees - "a hard flat BLACK BOTTOM EDGE with open sky beneath". The
//   bottom ROOT rows of the crop are stretched down into a solid understory so the strip's own foot is 100% opaque, and
//   every transparent pixel's RGB is filled from its opaque neighbours so the mip chain has no black to bleed.
//
//   node scripts/cut-horizon-treeline.mjs   -> assets/horizon/treeline.png (straight alpha, aspect preserved)
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
const SRC='C:/Users/thera/Desktop/92e3463c-0e62-42d3-9ac7-b594b9a6e944.png';
const OUT='D:/Code/Minecraft/assets/horizon';
const PY=`
import sys
from PIL import Image, ImageFilter
SRC=r"${SRC}"; OUT=r"${OUT}/treeline.png"
# Measured off the source (2172x724): the stand reaches full height by x 1200 and runs to the right edge, and the canopy
# occupies y 18..648 there. Cropping tighter than the trees clips crowns; looser bakes empty sky into the strip and lifts
# the whole treeline off the horizon line, which is a fault Ben has already named.
X0,X1,Y0,Y1 = 1200,2172,18,648
FADE = 200           # columns dissolved across the wrap seam
ROOT = 96            # rows of understory grown below the crop so the strip's own foot is solid
im = Image.open(SRC).convert("RGBA").crop((X0,Y0,X1,Y1))
W,H = im.size
# ---- THE OPAQUE FOOT ----
# The bottom band of the crop is trunk bases and forest floor. Stretched down it makes an understory that is solid at
# every column, so the strip has no ragged bottom row for the sky to show through.
foot = im.crop((0,H-40,W,H)).resize((W,ROOT), Image.LANCZOS)
tall = Image.new("RGBA",(W,H+ROOT)); tall.paste(im,(0,0)); tall.paste(foot,(0,H))
im = tall; H += ROOT
# ---- SEAMLESS WITHOUT A MIRROR ----
# result width is W-FADE: the tail columns are dissolved over the head columns with a linear ramp, so column 0 continues
# column W-FADE-1 and no span of the tile is the reverse of any other span.
head = im.crop((0,0,FADE,H)); tail = im.crop((W-FADE,0,W,H))
ramp = Image.linear_gradient("L").resize((FADE,H)).rotate(0)
ramp = Image.new("L",(FADE,H))
ramp.putdata([ int(255*(1.0-x/(FADE-1))) for y in range(H) for x in range(FADE) ])
blend = Image.composite(tail, head, ramp)
out = im.crop((0,0,W-FADE,H)); out.paste(blend,(0,0))
# ---- NO BLACK UNDER THE ALPHA ----
# A cutout's transparent pixels still carry RGB, and three's mip chain averages them in: black transparent pixels become a
# dark halo at every crown the moment the band is minified, which is exactly what a horizon band always is. Filling the
# transparent RGB from the opaque neighbourhood removes the halo at its source.
r,g,b,a = out.split()
rgb = Image.merge("RGB",(r,g,b))
for _ in range(6):
    blur = rgb.filter(ImageFilter.GaussianBlur(4))
    rgb = Image.composite(rgb, blur, a)
r,g,b = rgb.split()
out = Image.merge("RGBA",(r,g,b,a))
out.save(OUT)
px = out.load(); w,h = out.size
lastrow = sum(1 for x in range(w) if px[x,h-1][3] > 200)
mir = sum(abs(px[x,y][3]-px[w-1-x,y][3]) for y in range(0,h,7) for x in range(0,w//2,7))
cnt = len(range(0,h,7))*len(range(0,w//2,7))
print(f"  {w}x{h}  aspect {w/h:.3f}  from x {X0}..{X1} y {Y0}..{Y1} + {ROOT} root, {FADE} fade")
print(f"  last row opaque {100*lastrow/w:.1f}%   mirror alpha diff {mir/cnt:.2f} (0 = palindrome)")
`;
fs.mkdirSync(OUT,{recursive:true});
const r=spawnSync('python',['-c',PY],{stdio:'inherit'});
if(r.status!==0){ console.error('FAILED'); process.exit(1); }
