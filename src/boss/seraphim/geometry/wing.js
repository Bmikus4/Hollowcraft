// SERAPHIM — wing builder + vertex-shader rig (Agent A, Wave 1)
// ---------------------------------------------------------------------------
// buildWing(config) -> { group, instancedMesh, bones, feats, boundsUpdate,
//                        update, setFold, setFlapIntensity, material }
//
// * Catmull-Rom leading-edge spline through the 4 joints; Gram-Schmidt (T,B,N)
//   frame per sample (N config-supplied).
// * 4 feather rows (lesser/median coverts, secondaries, primaries) with the
//   exact counts / length rules / t-spans + primary yaw splay from canon 2.3.
// * ONE THREE.InstancedMesh per wing (~77 instances = 1 draw call).
// * Per-instance attributes (EXACT contract names):
//     aSegment,aRestOffset,aRestQuat,aPhase,aRow,aStain,aLen  (+ aVariant, see note)
// * Bone-matrix vertex skinning + tip flutter + rachis pitch in the VERTEX stage
//   (Agent A owns it). Fragment stage is Agent C's; this file ships a self-
//   contained placeholder fragment (vertex-colour by vStain) so the harness runs.
// * Traveling-wave flap + fold live on the 4-bone chain (CPU touches only 4 bone
//   matrices/wing/frame). ALL rotations are quaternions, blended by slerp.
//
// Contract additions (reported): a per-instance float attribute `aVariant`
// (0..3) picks the atlas cell per feather — the contract exposes no per-instance
// variant channel yet demands per-feather variant mapping; aVariant is read ONLY
// by this file's vertex stage and is invisible to Agent C (who consumes vAtlasUv).
// Two extra uniforms `uFlapPhase` and `uRachisAmp` drive canon 2.5 rachis pitch
// in-shader (perf law 8). uBones/uTime/uFlutterFreq keep their exact contract names.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { buildFeather } from './feather.js';

// ---- shared GLSL (Agent A owns the vertex stage) --------------------------
export const WING_SKIN_VERTEX_GLSL = /* glsl */`
attribute float aSegment;
attribute vec3  aRestOffset;
attribute vec4  aRestQuat;
attribute float aPhase;
attribute float aRow;
attribute float aStain;
attribute float aLen;
attribute float aVariant;
attribute vec2  localUv;
uniform mat4  uBones[4];
uniform float uTime;
uniform float uFlutterFreq;
uniform float uFlapPhase;
uniform float uRachisAmp;
varying float vStain;
varying vec2  vAtlasUv;
varying vec3  vWorldNormal;
varying vec3  vWorldView;
vec3 seraph_qrot(vec4 q, vec3 v){ return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
`;

// begin/normal chunk bodies (kept internal; assembled by applyWingShader)
const NORMAL_CHUNK = /* glsl */`
  vec3 objectNormal = normalize(normal);
  {
    float ra = uRachisAmp * sin(uFlapPhase - aPhase);   // rachis pitch about local X (root pivot)
    float cr = cos(ra), sr = sin(ra);
    objectNormal = vec3(objectNormal.x, cr*objectNormal.y - sr*objectNormal.z, sr*objectNormal.y + cr*objectNormal.z);
    objectNormal = seraph_qrot(aRestQuat, objectNormal);
    objectNormal = normalize(mat3(uBones[int(aSegment)]) * objectNormal);
    vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
  }
`;

const BEGIN_CHUNK = /* glsl */`
  vec3 transformed;
  {
    float u  = clamp(position.y, 0.0, 1.0);             // 0 at quill root -> 1 at tip
    float ra = uRachisAmp * sin(uFlapPhase - aPhase);   // rachis pitch (open on upstroke)
    float cr = cos(ra), sr = sin(ra);
    vec3 p = vec3(position.x, cr*position.y - sr*position.z, sr*position.y + cr*position.z);
    vec3 sp = p * aLen;                                 // scale unit feather to its length
    sp.z += aLen * u * u * 0.18 * sin(uFlutterFreq * uTime + aPhase); // tip flutter along local normal
    sp = seraph_qrot(aRestQuat, sp);                    // orient into (T,B,N) basis
    sp += aRestOffset;                                  // root offset in bone-local rest frame
    transformed = (uBones[int(aSegment)] * vec4(sp, 1.0)).xyz;
  }
  vStain = aStain;
  vec2 cell = vec2(mod(aVariant, 2.0), floor(aVariant * 0.5)) * 0.5;
  vAtlasUv = cell + clamp(localUv, 0.0, 1.0) * 0.5;
  vec4 seraphWP = modelMatrix * vec4(transformed, 1.0);
  vWorldView = normalize(cameraPosition - seraphWP.xyz);
`;

