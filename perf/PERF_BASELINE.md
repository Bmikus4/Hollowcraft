# PERF_BASELINE — the honest, uncomfortable numbers

Source data: `bench/results/perf-baseline-d2a425f-2026-07-28T22-16-00.json` (+ `.md`), produced by
`node bench/perf-run.mjs --runs 5 --label baseline-d2a425f`, against `index.html` at commit `d2a425f`
(behaviourally identical to `game.baseline.html`; the only delta is the profiler, which is inert without `?perf`).

Reference configuration: see PERF_REPORT.md. Short version — RX 5700 XT, 1920×1080, dpr 1, vsync **off**,
render distance 6, quality High, `?brseed=20260728`.

**Protocol.** n = 5 reported runs per scene, plus one warm-up run that is **discarded** (JIT, shader compile,
texture upload). Fixed timestep of 1/140 s, scripted camera path, no player input. Reported figure is the
median of the per-run medians; `±` is the full inter-run spread (max − min), which is the noise floor a change
has to beat to count as real. "1 % low FPS" is defined as **1000 / p99 frame time** throughout.

Two deliberate deviations from pure baseline behaviour, both measurement-only and both stated because they
change what the numbers mean:
- `brKill` is suppressed while a bench run is active. The Pale's cooldown is `Math.random()*45 s`; without this
  it kills the player mid-suite and every later Backrooms scene silently measures an empty overworld.
- `brxCollide` computes its full resolve but its position write is discarded, so a scripted path is not shoved
  off course. Its cost is still measured (it is 0.06–0.11 ms, i.e. irrelevant either way).

---

## 1. The table

| scene | world | med ms | p99 ms | max ms | >12 ms | >16.6 ms | fps | 1 % low | CPU ms | GPU ms | draws | tris | programs | heap MB | C1 | C2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **B1o** STATIC overworld | over | 1.63 ±0.25 | 3.08 ±0.55 | 10.37 | 0 | 0 | 614 | 325 | 1.51 | 1.17 | 166 | 19 466 | 59 | 78 | PASS | PASS |
| **B5o** SPIN overworld | over | 1.96 ±0.29 | 3.31 ±0.32 | 10.82 | 0 | 0 | 512 | 302 | 1.77 | 1.27 | 171 | 21 714 | 62 | 76 | PASS | PASS |
| **B2o** SPRINT-LINE overworld | over | 2.25 ±0.73 | 14.64 ±0.29 | 19.18 | 183 | 3 | 445 | 68 | 1.98 | 1.31 | 172 | 22 328 | 80 | 102 | FAIL | **FAIL** |
| **B3o** SPRINT-DIAG overworld | over | 2.20 ±0.32 | 17.23 ±0.84 | 24.88 | 225 | 49 | 455 | 58 | 1.94 | 1.44 | 173 | 22 304 | 82 | 156 | FAIL | **FAIL** |
| **B6** STRESS portal | portal | 23.99 ±0.32 | 25.82 ±0.55 | 42.53 | 2830 | 2830 | **42** | 39 | 23.56 | 18.46 | **7 168** | 603 478 | 110 | 100 | **FAIL** | **FAIL** |
| **B1** STATIC Backrooms | br | 15.04 ±0.08 | 16.18 ±2.12 | 22.21 | 2350 | 15 | **67** | 62 | 14.75 | 14.75 | **4 770** | 400 680 | 122 | 88 | **FAIL** | **FAIL** |
| **B5** SPIN Backrooms | br | 16.03 ±1.91 | 17.67 ±2.16 | 25.09 | 2407 | 685 | 62 | 57 | 15.71 | 15.45 | 4 928 | 403 178 | 125 | 74 | **FAIL** | **FAIL** |
| **B2** SPRINT-LINE Backrooms | br | 15.94 ±0.25 | 25.53 ±0.94 | 54.44 | 3604 | 1331 | 63 | 39 | 15.42 | 12.68 | 4 958 | 392 304 | **410** | 151 | **FAIL** | **FAIL** |
| **B3** SPRINT-DIAG Backrooms | br | 16.49 ±0.92 | 27.28 ±1.36 | **66.63** | 4096 | 1891 | 61 | 37 | 15.93 | 12.49 | 5 443 | 518 370 | **454** | 158 | **FAIL** | **FAIL** |
| **B4** TELEPORT Backrooms | br | 18.53 ±1.43 | 30.43 ±3.35 | **111.85** | 3847 | 2805 | 54 | 33 | 16.89 | 15.72 | 5 230 | 567 158 | **464** | **272** | **FAIL** | **FAIL** |

**B7 LOAD** — cold navigation to first interactive frame **8 419 ms**; to steady state (3 consecutive seconds
with no frame over 16.6 ms) **17 498 ms**. `load` event fires at 147 ms and the menu is up at 1 556 ms, so
**6.9 s of the 8.4 s is the preload gate**, which bakes every item icon, meshes the spawn chunk, and pre-warms
the shadows-off shader variants.

