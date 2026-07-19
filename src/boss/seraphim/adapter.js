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

  if (!_model) {
    _model = new SeraphimModel({ renderer, camera, scene });
    // child of wretch.group → inherits pos + _bossPitch/_bossRoll lean + faceLock
    // yaw. Chosen child scale = 1.0 (model natural wingspan 12.8 u × wretch.group
    // 3.04 ≈ 39 m tip-to-tip, ~52 m tall — inside canon's 30–60 m). The band sits
    // near local y=BOSS_WING_CY so the old anchor height is preserved.
    _model.object3d.scale.setScalar(1.0);
    _model.object3d.position.set(0, anchorY, 0);
    // QA hooks read _bossWings.userData.feats.length — keep it a harmless array.
    _model.object3d.userData.feats = _model.object3d.userData.feats || [];
    _model.setState('aggro');
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
export function seraphAnimate(dt, opts = {}) {
  if (!_model) return;
  const { wretch, camera, elapsed } = opts;
  if (elapsed != null) _elapsed = elapsed;

  if (camera) _model.lookAt(camera.position);

  const mode = wretch && wretch._bossMode;
  const flap = mode === 'swoop' ? 1.0 : mode === 'orbit' ? 0.6 : 0.4;
  _model.setFlapIntensity(flap);

  // continuous central-eye charge visual (iris ramp + pupil constrict + lid peel +
  // limbal glow). NO auto-fire — the beam is rendered by seraphShowBeam, damage by
  // bossUpdate. See setLaserCharge contract in index.js.
  _model.setLaserCharge((wretch && wretch._eyeFlare) || 0);

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

// Optional teardown (not used by the seam today; kept for completeness).
export function seraphDispose() {
  if (_beam) { if (_beam.mesh.parent) _beam.mesh.parent.remove(_beam.mesh); _beam.mesh.geometry.dispose(); _beam = null; }
  if (_model) { if (_model.object3d.parent) _model.object3d.parent.remove(_model.object3d); _model.dispose(); _model = null; }
}
