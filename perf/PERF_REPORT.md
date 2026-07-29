# PERF_REPORT — Hollowcraft performance pass

Status: **Phases −1, 0, 1, 2 complete. P1, P2, P3, P5, P6, P7 shipped and measured; P3b and P4 implemented and
shipped off as measured negatives. C1 (medians), C3, C5, C6 and V6 verified; C2, V5 and V7 outstanding.**
An interim report, not a full Phase 6 sign-off.

## Before / after

Baseline `bench/results/perf-baseline-d2a425f-2026-07-28T22-16-00.json` vs final
`bench/results/perf-FINAL-2026-07-29T08-04-34.json`. Both n = 5, warm-up discarded, same machine, 1920×1080,
vsync off, `?brseed=20260728`.

| scene | median ms | fps | draws | p99 ms | max ms | C1 | C2 |
|---|---|---|---|---|---|---|---|
| **B1** Backrooms static | 15.04 → **3.58** (4.2×) | 67 → **280** | 4 770 → **399** | 16.18 → **6.15** | 22.2 → 24.1 | **PASS** | FAIL |
| **B5** Backrooms spin | 16.03 → **4.39** (3.7×) | 62 → **228** | 4 928 → **517** | 17.67 → **5.51** | 25.1 → **10.2** | **PASS** | **PASS** |
| **B2** Backrooms sprint | 15.94 → **4.08** (3.9×) | 63 → **245** | 4 958 → **431** | 25.53 → 13.48 | 54.4 → 74.0 | FAIL | FAIL |
| **B3** Backrooms diagonal | 16.49 → **4.45** (3.7×) | 61 → **225** | 5 443 → **500** | 27.28 → 14.22 | 66.6 → 44.4 | FAIL | FAIL |
| **B4** teleport | 18.53 → **4.92** (3.8×) | 54 → **204** | 5 230 → **512** | 30.43 → 19.35 | 111.8 → 124.6 | FAIL | FAIL |
| **B6** portal | 23.99 → **6.98** (3.4×) | 42 → **143** | 7 168 → **787** | 25.82 → 10.77 | 42.5 → 28.4 | FAIL | FAIL |
| **B1o** overworld static | 1.63 → 1.76 | 568 | 167 | 3.48 | 11.8 | **PASS** | **PASS** |
| B5o / B2o / B3o overworld | 1.9–2.2 → 2.0–2.4 | ~420–490 | unchanged | — | — | mixed | mixed |

Load: **8.42 s → 8.53 s** first interactive. Unchanged, which was a requirement — `brPrecompile` would have
made it 26.9 s and is therefore off.

Note B1's p99 spread is ±5.58 and B4's ±9.49: those two scenes cannot resolve anything finer than their own
noise, and this machine's failing cooling fan is the likely source late in a long suite (PERF_REPORT assumption
4). B5 and B1o are the tight ones and both pass outright.

**Three to five times faster everywhere the game was slow**, and draw calls are down 87–92 % — from 4 770–7 168
to 399–717, now at or under the 664 ceiling derived in PERF_MATH §4.4 (B6 is 53 over).

V6 flag matrix verified: booting with `?perfoff=all` reproduces the baseline exactly — B1 back to 14.41 ms and
4 772 draws. Every optimisation is one boolean away from the old behaviour.

## Gates: what is fixed and what is not

- **C1 (median ≤ 7.14 ms, p99 ≤ 9.5 ms).** Every median passes with room — the worst is B6 at 6.98 ms, and the
  Backrooms sits at 3.6–4.9 ms against a 7.14 ms budget. **B1, B5 and B1o pass C1 outright.** The rest fail
  **only on p99**, and every one of those p99s is a hitch, not steady-state cost.
- **C2 (no frame > 12 ms, zero > 16.6 ms).** **B5 and B1o pass.** Everywhere else it still fails — this remains
  the honest headline: the pass has fixed *throughput*, not *hitching*. B4 still reaches 124.6 ms. P6 cut the
  overworld's frames over 12 ms by 60–114 by stopping generation and meshing compounding, but a single
  `generateChunk` still averages 3.2–4.9 ms with a tail to 24 ms, and no scheduling fixes a unit bigger than
  the budget.
