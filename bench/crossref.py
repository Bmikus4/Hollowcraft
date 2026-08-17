# THE BLOCK PASS CROSS-REFERENCE, built rather than eyeballed.
#
# Ben's requirement is a table BEFORE 300 textures are applied: our block, the pack's candidate, and whether the
# candidate is better, worse or absent. Two things make that harder than a filename join:
#
#   · WE HAVE NO TEXTURE FILES. Every tile is painted procedurally into one 256x256 canvas at boot, so our side has to
#     be read back out of the atlas the GPU actually samples (bench/tmp-atlasdump.mjs, __hc.atlasPNG).
#   · THE NAMES DO NOT LINE UP. Fuzzy matching on filenames scored 85 of 129 and was confidently wrong where it
#     mattered — it offered `sandstone` for our anemone flower and `bell_side` for a barrel. So the map below is
#     curated by hand; the fuzzy pass is kept only to SUGGEST candidates for anything left unmapped.
#
# Output: docs/BLOCK-CROSSREF.md and contact sheets pairing each of our tiles with its candidate at the same size, so
# "better or worse" is a judgement made from the pictures rather than from the names.
import json, re, zipfile, difflib, io, os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = r'D:\Content\Desktop-Assets\ModernArch v3.0.6 [26.2] [128x].zip'
RES  = os.path.join(ROOT, 'bench', 'results')

# ---- OUR SIDE ------------------------------------------------------------------------------------------------
meta  = json.load(open(os.path.join(RES, 'atlas-tiles.json')))
TIDX  = meta['tiles']; ATLAS = meta['atlasTiles']; TPX = meta['tilePx']
atlas = Image.open(os.path.join(RES, 'atlas.png')).convert('RGBA')
src   = open(os.path.join(ROOT, 'index.html'), encoding='utf-8', errors='replace').read()

# which blocks use each tile — the "our block" column. A tile used by nothing is a painter kept for a sprite or a
# state that is drawn elsewhere, and it is still in scope: the pack would replace the ART, not the block entry.
uses = {}
for bid, body in re.findall(r"\nblock\('([a-z0-9_]+)'\s*,\s*\{(.*?)\}\s*\)\s*;", src, re.S):
    for t in re.findall(r"t:\[([^\]]*)\]", body):
        for q in re.findall(r"'([a-z0-9_]+)'", t):
            uses.setdefault(q, set()).add(bid)

# ---- THE PACK ------------------------------------------------------------------------------------------------
z = zipfile.ZipFile(PACK)
pack = {}
for n in z.namelist():
    if '/textures/block/' not in n or not n.endswith('.png'):
        continue
    b = n.split('/')[-1][:-4]
    if b.endswith('_n') or b.endswith('_s') or b.endswith('_e'):
        continue          # normal / specular / emissive companions ride with the base tile
    pack[b] = n
has_pbr = {b for b in pack if (pack[b][:-4] + '_n.png') in z.namelist()}

