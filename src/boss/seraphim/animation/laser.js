// SERAPHIM — CENTRAL-EYE LASER (VISUAL timeline only) (Agent E, Wave 2)
// ---------------------------------------------------------------------------
// Damage stays in the game's behaviour code (canon §4B). This drives only the
// VISUALS + the tracking geometry the caller queries:
//   charge  (0.8 s) — ramps the central iris emissive, constricts the pupil,
//                     peels the lids (all in Agent B's eye band) and auto-fires
//                     telegraph() (all-eyes snap + blink — the terror beat).
//   fire            — sustained beam from the pupil (laserSocket world pos) to a
//                     tracking-CAPPED aim so a player can outrun the sweep:
//                     slerp aim by min(1, θ̇max·dt / θ_err).  Hit point via the
//                     injected raycastFn(origin, dir); onLaserHit(cb) fires each
//                     connected frame with (worldPoint, normal).
//   cooldown (0.4s) — beam collapses (radius → 0) + afterglow, saccades resume.
//
// Beam geometry / additive layers are Agent C's fx (makeBeam = ONE InstancedMesh,
// 2 instances: white-hot core + fresnel sheath — the 2-layer hard cap). Muzzle +
// impact flares are the embers system's two flare slots.
// ---------------------------------------------------------------------------
import * as THREE from 'three';

const FORWARD = new THREE.Vector3(0, 0, 1);
const CHARGE_T = 0.8, COOLDOWN_T = 0.4;
const MAX_RANGE = 400;                       // beam length when nothing is hit

export class LaserFx {
  constructor(opts) {
    this.beam = opts.beam;                    // C's makeBeam(...) instance
    this.embers = opts.embers || null;        // C's makeEmbers(...) for flares
    this.eye = opts.eyeBand;                  // B-style band: setCharge/telegraphBlink
    this.laserSocket = opts.laserSocket;      // Object3D at central pupil depth
    this.fxRoot = opts.fxRoot || null;        // beam/embers live under here; positions localized to it
    this.raycastFn = opts.raycastFn || null;  // (origin:V3, dir:V3) -> {point,normal,distance}|null
    this.trackSpeed = opts.trackingSpeed != null ? opts.trackingSpeed : 1.4; // rad/s
    this._fatten = opts.beamRadiusScale || 1;   // scale C's 0.08/0.20 m beam to boss size
    this._hitCbs = [];

    this.phase = 'idle';                      // idle|charge|fire|cooldown
    this._t = 0;
    this._charge = 0;                         // 0..1 visual charge level

    this._origin = new THREE.Vector3();
    this._aimDir = new THREE.Vector3(0, 0, 1);
    this._desired = new THREE.Vector3(0, 0, 1);
    this._end = new THREE.Vector3();
    this._qCur = new THREE.Quaternion();
    this._qDes = new THREE.Quaternion();
    this._n = new THREE.Vector3(0, 1, 0);
    this._getTarget = null;
    this._collapse = 1;                       // radius multiplier during cooldown
  }

  onLaserHit(cb) { if (typeof cb === 'function') this._hitCbs.push(cb); }
  setTrackingSpeed(r) { this.trackSpeed = Math.max(0.05, r); }

  // world → fxRoot-local (beam/embers meshes live under fxRoot)
  _local(vWorld) {
    if (!this.fxRoot) return vWorld;
    if (!this.__lp) this.__lp = new THREE.Vector3();
    this.fxRoot.updateWorldMatrix(true, false);
    return this.fxRoot.worldToLocal(this.__lp.copy(vWorld));
  }

  startCharge() {
    if (this.phase === 'fire') return;
    this.phase = 'charge';
    this._t = 0;
    this._collapse = 1;
    if (this.eye && this.eye.telegraphBlink) this.eye.telegraphBlink(); // canon §4B beat
  }

  // getTargetPos: () => THREE.Vector3
  fire(getTargetPos) {
    this._getTarget = getTargetPos || this._getTarget;
    // seed the aim so the first frame doesn't snap wildly
    if (this._getTarget) {
      this.laserSocket.getWorldPosition(this._origin);
      this._desired.copy(this._getTarget()).sub(this._origin);
      if (this._desired.lengthSq() > 1e-8) this._aimDir.copy(this._desired).normalize();
    }
    this.phase = 'fire';
    this._t = 0;
    this._charge = 1;
    this._collapse = 1;
  }

