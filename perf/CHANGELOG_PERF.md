# CHANGELOG_PERF

One entry per change: what, why, measured delta, how to revert. Every measurement is n = 5 with the warm-up run
discarded, against `bench/results/perf-baseline-d2a425f-2026-07-28T22-16-00.json`.

A change counts only if it beats the run-to-run spread of the scene it is measured in (PERF_MATH §4.9).

---

## Phase 0 — instrumentation (no game logic changed)

**What.** `PERF` flag object, zero-alloc scoped CPU timers `T` over an integer enum, GPU timing via
`EXT_disjoint_timer_query_webgl2` in four sequential segments, LoAF + longtask observers, per-frame program
counting, `renderer.info` accumulated across all passes, scripted benchmark scenes B1–B6 on a fixed timestep,
`bench/perf-run.mjs` (suite), `bench/perf-matrix.mjs` (bottleneck isolation), `bench/perf-drawprobe.mjs`
(scene census).

**Why.** Optimising before instrumenting is the first forbidden behaviour in the brief.

**Measured delta.** None intended. With `?perf` absent every timer is a single boolean test.

**Revert.** Remove the `PERF` block and the `T.begin/end` call sites; `game.baseline.html` is the A-side.

### Corrections made during Phase 0 (bugs in the harness, not the game)

- `brKill` suppressed during a bench run. The Pale's cooldown is `Math.random()*45 s`; it killed the player
  mid-suite, `brForceLeaveOnDeath` dumped us out of the dimension, and every later Backrooms scene measured an
  empty overworld while reporting Backrooms numbers — **214 draws where the truth is 4 770**. The driver now
  refuses any run whose `brInside` disagrees with the scene.
- B6's orbit radius dipped to 1.0 m, under `brEnter`'s 1.1 m threshold, so the stress scene walked itself
  through the door. Now 2.5–5.5 m.
- `PERF.gpu.acc` held a segment's last sample forever, so once the portal stopped rendering its 77 ms sat in
  every later scene's GPU total. Segments now decay to zero after eight frames without a sample.
- `?brseed=N` added. `brSpawnDoor` seeds from `Math.random()` by design, so no two Backrooms runs ever measured
  the same maze. Shipped behaviour unchanged.

---

## P1 — stop the Backrooms troffers casting cube shadows

**Flag.** `PERF.brShadowLights` — default **0**, baseline **2**. Applied by `brApplyShadowLights()`, which is
called at light-pool creation and is live at runtime (`__hcPERF.shadowLights(n)`).

**What.** `brEnsureLightPool` gave the two nearest troffers `castShadow = true`. A `PointLight` shadow is six
cube-face renders, 1 347 of 1 401 drawables in the halls are marked as casters, and `brMergeStatic` sets
`frustumCulled = false` so per-object culling cannot thin the caster list either. Draw calls therefore scale as
`objects × 6 × lights` — a 13× pass multiplier over the main pass.

**Why this one first.** The bottleneck matrix (`bench/results/perf-matrix-baseline-d2a425f.json`) starved each
pipeline stage in turn. Rendering 1 % of the pixels made the portal **5 % slower** and the Backrooms 29 %
faster; one flat untextured material everywhere bought 6 % at the portal. Switching off the shadow-casting
lights took the Backrooms from 20.23 → 4.73 ms and the portal from 24.61 → 8.05 ms. Nothing else was close.

**This is a visual cut**, so it went to Ben with the numbers rather than being taken silently. Approved
2026-07-28: *"Just cut them, they're not worth 4x."* What is lost: real contact shadows under the two nearest
fluorescents. What is kept: the pooled fluorescent falloff, the dying-tube flicker, and every light's colour
and intensity.

**Measured delta.** `bench/results/perf-P1-noshadow-latest.json`, n = 5, same session, same machine:

