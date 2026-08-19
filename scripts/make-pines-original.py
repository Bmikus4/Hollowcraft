# Build assets/horizon/pines-original.png from the horizon-pines image Ben supplied.
#
# The current source (docs/ref/pines-source.png) already carries a real alpha channel -- measured,
# fully transparent at the top and bottom and dense through the middle -- so unlike the earlier white-background
# strip there is nothing to key out. The one thing that DOES matter is the transparent MARGIN: the game stands
# the quad's bottom edge on the waterline, so any empty rows underneath the trees would float the whole stand
# above the sea. The image is trimmed to its alpha bounding box, which makes the quad's edges the picture's
# edges and the aspect below honest.
from PIL import Image

SRC = 'docs/ref/pines-source.png'
OUT = 'assets/horizon/pines-original.png'

im = Image.open(SRC).convert('RGBA')
w, h = im.size
bbox = im.split()[3].getbbox()          # tightest box holding any non-zero alpha
if bbox is None:
    raise SystemExit('the source has no opaque pixels at all')
out = im.crop(bbox)
out.save(OUT)
ow, oh = out.size
print(f'{SRC} {w}x{h}  content bbox {bbox}')
print(f'  trimmed {w-ow} px of width and {h-oh} px of height of pure margin')
print(f'  wrote {OUT} {ow}x{oh}  aspect {ow/oh:.4f}   <-- _PIN_ASPECT')
