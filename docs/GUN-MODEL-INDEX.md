# Gun model index

Every gun-pack model, identified by eye from a photograph and measured from `assets/models/placement-data.json`.
Written so the AK-for-AR mistake cannot be repeated: the name a model shipped with is not what the model is.

Contact sheets it was read from, all in `bench/results/`:
`idx-rifles-side.png`, `idx-rifles-top.png`, `idx-handguns-side.png`, `idx-handguns-top.png`,
`idx-shotguns-side.png`, `idx-shot-snipe-top.png`, `idx-snipers-side.png`, `idx-blades-attach-side.png`,
`idx-attachments-side.png`, `idx-attachments-top.png`, `idx-new-imports-side.png`, `idx-new-imports-top.png`.
Regenerate any of them with `node tools/models/shoot-inspect.mjs "ids=a,b&view=side|top" <out>.png`.

Lengths are the model's own X extent (Blender metres, ~5 per rifle). `boreY`/`railTop` are that model's own
numbers, which is why no rule derived from one gun may be applied to another.

## 25 versus 22 — answered, nothing is missing

`Ultimate Guns Pack-glb.zip` holds **exactly 25 GLB files**. Twenty-one are guns; the other four are
`Bayonet`, `Bipod`, `Scope` and `Tripod`. Ben counted the files in the pack. The twenty-second gun on disk,
`flare-gun`, comes from the Survival pack instead. Every file in all three zips is imported — verified by
diffing each zip's contents against `manifest.json`. **There is no missing gun.**

## The guns

| Model | What it actually is | Length | boreY | railTop | Sights on the model | Serves |
| --- | --- | --- | --- | --- | --- | --- |
| `assault-rifle` | **AK pattern** — wood furniture, gas tube, front sight block, curved mag | 5.42 | 0.690 | 0.414 | AK block + rear leaf | new `ak` item — **not `ar15`** |
| `assault-rifle-wood` | **AK, underfolder/skeleton stock**, wood grip and handguard | 5.49 | 0.695 | 0.602 | same | `ak` variant |
| `assault-rifle-bullpup-carbine` | **AR-15/M4 carbine** — flat top, slotted full-length rail, collapsible stock, vented handguard. The shipped name is wrong on both counts: it is neither a bullpup nor an AK | 5.17 | 0.638 | **0.811** | rail only, no irons | **`ar15`** |
| `bullpup` | true bullpup — magazine behind the grip, full-length top rail | 5.25 | 0.582 | 0.840 | rail only | new item |
| `submachine-gun` | MP5/MP7-class, folding stock, ventilated top rail | 4.04 | 0.685 | 0.869 | rail + low irons | new item |
| `submachine-gun-folded` | MAC/Uzi-class, wire stock extended | 4.00 | 0.205 | 0.376 | minimal | new item |
| `pistol` | service auto, wood grips, no rail | 1.82 | 0.528 | 0.443 | post + notch | new item |
| `pistol-heavy` | large-frame auto, long slide (Desert Eagle class) | 2.45 | 0.485 | 0.580 | post + notch, ribbed slide | new item |
| `pistol-compact` | compact polymer auto (Glock class) | 1.82 | 0.556 | 0.411 | post + notch | new item |
| `pistol-wood` | auto with wood grips and a ventilated rib/compensator | 1.85 | 0.565 | 0.411 | post + notch | new item |
| `revolver` | long-barrel single-action, wood grip (Peacemaker/Python class) | 1.98 | 0.432 | 0.300 | blade + topstrap groove | **`revolver`** (wired) |
| `revolver-snub` | snub-nose, swing-out cylinder | 1.90 | 0.622 | 0.381 | blade + groove | new item |
| `revolver-wood-grip` | mid-barrel revolver **with a picatinny top rail** | 1.99 | 0.458 | 0.482 | rail + blade | new item — the only revolver that can take an optic |
| `shotgun` | pump, full wood stock and forend | 5.79 | 0.139 | 0.216 | bead | **`shotgun`** (wired) |
| `shotgun-long` | pump, longer barrel, wood forend, tube extension | 5.79 | 0.132 | 0.127 | bead | new item |
| `shotgun-short-stock` | pump, **pistol-grip-only**, ribbed forend | 4.47 | 0.293 | 0.295 | bead | new item |
| `shotgun-sawed-off` | **double-barrel** sawn-off, wood grip | 3.69 | 0.358 | 0.341 | none usable | new item |
| `sniper-rifle` | bolt carbine, **scope moulded into the model** | 6.34 | 0.206 | 0.322 | scope, no irons | **`hunting_rifle`** (wired) |
| `sniper-rifle-long` | AWP-class, thumbhole stock, **integral scope and a suppressor already on the muzzle** | 7.25 | 0.403 | 0.530 | scope | new item |
| `sniper-rifle-green` | bolt gun, green/wood furniture, **integral scope** | 7.30 | 0.318 | 0.383 | scope | new item |
| `sniper-rifle-bipod` | modern chassis rifle, **integral scope and bipod**, the only gun whose derived grip lands on the actual grip | 6.34 | 0.558 | 0.622 | scope | new item |
| `flare-gun` | single-shot break-action flare pistol, red | 2.51 | 0.630 | 0.304 | bead | new item |

