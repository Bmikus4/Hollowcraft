# RESEARCH_NOTES

All sources fetched **2026-07-28**. Every row records what I took from the source and whether I independently
confirmed it **in this game**, on this machine. Claims I could not confirm are marked UNVERIFIED and treated as
assumptions, not facts. Negative results are kept.

---

## 0. The measurement that reframed the reading list

The prompt's ranked technique list (portal visibility first, then batching, then greedy meshing, then baked
lighting) is the right ranking for a corridor game whose bottleneck is unknown. This one's is known, so the
research was aimed at the measured bottleneck rather than at the general case.

**Bottleneck matrix** (`bench/perf-matrix.mjs`, GPU Gems 2 ch.28 methodology — starve one stage, read the delta).
Median frame time, steady state, one change at a time:

| experiment | overworld | portal | Backrooms | what a flat response would mean |
|---|---|---|---|---|
| baseline | 4.69 ms | 24.61 ms | 20.23 ms | — |
| **fill 1 %** (render 1 % of the pixels) | 4.03 (−14 %) | 25.96 (**+5 %**) | 14.43 (−29 %) | not fragment/fill bound |
| **nullFrag** (one untextured material everywhere) | 3.29 (−30 %) | 23.07 (**−6 %**) | 12.96 (−36 %) | not shader/texture bound |
| **halfObj** (hide every other drawable) | 3.16 (−33 %) | 15.37 (−38 %) | 8.81 (−56 %) | not per-object bound |
| **noShadow** (all shadow-casting lights off) | 4.43 (−5 %) | **8.05 (−67 %)** | **4.73 (−77 %)** | shadow passes are free |

Read literally: **shrinking the framebuffer to 1 % of its pixels makes the portal 5 % *slower*** (i.e. no effect,
inside noise) and the Backrooms only 29 % faster. Replacing every shader with a flat untextured material buys
6 % at the portal. But switching off the shadow-casting lights cuts the frame by **two thirds to three quarters**.

The game is not fill-bound, not shader-bound, and not stall-bound. It is bound by **per-object work multiplied
by the number of render passes**, and the pass multiplier is the dominant factor.

---

## 1. Shortlisted techniques