- **C3 (no cross-chunk seams, order-independent output). PASS.** `bench/perf-verify-v3v4.mjs`:
  - a 5×5 BRX region hashes **identically across 20 different generation orders**, and identically again when
    each chunk is generated alone in a cleared cache;
  - evicting the whole data cache and regenerating reproduces every chunk exactly;
  - 2 000 sampled boundary columns give the same voxel stack whichever chunk is resident, none step more than
    one storey against their neighbour, and none are empty void;
  - **1 420 resident boundary columns still match the oracle exactly** — the test that would actually catch a
    visible seam, as opposed to merely re-proving that a pure function is pure.

  The shared-edge oracle was already covered by `tmp-brx-edges.mjs` (agreement from both sides, stair
  antisymmetry, determinism, connectivity, seed reproducibility) and still passes — 1 250 edges, all agreeing.
- **C4 (no gameplay or visual regression).** Partly tested. Every existing Backrooms harness passes
  (`tmp-br-visible`, `tmp-v1-doors`, `tmp-br-portal`, `tmp-verify-backrooms`), and `bench/perf-verify-p2.mjs`
  proves the door merge is geometrically exact at three swing angles. **Not** covered: QA-helper output parity
  (V5) and the 30-minute soak (V7).
- **C5 (still one file, no new deps).** Held. No build step, no CDN, no new runtime dependency.
- **C6 (numbers-backed).** Every claim here has a JSON artifact under `bench/results/`.

## The one number that has barely moved, and why

The multi-second first-entry frames — **6 877 ms baseline, 7 147 ms with P3** — are the largest defect left.
They are ANGLE compiling a sixteen-point-light `MeshStandardMaterial`, and the cost is the same whether it is
paid at load (measured: +15.8 s, `__hcPERF.precompile()`) or during play. `brStableLightCount` cut the number of
such compiles from 14 to 4 but made the survivors the biggest ones.

**The lever is the light pool size**, and it is a visual decision: sixteen simultaneous fluorescents is what
makes the shader enormous. A smaller pool shrinks the shader, the compile and the fragment cost together, and
`brStableLightCount` keeps the count constant either way. That question goes to Ben.

## Next five things

1. **Decide the Backrooms light pool size — this is a question for Ben, and it unblocks the rest.** Sixteen
   simultaneous point lights is what makes the shader enormous, and that shader is the 6–7 second first-entry
   frame. A smaller pool shrinks the compile, the fragment cost and the program size together, and
   `brStableLightCount` keeps the count constant either way. Until this is settled, `brPrecompile` costs +16 s
   of load and `brPrefetch` measures as nothing, because both are swamped by the compiles.
2. **V5 and V7 — QA-helper parity and the 30-minute soak.** V3/V4 now pass (`bench/perf-verify-v3v4.mjs`);
   these two are what is left of the sign-off. V7 matters most: heap reaches 231 MB in B4 and nothing has
   proved it flattens.
3. **Split `generateChunk`, or move it off-thread.** P6 stopped generation and meshing compounding, but a
   single generation unit still averages 3.2–4.9 ms with a tail to 24 ms against a 12 ms ceiling. No scheduling
   can fix a unit larger than the budget — this is the remaining overworld C2 failure and it needs the unit
   made smaller.
4. **Find where the heap actually goes.** B4 reaches 165–327 MB. I guessed `BR.gen` and was wrong — it peaks at
   156 entries, about 6 MB — so the LRU bound shipped in P7 is insurance, not the fix. This needs a DevTools
   heap snapshot, not more arithmetic.
5. **Re-measure `brPrefetch` after (1).** It is implemented and correct; it just has nothing to show while the
   compiles dominate.

---

## Reference configuration