## Not guns, though the importer filed them under `guns/`

| Model | What it is | Where it belongs |
| --- | --- | --- |
| `guns/bayonet` | large fixed-blade combat knife, blade along +X, grip at the rear | ITEM — one of Ben's **two knives**, with `tools/knife` |
| `guns/bipod` | folding bipod, legs down, 0.15 x 1.33 x 1.22 | attachment, `bipod` slot |
| `guns/tripod` | A-frame tripod, 1.31 x 1.18 x 1.22 | attachment, `bipod` slot (heavier) |
| `guns/scope` | large scope, 2.08 long, glass spans -0.98 to 1.03 | attachment, `optic` slot. **Different object from `attachments/scope`** — this one is 2.08 units in gun scale, that one is 0.29 units in attachment scale. Keep this one for guns; see below |

## Attachments — measured, and the handoff's note about them is wrong

| Model | Long axis | Size (x,y,z) | Bulk at |
| --- | --- | --- | --- |
| `attachments/scope` | z | 0.06 x 0.09 x 0.29 | -z |
| `attachments/holographic` | z | 0.05 x 0.06 x 0.08 | +z |
| `attachments/red-dot` | z | 0.04 x 0.04 x 0.08 | -z |
| `attachments/laser` | z | 0.08 x 0.05 x 0.11 | -z |
| `attachments/weapon-light` | z | 0.05 x 0.07 x 0.14 | +z |
| `attachments/suppressor` | z | 0.04 x 0.04 x 0.14 | +z |
| `attachments/foregrip` | y | 0.03 x 0.07 x 0.03 | +y |

**Every gun runs along X and is 1.8 to 7.3 units long. Every attachment runs along Z and is 0.03 to 0.29
units long.** So an attachment is rotated 90 degrees from the gun it clamps to and roughly thirty times too
small in the gun's own frame. The earlier note that these are "already in the game's units and frame, no
rotation needed" is false, and building on it puts every optic sideways and invisible. Each mount therefore
authors a yaw and a scale as well as a position, per gun and per slot.

`attachments/foregrip` is the odd one again: it runs along **y**, not z, because a foregrip hangs downward.

## Defects these sheets prove, before a line of gameplay code

1. **Derived grips land on the model origin, not the grip, for all four pistols** — `pistol` (0.018, -0.020),
   `pistol-compact` (-0.198, -0.059), `pistol-heavy` (0.125, 0.004), `pistol-wood` (0.095, -0.009). On the
   contact sheet the marker is invisible because it sits buried inside the frame casting. The revolvers and
   `sniper-rifle-bipod` get real grips. This is why handguns are held wrong: the hand is attached to a point
   in the middle of the gun.
2. **Derived irons land on the scope, not on sights, for every sniper.** `sniper-rifle` puts its front sight
   at x=2.04 with the barrel tip at x=4.96; its `glassRange` is 0 to 2.06 — the "front sight" is the scope's
   front bell. Same on all four. Those guns have no irons to find.
3. **`submachine-gun`'s front and rear sight derive 0.14 apart** (x=1.80 and x=1.67) on a 4.04-long gun. A
   sight radius of 0.14 is not a sight radius; both markers landed on the same rail bump. `bayonet` does the
   same (0.275 and 0.258) because it is a knife and has no sights at all.
4. **`shotgun-sawed-off` has no usable sight geometry** — a bead on a sawn-off double is the whole sighting
   system, and nothing in the model reads as one.

Each of these is fixed by authoring the number per weapon rather than deriving it, which is the point of
the per-weapon pass. They are recorded here so the fix can be checked against the defect it claims to cure.
