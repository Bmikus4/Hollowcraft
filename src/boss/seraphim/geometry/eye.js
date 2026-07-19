// ============================================================================
// SERAPHIM — EYE PIPELINE  (Agent B, Wave 1)
// ----------------------------------------------------------------------------
// Photo-based seven-eye band for the Hollowcraft seraphim boss.
//
// Ground truth: docs/seraphim-canon.md  §4, §4B, §7
//               docs/seraphim-contracts.md
//
// This module owns:
//   - PURE texture processing (canvas-only; reused at RUNTIME here AND by the
//     optional bake tool tools/process-eye.mjs which runs them inside a browser).
//   - loadEyeTextures(): prefers baked JPEGs, else generates at runtime from
//     eye_source.jpg on a <canvas>, else a fully procedural fallback.
//   - buildEye(opts): one photoreal eye (sclera sphere + concave iris disc +
//     transparent convex cornea cap + upper/lower lids; blink = lid scale-Y).
//   - buildEyeBand(opts): 7 eyes on a gentle arc. Central eye = a full buildEye
//     (own material group: emissive charge, pupil constrict, lid peel, laser
//     socket). 6 flanks = shared-geometry InstancedMeshes (5 draw calls total).
//     Gaze API: central tracks dead-steady; flanks saccade (exp-interval,
//     desynced, critically-damped snap) + micro-jitter; Poisson blinks;
//     telegraphBlink() = all snap + blink at once.
//
// Import contract (resolved via the document importmap — bare specifier):
//   import * as THREE from 'three';
// ============================================================================

import * as THREE from 'three';

const FORWARD = new THREE.Vector3(0, 0, 1);

