// SERAPHIM — voxel feather geometry (Agent A, Wave 1)
// ---------------------------------------------------------------------------
// buildFeather(opts) -> ONE merged voxel BufferGeometry.
//   * ~40-60 small voxels forming rachis (central quill) + barbs (vane) + torn tip
//   * droop  z(u) = k*u^2  along the quill (u = normalized length param 0..1)
//   * slight width taper toward the tip
//   * ORIGIN AT THE QUILL ROOT (pivot discipline, canon 7.3)
//   * hidden interior faces STRIPPED: we build a voxel occupancy grid and only
//     emit a box face where the neighbouring voxel is empty, so no shared/internal
//     quads are generated. Triangle count lands far below the naive 12*N.
//   * per-vertex `localUv` in [0,1]^2 across the feather quad (rachis at u=0.5,
//     root->tip along +v) for the scripture atlas (see contract SCRIPTURE ATLAS).
//   * 4 shape variants selected/derived from opts.variantSeed.
//
// Base feather is built at UNIT LENGTH (root at y=0, tip at y=1). The wing scales
// each instance by its per-instance aLen in the vertex shader.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// deterministic PRNG (mulberry32)
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// unit-cube face templates. corner order is CCW seen from outside (outward normal).
const FACES = [
  { d: [1, 0, 0],  n: [1, 0, 0],  c: [[.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [.5, -.5, .5]] },
  { d: [-1, 0, 0], n: [-1, 0, 0], c: [[-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-.5, -.5, -.5]] },
  { d: [0, 1, 0],  n: [0, 1, 0],  c: [[-.5, .5, -.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5]] },
  { d: [0, -1, 0], n: [0, -1, 0], c: [[-.5, -.5, .5], [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5]] },
  { d: [0, 0, 1],  n: [0, 0, 1],  c: [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]] },
  { d: [0, 0, -1], n: [0, 0, -1], c: [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]] },
];

// four shape presets, chosen by (variantSeed & 3)
const VARIANTS = [
  { LEN: 12, HW: 3, taper: 0.35, tear: 0.30, curve: 0.6 }, // broad
  { LEN: 13, HW: 2, taper: 0.45, tear: 0.22, curve: 0.9 }, // narrow / long
  { LEN: 12, HW: 3, taper: 0.30, tear: 0.45, curve: 0.7 }, // ragged / torn
  { LEN: 11, HW: 3, taper: 0.40, tear: 0.35, curve: 0.5 }, // short / stout
];

export function buildFeather(opts = {}) {
  const seed = (opts.variantSeed | 0) || 1;
  const V = VARIANTS[((seed % 4) + 4) % 4];
  const rand = rng(seed * 2654435761);

  const LEN = opts.length ? Math.max(6, Math.round(opts.length)) : V.LEN; // voxels along quill
  const HW = V.HW;                     // max half-width in voxels
  const sy = 1 / LEN;                  // voxel size => total length exactly 1.0
  const sx = sy;                       // square-ish voxels in-plane
  const sz = sy * 0.8;                 // thin feather (single z-layer)
  const totalLen = 1.0;
  const halfWmax = (HW + 1) * sx;      // for localUv.x normalisation
  const droopK = opts.droopK != null ? opts.droopK : 0.14;
  const taper = V.taper;

  // ---- 1. voxel occupancy ------------------------------------------------
  const occ = new Set();
  const key = (x, y) => x + ',' + y + ',0';
  for (let gy = 0; gy < LEN; gy++) {
    const fy = (gy + 0.5) / LEN;
    occ.add(key(0, gy)); // rachis (central quill) always present
    // vane profile: thin quill at the base, widening to a mid-vane, tapering to tip
    const rampUp = THREE.MathUtils.smoothstep(fy, 0.0, 0.14);
    let r = Math.round(HW * Math.pow(Math.max(0, 1 - fy), V.curve) * rampUp);
    for (let s = -1; s <= 1; s += 2) {
      for (let b = 1; b <= r; b++) {
        // torn tip / ragged edge: probabilistically drop outer distal barbs
        const distal = THREE.MathUtils.smoothstep(fy, 0.55, 1.0);
        const edge = b / Math.max(1, r);
        if (rand() < V.tear * distal * edge) continue;
        occ.add(key(s * b, gy));
      }
    }
  }

  // ---- 2. emit only faces that touch empty space, one geo per voxel ------
  const geos = [];
  let faceCount = 0;
  const cornerToLocal = (gx, gy, ox, oy, oz) => {
    let px = (gx + ox) * sx;
    const py = (gy + 0.5 + oy) * sy;   // root at py=0
    let pz = (0 + oz) * sz;
    const fy = py / totalLen;
    const uRaw = 0.5 + px / (2 * halfWmax); // localUv.x (pre-taper, stable atlas mapping)
    px *= (1 - taper * fy);            // width taper (function of y => watertight)
    pz += droopK * fy * fy;            // droop (function of y => watertight)
    return { p: [px, py, pz], uv: [THREE.MathUtils.clamp(uRaw, 0, 1), THREE.MathUtils.clamp(fy, 0, 1)] };
  };

  for (const cell of occ) {
    const [gx, gy] = cell.split(',').map(Number);
    const pos = [], nrm = [], uv = [];
    for (const F of FACES) {
      const nx = gx + F.d[0], ny = gy + F.d[1], nz = 0 + F.d[2];
      if (nz === 0 && occ.has(nx + ',' + ny + ',0')) continue; // neighbour present -> interior face, skip
      faceCount++;
      const q = F.c.map(([ox, oy, oz]) => cornerToLocal(gx, gy, ox, oy, oz));
      const tris = [[0, 1, 2], [0, 2, 3]];
      for (const t of tris) for (const idx of t) {
        pos.push(q[idx].p[0], q[idx].p[1], q[idx].p[2]);
        nrm.push(F.n[0], F.n[1], F.n[2]);
        uv.push(q[idx].uv[0], q[idx].uv[1]);
      }
    }
    if (!pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('localUv', new THREE.Float32BufferAttribute(uv, 2));
    geos.push(g);
  }

  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  merged.userData.triangles = faceCount * 2;
  merged.userData.voxels = occ.size;
  merged.userData.variant = ((seed % 4) + 4) % 4;
  return merged;
}
