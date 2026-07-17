# HOLLOWCRAFT — Master Reference & Backlog

Single-file Three.js voxel horror game. A Minecraft-like world stalked by an AI-driven predator, **"The Wretch."**
This is the one document a new session needs: how to run/edit/verify it, how it's built, and everything still on the list.

> If you are a new terminal: **read §1–§3 before touching code.** Then §5 is the work queue.

---

## MULTIPLAYER — co-op relay (2026-07-15, v1, needs networked playtest)
Quick-tunnel model (see `MULTIPLAYER.md`). **`mp-server.js`** = dependency-free pure-Node WebSocket relay that ALSO serves the game files (one tunnel = game + co-op). Client netcode = the `NET` object in `index.html`: connects to the same-origin WS (or `?mp=wss://host`), sends player transforms ~20Hz, renders peer avatars (interpolated), **syncs block break/place** (`netEdit` in breakBlock/doPlace, applied via a guard flag). **Host-authoritative Wretch + day/time:** the first client is HOST, broadcasts the Wretch pose + `worldTime` ~12Hz; guests skip local AI and mirror it (`netWretchTick` at the top of `updateWretch`). World is deterministic from the seed so terrain/structures need no sync. `Hollowcraft-Coop.bat` launches the relay. **v2 (full co-op):** Wretch hunts the **nearest of ALL players** (`computeHuntTarget`/`huntCam`); **capture-ownership transfers** to whoever is grabbed (`wretch.owner`, `{t:'grab'|'own'|'w'}`) so each player runs their own jumpscare/drag/tie; **auto-rescue** a tied teammate by standing near them; **tree-fall, drops (shared IDs, pickup-broadcast, no dupes), animals (host-authoritative mirror), day/time** all synced; dungeons unbreakable. Everything gated behind `NET.on` (single-player untouched); degrades to SP on disconnect. **Still UNTESTED over a real network** — needs a two-machine playtest (watch: avatar smoothing, capture hand-off, host migration). Chest contents + durability not synced yet.

