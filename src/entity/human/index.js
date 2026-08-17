// A HUMAN-SIZED CHARACTER, WITH THE MODEL AS A SWAPPABLE INPUT.
//
// Ben asked for a person in the world: human size, realistic lighting, basic animations, takes damage, can die. He has
// pointed at two assets so far and neither arrived in a state anything could load — the first was an RE Engine .pak, and the
// second, the fox girl, turned out to carry NO ARMATURE in any of its three .blend files. So the model is a parameter here,
// not a dependency: what this module owns is loading a textured mesh and standing it in the world at a stated height, and
// what moves it is separate.
//
// WHY NOT src/models/glb.js: that reader is deliberately a subset — untextured vertex-colour geometry, node matrices baked
// flat, no UVs. Every one of those omissions is load-bearing for the item pack and wrong here, where the colour lives
// entirely in the maps.
//
// WHY NOT THE GIANTESS READER: it requires JOINTS_0 and WEIGHTS_0 on every primitive and takes only skinned nodes, because
// its asset is a 115-bone character. This one has no skin at all, so that reader takes nothing and returns an empty body.
// Node matrices are baked flat here for the same reason glb.js bakes them: with no skeleton there is nothing to pose.
//
// THE MAPS ARE BOUND BY MATERIAL NAME FROM DISK, not read out of the GLB. The export deliberately carries no images
// (export_image_format='NONE') because the source set is 445 MB of film-resolution PNG and the game wants the 3.6 MB cut
// that scripts/cut-character-textures.mjs produces. Binding by name means re-cutting the textures never touches the mesh.
//
// ALBEDO ONLY, FOR NOW, AND ON PURPOSE. She ships normal, roughness and specular maps and none of them are loaded yet: a
// normal map needs tangents, and this game is mid-way through unifying its several disagreeing lighting paths into one
// shared model. Wiring a private PBR path for one character tonight would be torn out tomorrow, and "wet, warm, alive" is a
// material response to light rather than a texture. The maps are on disk and cut; they get bound as parameters to that model
// when it lands.
import * as THREE from 'three';

const TPL = new Map();       // url → template
const LOADING = new Map();

function chunks(buf){
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.byteLength){
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004e4942) bin = off + 8;
    off += 8 + len;
  }
  return { g: json, bin };
}

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function acc(g, buf, bin, i){
  const a = g.accessors[i], v = g.bufferViews[a.bufferView], T = COMP[a.componentType], n = NCOMP[a.type];
  // An interleaved view read as dense is silently wrong geometry — a body that is subtly the wrong shape and no error
  // anywhere — so it is refused rather than guessed at.
  if (v.byteStride && v.byteStride !== T.BYTES_PER_ELEMENT * n) throw new Error('interleaved accessor');
  return new T(buf, bin + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * n).slice();
}

// The node's world matrix, walked from the scene roots. With no skin this is the only transform a mesh has, and skipping it
// leaves every part of the body stacked at the origin.
function worldMatrices(g){
  const out = new Map(), M = new THREE.Matrix4();
  const walk = (ni, parent) => {
    const n = g.nodes[ni];
    M.identity();
    if (n.matrix) M.fromArray(n.matrix);
    else {
      const t = n.translation || [0,0,0], r = n.rotation || [0,0,0,1], s = n.scale || [1,1,1];
      M.compose(new THREE.Vector3(t[0],t[1],t[2]), new THREE.Quaternion(r[0],r[1],r[2],r[3]), new THREE.Vector3(s[0],s[1],s[2]));
    }
    const w = parent.clone().multiply(M);
    out.set(ni, w);
    for (const c of n.children || []) walk(c, w);
  };
  const I = new THREE.Matrix4();
  for (const r of g.scenes[g.scene || 0].nodes) walk(r, I);
  return out;
}

const _tex = (url, srgb, cb) => new THREE.TextureLoader().load(url, t => {
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.flipY = false;                 // glTF UVs have their origin top-left; three's default flip mirrors every map vertically
  t.anisotropy = 8; t.needsUpdate = true; if (cb) cb(t);
});

export function humanLoaded(url){ return TPL.has(url); }

