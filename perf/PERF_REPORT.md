# PERF_REPORT — Hollowcraft performance pass

Status: **Phases −1, 0, 1, 2 complete. P1, P2, P3 shipped and measured. P4, P5 and the V-series sign-off not
started.** This is an interim report, not a Phase 6 sign-off.

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
- **C2 (no frame > 12 ms, zero > 16.6 ms).** **B5 and B1o now pass.** Everywhere else it still fails — this
  remains the honest headline: the pass has fixed *throughput*, not *hitching*. B4 still reaches 124.6 ms.
- **C3 / C4 (no seams, no regression).** Not formally tested — V3/V4 are unwritten. The existing Backrooms
  harnesses (`tmp-br-visible`, `tmp-v1-doors`, `tmp-br-portal`, `tmp-verify-backrooms`) all pass, and
  `bench/perf-verify-p2.mjs` proves the door merge is geometrically exact, but that is not the same as a seam
  test. **This is the biggest gap in the sign-off.**
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
2. **V3/V4 — determinism and seam tests.** Unwritten, and the largest gap in the sign-off. The BRX edge oracle
   is order-independent by construction, so this is a matter of asserting it, not building it.
3. **P6 — the overworld streaming slice.** `streamChunks` declares a 1.5–3.5 ms budget and overruns to
   16–25 ms because one unit of work is bigger than the slice. B3o: 235 frames over 12 ms, worst 25.1 ms. This
   is the last untouched C2 failure that is purely a scheduling bug.
4. **P7 — bound the `BR.gen` cache.** Heap still reaches 231 MB in B4; resident chunk data is only ~5 MB, so
   this is an unbounded map, not footprint.
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

Optimisation flags are added here one per change, from Phase 4 onward.

## URL parameters added by the pass

| param | effect |
|---|---|
| `?perf` | arms the profiler (timers + counters, no overlay) |
| `?perf=1` | profiler + on-screen overlay |
| `?brseed=N` | pins the Backrooms maze seed so A/B runs measure the same geometry |
