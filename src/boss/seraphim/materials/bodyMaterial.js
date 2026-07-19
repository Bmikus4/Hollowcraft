// SERAPHIM BODY / FEATHER MATERIAL (Agent C) — material #1 of the ≤4 budget
// -----------------------------------------------------------------------------
// Composition (seraphim-contracts.md §CROSS-AGENT SHADER INTERFACE):
//   VERTEX stage   = Agent A (geometry/wing.js -> applyWingShader + WING_SKIN_VERTEX_GLSL)
//                    injects rig skinning + flutter and MUST write the varyings
//                    vStain, vAtlasUv, vWorldNormal, vWorldView.
//   FRAGMENT stage = Agent C (this file) consumes those varyings: samples the
//                    scripture atlas at vAtlasUv (respecting its alpha for torn
//                    edges), mixes ivory -> rust by vStain, applies wrap-lighting
//                    pseudo-SSS, and adds ember/gold emissive in the high-stain
//                    core. Everything glow = emissive-on-opaque (canon §7.7).
//
// A-import guard: Agent A may not have shipped wing.js yet. We attempt a dynamic
// import at module load; if it fails we fall back to a SELF-CONTAINED vertex
// stage that honours A's exact contract (same attributes / uniforms / varyings),
// so the harness renders standalone. When A ships, its real vertex is used
// automatically (or an explicit `applyWingShader` can be passed to the builder).
// -----------------------------------------------------------------------------
import * as THREE from 'three';
import { drawAtlas } from './atlas.js';

// ---- guarded import of Agent A's vertex stage --------------------------------
let A_MOD = null;
try {
  A_MOD = await import('../geometry/wing.js');
} catch (e) {
  A_MOD = null; // Agent A not shipped yet -> use fallback below
}
export const A_VERTEX_AVAILABLE = !!(A_MOD && A_MOD.applyWingShader);

// ---- runtime scripture atlas (the shipping path) -----------------------------
export { drawAtlas };
export function makeAtlasTexture(size = 2048, renderer) {
  const cv = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(size, size)
    : document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  drawAtlas(ctx, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ---- FALLBACK vertex stage (contract-faithful stand-in for Agent A) ----------
// Honours EXACTLY: attributes aSegment,aRestOffset,aRestQuat,aPhase,aRow,aStain,
// aLen ; uniforms uBones[4],uTime,uFlutterFreq ; varyings vStain,vAtlasUv,
// vWorldNormal,vWorldView. Variant cell is derived from aPhase (no extra
// attribute) so it matches the atlas layout without inventing new channels.
export const WING_SKIN_VERTEX_GLSL_FALLBACK = /* glsl */`
  attribute float aSegment;
  attribute vec3  aRestOffset;
  attribute vec4  aRestQuat;
  attribute float aPhase;
  attribute float aRow;
  attribute float aStain;
  attribute float aLen;
  uniform mat4  uBones[4];
  uniform float uTime;
  uniform float uFlutterFreq;
  varying float vStain;
  varying vec2  vAtlasUv;
  varying vec3  vWorldNormal;
  varying vec3  vWorldView;
  vec3 qrot(vec4 q, vec3 v){ return v + 2.0*cross(q.xyz, cross(q.xyz, v) + q.w*v); }
`;

function fallbackApplyWingShader(material, { getBones } = {}) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uBones = { value: makeIdentityBones() };
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uFlutterFreq = { value: 7.5 };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\n' + WING_SKIN_VERTEX_GLSL_FALLBACK
    );
    // orient the feather normal by the rest quaternion (before three normal chain)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `vec3 objectNormal = qrot(aRestQuat, normal);`
    );
    // skin + flutter + varyings
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */`
      vec3 fLocal = qrot(aRestQuat, position);
      vec3 fNrm   = qrot(aRestQuat, vec3(0.0, 0.0, 1.0));
      float uu = uv.y;                                  // 0 root -> 1 tip
      float amp = aLen * 0.06;
      fLocal += fNrm * (amp * uu * uu * sin(uFlutterFreq * uTime + aPhase));
      vec3 transformed = (uBones[int(aSegment)] * vec4(fLocal + aRestOffset, 1.0)).xyz;

      float variant = mod(floor(aPhase / 1.5707963), 4.0);   // 4 atlas variants
      float ac = mod(variant, 2.0);
      float ar = floor(variant / 2.0);
      vAtlasUv = vec2(ac * 0.5, ar * 0.5) + clamp(uv, 0.0, 1.0) * 0.5;
      vStain = aStain;
      vec4 wp = modelMatrix * vec4(transformed, 1.0);
      vWorldNormal = normalize(mat3(modelMatrix) * fNrm);
      vWorldView   = normalize(cameraPosition - wp.xyz);
      `
    );
    material.userData.shader = shader;
    material.userData.updateBones = () => {
      if (getBones) {
        const b = getBones();
        if (b) for (let i = 0; i < 4; i++) shader.uniforms.uBones.value[i].copy(b[i]);
      }
    };
  };
}

function makeIdentityBones() { return [0, 1, 2, 3].map(() => new THREE.Matrix4()); }

