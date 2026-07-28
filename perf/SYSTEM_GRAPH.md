# SYSTEM_GRAPH — who calls whom, per frame

Entry point: `renderer.setAnimationLoop(loop)` (index.html:5252). One rAF-driven callback, no fixed-timestep
accumulator — `dt = min(0.05, clock.getDelta())` is fed straight into every consumer (index.html:5140).
That is a **variable-timestep** simulation: see PERF_MATH.md §4.1 / hitch class H12.

Legend: **A** = allocates on the steady-state frame · **D** = touches the DOM · **G** = touches GL ·
**2×** = issues its own `renderer.render()` (a second scene submission).

```
loop()  (5139)
├─ clock.getDelta()                                         
├─ updateSky(dt)                              G     sun/moon dirs, fog colour, globalU writes
├─ updateWeather(dt)                          G
├─ updateSubmerge()                           G
├─ if(playing) physics(dt)                          voxel AABB sweep, getBlock() per step
│              survivalTick / achPoll / updateMining
├─ if(playing && !BR.inside)
│     updateBrain(dt)                         A     Wretch perception + world model
│     updateWretch(dt)                        A
│     updateAnimals(dt) / netAnimalsTick()    A
│     updateHerobrine(dt)
├─ updateGhost(dt) / updateNVG(dt)
├─ applyLook(dt) → updateCamera(dt)
├─ applyWaterFog()                            G
├─ updateDrops / updateSpears / updateStuckSpears / updateParticles /
│  updateShells / updateView / updateWings / updateWatchers / checkNotes /
│  updateSkyBirds / updateLeaves / updateDungeonBugs        A  G   (leaves = 1 InstancedMesh bufferSubData)
├─ netUpdate(dt)                              A     WebSocket send/interp
├─ updateAudio(dt)                            A     panner updates
│  ── t0 ──────────────────────────────── STREAMING SLICE ────────────────
├─ streamChunks(genB=1..2, meshB=1..3)        A G
│    ├─ generateChunk(c)          ≤2.5 ms slice   terrain fBm + caves + ores + trees
│    ├─ buildChunkStaged(c)       ≤1.5..3.5 ms slice, two resumable stages
│    │    ├─ greedy mesher (1162)                 → interleaved Float32Array
│    │    ├─ bakeChunkLight(c)                    → 3D DataTexture              G
│    │    └─ new BufferGeometry + bufferData      G   (fresh allocation per chunk)
│    ├─ relightChunk(c)
│    └─ computeVisGraph(c)  (called from the mesher path)  full 16×128×16 flood fill
├─ _bulkRun(buildCabin)                        A
├─ _bulkRun(_BUILDERS[i++ % 21])               A     one structure builder per frame
├─ assignPointLights() / updateBlockFx / updateCookingFx / updateChimes / assignGlowPool
├─ unloadFar()   1-in-180 frames               A     world.forEach → push keys
├─ drainUnloads()  ≤3 disposals/frame          G
│  ── t1 ──────────────────────────────── RENDER PREP ────────────────────
├─ bakeSky()  ~3×/s                            G 2×
├─ updateHighlight / updateBars / updateMinimap(dt)   A D   canvas redraw every frame
├─ updateBossRegen / updatePeel / updatePortal / updateBossCorpse / updateVoid(dt)  G 2× (30 Hz)
├─ updateBackrooms(dt)   ───────────────────────────────────────────────┐
├─ gradePass / godrayPass / motionPass uniform writes                   │
├─ cullChunks()   1-in-3 frames                A     BFS over ≤(2·RD+1)² chunks + world.forEach
├─ sunLight.shadow.needsUpdate  1-in-SHADOW_EVERY (3..6), suppressed on meshing frames   G 2×
├─ updateScopeRT()                             G 2×  only while ADS
├─ if(_mbMode) renderer.render(scene,camera)→_sceneRT   G 2×
├─ composer.render()                           G     main pass + SSAO + godrays + MB + bloom + grade + output
├─ renderPView(dt)  (inventory open)           G 2×
│  ── t2 ──────────────────────────────────────────────────────────────
├─ preload gate (until initialReady): slotIconURL ≤5 ms/frame  G (sync readPixels)
├─ fpsAvg EMA + _retargetFps(dt)
├─ adaptive quality  1-in-75 frames            G     applyResolution() reallocates composer targets
├─ prof overlay text                           A D   string concat + toFixed EVERY frame when visible
├─ _fpsEl.textContent                          D
└─ updateMindFeed(dt)                          D
```

## `updateBackrooms(dt)` (12232) — the branch Ben feels