  stop() {
    if (this.phase === 'idle') return;
    this.phase = 'cooldown';
    this._t = 0;
  }

  isFiring() { return this.phase === 'fire'; }
  chargeLevel() { return this._charge; }

  update(dt, elapsed) {
    dt = Math.min(dt, 0.05);
    switch (this.phase) {
      case 'charge': {
        this._t += dt;
        this._charge = Math.min(1, this._t / CHARGE_T);
        if (this.eye && this.eye.setCharge) this.eye.setCharge(this._charge);
        this.beam.setVisible(false);
        if (this._t >= CHARGE_T && this._getTarget) this.fire(this._getTarget);
        break;
      }
      case 'fire': {
        this._t += dt;
        this._charge = 1;
        if (this.eye && this.eye.setCharge) this.eye.setCharge(1);
        this._runBeam(dt, elapsed, 1);
        break;
      }
      case 'cooldown': {
        this._t += dt;
        const k = Math.min(1, this._t / COOLDOWN_T);
        this._charge = 1 - k;
        this._collapse = 1 - k;                   // radius collapses to 0
        if (this.eye && this.eye.setCharge) this.eye.setCharge(this._charge * 0.6);
        if (this._collapse > 0.02) this._runBeam(dt, elapsed, this._collapse);
        else { this.beam.setVisible(false); if (this.embers) this.embers.hideFlares(); }
        if (k >= 1) { this.phase = 'idle'; this.beam.setVisible(false); if (this.eye && this.eye.setCharge) this.eye.setCharge(0); }
        break;
      }
      default:
        this.beam.setVisible(false);
    }
  }

  _runBeam(dt, elapsed, radiusMul) {
    this.laserSocket.getWorldPosition(this._origin);
    if (this._getTarget) {
      const tp = this._getTarget();
      if (tp) this._desired.copy(tp).sub(this._origin);
    }
    if (this._desired.lengthSq() > 1e-8) {
      this._desired.normalize();
      // tracking cap: slerp aim toward desired by min(1, θ̇max·dt/θ_err)
      const err = this._aimDir.angleTo(this._desired);
      if (err > 1e-4) {
        const frac = Math.min(1, (this.trackSpeed * dt) / err);
        this._qCur.setFromUnitVectors(FORWARD, this._aimDir);
        this._qDes.setFromUnitVectors(FORWARD, this._desired);
        this._qCur.slerp(this._qDes, frac);
        this._aimDir.copy(FORWARD).applyQuaternion(this._qCur).normalize();
      }
    }

    // resolve hit point
    let dist = MAX_RANGE;
    this._n.set(0, 1, 0);
    let hitPoint = null;
    if (this.raycastFn) {
      const hit = this.raycastFn(this._origin, this._aimDir);
      if (hit && hit.point) {
        hitPoint = hit.point;
        dist = hit.distance != null ? hit.distance : this._origin.distanceTo(hit.point);
        if (hit.normal) this._n.copy(hit.normal);
      }
    }
    this._end.copy(this._origin).addScaledVector(this._aimDir, dist);   // WORLD end

    // the beam/embers render under fxRoot; feed them fxRoot-LOCAL positions so a
    // scaled/rotated boss root doesn't double-transform the beam.
    const oL = this._local(this._origin), eL = this._local(this._end);

    this.beam.update(oL, eL, elapsed);
    const rmul = radiusMul * this._fatten;
    if (Math.abs(rmul - 1) > 1e-3) this._scaleBeamRadius(rmul);

    if (this.embers) {
      this.embers.setMuzzle(oL, 0.9 * radiusMul);
      if (hitPoint) this.embers.setImpact(eL, 1.2 * radiusMul);
      else this.embers.setImpact(eL, 0);
    }

    // report the connected hit in WORLD space (callers expect world coords)
    if (hitPoint) for (const cb of this._hitCbs) cb(this._end.clone(), this._n.clone());
  }

  // shrink both beam instances' cross-section for the cooldown collapse without
  // touching fx.js internals (re-compose the two instance matrices' XZ scale).
  _scaleBeamRadius(mul) {
    const mesh = this.beam.mesh;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < 2; i++) {
      mesh.getMatrixAt(i, m);
      m.decompose(p, q, s);
      s.x *= mul; s.z *= mul;
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}

export default LaserFx;
