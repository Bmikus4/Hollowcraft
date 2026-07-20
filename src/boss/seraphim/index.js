// ============================================================================
// SERAPHIM BOSS — ASSEMBLY (Agent E, Wave 2)
// ----------------------------------------------------------------------------
// class SeraphimModel — composes the Wave-1 parts (A wings/feathers, B eye
// textures + gaze math, C materials/fx/lighting, D fractal is separate) into the
// finished, rigged, budget-reconciled boss and exposes the PUBLIC API in
// docs/seraphim-contracts.md §API.
//
// WHOLE-BOSS BUDGET RECONCILIATION (contracts §WAVE 2 MANDATES — the core job):
//  * DRAW CALLS: 6 wing InstancedMeshes + 5 eye InstancedMeshes (all 7 eyes,
//    central folded in as instance 0) + 1 core feather mass + 2 fx (beam,embers)
//    = 14 at NEAR. LOD far = ONE silhouette (a SWAP, hidden at near).
//  * MATERIALS (canon §5 four ROLES): body/feathers (#1, wings+core share ONE
//    compiled program + ONE atlas), eyes (#2 sclera+iris+lids), cornea (#3),
//    fx (#4). Every material carries userData.seraphRole for auditing.
//  * TRIANGLES ≤ 150k: feather voxel count trimmed via a low-voxel base geometry
//    swapped into each wing; eyes use shared LOW-POLY geometry (all 7 instanced);
//    core mass kept ≤ ~10k. Measured in boss-harness → window.__diag.
//
// Central-eye laser folds central into the instanced band yet keeps an
// independent charge channel (per-instance aCharge + aUvScale) so the terror
// beat still reads — this is how ≤5 eye draw calls AND the charge telegraph
// coexist (Agent B kept the central separate = 10 dc; assembly consolidates).
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildWing } from './geometry/wing.js';
import { buildFeather } from './geometry/feather.js';
import { loadEyeTextures } from './geometry/eye.js';
import {
  buildBodyMaterial, makeAtlasTexture,
  buildEyeMaterial, buildCorneaMaterial,
  makeBeam, makeEmbers, createFxMaterial, addSeraphLighting,
} from './materials/index.js';
import { Rig } from './animation/rig.js';
import { LaserFx } from './animation/laser.js';
import { PRESETS, DEFAULT_STATE } from './animation/presets.js';

// core height (world units at model scale 1). Under the game's boss scale
// (WRETCH_DEMON_SCALE 1.52 × 2.0 = 3.04) the tip-to-tip span lands ~50 m, inside
// canon's 30–60 m target — see SEAM note. Exposed via opts.scale on the root.
const H = 6;
const FORWARD = new THREE.Vector3(0, 0, 1);
const PUPIL_Z = 0.93;

// lid rotation range (ported from Agent B's eye.js so blink/peel read identically)
const LID_OPEN = 0.16, LID_CLOSED = 1.30, LID_PEEL = -0.18;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const expRand = (mean) => -mean * Math.log(1 - Math.random());