// ---- FRAGMENT stage (Agent C's owned surface shading) ------------------------
function injectFragment(shader, atlas, opts) {
  Object.assign(shader.uniforms, {
    uAtlas:        { value: atlas },
    uIvoryHi:      { value: new THREE.Color(0xf2ece4) },
    uIvoryLo:      { value: new THREE.Color(0xd8cfc4) },
    uRust:         { value: new THREE.Color(0xa34433) },
    uRustDeep:     { value: new THREE.Color(0x7e2c20) },
    uEmber:        { value: new THREE.Color(0xd9902f) },
    // POLISH 2: cooler, rosier SSS fill (was #c98a6a, a warm orange-tan that pushed
    // the shadow side orange). #b8705f reads as blood-through-parchment, not orange.
    uSSSTint:      { value: new THREE.Color(0xb8705f) },
    uLightDir:     { value: new THREE.Vector3(0.3, 1.0, -0.6).normalize() },
    uWrap:         { value: opts.wrap },
    uSSSStrength:  { value: opts.sssStrength },
    uEmberStrength:{ value: opts.emberStrength },
  });

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    /* glsl */`#include <common>
    uniform sampler2D uAtlas;
    uniform vec3  uIvoryHi, uIvoryLo, uRust, uRustDeep, uEmber, uSSSTint, uLightDir;
    uniform float uWrap, uSSSStrength, uEmberStrength;
    varying float vStain;
    varying vec2  vAtlasUv;
    varying vec3  vWorldNormal;
    varying vec3  vWorldView;`
  );

  // albedo: ivory -> rust by vStain, detailed by the scripture atlas; torn edges
  // via hard discard (opaque, no transparency stacking).
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    /* glsl */`
    vec4 atlasTex = texture2D(uAtlas, vAtlasUv);
    if (atlasTex.a < 0.45) discard;                       // torn parchment silhouette
    // POLISH 2 (a): keep ivory brighter/cleaner across the plumage (was *1.6, which
    // aged the ivory too fast) so tips read clean white.
    vec3 ivory = mix(uIvoryHi, uIvoryLo, clamp(vStain * 1.15, 0.0, 1.0));
    // POLISH 2 (b): the rust is DEEP BLOOD-CRIMSON #7e2c20 almost everywhere; the
    // lighter orange-red #a34433 survives only as a faint accent at the lowest stain.
    vec3 rust  = mix(uRust, uRustDeep, clamp(vStain * 0.7 + 0.6, 0.0, 1.0));
    // POLISH 2 (a): ivory DOMINATES — rust only ramps in at the high-stain core/inner
    // rows (was smoothstep(0.12,0.85), which stained most of the wing). Tips stay ivory.
    vec3 baseCol = mix(ivory, rust, smoothstep(0.45, 0.95, vStain));
    // atlas holds parchment (~white) + red ink strokes -> modulate to show scripture
    baseCol *= mix(vec3(1.0), atlasTex.rgb, 0.92);
    diffuseColor.rgb = baseCol;
    `
  );

  // pseudo-SSS wrap fill + ember/gold core glint, added as emissive-on-opaque so
  // the game's existing bloom lifts them. NdotL_wrap = (N·L + w)/(1 + w).
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    /* glsl */`#include <emissivemap_fragment>
    {
      vec3 N = normalize(vWorldNormal);
      vec3 L = normalize(uLightDir);
      float ndlWrap = clamp((dot(N, L) + uWrap) / (1.0 + uWrap), 0.0, 1.0);
      // translucent warm fill wrapping around the shadow terminator (pseudo-SSS)
      totalEmissiveRadiance += diffuseColor.rgb * uSSSTint * (1.0 - ndlWrap) * uSSSStrength;
      // POLISH 2 (c): ember/gold is now TINY GLINTS in the deepest core only — not a
      // broad orange glow. Gated on BOTH very-high stain AND very-dense ink so it lights
      // only small sparse spots, and scaled down. (was smoothstep(0.58,1.0)*[0.35..1.0].)
      float inkDensity = 1.0 - clamp(atlasTex.g, 0.0, 1.0);
      float emberMask = smoothstep(0.82, 1.0, vStain) * smoothstep(0.6, 0.92, inkDensity);
      totalEmissiveRadiance += uEmber * emberMask * uEmberStrength * 0.55;
    }
    `
  );
}

// ---- PUBLIC BUILDER ----------------------------------------------------------
// buildBodyMaterial({ getBones, atlas?, applyWingShader?, wrap?, sssStrength?,
//                     emberStrength?, renderer? }) -> THREE.MeshStandardMaterial
// Returns ONE material. Exposes material.userData.setLightDir / .setTime /
// .updateBones and .userData.atlas for the caller / rig.
export function buildBodyMaterial(opts = {}) {
  const {
    getBones,
    atlas = makeAtlasTexture(2048, opts.renderer),
    applyWingShader = (A_MOD && A_MOD.applyWingShader) || fallbackApplyWingShader,
    wrap = 0.5,
    sssStrength = 0.35,
    emberStrength = 0.9,
  } = opts;

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.74,
    metalness: 0.0,
    map: atlas,            // forces USE_UV so `uv`/vAtlasUv work; map_fragment is overridden
    side: THREE.DoubleSide,
    transparent: false,    // torn edges via discard -> opaque, no blend stacking
  });
  mat.map.colorSpace = THREE.SRGBColorSpace;

  // 1) vertex stage (A's real one when available, else contract-faithful fallback)
  applyWingShader(mat, { getBones });

  // 2) wrap the resulting onBeforeCompile to add C's fragment stage
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    injectFragment(shader, atlas, { wrap, sssStrength, emberStrength });
    mat.userData.shader = shader;
  };

  mat.userData.atlas = atlas;
  mat.userData.usingAgentA = A_VERTEX_AVAILABLE && applyWingShader !== fallbackApplyWingShader;
  mat.userData.setLightDir = (v) => { const s = mat.userData.shader; if (s && s.uniforms.uLightDir) s.uniforms.uLightDir.value.copy(v).normalize(); };
  mat.userData.setTime = (t) => { const s = mat.userData.shader; if (s && s.uniforms.uTime) s.uniforms.uTime.value = t; };
  // NOTE: mat.userData.updateBones is installed by the vertex stage at compile
  // time (fallback convenience; Agent A's real rig writes uBones itself).
  return mat;
}

export { fallbackApplyWingShader };
