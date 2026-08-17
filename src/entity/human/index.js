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

      // SKINNED PRIMITIVES ARE KEPT RAW. A skinned mesh's node transform must be IGNORED per the glTF spec - its vertices
      // live in skin space and the joints carry the transform - and more to the point its vertices are only in the right
      // place once a skeleton has posed them. Baking those flat put the body a metre and a half below her own eyes.
      // Unskinned primitives are still baked, because with no skeleton there is nothing to pose and the node matrix is the
      // only transform they have.
      const parts = [];
      for (let ni = 0; ni < g.nodes.length; ni++){
        const n = g.nodes[ni];
        if (n.mesh == null) continue;
        const skinned = n.skin != null;
        for (const pr of g.meshes[n.mesh].primitives || []){
          if ((pr.mode != null && pr.mode !== 4) || pr.attributes.POSITION == null) continue;
          parts.push({
            node: n.name || ('node' + ni), ni, skinned,
            matIdx: pr.material == null ? -1 : pr.material,
            pos: acc(g, buf, bin, pr.attributes.POSITION),
            nor: pr.attributes.NORMAL != null ? acc(g, buf, bin, pr.attributes.NORMAL) : null,
            uv:  pr.attributes.TEXCOORD_0 != null ? acc(g, buf, bin, pr.attributes.TEXCOORD_0) : null,
            idx: pr.indices != null ? acc(g, buf, bin, pr.indices) : null,
            si:  skinned && pr.attributes.JOINTS_0  != null ? acc(g, buf, bin, pr.attributes.JOINTS_0)  : null,
            sw:  skinned && pr.attributes.WEIGHTS_0 != null ? acc(g, buf, bin, pr.attributes.WEIGHTS_0) : null,
            wm:  skinned ? null : (W.get(ni) || new THREE.Matrix4()),
          });
        }
      }
      const _skin = (g.skins && g.skins[0]) || null;
      const skinInfo = _skin ? { joints: _skin.joints.slice(), ibm: acc(g, buf, bin, _skin.inverseBindMatrices) } : null;
      const box = new THREE.Box3();
      // THE BOX IS MEASURED IN BIND POSE, from the raw positions, because that is the pose the file ships in and the pose a
      // character starts from. Measuring it after an animation had run would make her height depend on which frame it was.
      for (const P of parts){
        const v = new THREE.Vector3();
        for (let i = 0; i < P.pos.length; i += 3){
          v.set(P.pos[i], P.pos[i+1], P.pos[i+2]);
          if (P.wm) v.applyMatrix4(P.wm);
          box.expandByPoint(v);
        }
      }
      const size = new THREE.Vector3(); box.getSize(size);
      TPL.set(url, { g, parts, mats, box, size, skin: skinInfo,
                     roots: g.scenes[g.scene || 0].nodes.slice(),
                     tris: parts.reduce((a,p)=>a + (p.idx ? p.idx.length : p.pos.length/3)/3, 0) });
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
  const g = t.g, group = new THREE.Group();

  // The node hierarchy, rebuilt so the joints are real Bones. A skinned mesh's own node is skipped here and its geometry is
  // added to the group below, for the reason in the loader.
  const objs = new Map(), jointSet = new Set(t.skin ? t.skin.joints : []);
  const mk = (ni) => {
    const n = g.nodes[ni];
    let o = null;
    if (!(n.mesh != null && n.skin != null)){
      o = jointSet.has(ni) ? new THREE.Bone() : new THREE.Object3D();
      o.name = n.name || ('node' + ni);
      if (n.matrix){ o.matrix.fromArray(n.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale); }
      else {
        if (n.translation) o.position.fromArray(n.translation);
        if (n.rotation) o.quaternion.fromArray(n.rotation);
        if (n.scale) o.scale.fromArray(n.scale);
      }
      objs.set(ni, o);
    }
    for (const c of n.children || []){ const co = mk(c); if (co && o) o.add(co); }
    return o;
  };
  for (const r of t.roots){ const o = mk(r); if (o) group.add(o); }

  // THE SCALE IS BAKED INTO THE SKIN, NOT SET ON THE GROUP, and this is the one structural decision in this function.
  // Skinning is bindMatrixInverse * (bone.matrixWorld * inverseBind) * bindMatrix * vertex, and bone.matrixWorld is a WORLD
  // matrix — so a scale on any ancestor of the bones is inside it, and the mesh's own matrixWorld then applies the same
  // scale again. There is no bind matrix that fixes that: measured both ways, asking for 7.2 blocks produced a body 24.41
  // tall (7.2 x 3.39) and asking for 1.8 produced 1.53 (1.8 / 3.39 x 2.88), which is s squared over s either way.
  // Baking is exact for a uniform scale and costs one pass over the vertices at build time, which happens once per body:
  // geometry positions x s, bone rest translations x s, and each inverse-bind matrix conjugated by the same scale, which
  // for a uniform scale is just its translation x s.
  const S = (heightBlocks || 1.8) / Math.max(1e-6, t.size.y);
  let skeleton = null;
  if (t.skin){
    const bl = t.skin.joints.map(j => objs.get(j)).filter(Boolean);
    if (bl.length === t.skin.joints.length){
      for (const bone of bl) bone.position.multiplyScalar(S);
      const inv = [];
      for (let i = 0; i < t.skin.joints.length; i++){
        const m = new THREE.Matrix4().fromArray(t.skin.ibm, i * 16);
        m.elements[12] *= S; m.elements[13] *= S; m.elements[14] *= S;
        inv.push(m);
      }
      skeleton = new THREE.Skeleton(bl, inv);
    }
  }
  // Anything above the joints in the hierarchy carries the scale too, or the bones start in the wrong place.
  for (const [ni, o] of objs) if (!jointSet.has(ni)) o.position.multiplyScalar(S);
  const bones = {}, skinned = [];
  if (skeleton) for (const b of skeleton.bones) bones[b.name] = b;

  for (const P of t.parts){
    const geo = new THREE.BufferGeometry();
    // GEOMETRY BUFFERS ARE COPIED. Everything in this game that drops a mesh disposes its geometry, so handing out the
    // template's own arrays means the second character built is an empty body.
    const _p = P.pos.slice();
    for (let i = 0; i < _p.length; i++) _p[i] *= S;
    geo.setAttribute('position', new THREE.BufferAttribute(_p, 3));
    if (P.nor) geo.setAttribute('normal', new THREE.BufferAttribute(P.nor.slice(), 3));
    if (P.uv)  geo.setAttribute('uv', new THREE.BufferAttribute(P.uv.slice(), 2));
    if (P.idx) geo.setIndex(new THREE.BufferAttribute(P.idx.slice(), 1));
    const mat = P.matIdx >= 0 && t.mats[P.matIdx] ? t.mats[P.matIdx].mat : new THREE.MeshLambertMaterial({ color: 0xffffff });
    let m;
    if (P.skinned && skeleton && P.si && P.sw){
      geo.setAttribute('skinIndex',  new THREE.BufferAttribute(P.si.slice(), 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(P.sw.slice(), 4));
      if (!P.nor) geo.computeVertexNormals();
      m = new THREE.SkinnedMesh(geo, mat);
      group.add(m);
      skinned.push(m);          // bound AFTER the scale is set - see the note at the bottom of this function
      m.frustumCulled = false;
    } else {
      if (P.wm) geo.applyMatrix4(P.wm);
      if (!P.nor) geo.computeVertexNormals();
      m = new THREE.Mesh(geo, mat);
      group.add(m);
    }
    m.name = P.node;
    m.castShadow = false; m.receiveShadow = false;
  }

  // HEIGHT IS THE INPUT, NOT SCALE. An asset's units are whoever exported it's business, so the caller says how many blocks
  // tall the character should be and the scale is derived — and then baked in above, so the group itself stays at 1.
  // FEET ON THE GROUND. The bind-pose box minimum times the scale is how far the body sits below its own origin.
  group.position.y = -t.box.min.y * S;
  group.updateMatrixWorld(true);
  // With the scale baked, every mesh's world matrix is a pure translation and the bind is the ordinary one.
  for (const m of skinned) m.bind(skeleton, m.matrixWorld.clone());
  group.userData.bones = bones;
  group.userData.skeleton = skeleton;
  // THE REST POSE, CAPTURED ONCE. Every pose below is written as rest * delta and never as an increment on whatever the
  // bone already held — an accumulating rotation drifts, and a sway that drifts turns a standing body into a corkscrew
  // over a minute. This is the same discipline the Wretch's animator uses and for the same reason.
  const rest = new Map();
  if (skeleton) for (const b of skeleton.bones) rest.set(b, b.quaternion.clone());
  group.userData.rest = rest;
  return group;
}

