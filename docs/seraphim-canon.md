# SERAPHIM BOSS — CANON (ground truth)

> This document is the single source of visual/aesthetic truth for the Hollowcraft
> Seraphim boss rebuild. It is transcribed from the mission brief. The reference
> image is described in Section 1 in full — treat the text as ground truth even
> though you cannot see the image. Read this AND `seraphim-contracts.md` before
> writing any code.

---

## 0. WHAT WE ARE BUILDING

A hyper-realistic, terrifying, biblically accurate Seraphim boss for **Hollowcraft**
(a Three.js voxel horror game). We are replacing ONLY the boss's visual model, rig,
and animation layer. The behavioral/AI/state-machine code is preserved with a
**zero-line diff** and drives the new model through a clean animation API.

Realism comes from geometry where cheap, and from texturing/lighting/post where
geometry is expensive. The body is **voxel-native** (this is a voxel game); the
photoreal eyes are the uncanny centerpiece.

---

## 1. CANONICAL REFERENCE (the image — ground truth)

- The seraphim has **NO humanoid body**. Its "torso" is a horizontal **band of seven
  eyes**: one enormous central eye (pale glacial-blue iris, dark pupil, bloodshot
  ivory sclera, fleshy ivory lids) flanked symmetrically by 3 progressively smaller
  eyes per side, embedded in a ridge of layered white plumage/flesh.
- **Six wings** in three mirrored pairs, moth/butterfly silhouette:
  1. **Upper pair** — huge, sweeping UP and OUTWARD in a V, feather tips splayed like
     grasping fingers.
  2. **Mid pair** — broad lateral wings projecting sideways/slightly down, moth-like,
     heavily layered.
  3. **Lower pair** — long drooping wings hanging DOWN like a torn robe/train,
     converging beneath the eye-band.
