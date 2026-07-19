// SERAPHIM FX STACK (Agent C) — material #4 of the ≤4 budget
// -----------------------------------------------------------------------------
// ONE additive THREE.ShaderMaterial drives the entire additive FX family, so the
// whole fx layer counts as a SINGLE material (canon §5 / §7.6). The mode is a
// per-object / per-instance attribute `aFxMode` (NOT a per-mesh uniform toggle,
// which three does not reliably re-upload on a shared material):
//   mode 0 = laser CORE cylinder   (r~0.08, white-hot)
//   mode 1 = laser GLOW sheath     (r~0.20, fresnel I=(1-|N·V|)^2, tint #9fd8ff)
//   mode 2 = ember sprite          (#d9902f, curl drift, <=8)
//   mode 3 = muzzle / impact flare (single billboards)
//
// Overdraw law (canon §7.7): the beam is exactly 2 additive layers (core+sheath);
// embers <=8; <=3 additive layers under any pixel. depthWrite off on all fx.
// Draw calls: beam = 1 InstancedMesh(2 instances), sparks = 1 InstancedMesh.
// -----------------------------------------------------------------------------
import * as THREE from 'three';

const FX_VERT = /* glsl */`
  attribute float aFxMode;
  varying float vMode;
  varying vec2  vUv2;
  varying vec3  vWN;
  varying vec3  vWV;
  uniform float uTime;

  void main() {
    vMode = aFxMode;
    vUv2 = uv;
    #ifdef USE_INSTANCING
      mat4 im = instanceMatrix;
    #else
      mat4 im = mat4(1.0);
    #endif

    if (aFxMode >= 1.5) {
      // billboarded quad (embers / flares)
      vec4 centerWorld = modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0);
      if (aFxMode < 2.5) {                        // ember curl drift
        float s = centerWorld.x * 12.7 + centerWorld.z * 7.3 + centerWorld.y * 3.1;
        centerWorld.x += sin(uTime * 0.7 + s) * 0.5;
        centerWorld.z += cos(uTime * 0.6 + s * 1.3) * 0.5;
        centerWorld.y += mod(uTime * 0.35 + fract(s) * 4.0, 3.2) - 0.2;   // rise + recycle
      }
      vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      float sc = length(im[0].xyz);
      vec3 wp = centerWorld.xyz + (position.x * camRight + position.y * camUp) * sc;
      vWN = normalize(camRight);
      vWV = normalize(cameraPosition - wp);
      gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    } else {
      // beam cylinders (core / sheath)
      vec4 wp4 = modelMatrix * im * vec4(position, 1.0);
      vWN = normalize(mat3(modelMatrix * im) * normal);
      vWV = normalize(cameraPosition - wp4.xyz);
      gl_Position = projectionMatrix * viewMatrix * wp4;
    }
  }
`;

const FX_FRAG = /* glsl */`
  varying float vMode;
  varying vec2  vUv2;
  varying vec3  vWN;
  varying vec3  vWV;
  uniform float uTime;
  uniform vec3  uCore;
  uniform vec3  uSheath;
  uniform vec3  uEmber;

  void main() {
    vec3 col; float a;
    if (vMode < 0.5) {
      // white-hot core, gentle length pulse r(t)=r0(1+0.15 sin40t) -> intensity pulse
      float pulse = 0.9 + 0.15 * sin(uTime * 40.0);
      col = uCore * pulse;
      a = pulse;
    } else if (vMode < 1.5) {
      // fresnel glow sheath
      float f = pow(1.0 - abs(dot(normalize(vWN), normalize(vWV))), 2.0);
      col = uSheath * f * 1.6;
      a = f * 0.9;
    } else {
      // radial ember / flare
      vec2 p = vUv2 * 2.0 - 1.0;
      float r = length(p);
      float g = smoothstep(1.0, 0.0, r);
      float hot = (vMode > 2.5) ? 2.4 : 1.3;      // flares brighter than embers
      col = uEmber * g * hot;
      a = g;
    }
    gl_FragColor = vec4(col, a);
  }
`;

export function createFxMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:   { value: 0 },
      uCore:   { value: new THREE.Color(0xffffff) },
      uSheath: { value: new THREE.Color(0x9fd8ff) },
      uEmber:  { value: new THREE.Color(0xd9902f) },
    },
    vertexShader: FX_VERT,
    fragmentShader: FX_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
}

