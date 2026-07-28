# FILE_MAP — Hollowcraft `index.html`

Baseline: `game.baseline.html` (byte copy of `index.html` @ commit `d2a425f`, 1,737,104 bytes, 15,386 lines).
The game is one HTML file plus a vendored `three.js` (`vendor/three.module.js` + `vendor/jsm/*`) loaded through an
import map, and one ES-module subtree `src/boss/seraphim/`. Assets (`assets/`, `sounds/`) are fetched at runtime.
So "single file" in this project means: **one file of game code**, no build step, no CDN. That is the property to keep.

Line ranges are `start..end` where `end` is the line before the next section starts.

## Top level

| Lines | System | Notes |
|---|---|---|
| 1..144 | HTML head + `<style>` | HUD/menu CSS |
| 145..152 | import map | `three` → `./vendor/three.module.js`, `three/addons/` → `./vendor/jsm/` |
| 153..268 | DOM body | canvas, loading overlay, HUD, menus |
| 269..289 | second `<style>` | |
| 290..15386 | **`<script type="module">`** — the whole game | |

## Inside the module

| Lines | System | Description | Alloc/frame | DOM | GL |
|---|---|---|---|---|---|
| 299..353 | Loading sigil | 2D-canvas summoning circle, own rAF, stopped at `initialReady` | y (load only) | y | n |
| 354..377 | **CONFIG** | `CFG.SEED=1337, CHUNK=16, WORLD_H=128, SEA=40, RENDER_DIST=6, RD_MAX=12, DAY_LEN=840`; `?rd`, `?q`, `?debug` overrides; localStorage restore | n | n | n |
| 378..429 | **Deterministic RNG + noise** | `xhash(x,y,z,s)`, `noise2/3`, `fbm2/3`, `ridged`. Integer hash, position-seeded | n | n | n |
| 430..574 | Texture atlas | 16×16 tiles → one 256×256 canvas, painted once at load | load | y (canvas) | y (1 upload) |
| 575..741 | Block registry | `BID`, `isOpaque`, per-block face/tile tables | n | n | n |
| 742..771 | **World storage** | `world:Map<int,chunk>`, flat `Uint8Array` per chunk, `idx=x+z*16+y*256`; integer chunk key `key(cx,cz)` | n | n | n |
| 772..876 | **Terrain generation** | domain-warped fBm + ridged highlands + rivers + caves; finite island disc; trail network | y (per chunk) | n | n |
| 877..1090 | Pine / decoration | pure `f(wx,wz)` tree oracle, structure pads, ore veins | y (per chunk) | n | n |
| 1091..1161 | **Baked block light** | per-chunk 3D light texture (skylight + block light flood) | y (per chunk) | n | y (tex upload) |
| 1162..1384 | **Greedy mesher** | merges coplanar same-material faces; emits interleaved buffers | y (per chunk) | n | n |
| 1385..1535 | **Renderer / scene / shared uniforms** | `THREE.WebGLRenderer`, `globalU`, `chunkRoot`, `applyResolution()`, `_pixelScale` | n | n | y |
| 1536..1735 | Sky dome | analytic Rayleigh/Mie + raymarched clouds + moon/stars; `USE_SKYCUBE` bake ~3×/s | n | n | y |
| 1736..1869 | Island horizon backdrop | 2-layer world-anchored horizon | n | n | y |
| 1870..1938 | Water | Gerstner displacement, Fresnel-Schlick, Beer depth, moonglade | n | n | y |
| 1939..1994 | Lights + shadows | `sunLight` (cascade-less directional + texel-snapped fit), `hemi`, `ambient`, point-light pool | n | n | y |
| 1995..2185 | **Post stack** | `EffectComposer`: render → SSAO → god rays → motion blur → bloom → grade → output. `_grabRT` + `readRenderTargetPixels` (screenshot only, **not** per-frame) | n | n | y |
| 2186..2252 | Block mutation + remesh scheduling | `remeshSet`, `relightSet`, bulk-edit mode | n | n | n |
| 2253..2771 | **Chunk meshes** | `buildChunkStaged()` (two-stage, resumable), `disposeChunkMeshes()`, instanced flame/model blocks | y (per chunk) | n | y (bufferData) |
| 2772..2848 | **Occlusion culling** | per-chunk flood-fill visibility graph + frustum BFS; throttled to 1-in-3 frames | y (`_cullQ` reused) | n | n |
| 2849..2893 | **Chunk streaming** | `streamChunks(genB, meshB)` — distance-ordered `RING`, time-sliced gen (2.5 ms) + mesh (1.5–3.5 ms); `unloadFar` at RD+2, `drainUnloads` ≤3/frame | y | n | y |
| 2894..3030 | Player + physics | AABB voxel collision; walk 4.6 / sprint 7.2 / sneak 1.9 / fly 18 m/s, stim ×1.4 | n | n | n |
| 3031..3056 | Voxel DDA | block targeting + highlight | n | n | n |
| 3057..3151 | Day/night + key light | sun/moon, texel-snapped shadow fit, `SHADOW_EVERY` cadence | n | n | y |
| 3152..3155 | Controls | pointer lock, key state | n | y | n |
| 3156..3373 | Item registry + icons | `ITEMS`, `slotIconURL`, `icon3DURL` (**synchronous GPU readback**, forced to load time by the preload gate) | load | y | y |
| 3374..3719 | Inventory model, Ghost vehicle, NVG | | n | y | y |
| 3720..3914 | Save/load + achievements | `localStorage` (debounced) | n | y | n |
| 3915..4498 | Menus / settings / bible / church | | n | y | n |
| 4499..4694 | **HUD + minimap** | `updateBars()`, `updateMinimap(dt)` — canvas minimap redrawn per frame | y | y | n |
| 4695..4717 | Main-loop state | `clock`, `fpsAvg`, `_retargetFps`, `SHADOW_EVERY`, `_BUILDERS[21]` | | | |
| 4718..4900 | Intro cinematic | | | | |
| 4901..5138 | Multiplayer relay client | WebSocket, `netUpdate(dt)` | y | n | n |
| **5139..5254** | **MAIN LOOP** (`function loop()`, `renderer.setAnimationLoop`) | see SYSTEM_GRAPH.md | y | y | y |
| 5258..5267 | Horror shared state | | | | |
| 5268..5653 | The Wretch — visuals + flesh shader | | | | |
| 5654..6825 | Brain v2 — perception + world model | | y | n | n |
| 6826..7118 | The Labyrinth (dungeon tunnels) | | | | |
| 7119..7446 | Wretch v3 animation (spring rig) | | y | n | n |
| 7447..7533 | The Director | heuristic pacer + optional Opus mind | | | |
| 7534..7738 | Inventory / crafting / chest UI | | y | y | y (`renderPView`) |
| 7739..10192 | **World entities** | drops, particles, spears, shells, timed mining, viewmodel, guns, combat, boss/seraphim, void | y | y | y |
| **10193..10489** | **THE BACKROOMS — core** | `BR` state, `BR_X0=100000`, `BR_FLOOR=40`, `BR_CELL=9`, `BR_CH=9`; zones, voxel column oracle, atmosphere, void door, enter/exit, audio/hum, materials | | | |
| **10490..10963** | **BRX chunk substrate** | `BR_CS=8`, `BRX_CELLS=8`, **`BRX_SPAN=64` blocks/chunk**; `brxHash`, `brxChunkOf/Origin/Seed`, `brxChunkLevel` (2 storeys, districts of 2), memoised shared-edge oracle `brxEdge*`, and `brxGenerate(o)` — the maze generator (10594..10961) | y (per chunk) | n | n |
| **10964..11011** | **Infinite halls: cache, union, streaming** | `BRX_KEEP=1` (3×3), `brxChunkGen` (data cache), `brxUnion` (rebuilds 16 flat arrays), **`brxStream(force)` — the cross-chunk entry point** | y (large) | n | n |
| 11012..11203 | BR content builders | doors, tables, furniture/junk, gore decals, bulbs | y | n | y |
| 11204..11267 | Stairwell flights + ramps | `brxRampAt` linear scan | n | n | y |
| 11268..11356 | Doors, casings, frames, eat/toggle | `brUpdateDoors(dt)` per frame | n | n | n |
| 11357..11576 | **`brBuildEnv()`** | the per-chunk geometry builder (~190 meshes before merge) | y (large) | n | y |
| 11577..11587 | Light pool | `BR_SHADOW_LIGHTS=2`, `brEnsureLightPool` | | | y |
| **11588..11737** | **The installer** | `brMergeStatic` (merge to 1 mesh/material), `brxBuildChunkGroup` (per-chunk geometry cache), `brPrewarmEntry` (setTimeout drip), **`brBuildEnvAll()`** | y (large) | n | y |
| 11738..11773 | Flicker + light assignment | `brFlick`, `brLitRooms`, `brxUpdateLights` (linear over all fixtures) | n | n | n |
| 11774..11828 | **`brxCollide(p)`** | linear scan over **all** `BR.walls` every frame | n | n | n |
| **11829..11864** | **See-through portal** | `brRenderPortal()` — **a full second scene render at full drawing-buffer resolution**, every frame within 30 m of the door | n | n | y (heavy) |
| 11865..11922 | Smiler, key, exit | | | | |
| 11923..11959 | Stage-II skybox | | | | |
| 11960..12101 | The Pale — face materials, mesh, 12 animations | GIF texture `needsUpdate` per frame | n | y (img) | y |
| 12102..12230 | Pale navigation | room-adjacency BFS, `brNavGraph` (rebuilt when room set changes) | y | n | n |
| **12231..12256** | **`updateBackrooms(dt)`** — the BR tick | | | | |
| 12257..12809 | **QA hooks** | `window.__hcBR`, `window.__hcBRX` (`edge`, `chunkOf`, `walkTo`, `envStats`, `crossSplit`, `prewarm`, `drawProbe`) | | | |
| 12810..12814 | Animals + sky birds | | | | |
| 12815..13574 | Falling leaves | one InstancedMesh, SoA state | n | n | y |
| 13575..14032 | Backlog structures | 21 deterministic builders, polled 1/frame round-robin | y (bulk) | n | n |
| 14033..14426 | Audio | HRTF panners, IR reverb, procedural horror | y | n | n |
| 14427..14634 | Wretch brain (9-mode utility) | | | | |
| 14635..14871 | Cognition V3 — three clocks | | | | |
| 14872..15386 | WILL container + context registry + remaining QA hooks (`window.__hc`) | | | | |