| scene | median ms | p99 ms | max ms | draws | C1 | C2 |
|---|---|---|---|---|---|---|
| B1 Backrooms static | 15.04 → **4.60** (3.27×) | 16.18 → 6.66 | 22.21 → **8.05** | 4 770 → **600** | FAIL → **PASS** | FAIL → **PASS** |
| B5 Backrooms spin | 16.03 → **5.16** (3.11×) | 17.67 → 10.33 | 25.09 → 29.20 | 4 928 → 759 | FAIL → FAIL | FAIL |
| B2 Backrooms sprint | 15.94 → **5.26** (3.03×) | 25.53 → 14.82 | 54.44 → 32.77 | 4 958 → 674 | FAIL | FAIL |
| B3 Backrooms diagonal | 16.49 → **6.10** (2.70×) | 27.28 → 16.74 | 66.63 → 42.41 | 5 443 → 800 | FAIL | FAIL |
| B4 teleport | 18.53 → **7.25** (2.56×) | 30.43 → 18.96 | 111.85 → 87.61 | 5 230 → 826 | FAIL | FAIL |
| B6 portal | 23.99 → **6.43** (3.73×) | 25.82 → 9.14 | 42.53 → 25.28 | 7 168 → **711** | FAIL → **PASS** | FAIL |

Every figure beats its scene's spread by a wide margin (§4.9 noise floor is ~2 % for the tight scenes; these
are 60–73 % reductions). **B1 now passes both gates outright** — 4.60 ms median, zero frames over 12 ms.

Draw calls fell 4 958 → 674 in B2, which is a **7.4× reduction** and already close to the derived ceiling of
664 (§4.4). That is a larger share of the total problem than predicted: P2 was budgeted to do most of this work
and now has far less left to win.

**Not attributable to P1:** the overworld scenes moved slightly (B1o 1.63 → 2.27 ms) but their draw counts
differ between runs (166 vs 320), so the two samples are not the same scene — chunk residency differed. The
overworld still passes both gates with zero frames over 12 ms. P1 touches only `BR.lightPool`, which is
invisible and zero-intensity outside the Backrooms, so it cannot affect the overworld. Recorded rather than
claimed either way.

**Revert.** `PERF.brShadowLights = 2`, or call `__hcPERF.shadowLights(2)` at runtime — no reload needed.

**Residual risk.** The troffers still exist as lights; only the shadow map is gone. If a later change makes the
halls read as flat, the fix is baked per-vertex AO (RESEARCH_NOTES §3), not turning these back on.

**What P1 did not fix.** Recorded in PERF_PLAN.md — B4 still has 1 606 frames over 12 ms and an 87.6 ms worst
frame, every moving scene still fails C2, draws are still over the ceiling in B3/B4/B5, programs still reach
431, and the heap still grows to 316 MB. The hitches were never a shadow problem.

---

## P2 — merge the rigid furniture hanging off each door pivot

**Flag.** `PERF.brMergeRigid` — default **true**, baseline **false**.

**What.** `brMergeStatic` protects each door pivot from merging, correctly: it swings. But protecting a subtree
protects everything under it, and a door leaf is eight separate meshes — slab, two stiles, three rails, brass
lever, rose. Measured with `__hcPERF.brEnvBreakdown()`: **1 061 of BR.env's 1 214 meshes were protected door
furniture**, against 154 that actually merged. The merge was working; it just could not reach 87 % of the
geometry.

Everything under a pivot is rigid *relative to that pivot*, so `_brMergeRigid(pivot)` merges it into one mesh
per material **in the pivot's own local frame**. The pivot keeps its transform and goes on swinging; only its
children collapse.

**Why not the material-sharing change I had planned.** The census said 30 of 64 materials were per-chunk, which
looked like the problem. It was not: `brMergeStatic` merges within a chunk group anyway, so cross-chunk material
sharing would not have removed a single draw call on its own. Measuring the breakdown before writing the change
redirected it. Recorded because the original plan entry was wrong.

**Implementation note.** `_brRigidRel` walks the parent chain and composes local matrices rather than using
`matrixWorld`. A chunk group is built off-screen and unparented — its world matrix is not yet meaningful — so
`matrixWorld` would have baked in a stale or identity transform.

**Measured delta.** Geometry: protected meshes **1 055 → 395** (3.0×), BR.env total **1 214 → 503**, triangles
**identical** (39 078 both ways).

Frame time, from `bench/perf-ab.mjs` — a **paired in-session A/B** written for this change because the
cross-session P1→P2 suite comparison put every median inside the run-to-run spread. It alternates flag-off and
flag-on inside one page, so each pair shares a thermal state, heap, shader cache and loaded world, and reports
the median of the per-pair deltas:

| scene | off | on | paired median delta | sign test | draws |
|---|---|---|---|---|---|
| B1 static | 4.68 ms | **3.61** | **−1.03 ms** | 3/4 | 667 → 477 |
| B3 diagonal | 5.73 ms | **4.26** | **−1.48 ms** | 4/4 | 516 → 403 |
| B4 teleport | 5.23 ms | **3.76** | **−1.61 ms** | 4/4 | 698 → 451 |
| B6 portal | 5.08 ms | **4.16** | **−0.94 ms** | 4/4 | 652 → 504 |

