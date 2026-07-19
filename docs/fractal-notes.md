# SERAPHIM FRACTAL — math prototype notes (Agent D)

Isolated experiment for canon `seraphim-canon.md` §10. No game integration.

Files:
- `src/boss/seraphim/experiments/fractal.frag.glsl` — the raymarch fragment shader.
- `src/boss/seraphim/experiments/fractal-demo.html` — standalone harness (own importmap,
  lil-gui, half-res render target, OrbitControls, `window.__diag`).
- `src/boss/seraphim/experiments/fractal-demo.png` — headless render (see Verify).

Serve + open:
```
cd D:/code/Minecraft && python -m http.server 8099
# open http://localhost:8099/src/boss/seraphim/experiments/fractal-demo.html
```

---

## 1. The math, as implemented

All of §10 is implemented; nothing dropped. GLSL ES 1.00 (THREE.ShaderMaterial default).

### Inward raymarch
`p = o + t·d̂`, `t += DE(p)`, hit when `DE < uEps·t`, step cap `uMaxSteps` (default 96,
HARD_MAX 128). Background (miss) = fog colour `#f5f1ea` — the screen is never black.
Camera ray built from the OrbitControls camera basis (`uCamRight/Up/Fwd`, `uTanHalfFov`,
`uAspect`) so orbiting is real perspective, not a baked matrix.

### KIFS estimator (primary, `deKIFS`)
Per fold, exactly in canon order:
```
z ← |z|              (fold)
z ← R1·z             (uR1, animated)
z ← s·z − c·(s−1)    (scale about offset c = uC)
z ← R2·z             (uR2, animated)
```
`n = uIter` folds (default 12, range 4–16). `DE = (‖z_n‖ − b)/sⁿ` with `s = uS ∈ [1.8,2.8]`
(GUI clamps the slider to that range), `b = uB`. `pow(s, n)` uses the actual executed
fold count.

### Mandelbulb toggle (`deBulb`)
`r = ‖z‖`; `dr ← k·r^{k−1}·dr + 1`; spherical power-k map `z ← r^k·(sinθ'cosφ', sinθ'sinφ',
cosθ') + p` with `θ'=kθ, φ'=kφ`; escape at `r>2`. `DE = ½·r·ln r / dr`. `k = uK` (default 8),
`uBulbIter` iterations (default 8).

### Sphere inversion (the key trick, `deFractal`)
```
r2  = max(‖p‖², 1e-6)        // ‖p‖² floor — no div-by-zero / NaN
p'  = (R²/r2)·p              // R = uInvR
DE_final = DE(p')·(r2/R²)·0.5
```
The `·(r2/R²)·0.5` is the **Lipschitz correction × safety factor** and is present exactly —
NOT dropped. This is what makes the fractal *enclose* the camera (see §3).

### Orbit traps (keep it a seraphim)
Accumulated inside the fold loop, one source of truth (the DE fn fills a `Trap` struct used
by marching, normals, shadows and hit-shading):
- **Eye trap** `τ_eye = min_n |‖z_n‖ − ρ|` (`ρ = uRho`). Where small → iris: polar UV
  `(clamp(τ_eye/uTauMax), atan2(z_y,z_x)/2π + 0.5)` sampled from the iris texture. Prefers
  Agent-B's `assets/seraphim/eye/iris_albedo.jpg` if present; otherwise a **procedural iris
  fallback** is generated on a canvas (dark pupil → glacial-blue fibers `#7fb4c9`→`#4a7d94`
  → dark limbal ring). The loader swaps in the JPEG automatically once it exists.
- **Scripture trap** `τ_plane = min_n |z_{n,y}|`. Where small → white striations, **tinted
  rust by iteration count** (the fold index at which the min occurred, normalised).

### Shading
- Normals: **tetrahedron gradient, 4 taps** (`calcNormal`).
- **DE-cone soft shadows** (`softShadow`, hardness `uShadowK`).
- **AO from iteration count**: `1 − steps/uMaxSteps·uAoStrength` (more march steps to reach a
  point ⇒ more occluded — the canonical cheap fractal AO).
- **Wrap-lighting pseudo-SSS**: `NdotL_wrap = (N·L + w)/(1 + w)`, `w = uWrap` (default 0.5).
- Ivory→rust stain: rust at the core AND in deep iteration rows (`max(coreDist, τ.scr)`),
  clean ivory at outer tips — canon §1.
