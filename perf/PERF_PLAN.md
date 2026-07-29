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
| **P1** | Stop the two Backrooms troffers casting cube shadows | `PERF.brShadowLights` (baseline 2 → 0) | the 13× pass multiplier: `draws = objects × 6 × lights` | 20.23 → 4.73 ms in the halls, 24.61 → 8.05 at the portal (matrix) | **B1 15.04→4.60 · B5 16.03→5.16 · B2 15.94→5.26 · B3 16.49→6.10 · B4 18.53→7.25 · B6 23.99→6.43 ms.** Draws 4 958→674 (B2). See below | **DONE**, approved by Ben 07-28 |
| **P2** | Merge the rigid furniture hanging off each door pivot | `PERF.brMergeRigid` (baseline false → true) | 1 061 of BR.env's 1 214 meshes were protected door-leaf furniture — slab, stiles, rails, lever, rose — that `brMergeStatic` could not touch, against 154 that merged | protected 1 061 → 349; draws → ~350–500 | **paired A/B: −1.03 / −1.48 / −1.61 / −0.94 ms (B1/B3/B4/B6), 15 of 16 pairs faster, draws −25…35 %.** B4 frames >16.6 ms 238→29, heap 316→226 MB | **DONE**, correctness gate `bench/perf-verify-p2.mjs` all pass |
| **P3** | Stop the shader-program count from moving | `PERF.brStableLightCount` (baseline false → true) | three keys the program on the light count; `brxUpdateLights` swung it 0↔16 every time the player moved, so every material recompiled at every count | fewer runtime compiles | **compile events 14 → 4, new programs +150 → +56** (cold-page A/B). Steady state neutral | **DONE** |
| **P3b** | Precompile the Backrooms at load | `PERF.brPrecompile` (ships **off**) | move the compiles to the loading screen | kills the multi-second first-entry frames | **works, but load 9.7 s → 26.9 s.** The 15.8 s is what a 16-point-light shader costs to build through ANGLE. `compileAsync` and per-group slicing both made no difference | **implemented, shipped OFF** — the real lever is a smaller light pool, which is Ben's visual call |
| **P4** | Prefetch the BRX ring ahead so a crossing is a cache hit | `PERF.brPrefetch` (ships **off**) | `brxStream` builds up to 3 chunks synchronously: 18–47 ms per crossing, 85–99 ms on teleport | crossings become re-parents; 209 frames of budget per chunk vs the 1 used | **negative: −0.04/−0.02/+0.09 ms, 5 of 12 pairs, spread ±0.9. Cold run: worst 7 417 → 7 265 ms** | **implemented, shipped OFF** — the 6–7 s compile frames swamp the 18–47 ms it removes. Re-measure after the light-pool decision |
| **P5** | Make the portal cost less than a duplicate frame | `PERF.portalMode` | `brRenderPortal` is a full second scene render every frame within 30 m: **+11.48 ms CPU**, draws 4 770 → 7 168 | B6 median 23.99 → target ≤ 7.14 | — | queued |
| **P6** | Fix the overworld streaming slice granularity | `PERF.streamSliceUnits` | `streamChunks` declares a 1.5–3.5 ms slice and overruns to 16.7–22.4 ms because one unit of work is bigger than the slice | B2o/B3o max 24.88 → ≤ 12 ms | — | queued |
| **P7** | Bound the `BR.gen` cache | `PERF.brGenCacheMax` | heap 76 → 272 MB across the suite; resident chunk data is only ~5 MB, the rest is an unbounded data cache | flat heap over the V7 soak | — | queued |
| **P8** | Entity-tick spikes | — | recurring 8.3–18.2 ms frames from `updateBrain` / `updateWretch` / `updateAnimals` in the overworld | overworld max 10.37 → ≤ 12 ms sustained | — | queued, needs its own profiling |
| **P9** | Preload gate | — | 6.9 s of the 8.4 s cold load is icon baking through synchronous GPU readback | B7 first-interactive 8.4 s → ≤ 4 s | — | queued |
| **D1** | Teller–Séquin portal/cell visibility | `PERF.portalCull` | the object-count term | 3–15× in the literature | — | **deferred** — see RESEARCH_NOTES §2. Re-measure after P1–P4; it is currently optimising a term that P1 and P2 dominate |

## P1 actuals — and what P1 did NOT fix

Source: `bench/results/perf-P1-noshadow-2026-07-29T03-49-38.md`, n = 5, warm-up discarded, same machine and
session settings as the baseline.

| scene | median ms | fps | 1 % low | C1 | C2 |
|---|---|---|---|---|---|
| B1 Backrooms static | 15.04 → **4.60** | 217 | 150 | **PASS** | **PASS** |
| B5 Backrooms spin | 16.03 → **5.16** | 194 | 97 | FAIL (p99 10.33) | FAIL |
| B2 Backrooms sprint | 15.94 → **5.26** | 190 | 68 | FAIL (p99 14.82) | FAIL |
| B3 Backrooms diagonal | 16.49 → **6.10** | 164 | 60 | FAIL (p99 16.74) | FAIL |
| B4 teleport | 18.53 → **7.25** | 138 | 53 | FAIL (p99 18.96) | FAIL |
| B6 portal | 23.99 → **6.43** | 155 | 109 | **PASS** (p99 9.14) | FAIL |

**Every Backrooms median is now at or under the 7.143 ms target.** Only B1 and B6 pass C1 outright, because C1
also requires p99 ≤ 9.5 ms.

**What P1 did not fix — stated plainly, because the medians make it look better than it is:**

- **B4 teleport is still badly broken:** 1 606 frames over 12 ms, **238 over 16.6 ms**, worst frame **87.6 ms**.
- **Every moving scene still fails C2.** B3 has 364 frames over 12 ms and a 42.4 ms worst frame; B2 has 247.
  The hitches were never a shadow problem — they are the synchronous chunk build (P4) and shader compiles (P3).
- **Draw calls are still over the ceiling.** The derived limit is 664 (PERF_MATH §4.4). B1 600 and B6 711 are
  near it, but B3 800, B4 826 and B5 759 are over. Refitting the cost line on the post-P1 data gives
  `t_draw ≈ 1.13 ms + 3.71 µs × N`, so the ceiling for a 2.0 ms submission budget is really **234 draws**.
- **Shader compiles are untouched:** programs still reach 391–431 in the Backrooms, and the overworld spin
  scene still shows isolated **607 ms, 333 ms and 81 ms** frames landing exactly on a program increment.
- **The heap still grows:** 316 MB in B4, worse than the baseline's 272 MB.
- **Overworld streaming is untouched:** B3o still 229 frames over 12 ms, worst 28.5 ms.

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
