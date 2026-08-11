// GLB → three.js, for the model pack in assets/models/. Small on purpose: every file in that pack is
// untextured vertex-colour geometry with POSITION/NORMAL/indices and one primitive per material, so a
// full glTF loader (draco, skins, animation, KHR extensions, image decode) would be 3000 lines of
// machinery for features no asset here uses. This is the subset those files actually need.
//
// TWO THINGS THAT LOOK LIKE DETAILS AND ARE NOT:
//   1. baseColorFactor is LINEAR. Colour management is on (renderer.outputColorSpace = SRGB), so
//      setHex() would treat the number as sRGB and convert it a second time — every model came out
//      near-black in the first pass (PaleGreen 0x2f491e is linear for #7ba055). setRGB(...,
//      LinearSRGBColorSpace) is the conversion, done once and by three itself.
//   2. build() CLONES geometry. _disposeView in index.html disposes geometry and material of every
//      mesh it drops, and it drops the viewmodel on every item swap — handing it the cached template's
//      geometry means the second time you draw a rifle it is an empty buffer.
import * as THREE from 'three';

const TEMPLATES = new Map();   // id ("guns/shotgun") → {parts:[{geometry,mat}], box}
const PENDING = new Map();

function readChunks(buf){
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.byteLength){
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004e4942) bin = { off: off + 8, len };
    off += 8 + len;
  }
  return { json, bin };
}

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function accessor(g, buf, bin, i){
  const a = g.accessors[i], v = g.bufferViews[a.bufferView];
  const T = COMP[a.componentType], n = NCOMP[a.type];
  const start = bin.off + (v.byteOffset || 0) + (a.byteOffset || 0);
  // A byteStride equal to the element size is dense; the pack never interleaves, and an interleaved
  // view read as dense is silently wrong geometry, so it is rejected rather than guessed at.
  if (v.byteStride && v.byteStride !== T.BYTES_PER_ELEMENT * n) throw new Error('interleaved accessor');
  return new T(buf, start, a.count * n);
}

// The node hierarchy, flattened: a template is a flat list of (geometry, material) with the node's
// world matrix already baked in, because nothing here needs to move a sub-node afterwards.
function parse(buf){
  const { json: g, bin } = readChunks(buf);
  if (!g || !bin) throw new Error('glb missing a chunk');
  const mats = (g.materials || []).map(m => {
    const p = m.pbrMetallicRoughness || {};
    const f = p.baseColorFactor || [1, 1, 1, 1];
    const c = new THREE.Color().setRGB(f[0], f[1], f[2], THREE.LinearSRGBColorSpace);
    return { name: m.name || 'mat', color: c, metallic: p.metallicFactor != null ? p.metallicFactor : 1,
             rough: p.roughnessFactor != null ? p.roughnessFactor : 1 };
  });
  const parts = [], box = new THREE.Box3();
  const walk = (idx, parent) => {
    const n = g.nodes[idx];
    const local = new THREE.Matrix4();
    if (n.matrix) local.fromArray(n.matrix);
    else local.compose(new THREE.Vector3().fromArray(n.translation || [0, 0, 0]),
                       new THREE.Quaternion().fromArray(n.rotation || [0, 0, 0, 1]),
                       new THREE.Vector3().fromArray(n.scale || [1, 1, 1]));
    const world = new THREE.Matrix4().multiplyMatrices(parent, local);
    if (n.mesh != null) for (const p of g.meshes[n.mesh].primitives || []){
      if (p.mode != null && p.mode !== 4) continue;                     // triangles only
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(accessor(g, buf, bin, p.attributes.POSITION).slice(), 3));
      if (p.attributes.NORMAL) geo.setAttribute('normal', new THREE.BufferAttribute(accessor(g, buf, bin, p.attributes.NORMAL).slice(), 3));
      if (p.attributes.TEXCOORD_0) geo.setAttribute('uv', new THREE.BufferAttribute(accessor(g, buf, bin, p.attributes.TEXCOORD_0).slice(), 2));
      if (p.indices != null) geo.setIndex(new THREE.BufferAttribute(accessor(g, buf, bin, p.indices).slice(), 1));
      geo.applyMatrix4(world);
      if (!p.attributes.NORMAL) geo.computeVertexNormals();
      geo.computeBoundingBox(); box.union(geo.boundingBox);
      parts.push({ geometry: geo, mat: mats[p.material] || { name: 'mat', color: new THREE.Color(0xcccccc), metallic: 0, rough: 1 } });
    }
    for (const c of n.children || []) walk(c, world);
  };
  for (const r of g.scenes[g.scene || 0].nodes) walk(r, new THREE.Matrix4());
  return { parts, box };
}