- Ember/gold `#d9902f` glints smoulder in the core (emissive-on-opaque, time-pulsed).
- **Fog** `1 − e^{−σt}` toward `#f5f1ea` (`σ = uSigma`).
- Palette locked to canon §1: ivory `#f2ece4`, rust `#7e2c20`, ember `#d9902f`, fog `#f5f1ea`
  (all live GUI colour pickers).

### Morph twin (analytic boss SDF)
`mapBoss` = **10 primitives** blended with the exact exponential smooth-min
`smin(a,b,k) = −1/k·ln(e^{−ka}+e^{−kb})`:
horizontal eye-band ellipsoid + dominant central eye + 2 flanking eyes + upper V pair
(rotated ellipsoids) + mid lateral pair + lower draped pair.
`DE_m = mix(DE_boss, DE_fractal, smoothstep(0,1,m))`, `m = uMorph`. Inversion radius
`R(m)` is driveable huge→arena scale via the **auto R** toggle; `R1,R2` rotate at
`≤ 0.05 rad/s` (nausea limit — GUI sliders hard-capped at 0.05).

---

## 2. Parameters & ranges (all live in lil-gui)

| Param | Default | Range | Notes |
|---|---|---|---|
| type | KIFS | KIFS / Mandelbulb | estimator toggle |
| iter (n) | 12 | 4–16 | KIFS fold count |
| scale s | 2.30 | 1.8–2.8 | KIFS contraction |
| offset b | 1.00 | 0–3 | DE radius offset |
| c (cx,cy,cz) | 1,1,1 | 0–2 | KIFS fold offset vector |
| mbulb k | 8.0 | 2–12 | Mandelbulb power |
| bulbIter | 8 | 3–16 | Mandelbulb iterations |
| inversion R | 1.90 | 0.15–6 | shrink to swallow (see §3) |
| morph m | 1.00 | 0–1 | 0 boss → 1 fractal |
| boss smin k | 4.0 | 1–12 | morph blend sharpness |
| R1 / R2 rad/s | 0.030 / 0.018 | 0–0.05 | nausea-capped |
| eye ρ | 0.70 | 0–2 | iris trap radius |
| τmax | 0.55 | 0.05–1.5 | iris polar-U normalizer |
| irisWidth / strength | 0.10 / 0.95 | — | iris trap mask |
| scrWidth / strength | 0.06 / 0.75 | — | scripture trap mask |
| maxSteps | 96 | 32–128 | march cap |
| eps | 0.0016 | — | hit threshold ε (DE<ε·t) |
| far | 22 | 5–40 | march far clip |
| fog σ | 0.055 | 0–0.3 | white fog density |
| wrap w | 0.50 | 0–1.5 | SSS wrap |
| aoStrength | 0.85 | 0–2 | iteration AO |
| shadowK | 8.0 | 2–24 | soft-shadow hardness |
| coreRadius | 3.2 | 0.5–6 | rust core falloff |
| bloom / thresh / CA | 0.85 / 0.85 / 0.0016 | — | composite post |

Two preset buttons: **cathedral wings** (KIFS) and **mandelbulb flesh**.
`auto morph` / `auto R (swallow)` animate m and R for the swallow demo.

---

## 3. Inversion behaviour (important — read before judging "enclose")

The visible surface is the **inversion** of the compact fractal F. A fractal detail at
world radius `|p|` corresponds to `|p'| = R²/|p|`, so the detail *shell* sits at
`|p| ≈ R²/ρ` (ρ = characteristic fractal radius, ~1–2). Camera default distance ≈ 3.6.

- **Large R (~4)**: shell far out → a distant structural wall; camera well inside.
- **Shrinking R toward ~1.9–2.3**: the shell **contracts through the camera** and wraps the
  entire view — the central void closes, structure fills top+bottom+sides. This is the
  "reality being swallowed" beat, and matches canon "animate R shrinking = swallowed".
- **Small R (≲1.0)**: shell contracts *past* the camera → collapses to a compact ball /
  floating rust "butterfly" clusters (a bonus boss-scale silhouette — 4 mirrored wings).

So "encloses as R shrinks" holds in the **R ≳ crossover (~2.3 down to ~1.6)** regime; below
that it becomes a ball. The default R=1.9 sits in the maximal-wrap window. `auto R` sweeps
`0.4–2.8` to show the full swallow→collapse cycle.

---

## 4. Performance approach

