// SERAPHIM MATERIALS — barrel + shared lighting rig (Agent C)
// -----------------------------------------------------------------------------
// Re-exports the four material builders and the atlas, plus a canon lighting rig
// helper. Does NOT construct an EffectComposer — the game already owns bloom
// (canon §5 / contracts): the boss reuses it.
// -----------------------------------------------------------------------------
import * as THREE from 'three';

export { buildBodyMaterial, makeAtlasTexture, drawAtlas, A_VERTEX_AVAILABLE } from './bodyMaterial.js';
export { buildCorneaMaterial } from './corneaMaterial.js';
export { buildEyeMaterial, proceduralEyeTexture } from './eyeMaterial.js';
export { createFxMaterial, makeBeam, updateBeam, makeEmbers, makeFx } from './fx.js';

// addSeraphLighting(target) — attaches the canon rig (canon §5) under `target`
// (a Scene or Group). Returns { key, hemi, point, getKeyLightDir } so the body
// material's wrap-SSS uLightDir can track the key light.
export function addSeraphLighting(target, opts = {}) {
  const {
    keyIntensity = 2.4,
    hemiIntensity = 1.1,
    pointIntensity = 2.0,
    scale = 1.0,          // multiply offsets for the boss's world scale
  } = opts;

  // strong white directional KEY, above-and-behind -> halo rim (canon §5)
  const key = new THREE.DirectionalLight(0xffffff, keyIntensity);
  key.position.set(0.6 * scale, 3.0 * scale, -2.0 * scale);
  key.target.position.set(0, 0.5 * scale, 0.5 * scale);
  target.add(key);
  target.add(key.target);

  // hemisphere FILL: sky #ffffff / ground #cfc5ba
  const hemi = new THREE.HemisphereLight(0xffffff, 0xcfc5ba, hemiIntensity);
  hemi.position.set(0, 5 * scale, 0);
  target.add(hemi);

  // one warm POINT light in the core (ember smoulder)
  const point = new THREE.PointLight(0xffd6a0, pointIntensity, 20 * scale, 1.6);
  point.position.set(0, 0.2 * scale, 0.3 * scale);
  target.add(point);

  const _dir = new THREE.Vector3();
  return {
    key, hemi, point,
    // world-space direction FROM the surface TOWARD the key light
    getKeyLightDir() {
      _dir.copy(key.position).sub(key.target.position).normalize();
      return _dir;
    },
  };
}
