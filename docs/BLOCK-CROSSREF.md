# BLOCK PASS — CROSS-REFERENCE, ours against ModernArch v3.0.6 [128x]

Ben asked for this **before** any of it is applied. Nothing in the game has changed.

Our side has no texture files: every tile is painted into one 256x256 canvas at boot, read back here with
`__hc.atlasPNG()`. So the swap is not "drop a PNG in" — each pack texture has to REPLACE A PAINTER, and the
atlas has to grow from 256 to 2048 (16x16 tiles at 128px) to hold them.

Pack: 1157 block textures, 941 of them with a normal map. Ours: 129 painted tiles.

Pictures, ours on the left of each pair: `bench/results/crossref-1.png`, `bench/results/crossref-2.png`, `bench/results/crossref-3.png`

## Every state and direction, as asked — and there is almost nothing there

The scope names `door` / `door_open` / `door_top` / `door_top_open` / `doorpaint`, `trapdoor` /
`trapdoor_open`, `ladder`, `stairs_n/e/s/w`, `stair_corner`, `fence`, `glass` and its pane. Counted in the
block table: **75 model blocks, and only 18 of them carry a tile at all** — `red_torch`, `furnace`,
`ladder`, `torch`, `torch_unlit`, `lantern`, `lantern_unlit`, `candle`, the four `roof_*`, `campfire`,
`tent`, `landmine`, `sandbag`, `chainlink`. Every door, trapdoor, gate, stair, corner, slab and fence is
**geometry with a flat `col:`** and has no texture to replace.

So of that list only `ladder` and `glass` are cross-referenced below. The rest is not a swap but a
feature: giving doors and stairs real textures means giving those models UVs and per-state tiles first,
which is a bigger job than the 300 swaps and should be decided separately.