# ---- THE CURATED MAP -----------------------------------------------------------------------------------------
# '' means deliberately no candidate. A note explains anything that is not a plain like-for-like.
M = {
 # terrain
 'dirt':('dirt',''), 'grass_top':('grass_block_top',''), 'grass_side':('grass_block_side',''),
 'sand':('sand',''), 'gravel':('gravel',''), 'stone':('stone',''), 'cobble':('cobblestone',''),
 'mud':('mud',''), 'path':('dirt_path_top',''), 'snow':('snow',''), 'ice':('ice',''),
 'bedrock':('bedrock',''), 'netherrack':('netherrack',''), 'netherite':('netherite_block',''),
 'gold':('raw_gold_block','ours is an ore-ish gold; raw_gold_block is the nearest read'),
 'gold_block':('gold_block',''), 'coal_ore':('coal_ore',''), 'iron_ore':('iron_ore',''),
 'diamond_ore':('diamond_ore',''), 'sulfur_ore':('gold_ore','no sulfur in vanilla; recolour candidate only'),
 'mossy':('mossy_cobblestone',''), 'thatch':('hay_block_side',''), 'hay':('hay_block_side',''),
 'hay_top':('hay_block_top',''),
 # wood
 'log_side':('spruce_log','our conifer log'), 'log_top':('spruce_log_top',''),
 'oak_side':('oak_log',''), 'oak_top':('oak_log_top',''),
 'birch_side':('birch_log',''), 'birch_top':('birch_log_top',''),
 'planks':('spruce_planks',''), 'planks_white':('birch_planks',''),
 'bookshelf':('bookshelf',''), 'barrel_side':('barrel_side',''), 'barrel_top':('barrel_top',''),
 'table_side':('crafting_table_side',''), 'table_top':('crafting_table_top',''),
 'ladder':('ladder',''), 'trellis':('','no trellis in the pack — scaffolding is the nearest and reads wrong'),
 'roof_tile':('','no roof tile; the pack is a modern set and has none of our cottage roof'),
 # glass and light
 'glass':('glass',''), 'stained_glass':('white_stained_glass',''), 'ind_glass':('tinted_glass',''),
 'torch':('torch',''), 'red_torch':('redstone_torch',''), 'candle':('candle',''), 'lantern':('lantern',''),
 'furnace_front':('furnace_front',''), 'furnace_top':('furnace_top',''),
 # industrial set — the pack is a MODERN architecture set, which is where it is strongest
 'ind_concrete':('smooth_stone',''), 'ind_grate':('iron_bars',''), 'ind_metal':('iron_block',''),
 'ind_panel':('polished_andesite',''), 'ind_pipe':('','pipes are a model in the pack, not a tile'),
 'ind_plate':('heavy_weighted_pressure_plate',''), 'ind_rust':('copper_block',''),
 'ind_vent':('','no vent tile'), 'ind_warning':('','no hazard stripe tile'),
 'ind_sandbag':('','sandbags are ours'), 'sandbag_cloth':('',''),
 'chainlink_mesh':('','chain-link is ours; the pack has iron_bars, which is a different thing'),
 'landmine':('',''),
 # Backrooms — entirely ours, and the pack cannot have them
 'br_carpet':('',''),'br_ceiling':('',''),'br_concrete':('',''),'br_concrete_floor':('',''),
 'br_fluor':('',''),'br_marble':('',''),'br_tile':('',''),'br_wallpaper':('',''),
 # cloth and colour
 'wool':('white_wool',''), 'white':('white_concrete',''), 'vantawhite':('','deliberate: our pure-value tile'),
}
# the 24 pastels map onto the pack's dyed concrete where a colour exists and nowhere where it does not
PASTEL = {'aqua':'light_blue_concrete','ashrose':'pink_concrete','blush':'pink_concrete','celadon':'lime_concrete',
 'cornflower':'blue_concrete','cream':'white_concrete','fern':'green_concrete','iris':'purple_concrete',
 'lilac':'magenta_concrete','mint':'lime_concrete','olive':'green_concrete','orchid':'magenta_concrete',
 'peony':'pink_concrete','periwinkle':'light_blue_concrete','pistachio':'lime_concrete','powder':'light_blue_concrete',
 'rose':'red_concrete','sage':'green_concrete','sand':'yellow_concrete','seafoam':'cyan_concrete',
 'shell':'white_concrete','sky':'light_blue_concrete','teal':'cyan_concrete','wisteria':'purple_concrete'}
for k, v in PASTEL.items():
    M['pastel_' + k] = (v, 'ours is a pastel; the pack colour is saturated — a recolour, not a swap')
# leaves, and the sprites the foliage overhaul owns, are OUT OF SCOPE by Ben's own line
OUT_OF_SCOPE = {
 'leaves':'leaves','leaves_solid':'leaves','oak_leaf':'leaves','oak_leaf_solid':'leaves','birch_leaf':'leaves',
 'birch_leaf_solid':'leaves','leaf_sprig':'leaves','oak_sprig':'leaves','birch_sprig':'leaves',
 'anemone':'foliage overhaul (A6)','bellflower':'foliage overhaul (A6)','berry':'foliage overhaul (A6)',
 'bloodroot':'foliage overhaul (A6)','bush':'foliage overhaul (A6)','fern':'foliage overhaul (A6)',
 'foxglove':'foliage overhaul (A6)','sage':'foliage overhaul (A6)','yarrow':'foliage overhaul (A6)',
 'sapling':'foliage overhaul (A6)','mush_brown':'foliage overhaul (A6)','mush_red':'foliage overhaul (A6)',
 'kelp':'foliage overhaul (A6)','kelp_small':'foliage overhaul (A6)','grass_tall':'foliage overhaul (A6)',
 'grass_meadow':'foliage overhaul (A6)','grass_meadow_tall':'foliage overhaul (A6)',
 'grass_leaf1':'foliage overhaul (A6)','grass_leaf2':'foliage overhaul (A6)','grass_leaf3':'foliage overhaul (A6)',
 'sand_leaf1':'foliage overhaul (A6)','sand_leaf2':'foliage overhaul (A6)','sand_leaf3':'foliage overhaul (A6)',
}