// Injects the wing vertex rig into a MeshStandard/Physical material. CHAINS any
// existing onBeforeCompile (so Agent C can add their fragment first, then call this).
export function applyWingShader(material, { getBones } = {}) {
  const uniforms = material.userData.wingUniforms || {
    uBones: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] },
    uTime: { value: 0 },
    uFlutterFreq: { value: 7.0 },
    uFlapPhase: { value: 0 },
    uRachisAmp: { value: 0.14 },
  };
  material.userData.wingUniforms = uniforms;
  if (getBones) material.userData.getBones = getBones;

  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uBones = uniforms.uBones;
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uFlutterFreq = uniforms.uFlutterFreq;
    shader.uniforms.uFlapPhase = uniforms.uFlapPhase;
    shader.uniforms.uRachisAmp = uniforms.uRachisAmp;
    shader.vertexShader = WING_SKIN_VERTEX_GLSL + shader.vertexShader
      .replace('#include <beginnormal_vertex>', NORMAL_CHUNK)
      .replace('#include <begin_vertex>', BEGIN_CHUNK);
  };
  material.customProgramCacheKey = () => 'seraphWingSkin';
  return material;
}

// Self-contained placeholder body material: real vertex rig + a trivial fragment
// that shades ivory->rust by vStain, so wing-harness.html renders without Agent C.
export function makePlaceholderWingMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = 'varying float vStain;\nvarying vec2 vAtlasUv;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 seraphIvory = vec3(0.95, 0.92, 0.85);
        vec3 seraphRust  = vec3(0.49, 0.17, 0.12);
        diffuseColor.rgb *= mix(seraphIvory, seraphRust, clamp(vStain, 0.0, 1.0));`);
  };
  return applyWingShader(mat);
}

// ---- rows spec (canon 2.3) ------------------------------------------------
const ROWS = [
  { row: 0, count: 28, t0: 0.05, t1: 0.95, len: () => 0.06, pitch: 0.06, delta: 0.000 }, // lesser coverts
  { row: 1, count: 22, t0: 0.10, t1: 0.95, len: () => 0.12, pitch: 0.10, delta: 0.015 }, // median coverts
  { row: 2, count: 16, t0: 0.15, t1: 0.62, len: (t) => 0.28 * (0.6 + 0.4 * t), pitch: 0.18, delta: 0.030 }, // secondaries
  { row: 3, count: 11, t0: 0.62, t1: 1.00, len: (t) => 0.42 * Math.pow(THREE.MathUtils.smoothstep(t, 0.5, 1.0), 0.7) + 0.18, pitch: 0.34, delta: 0.045 }, // primaries
];

function segForT(t) { return t < 0.30 ? 1 : (t < 0.62 ? 2 : 3); }
function rand01(seed) { let a = (seed >>> 0) || 1; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

export function buildWing(config) {
  const S = config.span;
  const flap = Object.assign({ omega: 1.2, ampHumerus: 0.5, ampRadius: 0.35, ampCarpus: 0.28, phase: 0, phi: 0.6, beta: 0.15 / 1.2 }, config.flap || {});
  const N = new THREE.Vector3().fromArray(config.normal).normalize();
  const J = config.joints.map((p) => new THREE.Vector3().fromArray(p));
  const fanScale = config.fanScale != null ? config.fanScale : 1.0;
  const gamMax = 0.5 * fanScale; // primary yaw splay ceiling

  // --- bone chain: parented Object3Ds; each rest position = joint delta ---
  const group = new THREE.Group();
  const bones = [];
  let parent = group;
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Object3D();
    b.position.copy(i === 0 ? J[0] : J[i].clone().sub(J[i - 1]));
    parent.add(b); bones.push(b); parent = b;
  }
  // rest world-in-group positions of each joint are simply J[i] (rotations identity at rest)

  // --- leading-edge spline ---
  const curve = new THREE.CatmullRomCurve3(J, false, 'catmullrom', 0.5);

  // --- gather feathers ---
  const feats = [];
  const _T = new THREE.Vector3(), _B = new THREE.Vector3(), _Nn = new THREE.Vector3();
  const _basis = new THREE.Matrix4();
  const _qBasis = new THREE.Quaternion(), _qPitch = new THREE.Quaternion(), _qYaw = new THREE.Quaternion(), _q = new THREE.Quaternion();
  const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Z = new THREE.Vector3(0, 0, 1);
  const _C = new THREE.Vector3(), _P = new THREE.Vector3();
  let sIdx = 0;

  for (const R of ROWS) {
    for (let i = 0; i < R.count; i++) {
      const f = R.count > 1 ? i / (R.count - 1) : 0;
      const t = THREE.MathUtils.lerp(R.t0, R.t1, f);
      curve.getPoint(t, _C);
      curve.getTangent(t, _T).normalize();
      // Gram-Schmidt frame: B = feather-growth dir, N re-orthonormalised toward config N
      _B.crossVectors(_T, N).normalize();
      _Nn.crossVectors(_B, _T).normalize();

      const jitB = (rand01(sIdx * 97 + 7) - 0.5) * 0.02 * S; // eps_r along B
      const delta = R.delta * S;                              // per-row layer offset along N
      _P.copy(_C).addScaledVector(_B, jitB).addScaledVector(_Nn, delta);

      // orientation: basis(T,B,N) then per-row pitch about local X, primary yaw about local Z
      _basis.makeBasis(_T, _B, _Nn);
      _qBasis.setFromRotationMatrix(_basis);
      _qPitch.setFromAxisAngle(AXIS_X, R.pitch);
      let gamma = 0;
      if (R.row === 3) gamma = gamMax * Math.pow(i / (R.count - 1), 1.5); // grasping-fingers splay
      _qYaw.setFromAxisAngle(AXIS_Z, gamma);
      _q.copy(_qBasis).multiply(_qPitch).multiply(_qYaw);

      const seg = segForT(t);
      const len = R.len(t) * S;
      const dist = _P.distanceTo(J[0]);
      const stain = THREE.MathUtils.clamp(1 - dist / (0.9 * S), 0, 1);
      const restOffset = _P.clone().sub(J[seg]); // bone-local rest frame is pure-translation at rest

      feats.push({
        seg,
        restOffset,
        restQuat: _q.clone(),
        phase: t * Math.PI * 4 + rand01(sIdx * 131 + 3) * 6.283,
        row: R.row,
        stain,
        len,
        variant: Math.floor(rand01(sIdx * 17 + (config.variantSeed | 0) * 101) * 4) % 4,
        P: _P.clone(),
      });
      sIdx++;
    }
  }

  // --- instanced geometry + attributes ---
  const geo = buildFeather({ variantSeed: config.variantSeed || 1, droopK: config.droopK });
  const n = feats.length;
  const aSegment = new Float32Array(n);
  const aRestOffset = new Float32Array(n * 3);
  const aRestQuat = new Float32Array(n * 4);
  const aPhase = new Float32Array(n);
  const aRow = new Float32Array(n);
  const aStain = new Float32Array(n);
  const aLen = new Float32Array(n);
  const aVariant = new Float32Array(n);
  feats.forEach((ft, i) => {
    aSegment[i] = ft.seg;
    aRestOffset.set([ft.restOffset.x, ft.restOffset.y, ft.restOffset.z], i * 3);
    aRestQuat.set([ft.restQuat.x, ft.restQuat.y, ft.restQuat.z, ft.restQuat.w], i * 4);
    aPhase[i] = ft.phase;
    aRow[i] = ft.row;
    aStain[i] = ft.stain;
    aLen[i] = ft.len;
    aVariant[i] = ft.variant;
  });
  geo.setAttribute('aSegment', new THREE.InstancedBufferAttribute(aSegment, 1));
  geo.setAttribute('aRestOffset', new THREE.InstancedBufferAttribute(aRestOffset, 3));
  geo.setAttribute('aRestQuat', new THREE.InstancedBufferAttribute(aRestQuat, 4));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
  geo.setAttribute('aRow', new THREE.InstancedBufferAttribute(aRow, 1));
  geo.setAttribute('aStain', new THREE.InstancedBufferAttribute(aStain, 1));
  geo.setAttribute('aLen', new THREE.InstancedBufferAttribute(aLen, 1));
  geo.setAttribute('aVariant', new THREE.InstancedBufferAttribute(aVariant, 1));

  const material = config.material || makePlaceholderWingMaterial();
  const instancedMesh = new THREE.InstancedMesh(geo, material, n);
  instancedMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage); // identity, static (animation is bone-matrix + shader)
  const _id = new THREE.Matrix4();
  for (let i = 0; i < n; i++) instancedMesh.setMatrixAt(i, _id);
  instancedMesh.instanceMatrix.needsUpdate = true;
  instancedMesh.frustumCulled = false; // vertex shader relocates verts; default bounds don't cover them
  group.add(instancedMesh);

  // --- flap rig state ---
  const spanDir = J[3].clone().sub(J[0]).normalize();
  const flapAxis = spanDir.clone().cross(N).normalize(); // in-plane axis; rotating span about it sweeps up/down
  if (flapAxis.lengthSq() < 1e-6) flapAxis.set(0, 0, 1);
  const FOLD_ANGLE = [0, -0.5, -1.15, -1.5]; // per-bone folded target about flapAxis (0=root unused)
  const uni = material.userData.wingUniforms;
  const _invGroup = new THREE.Matrix4();
  const _qAnim = new THREE.Quaternion(), _qFold = new THREE.Quaternion();
  const state = { flapIntensity: 1, fold: 0 };

  function update(dt, elapsed) {
    const omega = flap.omega * (0.25 + 0.75 * state.flapIntensity);
    const ampK = 0.35 + 0.65 * state.flapIntensity;
    const tw = elapsed + flap.beta * Math.sin(omega * elapsed); // downstroke time-warp
    const ph = omega * tw + flap.phase;
    const th = [0, flap.ampHumerus * ampK * Math.sin(ph), flap.ampRadius * ampK * Math.sin(ph - flap.phi), flap.ampCarpus * ampK * Math.sin(ph - 2 * flap.phi)];
    const s = THREE.MathUtils.smoothstep(state.fold, 0, 1);
    for (let i = 1; i < 4; i++) {
      _qAnim.setFromAxisAngle(flapAxis, th[i]);
      _qFold.setFromAxisAngle(flapAxis, FOLD_ANGLE[i]);
      bones[i].quaternion.slerpQuaternions(_qAnim, _qFold, s); // quaternion blend, never euler-lerp
    }
    group.updateWorldMatrix(true, true);
    _invGroup.copy(group.matrixWorld).invert();
    for (let i = 0; i < 4; i++) uni.uBones.value[i].multiplyMatrices(_invGroup, bones[i].matrixWorld); // bone matrix in group-local space
    uni.uTime.value = elapsed;
    uni.uFlapPhase.value = ph - 2 * flap.phi; // feed rachis pitch (open on upstroke)
  }

  const _box = new THREE.Box3();
  const _v = new THREE.Vector3();
  function boundsUpdate() {
    _box.makeEmpty();
    for (const b of bones) _box.expandByPoint(_v.setFromMatrixPosition(b.matrixWorld));
    _box.expandByScalar(0.5 * S); // feathers extend beyond the bone joints
    return _box;
  }

  // prime uBones once so a first render before update() is well-posed
  group.updateWorldMatrix(true, true);
  _invGroup.copy(group.matrixWorld).invert();
  for (let i = 0; i < 4; i++) uni.uBones.value[i].multiplyMatrices(_invGroup, bones[i].matrixWorld);

  return {
    group,
    instancedMesh,
    bones,
    feats,
    boundsUpdate,
    update,
    material,
    setFold: (x) => { state.fold = THREE.MathUtils.clamp(x, 0, 1); },
    setFlapIntensity: (x) => { state.flapIntensity = THREE.MathUtils.clamp(x, 0, 1); },
    setOmega: (w) => { flap.omega = w; flap.beta = 0.15 / Math.max(0.1, w); },
    _state: state,
    flapAxis,
  };
}
