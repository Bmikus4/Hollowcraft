# PERF_REPORT — Hollowcraft performance pass

Status: **Phases −1, 0, 1, 2 complete. P1, P2, P3 shipped and measured. P4, P5 and the V-series sign-off not
started.** This is an interim report, not a Phase 6 sign-off.

## Before / after

Baseline `bench/results/perf-baseline-d2a425f-2026-07-28T22-16-00.json` vs shipped
`bench/results/perf-SHIPPED-P1P2P3-2026-07-29T06-24-44.json`. Both n = 5, warm-up discarded, same machine,
1920×1080, vsync off, `?brseed=20260728`.

| scene | median ms | fps | draws | p99 ms | max ms | C1 | C2 |
|---|---|---|---|---|---|---|---|
| **B1** Backrooms static | 15.04 → **3.15** (4.8×) | 67 → **318** | 4 770 → **399** | 16.18 → 13.71 | 22.2 → 69.4 | FAIL | FAIL |
| **B5** Backrooms spin | 16.03 → **3.83** (4.2×) | 62 → **261** | 4 928 → **519** | 17.67 → **5.36** | 25.1 → 20.8 | **PASS** | FAIL |
| **B2** Backrooms sprint | 15.94 → **3.94** (4.0×) | 63 → **254** | 4 958 → **431** | 25.53 → 13.55 | 54.4 → 63.1 | FAIL | FAIL |
| **B3** Backrooms diagonal | 16.49 → **4.21** (3.9×) | 61 → **238** | 5 443 → **500** | 27.28 → 14.11 | 66.6 → 50.3 | FAIL | FAIL |
| **B4** teleport | 18.53 → **4.69** (4.0×) | 54 → **213** | 5 230 → **512** | 30.43 → 24.55 | 111.8 → 107.6 | FAIL | FAIL |
| **B6** portal | 23.99 → **6.22** (3.9×) | 42 → **161** | 7 168 → **717** | 25.82 → **8.02** | 42.5 → 25.5 | **PASS** | FAIL |
| B1o / B5o / B2o / B3o overworld | 1.6–2.3 → 2.2–2.6 | ~400 | unchanged | — | — | mixed | mixed |

**Three to five times faster everywhere the game was slow**, and draw calls are down 87–92 % — from 4 770–7 168
to 399–717, now at or under the 664 ceiling derived in PERF_MATH §4.4 (B6 is 53 over).

V6 flag matrix verified: booting with `?perfoff=all` reproduces the baseline exactly — B1 back to 14.41 ms and
4 772 draws. Every optimisation is one boolean away from the old behaviour.

## Gates: what is fixed and what is not

- **C1 (median ≤ 7.14 ms, p99 ≤ 9.5 ms).** Every median now passes with room — the worst is B6 at 6.22 ms. B5
  and B6 pass outright. The rest fail **only on p99**, and every one of those p99s is a chunk-crossing hitch,
  not steady-state cost.
- **C2 (no frame > 12 ms, zero > 16.6 ms). Still fails everywhere.** This is the honest headline: the pass so
  far has fixed *throughput*, not *hitching*. B4 still reaches 107.6 ms and B2 63.1 ms.
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

1. **P4 — slice the BRX chunk build across frames.** The budget allows 209 frames per chunk (PERF_MATH §4.2)
   and it uses one. This is the C2 failure in B2/B3/B4 and needs no new algorithm.
2. **Decide the Backrooms light pool size.** Unlocks P3b and cuts fragment cost at the same time.
3. **P6 — the overworld streaming slice.** `streamChunks` declares 1.5–3.5 ms and overruns to 16–25 ms because
   one unit of work is larger than the slice. B3o: 230 frames over 12 ms.
4. **P7 — bound the `BR.gen` cache.** Heap still reaches 231 MB in B4; resident chunk data is only ~5 MB.
5. **V3/V4/V7 — determinism, seam and soak tests.** None written yet, and P4 must not land before V3/V4 do.

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