export function humanProbe(url){
  const t = TPL.get(url);
  if (!t) return { loaded: false };
  // PER PART, and not only per material. A primitive with no material at all gets the white fallback, which is a white
  // object standing in the world — and from a distance a white object is indistinguishable from a cloud, which is exactly
  // how the first frames read. The per-part box says WHERE each one landed, which is what catches a mesh whose transform
  // did not come with it.
  return { loaded: true, parts: t.parts.length, tris: Math.round(t.tris),
           skinned: t.parts.filter(p => p.skinned).length,
           bones: t.skin ? t.skin.joints.length : 0,
           partList: t.parts.map(p => ({ node: p.node, mat: p.matIdx, skinned: !!p.skinned,
                      tris: Math.round((p.idx ? p.idx.length : p.pos.length/3)/3) })),
           materials: t.mats.map(m => ({ name: m.name, map: !!m.mat.map, alphaTest: m.mat.alphaTest || 0 })),
           size: [ +t.size.x.toFixed(3), +t.size.y.toFixed(3), +t.size.z.toFixed(3) ],
           minY: +t.box.min.y.toFixed(3) };
}

// ---- IDLE SWAY -----------------------------------------------------------------------------------------------------
// Ben: "add an idle sway". She stands still — no wandering, no turning, no locomotion — and this is the only animation she
// has, so it carries the entire impression of her being alive. What that means in practice:
//
//   SLOW AND SMALL. A few centimetres of weight shift, a breath in the chest and shoulders, the head drifting a degree or
//   two. A large idle reads as a dance; a fast one reads as a twitch. The amplitudes below are in radians and the biggest
//   of them is under two degrees.
//   NON-REPEATING TO THE EYE. Three cycles at deliberately unrelated periods — 0.23, 0.37 and 0.61 Hz, whose ratios are
//   not simple fractions — so the combination does not close for many minutes. A single clean sine is the tell that says
//   "this is an animation" rather than "this is a person", which is the same reasoning as the weapon sway.
//   THE FEET STAY PLANTED. The motion comes from the ankles, hips and spine; the weight moves BETWEEN the feet rather
//   than the whole body sliding, because a body that translates without its feet responding looks like a floating model.
//   AMPLITUDE DOES NOT SCALE WITH SIZE. She is 7.2 blocks, four times a person, and a linear scale would sway her a metre
//   and read as a swaying tower. A bigger body moves slower and proportionally less, so `size` slows the clock and shrinks
//   the angles rather than growing them.
const _iq = new THREE.Quaternion(), _ie = new THREE.Euler();
export function humanIdle(group, t, size){
  const rest = group && group.userData && group.userData.rest;
  const B = group && group.userData && group.userData.bones;
  if (!rest || !B) return false;
  // A body four times human moves at about half the rate and two thirds the angle. Both are gentle curves rather than
  // divisions, so a human-sized character is unchanged and a giant is calmed rather than frozen.
  const S = Math.max(1, (size || 1.8) / 1.8);
  const k = 1 / Math.sqrt(S), amp = 1 / Math.pow(S, 0.55);
  const a = t * 0.23 * 6.2831853 * k;      // the slow weight shift, left foot to right
  const b = t * 0.37 * 6.2831853 * k;      // the breath
  const c = t * 0.61 * 6.2831853 * k;      // the small head drift, fastest of the three and still under a hertz
  const set = (name, x, y, z) => {
    const bone = B[name]; if (!bone) return;
    const r = rest.get(bone); if (!r) return;
    _ie.set(x, y, z, 'XYZ'); _iq.setFromEuler(_ie);
    bone.quaternion.copy(r).multiply(_iq);
  };
  const sa = Math.sin(a), sb = Math.sin(b), sc = Math.sin(c);
  // THE WEIGHT SHIFT IS THE WHOLE THING. The pelvis rolls a degree toward the loaded foot and the spine counter-rolls
  // most of it back, which is what a person standing does and what keeps the shoulders level while the hips move.
  set('pelvis', 0.004 * sb * amp,  0.006 * sa * amp,  0.017 * sa * amp);
  set('spine',  0.005 * sb * amp,  0.003 * sc * amp, -0.011 * sa * amp);
  // The breath lives in the chest, and it is the one cycle a viewer can name if it is wrong: too big and she is panting.
  set('chest',  0.010 * sb * amp, -0.002 * sa * amp, -0.005 * sa * amp);
  set('neck',  -0.006 * sb * amp,  0.004 * sc * amp,  0.004 * sa * amp);
  set('head',   0.008 * sc * amp,  0.012 * sa * 0.5 * amp, 0.009 * sc * amp);
  // ANKLES TAKE THE ROLL BACK OUT so the feet stay flat on the ground rather than rocking onto their edges with the hips.
  set('footL',  0, 0, -0.010 * sa * amp);
  set('footR',  0, 0, -0.010 * sa * amp);
  // The arms hang and lag the body slightly, which is what stops them reading as welded to the ribs.
  set('armL',   0.010 * sb * amp, 0,  0.008 * sa * amp);
  set('armR',   0.010 * sb * amp, 0, -0.008 * sa * amp);
  return true;
}
// Put every bone back to the pose the file shipped in. Called when she dies, so the ragdoll takes a still body rather
// than one that goes on breathing while it falls.
export function humanRest(group){
  const rest = group && group.userData && group.userData.rest;
  if (!rest) return false;
  for (const [bone, q] of rest) bone.quaternion.copy(q);
  return true;
}
