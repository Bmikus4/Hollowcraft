// SERAPHIM — RIG / STATE BLENDER (Agent E, Wave 2)
// ---------------------------------------------------------------------------
// Owns the procedural blend between animation presets (presets.js). No baked
// clips: `update(dt)` advances a smoothstep cross-fade (BLEND_TIME ≈ 0.4 s) of
// the scalar channels and a quaternion SLERP of the body lean, then exposes the
// resolved values on `rig.values` + `rig.bodyQuat`. SeraphimModel reads those
// each frame and drives the wings / eyes / fx. Transitions are interruptible:
// calling setState() mid-blend re-bases the fade from the CURRENT interpolated
// values, so there are no pops (canon §6, acceptance §8.4).
//
// Extra dynamics layered on top of the pure blend:
//   * stagger  — a critically-damped vertical SPRING: setState('stagger') snaps
//                yOffset down by the preset's _staggerDrop and lets it recover.
//   * death    — a continuous slow descent (_descendRate) + a centre-out eye
//                close sequencer (_eyeSequence) writing eyeClosePerEye[|i|].
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { PRESETS, BLEND_TIME, BLEND_KEYS, DEFAULT_STATE } from './presets.js';

const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export class Rig {
  constructor(opts = {}) {
    this.onOverrides = opts.onOverrides || null;   // cb(hints) when lighting/fog/post change
    const base = PRESETS[DEFAULT_STATE];

    // resolved, per-frame values the model consumes
    this.values = {};
    for (const k of BLEND_KEYS) this.values[k] = base[k] != null ? base[k] : 0;
    this.values.gaze = base.gaze || 'wander';
    this.values.fadeModelOut = 0;

    this.bodyQuat = new THREE.Quaternion();
    this._fromQuat = new THREE.Quaternion();
    this._toQuat = new THREE.Quaternion();
    this._e = new THREE.Euler();

    this.state = DEFAULT_STATE;
    this._from = { ...this.values };
    this._to = base;
    this._t = 1;                 // 1 = settled
    this._blending = false;

    // vertical spring (stagger drop + general settle)
    this._y = 0; this._yv = 0;
    this._descend = 0;           // death continuous descent accumulator

    // eye close sequence (death): per |index| 0..3 close amount
    this.eyeClosePerEye = [0, 0, 0, 0];
    this._deathT = 0;

    this._applyBodyQuatTargets(base, base);
    this.bodyQuat.copy(this._toQuat);
  }

  _bodyQuatFor(p, out) {
    this._e.set(p.bodyPitch || 0, 0, p.bodyRoll || 0, 'XYZ');
    return out.setFromEuler(this._e);
  }
  _applyBodyQuatTargets(from, to) {
    this._bodyQuatFor(from, this._fromQuat);
    this._bodyQuatFor(to, this._toQuat);
  }

  setState(name) {
    const to = PRESETS[name];
    if (!to || name === this.state && this._t >= 1) return;
    // re-base the fade from the CURRENT interpolated values (interruptible)
    this._from = {};
    for (const k of BLEND_KEYS) this._from[k] = this.values[k];
    this._from.bodyPitch = this._eulerFromQuat().x;
    this._from.bodyRoll = this._eulerFromQuat().z;
    this._fromQuat.copy(this.bodyQuat);
    this._to = to;
    this._bodyQuatFor(to, this._toQuat);
    this._t = 0;
    this._blending = true;
    this.state = name;

    // per-state impulses
    if (to._staggerDrop) { this._y = -Math.abs(to._staggerDrop); this._yv = 0; }
    if (name === 'death') { this._deathT = 0; this._descend = 0; }
    else { this.eyeClosePerEye = [0, 0, 0, 0]; }

    // route optional lighting/fog/post hints (future void/fractal are data-only)
    if (this.onOverrides) this.onOverrides({ lighting: to.lighting, fog: to.fog, post: to.post });
  }

  _eulerFromQuat() { this._e.setFromQuaternion(this.bodyQuat, 'XYZ'); return this._e; }

  update(dt) {
    dt = Math.min(dt, 0.05);
    if (this._blending) {
      this._t += dt / BLEND_TIME;
      const k = smooth(this._t);
      for (const key of BLEND_KEYS) {
        const a = this._from[key] != null ? this._from[key] : 0;
        const b = this._to[key] != null ? this._to[key] : (this.values[key] || 0);
        this.values[key] = lerp(a, b, k);
      }
      this.bodyQuat.slerpQuaternions(this._fromQuat, this._toQuat, k);
      this.values.gaze = k < 0.5 ? (this._from.gaze || this.values.gaze) : (this._to.gaze || this.values.gaze);
      this.values.fadeModelOut = this._to.fadeModelOut ? k : lerp(this.values.fadeModelOut, 0, k);
      if (this._t >= 1) { this._blending = false; this.values.gaze = this._to.gaze || 'wander'; }
    }

    // vertical spring toward the preset resting yOffset (+ death descent)
    const yTarget = (this.values.yOffset || 0) - this._descend;
    const K = 42, D = 12;                          // stiffness / damping (critically-ish)
    this._yv += ((yTarget - this._y) * K - this._yv * D) * dt;
    this._y += this._yv * dt;

    // death dynamics: keep sinking + close eyes centre-out over ~1.6 s
    if (this.state === 'death') {
      const rate = this._to._descendRate || 0;
      this._descend += rate * dt;
      this._deathT += dt;
      if (this._to._eyeSequence) {
        const per = 0.4;                           // stagger of ~0.4 s between rings
        for (let ring = 0; ring <= 3; ring++) {
          const start = ring * per;
          this.eyeClosePerEye[ring] = smooth((this._deathT - start) / 0.5);
        }
      }
    }

    this.values.yWorld = this._y;                  // resolved vertical offset
    return this.values;
  }
}

export default Rig;
