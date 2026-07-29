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
