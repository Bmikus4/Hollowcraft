# BLOOD FX SHEETS (Ben 08-12: a splatter for block faces near an impact, and an impact mark + drip for characters).
# Bakes assets/blood/splatter.png, assets/blood/drip.png and assets/blood/impact.png from the sources Ben dropped on
# the Desktop. Re-run only if a source changes; the shipped PNGs and the .json beside them are the output.
#   python tools/blood-video.py
#
# WHY SHEETS AND NOT THE WEBM ITSELF. A VideoTexture is one decode for every element, and every decal sharing an
# element shows the same frame — so ten splats would animate in lockstep, and ten elements would be ten video decoders
# running behind the frame budget. A baked sheet is one texture upload, and each decal keeps its own cursor into it,
# which is how the muzzle flash already works (assets/fx/muzzle-flash.png). It also works over file://, which a
# canvas-read of a decoded video does not.
#
# THE SOURCES ARE ALPHA-PREVIEW RENDERS. "preview-large" means the transparency is drawn INTO the video as a grey
# checkerboard, so there is no alpha channel and luminance keying is useless — the checker is mid-grey, not black.
# What separates blood from checker is SATURATION: blood is the only saturated thing in frame. That is the same gate
# blood-assets.py uses to erase a stock watermark, and it takes the checkerboard out completely.
import json, os, shutil, subprocess, sys
import numpy as np
from PIL import Image

DESK = r"C:\Users\thera\Desktop"
OUT  = r"D:\Code\Minecraft\assets\blood"
TMP  = os.path.join(os.environ.get("TEMP", "."), "hc-blood-frames")

# name, source, grid, and the longest side a cell may take. The cell's OTHER side is derived from the content, not
# chosen: a spatter is filmed as a wide spray with a small dense centre, and forcing that into a square cell stretches
# the whole thing 1.4:1 wider than it was filmed. The runtime reads the cell size out of fx.json and sizes its quad to
# that aspect, so the shape of the decal in the world is decided here, once, by the footage.
JOBS = [
    dict(name="splatter", src=os.path.join(DESK, "BloodSplatter-018-preview-large.webm"), cols=6, rows=5, long=144),
    dict(name="drip",     src=os.path.join(DESK, "BloodFabric-002-preview-large.webm"),   cols=6, rows=5, long=192),
]

def key_blood(rgb):
    """RGBA from an alpha-preview frame: saturated red survives, grey checkerboard does not."""
    a = rgb.astype(np.float32)
    mx = a.max(2); mn = a.min(2)
    sat = np.where(mx > 1, (mx - mn) / np.maximum(mx, 1), 0.0)
    # RED specifically, not merely saturated: the checker corners alias into faint colour under video compression,
    # and a plain saturation gate lets that through as a pink haze over the whole cell.
    redness = np.clip((a[..., 0] - np.maximum(a[..., 1], a[..., 2])) / 255.0, 0, 1)
    alpha = np.clip(np.clip(sat * 1.9, 0, 1) * np.clip(redness * 3.4, 0, 1) ** 0.6, 0, 1)
    alpha[alpha < 0.06] = 0.0                       # hard floor, so a cell is not a 2% film
    # COLOUR FROM A RAMP, NOT FROM THE SOURCE PIXEL. Multiplying the source down turned every dim red pixel into a
    # near-BLACK one carrying real alpha, and at decal scale those read as black splotches around the blood rather
    # than as blood - visible the moment a mark was drawn two blocks wide on the giantess. A ramp keyed on density
    # cannot produce black: thin edges dry rusty brown, thick centres go dark maroon, and that is what blood does.
    d = alpha[..., None]
    # AND IT IS LIT, so the palette has to survive being multiplied by the light. These decals are Lambert - blood on a
    # wall at midnight should be as dark as the wall - and a maroon of luminance 34 times a dusk light of a third is
    # luminance 11, which is black. Measured over the baked sheets before this: min 23, mean 34. Roughly doubled, so
    # the blood still reads RED in the shade instead of as a hole in the world.
    thin = np.array([0xba, 0x42, 0x2c], np.float32)
    thick = np.array([0x78, 0x16, 0x12], np.float32)
    col = thin * (1.0 - d) + thick * d
    return np.dstack([np.clip(col, 0, 255), alpha * 255]).astype(np.uint8)

def frames_of(src):
    if os.path.isdir(TMP): shutil.rmtree(TMP)
    os.makedirs(TMP)
    subprocess.run(["ffmpeg", "-v", "error", "-i", src, os.path.join(TMP, "f_%04d.png"), "-y"], check=True)
    return sorted(os.path.join(TMP, f) for f in os.listdir(TMP) if f.endswith(".png"))