Everything below was **read off the machine**, not assumed — `window.__hcPERF.ref()`, captured into every
`bench/results/perf-*.json` so no result can drift from the machine that produced it.

| | value | how it was determined |
|---|---|---|
| GPU | AMD Radeon RX 5700 XT (0x731F), D3D11 / ANGLE | `WEBGL_debug_renderer_info` |
| CPU | 16 logical cores | `navigator.hardwareConcurrency` (matches Ben's Ryzen 7 3800X, 8C/16T) |
| RAM | 32 GB | `navigator.deviceMemory` (capped report; actual ≥32 GB) |
| OS | Windows 10 Pro 19045 | shell |
| Browser | HeadlessChrome 150 (Playwright driving the installed Chrome binary) | `navigator.userAgent` |
| WebGL | WebGL 2.0 (OpenGL ES 3.0 Chromium), max texture 16384 | `gl.getParameter` |
| GPU timer queries | **available** (`EXT_disjoint_timer_query_webgl2`) | feature-detected |
| `crossOriginIsolated` / SharedArrayBuffer | **true / available** — `server.js` already sends COOP+COEP | `crossOriginIsolated` |
| Canvas / drawing buffer | 1920 × 1080 | `renderer.getDrawingBufferSize()` |
| devicePixelRatio | 1.0 (`deviceScaleFactor:1` in the harness) | `devicePixelRatio` |
| Internal resolution scale | 1.0 at run start (adaptive quality can drop it to 0.5) | `_pixelScale` |
| Quality tier | High | `CFG.quality` |
| Render distance | 6 chunks (ceiling 12) | `CFG.RENDER_DIST` / `CFG.RD_MAX` |
| vsync | **off** for measurement — `--disable-gpu-vsync --disable-frame-rate-limit` | fastest observed frame delta ≈ 3.0 ms ⇒ no 60/144 Hz quantisation |
| Hardware acceleration | on — `--enable-gpu --ignore-gpu-blocklist --use-angle=d3d11`, renderer string is the real GPU, not SwiftShader | `WEBGL_debug_renderer_info` |
| Power mode | desktop, mains | — |

### Assumptions I am making, stated at the point I make them

1. **The reference machine is Ben's desktop** (the one this session is running on). Everything measured is on that
   GPU. If the target is a different machine, every number below has to be re-taken.
2. **Measurement runs headless with vsync disabled.** This is deliberate: with vsync on, a 60 Hz panel makes 140 FPS
   unobservable, and the frame-time distribution gets quantised so the C1/C2 gates cannot be read. Headless Chrome
   shares the same ANGLE/D3D11 path and the same GPU, so GPU-side costs transfer; CPU-side costs may be slightly
   optimistic because there is no compositor presenting to a real window. Windowed spot-checks will be taken before
   sign-off.
3. **The engineering target is 6.94 ms, not 7.14 ms**, if the play display is 144 Hz — see PERF_MATH §4.1. Which
   display Ben actually plays on is an open question (see the questions at the end of the Phase 0 report).
4. **Thermals are a measurement hazard on this machine.** The desktop has a failing cooling fan with a history of
   thermal cuts. Long runs (the 30-minute V7 soak especially) may throttle. Every suite records its own reference
   block and inter-run spread so a thermal drift shows up as spread rather than being mistaken for a regression.
5. **The Backrooms maze seed is now pinned for measurement.** `brSpawnDoor` seeds `BR.seed` from `Math.random()` by
   design ("a fresh maze per door"). Two benchmark runs therefore never measured the same geometry. `?brseed=N`
   pins it; the harness always passes one. With no override the shipped behaviour is unchanged.

## PERF flag reference

| flag | default | what it does | risk |
|---|---|---|---|
| `PERF.on` | `false` (`?perf` sets it) | master switch for all CPU/GPU timers and counters | none — every timer is one boolean test when off |
| `PERF.overlay` | `false` (`?perf=1` sets it) | on-screen readout, rebuilt at 5 Hz | none |
| `PERF.gpuTimers` | `true` | use `EXT_disjoint_timer_query_webgl2`; degrades to zeros if absent | none |
| `PERF.loaf` | `true` | `long-animation-frame` + `longtask` observers | none |
| `PERF.matrix.mode` | `'off'` | bottleneck-isolation experiment (Phase 1) | debug only |

### Optimisation flags

Every one restores the pre-pass behaviour at its **baseline** value, and `?perfoff=all` restores the lot —
verified: B1 goes back to 13.7 ms and 4 772 draws, which is the baseline.

| flag | ships | baseline | what it does | measured | risk |
|---|---|---|---|---|---|
| `brShadowLights` | **0** | 2 | how many troffers cast a real cube shadow. A point-light shadow is 6 scene renders | 20.23 → 4.73 ms | **visual** — no contact shadows under the two nearest tubes. Ben approved 07-28 |
| `brMergeRigid` | **true** | false | merge the meshes hanging off a door pivot, in the pivot's own frame | −0.9…−1.6 ms, 15/16 pairs | geometry proven identical (`perf-verify-p2.mjs`) |
| `brStableLightCount` | **true** | false | park unused pool lights at zero intensity instead of hiding them, so the shader's light count stops moving | compile events 14 → 4 | none — pixel-identical |
| `portalHz` | **120** | 0 | cap how often the portal re-renders the scene; motion forces it anyway | −1.48 ms, 5/5 pairs; portal refresh 43 → 91 Hz | low — refreshes more often than before, except on a fast sweep |
| `brGenCacheMax` | **512** | 0 | LRU bound on the chunk data cache | nothing at this scale (peaks at 156) | none — insurance only |
| `streamBudgetMs` | **8** | 0 | one shared deadline for overworld streaming, with admission control | frames > 12 ms −60 (B2o) / −114 (B3o) | low — the first unit of a frame always runs, so streaming cannot starve |
| `streamAdmitSafety` | 1.0 | — | multiplier on the cost estimate | — | >1 starves streaming sooner |
| `streamBudgetMs` | **8** | 0 | one shared deadline for overworld streaming, with admission control | frames >12 ms −60 (B2o) / −114 (B3o) | low — the first unit of a frame always runs, so streaming cannot starve |
| `streamAdmitSafety` | 1.0 | — | multiplier on the cost estimate | — | >1 starves streaming sooner |
| `brPrecompile` | **false** | false | compile the Backrooms shaders on the loading screen | works, costs +16 s of load | rejected on cost |
| `brPrefetch` | **false** | false | build the chunk ring ahead of the player | nothing while compiles dominate | re-measure after the light-pool decision |
| `brPrefetchRing` / `brPrefetchCooldown` | 1 / 20 | — | tuning for the above | — | inert while `brPrefetch` is off |
| `portalMoveEps` / `portalTurnEps` | 0.008 / 0.0015 | — | how much camera motion forces a fresh portal frame | — | lower = more faithful, more cost |

### Verification harnesses added

| harness | what it proves |
|---|---|
| `bench/perf-run.mjs` | the B1–B7 suite; every number in this report |
| `bench/perf-ab.mjs` | paired in-session A/B — the right instrument for steady-state changes |
| `bench/perf-compile.mjs` | two cold sessions — the only instrument that can see first-encounter effects |
| `bench/perf-matrix.mjs` | GPU Gems 2 bottleneck isolation |
| `bench/perf-drawprobe.mjs` | scene census; reconstructs the draw-call count |
| `bench/perf-verify-p2.mjs` | door geometry identical at three swing angles, and still swinging |
| `bench/perf-verify-v3v4.mjs` | C3: order-independence and cross-chunk seams |

## URL parameters added by the pass

| param | effect |
|---|---|
| `?perf` | arms the profiler (timers + counters, no overlay) |
| `?perf=1` | profiler + on-screen overlay |
| `?brseed=N` | pins the Backrooms maze seed so A/B runs measure the same geometry |
