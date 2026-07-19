// SERAPHIM EYE MATERIAL (Agent C) — material #2 of the ≤4 budget
// -----------------------------------------------------------------------------
// Thin wrapper Agent B's eye.js can consume. Agent B owns the eye TEXTURES
// (sclera_albedo.jpg, iris_albedo.jpg, iris_bump.jpg) and geometry; this builder
// packages them into the single sclera+iris albedo material. Keeping eye (#2)
// and cornea (#3) as distinct shared materials holds the 4-material budget.
//
// If Agent B's maps are absent (Wave 1), a small procedural fallback texture is
// generated at runtime so the material-harness can render an eye standalone.
// The loader MUST prefer real maps when provided.
// -----------------------------------------------------------------------------
import * as THREE from 'three';

// build a cheap procedural sclera/iris fallback (bloodshot ivory + blue iris)
function proceduralEyeTexture(size = 512, iris = false) {
  const cv = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(size, size) : document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  if (iris) {
    const g = c.createRadialGradient(size/2, size/2, size*0.05, size/2, size/2, size*0.5);
    g.addColorStop(0.0, '#0a0a0c');          // pupil
    g.addColorStop(0.16, '#0a0a0c');
    g.addColorStop(0.22, '#3a6b82');
    g.addColorStop(0.6, '#7fb4c9');          // glacial blue body
    g.addColorStop(0.9, '#4a7d94');          // limbal ring
    g.addColorStop(1.0, '#2e5468');
    c.fillStyle = g; c.fillRect(0, 0, size, size);
    // radial iris fibers
    c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 1;
    for (let i = 0; i < 220; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = size * (0.17 + Math.random() * 0.04), r1 = size * (0.4 + Math.random() * 0.08);
      c.beginPath();
      c.moveTo(size/2 + Math.cos(a)*r0, size/2 + Math.sin(a)*r0);
      c.lineTo(size/2 + Math.cos(a)*r1, size/2 + Math.sin(a)*r1);
      c.stroke();
    }
  } else {
    c.fillStyle = '#f3ede4'; c.fillRect(0, 0, size, size);      // ivory sclera
    for (let i = 0; i < 90; i++) {                              // capillaries
      c.strokeStyle = `rgba(150,40,30,${(0.06 + Math.random()*0.15).toFixed(2)})`;
      c.lineWidth = 0.6 + Math.random()*1.4;
      let x = Math.random()*size, y = Math.random()*size;
      c.beginPath(); c.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (Math.random()-0.5)*40; y += (Math.random()-0.5)*40; c.lineTo(x, y); }
      c.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// buildEyeMaterial({ scleraMap?, irisMap?, bumpMap?, roughness?, tint? })
// Returns ONE MeshStandardMaterial. Agent B passes real maps; when omitted a
// procedural fallback is used. `tint` (Color) allows the +/-5% per-eye variation
// the canon asks for without cloning the material (apply via material.color).
export function buildEyeMaterial(opts = {}) {
  const {
    scleraMap = null,
    irisMap = null,
    bumpMap = null,
    roughness = 0.35,
    tint = 0xffffff,
    procedural = 'sclera', // 'sclera' | 'iris' — which fallback to bake if no map
  } = opts;

  const map = scleraMap || irisMap || proceduralEyeTexture(scleraMap ? 2048 : 512, procedural === 'iris');
  const mat = new THREE.MeshStandardMaterial({
    map,
    bumpMap: bumpMap || null,
    bumpScale: bumpMap ? 0.6 : 0.0,
    roughness,
    metalness: 0.0,
    color: new THREE.Color(tint),
  });
  mat.userData.isFallback = !(scleraMap || irisMap);
  mat.userData.setRoughness = (r) => { mat.roughness = r; };
  return mat;
}

export { proceduralEyeTexture };
export default buildEyeMaterial;