15 of 16 pairs faster, −0.9 to −1.6 ms, draws down 25–35 %. That beats the noise floor by a wide margin, which
the cross-session comparison could not establish.

### A bug the paired A/B caught in my own change

The first version copied `frustumCulled = false` from `brMergeStatic` onto the merged leaf. That is right for a
chunk-wide merge, which spans the whole chunk and is nearly always on screen, and wrong for a door leaf, which
is about a metre across and usually behind a wall. **Draw calls went up** — B3 515 → 632 — because eight small
meshes that each got frustum-culled became one that never did. With culling left on, the same scene goes
516 → 403. The measurement is the only reason this was caught; the mesh count fell either way.

### What the tail numbers do and do not show

The A/B harness's p99/max/>12 ms columns are **not usable for a build-time flag**: it calls `rebuildEnv()`
before every run, and tearing down and rebuilding nine chunks ten times over produces 70–120 ms frames on
**both** sides. Those frames have ~4 ms of CPU in the scoped timers, so the time is not in our JS at all.

The realistic single-entry suite says the tail is fine:

| | P1 | P2 |
|---|---|---|
| B1 max / frames > 12 ms | 8.05 ms / 0 | 12.22 ms / 1 |
| B4 frames > 16.6 ms | 238 | **29** |
| B4 heap | 316 MB | **226 MB** |

And LoAF agrees: B1 reports **0 long tasks and 0 blocking** in the suite, while B4's remaining 109.8 ms frames
are attributed to `onAnimationFrame` with 109.5 ms of script and **0 forced style/layout** — that is the
synchronous chunk build, which is P4's job, not this change's.

I initially attributed B1's A/B tail to shader compiles. That was wrong: program growth was 0 on both sides.
The cause is the harness, and the harness now says so in its own output.

**Correctness.** `bench/perf-verify-p2.mjs` builds the same 9 chunks twice in one page, flag off then on, and
compares every one of the 166 door pivots at three swing angles:

| check | result |
|---|---|
| triangle count preserved | 14 984 = 14 984 |
| mesh count fell | 992 → 332 (2.99×) |
| vertex-exact world AABB, closed / half-open / fully open | **delta 0.00000 m** at all three |
| triangle-centroid checksum | agrees to 1e-13 (float noise) |
| doors still swing | 166 of 166 pivots move |

Two earlier versions of this test failed and **both were wrong, not the code**: comparing the AABB-of-per-mesh-
AABBs inflates under rotation by an amount that depends on how geometry is split into meshes, and comparing
vertex-weighted centroids breaks because `_brMergeInto` de-indexes (24-vertex `BoxGeometry` becomes 36). The
surviving test compares vertex-exact bounds and an order- and indexing-independent triangle-centroid checksum.

