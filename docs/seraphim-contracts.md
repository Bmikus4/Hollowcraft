# SERAPHIM BOSS — CONTRACTS (interfaces & hard law)

> Read `seraphim-canon.md` first for the aesthetic/spec. This document is the
> BINDING technical interface. Every module name, function signature, attribute
> name, and uniform name below is a CONTRACT. Do not rename or restructure them —
> other agents build against these exact names with fresh context and cannot see
> your code. Deviations are rejected in review. If a contract is genuinely wrong,
> report it back with justification; do NOT silently change it.

---

## HOW THE PROJECT LOADS (critical — read carefully)

Hollowcraft is a SINGLE file `index.html` at the repo root. It has NO bundler. It
loads Three.js via a **document importmap**:

```html
<script type="importmap">
{ "imports": { "three": "./vendor/three.module.js", "three/addons/": "./vendor/jsm/" } }
</script>
```

Consequences:
- Your modules under `src/boss/seraphim/**` MUST use bare specifiers:
  `import * as THREE from 'three';`
  `import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';`
  `import { OrbitControls } from 'three/addons/controls/OrbitControls.js';`
  `import { GUI } from 'three/addons/libs/lil-gui.module.min.js';`
  These resolve via the DOCUMENT importmap at runtime — no build step, no relative
  path to vendor from inside your .js modules.
- **Standalone demo harnesses** (`src/boss/seraphim/demo/*.html`,
  `.../experiments/*.html`) are their OWN html documents, so each needs its OWN
  importmap pointing at the vendored three with the correct relative depth. From
  `src/boss/seraphim/demo/` the repo root is four levels up:
  ```html
  <script type="importmap">
  { "imports": {
      "three": "../../../../vendor/three.module.js",
      "three/addons/": "../../../../vendor/jsm/"
  } }
  </script>
  ```
  Then `<script type="module">import {SeraphimModel} from '../index.js'; ...</script>`.
- Confirm addon files exist under `vendor/jsm/` before importing them
  (`ls vendor/jsm/...`). If `lil-gui` is not vendored, vendor it into
  `vendor/jsm/libs/` yourself (copy from node_modules or fetch the matching version)
  and note it in your report. Do the same for OrbitControls if missing.
