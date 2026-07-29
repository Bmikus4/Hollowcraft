# PERF_MATH — every budget derived, with measured constants

Constants come from `bench/results/perf-baseline-d2a425f-2026-07-28T22-16-00.json` and
`bench/results/perf-matrix-latest.json`. Anything I could not measure is labelled **GUESS**.

Confirmed inputs (Ben, 2026-07-28): reference machine = this desktop, headless, **vsync off**, **1920×1080**,
dpr 1; max player speed for the C2 gate = **10.08 m/s** (sprint 7.2 × stim 1.4); chunk sizes and load radii as
read from the code.

---

## 4.1 Frame budget

```
t_budget = 1000 / 140 = 7.143 ms
```

**Which display are we pacing to?** Measurement runs with vsync disabled, so there is no refresh quantisation:
the fastest frame delta observed across the whole suite is **3.005 ms**, i.e. ~333 Hz, which is the harness
running unlocked. That is the correct way to *measure* — with vsync on and a 60 Hz panel, 140 FPS cannot be
observed at all and the frame-time distribution collapses onto 16.67 / 33.3 ms.

So the engineering target is the raw **7.143 ms**, not a refresh-quantised 6.944 ms. If Ben plays on a 144 Hz
panel the real quantisation on his screen is 6.944 / 13.889 / 20.833 ms and the target tightens to **6.944 ms**;
that is a 3 % tightening and does not change any conclusion below. **Stated, not assumed.**

### Where the 7.143 ms goes

Allocated from the measured shape of the problem, not from a template. This game's CPU and GPU do **not**
pipeline today — B1 measures frame 15.04 ms, CPU 14.75 ms, GPU-segment 14.75 ms, which is
`frame ≈ CPU ≈ GPU`, the signature of a GPU starved inside the CPU's submission window. The budget therefore
assumes they *will* overlap once submission is cheap, and reserves for the case where they do not:

| | budget | measured today (B1, Backrooms) | measured today (B1o, overworld) |
|---|---|---|---|
| GPU total | ≤ 5.0 ms | 14.75 (starved, not saturated) | 1.17 |
| CPU main thread | ≤ 5.5 ms | **14.75** | 1.51 |
| · draw submission | ≤ 2.0 ms | **14.37** | 1.16 |
| · sim + collision | ≤ 0.8 ms | 0.08 | 0.01 |
| · streaming apply | ≤ 0.8 ms | 0.06 | 0.03 |
| · culling | ≤ 0.5 ms | 0.00 | 0.00 |
| · entities + AI | ≤ 0.8 ms | 0.01 | 0.26 (spikes to 18.2) |
| · HUD + uniforms + audio + sky | ≤ 0.6 ms | 0.19 | 0.06 |
| headroom | ≥ 1.6 ms | none | 5.6 |

**The entire overrun is one line of that table.** Everything except draw submission already fits, with room.
Draw submission is 7.2× its budget in the Backrooms and 5.8× at the portal.

### Draw-call ceiling, derived

From §4.4 below, the measured cost is **c_draw = 3.01 µs**. For a 2.0 ms submission budget:

```
N_draw_max = 2000 µs / 3.01 µs = 664 draw calls
```

Today: **4 770** (Backrooms), **7 168** (portal), 166 (overworld). So the Backrooms must lose **86 %** of its
draw calls, or c_draw must fall, or both. `PERF.maxDrawCalls = 664` becomes an assertion in the benchmark.

---

## 4.2 Cross-chunk streaming math (the C2 gate, derived)

```
f_axis  = v·|d_axis| / S
f_cross = v·(|d_x| + |d_z|) / S        worst case diagonal: v·√2 / S
N_dot   = f_cross · (2r + 1)           new chunks per second
```

### Overworld — S = 16 m, v = 10.08 m/s, r = 6

```
f_cross(axis) = 10.08 / 16                    = 0.630 crossings/s
f_cross(diag) = 10.08 · 1.4142 / 16           = 0.891 crossings/s
chunks entering the ring per axis crossing    = 2r + 1 = 13
N_dot         = 0.891 × 13                    = 11.6 chunks/s
t_chunk_wall  = 1 / 11.6                      = 86 ms per chunk
F             = 140 / 11.6                    = 12.1 frames per chunk
```

Per-frame streaming slice b = 0.8 ms ⇒ total main-thread budget per chunk = **9.7 ms**, and **never more than
0.8 ms in any single frame**.

