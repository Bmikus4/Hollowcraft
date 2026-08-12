#!/usr/bin/env python
"""Cut Ben's UI asset pack into named PNGs under assets/ui/.

The pack is a contact sheet: every element sits on the same flat charcoal grain
(V ~= 26 on the max-channel), so a slice is a rectangle plus a decision about
that backdrop. Three modes:

  key    the element is bright line-art on the grain. Alpha ramps from the
         backdrop level, and the RGB is un-premultiplied back off the grain --
         without that, every antialiased edge keeps a dark fringe that reads as
         a grey halo once the asset sits on a lighter surface.
  panel  the element IS a dark texture (inventory plates, multi-slot beds). Its
         interior is only ~10 levels above the grain, too close to key, so the
         mask is a threshold + close + hole-fill and the RGB is left alone.
  keyraw same as key but the rect is taken verbatim -- for strips whose parts
         are deliberately detached (the compass ribbon's ticks sit clear of its
         rule, and tighten's caption filter would read them as a caption).
  solid  grunge tiles and palette chips: opaque crop, no mask.

Rects are in sheet pixels and live here, in this file, so a re-cut is one
command. `tighten` shrinks a generous hand-measured rect onto the ink it
contains, which is why the numbers below do not need to be exact.

    python tools/ui-slice.py            # writes assets/ui/*.png + manifest.json
    python tools/ui-slice.py --contact  # also writes a labelled proof sheet
"""
import json, os, sys
from PIL import Image, ImageFilter
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'assets', 'ui', 'src')
OUT_DIR = os.path.join(ROOT, 'assets', 'ui')
PACK = os.path.join(SRC_DIR, 'asset-pack.png')

# The grain the whole sheet is drawn on, and the window the alpha ramp spans.
BG = np.array([26, 26, 25], dtype=np.float32)
KEY_LO, KEY_HI = 38.0, 72.0