- **Serve over http to test** (ES modules + fetch need http, not file://). From the
  repo root: `python -m http.server 8099` (or `npx serve`) then open
  `http://localhost:8099/src/boss/seraphim/demo/<harness>.html`. Playwright-core is
  installed in the repo for headless render checks if you script one.

---

## FILE OWNERSHIP MAP (create/modify ONLY your files)

```
Agent A (Wave 1)  src/boss/seraphim/geometry/feather.js
                  src/boss/seraphim/geometry/wing.js
                  src/boss/seraphim/demo/wing-harness.html
Agent B (Wave 1)  tools/process-eye.mjs
                  assets/seraphim/eye/*            (eye_source.jpg, iris_albedo.jpg,
                                                    sclera_albedo.jpg, iris_bump.jpg,
                                                    LICENSE.txt)
                  src/boss/seraphim/geometry/eye.js
                  src/boss/seraphim/demo/eye-harness.html
Agent C (Wave 1)  src/boss/seraphim/materials/*   (bodyMaterial.js, corneaMaterial.js,
                                                    eyeMaterial.js, fx.js, index.js)
                  assets/seraphim/atlas/*          (scripture atlas PNGs)
                  tools/gen-atlas.mjs
                  src/boss/seraphim/materials/material-harness.html
Agent D (Wave 1)  src/boss/seraphim/experiments/fractal-demo.html
                  src/boss/seraphim/experiments/fractal.frag.glsl
                  docs/fractal-notes.md
Agent E (Wave 2)  src/boss/seraphim/index.js
                  src/boss/seraphim/animation/*    (rig.js, presets.js, laser.js)
                  src/boss/seraphim/demo/boss-harness.html
Agent F (Wave 2)  index.html  (ONLY the seam functions listed in §SEAM + one import)
                  src/boss/seraphim/adapter.js
Agent G (Wave 3)  docs/seraphim-audit.md  (read-mostly; touch nothing else)
```

Never edit another agent's files. If you need a change in one, report it.

---

## SHARED CONTRACT: feather instancing

`buildWing(config)` returns `{ group, instancedMesh, bones, feats, boundsUpdate }`
where:
- `group` : `THREE.Group` — the wing root (attach point = shoulder pivot at origin).
- `bones` : `[root, humerus, radius, carpus]` — `THREE.Object3D[]`, a parented chain;
  `bones[0]` is `group` or a child at origin. Rest pose from `config.joints`.
- `instancedMesh` : ONE `THREE.InstancedMesh` (all ~77 feathers) = 1 draw call.
- `feats` : per-feather metadata array (CPU side, for bounds/debug only — NOT touched
  per frame).
- `boundsUpdate()` : recomputes the wing OBB from current bone matrices (called by
  assembly for hit proxies).

`config` shape (all six wings are instances of this):
```js
{
  side: +1 | -1,                 // mirror via negative-X handled by caller's root scale
  span: Number,                  // S (world units)
  normal: [x,y,z],               // wing-plane normal N (unit)
  joints: [[x,y,z] × 4],         // wing-local rest positions: root,humerus,radius,carpus
  flap:  { omega, ampHumerus, ampRadius, ampCarpus, phase, phi:0.6, beta },
  droopK: Number,                // feather quill droop coefficient k in z(u)=k·u²
  fanScale: Number,              // tightens the primary fan (grasping fingers)
  variantSeed: Number            // picks atlas feather variants deterministically
}
```

### Per-instance attributes (EXACT names — the material's vertex shader reads these)
Set via `InstancedBufferAttribute` on the instanced geometry:
- `aSegment`  : float, bone index 0..3 (which bone matrix transforms this feather)
- `aRestOffset` : vec3, feather root offset in that bone's local space
- `aRestQuat` : vec4, rest orientation quaternion (x,y,z,w) of the feather
- `aPhase`    : float, per-instance flutter phase (radians)
- `aRow`      : float, 0=lesser covert,1=median covert,2=secondary,3=primary
- `aStain`    : float, 0..1 stain weight (0=white tip → 1=rust core); drives vertex color
- `aLen`      : float, feather length (flutter amplitude ∝ this)

`InstancedMesh.instanceMatrix` is NOT used for animation (kept identity or rest);
animation is bone-matrix + shader. If you must use instanceMatrix for static rest
placement, document it and keep it static (never per-frame write).

### Bone-matrix uniforms (EXACT names — vertex shader skinning)
The wing material exposes a uniform:
- `uBones` : `mat4[4]` — the 4 world-or-model-space bone matrices for THIS wing,
  written once per frame by the rig (4 mat4 = 1 tiny upload, allowed; this is NOT a
  BufferAttribute upload). The shader picks `uBones[int(aSegment)]`.
- `uTime`  : float — elapsed seconds (flutter + rachis pitch).
- `uFlutterFreq` : float (≈6–9).
Each wing has its own material instance OR shares one program with per-wing uniform
values — Agent C decides, but the uniform NAMES above are fixed.

---

## SeraphimModel PUBLIC API (Agent E owns `index.js`; everyone builds to this)

```js
class SeraphimModel {
  constructor(opts)          // opts: { renderer, camera, scene?, quality?, raycastFn? }
  object3d                   // THREE.Object3D — the root; caller adds to their scene/group
  laserSocket                // THREE.Object3D — parented at central pupil depth (beam origin)

  setState(name)             // 'idle'|'aggro'|'attack_windup'|'attack'|'stagger'|'death'
  setFlapIntensity(x)        // 0..1 → scales ω and amplitudes
  setFold(x)                 // 0..1
  lookAt(worldPos)           // THREE.Vector3 gaze target for all eyes
  telegraph()                // all-eyes snap to target + simultaneous blink
  startLaserCharge()         // begin 0.8s charge (iris ramp, pupil constrict, lids peel)
  fireLaser(getTargetPos)    // getTargetPos:()=>THREE.Vector3 ; sustained tracking-capped beam
  stopLaser()                // enter 0.4s cooldown, collapse beam
  setLaserTrackingSpeed(radPerSec)
  onLaserHit(cb)             // cb(worldPoint:Vector3, normal:Vector3) each connected frame
  setQuality(level)          // optional: 'high'|'low' LOD hint
  update(dt, elapsed)        // dt seconds, elapsed seconds — call once per frame
  dispose()                  // free geometry/textures/materials
}
```
- All state transitions blend over ~0.4 s (smoothstep + slerp), interruptible.
- Presets are DATA (`animation/presets.js`): per-state joint amplitudes, ω, fold,
  and OPTIONAL `lighting`/`fog`/`post` override hints (so future `void`/`fractal`
  states are pure data additions). `update()` applies the blended preset.
- The model reuses the caller's composer/bloom; it must NOT create its own
  EffectComposer. Local lights (key/hemi/point) are added under `object3d`.

---

## §SEAM — the integration contract (Agent F; ZERO behavior diff)

The game's boss AI lives in `index.html` and MUST NOT change its logic. It touches
the visual layer ONLY through the functions and signals below. Agent F replaces the
BODIES of these functions (and adds one import) so they delegate to a SeraphimModel
instance held in `adapter.js`. Keep every NAME and SIGNATURE identical.

**Functions whose bodies Agent F may rewrite (index.html):**
```
applyBossVisual(on)              // build/show or hide the model; on=true instantiates
                                 // SeraphimModel, adds to wretch.group, sets the
                                 // compat signals below; on=false hides + restores skin
animateBossRig(dt)               // maps signals→API each frame then seraph.update(dt,elapsed):
                                 //   seraph.lookAt(camera.position)
                                 //   seraph.setFlapIntensity(_bossMode swoop=1/orbit=.6/hover=.4)
                                 //   drive charge/beam visuals from wretch._eyeFlare
showBossBeam(ex,ey,ez,ax,ay,az)  // render beam from (ex,ey,ez)→(ax,ay,az) via model fx
hideBossBeam()
showBossRing(a,charge)           // ground telegraph ring at a={x,y,z}, charge∈seconds
hideBossRing()
buildBossWings()                 // legacy builder — may return the model root or a stub
buildSeraphEyeRig(R)             // legacy builder — may return a compat object
```
Also present as callers (do NOT change their logic, only that the functions they call
still exist with these signatures): `summonBoss(x,y,z)` (index.html ~7302), net-guest
handlers (~3661, ~3741–3750), death cleanup (~7065–7069), body pitch/roll apply
(~4878). The tex-builder helpers (`bossSkinTex`, `woolTex`, `scleraTex`, `irisTex`,
`beamTex`, `buildEyeball`, `ensureBossBeam`, `ensureBossRing`, `bossLaser`) belong to
the old visual layer and may be removed/left dormant — but ONLY if nothing outside the
boss references them (grep first).

**Signals on the global `wretch` object that MUST keep working (adapter preserves):**
| Signal | Direction | Meaning | New binding |
|---|---|---|---|
| `wretch._bossWings` | set by applyBossVisual, `.visible` toggled | model root | = `seraph.object3d` (or wrapper with `.visible`) |
| `wretch._eyeRig` | read by bossUpdate | eye rig | compat obj: `{ userData:{ core, all }, visible, position }` |
| `wretch._eyeRig.userData.core` | read | central eye Object3D | = `seraph.laserSocket` (has `getWorldPosition`) |
| `wretch._eyeFlare` | set by bossUpdate 0..1 | laser charge glow | read in animateBossRig → drive charge/glow |
| `wretch._bossMode` | set by bossUpdate | 'swoop'/'orbit'/'hover' | → setFlapIntensity / setState hint |
| `wretch._bossPitch`,`_bossRoll` | set by bossUpdate, applied @4878 | body lean | UNCHANGED (applies to wretch.group, not model) |
| `wretch._prevSkinMap` | set/read by applyBossVisual | restore body skin | preserve restore behavior |

Anchor facts: model attaches to `wretch.group`; eye-band local y ≈ `BOSS_WING_CY`
(=1.7); boss body scale = `WRETCH_DEMON_SCALE`(1.52)`*2.0`. The model's own internal
scale should make a ~30–60 m wingspan read correctly once placed under that scale —
expose a `constructor` scale/opts knob and document the number you pick.

**Definition of zero-diff:** `git diff index.html` shows changes ONLY inside the
bodies of the functions listed above (plus one `import` line near the top module
imports). No line inside `bossUpdate`, `summonBoss` logic, net handlers, or HORROR
integration changes. Agent G verifies this with a line-scoped diff.

---

## PERFORMANCE LAWS (HARD — from canon §7; reproduced as binding law)

1. Whole boss ≤ **15 draw calls**.
2. No per-frame BufferAttribute uploads. Bone-matrix uniforms only (≤ 24 mat4/frame).
3. Every feather/segment origin at its rotation joint (pivot discipline).
4. Analytic hit proxies only (1 sphere + 6 OBBs + laserSocket). No per-voxel raycast.
5. `THREE.LOD` mandatory: near = full instanced; far = ONE merged 3-pose silhouette.
6. ≤ **4 materials** total (body, eye, cornea, fx). Vertex colors + atlas.
7. Overdraw ≤ 20% budget: ≤ 8 ember sprites, 2 laser layers, ≤ 3 additive layers/pixel.
8. O(parts) per-frame CPU only. Flutter/pitch/stain in-shader.
9. ≤ **150k triangles**, one 2048² feather atlas + eye set, 60 fps with the game scene.

---

## §CROSS-AGENT SHADER INTERFACE (A ↔ C must interoperate)

The feather look = Agent A's vertex transform + Agent C's surface shading, composed in
ONE program (the body material, ≤4-material budget). To let A and C build in parallel:

- **Agent A owns the VERTEX stage** (rig skinning + flutter). `geometry/wing.js`
  exports a GLSL chunk string `WING_SKIN_VERTEX_GLSL` and a helper
  `applyWingShader(material, { getBones })` that injects it via `onBeforeCompile`
  (works on a `MeshStandardMaterial`/`MeshPhysicalMaterial` base). The vertex chunk:
  reads `aSegment,aRestOffset,aRestQuat,aPhase,aRow,aStain,aLen` + `uBones[4],uTime,
  uFlutterFreq`; transforms the feather; and MUST write these varyings for the
  fragment stage:
  - `varying float vStain;`   // = aStain
  - `varying vec2  vAtlasUv;`  // atlas UV (see layout below), already mapped to the
                               //   feather's variant cell
  - `varying vec3  vWorldNormal;`
  - `varying vec3  vWorldView;` // normalize(cameraPosition - worldPos)
- **Agent C owns the FRAGMENT stage** (`materials/bodyMaterial.js`): consumes those
  varyings — samples the scripture atlas at `vAtlasUv`, mixes ivory→rust by `vStain`,
  applies wrap-SSS `NdotL_wrap=(N·L+w)/(1+w)`, emissive-on-opaque glints. C imports
  `applyWingShader` + `WING_SKIN_VERTEX_GLSL` from A and calls it on its material.
- In Wave 1, A ships a self-contained placeholder fragment (vertex-color by vStain) so
  `wing-harness.html` renders standalone; C ships the real fragment tested on a simple
  instanced quad set that declares the same attributes/varyings. Agent E composes them.

## §SCRIPTURE ATLAS LAYOUT (A ↔ C must agree)

- Atlas is 2048², a **2×2 grid of four feather variants**, each variant = one 1024²
  cell. Variant `v ∈ {0,1,2,3}` occupies cell (col = v & 1, row = v >> 1), i.e. UV
  origin `(col*0.5, row*0.5)`, size `0.5×0.5`.
- Each cell holds ONE feather's worth of art oriented quill-root→tip along +V (v axis),
  rachis centered on U=0.5: torn parchment, dense red handwritten-scripture strokes
  (#7e2c20), barb shading, alpha=0 outside the torn silhouette (so feathers read as
  torn, not rectangular).
- Agent A maps each feather's surface UV into its assigned cell (pick variant from
  `variantSeed`): `vAtlasUv = vec2(col*0.5,row*0.5) + localUv*0.5`, `localUv ∈ [0,1]²`
  across the feather quad. Agent C draws the 4 cells to match this convention.