- **Coloration**: base ivory/bone-white (#f2ece4 → #d8cfc4), heavily stained with
  **rust/blood-red mottling** (#7e2c20, #a34433) concentrated at the core and inner
  feather rows, fading to clean white at wingtips. Feathers read as **torn parchment
  inscribed with dense red handwritten scripture** — signature texture feature. Tiny
  **ember/gold glints** (#d9902f) smolder in the core.
- **Mood**: floats in a blinding white cloudscape; overexposed, holy-dread,
  bloom-heavy, slight chromatic aberration; white fog toward #f5f1ea. A human on a
  rock ledge below gives colossal scale — read as **30–60 m wingspan** vs. a 1.8 m
  player.

**Image confirmed by orchestrator:** symmetric butterfly silhouette; two huge upper
wings in a V, two mid lateral wings, two lower draped wings converging below; a
horizontal band of 7 blue eyes with a dominant center eye; white feathers heavily
mottled rust-red toward the core, clean white at the tips; faint dense red text
across the plumage; a lone human on a rock ledge at the bottom for scale; blown-out
white cloud background.

---

## 2. THE WING — MODELING SPEC (highest priority; build first, perfectly)

One reusable, parameterized `buildWing(config)` in
`src/boss/seraphim/geometry/wing.js`. All six wings are instances with different
configs. Hyperrealistic (within voxel language), rigged for clean, unambiguous
animation.

### 2.1 Skeleton — 4 bones per wing
```
root(shoulder) → humerus → radius(forearm) → carpus(hand/primaries)
```
Rest-pose joint positions from a config array of 4 wing-local points. Use a manual
`Object3D` hierarchy + instancing (NOT SkinnedMesh) — cheaper, deterministic.

### 2.2 Leading-edge spline (mathematical backbone)
Catmull-Rom spline C(t), t ∈ [0,1], through the 4 joints. At any t:
tangent T(t) = C'(t)/‖C'(t)‖; wing-plane normal N config-supplied per
wing; binormal B(t) = T(t) × N = feather-growth direction. Gram–Schmidt
orthonormalize each sample to avoid frame twist.

### 2.3 Feather rows (what makes it read as real)
Four layered rows distributed along C(t), leading edge backward (S = wingspan):

| Row | Count | Length rule | Span on t |
|---|---|---|---|
| Lesser coverts | 28 | 0.06S | 0.05–0.95 |
| Median coverts | 22 | 0.12S | 0.10–0.95 |
| Secondaries | 16 | L(t) = 0.28S·(0.6 + 0.4t) | 0.15–0.62 |
| Primaries | 11 | L(t) = 0.42S·smoothstep(0.5,1,t)^0.7 + 0.18S | 0.62–1.0 |

Primary splay: per-feather yaw γ_i = γ_max·(i/n)^1.5 toward the tip
(grasping-fingers look). Feather placement:
P_i = C(t_i) + εr·B(t_i) + δ_row·N
with δ_row a small per-row normal offset (layering, no z-fighting) and
εr jitter. Orient via quaternion from basis (T, B, N) + per-row pitch.

### 2.4 Feather geometry — VOXEL-NATIVE, instanced
- One feather = a **merged voxel strip**: ~40–60 small boxes forming rachis + barbs +
  torn tip, with droop z(u) = k·u² along the quill, slight taper. Merge to ONE
  `BufferGeometry` (`BufferGeometryUtils.mergeGeometries`), **strip hidden interior
  faces**, origin at the quill root (pivot discipline). Scripture/parchment detail
  from the atlas (Section 5), 4 variants.
- **`THREE.InstancedMesh` per wing** (~77 instances = 1 draw call). Per-instance
  attributes: `aSegment` (bone index 0–3), `aRestQuat`+`aRestOffset`, `aPhase`,
  `aRow`, `aStain`.
- Animate **in the vertex shader**: 4 bone matrices as uniforms per wing; each
  instance transforms by its segment's bone matrix + shader flutter (2.6). CPU never
  touches feathers; GPU never re-uploads vertex data.

### 2.5 Flap — the traveling wave (directional, per wing)
Phase-lagged joint sinusoids so motion propagates root→tip:
θ_humerus = A1·sin(ωt), θ_radius = A2·sin(ωt − φ), θ_carpus = A3·sin(ωt − 2φ)
φ ≈ 0.6 rad. Downstroke faster than upstroke via time-warp
t' = t + β·sin(ωt), β ≈ 0.15/ω. Feather rachis pitch:
α_i(t) = α_max·sin(ωt − 2φ − κ·t_i) — open on upstroke, closed on downstroke.
Fold scalar fold ∈ [0,1]: θ = lerp(θ_anim, θ_folded, smoothstep(fold)).
ALL rotations composed as **quaternions**, blended by **slerp** — never euler-lerp.

### 2.6 Micro-motion
Vertex-shader tip flutter: Δ = a·u²·sin(ω_f·t + φ_inst) along the
feather normal, a ∝ length, ω_f ≈ 6–9 rad/s, phase from `aPhase`.

---

## 3. WING PLACEMENT (six wings)

All wings attach to an invisible core `Object3D` behind the eye-band. Mirror
left/right via negative-X root scale (fix winding if needed) — never duplicate
geometry. Core height ≈ H.

| Pair | Root offset | Base orientation | Character |
|---|---|---|---|
| Upper | (±0.15H, +0.35H, −0.05H) | pitch up ~55°, yaw out ~30°, span 1.2H | grasping V, dominant flappers |
| Mid | (±0.30H, 0, 0) | horizontal, yaw out ~80°, droop −10°, span 1.0H | moth-like, slow breathing sway |
| Lower | (±0.12H, −0.30H, +0.05H) | pitch down ~65°, span 1.3H, high droop k | hanging train, pendulum sway, near-zero flap |

Pair desync (synced wings look mechanical): upper ω; mid 0.6ω, phase
+π/3; lower 0.3ω, phase +π/2.

---

## 4. THE EYES — photo-based, seven on the band

### 4.1 Source texture
- Web-search/fetch a **hyperrealistic human blue-eye photo**, **minimum 1920×1080,
  JPEG preferred**, license-free (CC0/public domain: Unsplash, Pexels, Pixabay,
  Wikimedia Commons). Sharp iris focus, visible limbal ring, pale glacial blue.
- Save `assets/seraphim/eye/eye_source.jpg`; record URL + license in
  `assets/seraphim/eye/LICENSE.txt`.
- **Fallback**: best-possible procedural substitute at 2048² + loud TODO; loader must
  prefer the JPEG if present.

### 4.2 Processing (`tools/process-eye.mjs`, node + sharp/canvas)
1. Crop iris to centered square (hardcoded center+radius after inspection) →
   `iris_albedo.jpg` ≥ 1024².
2. Color-grade toward #7fb4c9 core → #4a7d94 rim; keep natural fiber detail.
3. Sclera texture from photo whites, tile-blended, + procedural capillaries
   (random-walk red strokes, alpha falloff from limbus) → `sclera_albedo.jpg` 2048².
4. `iris_bump.jpg` from luminance.

### 4.3 Geometry, placement, behavior
- Sclera sphere (roughness ~0.35); **concave** iris disc (correct parallax) with
  albedo+bump; transparent convex cornea cap (`MeshPhysicalMaterial`, transmission or
  clearcoat — specular catchlights buy enormous realism); lathe/torus lids, blink =
  lid scale-Y (close ~80 ms, open ~200 ms).
- 7 eyes on a gentle arc; central radius R, flanks R·0.55^|i|,
  i = ±1,±2,±3. Shared textures; vary per-eye tint ±5%, pupil dilation (iris
  UV scale), roughness.
- **Gaze**: quaternion look-at; flank eyes get **saccades** (retarget intervals from
  exponential distribution, mean 1.5 s, desynced; critically-damped spring snap) +
  micro-jitter. Central eye ALWAYS tracks the player, dead-steady. Blinks: Poisson,
  mean 4–7 s, never all at once — except the scripted `telegraph()` event: all eyes
  snap to player + simultaneous blink. That's the terror beat.

## 4B. CENTRAL-EYE LASER (visuals only; damage stays in behavior code)

- **Origin**: `laserSocket` empty parented at pupil depth of the central iris;
  `getWorldPosition/Quaternion` each frame. Beam emanates visibly from the PUPIL.
- **Aim**: while firing, central eye hard-locks (bypasses saccades).
  d̂ = (P_target − P_pupil)/‖·‖ with tracking-speed cap θ̇_max: slerp by
  min(1, θ̇_max·Δt / θ_err) so players can outrun the sweep.
- **Beam (2 additive layers MAX — hard cap)**: (1) core cylinder r≈0.08 m, white-hot
  emissive; (2) ONE thin glow sheath r≈0.20 m, fresnel falloff
  I = (1 − |N̂·V̂|)², tint #9fd8ff, depthWrite off. Muzzle flare + impact burst as
  single small sprites. Orientation: setFromUnitVectors((0,1,0), d̂); position at
  midpoint; scaleY = distance. Hit point via injected `raycastFn(origin, dir)`
  callback (no physics coupling). Life: scrolled noise UVs; pulse
  r(t) = r0·(1 + 0.15·sin40t).
- **Sequence**: charge (0.8s) — iris emissive ramps, pupil constricts, lids peel,
  auto-fires telegraph(). fire — sustained, tracking-capped. cooldown (0.4s) — beam
  collapses, afterglow, saccades resume.

---

## 5. CORE BODY, MATERIALS, LIGHTING, POST

- **Core**: ragged downward feather mass under the eye-band — reuse the feather
  instancing system, cone scatter, denser/smaller, heavy red staining.
- **MATERIAL BUDGET: 4 materials total.** (1) body/feathers — vertex-color stain
  (white→rust from `aStain` = f(distance from core)) + scripture atlas + wrap-lighting
  pseudo-SSS NdotL_wrap = (N·L + w)/(1 + w), w ≈ 0.5;
  (2) eyes — photo maps, sclera+iris; (3) cornea — transparent physical;
  (4) fx — laser/embers/flares (additive).
- **Scripture atlas** (`tools/gen-atlas.mjs`, 2048²): dense rows of faux handwriting
  (glyph-like strokes, red-brown ink #7e2c20, baseline jitter, varying opacity), torn
  edges, rachis+barb shading, 4 feather variants. This is the signature look.
- **OVERDRAW BUDGET: 20% of a normal allowance — be brutal.** Embers: ≤ 8 additive
  sprites (#d9902f, curl-ish drift). Laser: the 2 layers above, nothing more. No
  stacked transparent quads anywhere; all feather/body glow is emissive-on-opaque.
  Total simultaneous additive/transparent layers under any pixel ≤ 3.
- **Lighting** (add locally, don't fight global): strong white directional key
  above-behind (halo rim), hemisphere fill (sky #ffffff / ground #cfc5ba), one warm
  point light in the core.
- **Post**: bloom (UnrealBloomPass, threshold ~0.85, strength ~0.8), subtle chromatic
  aberration if a composer exists, white distance fog toward #f5f1ea. No composer →
  add one behind a config flag. (NOTE: the game ALREADY has EffectComposer + RenderPass
  + UnrealBloomPass + OutputPass — reuse it; the boss must not construct its own.)

---

## 6. ANIMATION API — integration seam (do not modify the AI)

See `seraphim-contracts.md` §API for the exact signatures. `class SeraphimModel` in
`src/boss/seraphim/index.js` exposes: setState, setFlapIntensity, setFold, lookAt,
telegraph, startLaserCharge, fireLaser, stopLaser, setLaserTrackingSpeed, onLaserHit,
update(dt, elapsed), object3d.

- States are **data presets** (joint amplitudes, ω, fold, lighting/fog/post
  overrides) blended over 0.4 s with smoothstep + quaternion slerp. No baked clips —
  everything procedural, hence loopable and interruptible mid-motion.
- Suggested mappings: stagger = fold snap 0.8 + 2 m drop with spring recovery;
  death = ω→0, fold→1, slow descent, eyes close one by one, embers extinguish.
- **Future states (structure for, don't build)**: `void` (all-white void, players on
  a small stone island, ring-out) and `fractal` (Section 10). Lighting/fog/post
  overrides MUST route through the preset system so these become data additions.
  The boss root must be cleanly fadeable against a fullscreen raymarch pass.
- **8→6 adapter**: existing behavior code references old wing/eye nodes via the seam
  in `seraphim-contracts.md` §SEAM. Provide `adapter.js` preserving those exact
  signal names/semantics. Behavior code diff = zero lines.

---

## 7. PERFORMANCE LAWS (hard — violations are rejected in review)

1. **Batching**: merge static parts; InstancedMesh for repeated movers. Whole boss
   **≤ 15 draw calls** (6 wing InstancedMeshes + core + 7 eye groups + fx + LOD).
2. **No vertex rewrites**: animate via transform hierarchy / bone-matrix uniforms;
   never re-upload BufferAttributes per frame.
3. **Pivot discipline**: every segment/feather origin at its rotation joint. Verify
   by sweeping fold 0→1 and all flap phases: no interpenetration, no drift.
4. **Bounding/culling**: analytic hit proxies only — 1 eye-band sphere + 6 wing OBBs
   updated from bone matrices; laser origin analytic (`laserSocket`). Never
   per-voxel raycasts.
5. **LOD mandatory**: `THREE.LOD` — near = full instanced detail; far = ONE
   pre-merged low-poly silhouette baked in 3 flap poses (pose-swap at distance).
6. **Materials ≤ 4** (as budgeted in Section 5). Vertex colors + atlas, never a
   material per voxel color.
7. **Overdraw at 20% budget**: ≤ 8 ember sprites, 2 laser layers, ≤ 3 additive/
   transparent layers under any pixel, emissive-on-opaque everywhere else.
8. **O(parts) updates**: per-frame CPU = ≤ 24 bone matrices + 7 gaze quaternions +
   laser aim. Flutter, feather pitch, stain resolve in-shader. Never O(voxels).
9. ≤ 150k triangles total; one 2048² feather atlas + eye set; 60 fps alongside the
   full game scene.

---

## 8. ACCEPTANCE CRITERIA

1. Dev harness `src/boss/seraphim/demo/boss-harness.html`: boss alone on white-fog
   background, orbit controls, lil-gui (ω, fold, flap intensity, state buttons,
   telegraph, laser charge/fire/stop, tracking speed).
2. Side-by-side vs. canon: silhouette (V-upper / lateral-mid / draped-lower), 7-eye
   band with dominant center, white→rust gradient, scripture visible at mid distance,
   colossal scale vs. a 1.8 m capsule on a ledge.
3. Laser visibly emanates from the central pupil; charge telegraph reads clearly;
   sweep is outrunnable at default tracking speed.
4. No z-fighting at any flap phase; no gimbal flips; state transitions interruptible
   anytime without pops.
5. All Section 7 laws verified (measured, not assumed).
6. Game boots with the new model; behavior code diff = zero lines.

---

## 10. FRACTAL DIMENSION — MATH PROTOTYPE (Agent D; no game integration)

Future state: the seraphim's body becomes a fractal encompassing the player's entire
reality inside a sphere. Prototype the math + standalone demo at
`experiments/fractal-demo.html` (+ `fractal.frag.glsl`).

- **Inward raymarch**: fullscreen quad; march p = o + t·d̂, step t += DE(p),
  hit at DE < ε·t, ~96 iterations cap; composite behind scene depth.
- **KIFS estimator** (primary; n ≈ 10–14 iterations): fold z ← |z|; then
  z ← R1·z, z ← s·z − c(s−1), z ← R2·z, with s ∈ [1.8, 2.8];
  DE(p) = (‖z_n‖ − b)/s^n. **Mandelbulb toggle** (alternative): power-k iteration
  with dr ← k·r^(k−1)·dr + 1, DE = ½·r·ln r / dr. Compare: KIFS =
  cathedral-of-wings, Mandelbulb = flesh.
- **Sphere inversion (the key trick)**: p' = R²/‖p‖²·p,
  DE_final(p) = DE(p')·‖p‖²/R²·0.5 (Lipschitz correction × safety — do NOT drop it).
  Inversion makes the fractal ENCLOSE reality; animate R(t) shrinking = reality
  being swallowed.
- **Orbit traps (keeps it a seraphim)**: eye trap τ_eye = min_n |‖z_n‖ − ρ| → shade
  irises where small, sampling the Agent-B iris JPEG with polar UVs
  (τ/τ_max, atan2(z_y, z_x)/2π); scripture trap τ_plane = min_n |z_{n,y}| → white
  striations tinted rust by iteration count. Palette locked to Section 1.
- **Shading**: normals via tetrahedron-gradient (4 taps), DE-cone soft shadows, AO
  from iteration count, fog e^(−σt) toward #f5f1ea, bloom stays.
- **Morph**: analytic SDF twin of the standard boss (~10 primitives, smooth-min
  smin(a,b,k) = −1/k·ln(e^(−ka) + e^(−kb)));
  DE_m = lerp(DE_boss, DE_fractal, m), cross-fade the mesh boss out over
  m ∈ [0, 0.3], animate inversion radius R(m) from huge → arena scale. Drive
  R1, R2 rotations at ≤ 0.05 rad/s (nausea limit).