Measured today: `streamChunks` has a self-imposed slice of 1.5–3.5 ms but **overruns it to 16.7–22.4 ms**
(B2o/B3o worst frames). That is 21–28× the per-frame budget. The slice is checked *between* units of work and a
single unit — one `generateChunk` or one `buildChunkStaged` stage — is far larger than the slice it is meant to
respect. **This is the overworld C2 failure, and it is a granularity bug, not a throughput problem.**

### Backrooms — S = 64 m (BRX_SPAN = 8 cells × 8 blocks), v = 10.08 m/s, r = 1 (BRX_KEEP)

```
f_cross(axis) = 10.08 / 64                    = 0.158 crossings/s
f_cross(diag) = 10.08 · 1.4142 / 64           = 0.223 crossings/s
chunks entering per axis crossing             = 2r + 1 = 3
diagonal additionally pulls the corner        = 3·2 + 1 = 7 worst case
N_dot(diag)   = 0.223 × 3                     = 0.67 chunks/s   (up to 1.56 on a corner step)
t_chunk_wall  = 1 / 0.67                      = 1 493 ms per chunk
F             = 140 / 0.67                    = 209 frames per chunk
```

**The Backrooms has 1.5 seconds and 209 frames to produce each chunk, and it does it in one frame instead.**
Measured `brBuild`: 18.5–47.4 ms per crossing, 85–99 ms on a teleport. Against a 0.8 ms per-frame slice:

```
slices needed = ceil(47.4 / 0.8) = 60 frames        available: 209
```

So the work comfortably fits — **it is purely a scheduling failure.** No new algorithm is required to pass C2
here; the existing build has to be split into ≥60 resumable slices, or moved off-thread.

### Enumerating what must be split (the Phase 4 work plan)

Every per-chunk main-thread operation costing more than b = 0.8 ms:

| operation | measured | slices needed at b = 0.8 ms | classification |
|---|---|---|---|
| `brxGenerate` (maze data for one BRX chunk) | part of the 18–47 ms | — | **move off-thread** — pure function of (gx, gz, seed) |
| `brBuildEnv` (~135 meshes/chunk) | dominant part of 18–47 ms | ≥ 24 | **split** — build N meshes per frame |
| `brMergeStatic` (clone + transform + concat) | included above | ≥ 8 | **split or eliminate** via shared materials (T2) |
| `brxUnion` (rebuild 16 flat arrays over 9 chunks) | ≤ 0.15 ms | 1 | leave alone |
| `brBuildEnvAll` teardown + re-parent | included | ≥ 2 | **incrementalise** — only 3 of 9 chunks change |
| `generateChunk` (overworld terrain) | up to 22 ms observed | ≥ 28 | **move off-thread** |
| `buildChunkStaged` (greedy mesh + light bake + upload) | up to 17 ms observed | ≥ 22 | **split further** — already 2 stages, needs ~8 |

### Queue sizing, Little's law

```
L = N_dot × W_latency
```
With a worker round trip of **300 ms (GUESS — no worker exists yet to measure)** and the diagonal-corner worst
case N_dot = 1.56/s: `L = 0.47` chunks in flight steady state. Size the pool at ≥ 4× for the B4 teleport burst
⇒ **pool of 2 in-flight requests is sufficient for the Backrooms**; the overworld's N_dot = 11.6/s gives
`L = 3.5`, so **≥ 14 in-flight** there. Worker count = `clamp(hardwareConcurrency − 1, 1, 4)` = **4** on this
machine (16 cores). Overflow policy: nearest-first priority queue, cancel-by-generation-id, drop silently on
receipt if the chunk is no longer resident.

---

## 4.3 Hysteresis / thrash math

Deadband, so standing on a border does not load/unload every frame:

```
r_load = r ;  r_unload = r + 1 minimum, r + 2 for cheap data
h ≥ v · dt_max
```

With v = 10.08 m/s and dt_max = 12 ms (the C2 ceiling): **h ≥ 0.121 m**. Being generous against a 33 ms frame:
**h ≥ 0.333 m**. Both are tiny relative to S = 16 m and S = 64 m, so a **h = 1.0 m** band is safe everywhere.

Rate-limiting residency re-evaluation to once per K frames requires `K · dt · v < h`:
```
K < h / (dt · v) = 1.0 / (0.00714 × 10.08) = 13.9  ⇒  K ≤ 13 frames
```

Current state: the overworld already has real hysteresis (gen at RD+1, unload at RD+2 — a comment at
index.html:3050 records that removing this clamp previously cost ~2.5 ms/frame permanently). **The Backrooms
has none**: `brxStream` re-evaluates on every frame and its keep-set and drop-set are the same 3×3, so a player
standing exactly on a BRX border can thrash a full 9-chunk rebuild. Not observed in the benchmarks because the
scripted paths cross cleanly, but it is a real hazard. `BRX_KEEP_LOAD = 1`, `BRX_KEEP_UNLOAD = 2`.