// ---- laser beam: 1 InstancedMesh, 2 instances (core, sheath) -----------------
export function makeBeam(material) {
  const mat = material || createFxMaterial();
  // open-ended unit cylinder along +Y; scaled per-instance to (r, length, r)
  const geo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
  geo.setAttribute('aFxMode', new THREE.InstancedBufferAttribute(new Float32Array([0, 1]), 1));
  const mesh = new THREE.InstancedMesh(geo, mat, 2);
  mesh.frustumCulled = false;
  mesh.visible = false;

  const R_CORE = 0.08, R_SHEATH = 0.20;
  const _q = new THREE.Quaternion();
  const _dir = new THREE.Vector3();
  const _mid = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _m = new THREE.Matrix4();
  const _s = new THREE.Vector3();

  const beam = {
    group: mesh, mesh, material: mat,
    setVisible(v) { mesh.visible = v; },
    update(origin, target, elapsed) {
      mesh.visible = true;
      _dir.subVectors(target, origin);
      const dist = _dir.length() || 0.0001;
      _dir.multiplyScalar(1 / dist);
      _q.setFromUnitVectors(_up, _dir);
      _mid.addVectors(origin, target).multiplyScalar(0.5);
      const pulse = 1.0 + 0.15 * Math.sin(elapsed * 40.0);
      _s.set(R_CORE * pulse, dist, R_CORE * pulse);
      _m.compose(_mid, _q, _s); mesh.setMatrixAt(0, _m);
      _s.set(R_SHEATH * pulse, dist, R_SHEATH * pulse);
      _m.compose(_mid, _q, _s); mesh.setMatrixAt(1, _m);
      mesh.instanceMatrix.needsUpdate = true;
      mat.uniforms.uTime.value = elapsed;
    },
  };
  return beam;
}

// convenience matching the documented free-function signature
export function updateBeam(beam, origin, target, elapsed) { beam.update(origin, target, elapsed); }

// ---- ember + muzzle/impact system: 1 InstancedMesh (<=8 embers + 2 flares) ---
export function makeEmbers(opts = {}) {
  const { count = 8, material, spread = 2.2, size = 0.5 } = opts;
  const n = Math.min(count, 8);              // HARD cap 8 (canon §5)
  const cap = n + 2;                          // + muzzle + impact
  const mat = material || createFxMaterial();
  const geo = new THREE.PlaneGeometry(1, 1);
  const modes = new Float32Array(cap);
  for (let i = 0; i < n; i++) modes[i] = 2;   // embers
  modes[n] = 3; modes[n + 1] = 3;             // muzzle, impact
  geo.setAttribute('aFxMode', new THREE.InstancedBufferAttribute(modes, 1));

  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.frustumCulled = false;
  const _m = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const origin = new THREE.Vector3();

  // seed ember base positions in a cone/volume around the core
  for (let i = 0; i < n; i++) {
    _p.set((Math.random() - 0.5) * spread, (Math.random() - 0.2) * spread * 0.8, (Math.random() - 0.5) * spread);
    _s.setScalar(size * (0.5 + Math.random() * 0.8));
    _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
  }
  // muzzle + impact start hidden (scale 0)
  _s.setScalar(0); _p.set(0, 0, 0); _m.compose(_p, _q, _s);
  mesh.setMatrixAt(n, _m); mesh.setMatrixAt(n + 1, _m);
  mesh.instanceMatrix.needsUpdate = true;

  function setFlare(idx, pos, scale) {
    _s.setScalar(scale); _p.copy(pos); _m.compose(_p, _q, _s);
    mesh.setMatrixAt(idx, _m); mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    mesh, material: mat, count: n,
    setOrigin(v) { origin.copy(v); },
    setMuzzle(pos, scale = 0.8) { setFlare(n, pos, scale); },
    setImpact(pos, scale = 1.1) { setFlare(n + 1, pos, scale); },
    hideFlares() { setFlare(n, origin, 0); setFlare(n + 1, origin, 0); },
    update(elapsed) { mat.uniforms.uTime.value = elapsed; },
  };
}

// ---- convenience: whole fx group sharing ONE material -----------------------
export function makeFx(opts = {}) {
  const material = createFxMaterial();
  const beam = makeBeam(material);
  const embers = makeEmbers({ ...opts, material });
  const group = new THREE.Group();
  group.add(beam.mesh, embers.mesh);
  return {
    group, material, beam, embers,
    update(elapsed) { material.uniforms.uTime.value = elapsed; },
  };
}
