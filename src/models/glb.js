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
  // THE MODEL'S OWN TEXTURE, WHICH THIS READER USED TO THROW AWAY. The header above said every file in the pack is
  // untextured vertex-colour geometry, and for the guns it is — but Ben's survival bags ship an atlas that carries
  // all their detail (bag.glb arrived as 11.34 MB of PNG for 1298 triangles). Keeping only baseColorFactor drew
  // them as one flat colour each, which is Ben 08-12: "field pack and normal backpack have no textures". The UVs
  // were already being read on line 71; only the image was missing.
  //
  // flipY IS FALSE AND MUST BE. glTF's UV origin is the top-left and three's TextureLoader flips for its own
  // convention; leaving the flip on turns every atlas upside down, which on a bag means the base panel's pixels
  // land on the lid and it reads as a differently-wrong texture rather than an obviously-wrong one.
  const texCache = new Map();
  const mkTex = ti => {
    if (ti == null) return null;
    if (texCache.has(ti)) return texCache.get(ti);
    let tex = null;
    try {
      const t = (g.textures || [])[ti];
      const img = t && t.source != null ? (g.images || [])[t.source] : null;
      let url = null;
      if (img && img.bufferView != null){
        const v = g.bufferViews[img.bufferView];
        url = URL.createObjectURL(new Blob([new Uint8Array(buf, bin.off + (v.byteOffset || 0), v.byteLength)],
                                          { type: img.mimeType || 'image/png' }));
      } else if (img && img.uri) url = img.uri;
      if (url){
        tex = new THREE.TextureLoader().load(url);
        tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
        const smp = (g.samplers || [])[t.sampler] || {};
        tex.wrapS = smp.wrapS === 33071 ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
        tex.wrapT = smp.wrapT === 33071 ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      }
    } catch (e){ tex = null; }
    texCache.set(ti, tex); return tex;
  };
  const mats = (g.materials || []).map(m => {
    const p = m.pbrMetallicRoughness || {};
    const f = p.baseColorFactor || [1, 1, 1, 1];
    const c = new THREE.Color().setRGB(f[0], f[1], f[2], THREE.LinearSRGBColorSpace);
    return { name: m.name || 'mat', color: c, metallic: p.metallicFactor != null ? p.metallicFactor : 1,
             rough: p.roughnessFactor != null ? p.roughnessFactor : 1,
             map: mkTex(p.baseColorTexture ? p.baseColorTexture.index : null) };
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
// ownBounds PROJECTS OVER THE TRIANGLES THAT ARE ACTUALLY DRAWN, and the distinction matters because splitTris
// hands every carve the WHOLE material's position buffer and only a narrower index. So geo.boundingBox is the
// extent of the material, not of this piece.
//
// For a tiling MAP that is what you want: the shotgun's forend and its receiver are one wood material cut in two,
// and projecting each over its own bounds would step the grain at the cut. For a LENS it is fatal. The scope's
// eyepiece is a small disc; projected over a rifle-length bbox its UVs came out around u 0.37-0.99, v 0.79-0.98,
// and the lens shader reads vUv-0.5 as circle-local coordinates — so r ran past 1.0 everywhere on the glass, the
// shader's rim term (smoothstep 0.82 to 1.0, tube shadow) evaluated to 1, and it painted the entire disc black.
// A live render target, a correct uActive, and a black hole where the sight picture goes.
function planarUV(geo, repeat, ownBounds){
  const p = geo.attributes.position;
  let b = geo.boundingBox || (geo.computeBoundingBox(), geo.boundingBox);
  if (ownBounds && geo.index){
    b = new THREE.Box3(); const v = new THREE.Vector3();
    for (let i = 0; i < geo.index.count; i++) b.expandByPoint(v.fromBufferAttribute(p, geo.index.getX(i)));
  }
  const sz = new THREE.Vector3(); b.getSize(sz);
  const ax = [0, 1, 2].sort((a, c) => sz.getComponent(c) - sz.getComponent(a)), u = ax[0], v = ax[1];
  const su = repeat / Math.max(1e-4, sz.getComponent(u)), sv = repeat / Math.max(1e-4, sz.getComponent(v));
  // getComponent TAKES TWO ARGUMENTS: (vertexIndex, component). Called as getComponent(i*3+u) — treating it as a
  // flat-array index, which is what the underlying array wants — the component is undefined, three reads
  // array[index*itemSize + undefined], and every u and v came out NaN. A NaN UV samples nothing, so the map
  // contributed one flat colour and the gun looked painted. That is the whole of Ben 08-12 "why guns are loading
  // without textures": the maps were attached, the UVs were not numbers. Nothing about this is visible from the
  // material — __hc.viewMaps() reports a correct 512x512 albedo on every mesh either way.
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++){
    uv[i * 2]     = (p.getComponent(i, u) - b.min.getComponent(u)) * su;
    uv[i * 2 + 1] = (p.getComponent(i, v) - b.min.getComponent(v)) * sv;
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
// `mats` NARROWS A BOX TO ONE KIND OF SURFACE, and it was accepted and then never read — the loop below tested
// only containsPoint. Two callers rely on it and both were silently wrong: the scope's eyepiece box asks for
// mats:/glass|lens/i and instead took every triangle whose centroid fell inside it, so 104 triangles of the bolt
// rifle's receiver and rear tube were drawn with the render-target lens shader. On screen that is a black hole
// where the back of the scope should be, which is Ben 08-12 "the rifle's scope is broken, the back part of it is
// invisible". The shotgun's forend carve asks for mats:/wood/i and had the same hole in it.
function splitTris(geo, boxes, matName){
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
    for (const bx of boxes) if ((!bx.mats || bx.mats.test(matName || '')) && bx.box.containsPoint(c)) { hit = bx.name; break; }
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

// opts.style(matName, mat) → {color, map, normalMap, repeat, shininess, specular, emissive, transparent, opacity,
// flat} decides what each of the model's materials becomes. Return nothing and the model's own colour
// is used. This is the hook the tool tiers ride: same geometry, a different palette and map per tier.
// opts.parts = [{name, box:THREE.Box3}] carves those regions into child groups (see splitTris); they land
// in g.userData.parts[name] and are NOT in the main body.
// BOX PROJECTION, PER TRIANGLE — because one plane cannot texture a solid. planarUV projects the whole part off its
// two widest axes, which for a rifle is length and height, i.e. from the SIDE. Any face not parallel to that plane
// gets a smear: the top of a receiver has a constant y, so its whole width takes ONE row of texels stretched across
// it, and the same happens on the front, the rear and the bottom. Grain appeared on the flanks and nowhere else,
// which is Ben 08-12 "rifles are still not textured properly" and most of "the backs of the scopes still have weird
// texturing" — the eyepiece end of a scope is exactly a face pointing along the projection axis.
//
// Each triangle is projected onto whichever axis plane it most faces, at ONE shared texel density, so the grain is
// the same size on every surface and does not step where the projection changes. That needs per-triangle UVs, so the
// geometry is expanded to non-indexed first: a vertex shared between the top and the side of a receiver cannot hold
// one UV that suits both. These are 1000-triangle models, so the expansion costs nothing worth measuring.
function boxUV(geo, repeat){
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  g.computeBoundingBox();
  const sz = new THREE.Vector3(); g.boundingBox.getSize(sz);
  const k = repeat / Math.max(1e-4, Math.max(sz.x, sz.y, sz.z));
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3){
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    e1.subVectors(b, a); n.subVectors(c, a).cross(e1);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    // the two axes that survive: a face pointing along x is textured by z and y, and so on
    const u0 = (ax >= ay && ax >= az) ? 2 : 0, v0 = (ay >= ax && ay >= az) ? 2 : 1;
    for (let j = 0; j < 3; j++){
      const v = j === 0 ? a : j === 1 ? b : c;
      uv[(i + j) * 2]     = v.getComponent(u0) * k;
      uv[(i + j) * 2 + 1] = v.getComponent(v0) * k;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function build(id, opts){
  const t = TEMPLATES.get(id); if (!t) return null;
  opts = opts || {};
  const g = new THREE.Group();
  const parts = {};
  if (opts.parts) for (const b of opts.parts){ const sub = new THREE.Group(); sub.name = b.name; parts[b.name] = sub; g.add(sub); }
  for (const part of t.parts){
    const s = (opts.style && opts.style(part.mat.name, part.mat)) || {};
    if (opts.parts){
      const cut = splitTris(part.geometry, opts.parts, part.mat.name);
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
  // THE MODEL'S OWN MAP IS THE FALLBACK, NEVER THE OVERRIDE. A caller that names a map means it: the guns wear
  // Ben's gunmetal and walnut scans over GENERATED UVs precisely because that geometry has no UVs of its own. So the
  // atlas is used only when no style map was asked for and the geometry really does carry the UVs to read it with
  // — generating them would otherwise overwrite the very coordinates the atlas is indexed by.
  const ownMap = (!s.map && !s.uv && part.mat.map && geo.attributes.uv) ? part.mat.map : null;
  // A tiling MAP gets box projection (every face, one texel density). s.uv without a map is a lens asking for a
  // 0..1 sweep across its own disc, which is a single flat surface and wants the planar one.
  if (s.map) geo = boxUV(geo, s.repeat || 3);
  else if (s.uv) planarUV(geo, s.uv === true ? 1 : s.uv, true);
  const md = { color: s.color != null ? new THREE.Color(s.color) : part.mat.color.clone() };
  if (s.map) md.map = s.map; else if (ownMap) md.map = ownMap;
  // A normal map needs the same planar UVs the albedo just got, so it only rides along with a map — never alone.
  if (s.map && s.normalMap) md.normalMap = s.normalMap;
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