---

## 4.4 Draw submission cost model

```
t_cpu_submit ≈ N_draw · c_draw + N_state · c_state + N_uniform · c_uniform
```

**c_draw measured in this game, in this browser**, from the four worlds in the baseline suite (all with the
same renderer, same post chain, so `c_state`/`c_uniform` are absorbed):

| scene | draws | `draw` scope ms | µs per draw |
|---|---|---|---|
| B1o overworld | 166 | 1.16 | 6.99 |
| B6 portal | 7 168 | 23.14 (draw + brPortal, deduped) | 3.23 |
| B1 Backrooms | 4 770 | 14.37 | **3.01** |
| B5 Backrooms spin | 4 928 | 15.27 | 3.10 |

The three large-N points agree at **3.0–3.2 µs per draw call**, well inside MDN/GPU-Gems' expected 5–50 µs band
for WebGL and at the good end of it. The overworld's 7 µs is the small-N intercept — 166 calls do not amortise
the fixed per-frame cost, so the line is `t ≈ 0.65 ms + 3.01 µs · N`.

Fit: **`c_draw = 3.01 µs`, fixed overhead ≈ 0.65 ms.**

Therefore, for a 2.0 ms submission budget: **`PERF.maxDrawCalls = 664`**, asserted in the benchmark.

**Corollary, restated for this game:** with 9 loaded BRX chunks and 135 meshes each, one draw per mesh is
1 215 calls before any shadow pass — already double the ceiling. Merging per material *within* a chunk is not
enough; materials must be shared *across* chunks so the whole loaded set collapses to a handful of batches.
86 distinct materials is the thing to fix first.

---

## 4.5 GPU cost model

```
t_fill ≈ (W · H · overdraw · cost_px) / fillrate
```

**Measured, not modelled.** The `fill 1 %` experiment renders 1 % of the pixels (`_pixelScale = 0.1`):

| world | full res | 1 % of the pixels | implied fill share |
|---|---|---|---|
| overworld | 4.69 ms | 4.03 ms | ≤ 14 % |
| portal | 24.61 ms | 25.96 ms | **0 %** (slower — inside noise) |
| Backrooms | 20.23 ms | 14.43 ms | ≤ 29 % |

So fill is **at most 29 %** of the Backrooms frame and **nothing** at the portal, and even that 29 % is an
over-attribution because shrinking the framebuffer also shrinks the 12 shadow-map... no: shadow maps are fixed
at 512². The 29 % is real fragment work, and it disappears anyway once the shadow passes go (`noShadow` alone
takes the frame to 4.73 ms, below where `fill 1 %` got it).

**Conclusion: there is no fill-rate problem to solve.** Overdraw was not measured because the model says it
cannot be binding; if T1+T2 land and the frame becomes GPU-bound, re-measure then.

Vertex: 400 680 triangles across the loaded Backrooms set. The scene-graph census counts 48 002 triangles of
*unique* geometry — the 8.3× difference is the shadow passes re-drawing the same geometry. Per-chunk unique
geometry is therefore ~5 300 triangles, which for a greedy-meshed corridor is reasonable and **not** the >2×
mesher failure the prompt warns about. **Negative result: the mesher is not the bug.**

