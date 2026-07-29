# PERF_PLAN — ranked change list

Ranked by measured win per unit of risk on **this** codebase, not by the general literature. The ordering was
approved by Ben on 2026-07-28 after the Phase 2 report.

Rules I am holding to:
- One change per measurement. If a change does not beat the run-to-run spread of the scene it is measured in
  (§4.9: ~2 % for the tight scenes, ~12 % for B5/B4), it is reverted and recorded as a negative result.
- Every change sits behind a `PERF.*` flag whose **baseline value restores the old behaviour exactly**.
- No feature is cut without Ben's explicit sign-off, with numbers.

Targets, from PERF_MATH: **median ≤ 7.143 ms, p99 ≤ 9.5 ms, no frame > 12 ms, zero frames > 16.6 ms, ≤ 664
draw calls.**

| # | change | flag | attacks | expected | measured | status |
|---|---|---|---|---|---|---|
| **P1** | Stop the two Backrooms troffers casting cube shadows | `PERF.brShadowLights` (baseline 2 → 0) | the 13× pass multiplier: `draws = objects × 6 × lights` | 20.23 → 4.73 ms in the halls, 24.61 → 8.05 at the portal (matrix) | *running* | **approved by Ben 07-28**, implemented |
| **P2** | Share materials across chunks and batch the environment | `PERF.brSharedMaterials` | 4 770 draws @ 3.01 µs. `brBuildEnv` builds `new MeshStandardMaterial` per chunk → 86 materials for ~4 surfaces, so nothing merges across chunks | draws → low hundreds; `draw` 14.37 → ~2 ms | — | next |
| **P3** | Compile every Backrooms program during the loading screen | `PERF.brPrecompile` | programs 59 → 464 during play; each increment is a compile. Isolated 107 ms, 354 ms, and an **8 414 ms** first-crossing frame | zero program growth after load; kills the worst single frame in the game | — | queued |
| **P4** | Slice the BRX chunk build across frames | `PERF.brBuildSliceMs` | `brxStream` builds up to 3 chunks synchronously: 18–47 ms per crossing, 85–99 ms on teleport | ≥ 60 slices at 0.8 ms; the budget allows 209 frames per chunk and currently uses 1 | — | queued |
| **P5** | Make the portal cost less than a duplicate frame | `PERF.portalMode` | `brRenderPortal` is a full second scene render every frame within 30 m: **+11.48 ms CPU**, draws 4 770 → 7 168 | B6 median 23.99 → target ≤ 7.14 | — | queued |
| **P6** | Fix the overworld streaming slice granularity | `PERF.streamSliceUnits` | `streamChunks` declares a 1.5–3.5 ms slice and overruns to 16.7–22.4 ms because one unit of work is bigger than the slice | B2o/B3o max 24.88 → ≤ 12 ms | — | queued |
| **P7** | Bound the `BR.gen` cache | `PERF.brGenCacheMax` | heap 76 → 272 MB across the suite; resident chunk data is only ~5 MB, the rest is an unbounded data cache | flat heap over the V7 soak | — | queued |
| **P8** | Entity-tick spikes | — | recurring 8.3–18.2 ms frames from `updateBrain` / `updateWretch` / `updateAnimals` in the overworld | overworld max 10.37 → ≤ 12 ms sustained | — | queued, needs its own profiling |
| **P9** | Preload gate | — | 6.9 s of the 8.4 s cold load is icon baking through synchronous GPU readback | B7 first-interactive 8.4 s → ≤ 4 s | — | queued |
| **D1** | Teller–Séquin portal/cell visibility | `PERF.portalCull` | the object-count term | 3–15× in the literature | — | **deferred** — see RESEARCH_NOTES §2. Re-measure after P1–P4; it is currently optimising a term that P1 and P2 dominate |

## Explicitly not doing (negative results, with the arithmetic in PERF_MATH)

| not doing | why, measured |
|---|---|
| Fill-rate work, shader cost, texture-fetch reduction, half-res water (prompt R6) | rendering 1 % of the pixels makes the portal **5 % slower** and the Backrooms only 29 % faster; a flat untextured material buys 6 % at the portal |
| Greedy / binary meshing rework (R3) | already implemented; overworld is 166 draws / 19 k tris / 1.6 ms. Per-chunk unique geometry is ~5 300 triangles, not the >2× mesher failure the prompt warns about |
| Screen-space-error LOD rings in the overworld (R8) | `d_switch` = 478 m at ε = 1.5 px, against a 96 m render distance |
| Dynamic resolution scaling controller (§4.8) | at its 0.6 floor the Backrooms would still be 16.5 ms, 2.3× over budget, and softer. It is a safety net for a fill-bound game |
| Vertex-format packing / bandwidth reduction (R6) | cannot be binding at 3.01 µs per draw with fill at ≤ 29 % |
| Hunting synchronous WebGL stalls (§2.7) | audited: none in the hot loop. The measured CPU accounts for 98 % of the frame with no unexplained gap |

## Risks I am carrying

- **C3 (no cross-chunk seams).** P2 and P4 both touch how chunk geometry is produced. The BRX edge oracle is
  already order-independent by construction (`brxEdge` normalises the pair and memoises), which is the hard part
  — but the determinism and seam tests (V3/V4) have not been written yet and must land before P4.
- **C4 (no regression).** `brSpawnDoor` seeds from `Math.random()`, so "same seed → same world" was never true
  for the Backrooms. `?brseed=` makes it testable; the shipped randomness is unchanged and intentional.
- **Thermals.** This desktop has a failing cooling fan. B5's ±11.9 % spread is the most likely symptom, and the
  30-minute V7 soak is where it will bite. Every suite records its own reference block.
- **Headless vs windowed.** All numbers are headless with vsync off. A windowed spot-check is required before
  sign-off; CPU-side costs may be slightly optimistic without a compositor presenting.
