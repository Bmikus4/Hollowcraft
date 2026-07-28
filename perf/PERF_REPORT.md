# PERF_REPORT — Hollowcraft performance pass

Status: **Phase 0 complete. Phases 1–6 not started.** This file currently carries only the reference
configuration (prompt §1.5). The before/after table, gate PASS/FAIL and the "next 5 things" list land at Phase 6.

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