// Pupil-centered crop of eye_source.jpg (4898x3265), from visual inspection.
export const IRIS_CROP = { cx: 1160, cy: 1650, r: 1120 };

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
function mkCanvas(w, h) {
  const c = (typeof document !== 'undefined')
    ? document.createElement('canvas')
    : new OffscreenCanvas(w, h);
  c.width = w; c.height = h;
  return c;
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function hexToRgb(h) { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
// exponential (Poisson-interval) random with given mean
const expRand = (mean) => -mean * Math.log(1 - Math.random());

function avgRegion(src, fx, fy, fw, fh) {
  try {
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    const c = mkCanvas(16, 16), cx = c.getContext('2d');
    cx.drawImage(src, fx * w, fy * h, fw * w, fh * h, 0, 0, 16, 16);
    const d = cx.getImageData(0, 0, 16, 16).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return [r / n, g / n, b / n];
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// PURE TEXTURE PROCESSING  (canon §4.2) — used at runtime AND in the bake tool
// Each returns an HTMLCanvasElement / OffscreenCanvas. No THREE, no fs.
// ---------------------------------------------------------------------------

// 1. Crop iris to centered square, color-grade toward #7fb4c9 core -> #4a7d94
//    rim while preserving photographic fiber detail; dark pupil kept.
export function processIris(src, opts = {}) {
  const size = opts.size || 1024;
  const crop = opts.crop || IRIS_CROP;
  const core = hexToRgb(opts.core || '#7fb4c9');
  const rim = hexToRgb(opts.rim || '#4a7d94');
  const cv = mkCanvas(size, size), ctx = cv.getContext('2d');
  const s = crop.r * 2;
  ctx.drawImage(src, crop.cx - crop.r, crop.cy - crop.r, s, s, 0, 0, size, size);

  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  const cx = size / 2, cy = size / 2, R = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx, dy = y - cy;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) / R);
      const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
      const t = smoothstep(0.0, 1.0, r);                 // 0 core -> 1 rim
      const tr = core[0] + (rim[0] - core[0]) * t;
      const tg = core[1] + (rim[1] - core[1]) * t;
      const tb = core[2] + (rim[2] - core[2]) * t;
      // re-impose fiber contrast: modulate target tint by original luminance,
      // keep pupil dark (low lum -> stays dark), keep a touch of native chroma.
      const mod = clamp(lum * 1.35, 0, 1.3);
      d[i]     = clamp(tr * mod * 0.8 + d[i]     * 0.2, 0, 255);
      d[i + 1] = clamp(tg * mod * 0.8 + d[i + 1] * 0.2, 0, 255);
      d[i + 2] = clamp(tb * mod * 0.8 + d[i + 2] * 0.2, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  // darken limbal ring
  const g = ctx.createRadialGradient(cx, cy, R * 0.80, cx, cy, R);
  g.addColorStop(0, 'rgba(15,25,35,0)');
  g.addColorStop(1, 'rgba(8,14,22,0.8)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  return cv;
}

// random-walk red capillaries radiating from the limbus, alpha falls off outward
function drawCapillaries(ctx, size, cx, cy, count) {
  const limbus = size * 0.17, maxR = size * 0.5;
  for (let k = 0; k < count; k++) {
    const a = Math.random() * Math.PI * 2;
    let px = cx + Math.cos(a) * limbus * (0.9 + Math.random() * 0.35);
    let py = cy + Math.sin(a) * limbus * (0.9 + Math.random() * 0.35);
    let dir = a + (Math.random() - 0.5) * 0.6;
    let w = 0.7 + Math.random() * 1.7;
    const steps = 18 + (Math.random() * 44 | 0);
    const rc = 145 + (Math.random() * 45 | 0), gc = 28 + (Math.random() * 34 | 0), bc = 28 + (Math.random() * 22 | 0);
    for (let sN = 0; sN < steps; sN++) {
      dir += (Math.random() - 0.5) * 0.5;
      const step = 2 + Math.random() * 4;
      const nx = px + Math.cos(dir) * step, ny = py + Math.sin(dir) * step;
      const rr = Math.hypot(nx - cx, ny - cy);
      const falloff = clamp(1 - (rr - limbus) / (maxR - limbus), 0, 1);
      ctx.strokeStyle = `rgba(${rc},${gc},${bc},${0.34 * falloff * falloff})`;
      ctx.lineWidth = Math.max(0.4, w);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
      px = nx; py = ny; w *= 0.965;
      if (rr > maxR) break;
    }
  }
}

// 2/3. Sclera: photo whites (or ivory) + procedural capillaries. A brighter
//     "clear zone" sits at texture centre; the sclera geometry is oriented so
//     that centre faces +Z (behind the iris), so capillaries read as coming
//     off the limbus around the visible eye.
export function processSclera(src, opts = {}) {
  const size = opts.size || 2048;
  const cv = mkCanvas(size, size), ctx = cv.getContext('2d');
  let base = [237, 231, 223];                          // ivory fallback
  if (src) { const s = avgRegion(src, 0.60, 0.34, 0.14, 0.16); if (s) base = [(s[0] + 470) / 3, (s[1] + 468) / 3, (s[2] + 452) / 3]; }
  ctx.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
  ctx.fillRect(0, 0, size, size);

  // faint mottle
  ctx.globalAlpha = 0.05;
  for (let k = 0; k < 1400; k++) {
    ctx.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#c9b6a6';
    const rr = 2 + Math.random() * 7;
    ctx.beginPath(); ctx.arc(Math.random() * size, Math.random() * size, rr, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;

  const cx = size / 2, cy = size / 2;
  // bright clear zone (faces front, mostly hidden by iris)
  const clear = ctx.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 0.30);
  clear.addColorStop(0, 'rgba(255,252,247,0.55)');
  clear.addColorStop(1, 'rgba(255,252,247,0)');
  ctx.fillStyle = clear; ctx.fillRect(0, 0, size, size);

  drawCapillaries(ctx, size, cx, cy, opts.capillaries || 300);

  // warm pink toward the corners (medial/lateral canthus)
  for (const gx of [0.0, 1.0]) {
    const g = ctx.createRadialGradient(gx * size, cy, 0, gx * size, cy, size * 0.35);
    g.addColorStop(0, 'rgba(206,150,142,0.4)');
    g.addColorStop(1, 'rgba(206,150,142,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  }
  return cv;
}

// 4. iris bump from luminance
export function processIrisBump(irisCanvas, opts = {}) {
  const size = opts.size || 1024;
  const cv = mkCanvas(size, size), ctx = cv.getContext('2d');
  ctx.drawImage(irisCanvas, 0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = d[i + 1] = d[i + 2] = l;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// procedural fallback iris (canon §4.1 fallback) — radial fibers + gold flecks
export function proceduralIris(opts = {}) {
  const size = opts.size || 2048;
  const cv = mkCanvas(size, size), ctx = cv.getContext('2d');
  const cx = size / 2, cy = size / 2, R = size * 0.5;
  const g = ctx.createRadialGradient(cx, cy, R * 0.18, cx, cy, R);
  g.addColorStop(0, '#8fc0d4'); g.addColorStop(0.6, '#5f95ad'); g.addColorStop(1, '#3c6a80');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  ctx.globalAlpha = 0.5;
  for (let k = 0; k < 900; k++) {
    const a = Math.random() * 7, r0 = R * 0.2, r1 = R * (0.7 + Math.random() * 0.3);
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(212,227,237,0.5)' : 'rgba(28,58,78,0.5)';
    ctx.lineWidth = 0.6 + Math.random() * 1.4;
    let aa = a, x = cx + Math.cos(a) * r0, y = cy + Math.sin(a) * r0;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let sN = 1; sN <= 6; sN++) { aa += (Math.random() - 0.5) * 0.12; const rr = r0 + (r1 - r0) * sN / 6; ctx.lineTo(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let k = 0; k < 120; k++) { const a = Math.random() * 7, rr = R * (0.2 + Math.random() * 0.18); ctx.fillStyle = 'rgba(217,144,47,0.5)'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1 + Math.random() * 2, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#050608'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.2, 0, 7); ctx.fill();
  const lg = ctx.createRadialGradient(cx, cy, R * 0.82, cx, cy, R);
  lg.addColorStop(0, 'rgba(10,15,25,0)'); lg.addColorStop(1, 'rgba(8,12,20,0.85)');
  ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  return cv;
}
export function proceduralSclera(opts = {}) { return processSclera(null, opts); }

// ---------------------------------------------------------------------------
// TEXTURE LOADER — baked JPEG > runtime canvas from source > procedural
// import.meta.url makes the asset path correct regardless of which HTML loads us
// ---------------------------------------------------------------------------
const assetURL = (f) => new URL(`../../../../assets/seraphim/eye/${f}`, import.meta.url).href;
const loadTex = (url) => new Promise((res, rej) => new THREE.TextureLoader().load(url, res, undefined, rej));
const loadImage = (url) => new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = url; });

export async function loadEyeTextures(opts = {}) {
  const finish = (iris, sclera, bump, source) => {
    iris.colorSpace = THREE.SRGBColorSpace; sclera.colorSpace = THREE.SRGBColorSpace;
    iris.anisotropy = 8; sclera.anisotropy = 4;
    iris.needsUpdate = sclera.needsUpdate = bump.needsUpdate = true;
    return { iris, sclera, bump, source };
  };
  const prefer = opts.prefer || 'baked';
  if (prefer === 'baked') {
    try {
      const [iris, sclera, bump] = await Promise.all([
        loadTex(assetURL('iris_albedo.jpg')), loadTex(assetURL('sclera_albedo.jpg')), loadTex(assetURL('iris_bump.jpg')),
      ]);
      return finish(iris, sclera, bump, 'baked');
    } catch (e) { /* fall through */ }
  }
  if (prefer !== 'procedural') {
    try {
      const img = await loadImage(assetURL('eye_source.jpg'));
      const iC = processIris(img), sC = processSclera(img), bC = processIrisBump(iC);
      return finish(new THREE.CanvasTexture(iC), new THREE.CanvasTexture(sC), new THREE.CanvasTexture(bC), 'runtime');
    } catch (e) { /* fall through */ }
  }
  console.warn('[eye] TODO: PROCEDURAL fallback eye textures in use (no source JPEG loaded).');
  const iC = proceduralIris(), sC = proceduralSclera(), bC = processIrisBump(iC);
  return finish(new THREE.CanvasTexture(iC), new THREE.CanvasTexture(sC), new THREE.CanvasTexture(bC), 'procedural');
}

// ---------------------------------------------------------------------------
// GEOMETRY FACTORIES  (unit eye: sclera radius = 1, faces +Z)
// ---------------------------------------------------------------------------
// Sclera texture centre must face +Z (clear zone hidden behind iris).
const SCLERA_ROT_Y = -Math.PI / 2;

// Iris = a spherical CAP hugging the sclera front (so it is FLUSH, not a flat
// disc buried inside the sphere), with the centre pulled slightly inward
// (recess) so the pupil sits behind the corneal bulge => real parallax when the
// camera moves off-axis. Planar UV so the square iris texture maps centre->centre.
// NOTE: the iris centre must stay in FRONT of the sclera front pole (z=1) or it
// gets buried in the opaque sphere. So Rsurf>1 (cap sits just proud) and recess
// is only a gentle central dent that never crosses z=1 (parallax without burial).
function makeIrisGeo(diskR = 0.62, Rsurf = 1.03, recess = 0.028, rings = 20, seg = 48) {
  const pos = [], uv = [], idx = [];
  for (let ri = 0; ri <= rings; ri++) {
    const rr = ri / rings, pr = diskR * rr;
    const z = Math.sqrt(Math.max(0, Rsurf * Rsurf - pr * pr)) - recess * (1 - rr * rr);
    for (let si = 0; si <= seg; si++) {
      const a = si / seg * Math.PI * 2, x = Math.cos(a) * pr, y = Math.sin(a) * pr;
      pos.push(x, y, z);
      uv.push(0.5 + x / (2 * diskR), 0.5 - y / (2 * diskR));
    }
  }
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < seg; si++) {
      const a = ri * (seg + 1) + si, b = a + 1, c = a + (seg + 1), d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Cornea = a convex spherical cap on a slightly LARGER sphere, so it bulges
// beyond the sclera front and domes over the iris.
function makeCorneaGeo(diskR = 0.66, Rsurf = 1.05, rings = 14, seg = 48) {
  const pos = [], idx = [];
  for (let ri = 0; ri <= rings; ri++) {
    const rr = ri / rings, pr = diskR * rr, z = Math.sqrt(Math.max(0, Rsurf * Rsurf - pr * pr));
    for (let si = 0; si <= seg; si++) {
      const a = si / seg * Math.PI * 2;
      pos.push(Math.cos(a) * pr, Math.sin(a) * pr, z);
    }
  }
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < seg; si++) {
      const a = ri * (seg + 1) + si, b = a + 1, c = a + (seg + 1), d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// eyelid = a spherical CAP around the +Y (up) / -Y (down) axis, hugging a sphere
// of radius R concentric with the sclera. Because every vertex is at radius R
// from the eye centre, ROTATING the cap about X sweeps its rim over the eye
// while staying glued to the surface (no "plate" artefact). Blink is thus a
// single scalar (the cap's X rotation) — canon's "lid = one scalar" intent,
// implemented as rotation rather than scale.y (see report: scale.y flattened
// the cap into a disc).  Mesh origin = eye centre (no translate).
function makeLidGeo(up = true, capHalf = 0.82, R = 1.03, rings = 12, seg = 40) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const th = (i / rings) * capHalf;                 // angle from the pole axis
    const cy = Math.cos(th) * (up ? 1 : -1), sr = Math.sin(th);
    for (let j = 0; j <= seg; j++) {
      const ph = (j / seg) * Math.PI * 2;
      pos.push(sr * Math.cos(ph) * R, cy * R, sr * Math.sin(ph) * R);
      uv.push(j / seg, i / rings);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + 1, c = a + (seg + 1), d = c + 1;
      if (up) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// lid X-rotation: open (aperture wide) -> closed (rims meet over the pupil).
const LID_OPEN_ROT = 0.16, LID_CLOSED_ROT = 1.30, LID_PEEL_ROT = -0.18;
// upper lid uses +angle, lower lid uses -angle
const upperLidRot = (b) => lerp(LID_OPEN_ROT, LID_CLOSED_ROT, clamp(b, 0, 1));
// iris & cornea caps are built in place on the sclera surface (no z offset).
const PUPIL_Z = 0.93;                        // pupil depth (unit eye) = laser origin

// shared geometry singletons (created lazily, shared central<->flanks)
let _geo = null;
function geos() {
  if (!_geo) _geo = {
    sclera: new THREE.SphereGeometry(1, 40, 26).rotateY(SCLERA_ROT_Y),
    iris: makeIrisGeo(),
    cornea: makeCorneaGeo(),
    lidUp: makeLidGeo(true),
    lidLo: makeLidGeo(false),
  };
  return _geo;
}

// per-instance UV scale (pupil dilation) injected into the iris standard material
function patchIrisUvScale(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float aUvScale;\n' + shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #ifdef USE_MAP
        vMapUv = (vMapUv - 0.5) / max(aUvScale, 0.01) + 0.5;
      #endif
      #ifdef USE_BUMPMAP
        vBumpMapUv = (vBumpMapUv - 0.5) / max(aUvScale, 0.01) + 0.5;
      #endif`
    );
  };
  material.customProgramCacheKey = () => 'seraphIrisUvScale';
}

// ---------------------------------------------------------------------------
// MATERIALS
// ---------------------------------------------------------------------------
function makeEyeMaterials(tex, { ownIris = false } = {}) {
  const sclera = new THREE.MeshStandardMaterial({ map: tex.sclera, roughness: 0.35, metalness: 0.0 });
  // central eye needs an independent iris texture matrix (pupil constrict) —
  // clone shares the image, separate .matrix so it doesn't affect the flanks.
  const irisMap = ownIris ? tex.iris.clone() : tex.iris;
  if (ownIris) { irisMap.needsUpdate = true; irisMap.center.set(0.5, 0.5); }
  const iris = new THREE.MeshStandardMaterial({
    map: irisMap, bumpMap: tex.bump, bumpScale: 0.35,
    roughness: 0.22, metalness: 0.0, side: THREE.DoubleSide,
    emissive: new THREE.Color(0x2a5f7a), emissiveIntensity: 0.0,
  });
  // Clearcoat-only (NOT transmission): transmission forces a full extra scene
  // render pass (doubling draw calls, violating the ≤15-draw-call law) and it
  // washed the iris out to white. A thin transparent clearcoat dome gives the
  // wet specular catchlights realism needs at ~zero cost (1 transparent layer).
  const cornea = new THREE.MeshPhysicalMaterial({
    roughness: 0.06, metalness: 0.0,
    ior: 1.376, clearcoat: 1.0, clearcoatRoughness: 0.04, reflectivity: 0.6,
    transparent: true, opacity: 0.16, depthWrite: false,
    color: 0xeef6ff, side: THREE.FrontSide,
  });
  const lid = new THREE.MeshStandardMaterial({ color: 0xe7d9c6, roughness: 0.72, metalness: 0.0, side: THREE.DoubleSide });
  return { sclera, iris, cornea, lid, irisMap };
}

// ---------------------------------------------------------------------------
// buildEye(opts) — ONE eye group (used directly for the central eye)
//   opts: { textures, ownMaterials?:bool }
//   returns { group, meshes, mats, setBlink(b), setPupil(scale), setEmissive(x) }
// ---------------------------------------------------------------------------
export function buildEye(opts = {}) {
  const tex = opts.textures;
  const G = geos();
  const mats = makeEyeMaterials(tex, { ownIris: !!opts.ownMaterials });
  const group = new THREE.Group();
  group.name = 'seraphEye';

  const sclera = new THREE.Mesh(G.sclera, mats.sclera);
  const iris = new THREE.Mesh(G.iris, mats.iris);
  const cornea = new THREE.Mesh(G.cornea, mats.cornea); cornea.renderOrder = 3;
  const upperLid = new THREE.Mesh(G.lidUp, mats.lid);
  const lowerLid = new THREE.Mesh(G.lidLo, mats.lid);
  upperLid.rotation.x = LID_OPEN_ROT; lowerLid.rotation.x = -LID_OPEN_ROT;
  group.add(sclera, iris, cornea, upperLid, lowerLid);

  const meshes = { sclera, iris, cornea, upperLid, lowerLid };
  return {
    group, meshes, mats,
    setBlink(b) { const a = upperLidRot(b); upperLid.rotation.x = a; lowerLid.rotation.x = -a; },
    setLidPeel(p) { const a = lerp(LID_OPEN_ROT, LID_PEEL_ROT, clamp(p, 0, 1)); upperLid.rotation.x = Math.min(upperLid.rotation.x, a); lowerLid.rotation.x = Math.max(lowerLid.rotation.x, -a); },
    setPupil(s) { if (mats.irisMap) { mats.irisMap.repeat.set(s, s); } },   // >1 constricts
    setEmissive(x) { mats.iris.emissiveIntensity = x; },
    dispose() { for (const m of Object.values(mats)) if (m && m.dispose && m !== mats.irisMap) m.dispose(); if (opts.ownMaterials && mats.irisMap) mats.irisMap.dispose(); },
  };
}

// ---------------------------------------------------------------------------
// critically-damped-ish quaternion smoothing (overdamped, no overshoot).
// slerp fraction 1-exp(-k dt) reaches the target fast then settles: reads as a
// saccade "snap". Central uses steady k; flanks a snappier k.
// ---------------------------------------------------------------------------
function damp(q, goal, k, dt) { q.slerp(goal, 1 - Math.exp(-k * dt)); }

// ---------------------------------------------------------------------------
// buildEyeBand(opts) — seven eyes on a gentle arc.  ASYNC (loads textures).
//   opts: { textures?, scale?, prefer?, saccadeMean?, blinkMean? }
//   resolves to a controller (see return).
// ---------------------------------------------------------------------------
export async function buildEyeBand(opts = {}) {
  const tex = opts.textures || await loadEyeTextures({ prefer: opts.prefer });
  const G = geos();
  const group = new THREE.Group(); group.name = 'seraphEyeBand';
  const scale = opts.scale || 1;
  group.scale.setScalar(scale);

  // ---- arc layout (unit central radius 1) --------------------------------
  const sizeOf = (i) => Math.pow(0.55, Math.abs(i));       // canon R*0.55^|i|
  const gap = 1.06;
  const layout = [];                                       // {i, x, y, z, size}
  layout.push({ i: 0, x: 0, y: 0, z: 0, size: 1 });
  for (const sign of [-1, 1]) {
    let x = 0, prev = 1;
    for (let a = 1; a <= 3; a++) {
      const s = sizeOf(a);
      x += (prev + s) * gap;
      prev = s;
      layout.push({ i: sign * a, x: sign * x, y: -0.05 * x * x, z: -0.045 * x * x, size: s });
    }
  }
  layout.sort((p, q) => p.i - q.i);                        // -3..3

  const centralL = layout.find(l => l.i === 0);

  // ---- CENTRAL eye: full buildEye, own material group --------------------
  const central = buildEye({ textures: tex, ownMaterials: true });
  central.group.position.set(centralL.x, centralL.y, centralL.z);
  central.group.scale.setScalar(centralL.size);
  group.add(central.group);

  // laser socket at the central pupil depth (beam origin) — canon §4B
  const laserSocket = new THREE.Object3D();
  laserSocket.name = 'laserSocket';
  laserSocket.position.set(0, 0, PUPIL_Z);
  central.group.add(laserSocket);

  // ---- FLANK eyes: shared-geometry InstancedMeshes (5 draw calls) --------
  const flanks = layout.filter(l => l.i !== 0);
  const N = flanks.length;                                 // 6
  const flankMats = makeEyeMaterials(tex, { ownIris: false });
  patchIrisUvScale(flankMats.iris);

  // per-instance UV scale (pupil dilation variety) on a cloned iris geometry
  const irisGeoInst = G.iris.clone();
  const uvScale = new Float32Array(N);
  const im = {
    sclera: new THREE.InstancedMesh(G.sclera, flankMats.sclera, N),
    iris: new THREE.InstancedMesh(irisGeoInst, flankMats.iris, N),
    cornea: new THREE.InstancedMesh(G.cornea, flankMats.cornea, N),
    upperLid: new THREE.InstancedMesh(G.lidUp, flankMats.lid, N),
    lowerLid: new THREE.InstancedMesh(G.lidLo, flankMats.lid, N),
  };
  im.cornea.renderOrder = 3;
  for (const k of Object.keys(im)) { im[k].frustumCulled = false; group.add(im[k]); }

  // ---- per-eye animation state -------------------------------------------
  const tmpM = new THREE.Matrix4(), tmpM2 = new THREE.Matrix4();
  const irisOff = new THREE.Matrix4();      // iris/cornea caps built in place
  const corneaOff = new THREE.Matrix4();
  const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  const target = new THREE.Vector3(0, 0, 30);
  const targetLocal = new THREE.Vector3();

  const eyes = layout.map((l, idx) => {
    const isC = l.i === 0;
    const st = {
      l, isC,
      flankK: isC ? -1 : flanks.indexOf(l),
      pivot: new THREE.Object3D(),
      curQ: new THREE.Quaternion(),
      goalQ: new THREE.Quaternion(),
      offset: new THREE.Vector3(),
      nextSacc: expRand(opts.saccadeMean || 1.5),
      jitterPh: Math.random() * 7,
      blinkActive: false, blinkT: 0, blinkAmt: 0,
      nextBlink: 1.0 + expRand(opts.blinkMean || 5.5),
    };
    st.pivot.position.set(l.x, l.y, l.z);
    st.pivot.scale.setScalar(l.size);
    if (!isC) {
      const us = 0.9 + Math.random() * 0.28; uvScale[st.flankK] = us;
      im.sclera.setColorAt(st.flankK, new THREE.Color().setHSL(0.58, 0.05, 0.5 + (Math.random() - 0.5) * 0.06));
      im.iris.setColorAt(st.flankK, new THREE.Color(1, 1, 1).offsetHSL(0, 0, (Math.random() - 0.5) * 0.05));
    }
    return st;
  });
  irisGeoInst.setAttribute('aUvScale', new THREE.InstancedBufferAttribute(uvScale, 1));
  if (im.sclera.instanceColor) im.sclera.instanceColor.needsUpdate = true;
  if (im.iris.instanceColor) im.iris.instanceColor.needsUpdate = true;

  // ---- gaze / blink helpers ----------------------------------------------
  const BLINK = { close: 0.08, hold: 0.04, open: 0.2 };
  const blinkValue = (t) => {
    if (t < BLINK.close) return t / BLINK.close;
    if (t < BLINK.close + BLINK.hold) return 1;
    const o = t - BLINK.close - BLINK.hold;
    if (o < BLINK.open) return 1 - o / BLINK.open;
    return 0;
  };
  function goalQuatFor(st, wander, elapsed) {
    group.worldToLocal(targetLocal.copy(target));
    _v.copy(targetLocal).sub(st.pivot.position);
    if (wander) {
      _v.add(st.offset);
      const j = 0.02;                                  // micro-jitter
      _v.x += Math.sin(elapsed * 7.3 + st.jitterPh) * j;
      _v.y += Math.sin(elapsed * 9.1 + st.jitterPh * 1.7) * j;
    }
    if (_v.lengthSq() < 1e-6) { st.goalQ.identity(); return; }
    _v.normalize();
    st.goalQ.setFromUnitVectors(FORWARD, _v);
  }

  let chargeX = 0;
  const api = {
    group, laserSocket, eyes, central,
    object3d: group,
    texSource: tex.source || 'provided',

    setGazeTarget(v) { target.copy(v); },
    lookAt(v) { target.copy(v); },

    telegraphBlink() {
      for (const st of eyes) {
        goalQuatFor(st, false, 0);
        st.curQ.copy(st.goalQ);
        st.blinkActive = true; st.blinkT = 0;
        st.nextBlink = 4 + expRand(opts.blinkMean || 5.5);
      }
    },

    setCharge(x) { chargeX = clamp(x, 0, 1); },

    update(dt, elapsed) {
      dt = Math.min(dt, 0.05);
      for (const st of eyes) {
        // gaze
        if (st.isC) {
          goalQuatFor(st, false, elapsed);
          damp(st.curQ, st.goalQ, 16, dt);              // dead-steady tracking
        } else {
          if (elapsed >= st.nextSacc) {
            // retarget: usually near the player, sometimes exactly on it
            if (Math.random() < 0.3) st.offset.set(0, 0, 0);
            else st.offset.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 9, 0);
            st.nextSacc = elapsed + expRand(opts.saccadeMean || 1.5);
          }
          goalQuatFor(st, true, elapsed);
          damp(st.curQ, st.goalQ, 24, dt);              // snappy saccade
        }
        st.pivot.quaternion.copy(st.curQ);

        // blink scheduling (Poisson), guard against all-at-once
        if (!st.blinkActive && elapsed >= st.nextBlink) {
          const blinking = eyes.reduce((n, e) => n + (e.blinkActive ? 1 : 0), 0);
          if (blinking >= 3) st.nextBlink = elapsed + 0.3;
          else { st.blinkActive = true; st.blinkT = 0; }
        }
        if (st.blinkActive) {
          st.blinkT += dt;
          st.blinkAmt = blinkValue(st.blinkT);
          if (st.blinkT >= BLINK.close + BLINK.hold + BLINK.open) {
            st.blinkActive = false; st.blinkAmt = 0;
            st.nextBlink = elapsed + expRand(opts.blinkMean || 5.5);
          }
        }
        st.pivot.updateMatrix();
      }

      // central charge visuals (canon §4B: iris ramp, pupil constrict, lids peel)
      central.setEmissive(chargeX * 1.7);
      central.setPupil(1 + chargeX * 0.5);
      const cSt = eyes.find(e => e.isC);
      central.setBlink(cSt.blinkAmt);
      if (chargeX > 0) central.setLidPeel(chargeX);
      if (central.mats.irisMap) central.mats.irisMap.needsUpdate = false;

      // write flank instance matrices from pivots
      for (const st of eyes) {
        if (st.isC) continue;
        const k = st.flankK, P = st.pivot.matrix;
        im.sclera.setMatrixAt(k, P);
        im.iris.setMatrixAt(k, tmpM.multiplyMatrices(P, irisOff));
        im.cornea.setMatrixAt(k, tmpM.multiplyMatrices(P, corneaOff));
        const a = upperLidRot(st.blinkAmt);
        tmpM2.makeRotationX(a);
        im.upperLid.setMatrixAt(k, tmpM.multiplyMatrices(P, tmpM2));
        tmpM2.makeRotationX(-a);
        im.lowerLid.setMatrixAt(k, tmpM.multiplyMatrices(P, tmpM2));
      }
      im.sclera.instanceMatrix.needsUpdate = true;
      im.iris.instanceMatrix.needsUpdate = true;
      im.cornea.instanceMatrix.needsUpdate = true;
      im.upperLid.instanceMatrix.needsUpdate = true;
      im.lowerLid.instanceMatrix.needsUpdate = true;
    },

    dispose() {
      central.dispose();
      for (const k of Object.keys(im)) { im[k].dispose(); }
      for (const m of Object.values(flankMats)) if (m && m.dispose) m.dispose();
      irisGeoInst.dispose();
      for (const g of Object.values(G)) g.dispose();
      _geo = null;
      for (const t of [tex.iris, tex.sclera, tex.bump]) if (t && t.dispose) t.dispose();
    },
  };

  // prime one update so matrices are valid before first render
  api.update(0.016, 0);
  return api;
}