Also re-ran the pre-existing harnesses: `tmp-br-visible.mjs` (all pass, including its own "no door hinge was
swallowed by the static merge" and "a door actually swings" checks), `tmp-v1-doors.mjs` (0 errors),
`tmp-verify-backrooms.mjs` (no crashes across seeds).

**Revert.** `PERF.brMergeRigid = false`, then rebuild the environment (`__hcPERF.rebuildEnv()`) — it is a
build-time change, so a live flip needs the chunks rebuilt.

---

## P3 — stop the shader-program count from moving

**Flag.** `PERF.brStableLightCount` — default **true**, baseline **false**.

**What.** `brxUpdateLights` sets `L.visible = false` on pool lights it is not using. three.js bakes the **light
count** into every program's cache key, so as the player walked and the number of nearby fluorescents changed,
`numPointLights` swung between 0 and 16 and **every material recompiled at every count it had not seen before**.
That is where 464 programs came from, and the isolated 607 ms / 354 ms / 107 ms frames in the baseline landed
exactly on an increment. Unused lights are now kept **visible at zero intensity** — three still uploads them and
the shader still loops them, they contribute nothing, and the count stops moving. Leaving the dimension parks
the whole pool properly (`brPoolLightsOff`) so the overworld does not carry sixteen dead lights in its shaders.

**Measured delta.** `bench/perf-compile.mjs` — two **cold page loads** with Chrome's program cache disabled,
walking the same path. A paired in-session A/B is the wrong instrument here and said so: it reported **zero
compiles on both sides**, because the warm-up pairs had already paid them.

| | baseline | brStableLightCount |
|---|---|---|
| compile events during play | 14 | **4** |
| new programs during play | +150 | **+56** |
| B2 frames > 33 ms | 7 | **2** |

Steady-state cost of holding 16 lights is neutral: paired A/B gives B1 −0.05 ms (2/4), B3 −0.19 ms (4/4),
B4 +0.20 ms (1/4). Worth it for a 63 % cut in runtime compilation.

**Revert.** `PERF.brStableLightCount = false`.

### P3b — precompiling at load: implemented, measured, and shipped OFF

**Flag.** `PERF.brPrecompile` — default **false**.

`brPrecompileStep()` dresses the scene exactly as the halls are dressed (atmosphere, the full light pool at its
real count, every prewarmed chunk group attached), compiles, draws one pixel into a 1×1 target to force the
driver to finish deferred specialisation, and restores everything. This is the shape the brief and three.js PR
#19752 prescribe, and it does move the compiles to the loading screen.

**It is not worth it, measured:** first-interactive **9.7 s → 26.9 s**. `__hcPERF.precompile()` reports the pass
spending **15 787 ms** — and, revealingly, `slices: 0`: my explicit per-group compile loop never ran, because
merely dressing the scene was enough for the *next ordinary render* to compile every Backrooms material. So that
15.8 s is not my loop being slow; it is what a **sixteen-point-light `MeshStandardMaterial` costs to build
through ANGLE on this GPU**, and it is the same total the player otherwise pays in ~6 s chunks on first entry.

Two things I tried that did not help, recorded so they are not tried again:
- **`compileAsync` instead of `compile`** — no change (28.1 s). three does the GLSL→HLSL translation
  synchronously and parallelises only the link, so the expensive half still blocks.
- **Compiling one chunk group per frame against the real scene's lights** — no change (27.0 s), for the reason
  above: the ordinary render beat the slicer to it.

**The actual lever is the light pool size.** Sixteen simultaneous point lights is what makes the shader enormous:
smaller pool → smaller shader → faster compile *and* cheaper fragment work *and* the count still constant. That
changes how many fluorescents light the halls at once, which is a visual decision, so it goes to Ben rather than
being taken here. The flag stays so the trade can be re-taken in one line once the pool size is settled.

**What P3 did not fix.** The multi-second first-crossing frames are still there — B2 max 7 147 ms with the flag
on versus 6 877 ms off. Fewer compiles, but the ones that remain are the big ones. This is the largest single
defect left in the game.

---

## P4 — prefetch the ring ahead — MEASURED NEGATIVE, ships OFF

**Flag.** `PERF.brPrefetch` — default **false**. `PERF.brPrefetchRing = 1`, `PERF.brPrefetchCooldown = 20`.

**What.** Crossing a BRX boundary built up to three brand-new chunks in the frame you stepped over it —
`brxGenerate` + `brBuildEnv` + `brMergeStatic`, measured at 18–47 ms per chunk and 85–99 ms on a teleport. The
budget was never the constraint: at 10.08 m/s across 64 m chunks there are **209 frames of headroom per chunk**
(PERF_MATH §4.2) and the game used one. And a BRX chunk is a pure function of `(gx, gz, seed)`, so it can be
built at any time in any order. `brxPrefetch()` builds the ring one step beyond the loaded set, one chunk per
frame, only on frames with headroom (`fpsAvg ≥ 90`), nearest-first and biased along the player's velocity
(PERF_MATH §5.3.3). `brBuildEnvAll`'s eviction was widened to match, or it would have disposed each prefetched
group on the very crossing it was built for.

**Measured, and it does not work — on this codebase, today:**

| | B2 | B3 | B4 |
|---|---|---|---|
| paired A/B, median delta | −0.04 ms | −0.02 ms | +0.09 ms |
| sign test | 2/4 | 2/4 | 1/4 |

5 of 12 pairs faster, against a run-to-run spread of about ±0.9 ms. A **cold two-session** run (the paired
harness cannot see this change either — `BR.envCache` persists, so the off side inherits whatever the on side
prefetched) agrees: worst frame **7 417 → 7 265 ms**, medians slightly worse, frames over 12 ms slightly worse.

**Why.** The 18–47 ms chunk build is real, and removing it is worth something — but it is not what these
benchmarks are made of. The **6–7 second shader-compile frames swamp it entirely**, and every metric that
matters is dominated by them. Until the compile problem is gone there is nothing here for prefetch to show.

Kept behind the flag, off, with the code intact: this is the right shape of fix and it should be re-measured
the moment the light-pool decision lands and the compiles stop. Recorded as a negative result rather than
deleted, because "we tried prefetching and it did nothing" is only true *given the compiles*.

---

## P5 — the portal stops re-rendering the world at 250 fps

**Flag.** `PERF.portalHz` — default **120**, baseline **0** (every frame). Plus `portalMoveEps = 0.008` m and
`portalTurnEps = 0.0015`.

**What.** `brRenderPortal` is a second full scene render, every frame the player is within 30 m of the void
door. P1 and P2 had already taken it from **11.48 ms to 2.94 ms of CPU** (and 9.62 → 1.54 ms of GPU), which is
most of the original justification gone — but 2.94 ms is still 41 % of a 7.14 ms budget spent on one prop.
`updateVoid` already throttles its raymarch RT to ~30 Hz for exactly this reason.

The quad samples the RT in **screen space**, so a stale render under a moving camera smears. Hence two triggers,
not one: a cadence, *and* an immediate re-render whenever the camera has actually moved or turned enough for the
staleness to show. Standing still costs the cadence; moving costs what it needs to.

**Measured.** Paired in-session A/B on B6, the right instrument for a steady-state change:

| | off (every frame) | on (120 Hz) |
|---|---|---|
| median | 8.79 ms | **7.40 ms** |
| paired delta | — | **−1.48 ms, 5 of 5 pairs** |
| draws | 755 | **421** |
| frames > 12 ms | — | **−61** |

**And the portal ends up refreshing more often, not less.** Direct cadence probe, standing 3 m from the door:

| | portal refresh | game |
|---|---|---|
| gate off | 43 Hz | 61 fps |
| gate on (120) | **91 Hz** | **197 fps** |
| gate on, camera turning | 38 Hz | 92 fps |

Because the gate makes the whole frame three times cheaper, the portal gets more updates per second than it did
when it was rendering "every frame". The only case that loses refresh rate is a fast camera sweep (43 → 38 Hz)
and it buys 50 % more frame rate there. Note the turn trigger under-fires in the headless probe because
`setInterval` is throttled — with real mouse input it fires far more often, so this is the pessimistic reading.

**Revert.** `PERF.portalHz = 0`.

---

## P7 — bound the chunk data cache, and a hypothesis that turned out to be wrong

**Flag.** `PERF.brGenCacheMax` — default **512**, baseline **0** (unbounded).

**What.** `BR.gen` caches generated chunk records and never evicted anything. It is now an insertion-order LRU:
a cache hit is re-inserted so it moves to the young end, and inserts past the cap drop the oldest. Safe at any
size because a BRX chunk regenerates identically — which V3 now proves rather than assumes.

**The reason I did it was wrong.** PERF_MATH §4.6 attributed B4's 231 MB heap to this cache growing without
limit. Measured: `BR.gen` peaks at **156 entries** across the entire B4 teleport scene — roughly **6 MB**. The
512 cap therefore **never fires** at benchmark scale, and the paired A/B says exactly what it should say for a
change that does nothing: median +0.07 ms, 1 of 4 pairs, heap 141 → 157 MB (noise, and heap is session-
cumulative so an interleaved A/B cannot read it anyway).

I also briefly had a 231 → 165 MB heap reading that looked like a win. It was not: it came from a two-scene
subset run where B4 sits in a different suite position, the same confound already recorded for B6. Same-position
comparison shows nothing.

**Kept anyway, honestly labelled:** the bound is correct, costs nothing, and is real insurance for a long
session that visits far more than 156 chunks. It is **not** the heap fix, and it is not counted as one.
**The actual source of the 165–327 MB heap is unidentified** and wants a heap snapshot, not more arithmetic.

**Revert.** `PERF.brGenCacheMax = 0`.

---

## P6 — one shared streaming budget, and a false win that nearly shipped

**Flag.** `PERF.streamBudgetMs` — default **8**, baseline **0** (the old separate budgets).
`PERF.streamAdmitSafety = 1.0`.

**What the measurement said first.** Rather than guess, `__hcPERF.streamUnits()` was added to count units of
streaming work and their cost. Over B2o/B3o:

| | average | max | declared slice |
|---|---|---|---|
| `generateChunk` | 3.2–4.9 ms | **14–24 ms** | 2.5 ms |
| `buildChunkStaged` | 3.9–4.2 ms | 11–14 ms | 1.5–3.5 ms |

Two distinct faults. A single unit routinely exceeds its **entire** budget, and the budget is only checked
*after* the unit finishes, so nothing can stop it. And generation and meshing had **separate** budgets, so one
frame could overrun both — the worst frames read `gen 18.0 + mesh 6.4`.

**The change.** One deadline for all streaming work in the frame, and a unit is not *started* unless its
expected cost (an EMA per unit kind) still fits. This cannot fix a unit that is inherently bigger than the
budget — only splitting `generateChunk` or moving it off-thread can — but it stops the two halves compounding.

**Measured**, paired A/B, after the fix below:

| | B2o | B3o |
|---|---|---|
| median | +0.06 ms (noise) | +0.02 ms (noise) |
| p99 | −0.71 ms | **−3.61 ms** |
| max | +0.79 ms | **−6.89 ms** |
| frames > 12 ms | **−60.5** | **−114** |

No median change is the correct outcome: the same total work happens, it is just no longer stacked. And the
worst-frame split now reads `gen 16.3 + mesh 0.0` where it used to read `gen 16.7 + mesh 6.3`.

### The false win

The first version had **no guarantee of forward progress**, and its A/B looked spectacular: B2o p99 −12.1 ms,
max −11.2 ms, 185 fewer frames over 12 ms, 4/4 pairs.

It had stopped streaming altogether. A fill check — `chunks` resident and units executed — showed **10 chunks
instead of 241, `gen: 0`, `mesh: 0`**. A few 19 ms chunks dragged the cost estimate above the 8 ms budget; the
gate then refused everything; and because only a unit that actually *runs* can update the estimate, it could
never come back down. A latch. The frame times were beautiful because the game had stopped doing anything.

Fixed by always admitting the **first** unit of a frame: forward progress is guaranteed, the frame is bounded
at one unit's cost, and that was the actual goal. Verified after the fix: **242 chunks resident either way,
1 125 generations and 1 884 meshes either way** — identical throughput, no stacking.

The lesson is in the harness now: a performance number is not a result until you have checked that the work
still happened. Frame time alone cannot tell the difference between "faster" and "stopped".

---

## Critique pass — what re-reading the diff caught

**One real bug, found by measurement, fixed.** `_brMergeRigid` copied `frustumCulled = false` from
`brMergeStatic`. Right for a chunk-wide merge, wrong for a door leaf: eight small meshes that each got culled
became one that never did, and **draw calls went up** (B3 515 → 632). With culling left on it is 516 → 403.
The mesh count fell either way, so only the paired A/B caught it.

**One plausible-looking fix that was wrong, caught by measuring it.** `brRenderPortal` runs in the overworld and
calls `brxUpdateLights`, which since `brStableLightCount` leaves all sixteen pool lights *visible*. Handing every
overworld material a point-light count it never had looks like an obvious regression, so I added
`brPoolLightsOff()` after the portal pass. **B6 went 6.22 → 10.46 ms with 862 frames over 12 ms.** The portal
re-renders every frame you are near the door, so switching the pool off after each pass makes the count
oscillate 0↔N *once per frame* — the exact churn the flag exists to stop. Reverted (8.43 ms on the same
like-for-like short run), and the reason is now a comment at the site so it is not "fixed" again.

**Checked and found sound:** `brPoolLightsOff` is called before its declaration but function declarations hoist;
`_brRigidRel` returns a shared scratch matrix that is consumed before the next call; `_brMergeRigid`'s
early-return leaves originals intact and disposes its clones; the `brxUpdateLights` brace restructure parses and
every door harness passes.

**Known and accepted:** `_brPcRT` (a 1×1 render target) is never disposed — it is only allocated when
`brPrecompile` is on, which is off by default. Left as is.

**Measurement caveat worth stating:** running B6 alone gives a different answer from running it inside the full
suite (8.43 vs 6.22 ms) because chunk residency and the portal's visible geometry differ — 134 385 triangles
versus 86 470. Only compare scenes measured in the same suite position. The before/after table in
PERF_REPORT.md does that; the short critique runs above do not, and are used only for the A-vs-B revert
decision, where both sides share the position.