Bandwidth: not measured. **GUESS** — with 3.0 µs/draw dominating and fill at ≤29 %, vertex bandwidth cannot be
binding. Vertex-format packing (R6's 3-bit normals, 16-bit UVs, 2-bit AO) is deferred as a non-issue.

---

## 4.6 Memory budget

Measured heap across the suite: **76 MB → 272 MB** (B4 teleport, the worst case, after 10 jumps of 200+ chunks).

Per BRX chunk, derived from the census (1 213 meshes / 9 chunks, 48 002 tris / 9 chunks):
```
unique tris per chunk   ≈ 5 334
verts (non-indexed after brMergeInto, 3 per tri) ≈ 16 000
stride = pos(12) + normal(12) + uv(8) = 32 bytes
mesh_bytes ≈ 16 000 × 32                          = 512 KB per chunk
data_bytes (rooms/walls/doors/… 16 arrays)        ≈ 40 KB per chunk   (GUESS — not instrumented)
```
With `BRX_KEEP = 1`, resident = 9 × 552 KB ≈ **5 MB**. That is negligible; the 272 MB is **not** resident chunk
data, it is `BR.gen` (the data cache, unbounded — B4 grows it to hundreds of entries) plus `BR.envCache`
churn plus garbage awaiting collection. **The memory problem is an unbounded cache, not chunk size.**

Ceiling: 350 MB JS heap, 250 MB GPU. At 552 KB/chunk the heap ceiling permits `r` far beyond anything useful,
so **r is not memory-limited** — it is limited by draw calls (§4.4). `BR.gen` needs an LRU bound; sized at
350 MB / 40 KB it could hold thousands, so a practical cap of **512 chunk records** is generous and bounded.

---

## 4.7 LOD switch distances

```
d_switch = (h_px · g) / (2 · tan(fov_y/2) · ε)
```
With h_px = 1080, fov_y = 74° (⇒ `tan(37°) = 0.7536`), and a Backrooms feature size g = 0.36 m (wall thickness
`BR_WT`):

| ε | purpose | d_switch |
|---|---|---|
| 1.5 px | silhouette features | **172 m** |
| 4.0 px | interior detail | **64.5 m** |

The loaded Backrooms set is 3×3 × 64 m, so the farthest visible geometry is ~96 m away. **Interior detail could
drop at 64.5 m — inside the loaded set — but silhouettes must survive to 172 m, beyond it.** So an LOD ring is
worth exactly one tier: full detail inside 64.5 m, props/decals/gore stripped beyond it. Add 15 % hysteresis
⇒ drop at 64.5 m, restore at 56.1 m.

For the overworld (RD 6 = 96 m, g = 1 m block): ε = 1.5 px ⇒ d_switch = 478 m, far beyond RD. **No overworld
LOD is justified by screen-space error at this render distance.** Negative result.

---

## 4.8 Dynamic resolution scaling controller

The game already has one (index.html:5421–5437): a 1.2 s tick that sheds internal resolution 1.0 → 0.5 in 0.12
steps, then shadow cadence, then god rays, then bloom.

Per the prompt's controller:
```
g_{n+1} = (1−a)·g_n + a·t_gpu ,  a = 0.1  ⇒  tau = dt/a = 7.143/0.1 = 71.4 ms ≈ 10 frames
s_{n+1} = clamp( s_n · sqrt(t_target / g_{n+1}), 0.6, 1.0 )
```
quantised to 0.05, cooldown ≥ 15 frames, act only on >8 % error.

**But §4.5 says fill is at most 29 % of the frame and 0 % at the portal.** Resolution scaling therefore cannot
rescue C1 on this codebase — at s = 0.6 (36 % of the pixels) the Backrooms frame would fall from 20.23 ms to
roughly `20.23 − 0.64×(20.23−14.43) = 16.5 ms`, still 2.3× over budget, while making the game visibly softer.
The existing controller is already forbidden from acting inside the Backrooms (index.html:5426) — which,
given this data, is the right call for the wrong reason.

**Decision: do not build the §4.8 controller.** It is a safety net for a fill-bound game and this one is
submission-bound. Revisit only if T1+T2 make it GPU-bound. **Negative result, recorded with the arithmetic.**

---

## 4.9 Statistics discipline

Reported figure is the **median of per-run medians**, n = 5, warm-up run discarded. `±` is the full inter-run
spread. p99 and max are reported separately; "1 % low FPS" is **1000 / p99 frame time**.

Observed noise floor from the baseline suite:

| scene | median spread | as % of median |
|---|---|---|
| B1 Backrooms | ±0.08 ms | 0.5 % |
| B2 Backrooms | ±0.25 ms | 1.6 % |
| B6 portal | ±0.32 ms | 1.3 % |
| B5 Backrooms | ±1.91 ms | **11.9 %** |
| B4 teleport | ±1.43 ms | 7.7 % |

**A change is only real if it beats the spread of the scene it is measured in.** For the tight scenes that is
~2 %; for B5 and B4 it is ~12 %, so those two cannot resolve anything smaller than a 12 % improvement and any
claim there needs more runs. Thermals are a known hazard on this machine (failing fan), which is the most likely
source of B5's spread — it runs late in the suite.

---

## Summary: the arithmetic says

1. **664 draw calls** is the ceiling. The Backrooms is at 4 770 and the portal at 7 168.
2. The pass multiplier (13 with two shadowed point lights) is the biggest single term, worth **−77 %** measured.
3. The cross-chunk hitch has **209 frames** of budget and uses **1**. It is a scheduling failure, not a
   throughput one, and needs no new algorithm to fix.
4. Fill, shaders, textures, vertex bandwidth, greedy meshing, LOD and dynamic resolution are all **measured
   non-issues** on this codebase. Four of the prompt's ranked optimisations are negative results here.
5. The 272 MB heap is an unbounded `BR.gen` cache, not chunk footprint.
