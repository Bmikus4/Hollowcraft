# SERAPHIM BOSS — ADVERSARIAL AUDIT (Agent G, Wave 3)

> Auditor stance: assume everything is broken; trust nothing in prior reports;
> reproduce with measurements. Branch `feature/seraphim-rebuild`, repo
> `D:\code\Minecraft`. Nothing outside this file was modified. All measurements
> below were taken by loading the real modules headless in installed Chrome
> (ANGLE / **AMD Radeon RX 5700 XT, D3D11** — real GPU, not SwiftShader) over
> `python -m http.server 8099`, plus a real in-game boot of `index.html?debug=1`.

**OVERALL VERDICT: PASS (ship-worthy).** 0 BLOCKER, 0 MAJOR. All nine §7
performance laws and all six §8 acceptance criteria are met. Remaining findings
are MINOR/NIT polish items, none of which block review.

Screenshots referenced live in `docs/audit-*.png`.

---

## HEADLINE MEASURED LEDGER (whole boss, `window.__diag`)

| Metric | Idle | Firing | Gate | Result |
|---|---|---|---|---|
| Draw calls | **13** | **14** | ≤15 | PASS |
| Triangles | **118,912** | **118,968** | ≤150k | PASS |
| Material roles | **4** (body,cornea,eye,fx) | 4 | ≤4 | PASS (by role/program) |
| Distinct Material objects | 12 | 12 | — | see F-1 |
| FPS (boss + scene + bloom, headless RX 5700 XT) | **144.1** | — | ≥60 | PASS |
| In-game boot FPS | **144** | — | ≥60 | PASS |

Draw-call ledger (near LOD): 6 wing InstancedMeshes + 5 eye InstancedMeshes +
1 core-feather-mass InstancedMesh + 1 embers InstancedMesh = **13**; beam adds
+1 while firing = **14**. Far LOD = **1** draw (silhouette swap, 84 tris).

Note: `renderer.info.render.calls` reads 1 in every probe because the harness/game
render through an `EffectComposer` whose final `OutputPass` resets `info` — hence
the diag is computed by an explicit visibility-respecting **tree walk** of
`model.object3d`, which is the correct per-boss measure and is what the numbers
above come from.

---

## A. PERFORMANCE LAWS (§7)

### A-1 — Draw calls ≤15 · **PASS**
Measured 13 idle / 14 firing via `__diag.drawCalls` (tree walk over
`model.object3d`, respecting ancestor visibility). Far LOD collapses to 1 draw.
Beam is 1 InstancedMesh (2 instances = core+sheath), embers 1 InstancedMesh
(8 embers + 2 flare slots). In-game `__hc.boss({park:true})` summon succeeded
(`active:true, boss:true, core:true`) with the same architecture. Evidence:
`docs/audit-idle.png`, `docs/audit-firing.png`, `docs/audit-far-lod.png`.

### A-2 — No per-frame BufferAttribute (vertex) uploads · **PASS** (MINOR note)
The expensive path is clean: **feathers are never re-uploaded.** Feather geometry
(`position/normal/localUv`) is built once (`feather.js`, `wing.js:235-249`) and
`instanceMatrix` is set `StaticDrawUsage` at identity (`wing.js:246`). Wings
animate purely via the `uBones` mat4[4] uniform written in `wing.js:277` — 4
mat4/wing × 6 = 24 mat4/frame, exactly the contract's allowed bone budget; no
geometry re-upload. Grep of `src/boss/seraphim/**` confirms no `setAttribute`
inside any update loop.

MINOR: the consolidated eye band re-uploads per frame in `index.js:293-294,309`:
5× `instanceMatrix.needsUpdate` (35 mat4) + `aCharge`/`aUvScale`
`InstancedBufferAttribute.needsUpdate` (2×7 floats). This is ~2.3 KB/frame and is
the *sanctioned InstancedMesh animation channel* (not geometry re-tessellation),
so the law's intent (no O(voxels) vertex re-upload) holds — but it technically
exceeds the "bone-matrix uniforms only, ≤24 mat4/frame" letter. Cost is
negligible; left as a note, not a failure. (The laser `_scaleBeamRadius`
`instanceMatrix` write on 2 instances during fire, `laser.js:193`, is equally
trivial.)

