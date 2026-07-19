// SERAPHIM CORNEA MATERIAL (Agent C) — material #3 of the ≤4 budget
// -----------------------------------------------------------------------------
// Transparent convex cornea cap over each eye (canon §4.3, §5). A single
// MeshPhysicalMaterial gives the specular catchlights that buy enormous realism
// on the photoreal eyes. This is the ONE transparent layer permitted over the
// eye (overdraw law: <=3 additive/transparent layers under any pixel).
//
// Reused for ALL seven eyes (shared instance) so it stays one material.
// -----------------------------------------------------------------------------
import * as THREE from 'three';

export function buildCorneaMaterial(opts = {}) {
  const {
    transmission = 0.65,   // subtle refraction of the iris behind
    clearcoat = 1.0,       // sharp catchlight highlight
    roughness = 0.04,
    ior = 1.376,           // human cornea IOR
    thickness = 0.35,
  } = opts;

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness,
    transmission,
    thickness,
    ior,
    clearcoat,
    clearcoatRoughness: 0.03,
    transparent: true,
    depthWrite: false,       // don't occlude the sclera/iris behind it
    side: THREE.FrontSide,
    envMapIntensity: 1.0,
    specularIntensity: 1.0,
  });
  // faint moisture reflectivity even without an env map (lights give catchlights)
  mat.attenuationColor = new THREE.Color(0xeaf3f7);
  mat.attenuationDistance = 1.2;
  return mat;
}

export default buildCorneaMaterial;