// ---------------------------------------------------------------------------
// LOW-POLY shared eye geometry (all 7 eyes instanced off these) — canon-faithful
// shapes at reduced segment counts (mandate 3: drop eye sphere segments).
// ---------------------------------------------------------------------------
let _eyeGeo = null;
function eyeGeos() {
  if (_eyeGeo) return _eyeGeo;
  const scleraGeo = new THREE.SphereGeometry(1, 18, 12).rotateY(-Math.PI / 2);

  // concave iris disc hugging the sclera front (parallax); planar UV centre→centre
  function irisGeo(diskR = 0.62, Rsurf = 1.03, recess = 0.028, rings = 12, seg = 28) {
    const pos = [], uv = [], idx = [];
    for (let ri = 0; ri <= rings; ri++) {
      const rr = ri / rings, pr = diskR * rr;
      const z = Math.sqrt(Math.max(0, Rsurf * Rsurf - pr * pr)) - recess * (1 - rr * rr);
      for (let si = 0; si <= seg; si++) {
        const a = si / seg * Math.PI * 2, x = Math.cos(a) * pr, y = Math.sin(a) * pr;
        pos.push(x, y, z); uv.push(0.5 + x / (2 * diskR), 0.5 - y / (2 * diskR));
      }
    }
    for (let ri = 0; ri < rings; ri++) for (let si = 0; si < seg; si++) {
      const a = ri * (seg + 1) + si, b = a + 1, c = a + (seg + 1), d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // convex cornea cap bulging just beyond the sclera front
  function corneaGeo(diskR = 0.66, Rsurf = 1.05, rings = 8, seg = 28) {
    const pos = [], idx = [];
    for (let ri = 0; ri <= rings; ri++) {
      const rr = ri / rings, pr = diskR * rr, z = Math.sqrt(Math.max(0, Rsurf * Rsurf - pr * pr));
      for (let si = 0; si <= seg; si++) { const a = si / seg * Math.PI * 2; pos.push(Math.cos(a) * pr, Math.sin(a) * pr, z); }
    }
    for (let ri = 0; ri < rings; ri++) for (let si = 0; si < seg; si++) {
      const a = ri * (seg + 1) + si, b = a + 1, c = a + (seg + 1), d = c + 1; idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // eyelid = spherical cap around ±Y; blink = rotate the cap about X (glued to surface)
  function lidGeo(up = true, capHalf = 0.82, R = 1.03, rings = 8, seg = 26) {
    const pos = [], idx = [];
    for (let i = 0; i <= rings; i++) {
      const th = (i / rings) * capHalf, cy = Math.cos(th) * (up ? 1 : -1), sr = Math.sin(th);
      for (let j = 0; j <= seg; j++) { const ph = (j / seg) * Math.PI * 2; pos.push(sr * Math.cos(ph) * R, cy * R, sr * Math.sin(ph) * R); }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + 1, c = a + (seg + 1), d = c + 1;
      if (up) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }

  _eyeGeo = { sclera: scleraGeo, iris: irisGeo(), cornea: corneaGeo(), lidU: lidGeo(true), lidL: lidGeo(false) };
  return _eyeGeo;
}

// ---------------------------------------------------------------------------
// buildEyeBand2 — the CONSOLIDATED seven-eye band (5 InstancedMeshes, 5 dc).
// central = instance 0 with an independent aCharge/aUvScale channel for the
// laser telegraph. Reuses Agent B's TEXTURE pipeline + gaze/saccade/blink math;
// Agent C's eye/cornea materials; low-poly geometry above.
// ---------------------------------------------------------------------------
function buildEyeBand2(opts = {}) {
  const G = eyeGeos();
  const group = new THREE.Group(); group.name = 'seraphEyeBand';

  // arc layout (central i=0, ±1..3), canon §4.3 "band of seven": size R·base^|i|.
  // F-4 spread the flanks out but pushed them too "proud" (+0.085·x, gap 1.18) so the
  // seven read as googly balls on stalks. F-5 (this pass) nestles them into a coherent
  // ridge: central eye enlarged to DOMINATE + bulge forward as the centerpiece; gap
  // tightened; the proud +z dialed right back (0.085→0.03) with a small -z seat so the
  // sclera spheres sit INTO the plumage ridge, not out on stalks. Budget-neutral: pure
  // scale/position params, same 7 instances / geometry / materials.
  const CENTRAL_SIZE = 1.24;   // dominant central eye — unmistakable centerpiece
  const CENTRAL_Z = 0.12;      // nudge the central pupil forward; nothing sits in front of it
  const sizeOf = (i) => Math.pow(0.70, Math.abs(i));
  const gap = 1.08;            // tightened 1.18→1.08 → one coherent horizontal band
  const layout = [{ i: 0, x: 0, y: 0, z: CENTRAL_Z, size: CENTRAL_SIZE }];
  for (const sign of [-1, 1]) {
    let x = 0, prev = CENTRAL_SIZE;
    for (let a = 1; a <= 3; a++) { const s = sizeOf(a); x += (prev + s) * gap; prev = s;
      // FIX-5 (user spec 07-20): the OUTER TWO eyes each side (|i|>=2) ride ON the mid wing row — same x/y
      // station, pushed forward onto the wing plane so they read as set INTO the wings, visible through them.
      layout.push({ i: sign * a, x: sign * x, y: -0.024 * x * x, z: 0.03 * x - 0.05 + (a >= 2 ? 0.48 : 0), size: s }); }
  }
  layout.sort((p, q) => p.i - q.i);                 // -3..3, central at centre
  const N = layout.length;                          // 7

  // ---- materials (Agent C) — sclera+iris+lids = eye ROLE #2, cornea = #3 -----
  const scleraMat = buildEyeMaterial({ procedural: 'sclera', roughness: 0.35 });
  scleraMat.userData.seraphRole = 'eye';
  const irisMat = buildEyeMaterial({ procedural: 'iris', roughness: 0.22 });
  irisMat.side = THREE.DoubleSide;
  irisMat.userData.seraphRole = 'eye';
  // per-instance pupil dilation (aUvScale) + laser charge emissive (aCharge)
  irisMat.onBeforeCompile = (shader) => {
    shader.uniforms.uChargeColor = { value: new THREE.Color(0x59d0ff) };
    shader.vertexShader = 'attribute float aUvScale;\nattribute float aCharge;\nvarying float vCharge;\n' + shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
       #ifdef USE_MAP
         vMapUv = (vMapUv - 0.5) / max(aUvScale, 0.01) + 0.5;
       #endif
       #ifdef USE_BUMPMAP
         vBumpMapUv = (vBumpMapUv - 0.5) / max(aUvScale, 0.01) + 0.5;
       #endif
       vCharge = aCharge;`);
    shader.fragmentShader = 'uniform vec3 uChargeColor;\nvarying float vCharge;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       totalEmissiveRadiance += uChargeColor * vCharge * 2.4;`);
    irisMat.userData.shader = shader;
  };
  irisMat.customProgramCacheKey = () => 'seraphIrisInst';

  const corneaMat = buildCorneaMaterial({ transmission: 0 });   // clearcoat-only (B's finding: transmission = extra pass)
  corneaMat.opacity = 0.16;                                      // thin transparent dome (else it hides the iris)
  corneaMat.userData.seraphRole = 'cornea';
  const lidMat = new THREE.MeshStandardMaterial({ color: 0xe7d9c6, roughness: 0.72, metalness: 0.0, side: THREE.DoubleSide });
  lidMat.userData.seraphRole = 'eye';

  // ---- 5 InstancedMeshes (7 instances each) ---------------------------------
  const irisGeoInst = G.iris.clone();
  const aUvScale = new Float32Array(N).fill(1);
  const aCharge = new Float32Array(N).fill(0);
  irisGeoInst.setAttribute('aUvScale', new THREE.InstancedBufferAttribute(aUvScale, 1));
  irisGeoInst.setAttribute('aCharge', new THREE.InstancedBufferAttribute(aCharge, 1));

  // A3 draw-call reclaim: MERGE the two eyelid meshes into ONE InstancedMesh (14
  // instances) so the eye band is 4 draw calls not 5. Both lids share ONE geometry
  // (the +Y cap G.lidU) and ONE material; the LOWER lids are the same cap flipped in
  // Y via a negative-determinant instance matrix (lidMat is DoubleSide so the winding
  // flip renders fine). Instances 0..N-1 = upper lids, N..2N-1 = lower lids.
  const im = {
    sclera: new THREE.InstancedMesh(G.sclera, scleraMat, N),
    iris: new THREE.InstancedMesh(irisGeoInst, irisMat, N),
    cornea: new THREE.InstancedMesh(G.cornea, corneaMat, N),
    lid: new THREE.InstancedMesh(G.lidU, lidMat, N * 2),
  };
  im.cornea.renderOrder = 3;
  for (const k of Object.keys(im)) { im[k].frustumCulled = false; group.add(im[k]); }

  // central-tracking pivot so the laser socket inherits the central gaze
  const centralPivot = new THREE.Object3D();
  group.add(centralPivot);
  const laserSocket = new THREE.Object3D(); laserSocket.name = 'laserSocket';
  laserSocket.position.set(0, 0, CENTRAL_Z + PUPIL_Z * CENTRAL_SIZE);   // pupil depth of the now-enlarged, forward central eye
  centralPivot.add(laserSocket);

  // ---- per-eye state --------------------------------------------------------
  const eyes = layout.map((l, k) => ({
    l, k, isC: l.i === 0, ring: Math.abs(l.i),
    pivot: new THREE.Object3D(),
    curQ: new THREE.Quaternion(), goalQ: new THREE.Quaternion(),
    offset: new THREE.Vector3(),
    nextSacc: expRand(opts.saccadeMean || 1.5),
    jitterPh: Math.random() * 7,
    blinkActive: false, blinkT: 0, blinkAmt: 0,
    nextBlink: 1 + expRand(opts.blinkMean || 5.5),
    deathClose: 0,
  }));
  eyes.forEach(e => { e.pivot.position.set(e.l.x, e.l.y, e.l.z); e.pivot.scale.setScalar(e.l.size); });

  // per-eye tint ±5% (canon §4.3)
  eyes.forEach(e => {
    // bloodshot ivory sclera, faint ±tint per eye (canon §4.3)
    im.sclera.setColorAt(e.k, new THREE.Color(0xf1e7d9).offsetHSL(0, (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.04));
    im.iris.setColorAt(e.k, new THREE.Color(1, 1, 1).offsetHSL(0, 0, (Math.random() - 0.5) * 0.05));
    if (!e.isC) aUvScale[e.k] = 0.92 + Math.random() * 0.22;
  });
  if (im.sclera.instanceColor) im.sclera.instanceColor.needsUpdate = true;
  if (im.iris.instanceColor) im.iris.instanceColor.needsUpdate = true;

  // ---- gaze / blink ---------------------------------------------------------
  const target = new THREE.Vector3(0, 0, 30);
  const targetLocal = new THREE.Vector3();
  const _v = new THREE.Vector3();
  const BLINK = { close: 0.08, hold: 0.04, open: 0.2 };
  const blinkValue = (t) => t < BLINK.close ? t / BLINK.close : (t < BLINK.close + BLINK.hold ? 1 : (1 - (t - BLINK.close - BLINK.hold) / BLINK.open));
  function damp(q, goal, k, dt) { q.slerp(goal, 1 - Math.exp(-k * dt)); }
  function goalFor(e, wander, elapsed) {
    group.worldToLocal(targetLocal.copy(target));
    _v.copy(targetLocal).sub(e.pivot.position);
    if (wander) {
      _v.add(e.offset);
      _v.x += Math.sin(elapsed * 7.3 + e.jitterPh) * 0.02;
      _v.y += Math.sin(elapsed * 9.1 + e.jitterPh * 1.7) * 0.02;
    }
    if (_v.lengthSq() < 1e-6) { e.goalQ.identity(); return; }
    _v.normalize(); e.goalQ.setFromUnitVectors(FORWARD, _v);
  }

  let gazeMode = 'wander';
  let chargeX = 0;

  const tmp = new THREE.Matrix4(), tmpR = new THREE.Matrix4();
  const _flipY = new THREE.Matrix4().makeScale(1, -1, 1);   // upper-lid cap → lower-lid cap

  const api = {
    group, laserSocket, eyes, layout,
    object3d: group,
    setGazeMode(m) { gazeMode = m; },
    setGazeTarget(v) { target.copy(v); },
    lookAt(v) { target.copy(v); },
    setCharge(x) { chargeX = clamp(x, 0, 1); },
    setDeathClose(perRing) { eyes.forEach(e => { e.deathClose = perRing[Math.min(3, e.ring)] || 0; }); },

    telegraphBlink() {
      for (const e of eyes) { goalFor(e, false, 0); e.curQ.copy(e.goalQ); e.blinkActive = true; e.blinkT = 0; e.nextBlink = 4 + expRand(opts.blinkMean || 5.5); }
    },

    applyTextures(tex) {
      scleraMat.map = tex.sclera; scleraMat.map.colorSpace = THREE.SRGBColorSpace; scleraMat.needsUpdate = true;
      irisMat.map = tex.iris; irisMat.map.colorSpace = THREE.SRGBColorSpace; irisMat.bumpMap = tex.bump; irisMat.bumpScale = 0.35; irisMat.needsUpdate = true;
      api.texSource = tex.source;
    },

    update(dt, elapsed) {
      dt = Math.min(dt, 0.05);
      const wander = gazeMode !== 'track';
      for (const e of eyes) {
        if (e.isC || !wander) { goalFor(e, false, elapsed); damp(e.curQ, e.goalQ, e.isC ? 16 : 20, dt); }
        else {
          if (elapsed >= e.nextSacc) {
            if (Math.random() < 0.3) e.offset.set(0, 0, 0);
            else e.offset.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 9, 0);
            e.nextSacc = elapsed + expRand(opts.saccadeMean || 1.5);
          }
          goalFor(e, true, elapsed); damp(e.curQ, e.goalQ, 24, dt);
        }
        e.pivot.quaternion.copy(e.curQ);

        // Poisson blink, guard all-at-once
        if (!e.blinkActive && elapsed >= e.nextBlink) {
          const blinking = eyes.reduce((n, x) => n + (x.blinkActive ? 1 : 0), 0);
          if (blinking >= 3) e.nextBlink = elapsed + 0.3; else { e.blinkActive = true; e.blinkT = 0; }
        }
        if (e.blinkActive) {
          e.blinkT += dt; e.blinkAmt = blinkValue(e.blinkT);
          if (e.blinkT >= BLINK.close + BLINK.hold + BLINK.open) { e.blinkActive = false; e.blinkAmt = 0; e.nextBlink = elapsed + expRand(opts.blinkMean || 5.5); }
        }
        e.pivot.updateMatrix();
      }

      // central charge channel + laser socket follows central gaze
      const cen = eyes.find(e => e.isC);
      centralPivot.quaternion.copy(cen.curQ);
      aCharge[cen.k] = chargeX;
      aUvScale[cen.k] = 1 + chargeX * 0.5;                 // pupil constrict
      irisGeoInst.getAttribute('aCharge').needsUpdate = true;
      irisGeoInst.getAttribute('aUvScale').needsUpdate = true;

      // write instance matrices
      for (const e of eyes) {
        const P = e.pivot.matrix;
        im.sclera.setMatrixAt(e.k, P);
        im.iris.setMatrixAt(e.k, P);
        im.cornea.setMatrixAt(e.k, P);
        // lid rotation: blink + death close, minus charge peel on the central eye
        let close = Math.max(e.blinkAmt, e.deathClose);
        let upper = lerp(LID_OPEN, LID_CLOSED, clamp(close, 0, 1));
        if (e.isC && chargeX > 0) upper = Math.min(upper, lerp(LID_OPEN, LID_PEEL, chargeX));
        // upper lid → instance e.k ; lower lid → instance N+e.k (same +Y cap
        // geometry flipped in Y via _flipY so both share ONE InstancedMesh = 1 dc)
        tmpR.makeRotationX(upper); im.lid.setMatrixAt(e.k, tmp.multiplyMatrices(P, tmpR));
        tmpR.makeRotationX(-upper); im.lid.setMatrixAt(N + e.k, tmp.multiplyMatrices(P, tmpR).multiply(_flipY));
      }
      for (const k of Object.keys(im)) im[k].instanceMatrix.needsUpdate = true;
    },

    dispose() {
      for (const k of Object.keys(im)) im[k].dispose();
      [scleraMat, irisMat, corneaMat, lidMat].forEach(m => m.dispose());
      irisGeoInst.dispose();
      for (const g of Object.values(G)) g.dispose();
      _eyeGeo = null;
    },
  };

  api.update(0.016, 0);   // prime matrices before first render
  return api;
}

// ---------------------------------------------------------------------------
// wing configs (canon §3). Built in a common wing-local frame (leading edge +X,
// plane normal +Y, feathers grow +Z); each PAIR is oriented by a group
// quaternion; the LEFT wing of each pair lives under a negative-X mirror root.
// ---------------------------------------------------------------------------
function wingConfigs() {
  const j = (S) => [[0, 0, 0], [0.18 * S, 0, 0.02 * S], [0.55 * S, 0, 0], [1.0 * S, 0, -0.04 * S]];
  return [
    // UPPER (A1 playtest fix): the V read too CLOSED with a wedge of sky at the top
    // centre and the feathers floating free of the body. Fixes: (a) roots pulled IN
    // toward the core attach point (x 0.15H→0.06H, y 0.35H→0.37H) so the inner
    // feathers overlap the eye-band ridge and CLOSE the top gap; (b) inward tilt
    // reduced (rotZ 0.96→0.74) + slightly more outward yaw (rotY 0.52→0.60) so the
    // pair OPENS into a broad V of attached wings instead of two near-vertical blades.
    // FIX-3 (user spec 07-20): ALL feather planes pulled to ONE depth — the big central eye's midpoint
    // (CENTRAL_Z = 0.12 = 0.02H in the core frame) — so the eye's front half proudly leads the plumage.
    { key: 'upper', span: 1.2 * H, pos: [0.06 * H, 0.37 * H, 0.02 * H], rotY: 0.60, rotZ: 0.74, omegaMul: 1.0,
      droopK: 0.12, fanScale: 1.15, variantSeed: 1, voxLen: 7,
      flap: { ampHumerus: 0.60, ampRadius: 0.42, ampCarpus: 0.34, phase: 0.0, phi: 0.6 } },
    // UPPER-MID (A2 playtest addition): NEW 4th pair, sits BELOW the upper V and
    // ABOVE the lateral mid pair. Interpolates upper(pitch ~55°,yaw ~30°,1.2H) →
    // mid(horizontal,yaw ~80°,1.0H): pitch up ~24° (rotZ 0.42), modest yaw (rotY 0.18),
    // span 1.1H, its own desync phase (+π/6, between upper 0 and mid +π/3) and ω
    // (0.8, between 1.0 and 0.6). Slightly lower feather resolution (voxLen 6) per A3.
    { key: 'uppermid', span: 1.1 * H, pos: [0.22 * H, 0.17 * H, 0.02 * H], rotY: 0.18, rotZ: 0.42, omegaMul: 0.8,
      droopK: 0.14, fanScale: 1.05, variantSeed: 4, voxLen: 6,
      flap: { ampHumerus: 0.44, ampRadius: 0.31, ampCarpus: 0.25, phase: Math.PI / 6, phi: 0.6 } },
    { key: 'mid', span: 1.0 * H, pos: [0.30 * H, 0.0, 0.02 * H], rotY: -0.32, rotZ: -0.17, omegaMul: 0.6,
      droopK: 0.16, fanScale: 1.0, variantSeed: 2, voxLen: 7,
      flap: { ampHumerus: 0.28, ampRadius: 0.20, ampCarpus: 0.16, phase: Math.PI / 3, phi: 0.6 } },
    { key: 'lower', span: 1.3 * H, pos: [0.12 * H, -0.30 * H, 0.02 * H], rotY: 0.22, rotZ: -1.15, omegaMul: 0.3,
      droopK: 0.30, fanScale: 0.9, variantSeed: 3, voxLen: 7,
      flap: { ampHumerus: 0.12, ampRadius: 0.08, ampCarpus: 0.06, phase: Math.PI / 2, phi: 0.6 } },
  ];
}

// swap a lower-voxel feather base into a built wing's InstancedMesh, preserving
// its per-instance attributes → the triangle-budget lever (mandate 3). Returns
// the base feather triangle count.
function trimWingFeathers(wing, cfg, voxLen) {
  const oldGeo = wing.instancedMesh.geometry;
  const lowGeo = buildFeather({ variantSeed: cfg.variantSeed || 1, droopK: cfg.droopK, length: voxLen });
  for (const name of ['aSegment', 'aRestOffset', 'aRestQuat', 'aPhase', 'aRow', 'aStain', 'aLen', 'aVariant']) {
    const attr = oldGeo.getAttribute(name);
    if (attr) lowGeo.setAttribute(name, attr);
  }
  lowGeo.instanceCount = oldGeo.instanceCount;
  wing.instancedMesh.geometry = lowGeo;
  // NOTE: don't dispose oldGeo — its InstancedBufferAttributes are now shared with
  // lowGeo (disposing would free buffers lowGeo still uses). oldGeo has no other
  // refs and was never GPU-uploaded (swap happens before first render) → GC frees it.
  return lowGeo.userData.triangles || 0;
}

// core feather mass: ONE InstancedMesh sharing the body material (canon §5). ≤ ~10k tris.
// FIX-2 LAYOUT (user spec): a radial MANTLE that sits BEHIND the eye band, echoing the
// eight outer wings — one SEED feather at the inward edge (root) of each wing, then a
// flanker to each seed's left and right stepped slightly inward, and every remaining
// feather filling the inner disc. All feathers lie in a back plane (flat face forward,
// tips pointing radially out), so the red reads as layered plumage instead of a blob,
// and nothing can occlude the eyes.
function buildCoreMass(bodyMat, count = 46, voxLen = 7) {
  const geo = buildFeather({ variantSeed: 3, droopK: 0.22, length: voxLen });
  const n = count;
  const aSegment = new Float32Array(n);
  const aRestOffset = new Float32Array(n * 3);
  const aRestQuat = new Float32Array(n * 4);
  const aPhase = new Float32Array(n);
  const aRow = new Float32Array(n).fill(3);
  const aStain = new Float32Array(n);
  const aLen = new Float32Array(n);
  const aVariant = new Float32Array(n);
  const q = new THREE.Quaternion(), qt = new THREE.Quaternion(), e = new THREE.Euler(), off = new THREE.Vector3();
  const XAXIS = new THREE.Vector3(1, 0, 0);
  // the 8 wing-root anchors (both sides of the 4 pairs), XY in the core frame —
  // KEEP IN SYNC with wingConfigs() pos[].
  const roots = [];
  for (const p of [[0.06, 0.37], [0.22, 0.17], [0.30, 0.00], [0.12, -0.30]])
    for (const s of [1, -1]) roots.push([p[0] * s * H, p[1] * H]);
  // build the placement list: 8 seeds → 16 inward-stepped flankers → central fill
  const spots = [];
  for (const [rx, ry] of roots) {
    const th = Math.atan2(ry, rx), r = Math.hypot(rx, ry);
    spots.push({ th, r, len: 0.52, layer: 0, stain: 0.78 });                                    // seed at the wing's inward edge
    for (const s of [1, -1]) spots.push({ th: th + s * 0.26, r: r * 0.76, len: 0.40, layer: 1, stain: 0.85 });  // left+right, shifted inward
  }
  // FIX-4 (user spec 07-20): a full ring of SMALL red feathers directly behind the outermost (seed) row…
  for (let i = 0; i < 20; i++) { const th = i / 20 * 6.283 + 0.157;
    spots.push({ th, r: 0.345 * H, len: 0.30, layer: 3, stain: 0.94 }); }
  // …and MASSIVE red plumes as an UNDER-FRINGE (user spec 07-20 v2): rooted near the centre so their TIPS poke
  // just past the inner feathers' tips, and pushed a full layer further back — a great dark layer BEHIND the plumage
  for (let i = 0; i < 12; i++) { const th = (i + 0.5) / 12 * 6.283;
    spots.push({ th, r: 0.10 * H, len: 1.15, layer: 5, stain: 0.88 }); }
  while (spots.length < n) {                                                                     // the rest fill the inside
    const th = Math.random() * 6.283, rr = Math.sqrt(Math.random());
    spots.push({ th, r: (0.03 + rr * 0.17) * H, len: 0.26 + Math.random() * 0.10, layer: 2, stain: 0.90 });
  }
  for (let i = 0; i < n; i++) {
    const sp = spots[i];
    const th = sp.th + (sp.layer === 2 ? 0 : (Math.random() - 0.5) * 0.06);                      // hand-placed rows keep their slots; only a hair of jitter
    off.set(Math.cos(th) * sp.r, Math.sin(th) * sp.r, -0.030 * H * sp.layer + (Math.random() - 0.5) * 0.012 * H);   // deeper layers sit further back → visible layering
    aRestOffset.set([off.x, off.y, off.z], i * 3);
    q.setFromEuler(e.set(0, 0, th - Math.PI / 2));                                               // feather +Y (length axis) points radially OUTWARD
    qt.setFromAxisAngle(XAXIS, -(0.08 + Math.random() * 0.14)); q.multiply(qt);                  // slight lean away from the viewer for depth
    aRestQuat.set([q.x, q.y, q.z, q.w], i * 4);
    aPhase[i] = Math.random() * 6.283;
    aLen[i] = sp.len * H * 0.5;                                                                  // seeds longest → fill shortest: the mantle tapers inward
    aStain[i] = sp.stain + (Math.random() - 0.5) * 0.06;                                         // stain deepens toward the centre; per-feather variance keeps edges readable
    aVariant[i] = i % 4;
  }
  geo.setAttribute('aSegment', new THREE.InstancedBufferAttribute(aSegment, 1));
  geo.setAttribute('aRestOffset', new THREE.InstancedBufferAttribute(aRestOffset, 3));
  geo.setAttribute('aRestQuat', new THREE.InstancedBufferAttribute(aRestQuat, 4));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
  geo.setAttribute('aRow', new THREE.InstancedBufferAttribute(aRow, 1));
  geo.setAttribute('aStain', new THREE.InstancedBufferAttribute(aStain, 1));
  geo.setAttribute('aLen', new THREE.InstancedBufferAttribute(aLen, 1));
  geo.setAttribute('aVariant', new THREE.InstancedBufferAttribute(aVariant, 1));
  const mesh = new THREE.InstancedMesh(geo, bodyMat, n);
  const id = new THREE.Matrix4();
  for (let i = 0; i < n; i++) mesh.setMatrixAt(i, id);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return { mesh, tris: (geo.userData.triangles || 0) * n };
}

// cheap far-LOD silhouette: merged boxes for the butterfly, baked in 3 flap poses
function buildSilhouette(mat) {
  const grp = new THREE.Group();
  const poses = [-0.5, 0.0, 0.5];
  const wingSpec = [
    { off: [0.9, 2.1, 0], rot: [0, 0.5, 0.96], scl: [7.2, 0.4, 3.0] },   // upper
    { off: [1.8, 0, 0], rot: [0, -0.3, -0.17], scl: [6.0, 0.4, 3.6] },    // mid
    { off: [0.7, -1.8, 0.3], rot: [0, 0.2, -1.15], scl: [7.8, 0.4, 2.4] },// lower
  ];
  const meshes = [];
  for (const flap of poses) {
    const geos = [];
    const band = new THREE.BoxGeometry(H * 1.6, H * 0.5, H * 0.5); band.translate(0, 0, 0); geos.push(band);
    for (const w of wingSpec) for (const s of [1, -1]) {
      const g = new THREE.BoxGeometry(w.scl[0], w.scl[1], w.scl[2]);
      g.translate(w.scl[0] * 0.5, 0, 0);
      const e = new THREE.Euler(w.rot[0], w.rot[1] * s, (w.rot[2] + flap) * s, 'XYZ');
      g.applyQuaternion(new THREE.Quaternion().setFromEuler(e));
      g.translate(w.off[0] * s, w.off[1], w.off[2]);
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    const m = new THREE.Mesh(merged, mat); m.visible = flap === 0;
    grp.add(m); meshes.push(m);
  }
  grp.userData.setPose = (flapPhase) => {
    const idx = flapPhase < -0.2 ? 0 : (flapPhase > 0.2 ? 2 : 1);
    meshes.forEach((m, i) => { m.visible = i === idx; });
  };
  return grp;
}

// ===========================================================================
export class SeraphimModel {
  constructor(opts = {}) {
    this.renderer = opts.renderer || null;
    this.camera = opts.camera || null;
    this.scene = opts.scene || null;
    this.quality = opts.quality || 'high';
    this.raycastFn = opts.raycastFn || null;
    const scale = opts.scale != null ? opts.scale : 1;

    // root is an LOD (near = full boss, far = silhouette SWAP). Lights parent to
    // the LOD directly so they stay lit at any level.
    this.lod = new THREE.LOD();
    this.lod.name = 'SeraphimModel';
    this.object3d = this.lod;
    this.lod.scale.setScalar(scale);

    this.bodyGroup = new THREE.Group();     // lean + drop live here
    this.core = new THREE.Group();          // holds wings/eyes/core-mass
    this.bodyGroup.add(this.core);

    const fullGroup = new THREE.Group();
    fullGroup.add(this.bodyGroup);
    this.lod.addLevel(fullGroup, 0);

    // ---- shared body material (ONE program + ONE atlas across wings + core) --
    this.atlas = makeAtlasTexture(2048, this.renderer);
    this._bodyMats = [];

    // ---- EIGHT wings (4 mirrored pairs: upper, upper-mid, mid, lower) --------
    // triangle-budget lever: per-config voxel resolution (A3). Two extra wings would
    // push tris toward/over 150k at the old voxLen 9, so the base feather voxel count
    // is trimmed (cfg.voxLen, ~6-7 vs the old 9) — measured in boss-harness __diag.
    const defVoxLen = this.quality === 'low' ? 6 : 7;
    this.wings = [];
    this.mirrorL = new THREE.Group(); this.mirrorL.scale.x = -1; this.core.add(this.mirrorL);
    let wingTris = 0;
    for (const cfg of wingConfigs()) {
      const voxLen = cfg.voxLen != null ? cfg.voxLen : defVoxLen;
      for (const side of [+1, -1]) {
        const mat = buildBodyMaterial({ atlas: this.atlas, renderer: this.renderer, emberStrength: 0.42, sssStrength: 0.3 });
        mat.userData.seraphRole = 'body';
        this._bodyMats.push(mat);
        const S = cfg.span;
        const wing = buildWing({
          side, span: S, normal: [0, 1, 0],
          joints: [[0, 0, 0], [0.18 * S, 0, 0.02 * S], [0.55 * S, 0, 0], [1.0 * S, 0, -0.04 * S]],
          flap: { omega: 1.0, ...cfg.flap, beta: 0.15 }, droopK: cfg.droopK, fanScale: cfg.fanScale,
          variantSeed: cfg.variantSeed, material: mat,
        });
        wingTris += trimWingFeathers(wing, cfg, voxLen);
        const g = wing.group;
        g.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
        g.quaternion.setFromEuler(new THREE.Euler(0, cfg.rotY, cfg.rotZ, 'YZX'));
        wing._omegaMul = cfg.omegaMul; wing.span = S;   // span cached for the adapter's wing hit-spheres
        (side === +1 ? this.core : this.mirrorL).add(g);
        this.wings.push(wing);
      }
    }
    this._wingBaseTris = wingTris;

    // ---- core feather mass --------------------------------------------------
    const coreMat = buildBodyMaterial({ atlas: this.atlas, renderer: this.renderer, emberStrength: 0.3, sssStrength: 0.28 });
    coreMat.userData.seraphRole = 'body';
    this._bodyMats.push(coreMat);
    this._coreMat = coreMat;
    const cm = buildCoreMass(coreMat, this.quality === 'low' ? 64 : 78, 6);   // shorter voxel feathers → hanging plumage, not slabs (+32 = the FIX-4 small ring + massive corona)
    this.coreMass = cm.mesh;
    this.coreMass.position.set(0, 0, H * 0.02);   // FIX-3 (user spec 07-20): the mantle SEED plane sits AT the central eye's midpoint (its fill layers still step backward), matching the wing roots — one feather depth, the eyes lead it
    this.core.add(this.coreMass);
    this._coreTris = cm.tris;

    // ---- eye band (5 dc, central folded in) ---------------------------------
    this.eyeBand = buildEyeBand2({});
    this.eyeBand.group.position.set(0, H * 0.06, 0);   // FIX-1: lift the band clear above the hanging core train
    this.core.add(this.eyeBand.group);
    // FIX-5: the outer two eyes each side are ATTACHED to the mid wing row — cache refs + rest stations so
    // update() can ride them gently on the wing-beat (the wings deform in-shader; the group is static, so the
    // ride is a small phase-locked bob that sells the attachment without reparenting the instanced band).
    this._wingEyes = this.eyeBand.eyes.filter(e => Math.abs(e.l.i) >= 2).map(e => ({ e, y0: e.l.y, z0: e.l.z }));
    this.laserSocket = this.eyeBand.laserSocket;

    // ---- fx (beam + embers share ONE additive material = role #4) -----------
    this.fxRoot = new THREE.Group();
    this.bodyGroup.add(this.fxRoot);
    this.fxMat = createFxMaterial();
    this.fxMat.userData.seraphRole = 'fx';
    this.beam = makeBeam(this.fxMat);
    this.embers = makeEmbers({ material: this.fxMat, count: 8, spread: H * 0.45, size: H * 0.12 });
    this.fxRoot.add(this.beam.mesh, this.embers.mesh);
    this.embers.setOrigin(new THREE.Vector3(0, H * 0.1, 0));

    // ---- lights (Agent C rig; no composer — reuse the game's bloom) ---------
    this.lights = addSeraphLighting(this.lod, { scale: H * 0.5 });

    // ---- LOD far silhouette (SWAP) ------------------------------------------
    this.silMat = new THREE.MeshStandardMaterial({ color: 0xcabfa8, roughness: 0.9, metalness: 0.0, flatShading: true });
    this.silMat.userData.seraphRole = 'body';
    this.silhouette = buildSilhouette(this.silMat);
    this.lod.addLevel(this.silhouette, 120 * scale);

    // ---- rig + laser --------------------------------------------------------
    this.rig = new Rig({ onOverrides: (h) => { this._overrides = h; if (this._onOverrides) this._onOverrides(h); } });
    this.laser = new LaserFx({
      beam: this.beam, embers: this.embers, eyeBand: this.eyeBand,
      laserSocket: this.laserSocket, raycastFn: this.raycastFn, fxRoot: this.fxRoot,
      beamRadiusScale: H * 0.9,
    });

    // ---- hit proxies (analytic; law 4) --------------------------------------
    this.hitProxies = { eyeSphere: new THREE.Sphere(new THREE.Vector3(), H * 1.1), wingBoxes: this.wings.map(() => new THREE.Box3()), laserSocket: this.laserSocket };

    this._elapsed = 0;
    this._tmpV = new THREE.Vector3();

    // ---- async upgrade to Agent B's baked photoreal eye maps ----------------
    this.ready = loadEyeTextures({ prefer: 'baked' }).then((tex) => { this.eyeBand.applyTextures(tex); this.texSource = tex.source; return this; }).catch(() => this);

    this.setState(DEFAULT_STATE);
  }

  // ---- PUBLIC API (contracts §API) -----------------------------------------
  setState(name) { if (PRESETS[name]) { this.rig.setState(name); this._flapOverride = null; this._foldOverride = null; } return this; }
  setOmegaScale(s) { this._omegaScale = Math.max(0, s); return this; }   // harness/debug ω knob
  setFlapIntensity(x) { this._flapOverride = clamp(x, 0, 1); return this; }
  setFold(x) { this._foldOverride = clamp(x, 0, 1); return this; }
  lookAt(v) { this.eyeBand.lookAt(v); return this; }
  telegraph() { this.eyeBand.telegraphBlink(); return this; }
  startLaserCharge() { this.laser.startCharge(); return this; }
  fireLaser(getTargetPos) { this.laser.fire(getTargetPos); return this; }
  stopLaser() { this.laser.stop(); return this; }
  // CONTINUOUS external charge-visual bridge (game drives wretch._eyeFlare 0..1 per
  // frame). Drives ONLY the central-eye charge VISUAL (iris emissive ramp + pupil
  // constrict via aUvScale/aCharge + lid peel + limbal glow) through the eye band's
  // charge channel. NO state transition, NO auto-fire — independent of the autonomous
  // startLaserCharge/fireLaser/stopLaser timeline. Safe every frame: the eye band
  // consumes this in update(); the laser timeline stays dormant (its update() only
  // writes eyeBand.setCharge while charging/firing/cooling, never at rest) so it does
  // NOT override this external drive unless a fire timeline was explicitly started.
  setLaserCharge(x) { this.eyeBand.setCharge(clamp(x, 0, 1)); return this; }
  setLaserTrackingSpeed(r) { this.laser.setTrackingSpeed(r); return this; }
  onLaserHit(cb) { this.laser.onLaserHit(cb); return this; }
  setQuality(level) { this.quality = level; return this; }
  onOverrides(cb) { this._onOverrides = cb; return this; }

  update(dt, elapsed) {
    dt = Math.min(dt, 0.05);
    this._elapsed = elapsed != null ? elapsed : this._elapsed + dt;
    const el = this._elapsed;

    // 1) blend presets
    const v = this.rig.update(dt);

    // 2) body lean + drop
    this.bodyGroup.quaternion.copy(this.rig.bodyQuat);
    this.bodyGroup.position.y = v.yWorld || 0;

    // 3) wings (per-pair desync ω, blended flap/fold; overrides win if set)
    const flap = this._flapOverride != null ? this._flapOverride : v.flap;
    const fold = this._foldOverride != null ? this._foldOverride : v.fold;
    const omegaScale = this._omegaScale != null ? this._omegaScale : 1;
    for (const w of this.wings) {
      w.setOmega(Math.max(0.02, v.omega * w._omegaMul * omegaScale));
      w.setFlapIntensity(flap);
      w.setFold(fold);
      w.update(dt, el);
    }

    // 3b) core feather mass flutter (F-3): the torn-robe core isn't in this.wings,
    // so nothing advances its shader clock — tick uTime here (O(1), one uniform
    // write, no attribute upload) so the hanging mass stirs instead of freezing.
    const coreUni = this._coreMat.userData.wingUniforms;
    if (coreUni && coreUni.uTime) coreUni.uTime.value = el;

    // 4) eyes — wing-mounted outer eyes ride the mid pair's beat (ω×0.6 matches the mid wings' omegaMul)
    if (this._wingEyes) { const wf = Math.max(0.05, flap), wo = el * Math.max(0.02, v.omega * 0.6 * omegaScale);
      for (const m of this._wingEyes) { m.e.pivot.position.z = m.z0 + Math.sin(wo + m.e.l.i) * 0.16 * wf;
        m.e.pivot.position.y = m.y0 + Math.cos(wo * 0.9 + m.e.l.i) * 0.07 * wf; } }
    this.eyeBand.setGazeMode(v.gaze);
    if (this.rig.state === 'death') this.eyeBand.setDeathClose(this.rig.eyeClosePerEye);
    this.eyeBand.update(dt, el);

    // 5) fx: ember smoulder scales with preset ember level; laser timeline
    this.fxMat.uniforms.uTime.value = el;
    const emberScale = 0.4 + 0.6 * (v.ember || 0);
    this.embers.mesh.visible = (v.ember || 0) > 0.02;
    this.laser.update(dt, el);

    // 6) LOD + far pose swap by upper-wing flap phase
    if (this.camera) this.lod.update(this.camera);
    this.silhouette.userData.setPose(Math.sin(el * v.omega) * (flap));

    // 7) analytic hit proxies (law 4)
    this._updateHitProxies();

    return this;
  }

  _updateHitProxies() {
    this.eyeBand.group.getWorldPosition(this.hitProxies.eyeSphere.center);
    this.hitProxies.eyeSphere.radius = H * 1.1 * this.lod.scale.x;
    for (let i = 0; i < this.wings.length; i++) {
      const box = this.wings[i].boundsUpdate();      // wing-local Box3 from bone matrices
      this.hitProxies.wingBoxes[i].copy(box);
    }
  }

  getHitProxies() { return this.hitProxies; }

  dispose() {
    this.eyeBand.dispose();
    this._bodyMats.forEach(m => m.dispose());
    this.atlas.dispose();
    this.coreMass.geometry.dispose();
    this.wings.forEach(w => { w.instancedMesh.geometry.dispose(); });
    this.fxMat.dispose();
    this.beam.mesh.geometry.dispose(); this.embers.mesh.geometry.dispose();
    this.silMat.dispose();
    this.silhouette.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

export default SeraphimModel;
export { H as SERAPH_H };