## WRETCH v2 — MODEL REBUILD + ANIMATOR REFERENCE (2026-07-15, verify on GPU)
Ground-up rebuild of `buildWretch` to fix "chunked/plastic segments" and go humanoid dog-demon.
- **v2f (2026-07-15):** jumpscare now uses a soft **non-glare fill light** (`jumpLight`) on the face + **zoomed out** (D 0.62→0.95) + low bloom (0.7) so the face reads instead of glare. **Held torch:** cloth ball moved to the TOP of the stick, flame **2× bigger and NO bounce** (steady). **Dropped torches/lanterns emit light** (a PointLight follows the floating drop).
- **v2e (2026-07-15):** held torch/lantern light is **suppressed while grabbed** (was glare-blowing the throat jumpscare). **Dungeon devour:** when the 2-min tie timer runs out, `grabPhase='devour'` → the Wretch lunges in for the **full throat jumpscare → fade to black (`blackOverlay`) → death** (`jumpscareUpdate` branches devour vs the normal grab→haul).
- **v2d (2026-07-15):** **BOX head** (cranium/muzzle/ears/nose/eyes/throat all rectangular, same flesh shader). Split **upper jaw (fixed to head)** + **lower jaw `P.jaw` (drops down)**; on `faceOpen` the **whole head lifts/rears** (`P.head.rotation.x`) and the lower jaw gapes. **Tentacles now anchored to the LOWER jaw** so they spill out of the opening mouth. **Facing fix:** wall-cling (`surfaceUp`) is now gated to caves only (it was tipping the body onto nearby tree normals = "facing left"), and during HUNT/CHASE the body yaw is forced dead-on the player ("always runs directly at me"). **Terror rout:** >100 damage in one encounter (`wretch.encDmg`, decays if left alone 10s) → scream + shriek + forced FLEE at speed 21. **JUMPSCARE = full-frontal throat every grab:** camera jams to just outside the open maw looking straight down the throat (teeth framing, tentacles thrashing at the lens).
- **Vertical pursuit (2026-07-15):** closed the airborne safe-spot — while HUNT/CHASE/committed and horizontally close (<3.6), the Wretch scales up (or drops) to the player's Y (pillar/tower/mid-air), and the grab now needs 3D adjacency (`near<2.4` AND |Δy|<2.4), not just horizontal.
- **v2c (2026-07-15):** **20% smaller** (`WRETCH_BASE_SCALE` 1.6→1.28). Palette → **dark crimson / netherrack × nether-brick** (dim dried-blood, low brightness, no bright veins). Head-gaze now tracks the player whenever it senses/sees you within ~40 (fixes "not looking at me"). **Idle = mostly dead-still** (70% long stillness + faint breathing, 30% a single gesture) instead of constant fidgeting. NOTE: body faces its *movement* direction (during STALK that's toward cover, so it can look side-on to you — the head now turns to you). If it's a true 90° error on GPU, adjust the `placeWretch` basis.
- **v2b (2026-07-15):** limbs/spine/pelvis are now **RECTANGULAR over-long boxes** that overlap at joints (round caps caused the "chunked" gaps — boxes fixed it). Feet toe now points **-Z, same as the dog head**, so head+feet+run direction agree (if it still runs backwards, flip the placeWretch basis `negate`). Flesh shader palette made **volatile/Foxy-bloody**: muddy-dark base → dark-red patches → maroon blotches → BRIGHT-red blood veins + wet glints. Watching-eyes: 6 in pool, more frequent, range 15–45 (visible from the beach into the treeline), **look at them → vanish instantly + rustle/twig-snap** (`sfxRustle`). Ambient one-shots given **synth fallbacks + louder** (fixes "updated sounds can't be heard" if a sample is silent/unloaded). Entity **anti-stuck**: lateral detour + side-flip when wedged on a trunk.
- **Seamless skin:** ONE shared procedural flesh shader — `fleshMatMake()` → `wretchMat`, applied to every body mesh. Object-space fbm noise: near-black wet base, raised **blood-red veins**, dark crevices, pores, wet glints. Tuning uniforms per material: `uFleshScale` (vein frequency), `uVein`. This + **oversized overlapping joint balls** (radius ≥ segment radius at every pivot) makes it read as one organism, not stacked capsules.
- **Humanoid, elongated:** pelvis(y=`LEG`=2.45) → spine[0..2] → chest → neck; long arms `armSeam(...[0.86,0.8,0.52,0.34])`, long legs (thigh 1.25 + shin 1.2). **Feet at local y≈0** ⇒ group origin at the feet ⇒ `placeWretch` `feetOff≈0.05*S` (was the finicky offset — verify).
- **Dog head:** cranium + tapered **muzzle** (`snoutU`) + wet black **nose** + back-swept pointed **ears** + eyeshine eyes + **sharp teeth** rows (upper point down, lower point up). Hinged lower **jaw** = `P.jaw` (rotation.x opens). A dark-red **throat** cavity (`P.maw`) sits at the back.
- **Throat tentacles:** `P.tentacles` (5 × 8-seg) anchored deep in the throat, hidden at rest → on `faceOpen` they **extend and writhe OUT of the opened snout**.

### ANIMATOR REFERENCE (rig contract — the animation system reads these; keep the names)
- **Joints (THREE.Group, rotate these):** `P.pelvis` (root) · `P.spine[0..2]` (base→chest, +x bows the back) · `P.neck` (`rotation.y` = head turn toward player) · `P.head` (dog skull group; `.scale` used by jumpscare) · `P.jaw` (`rotation.x` ≥0 opens the maw) · `P.arms[L,R]=[shoulder,j0,j1,j2,hand]` (rotate chain[1..]; **x** = swing fwd/back, **z** = splay out) · `P.legs[L,R]={hip,thigh,shin,foot}` (thigh/shin/foot `rotation.x` = stride) · `P.eyes[2]` (eyeshine spheres; `P.eyeMat.emissive` = glow) · `P.maw` (throat group; `.scale` swells with `faceOpen`) · `P.tentacles[{root,segs,seed}]` (root.visible + scale + per-seg rot = writhe) · `P.extra=[]`, `P.petals=[]` (retired — safe to ignore).
- **Drive signals:** `wretch.faceOpen` 0..1 (anger → jaw+maw+tentacles) · `wretch.crawl` 0..1 (all-fours pitch, in `placeWretch`) · `wretch.gaitPhase` (stride clock) · `wretch.yaw` = body facing = **run direction** (only the head/neck turns to the player, and only when near/watched). `animateWretch` already re-authors gait/gesture/head-gaze/face-bloom for this rig — RETUNE amplitudes here, don't rename joints.
- **To add animations:** operate on the groups above; positions are in the creature's local space (pre-`WRETCH_BASE_SCALE`). New idle actions go in the `GEST[]`/`playGesture` library.

## HUNTING FIX (2026-07-15 — verify on GPU)
- **Root cause:** deadlock — far/blind, it fell to `brainModeToState()`→SCOUT, which orbited a *spawn treeline node* at a fixed 55–80 radius and never closed distance, so it never got within 46 blocks and STALK/CHASE/HUNT never fired. The cold-anchor "patrol known places" over-correction made it ignore the player entirely.
- **Fix:** **STALK is now the default approach** and *closes distance from cover* (targets cover at `max(5, near*0.6)` around the player, spiralling inward; advances even if no cover found; faster when far, creeps when near). The omniscient Director legitimately vectors the Body toward your region to create the encounter; the perception gate still governs the *reactive* charge/freeze — it needs real LOS (`s.seen`) to CHASE(<48)/HUNT(<26), freezes/looms when watched, TRACKs scent/sound when it loses you. Test: `K` to summon → it should approach through cover, freeze if you stare, and charge+grab when close & unwatched.

## SHIPPED (2026-07-15 build pass — code-complete, `node --check` clean, PENDING GPU PLAYTEST)
All in `index.html`, all commented. Verify these in-game before building further on them:
- **Floating dropped items** — blocks/animal-kills pop out physical item-cubes → fall → hover-bob+spin → magnet pickup (partial if full, ~5min despawn).
- **Timed mining** — hardness ÷ tool-tier-speed dig time, crack/darken overlay + shake + break particles; creative = instant. **Tool durability** decrements & snaps; **durability bar** in the hotbar.
- **Tree-fall** — base-log break topples the trunk, leaf puff, log burst.
- **Held-item viewmodel** (bottom-right, bobs, swings on click) + **melee combat** (spear/sword 4/5/6, axe 3/4/5, fist 1) on the Wretch (raises `wound` → provokes HUNT) and animals.
- **6 animals** (deer/rabbit/fox/owl/sheep/crow) — random daytime grass spawning, wander/flee, herds, crows scatter from the Wretch; real drops. **Wretch predation** hook (hungry → eats nearby animal). **Tiny spiders** in caves/dungeon/night → drop string.
- **Weather** — rain + overcast dimming + lightning flash + distance-delayed thunder.
- **Capture rebuild** — dungeon ≥100 blocks out; 4-phase jumpscare → **haul** (across ground) → **pull-through** (entity crunches into the 1-block shaft, drags you down) → **tied** (sat against wall, **2-min incapacitation**, `rescuePlayer()` co-op hook / solo self-struggle). No death until the timer ends.
- **No phasing** — animals reject moves into solids; entity movement + the (now scripted) drag are physical.
- **Fall damage** (water negates) + **drowning** (breath meter).
- **Dungeon decoration** — blood pools, scattered bones/skulls, a ribcage at the altar.
- **Cabin + creepy basement** (loot chests) and a **Mine** (sloped adit, branching shafts, ore veins, torches, loot) near spawn.
- **Trail network (baked into worldgen)** — dirt paths (normal `dirt`, not grass-path) as **tree-free corridors**: **beach→cabin**, **cabin→dungeon**, **spawn→dungeon**. `trailDist()`/`trails()`; `genColumn` lays dirt within 1.6 of a segment, `decorate` suppresses tree bases within 2.6 (neighbour canopy still overhangs, not cut). Deterministic, appears as chunks generate.
- **Cabin fixes** — removed the oversized ±9×34 tree-strip (it was slicing neighbour canopy flat) and the grass-path ring; the cabin now sits on the worldgen dirt trail in a **radius-8 clear yard** (tree bases kept off the walls/path; canopy beyond leans in naturally, not sliced). Added a **readable paper note** (walk up → lore text fades in on screen; `addNote`/`checkNotes`).
- **Drag PATHFINDING (no more phasing)** — the haul no longer straight-lines through terrain. `buildDragRoute` routes grab→nearest dungeon-bound trail→lair→shaft; `dragStep` moves the player with a 9-heading obstacle probe (steps over ≤1.7, never into a solid), so it follows the carved paths or steers its own way around trees. Fixes "we phase directly in a straight line back to the thing".
- **Wretch tuning (2026-07-15b)** — **longer legs + wider hips**, **smaller head**, **longer** (8-segment) tentacles, **no cloth** (shroud/rags removed), all-black with a **shiny wet fleshy** material (bones/fangs darkened to near-black so nothing white pokes out). **Facing rule:** the BODY always faces its run direction; only the HEAD turns to the player, and only when near/watched/committed (else it faces forward too). Leg/ground `feetOff` bumped to 1.45 for the longer legs — VERIFY on GPU (finicky offset).
- **Spiders** — flat body + **8 splayed legs** + red eye-specks, and they **CLIMB walls/trunks** (rise instead of turning when blocked, then step onto the top) instead of only skittering flat.
- **Wretch redesign** — slimmer/smaller (scale 1.6). Face is a **voxel bloom**: 4 black voxel plates that unfold to reveal a blocky **bloody/green/red toothed maw**, plus **5 thin squirming red tentacles** that extend and writhe when enraged (driven by `faceOpen`). (Kept the joint rig + bone details; the full ground-up voxel rig is still the queued deep task.)
- **Watching eyes** — ambient pale eye-pairs that blink in the dark **treeline at night**, face you, and **vanish if you approach** ("was something there?"). Pure dread, not the Wretch (`updateWatchers`, pool of 4, woods only).
- **Q drops the held item** — tossed forward with a 1.8s no-pickup window (so it doesn't instantly vacuum back); `spawnDrop` now takes a pickup-delay arg.
- **Wretch is a 2700-HP boss** — tools/sword do **5–8 per hit** (fist 2), the **AR-15 does 45/shot** (~60 rounds to down it). `hurtWretch` tracks `wretch.hp` silently (health bar removed per dev request); `killWretch` on 0 → violent recoil + despawn/retreat, bar hides, HP resets for its next return. The `wound` provoke meter is now decoupled from raw damage (+0.18/hit) so it still drives HUNT/FLEE.
- **2-block beds** — placing a bed lays a foot + head pair along the facing axis (full-length MC bed; 1-block fallback if no room); breaking either half removes both, drops one bed.
- **Campfire cooking** — right-click a campfire holding raw meat / iron ore / sand → cooked meat / iron ingot / glass (fire-fuelled, no coal), with sizzle + sparks. The "furnace-style cooking analog" (crude craft-smelt recipes still exist too).
- **AR-15** — real **procedural 3D rifle model** (`buildAR15`: receiver/barrel/handguard/rail/sights/mag/grip/stock) held in first-person with recoil kick; **loud** layered gunshot + **muzzle-flash sprite + world-lighting PointLight**. Hitscans the look ray, staggers/repels the Wretch (won't farm-kill it), one-shots most animals. In the starter hotbar by default; hidden craft recipe also exists.
- **Adaptive quality** — render distance auto-steps 4↔(your setting) every ~2.5s to hold ~32+ fps; shown as `rd` in the F3 profiler.
- **Mountains** — low-frequency region mask lifts real peaks (rocky stone caps above the snowline); caves already exist.
- **Mountain village** — flattened plateau + cluster of thatch/plank/log cottages (loot chests) on far high ground.
- **Sample audio system + ~50 baked SFX + music** — `./sounds/*.ogg`, loaded by base name with **numbered variants** (grass1-3, stone1-3, wood1-3, sand1-3, water1-3, break_wood/stone/leaves, drip1-3, wind1-2, creak1-2, branch1-2, owl1-2, crow1-2, bird1-2, sheep, deer, growl1-2, shriek1-2, clicks1-2, call1-2, hurt1-2, thunder1-2) — `playSample()` picks a random variant, else procedural fallback. **`music.ogg`** = a 120s looping CLEAN eerie ambient score (smooth detuned minor-chord pads + sub-bass swell + sparse glassy bells + soft air wash + gentle feedback-delay reverb — NO vinyl crackle/hiss/lo-fi; the old grainy version was replaced) that **rises with menace** via `setThreat`. **Intermittent spatial ambience scheduler** (`ambientOneShot`): drips underground (via `caveDrip` + droplet), wind/creak/branch/birdsong by day, owls/crows/wind/branch by night. Wired: footsteps (per material), block breaks, water/splash, thunder, animal hurt, and the **Wretch voice** (call/clicks/shriek/growl through the short-range voice pool + distance fade). All generated by `sounds/gen-sfx.js` (Node DSP → ffmpeg libvorbis); replace any file with a same-named `.ogg`/`.wav` for real recordings. `server.js` serves audio MIME.
- **Entity anger visual reworked** — the **red demon skin is GONE**; instead the **face blooms open (demogorgon petals + inner maw + unhinging jaw)** when enraged, driven by `wretch.faceOpen`. Aggravated form keeps the extra arms + looming scale, eyes go cold amber (not red). Jumpscare blooms the face fully.
- Earlier: underwater fog, water depth-darkening + no white sparkle, water physics + splash sfx, spatial/quieter/wetter Wretch footsteps, no-load-buzz, perception gate (entity only knows your position when it perceives you), voice made spatial + short-range, two head horns.

### NEXT MAJOR TASK (queued, do as its own careful pass)
- **Rebuild the entity as a detailed VOXEL creature** (dev request 2026-07-15): keep the current level of detail but voxel-styled — full **ribcage**, **wither-skeleton** reference for the skull/bone structure, **Demogorgon** body proportions. Partly done: material is now matte enderman-black + slimmer, and the **face-bloom** (voxel plates → bloody/green toothed maw + squirming red tentacles) is the anger tell. Remaining: the ground-up voxel rig.
  - **ALL ANIMATIONS must be kept but REWORKED to the new model** (dev note): running, crawling, leaning/peeking, the ~100 random idle actions, sitting, drinking by the water, gestures, drag pose — every animation should be re-authored for the voxel rig, not lost. The current rig/joints (`P.*`) are preserved so existing animations still fire; they need re-tuning to the new proportions.
- **Ladders** (dev request 2026-07-15): build ladders as **both an item and a placeable object** — climbable (vertical movement when against one), craftable (sticks), placed on walls. Needed for the cabin basement / mine shafts / dungeon vertical access.

---

## 1. HOW TO RUN, EDIT, AND VERIFY (read first)

- **The game is one file:** `D:\code\Minecraft\index.html` (~2400 lines). One `<script type="module">` holds all logic.
- **Three.js r160 is VENDORED locally** in `D:\code\Minecraft\vendor\` (`three.module.js` + `jsm/` addons). An **import map** in the HTML points at `./vendor/`. It is NOT a CDN — the game runs offline.
- **It MUST be served over http.** ES-module imports are CORS-blocked on `file://` (origin "null"), so double-clicking the HTML shows the title screen but never boots the engine. `server.js` (tiny Node static server, port 8777, correct `text/javascript` MIME) serves it. `Hollowcraft.bat` launches the server + opens the browser; the desktop shortcut points at the .bat.
  - To (re)start the dev server: `cd D:/code/Minecraft && NO_OPEN=1 node server.js &` then open `http://127.0.0.1:8777/index.html`.
- **The player refreshes with Ctrl+Shift+R** to load edits (server sends `no-cache`). No rebuild step — edit the HTML, refresh.

### Verification workflow (IMPORTANT — the renderer can't be screenshotted here)
- **Syntax check every change:** extract the module body and `node --check` it:
  ```
  # PowerShell: pull the <script type="module"> body, strip bare imports, node --check
  ```
  (imports reference bare `three`; strip lines matching `^import ` before `node --check` — it only checks syntax, not resolution.)
- **Runtime error scan (the only reliable visual-ish check here):** headless Edge with `--enable-unsafe-swiftshader`, short `--virtual-time-budget`, capture `--enable-logging=stderr`, then grep the console for `Uncaught|ReferenceError|TypeError|is not defined`. Run it in the background with a fixed `sleep` then kill, because SwiftShader is slow.
- **SwiftShader (software GL) is too slow to screenshot a full frame of this scene** — it times out. You can confirm *no console errors* and grab partial/low-setting frames, but you **cannot judge visuals or FPS here.** The developer's real GPU (RX 5700 XT) is the only visual/perf test. Make changes incrementally + syntax-clean; rely on the human to eyeball results.

### Debug URL params (append to the localhost URL)
- `?debug=1` — auto-start (skip the title screen).
- `&wretch=1` — spawn the entity ~14 blocks in front, facing you (debug觀察).
- `&rd=N` — render distance in chunks (default 9; use 1–2 for software-GL tests).
- `&q=Low|Medium|High|Ultra` — quality (shadow size, bloom, light pool).
- `&t=<seconds>` — time of day (DAY_LEN=600; e.g. `t=200` noon, `t=470` night).
- `&nomip=1` — skip atlas mipmap generation (much faster in software GL).
- `&smodel=` / `&fmodel=` — override the OpenRouter strategy/fast model slugs.

### AI keys
- ONE key: **OpenRouter** (`localStorage['hollowcraft_or_key']`), entered on the title screen. It routes BOTH tiers: `OR_STRAT_MODEL` (default `anthropic/claude-opus-4.1`) for strategy + vision, `OR_FAST_MODEL` (default `google/gemini-2.5-flash-lite`) for reflexes.
- No key → the entity runs on pure deterministic logic (fully playable). The LLM is an enhancement layer, never a dependency.
- Entity memory persists in `localStorage['hollowcraft_brain_mem']`.

---

## 2. TECHNICAL ARCHITECTURE (systems and where they live)

The file is organized top-to-bottom by `// ===== SECTION =====` comment headers. Reference those (line numbers drift). Order:

1. **CONFIG** — `CFG` (SEED, CHUNK=16, WORLD_H=128, SEA=30, RENDER_DIST=9, DAY_LEN=600, quality). `Q` = URL params.
2. **RNG / NOISE** — `xhash`, `noise2/3`, `fbm2/fbm3`, `ridged`, `clamp/lerp/smooth`.
3. **TEXTURE ATLAS → DataArrayTexture** — `paintTile(name,fn)` draws 16×16 procedural tiles into a canvas; `TILEIDX[name]`. Then packed into a **`DataArrayTexture`** (one tile = one layer → no bleed + per-layer mipmaps). `?nomip` disables mips.
4. **BLOCK REGISTRY** — `block(name,def)` → `B[id]`, `BID[name]`, fast arrays `isOpaque/isSolid/blockLight/blockCat`. Categories: `solid` (opaque cube), `cutout` (alpha-tested: leaves/glass), `liquid` (water), `cross` (billboard foliage), `model` (custom mesh block-entities: chest/torch/bed/fence/etc.), `air`.
5. **WORLD STORAGE** — `world` Map keyed `"cx,cz"`; each chunk `.blocks` = `Uint8Array`, index `x + z*16 + y*256`. `getBlock`, `setBlockWorld` (records to `edits{}`, marks remesh, sets `hasWater/hasCross/hasModel`). `edits{}` persists player changes across chunk regen.
6. **TERRAIN GEN** — `surfaceH` (domain-warped fBm + ridged highlands + rivers), `caveCarved` (2 spaghetti-noise ridges ∩ + cheese caverns), `decorate` (huge pines + understory foliage), `generateChunk`. `opaqueTop`/`skyExposure` (per-column, drives cave/canopy darkening).
7. **GREEDY MESHER** — `greedyMesh(chunk,'opaque'|'cutout')`, `waterMesh`, `foliageMesh`. Merges coplanar equal faces; **UVs derived from world axes** so side tiles stay upright. Attributes: `aTile` (atlas layer), `aSky` (skylight 0–1), `aBlockUV` (block-space UV, `fract()`-sampled in shader). ~90% face reduction.
8. **RENDERER / SCENE / UNIFORMS** — `renderer` (AgX tonemap, PCFSoftShadowMap), `scene` (FogExp2, bg=fog color), `camera` (fov 74). `globalU` shared uniforms (uTime/uSunDir/uMoonDir/uDay/uCamPos/…). **`grabFrame()`** renders the scene to a small offscreen target → base64 JPEG (entity vision).
9. **MATERIALS** — `injectAtlas(mat,opts)` monkeypatches a **`MeshPhongMaterial`** (per-fragment — NOT Lambert, which is per-vertex and made point-lights blocky) via `onBeforeCompile`: samples the array texture in `<color_fragment>`, scales *indirect only* by skylight in `<lights_fragment_maps>`, optional cutout `discard` + foliage wind. `opaqueMat/cutoutMat/foliageMat`.
10. **SKY DOME** — ShaderMaterial (BackSide sphere): Rayleigh/Mie-ish gradient, parallax background **mountain silhouettes**, horizon curvature fade, drifting clouds, moon disc + halo, stars.
11. **WATER** — custom ShaderMaterial: 4-wave Gerstner vertex displacement, Fresnel-Schlick (F0 .02), foam on crests, layered scrolling noise normals, grazing-angle opacity. Manual exp2 fog (scene uses FogExp2 so `fog:false`).
12. **LIGHTS + SHADOWS** — one directional sun/moon key light, single texel-snapped PCFSoft shadow cascade (fit + steep-angle clamp to kill sunset acne). Hemisphere + low ambient floor. **Point-light pool** (`pointPool`, size by quality) for torches/lanterns + one `heldLight` — **gated by intensity, NEVER `.visible`** (toggling light count recompiles all materials → hitch). `assignPointLights()` assigns the nearest emitters (from each chunk's `c.emitters`, collected in `buildModelBlocks`).
13. **POST** — `EffectComposer`: RenderPass → UnrealBloom → OutputPass → **GradeShader pass** (film grain + saturation + vignette). `gradePass.uniforms.uTime` updated each frame.
14. **BLOCK MUTATION / CHUNK MESHES** — `buildChunkMeshes` (opaque/cutout/water/foliage meshes + `buildModelBlocks` for model blocks; disposes old geometry — **must `.dispose()` on unload or GPU leaks**), `disposeChunkMeshes`, `chestLid` anim.
15. **CHUNK STREAMING** — `streamChunks(genBudget,meshBudget)` distance-sorted via `RING`; `neighbors8` gate (mesh only when all 8 neighbors generated); `unloadFar` (with dispose). Time-sliced on the main thread (NOT a worker).
16. **PLAYER + PHYSICS** — `player{pos,vel,yaw,pitch,health,hunger,...}`, AABB collision + step-up, `raycastVoxel` (DDA) for targeting. `physics`, `respawn`, `damage`, `die`.
17. **ITEMS / INVENTORY / CRAFTING** — `ITEMS{}` (block items auto-generated + tools/food/materials), `drawIcon`/`iconURL`, `inv[36]` (0–8 hotbar), `RECIPES` + `craftMatch` (shaped bbox-trim + shapeless multiset, verbatim MC). UI engine: `slotClick` drag/drop/split/shift-move, tooltips, chest storage + animated lid, 2×2 (E) & 3×3 (table) craft grids.
18. **CONTROLS / HUD** — pointer-lock (raw mouse), WASD/sprint/sneak/fly/creative, break/place/use/eat, E inventory, F3 profiler, F8 director console. Hotbar/hearts/hunger HUD.
19. **AUDIO** (Web Audio, all procedural) — `initAudio`, HRTF `panners` pool + `panAt`, `burst()` (noise+bandpass one-shots), procedural convolution reverb (forest/cave crossfade), `sfxStep`/`wretchStep` (material + wet footsteps), `sfxBreak/sfxPlace/sfxCreak`, `wretchVoice` (nonlinear ring-mod + noise + chaotic pitch: distant_call/close_clicks/sting/scream), `setThreat` (ducking + sub-rumble + crackle), `_audioFrame` (listener sync + step cadence). Hooks are `let`-vars assigned here; the loop calls `updateAudio`.
20. **THE WRETCH — BRAIN** — 3-layer: **deterministic utility controller** (`pickMode` picks 1 of 9 `MODES` every tick with hysteresis; hunger `wretch.hunger`, energy `brain.E`, menace `HORROR.menace`, knowledge `brain.K`) + **STRATEGY tier** (Opus via OpenRouter, sets `brain.Wllm` mode-bias weights + goal/tactic/reveal/rule_to_violate/thought + memory, WITH screenshot on events) + **FAST tier** (fast model, posture/vocal/gesture/speed). `makeTier` (non-blocking, TTL, in-flight guard, abort timeout); `orCall`; `applyStrategy/applyFast`; `updateBrain`. Modes map to movement states via `brainModeToState`.
21. **THE WRETCH — BODY/VISUAL** — `buildWretch` builds the rig (joint groups: `P.pelvis, P.spine[], P.neck, P.head/P.face, P.jaw, P.eyes, P.arms[], P.extra[]` (4 demon arms), `P.legs[]`, `P.skin[]` for demon material swap). Materials: `wretchMat` (wet black), `demonMat` (bloody), `faceMat` (human skin), `boneMat`. `setForm('demon'|'wretch')` swaps skin material + scale + shows extra arms + red eyes. `GEST[]` = ~29 idle gestures; `playGesture`/`animateWretch` (gait scramble + gestures + head gaze). `updateWretch` = reactive predator core + mode behaviors + drag. `moveEntity` (obstacle-aware steering — steers around trunks/walls, no phasing). `placeWretch` (surface-crawl quaternion — up-align to walls/ceilings only when `crawl>0.65`, local-axis pitch so it never lifts into the air). `beginDrag/dragUpdate/dragPose/endDrag` (grab → haul to lair). `buildDungeon` (carves the lair chamber). `spawnWretch/despawnWretch`. State in `wretch{}`.
22. **MAIN LOOP** — `renderer.setAnimationLoop(loop)`. `dt = clock.getDelta()` ONCE. Order: updateSky → (if started) physics/survival + updateBrain/updateWretch/updateAnimals → updateCamera → updateAudio → streamChunks → assignPointLights → updateBlockFx → composer.render. Pause on `visibilitychange`.

### Conventions & gotchas (violate these and things break)
- **Preserve the entity rig joint names** (`P.*`). All animation/gestures/crawl read them; renaming/removing breaks everything.
- **Point lights: gate by intensity, never `.visible`.** Changing the visible-light *count* recompiles every material (frame hitch).
- **Use `MeshPhongMaterial` for lit voxel surfaces** (per-fragment). Lambert is per-vertex → point-lights pool blocky on big greedy quads.
- **LLM calls never block the loop.** Fire-and-apply; TTL fallback; no `await` in the frame. No key = deterministic path (must always work).
- **Dispose chunk geometry on unload** (`geometry.dispose()`); shared materials/atlas are NOT disposed per-chunk.
- **`setBlockWorld` triggers remesh**; carving many blocks at once (e.g. dungeon) hitches once — acceptable, keep it one-time/guarded.
- **Headless SwiftShader can't verify visuals/perf.** Trust `node --check` + no-console-errors + the human's GPU.
- 1 block = 1 world unit. Forward is `-Z` (Three convention). Entity group faces `-Z`.

---

## 3. WHAT'S ALREADY BUILT (do not rebuild)

Engine: chunked world, domain-warp terrain + rivers + 3D caves, greedy meshing, DataArrayTexture atlas, Phong+skylight materials, FogExp2, AgX, bloom+grade, sky (mountains/clouds/moon/horizon-fade), Gerstner water, single fitted soft shadow, torch/lantern/held point-lights. Player: controls/physics/step-up, health+hunger, mining/placing. Inventory + verbatim 2×2/3×3 crafting + 64 items + chests (animated lid). The Wretch: 9-mode utility brain + OpenRouter Opus/fast tiers + vision + memory + F8 console; reactive predator (creep/stare/charge/flee); obstacle-aware movement; surface-crawl; ~29 gestures; demon/6-arm transform; human face + bone anatomy; grab → 5× drag → physical lair chamber → devour; procedural spatial horror audio. Launcher + desktop shortcut.

---

## 4. KNOWN BUGS / ACTIVE ISSUES

- **Entity leg placement**: feet float above / clip the ground (group origin↔feet offset ~0.9 after the taller rebuild). Fix in `placeWretch`: offset `g.position.y` down by the origin-to-feet distance so feet sit on `wretch.pos.y`. *(Reported: "can't see the bottom of the legs.")*
- Software-GL cannot confirm current entity visuals (human face + bones) — needs the developer's eyes.

---

## 5. OUTSTANDING BACKLOG — every requested adjustment NOT yet built

Ordered roughly by the developer's stated priority. `[NEW]` = requested most recently.

### Entity (highest engagement)
- **[NEW] Make the entity 2× bigger.** Scale the `wretch.group` (and fix the leg/ground offset in §4 together so it stands correctly at the new size).
- **[NEW] Day 1 = NO entity at all.** The first full in-game day the Wretch does **not spawn / does not appear** — a genuine grace period. The player gets one day to gather, build, and learn that the world is safe (beds/torch/daylight) BEFORE anything hunts them. The Wretch first activates on **night 1 / start of day 2**, then escalation begins. This is the setup half of the safety-then-violation loop (§7.3) — the calm that makes the arrival land.
- **[NEW] Locational awareness.** Define a set of named world locations (spawn, cabin, dungeon/lair, mine, village, river, ridge, chokepoints, **trail nodes** — see Structures) with positions; feed them to the STRATEGY tier so the Wretch reasons about *places* ("wait at the cabin", "ambush the river path"), and bias `target_zone`/cover selection toward them. Track which the player frequents. **The trail network (below) is part of this map — the brain must know the trails and prefer them when dragging.**
- **[NEW] Drag must PATHFIND along the trail network, not through trees.** Right now it hauls the player in a straight line through the forest. Instead it must route on the **dirt trails**: from wherever the grab happens, path to the **nearest trail node**, follow the **path graph** to the **dungeon**, and end at the lair. Canonical route shape: **beach → path → (path → path…) → dungeon**. The dungeon is its **home** — always the drag terminus. Requires A*/graph pathfinding over the trail nodes (mapped into the brain, see locational awareness) with the straight-line fallback ONLY if no trail is reachable. The drag should visibly follow a readable dirt path the whole way.
- **[NEW] Ensure the player does NOT die until reaching the lair.** During the drag there should be **no lethal damage** — death happens only on arrival at the dungeon (devoured). *(Implemented: `dragUpdate` no longer ticks damage; death is only in `endDrag(true)`. VERIFY on GPU — if still dying mid-drag, audit every `damage()` / `die()` reachable during `wretch.dragging`.)*
- **[NEW] Fix leg/ground offset** (see §4).
- **[NEW] Seen-response = temporary freeze, THEN break into the woods (not a reflex bolt).** Being observed is not an automatic flee. When watched the Wretch should **hold / freeze / stare back for a few seconds** (Terror-over-horror), and *then* either resume stalking or **peel away into tree cover**. So the sequence is: caught looking → freeze a beat → slide/scatter behind cover. Weighted, not instant.
- **[NEW] When it flees, it must go INTO the woods.** A fleeing Wretch paths toward **tree cover / the treeline**, never into open meadow, water, off a cliff, or toward the player. Use the locational map + trail graph: pick the nearest dense-forest node away from the player's facing and scatter-crawl to it, then resume stalking from cover. (Today RETREAT just moves away with no cover-seeking — fix the destination.)
- **[NEW] HUNT must be DETERMINISTIC, not Opus-gated.** The spec originally authorized HUNT only via an Opus directive; **override that** — the Body decides to attack locally when ANY of: it's **hungry**; a random **anger/aggression** roll fires; the **player has hurt it**; **too long has passed with nothing happening** (boredom/pacing timer); or **it's stalked successfully** (high confidence, close, unseen). Opus can still *encourage/forbid* a hunt, but the reflex triggers stand alone so it stays lethal offline.
- **[NEW] RETREAT destination = mostly the DUNGEON.** After a hit or at dawn, the Wretch withdraws to a **den**: usually its **dungeon/lair**, occasionally a **cave**. Not just "away from player" — it heads home to a real place (ties into locational awareness). Nonlinear vocalization sting on the break.
- Corrupted animal variants (tier ≥4): wet-black animal reskins that stand unnaturally still and watch.
- **Deeper learning/memory (persistent log fed to Opus every call).** Maintain a persistent player-model (see §7.5 memory): **base location, door positions, frequently-walked paths, past encounter outcomes.** This log is sent to Opus on every call so cunning genuinely accumulates — it should **bias peek positions along the player's learned paths**, **test the scarecrow decoy before committing** to a real approach, and at **higher tiers unlock rule violations**: appearing at **dusk instead of night**, **scratching at doors**, **interrupting sleep**. (Partial today — a rolling summary exists; the structured player-model + reflection loop + path-biasing + decoy-testing are not fully wired.)
- **~100 distinct behaviors/emotes** (stated target). Current gesture library is ~29. Expand toward ~100 discrete observable actions: stand-and-stare, head-tilt, wave, mimic the player's last motion, peek-and-retract, mark/scratch a tree, sniff the ground, twitch, crack joints, dislocate/reset a limb, press against a wall, drum fingers, feed on a kill, drag-a-carcass, listen (freeze + head-track audio), etc. Variety is the horror — the player should rarely see the same thing twice.

### Structures & world (mostly unbuilt)
- **Cabin** within 100 blocks of spawn: furnished log/plank build, a **chest with loot**, and a **creepy basement**.
- **Village**: a few cottages (thatch/plank/wattle), paths, fences, lanterns, gardens (cottagecore).
- **Mine**: hillside entrance, branching shafts, ore veins (coal/iron), torches, **random loot chests** with important materials.
- **Dungeon (the lair) full decoration**: only a basic mossy chamber + altar + entrance shaft exists. Needs dead animals, **skulls, bones, blood, moss, spiders, and a proper weird altar.** This is the drag destination — make arriving there horrifying.
- **Random loot spawns** scattered across the island (chests/caches).
- **Mountains + icy peaks**: raise the elevation ceiling for real mountains; add snow / ice / packed-ice blocks above a snowline; rocky outcrops. (Terrain today is hills + rivers + caves only.)
- **[NEW] Trails / dirt paths through the woods.** Generate a network of readable **dirt paths** connecting key locations (spawn ↔ cabin ↔ village ↔ mine ↔ river ↔ the lair). Deterministic from seed. This serves two purposes: (1) navigable landmarks for the player, and (2) the **route the Wretch drags you along** — so build the trail as a **graph of nodes mapped into the creature's brain** (ties into Entity → locational awareness). The path to the dungeon should be clear and followable.
- New blocks these need: bone, skull, blood, altar, snow, ice, packed-ice, **dirt-path block** (add to atlas §3 + block registry §4 of code first). *(A `path` block already exists — reuse or extend it.)*

### Creatures
- **6 animals**: deer (herd flee), rabbit (freeze-bolt), fox (curious follow), owl (perch + night call), sheep (wool), crow (flocks that **burst from trees when the Wretch passes** — early-warning). Simple ~10 Hz AI. These are the Wretch's **prey** (its `HUNT_PREY` mode currently has nothing to hunt).
- **[NEW] Random ambient spawning**: animals spawn randomly around the player in the daytime forest/meadow (per-biome weighting, spawn cap, despawn at distance, cluster deer/sheep into small herds). World should feel alive so the silence when the Wretch is near actually reads as wrong.
- **[NEW] Real drops on kill**: killing an animal drops physical **floating item entities** (see below) — meat (raw → cook for food), plus leather (deer/fox), wool (sheep), bone (any), feather (owl/crow). Meat is the crafting/food payload the survival loop hangs on and what the Wretch itself feeds on.
- **Tiny spiders**: small skittering crawlers in the dungeon/caves/at night; drop string; ambient dread.
- Animals stare at the treeline before a sighting / go silent in the Wretch's radius.
- **[NEW] The Wretch PREYS on animals to feed (full kill sequence).** When `HUNT_PREY` fires (hunger high), it stalks → **lunges and grabs** the animal → **opens its jaw wide showing razor teeth** → **blood spurts/sprays** (particle burst + decal) → it **kills and eats**, which **drops `wretch.hunger` back down** (this is how the entity self-satisfies hunger instead of only hunting the player). Afterward it **leaves a dead carcass on the ground — split-open ribcage, blood pool/spatter** — as a persistent world prop (a fresh horror landmark the player can stumble on). Carcasses linger, then fade. Ties into: jaw/teeth on the rig (§21 `P.jaw`), the blood/particle FX system, and a new `carcass` model/decal. Seeing the aftermath should read: *something out here eats, and it wasn't gentle.*

### Gameplay & feel
- **Held-item viewmodel + click-to-hit**: the selected item/tool/torch/spear is **visible in first-person** (bobbing at the screen corner) and **used when clicked** — left-click swings/jabs it with an animation and **deals that item's damage** to whatever's in reach (animal, entity, block-break). Spears jab forward; tools swing. Empty hand = a weak punch. Damage per item comes from §7.8. This is how you fight the animals and (desperately) the Wretch.
- **Floating dropped items — exactly like Minecraft**: broken blocks and animal kills spawn small item entities that **pop out, fall with gravity, land, then hover bob + slow-spin** on the ground. Player-magnet pickup within ~1.5 blocks, stack-merge nearby drops, ~5-min despawn. Currently drops go straight to inventory — replace with these physical entities (shared by block-break AND animal-kill drops).
- **Trees fall over all at once** when the base log is broken, and drop a burst of logs.
- **Breaking takes TIME (like Minecraft)**: holding break runs a timed dig — block hardness × tool tier/speed sets the duration (instant tap-mine gone). Show the **10-stage cracking overlay** progressing on the target face, a slight block "shake," and a burst of block-break particles on completion. Wrong/no tool = slower; correct tool tier = faster. This gates the AR-15/tool-durability loops too.
- **Doors**: 2-tall hinged block with open/close animation + collision toggle. (Trapdoor/gate/sign exist only as static placeholder models — need connection logic / animated open-close / editable+swaying signs.)
- **[NEW] Torch flame + flicker + the Wretch can snuff it.** The torch top must be a **real flame, not a cube** — a small billboarded/quad fire sprite (animated) sitting on the stick, NOT a textured block face. The **point light emits FROM that flame** and **flickers** (small pseudo-random intensity + slight position jitter, warm colour) so torchlight breathes. Applies to torches **held, placed, AND lanterns/candles**. Critically, this is a horror lever: the **Wretch can blow out** torches — held, placed, or any lit source — as a **safety-violation** (§7.3 torchlight rule) at higher tiers, plunging the area into moon-only dark. A snuffed torch becomes an **unlit torch** (no flame, no light) and must be **RE-LIT with flint and steel** (new `flint_and_steel` item: flint + iron ingot, right-click a torch/unlit source to relight, small durability). Held light going out mid-forest with the entity near = the intended terror beat.
- **[NEW] Torch light range is too SHORT — increase it.** Torchlight currently fades out too close to the source (its illuminated radius is small). Raise the point-light **distance/range** (and tune decay) so a torch lights a believable pool around the player — you shouldn't be standing next to a torch and have the ground a few blocks away go black. Bump the `distance` on the torch/held/lantern lights in the point-light pool (§ lights) and re-check decay (~1.35) so brightness carries farther without washing out. Keep the flicker on top.
- **Weather + lightning + thunder**: rain/snow particles (InstancedMesh), overcast sky lerp, wind gusts, lightning flash (screen + light pop + distance-delayed thunder); weather drives ambience/fog and is a Wretch event trigger.
- **AR-15 easter egg**: a functional ranged weapon (raycast hit, muzzle flash, sound) behind a hidden/non-obvious recipe so it doesn't break tone by default.
- Fall damage + drowning wired to real triggers (only void-death + starvation exist).
- Tool durability bars in the inventory UI.
- **[NEW] Crafting recipes must be VERBATIM Minecraft.** Audit every entry in `RECIPES` against real Minecraft recipes — exact grid shape, exact ingredient positions, exact output counts (e.g. 1 log → 4 planks; 2 planks stacked → 4 sticks; pickaxe = 3 material across top + 2 sticks down the middle column; door = 6 planks in a 2×3; torch = coal over stick → 4; chest = 8 planks ring; crafting table = 4 planks; bed = 3 wool + 3 planks; etc.). No invented/approximate recipes — if it's a Minecraft item, its recipe matches Minecraft precisely. Set B/custom cottagecore items may define their own sensible recipes, but anything with a real MC equivalent must be identical.

### Water (the current custom Gerstner shader needs a rework)
- **[NEW] Remove the white sparkling crests/foam.** The bright foam on wave peaks reads as "sparkle" and looks wrong. Kill it — use a plain, calm **water texture** appearance instead of animated white peaks. (In the water fragment: drop the `foam`/white-crest term.)
- **[NEW] Depth darkening.** Water should get **darker the deeper it goes** — more water between the eye and the bottom = darker (Beer-Lambert). Cheap approx today is angle-based; do it properly with scene depth (attach a `DepthTexture` to the render target, reconstruct water-column thickness, tint toward black-green with depth). See the PBR-water research: `exp(-absorb * depth)`.
- **[NEW] Water physics.** Actual swim/float behavior: buoyancy, slower movement, sink/rise with jump/sneak, reduced fall damage in water, screen tint + muffled audio when submerged. (Physics currently just slows you in water; flesh it out.)
- **[NEW] Water sounds.** Ambient water lapping near shorelines/rivers (spatial), a splash on entry, swimming/stroke sounds, and a muffled low-pass on all audio while the head is submerged. (Web Audio §19 — add to the audio system.)

### Audio (system is ~built; these master-prompt nuances remain)
Built ✅: HRTF panner pool (hunt-by-ear), procedural forest/cave convolver crossfade, nonlinear entity voice (ring-mod + broadband noise + chaotic pitch + sub-vocal clicks), material footsteps with randomized pitch/timing, per-material break/place sfx, threat rumble + starchy crackle bed.
- **[NEW] Persistent ambience bed with distinct layers** — the spec wants an actual soundscape to duck: **wind through the pines** (filtered noise, gusting), **owl calls** (night, tied to the owl animal — unbuilt), **night insects** (chirp bed). Confirm these exist as separate layers, not one generic pad.
- **[NEW] ORDERED ducking toward silence** — "silence is the loudest warning." As the Wretch approaches, ambience must drop in ORDER: **insects cut out first, then the wind falls away**, leaving near-silence before it strikes. Today `setThreat` ducks the mix generically; make it a staged, layer-by-layer fade keyed to entity proximity/menace.
- **[VERIFY] Starchy crackle density** should modulate up with entity proximity (it's the sonic grain that thickens as it nears) — confirm `setThreat`'s crackle actually scales with distance, not just threat state.
- **[VERIFY] Distant nonlinear calls route through the forest convolver** so they echo through the trees (not dry). Confirm `wretchVoice('distant_call')` feeds the reverb send.
- **NOTE (deviation, keep):** true 17–19 Hz infrasound is inaudible/unreproducible on consumer speakers, so within-40-blocks pressure is rendered as an amplitude-modulated **40–80 Hz rumble** instead (see §7.3). Intentional — don't "fix" to literal infrasound.
- **[NEW / REGRESSED] The WRETCH's footsteps are audible almost all the time — fix.** `wretchStep` is playing too loud and too often, everywhere. It must be: (1) **spatial** — routed through the entity's HRTF panner at the Wretch's actual position with real distance rolloff, so you only hear them when it's genuinely near and can tell the direction; (2) **much quieter** — low gain, subtle, not a constant clomp; (3) **WETTER** — soft, damp, squelching/organic footfalls (wet-earth/flesh timbre), not dry MC thuds. This was requested before and has regressed; treat as a bug. Below ~an audible radius they should not play at all. (Player footsteps are separate — see next.)
- **[NEW] PLAYER footsteps should sound like MINECRAFT's.** Retune **`sfxStep` (player only — NOT the Wretch)** toward that recognizable soft, muffled, slightly-pitched MC footstep character (short filtered noise burst, gentle low-mid resonance, quick decay, randomized pitch per step) per material: grass = soft dull thud, stone = drier click, wood = hollow knock, sand/gravel = grainy shuffle, water = wet slosh. Less "synth blip," more "boots on dirt." Keep per-step pitch/timing randomization so no two are identical. (The Wretch's steps are the wet/quiet/spatial ones above — keep them distinct from the player's.)
- **[NEW] 15–20 ambient sounds (procedural or short synthesized one-shots).** Build a real ambient palette that plays at random intervals, spatialized where it makes sense: wind gust through pines, creaking tree, distant crow/owl call, night-insect chirps, a branch snapping somewhere, leaves rustling, a far-off unexplained knock, water trickle, a lone wolf-ish howl, settling-wood pops, a distant indistinct "call," dripping in caves, a stone tumble, birdsong (day only), a faint wind chime, an owl hoot, frog/cricket at dusk, a twig underfoot behind you (fake-out), low wind moan. Target **15–20 distinct cues.** Some are pure atmosphere; some are **fake-outs** the player can't tell from the Wretch (apophenia, §7.3). Density/selection shifts by time-of-day and biome, and thins out as the entity nears (ordered ducking above).
- **[NEW] Scary music / horror score — "scratchy disc" aesthetic.** Add a music layer with a **degraded-vinyl / scratchy-disc** character: crackle, wow-and-flutter pitch wobble, tape hiss, band-limited lo-fi. Content = sparse, dissonant, dread-building — drones, detuned music-box/piano motifs, low strings-ish swells, sudden stingers on entity events, silence between. It should feel like a **cursed record** playing somewhere in the woods. Layers: (a) a low ambient dread drone bed that rises with `HORROR.menace`; (b) event stingers (sighting, grab, sleep-interrupt, torch-snuff); (c) a rare, unsettling "music-box" motif that surfaces when the Wretch is watching. All procedural via Web Audio (oscillators + noise + convolver) so it stays offline and self-contained — no audio files. Duck the scratchy-disc bed under the ordered-silence rule when it closes in.

### Rendering polish (current approximations are acceptable; upgrade only if desired)
- **[NEW] Photographic NASA moon (with procedural fallback) — the ONLY night ambient light.** Load the 4K LRO CGI Moon Kit texture `https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif`; on TIFF/CORS failure **auto-fall-back to a procedural moon** (crater-noise heightfield shaded by a normal-derived lambert term + low-frequency-noise maria patches). Render it **large and low on the horizon** as a billboarded disc with: emissive core, **additive bloom halo, radial falloff ∝ 1/(1 + k·d²)**, **atmospheric extinction reddening near the horizon**, and a **specular moonglade path on the water**. Design intent: at night the moon is the *sole* ambient source — everything visible in darkness is visible because of it, so tune night exposure/ambient around the moon, not a flat fill. (Today: sky-dome moon disc + halo exist; the photographic texture, procedural fallback, moonglade, and moon-as-only-light are ⬜/approximated.)
- **[NEW] Infinite, opaque backdrop — you must never see the edge of the world.** Right now past the loaded chunks you can see through to the void/horizon seam. Fix so the world reads as **endless and solid**: (1) tune `FogExp2` so terrain fades to the sky colour *before* the last chunk ends (fog fully opaque at ~90% of render distance — no hard chunk boundary visible); (2) add a **distant parallax terrain/forest silhouette ring** on the sky dome (rolling hills + pine treeline + the mountain silhouettes already on the dome) so the horizon always shows *more world*, never a cutoff; (3) ensure the sky dome is fully opaque (BackSide sphere, no gaps at zenith/nadir) so you can never see past it. Net effect: infinite forest in every direction, no visible boundary, no see-through. Pair fog colour with the current sky/time-of-day tint.
- **Caves** (already generated via 3D-noise) + **mountains + icy peaks** (backlog above) complete the "big world" feel alongside the backdrop — keep all three consistent (fog must not clip mountain peaks that rise above the fade distance).
- Adaptive quality (auto FPS step-down) + pause-menu Low/Med/High/Ultra + volume + render-distance controls.
- Title-screen live atmosphere (drifting fog/pines/moon + a distant call).
- Spec "hyperreal" upgrades left as approximations: cascaded shadow maps (CSM) / PCSS soft shadows, SSAO, raymarched volumetric clouds, screen-space god-rays, a photographic NASA moon texture. The current sky/water/shadow/grade stack stands in for these.
- Worker-based chunk generation (currently time-sliced on the main thread; fine, but a Blob-URL worker would remove any remaining hitching).

---

## 6. BUILD ORDER (suggested for a fresh session)
1. Quick fixes: entity 2× size + leg/ground offset (§4, §5-Entity); verify no-death-until-lair.
2. **Water rework** (self-contained): remove white sparkle → plain texture, depth darkening, water physics, water sounds.
3. **Trails / dirt-path network** + **locational awareness** (the trail graph IS the map fed to the brain; drag routes along it).
4. New blocks (bone/skull/blood/altar/snow/ice/path) → then structures: dungeon decoration, cabin+basement, mine+loot, village (all connected by the trails).
5. Animals (6 + corrupted) + spiders → wire `HUNT_PREY`.
6. Held-item viewmodel; floating drops; tree-fall; break progress/particles; doors; fence/trapdoor/sign behavior.
7. Mountains + icy peaks; weather + lightning.
8. AR-15 easter egg.
9. Adaptive quality + pause settings + title ambience + fall/drown damage + durability bars.

---

## 7. ORIGINAL MASTER-PROMPT SPEC (the founding vision — nothing here is forgotten)

The game began as a detailed master prompt ("build a Minecraft-core horror game rendered like a nightmare"). Item **registry + procedural icons + crafting recipes exist for most of the list below**, but many items are craftable-only — their **special behaviors are NOT wired**. Status: ✅ built · 🔶 item/recipe exists but behavior missing · ⬜ not built.

### 7.1 — The 64 new items
**SET A — 32 survival/world items:**
- ✅ pine log, pine planks, pine sapling, stick, torch, lantern, crafting table, chest, bed, coal, iron ore, iron ingot, apple, wild berries, wool
- 🔶 **12 tools** (wood/stone/iron × pickaxe / axe / shovel / **SPEAR**) — **NO SWORDS anywhere; the weapon is the SPEAR** (replace `sword` in items/recipes/icons/registry with `spear`). Craftable with icons today, but **no tool function** yet (no faster mining per tier, no durability, no attack). Wire the full tool-tier system — see §7.8 (tiers, mining speed, damage, durability).
- 🔶 raw meat, cooked meat, mushroom stew, bread, wooden bowl — exist as food; fine.
- 🔶 flint, string, leather, bone — exist as items, **no uses** beyond recipes.
- 🔶 bucket / water bucket — item exists; **does not pick up or place water** (wire it).

**SET B — 32 cottagecore items** *(the SAFETY half of the horror loop — the cozier the homestead, the more violating the Wretch's intrusion; this framing is not yet realized in-game):*
- ✅/block: foxglove, white anemone, bellflower, mossy cobblestone, thatch block, wattle fence, garden trellis, stone path block, picket fence, candle
- 🔶 placeholder blocks (render as simple models; **need real form/behavior**): hanging sign (editable text + wind sway — ⬜), trapdoor (animated open/close — ⬜), oak fence gate (animated — ⬜), fences (connection logic — ⬜)
- 🔶 craftable items **missing placement/behavior**: dried-flower bundle, flower pot (+ potted fern ⬜), teacup, teapot, jam jar, honey jar, picnic basket, woven rug, window shutter, blueberry pie
- ⬜ **not built / missing special behavior**: candelabra, quilt (bed variant), rocking-chair block, birdhouse, **wind chime (must emit soft procedural tones in wind)**, **scarecrow (must be a DECOY the Wretch investigates)**, **straw hat (must be WEARABLE)**
- Every item is meant to have: 16×16 procedural icon (✅ done via `drawIcon`), a recipe (✅ mostly), and a placement/behavior (🔶 the gap).

### 7.2 — The 6 animals + corrupted variants (⬜ NONE BUILT — the `HUNT_PREY` mode has nothing to hunt)
- **deer** — flee in herds
- **rabbit** — skittish, freeze-then-bolt
- **fox** — curious, follows at a distance
- **owl** — perches in pines, head-tracks the player, calls at night
- **sheep** — passive, wool source
- **crow** — flocks that **BURST FROM TREES WHEN THE WRETCH MOVES THROUGH THEM** (free early-warning system)
- All animals are the Wretch's instruments: they **stare at the treeline before a sighting, flee its position, go silent in its radius.**
- **Corrupted variants** (escalation tier ≥4): same blocky animal, wet-black shader, standing unnaturally still, watching.
- Drops feed crafting: meat (food), leather, wool, bone, feather.

### 7.3 — Horror design foundation (principles to honor, from the research)
- **Nonlinear sound induces fear** (Blumstein 2010): entity voice = ring-mod inharmonic sidebands + broadband noise + chaotic pitch. ✅ (in `wretchVoice`).
- **Infrasound / near-infrasound unease** (~17–19 Hz): impractical on consumer speakers → use amplitude-modulated 40–80 Hz rumble instead. ✅ (rumble in `setThreat`).
- **Uncanny valley** (Mori): near-human proportion, wrong articulation. ✅ (human face + wrong-jointed body + snap-hold gait).
- **Terror over horror** (Radcliffe): dread of the unseen beats the reveal → deny observation, retreat when watched; budget ~10 partial sightings + ~30 audio cues per direct encounter. 🔶 (behavior leans this way; sighting/audio budget not formalized).
- **Apophenia/pareidolia**: fog + branch silhouettes should occasionally SUGGEST the entity where there is nothing. ⬜.
- **Two-brain (Alien: Isolation)** — the model hinges on **information asymmetry**: the **Director ALWAYS knows the player's exact position** and uses that omniscience only to *pace tension* (when to send, when to starve the player of contact), while the **Body genuinely does NOT know** — it must actually find the player through raycast LOS + sound stimuli and can lose the trail. Never leak the Director's knowledge into the Body's senses (no homing; the hunt must be earned). ✅ (utility controller Body + Opus Director; **verify the Body never reads the player's true position except through perception**).
- **Safety-then-violation loop** — teach the player that **beds, torchlight, and daylight are safe**, then **rarely and deliberately violate ONE of those rules once per escalation tier**: e.g. tier 3 → sleep interrupted; a later tier → it lingers at the torch-lit edge / snuffs a light; a later tier → it appears at **dusk instead of full night** (daylight rule bent). Track "violations spent per tier" so it stays rare and deliberate, never spammed. 🔶 (only sleep-interrupt exists; the torchlight + daylight violations and the per-tier budget are unbuilt — ties into §5 Entity learning + tier-gated rule violations).
- **Art direction — DARK COTTAGECORE** (stated aesthetic, honor throughout): a cozy, buildable homestead world — pine forest, wildflowers, thatch/wattle cottages, warm lantern light, teacups and quilts — rendered under a *desaturated, overcast, film-graded* pall. The comfort is the trap: the prettier and homier the world reads, the more the Wretch's wet-black wrongness violates it. Palette leans muted greens/browns/greys with warm interior pools of light; never bright/saturated/cheerful. Keep this in mind for every new block, structure, and lighting choice.

### 7.4 — "God-mode" rendering/sim math (spec targets; current = honest approximations)
Spec asked for: cascaded shadow maps + PCSS, SSAO, raymarched volumetric clouds (Beer + Henyey-Greenstein), Gerstner + Fresnel-Schlick + Beer-Lambert water, analytic Rayleigh+Mie sky, ACES/AgX tonemap, volumetric god-ray light shafts, FABRIK IK + quaternion surface-alignment + Catmull-Rom stalking splines for the entity, NASA 4K moon (procedural fallback).
- ✅ done/approximated: AgX, FogExp2, single fitted PCFSoft shadow, Gerstner+Fresnel water, Rayleigh/Mie-ish sky, quaternion surface-align, bloom + film-grade.
- ⬜ still approximations: CSM/PCSS, SSAO, true raymarched clouds, god-rays, FABRIK IK (procedural FK instead), Catmull-Rom paths, photographic moon, depth-accurate water absorption.

### 7.5 — Optimization mandate + original acceptance checklist
Perf mandate: chunked 16×16 world ✅, greedy meshing >90% face reduction ✅, **block-face culling ✅**, **frustum culling (🔶 verify — Three culls per-object; confirm chunk meshes aren't forced visible)**, single-atlas material ✅, <300 draw calls (🔶 verify), **target 60 fps @ 14-chunk render distance (🔶 — default `rd` is 9; the stated target is 14; verify it holds on the GPU)**, worker-based chunk gen (⬜ — time-sliced instead), zero per-frame allocations in hot paths (🔶), F3 profiler with per-system budgets (🔶 basic), adaptive quality + Low/Med/High/Ultra (⬜), 60fps mid-hardware (developer-verified only).
Controls/UX mandate: pointer-lock FPS ✅, WASD + sprint + sneak ✅, AABB voxel collision + smooth step-up ✅, **pause menu with volume + render-distance + shadow-quality settings (🔶 — volume/RD exist; explicit shadow-quality tier control ⬜)**, atmospheric title screen (fog/pines/moon/one distant call) 🔶.

**DEVIATIONS FROM THE ORIGINAL SPEC (important for a new terminal):** the master prompt asked for a *single HTML file, Three.js from CDN, save nothing externally*. All three were intentionally changed:
- **Not CDN → vendored.** Three.js r160 lives in `./vendor/` via an HTML import map, so the game runs fully offline. (Original memory note said "CDN"; the shipped build is offline-vendored — this doc is correct.)
- **Not launchable as a bare file → served over http.** ES modules are CORS-blocked on `file://`, so `server.js` (port 8777) + `Hollowcraft.bat`/desktop shortcut serve it. It is therefore *not* a double-clickable single file; that requirement was traded for the vendored-module + module-based architecture. (See §1.)
- **Not "save nothing" → localStorage is used** for the OpenRouter key and the entity's cross-session memory string. Nothing is saved to a remote server; "externally" is honored, but local persistence exists by design (the entity is supposed to remember you across sessions).
These are deliberate and should NOT be "fixed" back — they're why the game boots at all and why the Wretch has memory.
Founding acceptance checklist (✅ done / 🔶 partial / ⬜ todo): verbatim 2×2+3×3 crafting ✅ · animated chests ✅ · beds + sleep-interrupt 🔶 · health & hunger ✅ · 64 items w/ icons & recipes 🔶(behaviors) · fences/trapdoors/hanging-signs ⬜(behavior) · **6 animals + corrupted variants ⬜** · caves with ceiling-crawling entity 🔶 · PCSS+SSAO+god-rays ⬜ · raymarched clouds ⬜ · Fresnel/Gerstner/Beer water 🔶 · NASA moon ⬜ · HRTF audio + reverb + infrasound + nonlinear voice ✅ · Director/Body peek-stalk-crawl loop ✅ · LLM Director loop ✅ · heuristic fallback ✅ · persistent cross-session memory 🔶 · F3 profiler 🔶 · greedy meshing + single atlas ✅ · worker gen ⬜ · zero-alloc/heap discipline 🔶 · adaptive quality tiers ⬜ · 60fps sustained (unverified here).

### 7.6 — THE BODY: the 7 canonical states (spec) + the developer's overrides
Embodied, deterministic, 60 fps. Perceives ONLY via raycast line-of-sight + audibility (player noise events — sprinting, mining, chest slams — emit "sound stimuli" it investigates). Runs the Director's latest directive through a utility-scored state machine and **never blocks on the network**; all reflexes (freeze-when-observed, cover, pathing, IK) are local and instant. Canonical states:
- **DORMANT** — far away; despawned logic, ambience only.
- **SCOUT** — circles the player's region at **60–90 blocks**, cracking-branch audio cues.
- **PEEK** — positions behind a pine trunk, partial silhouette exposed; gaze-checks the player (`dot(v,d) > cos 25°`) — if directly observed **> 0.7 s**, slides behind the trunk and repositions.
- **STALK** — slow, careful tree-to-tree cover approach; freezes when watched; approaches only in the player's visual periphery.
- **TRAVERSE** — crawls on all fours around trunks and **along cave ceilings/walls** (quaternion surface attachment); **ceiling stalking in caves is mandatory**.
- **HUNT** — drops to the ground and **crawls AT the player**, limbs hammering in a fast, arrhythmic gallop. This is the attack.
- **RETREAT** — after a hit or at dawn: withdraws with a nonlinear vocalization sting.

**Developer overrides to the above (these win over the original spec):**
1. **PEEK/observed:** don't *permanently* freeze when looked at — freeze a **few seconds**, then break away into the woods (see §5 Entity).
2. **HUNT is NOT Opus-gated.** The spec said HUNT is authorized only by an Opus directive; instead it triggers **deterministically/locally** on: hungry · random anger · player hurt it · idle-too-long (pacing) · successful stalk (close+unseen+confident). Opus may bias but never gates. (see §5 Entity).
3. **RETREAT destination is a real den — mostly the DUNGEON**, sometimes a cave; not just "away from player" (see §5 Entity).
Current code: the utility controller has **9 modes** (superset of these 7) mapped to movement states via `brainModeToState`; the reactive predator core in `updateWretch` already leans on triggers #1–#3, but verify each against this list.

### 7.7 — Survival mechanics detail (verify against these exact numbers)
- **Mining & placing:** block-break progress overlay + correct per-tool speeds + block drops (see §5 Gameplay — breaking-takes-time + floating drops).
- **Health:** 10 hearts; damage sources = fall, drowning, starvation, entity. (Hearts ✅; fall/drown wired only partially — §5 Gameplay.)
- **Hunger:** 10 drumsticks with **hidden saturation**; **sprinting and jumping drain it**; **regeneration only at ≥ 9 drumsticks**; **starvation damage below 0**. ⚠️ **Deviation:** the developer asked to **slow the whole hunger drain ~10×** vs. vanilla — keep the *mechanics* above but at the slowed rate. (Verify saturation/regen-threshold/sprint-jump-drain are actually implemented, not just a decaying bar.)
- **Cooking analog (⬜ likely MISSING):** spec calls for a **furnace-style cooking analog** (raw meat → cooked meat, ore → ingot). There is **no furnace block** in the registry — cooked_meat/iron_ingot currently come from recipes/drops, not smelting. Either add a furnace (fuel + smelt timer + UI) or document the recipe-based shortcut as an intentional deviation.
- **Chests:** block entity, **cubic-eased lid rotation**, open/close creak, **27-slot** UI. (Lid + creak ✅; confirm 27 slots.)
- **Beds:** craftable/placeable, skip night when slept in — **BUT if entity escalation tier ≥ 3 AND it is within 60 blocks, sleep is INTERRUPTED by a wake-up event** (the safety-then-violation rule). (Partial — formalize the tier≥3 / within-60-blocks condition.)
- **Inventory UI:** dark-parchment, **must look designed not default** ✅; 36 slots + 9 hotbar ✅, drag/drop ✅, shift-click quick-move ✅, right-click stack-split ✅, tooltips ✅, **durability bars ⬜**.
- **New block types:** fences (proper connection logic ⬜), trapdoors (animated open/close ⬜), hanging signs (editable text + gentle wind sway ⬜) — currently static placeholder models (§7.1).

### 7.8 — Combat, tool tiers, mining speed & DAMAGE (almost-verbatim Minecraft, spears not swords)
Goal: an **almost-verbatim functional Minecraft experience** for tooling and combat, with the one deliberate change that **the melee weapon is a SPEAR, never a sword.** All ⬜ today (tools are cosmetic) — this is the spec to build.

- **Tiers:** Wood → Stone → Iron (matches MC's first three; gold/diamond/netherite omitted unless added later). Each tier is faster-mining, more durable, and hits harder than the last.
- **Correct tool for the job (mining speed multiplier):** pickaxe→stone/ore, axe→wood, shovel→dirt/sand/gravel/path, spear = weapon (no mining bonus). Using the right tool mines fast; wrong/none is slow (verbatim MC feel). Hardness × tier drives the break-progress timer (§5 Gameplay).
- **DAMAGE table (half-hearts; 1 heart = 2):**
  - Fist / empty hand: **1** (0.5 heart)
  - Wooden spear: **4** · Stone spear: **5** · Iron spear: **6**  *(MC sword-analog values; the spear is the sword replacement)*
  - Axe (also a weapon): Wood **3** · Stone **4** · Iron **5**
  - Pickaxe: **2–4** by tier · Shovel: **1–3** by tier *(weak as weapons, like MC)*
  - Spear may also allow a **short-range lunge/jab** (its reach is its identity vs. a sword).
- **Attack = left-click with the held item** (§5 Gameplay held-item viewmodel): swing/jab animation, single-target in reach, applies the value above to animals / the Wretch / (and doubles as block-break on blocks). Attack cooldown ~0.6 s (MC-like), no damage mid-cooldown.
- **Durability:** each use decrements durability; Wood ~60, Stone ~130, Iron ~250 uses (MC-ish); breaks with a snap sound when depleted. Durability bar shown on the slot (§7.7 inventory).
- **Entity vs. spear:** hitting the Wretch is one of the deterministic HUNT triggers ("player hurt it", §7.6) and should hurt/stagger it but rarely kill — it's a predator, not a mob to farm. Tune so fighting back buys distance, not victory.