// UV-LESS GEOMETRY STILL TAKES A TEXTURE. The pack has no UVs at all, and a map on a geometry without
// them samples texel (0,0) — one flat colour, i.e. exactly the "lost its texture" complaint. Planar UVs
// projected off the two widest axes give the grain something to run along, which is all these maps are:
// woodTex is a grain and metalTex is a brushed noise, neither is a decal that has to land anywhere.
function planarUV(geo, repeat){
  const p = geo.attributes.position, b = geo.boundingBox || (geo.computeBoundingBox(), geo.boundingBox);
  const sz = new THREE.Vector3(); b.getSize(sz);
  const ax = [0, 1, 2].sort((a, c) => sz.getComponent(c) - sz.getComponent(a)), u = ax[0], v = ax[1];
  const su = repeat / Math.max(1e-4, sz.getComponent(u)), sv = repeat / Math.max(1e-4, sz.getComponent(v));
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++){
    uv[i * 2]     = (p.getComponent(i * 3 + u) - b.min.getComponent(u)) * su;
    uv[i * 2 + 1] = (p.getComponent(i * 3 + v) - b.min.getComponent(v)) * sv;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export async function loadModels(ids, base){
  base = base || './';
  await Promise.all(ids.map(async id => {
    if (TEMPLATES.has(id) || PENDING.has(id)) return PENDING.get(id);
    const p = (async () => {
      try {
        const r = await fetch(base + 'assets/models/' + id + '.glb');
        if (!r.ok) throw new Error(r.status + ' ' + id);
        TEMPLATES.set(id, parse(await r.arrayBuffer()));
      } catch (e) { console.warn('[glb] ' + id + ': ' + e.message); }   // a missing model falls back to the procedural builder; it must never take the boot down
      PENDING.delete(id);
    })();
    PENDING.set(id, p); return p;
  }));
}

export function hasModel(id){ return TEMPLATES.has(id); }
export function modelBox(id){ const t = TEMPLATES.get(id); return t ? t.box.clone() : null; }

// A MOVING PART OUT OF A ONE-PIECE MESH. The pack exports one primitive per material, so a shotgun's
// forend is welded to its receiver — and the reload animation in index.html racks userData.pump, a
// magazine drops on userData.mag, a scope has to disappear when a red dot is fitted instead. Triangles
// whose centroid is inside a named box are lifted into a child Group of that name, which the caller can
// then move, hide or re-material. It is a slice by region because region is the only thing the geometry
// carries: there are no part names in these files, only material names.
function splitTris(geo, boxes){
  const p = geo.attributes.position, idx = geo.index;
  const n = idx ? idx.count : p.count, get = i => (idx ? idx.getX(i) : i);
  const bins = new Map(); bins.set('', []);
  for (const b of boxes) bins.set(b.name, []);
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < n; i += 3){
    const a = get(i), b2 = get(i + 1), c2 = get(i + 2);
    c.set(0, 0, 0);
    for (const k of [a, b2, c2]) c.add(v.fromBufferAttribute(p, k));
    c.multiplyScalar(1 / 3);
    let hit = '';
    for (const bx of boxes) if (bx.box.containsPoint(c)) { hit = bx.name; break; }
    bins.get(hit).push(a, b2, c2);
  }
  const out = {};
  for (const [name, list] of bins){
    if (!list.length) continue;
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', p.clone());
    if (geo.attributes.normal) gg.setAttribute('normal', geo.attributes.normal.clone());
    if (geo.attributes.uv) gg.setAttribute('uv', geo.attributes.uv.clone());
    gg.setIndex(list);
    gg.computeBoundingBox();
    out[name] = gg;
  }
  return out;
}

// opts.style(matName, mat) → {color, map, repeat, shininess, specular, emissive, transparent, opacity,
// flat} decides what each of the model's materials becomes. Return nothing and the model's own colour
// is used. This is the hook the tool tiers ride: same geometry, a different palette and map per tier.
// opts.parts = [{name, box:THREE.Box3}] carves those regions into child groups (see splitTris); they land
// in g.userData.parts[name] and are NOT in the main body.
export function build(id, opts){
  const t = TEMPLATES.get(id); if (!t) return null;
  opts = opts || {};
  const g = new THREE.Group();
  const parts = {};
  if (opts.parts) for (const b of opts.parts){ const sub = new THREE.Group(); sub.name = b.name; parts[b.name] = sub; g.add(sub); }
  for (const part of t.parts){
    const s = (opts.style && opts.style(part.mat.name, part.mat)) || {};
    if (opts.parts){
      const cut = splitTris(part.geometry, opts.parts);
      for (const name in cut){
        if (name === '') continue;
        // The style is asked again WITH the part name: a scope lens and a scope tube are the same GLB
        // material, and only one of them is a render target.
        const ps = (opts.style && opts.style(part.mat.name, part.mat, name)) || s;
        parts[name].add(mkMesh(cut[name], ps, part));
      }
      if (cut['']) g.add(mkMesh(cut[''], s, part));
      continue;
    }
    g.add(mkMesh(part.geometry.clone(), s, part));
  }
  g.userData.glb = id;
  if (opts.parts) g.userData.parts = parts;
  return g;
}

function mkMesh(geo, s, part){
  // s.uv asks for planar UVs WITHOUT a map, which a caller-supplied shader may need: the scope lens samples its
  // render target through vUv over 0..1, and geometry from this pack has no UVs at all — so it read texel (0,0),
  // where the reticle shader's own rim term makes a black disc. That is the whole of "the scope is black".
  if (s.map || s.uv) planarUV(geo, s.map ? (s.repeat || 3) : (s.uv === true ? 1 : s.uv));
  const md = { color: s.color != null ? new THREE.Color(s.color) : part.mat.color.clone() };
  if (s.map) md.map = s.map;
  if (s.transparent){ md.transparent = true; md.opacity = s.opacity != null ? s.opacity : 0.5; }
  if (s.emissive != null) md.emissive = new THREE.Color(s.emissive);
  let mat;
  if (s.material) mat = s.material;                                    // a caller-supplied material (the scope lens is the game's own render-target material)
  else if (s.flat) mat = new THREE.MeshLambertMaterial(md);
  else { md.shininess = s.shininess != null ? s.shininess : Math.round(10 + 110 * (1 - part.mat.rough));
         md.specular = new THREE.Color(s.specular != null ? s.specular : (part.mat.metallic > 0.5 ? 0x50545e : 0x141414));
         mat = new THREE.MeshPhongMaterial(md); }
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.glbMat = part.mat.name;
  return m;
}