> **CORRECTION, 2026-07-29.** I originally wrote that the 6.9 s *was* the icon baking, "through a synchronous
> GPU readback". I had not measured it — I inferred it from a code comment. `__hcPERF.iconCost()` says the whole
> icon bake is **944 ms across 94 items**, of which the synchronous readback is **107 ms (11 %)** and rendering
> is 702 ms (74 %). So the icon bake is about an eighth of the gate, and the part everyone blames is a ninth of
> that. See CHANGELOG P9. What the remaining ~3.5 s of the gate is spent on is still unmeasured.

Gate summary against the contract:

- **C1 (median ≤ 7.143 ms, p99 ≤ 9.5 ms): FAILS in every Backrooms and portal scene.** Passes comfortably in
  the static and spin overworld scenes.
- **C2 (no frame > 12 ms, zero frames > 16.6 ms): FAILS everywhere except B1o/B5o.** Worst single frame in the
  suite is **111.85 ms** (B4), and B3 reaches 66.63 ms during ordinary diagonal walking.

---

## 2. The verdict: is this game CPU-bound, GPU-bound, or stall-bound?

**In the Backrooms and at the portal, it is CPU-bound on draw-call submission. Nothing else is close.**
The overworld is neither — it runs at 1.6 ms and is not the problem Ben is describing.

The evidence, in the order it convinced me:

1. **The CPU total and the frame time are the same number.** B1: frame 15.04 ms, CPU 14.75 ms. B6: frame
   23.99 ms, CPU 23.56 ms. The measured CPU accounts for 98 % of the frame in both. There is no missing time,
   so it is not a hidden stall.

2. **Essentially all of that CPU is inside one scope.** B1's per-system breakdown is `draw` 14.37 ms out of
   14.75 ms. Simulation, collision, culling, streaming, HUD, audio, uniforms and the whole Backrooms tick add
   up to **0.39 ms combined**. B6 is `draw` 11.66 ms + `brPortal` 11.48 ms — the portal's second scene render
   is a near-exact duplicate of the first.

3. **The cost per draw call is flat and it is submission cost.** B1 issues **4 770 draw calls** for 400 680
   triangles: 14.37 ms / 4 770 = **3.01 µs per draw call**, squarely inside the 5–50 µs band the prompt's §4.4
   predicts for WebGL, and 84 triangles per call — far too few for the GPU to be the constraint.

4. **The GPU is starved, not saturated.** `EXT_disjoint_timer_query_webgl2` reports 14.4 ms for the scene
   segment in B1. A 5700 XT does not take 14 ms to draw 400 k triangles at 1080p — the overworld draws 19 k
   triangles in 0.77 ms, and scaling that is ~2 ms. The GPU timer is measuring the *submission window*, during
   which the GPU idles waiting for commands. That is the textbook signature of a submission bottleneck.

5. **Removing the cause removes the cost, measured.** `bench/perf-drawprobe.mjs`, parked in the entry junction:

   | | median | p99 |
   |---|---|---|
   | Backrooms point-light shadows **on** (shipping) | **22.84 ms** | 24.83 ms |
   | Backrooms point-light shadows **off** | **4.26 ms** | 12.45 ms |

   **5.4× on one line**, with no other change. This is a diagnostic, not a proposed fix — see §4.

### Why there are 4 770 draw calls

The scene census (`window.__hcPERF.census()`), standing in the Backrooms:

| | value |
|---|---|
| visible drawables in the scene | **1 401** |
| of which under `BR.env` | **1 213** |
| with `frustumCulled = false` | 302 |
| with `castShadow = true` | **1 347** |
| distinct materials | 86 |
| shadow-casting lights | 1 × `PointLight`, 512² map, **6 cube faces** |
| triangles | 48 002 (scene graph) |

`brEnsureLightPool` gives the two nearest troffers `castShadow = true`. **A point-light shadow is six full
scene renders**, one per cube face. 1 213 environment meshes are marked as casters, and `brMergeStatic` sets
`frustumCulled = false` on everything it merges, so per-object culling cannot thin the caster list either. The
main pass plus six shadow faces over ~1 400 drawables predicts ~9 800 submissions; three.js's per-face light
frustum culling brings the measured figure to 4 770. Right mechanism, right order of magnitude.

The second contributor is that `brMergeStatic` is not merging nearly as hard as its comment claims: 1 213
meshes across 9 chunks is **135 meshes per chunk**, not the handful that "one mesh per material" implies. 86
distinct materials for a corridor made of four surfaces is the tell — `brBuildEnv` constructs
`new THREE.MeshStandardMaterial(...)` inside the builder, so **every chunk gets its own copy of every
material** and nothing can be batched across chunks.

### The portal

`brRenderPortal` renders the entire scene a second time, at full drawing-buffer resolution, every frame the
player is within 30 m of the void door. Measured: **+11.48 ms of CPU per frame**, draws 4 770 → **7 168**,
triangles 400 k → 603 k, and B6's median lands at 23.99 ms (42 fps) with **2 830 of 2 830 frames over 16.6 ms**.
This is Ben's "massive lag when spawning the portal", and the existing 30 m distance gate reduces how often it
is paid without reducing what it costs when it is.