# name: (x, y, w, h, mode)  -- sheet pixels, 1536x1024
SLICES = {
    # --- section 1: frames, panels, dividers -------------------------------
    'frame_main':    (14, 48, 214, 170, 'key'),     # 01 ornate inventory frame (the sheet prints a separate
                                                    # rule-and-diamond header above it; starting at 13 took that in)
    'rail_a':        (245, 155, 143, 15, 'key'),    # 05 long ornate rail
    'rail_b':        (245, 197, 143, 16, 'key'),    # 07 lighter rail
    'panel_tall':    (532, 68, 90, 170, 'panel'),   # 12 plate, portrait
    'panel_wide':    (630, 66, 123, 58, 'panel'),
    'panel_mid':     (630, 133, 123, 53, 'panel'),
    'panel_crack':   (630, 193, 123, 56, 'panel'),  # 12 with gold crack veins
    'divider':       (275, 345, 152, 14, 'key'),    # 19 hairline rule
    'tick':          (453, 304, 18, 70, 'key'),     # 20 vertical tick
    'corner_a':      (113, 323, 42, 54, 'key'),     # 16 corner brace
    'corner_b':      (194, 323, 48, 54, 'key'),

    # --- slots -------------------------------------------------------------
    'slot':          (20, 224, 100, 86, 'key'),     # 13 resting cell
    'slot_hover':    (123, 224, 94, 86, 'key'),     # 14 white bloom
    'slot_sel':      (220, 224, 97, 86, 'key'),     # 15 gold bloom
    'slot_x':        (320, 224, 100, 86, 'key'),    # 16 blocked
    'slot_small':    (28, 323, 68, 54, 'key'),      # 17

    # --- multi-slot beds (21-27) -------------------------------------------
    'ms_1x1':        (22, 387, 52, 95, 'panel'),
    'ms_1x2':        (88, 387, 53, 96, 'panel'),
    'ms_1x3':        (156, 387, 106, 97, 'panel'),
    'ms_1x4':        (278, 387, 90, 97, 'panel'),
    'ms_2x2':        (384, 387, 86, 92, 'panel'),
    'ms_2x3':        (487, 382, 107, 108, 'panel'),
    'ms_3x3':        (612, 380, 135, 124, 'panel'),

    # --- highlights and buttons (28-37) ------------------------------------
    'hl_green':      (18, 514, 104, 47, 'key'),
    'hl_red':        (128, 514, 106, 47, 'key'),
    'hl_cyan':       (240, 514, 106, 46, 'key'),
    'hl_gold':       (355, 514, 105, 46, 'key'),
    'hl_white':      (471, 514, 106, 46, 'key'),
    'btn_gold':      (17, 581, 65, 66, 'key'),      # 33
    'btn_white':     (96, 581, 65, 66, 'key'),      # 29
    'btn_dash':      (174, 581, 66, 66, 'key'),     # 35 dashed ghost
    'btn_green':     (254, 581, 66, 66, 'key'),     # 36
    'btn_red':       (336, 582, 65, 65, 'key'),     # 37

    # --- badges (38-46) ----------------------------------------------------
    'badge_x99':     (418, 620, 30, 22, 'key'),
    'badge_dura':    (457, 620, 81, 22, 'key'),
    'badge_lock':    (551, 607, 29, 36, 'key'),
    'badge_star':    (593, 611, 24, 24, 'key'),
    'badge_warn':    (627, 609, 35, 34, 'key'),
    'badge_gold':    (675, 613, 33, 32, 'key'),
    'badge_haz':     (718, 615, 33, 28, 'key'),

    # --- hotbar system (47-62) ---------------------------------------------
    'hotbar_strip':  (30, 670, 706, 70, 'key'),     # 47 whole ribbon
    'hotbar_rose':   (35, 675, 100, 82, 'key'),     # its compass rose end
    'cap_left':      (28, 765, 99, 40, 'key'),      # 48
    'cap_right':     (158, 765, 70, 40, 'key'),     # 49
    'rail_bot':      (28, 818, 200, 40, 'key'),     # 50
    'hcell':         (245, 770, 60, 60, 'key'),     # 51
    'hcell_sel':     (313, 770, 62, 60, 'key'),     # 52
    'hcell_white':   (378, 770, 70, 60, 'key'),     # 53
    'hcell_x':       (453, 770, 65, 60, 'key'),     # 54

    # --- compass parts (63-70) ---------------------------------------------
    'ring':          (22, 860, 88, 72, 'key'),      # 63
    'rose':          (115, 863, 72, 62, 'key'),     # 64
    'needle':        (195, 860, 50, 68, 'key'),     # 55 red needle
    'wing_l':        (250, 875, 48, 42, 'key'),     # 66
    'wing_r':        (306, 875, 46, 42, 'key'),     # 67
    'rule':          (365, 881, 84, 22, 'key'),     # 68
    'dia_sm':        (460, 881, 30, 28, 'key'),     # 29
    'dia_md':        (506, 878, 34, 32, 'key'),     # 70
    'grunge_a':      (552, 887, 64, 44, 'solid'),   # 71
    'grunge_b':      (675, 887, 76, 44, 'solid'),   # 72

    # --- section 2: compass ribbon (01-10) ---------------------------------
    'ribbon_left':   (790, 68, 205, 34, 'keyraw'),
    'ribbon_right':  (1019, 68, 235, 34, 'keyraw'),
    'nav_dia_a':     (1276, 72, 22, 28, 'key'),
    'nav_dia_b':     (1357, 63, 26, 36, 'key'),
    'nav_dia_c':     (1415, 62, 31, 37, 'key'),
    'nav_dia_d':     (1471, 62, 32, 36, 'key'),

    # --- core status icons (11-17) -----------------------------------------
    'icon_eye':      (861, 150, 93, 46, 'key'),
    'icon_shield':   (998, 146, 48, 57, 'key'),
    'icon_steps':    (1077, 148, 54, 54, 'key'),
    'icon_hazard':   (1159, 140, 66, 64, 'key'),
    'icon_cross_w':  (1247, 142, 57, 59, 'key'),
    'icon_cross_g':  (1337, 142, 56, 59, 'key'),
    'icon_cross_r':  (1429, 142, 57, 59, 'key'),

    # --- survival bars (18-29): full body then the dark trough -------------
    'bar_red':       (817, 228, 250, 30, 'key'),
    'bar_red_bed':   (1340, 228, 156, 30, 'key'),
    'bar_green':     (817, 272, 250, 28, 'key'),
    'bar_green_bed': (1340, 272, 156, 28, 'key'),
    'bar_blue':      (817, 315, 250, 29, 'key'),
    'bar_blue_bed':  (1340, 315, 156, 29, 'key'),
    'bar_gold':      (817, 357, 250, 31, 'key'),
    'bar_gold_bed':  (1340, 357, 156, 31, 'key'),

    # --- buffs / effects (30-47) -------------------------------------------
    'buff_leaf':     (824, 405, 33, 42, 'key'),
    'buff_fire':     (899, 404, 35, 45, 'key'),
    'buff_snow':     (968, 405, 40, 45, 'key'),
    'buff_bolt':     (1041, 405, 30, 44, 'key'),
    'buff_skull':    (1109, 403, 34, 45, 'key'),
    'buff_cross':    (1184, 410, 36, 36, 'key'),
    'buff_star':     (1253, 406, 42, 42, 'key'),
    'buff_potion':   (1329, 406, 29, 43, 'key'),
    'buff_eye':      (1390, 412, 50, 31, 'key'),
    'ring_green':    (806, 472, 66, 64, 'key'),
    'ring_red':      (886, 473, 70, 77, 'key'),
    'ring_white':    (977, 470, 70, 64, 'key'),
    'ring_grey':     (1065, 473, 65, 77, 'key'),
    'ring_dark':     (1139, 471, 62, 60, 'key'),
    'tri_warn':      (1218, 477, 54, 51, 'key'),
    'dia_warn':      (1288, 475, 61, 56, 'key'),
    'icon_hand':     (1367, 473, 49, 54, 'key'),
    'ring_gold':     (1435, 464, 65, 58, 'key'),

    # --- crosshairs / interaction (48-57) ----------------------------------
    'xh_plus':       (795, 555, 62, 62, 'key'),
    'xh_dot':        (872, 570, 30, 30, 'key'),
    'xh_ring':       (937, 559, 54, 54, 'key'),
    'xh_x':          (1000, 559, 58, 54, 'key'),
    'xh_skull':      (1087, 557, 43, 56, 'key'),
    'xh_claw':       (1159, 557, 50, 55, 'key'),
    'xh_arrows':     (1230, 550, 69, 68, 'key'),
    'xh_ring2':      (1313, 559, 51, 51, 'key'),
    'icon_key':      (1381, 561, 49, 49, 'key'),
    'icon_crate':    (1446, 554, 51, 60, 'key'),

    # --- HUD decorations (58-62) -------------------------------------------
    'deco_rule':     (790, 645, 290, 26, 'key'),
    'deco_star':     (1149, 639, 97, 39, 'key'),
    'deco_check':    (1286, 643, 54, 27, 'key'),
    'deco_pick':     (1378, 641, 49, 38, 'key'),

    # --- grunge (63-80) ----------------------------------------------------
    'tex_ash':       (789, 688, 79, 59, 'solid'),
    'tex_dust':      (881, 689, 83, 58, 'solid'),
    'tex_veins':     (976, 688, 85, 59, 'solid'),
    'tex_web':       (1075, 690, 73, 56, 'solid'),
    'tex_crack':     (1166, 690, 81, 57, 'solid'),
    'tex_scale':     (1350, 688, 78, 59, 'solid'),
    'tex_hex':       (1440, 688, 78, 59, 'solid'),
    'tex_soot':      (789, 768, 78, 60, 'solid'),
    'tex_grit':      (881, 768, 83, 60, 'solid'),
    'tex_rust':      (1075, 769, 77, 59, 'solid'),
    'tex_rock':      (1261, 769, 77, 60, 'solid'),
    'tex_stone':     (1351, 769, 77, 60, 'solid'),
    'tex_gold':      (788, 850, 79, 63, 'solid'),
}