- Guaranteed-offline path: the atlas draw routine is a PURE function usable both in
  `tools/gen-atlas.mjs` (bake a PNG for inspection) AND at runtime on a canvas
  (`new THREE.CanvasTexture`). The RUNTIME canvas path is the shipping path (matches
  the game, which generates every texture at runtime — no external files needed). Bake
  the PNG if tooling allows; the loader/material must work with runtime generation
  even if the PNG is absent.

## §WAVE 1 OUTCOMES — authoritative interfaces (Wave 2 builds on THESE real facts)

All four Wave-1 agents shipped and verified headless on real GPU (RX 5700 XT). The
following supersedes/refines the planning-time contract where they differ.

**Real file inventory:**
- geometry/feather.js — `buildFeather(opts)` → merged voxel BufferGeometry (~276 tris @50 voxels, interior faces stripped), per-vertex `localUv∈[0,1]²`, 4 variants.
- geometry/wing.js — `buildWing(config)` → `{group,instancedMesh,bones:[root,humerus,radius,carpus],feats,boundsUpdate}`; exports `WING_SKIN_VERTEX_GLSL`, `applyWingShader(material,{getBones})` (CHAINS any existing onBeforeCompile), `makePlaceholderWingMaterial`. 1 draw call/wing.
- geometry/eye.js — `buildEye(opts)`, `buildEyeBand(opts)`, `setGazeTarget(worldPos)`, `telegraphBlink()`, `update(dt,elapsed)`, exposes `laserSocket` (Object3D at central pupil). Blink = lid ROTATION (1-DOF). Cornea = clearcoat (NOT transmission). Pupil dilation via per-instance `aUvScale` (onBeforeCompile).
- materials/{atlas.js(THREE-free drawAtlas),bodyMaterial.js,corneaMaterial.js,eyeMaterial.js,fx.js,index.js}. `buildBodyMaterial({getBones})` composes A's vertex stage. `makeAtlasTexture()` = runtime CanvasTexture (shipping path). fx: `makeBeam()/updateBeam(origin,target,elapsed)`, `makeEmbers()`, `makeFx()`, driven by per-instance `aFxMode`. `addSeraphLighting(target)` = key/hemi/core-point rig (no composer). `eyeMaterial.js` accepts B's sclera/iris/bump maps.
- experiments/* + docs/fractal-notes.md — isolated; loader auto-prefers B's `assets/seraphim/eye/iris_albedo.jpg` (now present).

**Real per-instance attribute set (whole feather system):**
`{aSegment, aRestOffset, aRestQuat, aPhase, aRow, aStain, aLen, aVariant}` + per-vertex `localUv`.
**Real wing uniforms:** `uBones` (mat4[4]), `uTime`, `uFlutterFreq`, `uFlapPhase`, `uRachisAmp`.
**Real fragment varyings (A writes, C reads):** `vStain, vAtlasUv, vWorldNormal, vWorldView`.

**Eye assets present:** `assets/seraphim/eye/{eye_source.jpg 4898×3265, iris_albedo.jpg 1024², sclera_albedo.jpg 2048², iris_bump.jpg 1024², LICENSE.txt}` (Pexels License, documented).

## §WAVE 2 MANDATES — Agent E MUST reconcile the whole-boss budgets

Wave-1 parts each met their own spec but their SUM violates three whole-boss laws.
Assembly's core job is to consolidate. These are HARD acceptance gates:

1. **DRAW CALLS ≤ 15 (law 1).** Standalone eyes = 10 dc; that + 6 wings already = 16.
   FIX: fold ALL 7 eyes into ≤5 shared InstancedMeshes (central eye becomes an
   instance in the flank batches — one InstancedMesh per component: sclera, iris,
   cornea, lidU, lidL — 5 dc for all 7 eyes). Target ledger: 6 wings + 5 eyes + 1 core
   mass + ≤2 fx = 14. LOD is a SWAP (near XOR far), not additive.
2. **MATERIALS ≤ 4 whole-boss (law 6).** Consolidate B's standalone eye materials into
   the global four: lids → body material (#1); sclera + iris → eyes material (#2, feed
   B's baked maps into C's `eyeMaterial.js`); cornea → #3; fx → #4. NO 5th material.
3. **TRIANGLES ≤ 150k (law 9).** Standalone wings 127k + eyes 51k = 178k, over budget
   BEFORE the core mass. FIX: reduce feather voxel count (~40 not 50) and/or trim
   lesser-covert row count; drop eye sphere segments (e.g. 16×12 → 12×8, shared
   low-poly geometry across all 7); keep the core feather mass ≤ ~10k tris. MEASURE
   `renderer.info.render.triangles` in the assembled boss and report the number.
4. **LASER:** beam origin = B's `laserSocket` (`getWorldPosition`); render via C's fx
   `makeBeam/updateBeam`. Charge/telegraph = B's central-eye emissive ramp + pupil
   constrict + lid peel (already in eye.js) + all-eyes `telegraphBlink()`.
5. **LOD:** `THREE.LOD` — near = full assembled instanced boss; far = ONE pre-merged
   low-poly silhouette baked in 3 flap poses (pose-swap at distance).
6. Report the FINAL measured ledger (draw calls, triangles, material count) from the
   assembled `boss-harness.html` — Agent G will independently re-measure.

## REPORTING RULES (every agent, at end of run)

Report back exactly:
1. **Files written** (paths).
2. **Contract deviations** — any name/signature/attribute you could not honor, with
   justification. (Prefer reporting over silently changing.)
3. **Definition-of-done check** — the exact command/URL you ran and what you observed
   (draw calls, triangle count, fps if measurable, screenshot path if rendered).
4. **Known weaknesses** — what is fragile, faked, or unverified.
Do NOT write handoff/status/summary markdown files beyond your owned deliverables.