for job in JOBS:
    files = frames_of(job["src"])
    keyed = [key_blood(np.asarray(Image.open(f).convert("RGB"))) for f in files]
    # THE UNION BOX OVER EVERY FRAME, not per frame. Cropping each frame to its own content would slide the splatter
    # around inside the cell as it grows, so the decal would appear to crawl across the surface it is stuck to.
    #
    # AND IT IS THE BOX OF THE MASS, NOT OF THE FURTHEST SPECK. At a threshold of 8 a single flung droplet in a far
    # corner drags the box out to nearly the whole 1024x576 frame, and the blood then occupies about 30 px of a
    # 128 px cell — a quarter of the sheet doing all the work and the rest empty. 48 keeps the spatter that reads and
    # discards the lone specks that do not survive being scaled down anyway.
    box = None
    for k in keyed:
        ys, xs = np.nonzero(k[..., 3] > 48)
        if not len(xs): continue
        b = [xs.min(), ys.min(), xs.max() + 1, ys.max() + 1]
        box = b if box is None else [min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3])]
    if box is None: sys.exit(f"{job['name']}: nothing survived the key")
    # THE CELL TAKES THE CROP'S ASPECT. A stretched blood spatter reads as a smear pointing in a direction nothing in
    # the world explains, and this footage is 1.4:1 — so the cell is, and so is the quad the runtime builds from it.
    bw, bh = int(box[2] - box[0]), int(box[3] - box[1])
    k = job["long"] / max(bw, bh)
    cw, ch = max(2, round(bw * k / 2) * 2), max(2, round(bh * k / 2) * 2)
    job["cell"] = (cw, ch)
    n = job["cols"] * job["rows"]
    # Evenly across the whole clip, and the LAST source frame is always the last kept frame: the runtime holds that
    # frame for the rest of the decal's life, so it has to be the finished stain and not one sampled short of it.
    idx = [round(i * (len(keyed) - 1) / (n - 1)) for i in range(n)]
    sheet = Image.new("RGBA", (job["cols"] * cw, job["rows"] * ch), (0, 0, 0, 0))
    for i, fi in enumerate(idx):
        cell = Image.fromarray(keyed[fi], "RGBA").crop(box).resize((cw, ch), Image.LANCZOS)
        sheet.paste(cell, ((i % job["cols"]) * cw, (i // job["cols"]) * ch))
    sheet.save(os.path.join(OUT, job["name"] + ".png"))
    print(f"{job['name']}: {len(keyed)} source frames -> {n} cells {cw}x{ch}, crop {box}")

# THE IMPACT MARK, clipped out of the still Ben supplied. The sheet holds three holes; the left one is the only
# isolated one — the other two overlap each other, and a mark with half of its neighbour in the corner reads as a
# smear. Squared around the hole so the runtime can spin it without the corners clipping.
im = np.asarray(Image.open(os.path.join(DESK, "ccbd91929f19653df18c86272b9e9866.jpg")).convert("RGB"))
mark = key_blood(im)
# A HARDER FLOOR THAN THE VIDEO GETS. This source is a lossy JPEG of saturated red on black, and that combination
# rings: a desaturated halo survives the redness gate as grey mush around the mark. The video frames do not need this
# because the checkerboard already forced the gate to be strict.
mark[..., 3] = np.where(mark[..., 3] < 46, 0, mark[..., 3])
sub = mark[60:330, 30:340]                        # the left hole, with its flung spatter
ys, xs = np.nonzero(sub[..., 3] > 8)
cy, cx = (ys.min() + ys.max()) // 2, (xs.min() + xs.max()) // 2
r = int(max(ys.max() - ys.min(), xs.max() - xs.min()) / 2) + 4
pad = np.zeros((r * 2, r * 2, 4), np.uint8)
y0, x0 = max(0, cy - r), max(0, cx - r)
chunk = sub[y0:cy + r, x0:cx + r]
pad[:chunk.shape[0], :chunk.shape[1]] = chunk
Image.fromarray(pad, "RGBA").resize((128, 128), Image.LANCZOS).save(os.path.join(OUT, "impact.png"))
print(f"impact: clipped {chunk.shape[1]}x{chunk.shape[0]} -> 128x128")

json.dump({j["name"]: dict(cols=j["cols"], rows=j["rows"], cell=list(j["cell"])) for j in JOBS},
          open(os.path.join(OUT, "fx.json"), "w"), indent=1)
if os.path.isdir(TMP): shutil.rmtree(TMP)