# hotbar number diamonds 59-62 / 11-48: two rows of four
for _i in range(8):
    _x = 555 + (_i % 4) * 50
    _y = 768 if _i < 4 else 821
    SLICES['num_%d' % (_i + 1)] = (_x, _y, 36, 40, 'key')

# captions the sheet prints INSIDE an element's own rect (x, y, w, h in sheet px)
SCRUB = [(62, 80, 18, 16)]      # the '01' inside frame 01's opening

# 81 colour palette -- seven chips, read for their mean colour, not sliced
PALETTE_RECT = (1093, 857, 404, 50)
PALETTE_N = 7

# whole files that ship as-is
COPIES = {
    'underlay_line': 'underlay-line.png',
    'underlay_note': 'underlay-note.png',
}


def _keep_runs(ink, share=0.22, gap=3):
    """Indices to keep along one axis: the heaviest band of ink plus any band
    carrying a real share of it. The sheet prints a caption under most
    elements; that caption is ink too, and a plain bbox swallows it."""
    on = ink > 0
    runs, s, hole = [], None, 0
    for i, b in enumerate(list(on) + [False] * gap):
        if b:
            if s is None:
                s = i
            hole = 0
        elif s is not None:
            hole += 1
            if hole >= gap:
                runs.append((s, i - hole + 1))
                s = None
    if not runs:
        return 0, len(ink)
    weight = [ink[a:b].sum() for a, b in runs]
    top = max(weight)
    keep = [r for r, w in zip(runs, weight) if w >= top * share]
    return keep[0][0], keep[-1][1]