def tile_img(name):
    i = TIDX.get(name)
    if i is None: return None
    x, y = (i % ATLAS) * TPX, (i // ATLAS) * TPX
    return atlas.crop((x, y, x + TPX, y + TPX))

def pack_img(name):
    if not name or name not in pack: return None
    im = Image.open(io.BytesIO(z.read(pack[name]))).convert('RGBA')
    # ANIMATED AND SHEET TEXTURES ARE NOT SQUARE. A torch ships as a vertical strip of frames and some props ship as a
    # wide sheet; taking the whole image scales a 1x8 strip into a smear and judges the pack on an artefact of my own
    # crop. Either way, take the first square frame.
    if im.height > im.width: return im.crop((0, 0, im.width, im.width))
    if im.width > im.height: return im.crop((0, 0, im.height, im.height))
    return im

def on_checks(im, size):
    # ALPHA HAS TO BE VISIBLE OR THE JUDGEMENT IS WRONG. Glass, candles, torches, ladders and bars are mostly
    # transparent, and pasted onto a dark sheet they read as solid black — which is how the first pass made the pack's
    # perfectly good bookshelf and glass look like failures.
    im = im.resize((size, size), Image.NEAREST)
    bg = Image.new('RGBA', (size, size), (150, 150, 150, 255))
    d = ImageDraw.Draw(bg); k = size // 8
    for yy in range(0, size, k):
        for xx in range(0, size, k):
            if ((xx // k) + (yy // k)) % 2: d.rectangle([xx, yy, xx + k - 1, yy + k - 1], fill=(110, 110, 110, 255))
    return Image.alpha_composite(bg, im).convert('RGB')

def satur(im):
    # THE PACK SHIPS BIOME-TINTED MASTERS IN GREY. grass_block_top, the leaves and the foliage come out of a modern
    # pack as GRAYSCALE, coloured at runtime by a biome tint our renderer does not apply — swap one in raw and that
    # block turns grey in the world. Mean saturation says which ones those are without opening each file.
    im = im.convert('RGB').resize((32, 32))
    tot = 0; n = 0
    for r, g, b in im.getdata():
        mx, mn = max(r, g, b), min(r, g, b)
        tot += 0 if mx == 0 else (mx - mn) / mx; n += 1
    return tot / max(n, 1)

def alpha_share(im):
    d = im.convert('RGBA').resize((32, 32)).getdata()
    return sum(1 for p in d if p[3] < 250) / 1024.0

TINTED = {'grass_block_top','grass_block_side','grass_block_side_overlay','fern','grass','tall_grass','large_fern',
          'vine','lily_pad','sugar_cane','water_still','water_flow','attached_melon_stem','attached_pumpkin_stem',
          'oak_leaves','spruce_leaves','birch_leaves','birch_leaves1','jungle_leaves','acacia_leaves','acacia_leaves1',
          'dark_oak_leaves','mangrove_leaves'}

# ---- THE VERDICT, which is the column Ben actually asked for --------------------------------------------------
# Judged from the sheets, not from the names. TAKE where the pack's material plainly beats a 16-pixel painter; KEEP
# where ours is doing something the pack cannot; and two kinds of "not a swap": a grey master that needs a tint step,
# and a texture that is simply a different object wearing the same word.
TAKE = set('''dirt stone cobble gravel sand snow ice bedrock netherrack netherite mossy mud coal_ore iron_ore
 diamond_ore gold_block log_side log_top oak_side oak_top birch_side birch_top planks planks_white hay hay_top thatch
 barrel_side barrel_top bookshelf ladder lantern glass wool ind_metal ind_rust ind_concrete ind_panel ind_plate
 ind_grate furnace_front furnace_top torch'''.split())
KEEP = {
 'stained_glass':'ours is a 16-colour PALETTE sheet in one tile; the pack ships one tile per colour, so this is an atlas change, not a swap',
 'table_top':'the pack tile is a crafting GRID; our table is a plain table',
 'table_side':'matches table_top — keep the pair together',
 'path':'the pack path is grassy; ours is a dark trodden track and reads as a path from above',
 'candle':'ours is lit and sized for our lantern set',
 'red_torch':'the pack file is a multi-part sheet, not a tile — needs opening by hand before any verdict',
 'white':'a flat value tile the UI depends on', 'vantawhite':'deliberate pure-value tile',
 'gold':'ours is the ore-gold read; raw_gold_block is a different material',
 'grass_side':'the pack ships the side as bare DIRT and paints the green lip from a separate grass_block_side_overlay '
              'tinted at runtime; ours bakes the lip into one tile, so taking this needs the overlay and a tint, not a swap',
 'sulfur_ore':'no sulfur in the pack — gold_ore recoloured is the only route',
}
for k in list(PASTEL): KEEP['pastel_'+k] = 'pastel palette; the pack colour is fully saturated and would break the set'
for k in ['br_carpet','br_ceiling','br_concrete','br_concrete_floor','br_fluor','br_marble','br_tile','br_wallpaper']:
    KEEP[k] = 'Backrooms set — ours, and the pack has no equivalent'
for k in ['chainlink_mesh','landmine','sandbag_cloth','ind_sandbag','ind_vent','ind_warning','ind_pipe','trellis','roof_tile']:
    KEEP[k] = 'no candidate in the pack'

rows = []
for t in sorted(TIDX.keys()):
    if t in OUT_OF_SCOPE:
        rows.append((t, sorted(uses.get(t, [])), '', 'out of scope — ' + OUT_OF_SCOPE[t], False, 'OUT OF SCOPE')); continue
    cand, note = M.get(t, (None, ''))
    if cand is None:
        guess = difflib.get_close_matches(t, pack.keys(), n=1, cutoff=0.72)
        cand, note = (guess[0] if guess else ''), 'unmapped; name-match suggestion only'
    # the two facts that decide whether a swap is a drop-in: does the pack ship it grey for a tint we do not apply,
    # and is our own tile coloured. A grey master against a coloured painter is a recolour job, not a swap.
    pim = pack_img(cand); oim = tile_img(t)
    flag = ''
    if pim is not None and oim is not None:
        ps, os_ = satur(pim), satur(oim)
        # ONLY THE NAMES THAT REALLY ARE TINTED. A modern pack ships grass, foliage and vines as grayscale masters
        # coloured at runtime by a biome tint we do not apply — drop one in raw and that block is grey in the world.
        # But plenty of textures are simply achromatic: the pack's iron ore, ladder and stone furnace are grey because
        # they are grey. The first version of this check called all of them tint masters and told Ben to write a tint
        # step for a bookshelf.
        if cand in TINTED and ps < 0.10: flag = f'GREY MASTER (pack sat {ps:.2f} vs ours {os_:.2f}) — the pack tints this at runtime and we do not'
        elif alpha_share(pim) > 0.02 and alpha_share(oim) < 0.02: flag = 'pack tile has alpha, ours is solid'
    if flag: note = (note + '; ' if note else '') + flag
    if 'GREY MASTER' in flag: verdict = 'TINT FIRST'
    elif t in KEEP: verdict = 'KEEP OURS'
    elif t in TAKE: verdict = 'TAKE'
    elif not cand: verdict = 'NO CANDIDATE'
    else: verdict = 'BEN TO JUDGE'
    if t in KEEP and KEEP[t]: note = (note + '; ' if note else '') + KEEP[t]
    rows.append((t, sorted(uses.get(t, [])), cand, note, cand in has_pbr if cand else False, verdict))

# ---- CONTACT SHEETS ------------------------------------------------------------------------------------------
CELL, PAD, COLS = 128, 10, 6
inscope = [r for r in rows if not r[3].startswith('out of scope')]
for page in range(0, len(inscope), COLS * 6):
    chunk = inscope[page:page + COLS * 6]
    rowsn = (len(chunk) + COLS - 1) // COLS
    W = COLS * (CELL * 2 + PAD * 3); H = rowsn * (CELL + 34)
    sheet = Image.new('RGB', (W, H), (24, 24, 28)); d = ImageDraw.Draw(sheet)
    for i, (t, u, cand, note, pbr, verdict) in enumerate(chunk):
        cx = (i % COLS) * (CELL * 2 + PAD * 3) + PAD; cy = (i // COLS) * (CELL + 34)
        a = tile_img(t)
        if a: sheet.paste(on_checks(a, CELL), (cx, cy + 22))
        b = pack_img(cand)
        if b: sheet.paste(on_checks(b, CELL), (cx + CELL + PAD, cy + 22))
        else: d.rectangle([cx + CELL + PAD, cy + 22, cx + CELL * 2 + PAD, cy + 22 + CELL], outline=(90, 60, 60))
        col = {'TAKE':(150,210,140),'KEEP OURS':(210,190,140),'TINT FIRST':(230,150,120),
               'NO CANDIDATE':(150,150,150),'BEN TO JUDGE':(200,200,230)}.get(verdict,(220,214,196))
        d.text((cx, cy + 4), f'{t}  |  {cand or "none"}  [{verdict}]', fill=col)
    # bench/results is gitignored, so the sheets the table cites also go somewhere versioned: a table whose pictures
    # only exist on one machine is not a table anyone else can check.
    sheet.save(os.path.join(RES, f'crossref-{page//(COLS*6)+1}.png'))
    os.makedirs(os.path.join(ROOT, 'docs', 'crossref'), exist_ok=True)
    sheet.save(os.path.join(ROOT, 'docs', 'crossref', f'crossref-{page//(COLS*6)+1}.png'))

# ---- THE TABLE -----------------------------------------------------------------------------------------------
out = []
out.append('# BLOCK PASS — CROSS-REFERENCE, ours against ModernArch v3.0.6 [128x]')
out.append('')
out.append('Ben asked for this **before** any of it is applied. Nothing in the game has changed.')
out.append('')
out.append('Our side has no texture files: every tile is painted into one 256x256 canvas at boot, read back here with')
out.append('`__hc.atlasPNG()`. So the swap is not "drop a PNG in" — each pack texture has to REPLACE A PAINTER, and the')
out.append('atlas has to grow from 256 to 2048 (16x16 tiles at 128px) to hold them.')
out.append('')
out.append(f'Pack: {len(pack)} block textures, {len(has_pbr)} of them with a normal map. Ours: {len(TIDX)} painted tiles.')
out.append('')
out.append('Pictures, ours on the left of each pair: ' + ', '.join(
    f'`docs/crossref/crossref-{i+1}.png`' for i in range((len(inscope) + 35) // 36)))
out.append('')
out.append('## Every state and direction, as asked — and there is almost nothing there')
out.append('')
out.append('The scope names `door` / `door_open` / `door_top` / `door_top_open` / `doorpaint`, `trapdoor` /')
out.append('`trapdoor_open`, `ladder`, `stairs_n/e/s/w`, `stair_corner`, `fence`, `glass` and its pane. Counted in the')
out.append('block table: **75 model blocks, and only 18 of them carry a tile at all** — `red_torch`, `furnace`,')
out.append('`ladder`, `torch`, `torch_unlit`, `lantern`, `lantern_unlit`, `candle`, the four `roof_*`, `campfire`,')
out.append('`tent`, `landmine`, `sandbag`, `chainlink`. Every door, trapdoor, gate, stair, corner, slab and fence is')
out.append('**geometry with a flat `col:`** and has no texture to replace.')
out.append('')
out.append('So of that list only `ladder` and `glass` are cross-referenced below. The rest is not a swap but a')
out.append('feature: giving doors and stairs real textures means giving those models UVs and per-state tiles first,')
out.append('which is a bigger job than the 300 swaps and should be decided separately.')
out.append('')
out.append('| our tile | used by | pack candidate | verdict | normals | note |')
out.append('|---|---|---|---|---|---|')
for t, u, cand, note, pbr, verdict in rows:
    out.append(f'| `{t}` | {", ".join(u) if u else "—"} | {("`"+cand+"`") if cand else "**none**"} | '
               f'**{verdict}** | {"yes" if pbr else "—"} | {note} |')
from collections import Counter
tally = Counter(r[5] for r in rows)
out.append('')
out.append('| verdict | tiles |')
out.append('|---|---|')
for k, v in tally.most_common(): out.append(f'| {k} | {v} |')
n_none = sum(1 for r in rows if not r[2] and not r[3].startswith('out of scope'))
n_scope = sum(1 for r in rows if r[3].startswith('out of scope'))
out.append('')
out.append(f'**{len(rows)} tiles: {len(rows)-n_none-n_scope} with a candidate, {n_none} with none, {n_scope} out of scope.**')
open(os.path.join(ROOT, 'docs', 'BLOCK-CROSSREF.md'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print(f'{len(rows)} tiles | candidate {len(rows)-n_none-n_scope} | none {n_none} | out of scope {n_scope}')
print('sheets:', (len(inscope) + 35) // 36)