| our tile | used by | pack candidate | verdict | normals | note |
|---|---|---|---|---|---|
| `anemone` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `barrel_side` | — | `barrel_side` | **TAKE** | yes |  |
| `barrel_top` | — | `barrel_top` | **TAKE** | yes |  |
| `bedrock` | bedrock | `bedrock` | **TAKE** | yes |  |
| `bellflower` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `berry` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `birch_leaf` | birch_leaves | **none** | **OUT OF SCOPE** | — | out of scope — leaves |
| `birch_leaf_solid` | birch_leaves_core | **none** | **OUT OF SCOPE** | — | out of scope — leaves |
| `birch_side` | birch_log | `birch_log` | **TAKE** | yes |  |
| `birch_sprig` | — | **none** | **OUT OF SCOPE** | — | out of scope — leaves |
| `birch_top` | birch_log | `birch_log_top` | **TAKE** | yes |  |
| `bloodroot` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `bookshelf` | bookshelf | `bookshelf` | **TAKE** | — |  |
| `br_carpet` | br_carpet | **none** | **KEEP OURS** | — | Backrooms set — ours, and the pack has no equivalent |
| `br_ceiling` | br_ceiling | **none** | **KEEP OURS** | — | Backrooms set — ours, and the pack has no equivalent |
| `br_concrete` | br_concrete | **none** | **KEEP OURS** | — | Backrooms set — ours, and the pack has no equivalent |
| `br_concrete_floor` | br_concrete_floor | **none** | **KEEP OURS** | — | Backrooms set — ours, and the pack has no equivalent |
| `br_fluor` | br_fluor | **none** | **KEEP OURS** | — | Backrooms set — ours, and the pack has no equivalent |
| `br_marble` | br_marble | **none** | **KEEP OURS** | — | Backrooms set — ours, and the pack has no equivalent |
| `br_tile` | br_tile | **none** | **KEEP OURS** | — | Backrooms set — ours, and the pack has no equivalent |
| `br_wallpaper` | br_wallpaper | **none** | **KEEP OURS** | — | Backrooms set — ours, and the pack has no equivalent |
| `bush` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `candle` | — | `candle` | **KEEP OURS** | yes | pack tile has alpha, ours is solid; ours is lit and sized for our lantern set |
| `chainlink_mesh` | — | **none** | **KEEP OURS** | — | chain-link is ours; the pack has iron_bars, which is a different thing; no candidate in the pack |
| `coal_ore` | coal_ore | `coal_ore` | **TAKE** | yes |  |
| `cobble` | cobble | `cobblestone` | **TAKE** | yes |  |
| `diamond_ore` | diamond_ore | `diamond_ore` | **TAKE** | yes |  |
| `dirt` | dirt, grass, grass_leaf1, grass_leaf2, grass_leaf3, path | `dirt` | **TAKE** | yes |  |
| `fern` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `foxglove` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `furnace_front` | — | `furnace_front` | **TAKE** | yes |  |
| `furnace_top` | — | `furnace_top` | **TAKE** | yes |  |
| `glass` | glass | `glass` | **TAKE** | yes |  |
| `gold` | gold_block | `raw_gold_block` | **KEEP OURS** | yes | ours is an ore-ish gold; raw_gold_block is the nearest read; ours is the ore-gold read; raw_gold_block is a different material |
| `gold_block` | gold_block | `gold_block` | **TAKE** | yes |  |
| `grass_leaf1` | grass_leaf1 | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `grass_leaf2` | grass_leaf2 | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `grass_leaf3` | grass_leaf3 | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `grass_meadow` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `grass_meadow_tall` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `grass_side` | grass, grass_leaf1, grass_leaf2, grass_leaf3 | `grass_block_side` | **KEEP OURS** | yes | the pack ships the side as bare DIRT and paints the green lip from a separate grass_block_side_overlay tinted at runtime; ours bakes the lip into one tile, so taking this needs the overlay and a tint, not a swap |
| `grass_tall` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `grass_top` | grass | `grass_block_top` | **TINT FIRST** | yes | GREY MASTER (pack sat 0.00 vs ours 0.50) — the pack tints this at runtime and we do not |
| `gravel` | gravel | `gravel` | **TAKE** | yes |  |
| `hay` | hay | `hay_block_side` | **TAKE** | yes |  |
| `hay_top` | hay | `hay_block_top` | **TAKE** | yes |  |
| `ice` | ice, packed_ice | `ice` | **TAKE** | yes | pack tile has alpha, ours is solid |
| `ind_concrete` | concrete | `smooth_stone` | **TAKE** | yes |  |
| `ind_glass` | reinforced_glass | `tinted_glass` | **BEN TO JUDGE** | yes |  |
| `ind_grate` | steel_grate | `iron_bars` | **TAKE** | yes |  |
| `ind_metal` | reinforced_wall | `iron_block` | **TAKE** | yes |  |
| `ind_panel` | fuse_box | `polished_andesite` | **TAKE** | yes |  |
| `ind_pipe` | industrial_pipe | **none** | **KEEP OURS** | — | pipes are a model in the pack, not a tile; no candidate in the pack |
| `ind_plate` | riveted_plate | `heavy_weighted_pressure_plate` | **TAKE** | — |  |
| `ind_rust` | corrugated_sheet | `copper_block` | **TAKE** | yes |  |
| `ind_sandbag` | sandbag | **none** | **KEEP OURS** | — | sandbags are ours; no candidate in the pack |
| `ind_vent` | wall_vent | **none** | **KEEP OURS** | — | no vent tile; no candidate in the pack |
| `ind_warning` | warning_block | **none** | **KEEP OURS** | — | no hazard stripe tile; no candidate in the pack |
| `iron_ore` | iron_ore | `iron_ore` | **TAKE** | yes |  |
| `kelp` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `kelp_small` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `ladder` | — | `ladder` | **TAKE** | yes |  |
| `landmine` | — | **none** | **KEEP OURS** | — | no candidate in the pack |
| `lantern` | — | `lantern` | **TAKE** | yes |  |
| `leaf_sprig` | — | **none** | **OUT OF SCOPE** | — | out of scope — leaves |
| `leaves` | leaves | **none** | **OUT OF SCOPE** | — | out of scope — leaves |
| `leaves_solid` | leaves_core | **none** | **OUT OF SCOPE** | — | out of scope — leaves |
| `log_side` | log | `spruce_log` | **TAKE** | yes | our conifer log |
| `log_top` | log | `spruce_log_top` | **TAKE** | yes |  |
| `mossy` | mossy | `mossy_cobblestone` | **TAKE** | yes |  |
| `mud` | mud | `mud` | **TAKE** | yes |  |
| `mush_brown` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `mush_red` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `netherite` | netherite_block | `netherite_block` | **TAKE** | yes |  |
| `netherrack` | netherrack | `netherrack` | **TAKE** | yes |  |
| `oak_leaf` | oak_leaves | **none** | **OUT OF SCOPE** | — | out of scope — leaves |
| `oak_leaf_solid` | oak_leaves_core | **none** | **OUT OF SCOPE** | — | out of scope — leaves |
| `oak_side` | oak_log | `oak_log` | **TAKE** | yes |  |
| `oak_sprig` | — | **none** | **OUT OF SCOPE** | — | out of scope — leaves |
| `oak_top` | oak_log | `oak_log_top` | **TAKE** | yes |  |
| `pastel_aqua` | — | `light_blue_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_ashrose` | — | `pink_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_blush` | — | `pink_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_celadon` | — | `lime_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_cornflower` | — | `blue_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_cream` | — | `white_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_fern` | — | `green_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_iris` | — | `purple_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_lilac` | — | `magenta_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_mint` | — | `lime_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_olive` | — | `green_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_orchid` | — | `magenta_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_peony` | — | `pink_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_periwinkle` | — | `light_blue_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_pistachio` | — | `lime_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_powder` | — | `light_blue_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_rose` | — | `red_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_sage` | — | `green_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_sand` | — | `yellow_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_seafoam` | — | `cyan_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_shell` | — | `white_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_sky` | — | `light_blue_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_teal` | — | `cyan_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `pastel_wisteria` | — | `purple_concrete` | **KEEP OURS** | yes | ours is a pastel; the pack colour is saturated — a recolour, not a swap; pastel palette; the pack colour is fully saturated and would break the set |
| `path` | path | `dirt_path_top` | **KEEP OURS** | yes | the pack path is grassy; ours is a dark trodden track and reads as a path from above |
| `planks` | bookshelf, planks, table | `spruce_planks` | **TAKE** | yes |  |
| `planks_white` | planks_white | `birch_planks` | **TAKE** | yes |  |
| `red_torch` | — | `redstone_torch` | **KEEP OURS** | yes | pack tile has alpha, ours is solid; the pack file is a multi-part sheet, not a tile — needs opening by hand before any verdict |
| `roof_tile` | — | **none** | **KEEP OURS** | — | no roof tile; the pack is a modern set and has none of our cottage roof; no candidate in the pack |
| `sage` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `sand` | sand, sand_leaf1, sand_leaf2, sand_leaf3 | `sand` | **TAKE** | yes |  |
| `sand_leaf1` | sand_leaf1 | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `sand_leaf2` | sand_leaf2 | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `sand_leaf3` | sand_leaf3 | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `sandbag_cloth` | — | **none** | **KEEP OURS** | — | no candidate in the pack |
| `sapling` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |
| `snow` | snow | `snow` | **TAKE** | yes |  |
| `stained_glass` | stained_glass | `white_stained_glass` | **KEEP OURS** | yes | ours is a 16-colour PALETTE sheet in one tile; the pack ships one tile per colour, so this is an atlas change, not a swap |
| `stone` | stone | `stone` | **TAKE** | yes |  |
| `sulfur_ore` | — | `gold_ore` | **KEEP OURS** | yes | no sulfur in vanilla; recolour candidate only; no sulfur in the pack — gold_ore recoloured is the only route |
| `table_side` | table | `crafting_table_side` | **KEEP OURS** | yes | matches table_top — keep the pair together |
| `table_top` | table | `crafting_table_top` | **KEEP OURS** | yes | the pack tile is a crafting GRID; our table is a plain table |
| `thatch` | thatch | `hay_block_side` | **TAKE** | yes |  |
| `torch` | — | `torch` | **TAKE** | yes |  |
| `trellis` | — | **none** | **KEEP OURS** | — | no trellis in the pack — scaffolding is the nearest and reads wrong; no candidate in the pack |
| `vantawhite` | vantawhite | **none** | **KEEP OURS** | — | deliberate: our pure-value tile; deliberate pure-value tile |
| `white` | — | `white_concrete` | **KEEP OURS** | yes | a flat value tile the UI depends on |
| `wool` | wool | `white_wool` | **TAKE** | yes |  |
| `yarrow` | — | **none** | **OUT OF SCOPE** | — | out of scope — foliage overhaul (A6) |

| verdict | tiles |
|---|---|
| KEEP OURS | 52 |
| TAKE | 43 |
| OUT OF SCOPE | 32 |
| TINT FIRST | 1 |
| BEN TO JUDGE | 1 |

**129 tiles: 79 with a candidate, 18 with none, 32 out of scope.**