def scrub(sheet, rects):
    """Paint the grain back over a caption the sheet printed INSIDE an element.
    Trimming the rect cannot reach these -- frame 01 carries its own number in
    the top-left of its opening, where any crop that keeps the frame keeps the
    number too."""
    for (x, y, w, h) in rects:
        # sampled from well BELOW the caption: the room above it is the frame's own
        # inner edge, and pasting that leaves a second, floating highlight.
        patch = sheet.crop((x, y + h + 24, x + w, y + 2 * h + 24))
        sheet.paste(patch, (x, y))


def tighten(sub, thresh=48, pad=1):
    """Shrink a rect onto the ink inside it, minus the sheet's caption."""
    v = np.array(sub.convert('RGB')).max(axis=2)
    ink = (v > thresh)
    if ink.sum() < 8:
        return sub
    y0, y1 = _keep_runs(ink.sum(axis=1))
    x0, x1 = _keep_runs(ink[y0:y1].sum(axis=0))
    return sub.crop((max(0, x0 - pad), max(0, y0 - pad),
                     min(sub.width, x1 + pad), min(sub.height, y1 + pad)))


def key_out(sub):
    """Alpha from the max-channel, RGB un-premultiplied off the grain."""
    a = np.array(sub.convert('RGB')).astype(np.float32)
    v = a.max(axis=2)
    al = np.clip((v - KEY_LO) / (KEY_HI - KEY_LO), 0.0, 1.0)
    a3 = al[..., None]
    # observed = true*al + BG*(1-al)  ->  solve for true
    with np.errstate(invalid='ignore', divide='ignore'):
        rgb = (a - BG * (1.0 - a3)) / np.maximum(a3, 1e-3)
    rgb = np.clip(rgb, 0, 255)
    out = np.dstack([rgb, al * 255.0]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def panel_mask(sub):
    """Keep the plate, drop the sheet around it."""
    v = np.array(sub.convert('RGB')).max(axis=2)
    m = Image.fromarray(((v > 31) * 255).astype(np.uint8))
    m = m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    m = m.filter(ImageFilter.MaxFilter(3))
    out = sub.convert('RGBA')
    out.putalpha(m)
    return out


# --- the 1080p pass ---------------------------------------------------------
# THE SHEET IS 1536x1024 AND THAT IS ALL THERE IS. A menu button's frame is cut from a 58px cell and then stretched
# across 618px of a 1080p screen, so the browser is inventing nine pixels out of every ten and the result is the mush
# Ben means by "redo/1080p the menu button backgrounds".
#
# There is no higher-resolution source to re-cut, so the resolution is MADE here, once, at bake time rather than by the
# browser on every paint: Lanczos to 4x, then an unsharp mask, then the alpha is re-hardened. That last step is the one
# that matters. Lanczos leaves a soft ramp across the chamfered edge, and a soft ALPHA edge is what reads as a blurred
# frame; a curve that pushes alpha away from the middle and towards 0/255 gives the edge back without touching colour,
# which is what a hand-drawn pixel edge would have looked like at this size. The border-image SLICE numbers in the CSS
# are source pixels, so anything pointed at an @4x file needs its slice multiplied by 4 and its /width left alone.
UPSCALE = {
    'hcell': 4, 'hcell_white': 4, 'hcell_sel': 4,   # every menu button, in its three states
    'frame_main': 4,                                # the pause card, the menu panels, the modals
    'tex_grit': 4, 'tex_soot': 4,                   # the plates behind both, drawn at 150/240px from ~80px tiles
}


def upscale(img, k):
    im = img.convert('RGBA').resize((img.width * k, img.height * k), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=k * 0.9, percent=118, threshold=2))
    a = np.asarray(im.split()[3], dtype=np.float32) / 255.0
    # A smoothstep-style S-curve on alpha only: 0.5 stays 0.5, everything else is pushed to the edge it is nearer.
    a = np.clip(a * a * (3.0 - 2.0 * a), 0.0, 1.0)
    a = np.clip(a * a * (3.0 - 2.0 * a), 0.0, 1.0)
    im.putalpha(Image.fromarray((a * 255.0 + 0.5).astype(np.uint8), 'L'))
    return im


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    if not os.path.exists(PACK):
        sys.exit('missing %s -- copy the asset pack there first' % PACK)
    sheet = Image.open(PACK).convert('RGB')
    scrub(sheet, SCRUB)
    manifest = {}

    for name, (x, y, w, h, mode) in SLICES.items():
        sub = sheet.crop((x, y, x + w, y + h))
        if mode in ('key', 'keyraw'):
            if mode == 'key':
                sub = tighten(sub)
            img = key_out(sub)
        elif mode == 'panel':
            img = panel_mask(sub)
        else:
            img = sub.convert('RGBA')
        img.save(os.path.join(OUT_DIR, name + '.png'))
        manifest[name] = {'w': img.width, 'h': img.height, 'mode': mode,
                          'rect': [x, y, w, h]}
        if name in UPSCALE:
            big = upscale(img, UPSCALE[name])
            big.save(os.path.join(OUT_DIR, '%s@%dx.png' % (name, UPSCALE[name])))
            manifest['%s@%dx' % (name, UPSCALE[name])] = {
                'w': big.width, 'h': big.height, 'mode': mode + '+up',
                'rect': [x, y, w, h], 'of': name}

    for out_name, src_name in COPIES.items():
        p = os.path.join(SRC_DIR, src_name)
        if os.path.exists(p):
            im = Image.open(p).convert('RGBA')
            im.save(os.path.join(OUT_DIR, out_name + '.png'))
            manifest[out_name] = {'w': im.width, 'h': im.height,
                                  'mode': 'copy', 'src': src_name}

    px, py, pw, ph = PALETTE_RECT
    chips = []
    for i in range(PALETTE_N):
        cw = pw // PALETTE_N
        c = np.array(sheet.crop((px + i * cw + 8, py + 8,
                                 px + (i + 1) * cw - 8, py + ph - 8)))
        chips.append('#%02x%02x%02x' % tuple(int(v) for v in
                                             np.median(c.reshape(-1, 3), axis=0)))
    manifest['_palette'] = chips

    with open(os.path.join(OUT_DIR, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
    print('%d slices -> %s' % (len(SLICES), OUT_DIR))
    print('palette', ' '.join(chips))

    if '--contact' in sys.argv:
        contact(manifest)


def contact(manifest):
    """Proof sheet: every slice on a mid-grey field so halos show up."""
    from PIL import ImageDraw
    names = [n for n in sorted(manifest) if not n.startswith('_')]
    CELL, COLS = 118, 12
    rows = (len(names) + COLS - 1) // COLS
    out = Image.new('RGB', (CELL * COLS, (CELL + 14) * rows), (108, 108, 112))
    d = ImageDraw.Draw(out)
    for i, n in enumerate(names):
        im = Image.open(os.path.join(OUT_DIR, n + '.png'))
        s = min((CELL - 10) / im.width, (CELL - 10) / im.height, 3)
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))))
        cx = (i % COLS) * CELL + (CELL - im.width) // 2
        cy = (i // COLS) * (CELL + 14) + (CELL - im.height) // 2
        out.paste(im, (cx, cy), im)
        d.text(((i % COLS) * CELL + 3, (i // COLS) * (CELL + 14) + CELL),
               n[:19], fill=(0, 0, 0))
    p = os.path.join(OUT_DIR, '_contact.png')
    out.save(p)
    print('contact sheet ->', p)


if __name__ == '__main__':
    main()