// `skin` maps a glTF material NAME to {map, alpha}. Anything the file has that the caller does not name gets a plain white
// material rather than being dropped, so a missing binding shows up as a white limb — visible — instead of a hole.
export async function humanLoad(url, skin, base){
  if (TPL.has(url)) return true;
  if (LOADING.has(url)) return LOADING.get(url);
  const p = (async () => {
    try {
      const r = await fetch((base || './') + url);
      if (!r.ok) throw new Error(r.status);
      const buf = await r.arrayBuffer();
      const { g, bin } = chunks(buf);
      if (!g || bin == null) throw new Error('glb missing a chunk');
      const W = worldMatrices(g);

      const mats = (g.materials || []).map(m => {
        const name = m.name || 'mat';
        const s = (skin && skin[name]) || null;
        const mat = new THREE.MeshLambertMaterial({
          color: 0xffffff,
          side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
          transparent: false,
        });
        if (s && s.map) _tex((base || './') + s.map, true, t => { mat.map = t; mat.needsUpdate = true; });
        // ALPHA TEST, NOT BLENDING, for hair and lashes. Blended cutouts need back-to-front sorting that a character's own
        // overlapping hair cards cannot be given cheaply, and the failure is hair disappearing through itself as you circle
        // her. A cutout is one comparison and is correct at any angle.
        if (s && s.alpha){ mat.alphaTest = 0.5; mat.side = THREE.DoubleSide; }
        return { mat, name };
      });

      const parts = [];
      const box = new THREE.Box3();
      for (let ni = 0; ni < g.nodes.length; ni++){
        const n = g.nodes[ni];
        if (n.mesh == null) continue;
        const wm = W.get(ni) || new THREE.Matrix4();
        for (const pr of g.meshes[n.mesh].primitives || []){
          if ((pr.mode != null && pr.mode !== 4) || pr.attributes.POSITION == null) continue;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(acc(g, buf, bin, pr.attributes.POSITION), 3));
          if (pr.attributes.NORMAL != null) geo.setAttribute('normal', new THREE.BufferAttribute(acc(g, buf, bin, pr.attributes.NORMAL), 3));
          if (pr.attributes.TEXCOORD_0 != null) geo.setAttribute('uv', new THREE.BufferAttribute(acc(g, buf, bin, pr.attributes.TEXCOORD_0), 2));
          if (pr.indices != null) geo.setIndex(new THREE.BufferAttribute(acc(g, buf, bin, pr.indices), 1));
          if (!geo.getAttribute('normal')) geo.computeVertexNormals();
          geo.applyMatrix4(wm);            // baked: no skin means no reason to keep the hierarchy
          geo.computeBoundingBox();
          box.union(geo.boundingBox);
          parts.push({ geo, matIdx: pr.material == null ? -1 : pr.material, node: n.name || 'node' });
        }
      }
      const size = new THREE.Vector3(); box.getSize(size);
      TPL.set(url, { parts, mats, box, size, tris: parts.reduce((a,p)=>a + (p.geo.index ? p.geo.index.count : p.geo.getAttribute('position').count)/3, 0) });
      return true;
    } catch (e){ console.warn('[human] ' + url + ': ' + (e && e.message || e)); return false; }
    finally { LOADING.delete(url); }
  })();
  LOADING.set(url, p);
  return p;
}

// HEIGHT IS THE INPUT, NOT SCALE. An asset's units are whoever exported it's business — this one comes out about 1.7 units
// tall and the next one will not — so the caller says how many blocks tall the character should be and the scale is derived.
// Ben asked for "human size", and a human in this world is the player's own 1.8.
export function humanBuild(url, heightBlocks){
  const t = TPL.get(url); if (!t) return null;
  const group = new THREE.Group();
  // GEOMETRY IS CLONED. The viewmodel and drop paths dispose geometry and material of every mesh they drop, so handing out
  // the template's own buffers means the second character built is an empty body.
  for (const p of t.parts){
    const m = new THREE.Mesh(p.geo.clone(), p.matIdx >= 0 && t.mats[p.matIdx] ? t.mats[p.matIdx].mat : new THREE.MeshLambertMaterial({ color: 0xffffff }));
    m.name = p.node; m.castShadow = false; m.receiveShadow = false;
    group.add(m);
  }
  const s = (heightBlocks || 1.8) / Math.max(1e-6, t.size.y);
  group.scale.setScalar(s);
  // FEET ON THE GROUND. The template's box is in its own space, so its minimum y times the scale is how far the model sits
  // below its own origin; without this she stands buried or hovering, depending on how the asset was authored.
  group.position.y = -t.box.min.y * s;
  return group;
}

export function humanProbe(url){
  const t = TPL.get(url);
  if (!t) return { loaded: false };
  return { loaded: true, parts: t.parts.length, tris: Math.round(t.tris),
           materials: t.mats.map(m => ({ name: m.name, map: !!m.mat.map, alphaTest: m.mat.alphaTest || 0 })),
           size: [ +t.size.x.toFixed(3), +t.size.y.toFixed(3), +t.size.z.toFixed(3) ],
           minY: +t.box.min.y.toFixed(3) };
}