- **Half-res march**: the raymarch renders into a HalfFloat `WebGLRenderTarget` at ½×½ of the
  (≤1080p) canvas, then a composite fullscreen pass upscales it and applies a cheap 9-tap
  thresholded bloom + slight radial chromatic aberration + Reinhard-ish tonemap toward
  overexposed white. Two draw calls per frame total. HalfFloat keeps emissive >1 alive for the
  bloom threshold.
- KIFS ~12 folds is the inner cost; normals add 4 DE taps, shadows ≤20 taps. Everything is in
  one fragment; no CPU per-frame work beyond 2 rotation matrices + camera basis.
- One `Trap` struct threaded through a single DE function (no duplicate loops to maintain).
- Loops use constant bounds (`FOLD_MAX 16`, `HARD_MAX 128`) with early `break` on uniform
  counts — GLSL ES 1.00 legal, adjustable live.

Measured (headless Chrome, ANGLE D3D11, **AMD RX 5700 XT**, 1920×1080, ½-res march):
**~144 fps** steady in every configuration tested (KIFS default, Mandelbulb, R sweep). Far
above the 60 fps target — there is headroom to raise march resolution to full-res on this
class of GPU if desired.

---

## 5. Most "seraphic" parameter regions (concrete values)

### Cathedral-of-wings (KIFS) — the primary look
- `type KIFS, iter 12, s 2.30, b 1.0, c (1,1,1), invR 1.9, rho 0.70, morph 1.0`
  → symmetric layered feather-row scallops wrapping a bright central eye-void; rust mottling
  in the deep rows, ivory tips. This is the default + "cathedral wings" preset. Best overall.
- `s 2.05, iter 13, invR 2.2` → taller, more vertical "pinion" rows (upper-wing V feel).
- `s 2.55, iter 11, c (1.0,0.7,1.0)` → broader lateral fans (mid-wing / moth character).
- `invR 0.6–0.8, iter 12` → collapses to **4 mirrored rust butterfly wings** — a compact
  boss-scale seraph silhouette floating in white (great for a distant/telegraph pose).

### Flesh (Mandelbulb) — the uncanny-body look
- `type Mandelbulb, k 8, bulbIter 9, invR 2.3, rho 1.1, morph 1.0` ("mandelbulb flesh"
  preset) → bulbous rose-window radial bloom, organic/fleshy, less architectural. Reads as
  the seraph's "body" rather than wings.
- `k 6, bulbIter 10, invR 1.8` → tighter, more knotted flesh with pronounced radial ribs.
- `k 10, invR 2.6, sigma 0.03` → smoother pearlescent bulb, good for a slow morph target.

### Morph / swallow demo
- Start `morph 0` (analytic boss silhouette), enable `auto morph` + `auto R` → the mesh-like
  boss dissolves into the fractal while the inversion shell closes in. Keep `R1/R2 ≤ 0.03`
  for a slow, non-nauseating rotation.

---

## 6. Known weaknesses / caveats

- **Iris blue is subtle at default fog/exposure.** The eye-trap iris IS wired and sampling
  correctly (polar UV), but under the canon's overexposed white-cloud tonemap the glacial
  blue reads as a faint tint rather than a bold iris. Widen `irisWidth`, raise `irisStrength`,
  and drop `fog σ`/bloom to make it pop; it will read much stronger once Agent-B's real iris
  JPEG replaces the procedural fallback (loader already prefers it).
- **Procedural iris fallback** is a simple radial-fiber canvas, not photoreal. Real eye =
  Agent B. The 404 for `iris_albedo.jpg` in the console is expected until then (harmless).
- **DE overstepping / banding**: with `s` near 2.8 and low `iter`, the KIFS DE can slightly
  overstep (thin fringes / faint banding on grazing rays). Mitigate with a smaller `eps` or
  a global DE under-relaxation; not applied by default to keep speed. The `‖p‖²` floor and
  final `clamp(col,0,8)` guard against NaN/inf; no black frames observed.
- **Half-res softness**: fine scripture striations soften under the ½-res march + upscale.
  Full-res is affordable on the test GPU but half-res is the documented default for the perf
  contract. Bloom/CA are prototype-grade (the real game supplies UnrealBloomPass per canon).
- **Enclose direction** is the true inversion geometry (§3), not a naive "smaller R = bigger
  object"; the swallow reads correctly in the R≈2.3→1.6 window. Documented so it isn't
  mistaken for a bug.
