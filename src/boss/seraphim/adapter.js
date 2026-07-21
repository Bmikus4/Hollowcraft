// ============================================================================
// SERAPHIM BOSS — GAME INTEGRATION ADAPTER (Agent F)
// ----------------------------------------------------------------------------
// Owns the ONE SeraphimModel instance for the live game and the in-world laser
// beam, and exposes the small set of functions the index.html seam delegates to.
// The game's boss AI (bossUpdate/summonBoss/net handlers) is untouched — it drives
// the model purely through the mirrored `wretch` signals (_eyeFlare, _bossMode,
// _bossPitch/_bossRoll) via these functions. See docs/seraphim-contracts.md §SEAM.
//
// Zero-behaviour-diff strategy: the model attaches as a CHILD of wretch.group, so
// it inherits the boss position + body lean (_bossPitch/_bossRoll applied to
// wretch.group at index.html:4878) + faceLock yaw for free. The eye band's
// laserSocket is handed back as the compat `_eyeRig.userData.core` so
// bossUpdate's `getWorldPosition(...)` (index.html:7328) still resolves to the
// central pupil — the beam origin exactly matches the game's damage point.
// ============================================================================
import * as THREE from 'three';
import { SeraphimModel } from './index.js';
import { makeBeam, updateBeam } from './materials/fx.js';

// singleton state (one boss ever exists in Hollowcraft; re-summons reuse it)
let _model = null;      // SeraphimModel
let _beam = null;       // makeBeam() result { mesh, update, setVisible, ... }
let _scene = null;
let _elapsed = 0;
let _prewarmed = false; // prewarm() ran once (build + shader precompile off the summon path)

// Build the singleton model ONCE with its standard child-transform + state, but do
// NOT attach it to any scene here. Shared by prewarm() and seraphOn() so a
// prebuilt-by-prewarm model and a first-summon model are byte-identical.
function buildModel(opts = {}) {
  const { scene, camera, renderer } = opts;
  const m = new SeraphimModel({ renderer, camera, scene });
  m.object3d.scale.setScalar(1.0);
  // QA hooks read _bossWings.userData.feats.length — keep it a harmless array.
  m.object3d.userData.feats = m.object3d.userData.feats || [];
  m.setState('aggro');
  return m;
}

// The C-fx beam ships at 0.08 m core / 0.20 m sheath — hairline against a ~40 m
// boss. Fatten to read as a searing lance whose girth matches the ~3-block ground
// blast the AI carves (bossBlast r=3). Applied AFTER updateBeam, which re-composes
// the instance matrices each frame.
const BEAM_FATTEN = 8;

const _m4 = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _o = new THREE.Vector3();
const _t = new THREE.Vector3();