| # | technique | source(s) | expected win + reasoning | impl cost | risk to C3/C4 | how measured | measured result | keep/revert |
|---|---|---|---|---|---|---|---|---|
| T1 | **Stop rendering point-light cube shadows in the Backrooms** | [three.js forum, point lights and performance](https://discourse.threejs.org/t/talk-to-me-about-point-lights-and-performance/48258); [Mastering Shadows in Three.js](https://dev.to/outriding/mastering-shadows-in-threejs-setup-configuration-and-optimization-39nn) | A point-light shadow is 6 cube-face renders; cost is `objects × 6 × lights`. With 1 213 env meshes and 2 shadowed troffers that is a 13× pass multiplier | trivial (flag) | visual only — loses contact shadows under the troffers | matrix `noShadow`, and `brPointShadows(false)` | **20.23 → 4.73 ms (−77 %)** in BR; **24.61 → 8.05 ms (−67 %)** at the portal | **KEEP** — but it is a visual cut, so it goes to Ben with the number rather than being taken silently (§3) |
| T2 | **Collapse the Backrooms to shared materials + real batching** | [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices); [InstancedMesh vs BatchedMesh](https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221) | 4 770 draws at 3.0 µs each = 14.4 ms. `brBuildEnv` builds `new MeshStandardMaterial` per chunk, so 86 distinct materials exist for a corridor made of ~4 surfaces, and nothing can batch across chunks | medium | none — geometry unchanged | draw count + `draw` scope | not yet run | pending |
| T3 | **Precompile every Backrooms program during the loading screen** | [three.js PR #19752](https://github.com/mrdoob/three.js/pull/19752); [KHR_parallel_shader_compile](https://developer.mozilla.org/en-US/docs/Web/API/KHR_parallel_shader_compile) | Programs grow **59 → 464** during play. Each increment is a compile; isolated 107 ms, 354 ms and (first crossing) **8 414 ms** frames land on one | medium | none | `T.progs` per-frame program count; assert no growth after load | not yet run | pending |
| T4 | **Move the BRX chunk build off the crossing frame** | [Chunk async-meshing acceptance rules](https://github.com/maguirekrist/voxel_enginevk/blob/main/chunk_refactor.md); prompt §5.3 | `brxStream` runs `brxGenerate` + `brBuildEnv` + `brMergeStatic` for up to 3 new 64 m chunks synchronously. Measured 18.5–47.4 ms per crossing, 85–99 ms on teleport | medium–high | must preserve determinism; BRX edge oracle is already order-independent | `brBuild` scope, B2/B3/B4 max frame | not yet run | pending |
| T5 | **Make the portal cost less than a duplicate frame** | [Aliaga & Lastra, portal textures](https://www.cs.purdue.edu/cgvlab/papers/aliaga/vis97.pdf) | `brRenderPortal` is a full second scene render at full drawing-buffer size, every frame within 30 m: measured **+11.48 ms CPU**, draws 4 770 → 7 168 | low–medium | visual: parallax fidelity vs update rate | `brPortal` scope, B6 | not yet run | pending |
| T6 | **Portal/cell visibility (Teller & Séquin)** | [Teller & Séquin, SIGGRAPH 1991](https://people.csail.mit.edu/teller/pubs/siggraph91.pdf) | The classic 3–15× for axis-aligned interiors. In 2D the sightline test reduces to iteratively intersecting angular wedges through the portal sequence, terminating when the wedge empties | high | must not cull anything visible; needs a paranoid-mode assertion | draws + tris vs full set at sample poses | not yet run | **deferred** — see §2 |
| T7 | **Fixed-timestep accumulator + render interpolation** | [Fiedler, Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/) | The loop is variable-timestep today (`dt = min(0.05, clock.getDelta())` straight into every consumer). At 140 Hz this is the difference between smooth and merely fast | medium | changes simulation stepping — real C4 risk | frame-time jitter (sd), visual | not yet run | pending |
| T8 | **Greedy/binary meshing for the voxel layer** | [0fps, Meshing in a Minecraft Game](https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/) | Already implemented (index.html:1162). Overworld runs at 166 draws / 19 k tris / 1.6 ms | — | — | B1o | **already fast** | **negative result — nothing to win here** |

---

## 2. Negative results and things I am deliberately not doing yet

- **Portal/cell visibility (T6) is not the first move on this codebase.** It is the literature's biggest win for
  exactly this kind of geometry, and I expect it to pay here eventually. But visibility culling reduces the
  *object count* term, and right now that term is multiplied by 13 passes and priced at 3.0 µs per draw. Cutting
  the multiplier (T1) and the per-draw price (T2) first changes what T6 is even optimising. Measuring it before
  those two would attribute their win to it. Revisit after T1–T4.
- **Fill-rate, shader cost and texture bandwidth are not worth touching.** The matrix says so directly: 1 % of
  the pixels buys nothing at the portal and 29 % in the Backrooms; a flat untextured material buys 6 % at the
  portal. Anything in the prompt's R6 (precomputing noise into textures, `mediump`, killing dependent texture
  reads, half-res water) would be optimising a term that is not binding. **Negative result — skipped, with data.**
- **Synchronous WebGL stalls are not present.** Audited per prompt §2.7 — no `getError`, no `finish`, no
  per-frame `readPixels`/`toDataURL`, no layout reads in the rAF callback. **Negative result, and a good one:**
  a single stray `getError()` would have been the whole budget, and there isn't one.
- **Greedy meshing (T8) is done and it works.** No win available.
- **`BatchedMesh` is probably not the tool for T2.** The forum guidance is that `BatchedMesh` wins for many
  *distinct* geometries and that its `multiDraw` emulation degrades past ~100 k instances. The Backrooms is the
  opposite shape: a small number of repeated shapes (wall runs, door casings, troffers, table legs) in large
  counts. Plain merged geometry per material, plus `InstancedMesh` for the repeated props, should beat it.
  **UNVERIFIED — assumption. Will be measured both ways before choosing.**

---

## 3. Where the contract and the data disagree

The prompt says: *"If you find that hitting 140 FPS requires cutting a visual feature, do NOT cut it. Present the
trade with numbers and let me decide."*

T1 is exactly that case, and it is the single largest win in the game:

| | median | 1 % low | what is lost |
|---|---|---|---|
| Backrooms, shadows on (shipping) | 20.23 ms (49 fps) | 32 fps | — |
| Backrooms, shadows off | 4.73 ms (211 fps) | 155 fps | the two nearest fluorescent troffers stop casting real contact shadows |

There is a middle option the literature points at and I have not measured yet: keep the *look* by baking the
static shadowing (per-vertex AO computed from the layout, which is already a pure function of position) and
keeping the fluorescents as emissive quads with an analytic falloff — the prompt's own R4. That should recover
most of the visual and nearly all of the performance, at a higher implementation cost. **UNVERIFIED — this is
the proposal, not a measurement.** It goes to Ben as a decision, with these numbers, before any of it is cut.

---

## 4. Verified claims taken from sources

| claim | source | verified here? |
|---|---|---|
| A point-light shadow costs 6 cube-face renders; `draws = objects × 6 × lights` | three.js forum / DEV | **YES** — census reports 12 shadow faces for 2 point lights, and `noShadow` removes 77 % of the frame |
| Precompiling only helps if the render state at compile time matches the render state at draw time; lights, shadow count, env map, fog and clipping are all in the program cache key | three.js PR #19752 (`getProgramInfoLog` 49 ms → <2 ms) | **NOT YET** — but it explains the 59 → 464 program growth, since adding shadowed point lights changes the key |
| Querying `LINK_STATUS` synchronously breaks pipelining; poll `COMPLETION_STATUS_KHR` instead | MDN KHR_parallel_shader_compile | **N/A** — three.js handles this internally; relevant to how T3 is implemented |
| `getError`, `get*Parameter`, `checkFramebufferStatus`, `getBufferSubData`, `readPixels` each cost a flush + round trip, ≥1 ms | MDN WebGL best practices | **YES, by absence** — audited, none in the hot loop, and the measured CPU accounts for 98 % of the frame with no unexplained gap |
| Batch uploads *before* draws; uploading between draws causes an internal program switch and two pipeline flushes | MDN WebGL best practices | **NOT YET** — matters for T4's upload budget |
| Prefer `texStorage2D` + `texSubImage2D` over `texImage2D` so the driver does not defer allocation to first draw | MDN WebGL best practices | **NOT YET** |
| In 2D, the Teller/Séquin sightline test through a portal sequence reduces to iteratively intersecting angular wedges, terminating when the wedge empties | Teller & Séquin, SIGGRAPH 1991 | **NOT YET** — T6 is deferred |
| `InstancedMesh` wins for one geometry × many instances; `BatchedMesh` for many distinct geometries, degrading past ~100 k instances | three.js discourse | **UNVERIFIED — assumption** |

Sources:
- [MDN — WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- [MDN — KHR_parallel_shader_compile](https://developer.mozilla.org/en-US/docs/Web/API/KHR_parallel_shader_compile)
- [three.js PR #19752 — compileAsync](https://github.com/mrdoob/three.js/pull/19752)
- [three.js discourse — InstancedMesh vs BatchedMesh](https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221)
- [three.js discourse — point lights and performance](https://discourse.threejs.org/t/talk-to-me-about-point-lights-and-performance/48258)
- [DEV — Mastering Shadows in Three.js](https://dev.to/outriding/mastering-shadows-in-threejs-setup-configuration-and-optimization-39nn)
- [Teller & Séquin — Visibility Preprocessing for Interactive Walkthroughs, SIGGRAPH 1991](https://people.csail.mit.edu/teller/pubs/siggraph91.pdf)
- [Aliaga & Lastra — Architectural Walkthroughs Using Portal Textures](https://www.cs.purdue.edu/cgvlab/papers/aliaga/vis97.pdf)
- [Fiedler — Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/)
- [0fps — Meshing in a Minecraft Game](https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/)