## Shader programs (each is a separate compile/link, each is a hitch candidate)

| Program | Where | Notes |
|---|---|---|
| chunk opaque | 1385..1535 | one shared `ShaderMaterial`, atlas + 3D light texture |
| chunk foliage (alpha-test) | 1385..1535 | separate material, no early-Z |
| chunk water | 1870..1938 | Gerstner + Fresnel |
| sky dome | 1536..1735 | raymarched clouds; baked to a cube ~3×/s when `USE_SKYCUBE` |
| horizon backdrop | 1736..1869 | 2 layers |
| leaves (instanced) | 12815.. | |
| Wretch flesh | 5272.. | procedural, expensive |
| Seraphim body/eye/cornea | `src/boss/seraphim/materials/` | 4 programs |
| post: SSAO, god rays, motion blur, bloom (×5 mips), grade, output, copy | 1995..2185 | |
| BR portal blit | 11859 | trivial |
| BR environment (MeshStandard-ish per zone) | 10463.. | 5 zone material sets |
| item icon bake | 7936 | load-time only |
| scope PiP | 5093.. | second scene render when ADS |

## Known second/third scene renders per frame (each is a full submission pass)

1. `updateScopeRT()` — only while ADS with a scoped gun (5093..).
2. `brRenderPortal()` — **whenever the void door is within 30 m and BR is not entered** (11829..).
3. `VOID.rt` raymarch — throttled to ~30 Hz (10065).
4. `_mbMode` scene→`_sceneRT` prepass for motion blur (5208), then `composer.render()`.
5. `sunLight.shadow` map — 1-in-`SHADOW_EVERY` frames (3..6).
6. `bakeSky()` — ~3×/s cube bake.
7. `renderPView(dt)` — while the inventory is open.

## Existing (pre-pass) instrumentation

- `prof` overlay (5248): FPS, chunk count, `renderer.info.render.calls/triangles`, stream ms, render ms, XYZ. String-concatenated **every frame** when visible.
- `window.__benchInfo` / `__benchInfoSnap` (5211): accumulates `renderer.info` across all passes.
- `__hc.st()`, `__hc.probe()`, `__hcBRX.envStats()`, `__hcBRX.crossSplit()`, `__hcBRX.drawProbe()`.
- `bench/*.mjs` — ~140 Playwright harnesses; `bench/results/` is gitignored.
- Adaptive quality (5231..5247): sheds internal resolution → shadow cadence → god rays → bloom, on a 1.2 s tick.