function fattenBeam(beam, mul) {
  const mesh = beam.mesh;
  for (let i = 0; i < 2; i++) {
    mesh.getMatrixAt(i, _m4);
    _m4.decompose(_p, _q, _s);
    _s.x *= mul; _s.z *= mul;                 // XZ = beam radius; Y = length (leave)
    _m4.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

// Build (once) or reveal the seraph on wretch.group. Returns the SeraphimModel so
// the seam can wire the compat signals (_bossWings, _eyeRig).
// opts: { scene, camera, renderer, anchorY }
export function seraphOn(wretch, opts = {}) {
  const { scene, camera, renderer, anchorY = 1.7 } = opts;
  _scene = scene || _scene;

  // child of wretch.group → inherits pos + _bossPitch/_bossRoll lean + faceLock
  // yaw. Chosen child scale = 1.0 (model natural wingspan 12.8 u × wretch.group
  // 3.04 ≈ 39 m tip-to-tip, ~52 m tall — inside canon's 30–60 m). The band sits
  // near local y=BOSS_WING_CY so the old anchor height is preserved.
  if (!_model) _model = buildModel({ scene, camera, renderer });
  // Attach even when the model was prebuilt by prewarm() (parent is null / a warm
  // scene). Re-parenting to wretch.group + the anchor height happens once.
  if (_model.object3d.parent !== wretch.group) {
    _model.object3d.position.set(0, anchorY, 0);
    wretch.group.add(_model.object3d);
  }
  _model.object3d.visible = true;

  if (!_beam) {
    _beam = makeBeam();                 // own fx material (additive core + sheath)
    _beam.mesh.renderOrder = 5;
    (_scene || scene).add(_beam.mesh);  // world-space; identity modelMatrix
  }
  _beam.setVisible(false);

  return _model;
}

export function seraphOff(/* wretch */) {
  if (_model) _model.object3d.visible = false;
  if (_beam) _beam.setVisible(false);
}

// Per-frame drive (owner AND guests). All inputs come from mirrored wretch signals.
// dt seconds; opts { wretch, camera, elapsed }.
const _qPrev = new THREE.Quaternion();
const _qGoal = new THREE.Quaternion();
export function seraphAnimate(dt, opts = {}) {
  if (!_model) return;
  const { wretch, camera, elapsed } = opts;
  if (elapsed != null) _elapsed = elapsed;

  if (camera) {
    // FLAT-FACE THE PLAYER (user spec 07-20): _model.lookAt only steers the EYES — the body was yaw-only from
    // wretch.group, so overhead flight showed the underside. Object3D.lookAt computes the exact local quaternion
    // (it refreshes ancestor matrices internally, so the parent's faceLock yaw + flight lean are compensated),
    // then we slerp toward it so the great disc turns with mass instead of snapping.
    const o = _model.object3d;
    _qPrev.copy(o.quaternion);
    o.lookAt(camera.position);
    _qGoal.copy(o.quaternion);
    o.quaternion.copy(_qPrev).slerp(_qGoal, 1 - Math.exp(-(dt || 0.016) * 2.5));
    _model.lookAt(camera.position);          // the seven eyes converge on you on top of the body facing
  }

  const mode = wretch && wretch._bossMode;
  const flap = mode === 'swoop' ? 1.0 : mode === 'orbit' ? 0.6 : 0.4;
  _model.setFlapIntensity(flap);

  // continuous central-eye charge visual (iris ramp + pupil constrict + lid peel +
  // limbal glow). NO auto-fire — the beam is rendered by seraphShowBeam, damage by
  // bossUpdate. See setLaserCharge contract in index.js.
  _model.setLaserCharge((wretch && wretch._eyeFlare) || 0);

  // tick timed eye-seals (shoot-to-close): hold the lid shut while a timer runs; reopen when it lapses (unless permanently wounded)
  if (_closeTimers.size && _model.eyeBand) {
    for (const [i, t] of _closeTimers) {
      const nt = t - (dt || 0.016);
      if (nt <= 0) { _closeTimers.delete(i); const e = _model.eyeBand.eyes.find(x => x.l.i === i); if (e && !_wounds.has(i)) e.deathClose = 0; }
      else { _closeTimers.set(i, nt); const e = _model.eyeBand.eyes.find(x => x.l.i === i); if (e) e.deathClose = 1; }
    }
  }

  _model.update(dt, _elapsed);
}

// Beam from the central pupil (ex,ey,ez) to the ground aim point (ax,ay,az).
export function seraphShowBeam(ex, ey, ez, ax, ay, az) {
  if (!_beam) return;
  const el = _elapsed || (performance.now() / 1000);
  updateBeam(_beam, _o.set(ex, ey, ez), _t.set(ax, ay, az), el);
  fattenBeam(_beam, BEAM_FATTEN);
}

export function seraphHideBeam() {
  if (_beam) _beam.setVisible(false);
}

// GOLD beam is a STAGE 2 thing only (Ben 07-21): tint the shared fx material gold in stage 2, white-hot otherwise.
export function seraphBeamGold(on) {
  if (!_beam || !_beam.material || !_beam.material.uniforms) return;
  const u = _beam.material.uniforms;
  if (on) { u.uCore.value.setHex(0xfff0c4); u.uSheath.value.setHex(0xffc233); }
  else    { u.uCore.value.setHex(0xffffff); u.uSheath.value.setHex(0x9fd8ff); }
}

// HEAVENLY BLOOM (Ben 07-21): a soft additive halo around the whole seraph — STAGE 3 ONLY (the game gates it on
// VOID.on). Kept gentle + behind the body (renderOrder −1, modest opacity) so it NEVER hides the fractal geometry.
let _bloom = null;
function _bloomTex() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'); const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,250,232,0.9)'); g.addColorStop(0.30, 'rgba(255,240,200,0.4)');
  g.addColorStop(0.62, 'rgba(255,232,180,0.12)'); g.addColorStop(1, 'rgba(255,232,180,0)');
  c.fillStyle = g; c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, 6.283); c.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function seraphBloom(on) {
  if (!_model) return;
  if (on && !_bloom) {
    _bloom = new THREE.Sprite(new THREE.SpriteMaterial({ map: _bloomTex(), color: 0xfff2cc, transparent: true, opacity: 0.36, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    _bloom.scale.setScalar(17); _bloom.position.set(0, 1.2, -1.2); _bloom.renderOrder = -1;   // behind the body → haloes the wing disc, never occludes the fractal
    _model.object3d.add(_bloom);
  }
  if (_bloom) _bloom.visible = !!on;
}

// Wing-fold override for the emergence choreography (null releases to the rig's preset).
export function seraphFold(v) { if (_model) _model._foldOverride = (v == null ? null : v); }

// CORPSE MODE (Ben 07-21): the boss is dead and now ragdolls. Animation stops, so the eyes freeze mid-bob and
// (on the far wings) read as "detached", and the transparent beam/ember FX keep paying overdraw for nothing.
// Close every eye (dark sockets — a dead god), kill the laser charge, and hide the FX root. Keeps the FULL body.
export function seraphCorpseMode() {
  if (!_model) return;
  try { if (_model.eyeBand && _model.eyeBand.eyes) { for (const e of _model.eyeBand.eyes) e.deathClose = 1;
    const g = _model.eyeBand.group; if (g) g.updateWorldMatrix(true, false); if (_model.eyeBand.refresh) _model.eyeBand.refresh(); } } catch (e) {}
  try { if (_model.setLaserCharge) _model.setLaserCharge(0); } catch (e) {}
  try { if (_model.fxRoot) _model.fxRoot.visible = false; } catch (e) {}
  try { if (_beam) _beam.setVisible(false); } catch (e) {}
  try { if (_bloom) _bloom.visible = false; } catch (e) {}   // no heavenly bloom on the corpse (and it would inflate the ragdoll bbox)
  // NEUTRALIZE THE LOOK-AT TILT (Ben 07-21): the seraph's visual facing is driven by object3d.lookAt(camera) each
  // frame — that child rotation defeated the ragdoll's flat-lay (the corpse "floated"). Reset it to identity so the
  // ragdoll's quaternion on wretch.group is the SOLE orientation: the wing-disc (feathers face +Z) then lays truly flat.
  try { _model.object3d.quaternion.identity(); _model.object3d.updateMatrix(); } catch (e) {}
  // FOLD THE WINGS SHUT (Ben 07-21): a slain god CRUMPLES — folding collapses the ~39m wingspan so the ragdoll's
  // bounding box shrinks further. setFold is instant per update(); a few pumps bake the folded pose into the instance matrices.
  try { if (_model.setFold) { _model.setFold(1); _model.update(0.05, _elapsed); } } catch (e) {}   // ONE pump — setFold is instant per update(); 3 pumps was 3× a full rig animation cost on the death frame (Ben 07-21 perf)
  try { _model.object3d.updateWorldMatrix(true, true); } catch (e) {}
}

// BLOODY EYE HOLES (user spec 07-20): when a chain tears out of eye i (layout index, never 0/central),
// the lids clamp shut over the socket (existing per-eye deathClose channel) and a dark-red wound disc is
// mounted at the pivot station. Returns the eye's current world position (the chain's origin) or null.
const _woundMat = new THREE.MeshBasicMaterial({ color: 0x4a0507, side: THREE.DoubleSide });
const _wounds = new Set();
export function seraphWoundEye(i) {
  if (!_model || !_model.eyeBand) return null;
  const e = _model.eyeBand.eyes.find(x => x.l.i === i && !x.isC);
  if (!e || _wounds.has(i)) return null;
  _wounds.add(i);
  e.deathClose = 1;                                                  // the socket clamps shut
  const disc = new THREE.Mesh(new THREE.CircleGeometry(e.l.size * 0.7, 14), _woundMat);
  disc.position.copy(e.pivot.position); disc.position.z += e.l.size * 0.55;
  _model.eyeBand.group.add(disc);
  const g = _model.eyeBand.group; g.updateWorldMatrix(true, false);
  _ep.copy(e.pivot.position).applyMatrix4(g.matrixWorld);
  return { x: _ep.x, y: _ep.y, z: _ep.z, i };
}
export function seraphHealEyes() {                                    // stage end — the sockets reopen, wounds vanish
  if (!_model || !_model.eyeBand) return;
  for (const e of _model.eyeBand.eyes) e.deathClose = 0;
  const g = _model.eyeBand.group;
  for (let k = g.children.length - 1; k >= 0; k--) { const c = g.children[k]; if (c.material === _woundMat) g.remove(c); }
  _wounds.clear();
}
export function seraphFreshEyes() {                                   // which flank eyes are still unwounded (chain candidates)
  if (!_model || !_model.eyeBand) return [];
  const g = _model.eyeBand.group; g.updateWorldMatrix(true, false);
  const out = [];
  for (const e of _model.eyeBand.eyes) { if (e.isC || _wounds.has(e.l.i)) continue;
    _ep.copy(e.pivot.position).applyMatrix4(g.matrixWorld);
    out.push({ i: e.l.i, x: _ep.x, y: _ep.y, z: _ep.z }); }
  return out;
}

// WING HITBOXES (user spec 07-20): three spheres along each of the eight wings' spans — a shot that lands
// here has a 10% chance of wounding (the game rolls it); the EYES remain the 100% targets.
const _wp2 = new THREE.Vector3();
export function seraphWingSpheres() {
  if (!_model || !_model.object3d.visible || !_model.wings) return [];
  const out = [];
  for (const w of _model.wings) {
    const g = w.group; if (!g) continue;
    g.updateWorldMatrix(true, false);
    const S = (w.span || 7);   // wing-local leading edge = +X
    for (const [u, rr] of [[0.30, 0.22], [0.60, 0.20], [0.88, 0.15]]) {
      _wp2.set(u * S, 0, S * 0.28).applyMatrix4(g.matrixWorld);               // mid-chord: feathers grow +Z, so the mass sits ~0.28S behind the edge
      const ws = _es.setFromMatrixScale(g.matrixWorld).x;
      out.push({ x: _wp2.x, y: _wp2.y, z: _wp2.z, r: rr * S * ws });
    }
  }
  return out;
}

// EVERY EYE IS A HITBOX (user spec 07-20): world-space spheres for the seven-eye band —
// pivot band-local positions pushed through the band group's live world matrix (the pivots
// themselves are virtual; only their matrices reach the InstancedMesh). Unit eye sclera
// radius = 1, so world radius = layout size × the band's uniform world scale.
const _ep = new THREE.Vector3();
const _es = new THREE.Vector3();
export function seraphEyeSpheres() {
  if (!_model || !_model.object3d.visible || !_model.eyeBand) return [];
  const g = _model.eyeBand.group;
  g.updateWorldMatrix(true, false);
  const ws = _es.setFromMatrixScale(g.matrixWorld).x;   // uniform scale end to end
  const out = [];
  for (const e of _model.eyeBand.eyes) {
    _ep.copy(e.pivot.position).applyMatrix4(g.matrixWorld);
    out.push({ x: _ep.x, y: _ep.y, z: _ep.z, r: e.l.size * ws, central: e.isC, i: e.l.i, closed: (_closeTimers.get(e.l.i) || 0) > 0 || _wounds.has(e.l.i) });
  }
  return out;
}

// SHOOT-TO-CLOSE (Ben 07-21): a shot to any non-central eye seals it for `secs` seconds. In stage 3 a sealed
// eye can't fire its burst laser (the game filters seraphEyeSpheres by `.closed`). Timers tick in seraphAnimate.
const _closeTimers = new Map();   // layout index i -> seconds remaining
export function seraphEyeClose(i, secs) {
  if (!_model || !_model.eyeBand || i === 0) return false;     // central eye never seals
  const e = _model.eyeBand.eyes.find(x => x.l.i === i && !x.isC);
  if (!e) return false;
  _closeTimers.set(i, Math.max(_closeTimers.get(i) || 0, secs || 90));
  e.deathClose = 1;                                            // lids clamp shut immediately (visible in all stages)
  return true;
}
export function seraphEyesReset() { _closeTimers.clear(); }    // fresh fight → all timed seals cleared

// BODY-ONLY CLAMP BOX (Ben 07-21): the ragdoll's no-sink clamp uses the FULL bounding box, which for the seraph is
// dominated by the ~39m wingspan → it held the corpse dozens of metres up ("floating in the sky"). This returns the
// COMPACT eye-band (the face/body) box so the corpse can rest its body on the ground while the wings splay around it.
// Called by pushRagdoll while the corpse mesh is at origin/identity → the returned world box IS the mesh-local box.
const _bodyBox = new THREE.Box3();
export function seraphBodyBox() {
  if (!_model || !_model.eyeBand || !_model.eyeBand.group) return null;
  try {
    _model.object3d.updateWorldMatrix(true, true);
    _bodyBox.makeEmpty(); _bodyBox.expandByObject(_model.eyeBand.group);
    if (_bodyBox.isEmpty()) return null;
    return { min: { x: _bodyBox.min.x, y: _bodyBox.min.y, z: _bodyBox.min.z }, max: { x: _bodyBox.max.x, y: _bodyBox.max.y, z: _bodyBox.max.z } };
  } catch (e) { return null; }
}

// PREWARM — kill the first-summon load hitch. seraphOn() builds the whole model
// synchronously on the first summon (atlas CanvasTexture gen + all geometry + the
// first-use shader COMPILE at first render) = one big frame stall right when the
// boss appears. prewarm() pays that cost AHEAD of time, off the summon path (call
// it during/after world load via requestIdleCallback). Idempotent; changes NO boss
// AI — it only pre-creates the singleton + uploads/compiles its programs, then
// detaches. seraphOn() later finds _model already built and just attaches + shows.
//
// ctx: { scene, camera, renderer } — renderer is required to precompile. Returns a
// Promise resolving to the model once its async eye textures are compiled too.
export function prewarm(ctx = {}) {
  if (_prewarmed) return Promise.resolve(_model);
  const { scene, camera, renderer } = ctx;
  if (!renderer) return Promise.resolve(null);   // no GPU device → nothing to precompile
  _prewarmed = true;

  if (!_model) _model = buildModel({ scene, camera, renderer });

  const cam = camera || new THREE.PerspectiveCamera();
  const warm = new THREE.Scene();
  // Compile in a throwaway scene so we never render the boss into the live view.
  // Restore any parent afterwards (seraphOn may have attached it if a summon raced
  // in before prewarm ran — harmless, but keep the tree intact).
  const compile = () => {
    try {
      const parent = _model.object3d.parent;
      warm.add(_model.object3d);        // detaches from parent (adds to warm)
      _model.update(0.016, 0);          // prime instance matrices + uniforms
      if (renderer.compile) renderer.compile(warm, cam);
      warm.remove(_model.object3d);
      if (parent) parent.add(_model.object3d);
    } catch (e) { /* precompile is best-effort; never break load */ }
  };

  compile();   // geometry + base programs compiled now (the bulk of the stall)

  // Second pass once Agent B's baked eye maps resolve: applying a map flips
  // USE_MAP → the eye program recompiles on next render. Do it here (off the summon
  // path) instead of letting it stall a gameplay frame.
  const ready = (_model.ready && _model.ready.then) ? _model.ready : Promise.resolve(_model);
  return ready.then(() => { compile(); return _model; }).catch(() => _model);
}

// Optional teardown (not used by the seam today; kept for completeness).
export function seraphDispose() {
  if (_beam) { if (_beam.mesh.parent) _beam.mesh.parent.remove(_beam.mesh); _beam.mesh.geometry.dispose(); _beam = null; }
  if (_model) { if (_model.object3d.parent) _model.object3d.parent.remove(_model.object3d); _model.dispose(); _model = null; }
  _prewarmed = false;
}