```
updateBackrooms(dt)
├─ if(BR.door && !BR.inside)                       ← OVERWORLD, portal placed
│   ├─ dist = hypot(door - player)
│   ├─ if(dist < 30) brRenderPortal()          G 2× ★ FULL SECOND SCENE RENDER at drawing-buffer size
│   │     ├─ if(!BR.rooms.length) brxGenerate() + brBuildEnvAll()   ★ synchronous cold build
│   │     ├─ RT alloc / resize to full res
│   │     ├─ oblique near-plane projection maths
│   │     ├─ brxUpdateLights(entry)
│   │     ├─ swap scene.background/fog/sun/hemi/ambient/chunkRoot.visible/skyDome.visible
│   │     ├─ renderer.render(scene, _brPortalCam)          ← the whole world + the whole BR env
│   │     └─ restore all of the above
│   └─ if(dist < 1.1) brEnter()
├─ if(!BR.inside) return
├─ brSetAtmo(0)                                G
├─ brxCollide(player)                                linear scan over ALL BR.walls (union of 9 chunks)
├─ brxUpdateLights(px,pz)                            linear scan over ALL BR.fixtures + brLitRooms()
├─ brUpdateHum(dt)
├─ brxStream(false)   ★ THE CROSS-CHUNK HITCH
│   ├─ c = brxChunkOf(player)          ← BRX_SPAN = 64 blocks
│   ├─ if unchanged → return false     (the cheap common case)
│   └─ on a crossing:
│       ├─ for 3×3 chunks: brxChunkGen(gx,gz)         ← up to 3 NEW chunks generated synchronously
│       │     └─ brxGenerate(o): full maze — rooms, walls, doors, lintels, pillars,
│       │        fixtures, crawls, tables, frames, windows, solids, props, boxes,
│       │        bulbs, tunnels, stairs  (16 arrays)
│       ├─ brxUnion()                                 ← rebuilds all 16 flat arrays from 9 records,
│       │                                               renumbers room ids, invalidates nav + lit caches
│       └─ brBuildEnvAll()                            ← detach cache, dispose BR.env, new Group,
│             ├─ for each of 9: brxBuildChunkGroup(rec)
│             │     ├─ cache hit  → re-parent (cheap)
│             │     └─ cache MISS → brBuildEnv()  (~190 meshes)  +  brMergeStatic()
│             │                      (clone every geometry, applyMatrix4, concat into 1 mesh/material)
│             ├─ evict + dispose non-live cached chunks
│             └─ brxUpdateLights()
├─ brUpdateDoors(dt) / brUpdateKey / brUpdateExit
└─ brUpdatePale(dt)                                  brNavGraph() rebuild when the room set changed
```

Three synchronous cliffs, all on the main thread, all in one frame:

| Cliff | Trigger | Work |
|---|---|---|
| **P (portal spawn)** | `brSpawnDoor*()` → first `brRenderPortal()` | `brxGenerate()` + `brBuildEnvAll()` for 9 chunks, cold |
| **R (portal resident)** | every frame while `dist < 30` | one extra full-resolution scene render |
| **X (chunk crossing)** | every 64 blocks of travel inside BR | ≤3 × (`brxGenerate` + `brBuildEnv` + `brMergeStatic`), + `brxUnion` over 9 chunks, + full `BR.env` teardown/rebuild |

## Allocation sources on the steady-state frame (H6 candidates)

| Site | What |
|---|---|
| `prof.textContent = '...'` (5248) | ~8 string concats + 5 `toFixed` per frame when the overlay is up |
| `updateMinimap(dt)` (4518) | canvas 2D redraw per frame |
| `unloadFar()` (5169, 1-in-180) | `world.forEach` closure + key pushes |
| `Array.from(remeshSet)` (2875) | new array per streaming frame with pending remeshes |
| `buildChunkStaged` | `new BufferGeometry`, `new Float32Array`, `new DataTexture` per chunk |
| `brxUnion` | 16 fresh arrays + `.push` per element, per crossing |
| `brxBuildChunkGroup` / `brMergeStatic` | `geometry.clone()` per mesh, `new Float32Array` ×3 per material bucket |
| entity ticks (`updateBrain`, `updateWretch`, `updateAnimals`, audio) | object literals in the tick |

## Off-main-thread work today

**None.** There are no Web Workers. All terrain generation, meshing, lighting, BR maze generation and BR geometry
building run on the main thread inside the rAF callback.

## DOM touches per frame

`prof.textContent`, `_fpsEl.textContent`, `updateBars()` (opacity/width writes), `updateMinimap` (canvas 2D),
`updateMindFeed`. No layout reads (`offsetWidth`/`getBoundingClientRect`/`getComputedStyle`) were found in the
loop — the only `getBoundingClientRect`-class calls are in menu/UI handlers. Verified by grep; see PERF_BASELINE.md.

## Synchronous-stall audit (prompt §2.7)

| Call | Sites | In the hot loop? |
|---|---|---|
| `gl.getError()` | none | — |
| `gl.finish()` | none | — |
| `checkFramebufferStatus` | 2107, 2154 | no — composer/target setup only |
| `readRenderTargetPixels` | 2179 (screenshot), 7936 (`icon3DURL`) | no — screenshot is manual; icons are forced to the load gate (5222) |
| `toDataURL` | 2182, 3371, 7941, 15016, 15497 | no — icon/book bakes, cached |
| `getShader/ProgramParameter` | three.js internal | three uses `KHR_parallel_shader_compile` when present |

Clean. The baseline is not stall-bound on any of the classic WebGL round-trips; measurement must prove where it
actually is.