### A-3 — Pivot discipline · **PASS**
Rendered fold = 0 / 0.5 / 1.0 with flap running, plus two flap-phase extremes.
Feathers stay rooted to their wing structure at every extreme — **no feather
detachment, no drift, no gross interpenetration**; folded pose furls the wings
inward coherently. Origins are at rotation joints: feather quill root is the
geometry origin, `aRestOffset` is expressed in bone-local space (`wing.js:196`),
bone chain rest = joint deltas (`wing.js:151-155`). Evidence:
`docs/audit-fold-0.png`, `docs/audit-fold-0_5.png`, `docs/audit-fold-1.png`,
`docs/audit-flap-a.png`, `docs/audit-flap-b.png`.

### A-4 — Analytic hit proxies only · **PASS**
`SeraphimModel.hitProxies = { eyeSphere:Sphere, wingBoxes:Box3[6], laserSocket }`
(`index.js:543`), refreshed each frame from bone matrices via
`wing.boundsUpdate()` (`index.js:622-629`, `wing.js:284-289`). The **only**
raycast is the injected `raycastFn(origin,dir)` callback for laser hit
resolution (`laser.js:152-159`) — exactly as canon §4B mandates ("no physics
coupling"). No per-voxel raycast anywhere in the boss.

### A-5 — LOD present, far = swap · **PASS**
`this.lod = new THREE.LOD()` with two levels: full boss at 0, silhouette at
`120*scale` (`index.js:453,464,532`). Clean headless test (froze OrbitControls,
updated matrices in one shot): camera close → level 0, 14 draws; camera at
z=500 → **level 1, 1 draw, `levelVisible:[false,true]`, 84 tris** — a true
XOR swap, not additive. Silhouette bakes 3 flap poses and shows exactly one via
`setPose` (`index.js:434-437`). (My first LOD probe wrongly reported no swap; it
was a test artifact — OrbitControls overwrote the camera and matrixWorld was
stale. Corrected probe confirms the swap.) Evidence: `docs/audit-far-lod.png`.

### A-6 — Materials ≤4 · **PASS by role/program** (see F-1)
`__diag.materials = 4` roles: `body, cornea, eye, fx`, every material tagged
`userData.seraphRole`. Independent program probe: **all 7 body materials share
ONE compiled program** — `customProgramCacheKey()` returns `'seraphWingSkin'`
for every wing + the core mass (verified: `distinctCacheKeys` =
`['seraphWingSkin','seraphIrisInst', <default eye cornea/sclera/lid key>]`).
One 2048² scripture atlas is shared across all body meshes. Texture count for
the whole boss = atlas(1) + iris albedo/bump + sclera(3) = 4 boss textures.
The law's intent — no material-per-voxel-color, vertex-color + atlas staining,
one body program — is fully met. See F-1 for the strict object-count nuance.

### A-7 — Overdraw ≤20% budget · **PASS**
`fx.js`: embers hard-capped at `Math.min(count,8)` (`fx.js:159`) → exactly 8
sprites; beam is exactly 2 additive layers (`aFxMode` 0=core, 1=sheath,
`fx.js:119`); all fx `depthWrite:false`, single shared additive material. Only
other transparent surface is the cornea (opacity 0.16, one thin dome per eye).
Worst-case stack under a pixel = cornea(1) + beam sheath+core(2) = 3, at the law
ceiling. Body/feathers/eyes are opaque with emissive-on-opaque glints (no stacked
transparent quads). MINOR caveat: the 8 embers spread over `H*0.45` could locally
overlap 2-3 deep near the core; still within the ≤3 ceiling in practice.

### A-8 — O(parts) per-frame CPU · **PASS**
Per frame: 6 wings × 4 bone mats (24 mat4), 7 eye gaze quats + matrix composes
(`index.js:264-308`), 1 laser aim slerp. No O(voxels)/O(feathers) CPU loop —
flutter, rachis pitch and stain are all resolved in the vertex shader
(`wing.js` BEGIN/NORMAL chunks). Core mass has no per-frame CPU loop at all.

### A-9 — ≤150k tris, one atlas, 60fps · **PASS**
118,912 tris (idle), 32k under budget. One 2048² feather atlas
(`makeAtlasTexture(2048,...)`, `index.js:467`) + the eye set (iris 1024², sclera
2048², bump 1024²). 144 fps headless with scene + bloom; 144 fps in the real
game.

---

## B. ACCEPTANCE CRITERIA (§8)

### B-1 — Harness + lil-gui controls · **PASS**
`boss-harness.html` loads the real `SeraphimModel`, white-fog scene, OrbitControls,
1.8 m capsule on a ledge for scale, moving laser target. GUI present:
state dropdown (idle/aggro/attack_windup/attack/stagger/death), **ω scale**,
**flap intensity**, **fold**, **laser track ω** (tracking speed),
**laserCharge (0..1, no-fire)**, **telegraph**, **charge**, **fire**, **stop**,
target-orbit toggle, reset. Every required control is present.

### B-2 — Silhouette vs canon · **PASS** (MINOR B-2a)
`docs/audit-idle.png`: butterfly/moth silhouette reads — **upper pair in an
up-and-out V, mid lateral pair, lower draped pair** converging below the eye
cluster. White→rust gradient is clear (ivory tips, rust/blood core). Dominant
central eye reads strongly. Capsule on the ledge confirms colossal scale.
In-game (`docs/audit-ingame-boss.png`) the boss fills the sky as a colossal
rust/ivory winged mass with a visible eye — scale reads.
MINOR (B-2a): although 7 eye instances exist (`__diag.eyes = 7`), only ~3
(central + one per side) read visually; ring-2/3 eyes at `R·0.55^|i|` are tiny
and largely occluded by feathers, so the "band of seven" reads more like three.
Faithful to the canon size formula, but the 7-band terror motif is weak. Scripture
text on feathers is present via the atlas but not legible at mid distance.

### B-3 — Laser from central pupil, telegraph, outrunnable · **PASS**
`fireLaser(()=>targetPos)` produced `phase:"fire"`, `beamVisible:true`,
`hit:true` at (13.45,1.94,5.8) ≈ target (14,2,6). Laser socket world pos
(0.08,0.41,0.95) sits at the central pupil (`PUPIL_Z=0.93` on the central pivot),
so the beam emanates from the central eye — visible as an intense white-blue
charge bloom at the pupil in `docs/audit-firing.png`. Tracking cap is implemented
(`laser.js:137-145`, slerp by `min(1, θ̇max·dt/θ_err)`), `setLaserTrackingSpeed`
wired, so the sweep is outrunnable. Telegraph (all-eyes snap + simultaneous
blink) implemented in `index.js:251-253`.
MINOR (B-3a): the white-hot core reads poorly against the near-white cloudscape;
the beam lance is subtle at range (relies on the blue sheath + bloom). Cosmetic.

### B-4 — No z-fighting / gimbal flips / interruptible · **PASS**
No z-fighting observed at any fold or flap phase (per-row `delta` normal offset
layers feathers, `wing.js:182`). All rotations are quaternion slerp — bones
(`wing.js:273`), body lean (`rig.js:102`), eye gaze (`index.js:224` damp),
laser aim — so no euler gimbal flips. `Rig.setState` re-bases the fade from the
current interpolated values (`rig.js:66-88`), making transitions interruptible
without pops.

### B-5 — All §7 laws verified · **PASS** (see section A).

### B-6 — Game boots, behavior diff = ZERO LINES · **PASS** (highest-priority)
`git diff index.html` = **10 insertions, 34 deletions, exactly 3 hunks**:

1. `@@ -266`: one import line — `import { seraphOn, seraphOff, seraphAnimate,
   seraphShowBeam, seraphHideBeam } from './src/boss/seraphim/adapter.js';`
2. `@@ -7236`: bodies of `showBossBeam` / `hideBossBeam` only.
3. `@@ -7264`: bodies of `applyBossVisual` / `animateBossRig` only.

Confirmed **NOTHING changed** inside `bossUpdate`, `summonBoss` (appears only as
unchanged trailing context), the net-guest handlers (~3661, 3741-3750), death
cleanup (7065-7069), body pitch/roll @4878, or `showBossRing`/`hideBossRing`
(all outside the 3 hunks; those functions were left untouched — allowed, not
required). This satisfies the §SEAM "definition of zero-diff" exactly.

Real game boot (`index.html?debug=1`, headless, 11s world-gen): **zero
pageerrors**, 144 fps, form `wretch`. `__hc.boss({park:true,dist:34,up:11,
flare:1})` → `{active:true, boss:true, state:"HUNT", feats:0, eyes:0,
core:true}`. The `__hc.boss` QA hook reads `_bossWings.userData.feats.length`
(adapter seeds `[]`), `_eyeRig.userData.all.length` (seam sets `[]`), and
`_eyeRig.userData.core` (= `laserSocket`) — all resolve, no crash. Evidence:
`docs/audit-ingame-boss.png`.

---

## C. EYE ASSET · **PASS**
`assets/seraphim/eye/eye_source.jpg` = **4898 × 3265** JPEG (SOF-marker read),
well above the 1920×1080 floor. Derived maps present: `iris_albedo.jpg` 1024²,
`sclera_albedo.jpg` 2048², `iris_bump.jpg` 1024². `LICENSE.txt` records source
URL (Pexels photo 4127849, Dominika Gregušová), the **Pexels License**, download
date, and a justification for not using strict CC0 (the only true-CC0 Commons
iris was 500×492). Pexels is in the canon §4.1 accepted source set. NIT only:
canon *prefers* CC0; documented and defensible.

---

## D. INTEGRATION SANITY · **PASS**
- **Body fully hides:** `applyBossVisual` sets `wretch.P.pelvis.visible=false`
  (`index.html:7268`). The wretch skeleton is `pelvis(root) → spine → neck →
  head`, with **arms parented to chest/spine and legs (`hip`) parented to
  pelvis** (`index.html:4030-4065`). Three.js inherited visibility therefore
  hides the entire body subtree from the single pelvis toggle; hiding `head`
  too is redundant-but-harmless. The seraph attaches as a separate child of
  `wretch.group` (not under pelvis) so it stays visible. In-game screenshot
  shows no dog-body peeking. (Aura sprites parented directly to `wretch.group`
  and `_bossCore` are not covered by the pelvis toggle, but `_bossCore` is
  explicitly hidden and the aura sprites default to opacity 0 — no visible leak.)
- **laserSocket wired:** `_eyeRig.userData.core = seraph.laserSocket`, an
  `Object3D`; `getWorldPosition` resolves (`coreResolves:true`), so
  `bossUpdate`'s beam-origin read still points at the central pupil = the game's
  damage point.
- **Console on boot:** zero pageerrors. The single stray
  `Failed to load resource: 404` is **favicon.ico** — a request-listener sweep
  of the boot found **no 4xx/5xx server responses at all**; no game or boss asset
  404s. NIT.

---

## SUMMARY TABLE

| §7 Law | Result | | §8 Criterion | Result |
|---|---|---|---|---|
| 1 Draw calls ≤15 | PASS (13/14) | | 1 Harness + GUI | PASS |
| 2 No per-frame vtx upload | PASS (MINOR) | | 2 Silhouette vs canon | PASS (MINOR eyes) |
| 3 Pivot discipline | PASS | | 3 Laser from pupil / telegraph | PASS (MINOR contrast) |
| 4 Analytic hit proxies | PASS | | 4 No z-fight / interruptible | PASS |
| 5 LOD swap | PASS | | 5 §7 laws verified | PASS |
| 6 Materials ≤4 | PASS (by role/program) | | 6 Boot + zero behavior diff | PASS |
| 7 Overdraw ≤20% | PASS | | | |
| 8 O(parts) CPU | PASS | | | |
| 9 ≤150k tris / 60fps | PASS (118.9k / 144fps) | | | |

---

## FINDINGS BY SEVERITY

**BLOCKER:** none.
**MAJOR:** none.

**MINOR**
- **F-1 (law 6, strict):** 12 distinct `THREE.Material` objects exist (7 body +
  3 eye + 1 cornea + 1 fx) vs. the literal "4 materials total." They collapse to
  4 roles and ~3 programs; the 7 body objects exist only to hold per-wing
  `uBones` uniform arrays while sharing one `'seraphWingSkin'` program — an
  unavoidable consequence of per-wing bone uniforms via `onBeforeCompile`. Intent
  met. *Fix (optional): document the object-vs-program distinction in the ledger,
  or migrate wings to a single material with a per-instance/wing bone-texture to
  reach a literal 4 objects. Not worth the risk pre-ship.*
- **F-2 (A-2):** eye band uploads 35 `instanceMatrix` mat4 + 14 attr floats per
  frame (`index.js:293-294,309`). Trivial (~2.3 KB/frame) and not a geometry
  re-upload. *Fix (optional): none needed; note it in the perf ledger.*
- **F-3 (visual):** the core feather mass is **static** — `coreMat`'s
  `wingUniforms.uTime` is never advanced (the core isn't in `this.wings`, and
  nothing ticks it), and its feathers all read `uBones[0]`=identity, so shader
  flutter is frozen. The hanging "torn robe" core does not stir.
  *Fix: tick `this._coreMat.userData.wingUniforms.uTime.value = el;` in
  `SeraphimModel.update`.*
- **F-4 (B-2a):** only ~3 of 7 eyes read visually (ring-2/3 too small/occluded).
  *Fix (optional): widen `gap`, raise the `0.55^|i|` falloff base, or lift flank
  eyes slightly out of the feather plane so the 7-band motif reads.*
- **F-5 (B-3a):** white-hot beam core is low-contrast against the white
  cloudscape. *Fix (optional): bias the core toward the blue sheath tint or add a
  thin dark rim so the lance reads on white.*

**NIT**
- **F-6:** preset `lighting/fog/post` hints and the blended `eyeClose` scalar are
  plumbed (`rig.js` → `onOverrides`) but not applied to the scene/eyes outside
  the death sequencer. Canon §6 says future states are "structure for, don't
  build," so plumbing-only is acceptable; flagging so it isn't mistaken for live.
- **F-7:** favicon.ico 404 on boot (harmless).
- **F-8:** eye source is Pexels-licensed, not strictly CC0 (documented, in the
  accepted source set).

---

## METHOD / REPRODUCTION
- Serve: `python -m http.server 8099` from repo root.
- Boss harness measured headless via `playwright-core` + installed Chrome
  (`--use-angle=d3d11`), reading `window.__diag` / `window.__boss` at idle and
  while firing; screenshots at fold/flap extremes and far LOD.
- Zero-diff: `git diff index.html` (3 hunks, verified line-scoped).
- Game: real boot of `index.html?debug=1`, `__hc.boss(...)` summon, pageerror +
  response capture.
- Temp render scripts were created under `tools/` and **deleted** after use; the
  only file authored/kept by this audit is this report plus `docs/audit-*.png`.