---

## 3. The hitches (C2), by measured severity

`draw`, `brStream`/`brBuild` and `stream` are the only scopes that ever spike.

| # | hitch | where it shows | measured | class |
|---|---|---|---|---|
| 1 | **First crossing after entering the Backrooms** compiles a wall of shaders | B2/B3 warm-up runs | **7 055 ms and 8 414 ms single frames**, program count 105 → 225 in one frame | H4 + H11 |
| 2 | **BRX chunk crossing**: `brxGenerate` + `brBuildEnv` + `brMergeStatic` for up to 3 new 64 m chunks, synchronously | B2 / B3 / B4 `brBuild` | 18.5–47.4 ms per crossing; B4 teleport **85–99 ms** | H1/H2/H7 |
| 3 | **Runtime shader compiles** never stop | all BR scenes | programs grow **59 → 464** across the suite; isolated **354 ms** and **107 ms** frames land exactly on a program increment | H4 |
| 4 | **Overworld chunk streaming** | B2o / B3o `stream` | 16.7–22.4 ms spikes, **225 frames > 12 ms** in B3o | H1/H2 |
| 5 | **Entity tick** spikes | B1o / B5o / B6 `entities` | recurring **8.3–18.2 ms** frames from `updateBrain` / `updateWretch` / `updateAnimals` | H6/H11 |
| 6 | HUD spikes | B2 / B4 `hud` | 5.4–6.0 ms, minimap canvas redraw | H9 |

Note on #1: the 7–8 second frames are real and a player hits them on their first walk through the halls, but
the n = 5 protocol discards the warm-up run that contains them. They are recorded here as a **cold-path**
measurement so they are not quietly optimised out of the report.

---

## 4. Top 10 costs, ranked

| # | cost | measured | where |
|---|---|---|---|
| 1 | Point-light cube shadows in the Backrooms | 22.84 → 4.26 ms with them off (5.4×) | `brEnsureLightPool` 11965 |
| 2 | Draw-call submission, 4 770 calls @ 3.0 µs | 14.37 ms/frame | `brMergeStatic` / `brBuildEnv` |
| 3 | Portal second scene render | +11.48 ms/frame, +2 400 draws | `brRenderPortal` 12167 |
| 4 | Per-chunk material duplication defeating batching | 86 materials, 135 meshes/chunk | `brBuildEnv` 11745 |
| 5 | Synchronous BRX chunk build on crossing | 18–99 ms spikes | `brxStream` → `brBuildEnvAll` |
| 6 | Runtime shader compilation | 59 → 464 programs; 107–8 414 ms frames | no `compileAsync` warm-up for BR |
| 7 | Overworld stream slice overrun | 16–22 ms spikes vs a 3.5 ms budget | `streamChunks` 3046 |
| 8 | Entity tick spikes | 8–18 ms | `updateBrain` / `updateWretch` |
| 9 | Heap growth across the suite | 76 → 272 MB | BR env rebuild churn |
| 10 | Preload gate | 6.9 s of the 8.4 s cold load | icon readback loop 5412 |

Everything else measured **below 0.2 ms** and is not worth touching: sim 0.01, collision 0.11, culling 0.09,
uniforms 0.02, audio 0.00, sky 0.02, input 0.005.

---

## 5. Synchronous-stall audit (prompt §2.7)

Clean. No `gl.getError()`, no `gl.finish()`, no per-frame `readPixels` or `toDataURL`, no layout reads
(`offsetWidth` / `getBoundingClientRect` / `getComputedStyle`) inside the rAF callback. `checkFramebufferStatus`
appears twice, both in composer setup. `readRenderTargetPixels` appears twice: the manual screenshot helper and
`icon3DURL`, and the preload gate already forces the latter to load time. **This game is not stall-bound.**

`long-animation-frame` and `longtask` observers are wired and reporting; no LoAF entry attributed a hitch to
style or layout in any scene.

---

## 6. What this means for the plan

The prompt's ranked list (R1 portal/cell visibility, R2 merge draw calls, R3 greedy meshing, R4 bake lighting)
was written for a game whose bottleneck is unknown. This one's is now known, and the ranking for **this**
codebase falls out of the numbers rather than the literature:

1. Kill the cube-shadow multiplier (measured 5.4× and it is one flag).
2. Collapse the Backrooms environment to a handful of shared materials and merged batches (attacks the 4 770
   directly; R2).
3. Make the portal cost something other than a full duplicate frame.
4. Move the BRX chunk build off the frame that crosses the boundary (C2).
5. Compile every Backrooms program during the loading screen (H4).

R1 (Teller/Séquin portal-cell visibility) is the literature's biggest win for a corridor game and it is very
likely worth it here too — but it must be measured **after** 1–4, because with 3 µs draw calls and a 6× shadow
multiplier, a visibility system would currently be optimising the wrong term.

Nothing in §4 has been implemented. The 5.4× figure in §2.5 is a diagnostic toggle in a probe script, not a
change to the game.
