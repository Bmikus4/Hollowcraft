// THE GIANTESS — a skinned, textured character the rest of the game has no loader for.
//
// src/models/glb.js is deliberately a subset: untextured vertex-colour geometry, node matrices baked
// flat, no skins. Every one of those omissions is load-bearing for the item pack and wrong for this
// asset, which is a rigged 115-bone character with three PNG-mapped materials and 58k triangles. So
// this is its own reader rather than three more flags in that file:
//   - skins. The mesh has JOINTS_0/WEIGHTS_0 and NO animation clips, so the file only carries a bind
//     pose. Baking the node matrices (what glb.js does) would give a statue; a real Skeleton is what
//     lets the legs be posed, and the walk and the stomp are both bone rotations.
//   - textures. The colour lives entirely in the maps — baseColorFactor is absent on all three
//     materials, so a colour-only read of this file is a white mannequin.
//   - KHR_materials_unlit is IGNORED on purpose. Unlit means she keeps full daylight brightness at
//     midnight, standing lit in a game whose horror is darkness. Lambert + map puts her under the
//     same sun and torchlight as everything else.
import * as THREE from 'three';

let TPL = null;              // {meshes:[{name,geo-data,matIdx}], mats:[...], joints, ibm, nodes, skinRoot}
let LOADING = null;

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
  if (v.byteStride && v.byteStride !== T.BYTES_PER_ELEMENT * n) throw new Error('interleaved accessor');
  return new T(buf, bin + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * n).slice();
}

async function imageTex(g, buf, bin, imgIdx){
  const im = g.images[imgIdx], v = g.bufferViews[im.bufferView];
  const bytes = new Uint8Array(buf, bin + (v.byteOffset || 0), v.byteLength);
  const bmp = await createImageBitmap(new Blob([bytes], { type: im.mimeType || 'image/png' }));
  const t = new THREE.Texture(bmp);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;                       // glTF UVs have their origin top-left; three's default flip mirrors every map vertically
  t.needsUpdate = true;
  return t;
}

// Meshes whose only purpose is to be dropped. Ben: "no shoes" — the shoes are one node, so barefoot is
// one omission rather than a texture edit. Named by node name because that is what the file carries.
const DROP = new Set(['Low-heeled mules']);

export function giantessLoaded(){ return !!TPL; }

export async function giantessLoad(base){
  if (TPL) return true;
  if (LOADING) return LOADING;
  LOADING = (async () => {
    try {
      const r = await fetch((base || './') + 'assets/models/mobs/anime_girl.glb');
      if (!r.ok) throw new Error(r.status);
      const buf = await r.arrayBuffer();
      const { g, bin } = chunks(buf);
      if (!g || bin == null) throw new Error('glb missing a chunk');

      const mats = await Promise.all((g.materials || []).map(async m => {
        const p = m.pbrMetallicRoughness || {};
        const out = { name: m.name || 'mat', color: new THREE.Color(0xffffff), map: null, side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide };
        if (p.baseColorFactor) out.color.setRGB(p.baseColorFactor[0], p.baseColorFactor[1], p.baseColorFactor[2], THREE.LinearSRGBColorSpace);
        if (p.baseColorTexture) out.map = await imageTex(g, buf, bin, g.textures[p.baseColorTexture.index].source);
        return out;
      }));

      // Only the skinned nodes are taken. The file also carries three loose Planes with no material at
      // all (export leftovers); drawn, they are white sheets standing in the world next to her.
      const meshes = [];
      for (let ni = 0; ni < g.nodes.length; ni++){
        const n = g.nodes[ni];
        if (n.mesh == null || n.skin == null || DROP.has(n.name)) continue;
        for (const p of g.meshes[n.mesh].primitives || []){
          if ((p.mode != null && p.mode !== 4) || p.material == null) continue;
          meshes.push({ name: n.name || 'mesh', mat: p.material,
            pos: acc(g, buf, bin, p.attributes.POSITION),
            nor: p.attributes.NORMAL != null ? acc(g, buf, bin, p.attributes.NORMAL) : null,
            uv:  p.attributes.TEXCOORD_0 != null ? acc(g, buf, bin, p.attributes.TEXCOORD_0) : null,
            si:  acc(g, buf, bin, p.attributes.JOINTS_0),
            sw:  acc(g, buf, bin, p.attributes.WEIGHTS_0),
            idx: p.indices != null ? acc(g, buf, bin, p.indices) : null });
        }
      }
      const skin = g.skins[0];
      TPL = { g, mats, meshes, joints: skin.joints.slice(),
              ibm: acc(g, buf, bin, skin.inverseBindMatrices),
              roots: g.scenes[g.scene || 0].nodes.slice() };
      return true;
    } catch (e){ console.warn('[giantess] ' + (e && e.message || e)); return false; }
    finally { LOADING = null; }
  })();
  return LOADING;
}

// ---- rig -------------------------------------------------------------------------------------------
// One instance. The bones ARE the animation: there are no clips in the file, so walk() and stomp()
// below write bone quaternions directly, always as rest * delta so a pose is never accumulated onto
// itself (the drift that turns a walk cycle into a corkscrew after a minute).
export function giantessBuild(scale){
  if (!TPL) return null;
  const g = TPL.g, group = new THREE.Group();
  const objs = new Map(), jointSet = new Set(TPL.joints);
  const mk = (ni) => {
    const n = g.nodes[ni];
    let o;
    if (n.mesh != null && n.skin != null && !DROP.has(n.name)) o = null;         // built below, after the bones exist
    else o = jointSet.has(ni) ? new THREE.Bone() : new THREE.Object3D();
    if (o){
      o.name = n.name || ('node' + ni);
      if (n.matrix){ o.matrix.fromArray(n.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale); }
      else {
        if (n.translation) o.position.fromArray(n.translation);
        if (n.rotation) o.quaternion.fromArray(n.rotation);
        if (n.scale) o.scale.fromArray(n.scale);
      }
      objs.set(ni, o);
    }
    for (const c of n.children || []) { const co = mk(c); if (co && o) o.add(co); }
    return o;
  };
  for (const r of TPL.roots){ const o = mk(r); if (o) group.add(o); }

  const bones = TPL.joints.map(j => objs.get(j)).filter(Boolean);
  if (bones.length !== TPL.joints.length) return null;
  const inv = [];
  for (let i = 0; i < TPL.joints.length; i++) inv.push(new THREE.Matrix4().fromArray(TPL.ibm, i * 16));
  const skeleton = new THREE.Skeleton(bones, inv);

  const skinParent = objs.get(g.nodes.findIndex(n => (n.children || []).includes(TPL.joints[0]))) || group;
  const built = [];
  for (const m of TPL.meshes){
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    if (m.nor) geo.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
    if (m.uv) geo.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(m.si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(m.sw, 4));
    if (m.idx) geo.setIndex(new THREE.BufferAttribute(m.idx, 1));
    if (!m.nor) geo.computeVertexNormals();
    const src = TPL.mats[m.mat];
    const mat = new THREE.MeshLambertMaterial({ color: src.color.clone(), map: src.map, side: src.side });
    // The maps are cut-out art (hair strands, eyelashes, the eye whites over the face). Alpha-test
    // rather than transparent: 12 nested transparent meshes on one body sort against each other
    // every frame and flicker, and nothing here needs partial opacity.
    mat.alphaTest = 0.5; mat.transparent = false;
    const sm = new THREE.SkinnedMesh(geo, mat);
    sm.name = m.name;
    sm.castShadow = true; sm.receiveShadow = true;
    sm.frustumCulled = false;      // at this scale her origin is often off-screen while her legs fill it
    skinParent.add(sm);
    // Bind matrix IDENTITY, explicitly. glTF skinning is defined in skin space, and bind()'s default is
    // the mesh's matrixWorld — which is whatever the parent chain happened to be when the mesh was added,
    // so the scale set on the group below would otherwise be applied to her twice.
    sm.bind(skeleton, new THREE.Matrix4());
    built.push(sm);
  }
  const s = scale || 1;
  group.scale.set(s, s, s);
  group.updateMatrixWorld(true);

  const bone = {};
  for (const b of bones) bone[b.name.trim()] = b;
  const rest = new Map();
  for (const b of bones) rest.set(b, b.quaternion.clone());

  const rig = { group, skeleton, bones, bone, rest, meshes: built, scale: s,
                height: 1.67 * s,            // bind-pose head top; measured from the file, not guessed
                ankle: 0, _step: 0,
                _q: new THREE.Quaternion(), _e: new THREE.Euler() };
  // THE LEG, MEASURED. The IK needs the two segment lengths and the hip's height above her feet plane, and
  // all three are properties of this file's skeleton at this scale — the sole is not at the ankle joint and
  // the thigh is not half the leg, so none of them can be taken from the model's overall height.
  const a = new THREE.Vector3(), h = new THREE.Vector3(), k = new THREE.Vector3();
  bone['foot.L'].getWorldPosition(a); bone['thigh.L'].getWorldPosition(h); bone['shin.L'].getWorldPosition(k);
  rig.ankle = a.y - group.position.y;
  const L1 = h.distanceTo(k), L2 = k.distanceTo(a);
  rig.leg = { L1, L2, len: L1 + L2, hipY: h.y - group.position.y };
  return rig;
}

// A bone set to rest * euler(x,y,z). Blender bones point along their own +Y, so X is the swing axis of
// a limb and Z is its splay — that is why every pose below is mostly X.
function set(rig, name, x, y, z){
  const b = rig.bone[name]; if (!b) return;
  rig._e.set(x || 0, y || 0, z || 0);
  b.quaternion.copy(rig.rest.get(b)).multiply(rig._q.setFromEuler(rig._e));
}
function rest(rig, name){ const b = rig.bone[name]; if (b) b.quaternion.copy(rig.rest.get(b)); }

// SIGN, MEASURED NOT GUESSED. +X on thigh.L swings the foot toward -Z (see bench/assert-giantess.mjs,
// "thigh sign"); she faces +Z, so a forward stride is NEGATIVE X and this constant carries it.
const FWD = -1;

// ARMS HELD OUT TO HER SIDES (Ben 08-11). They were tucked against her hips for one pass, which read as an
// ordinary walk; out is what makes her read as a thing coming for you rather than a person going somewhere.
// +Z on the left upper arm and -Z on the right abduct — measured, +0.7 rad carries the left hand 1.34
// blocks OUT and 1.76 up (__hc.girlPoke, which exists for exactly this question), so 0.45 on top of the
// file's A-pose lifts them to about shoulder height.
const ARM = -0.45;

const LIMBS = ['thigh.L','shin.L','foot.L','thigh.R','shin.R','foot.R','upper_arm.L','forearm.L','upper_arm.R','forearm.R','spine.003','Neck','Head'];

// ---- the walk --------------------------------------------------------------------------------------
// THE FOOT PATH IS THE ANIMATION, and the joint angles are solved from it (Ben 08-11: "walking animation
// should be hyperrealistic"). Two earlier versions authored the joints directly — first as sine waves, then
// from the clinical hip/knee/ankle curves of a real gait cycle — and BOTH slid. The measurement that killed
// the approach: with the joints driven independently, the planted ankle's fore-aft travel is wildly
// non-uniform. It covered 2.1 blocks in the first third of stance, then stalled and crept FORWARD (trace at
// __hc.girlTrace), so against a body moving at a constant speed the sole scraped 0.5-0.65 blocks for every
// block she walked — at every speed, and at every phase rate swept. That is not a rough animation, it is
// the wrong architecture: a leg is a two-link chain, and an even, straight path along the ground is a
// property of the CHAIN, not of any three independent curves.
//
// So the sole is given the path it must follow — backward at exactly the body's speed while it is down, an
// arc through the air while it is not — and the hip and knee are solved to hit it (law of cosines, closed
// form, no iteration). Zero foot slip is then structural rather than tuned: it cannot drift when a number
// is retuned, and it holds at every speed. Everything a viewer reads as realism rides on top as a layer —
// the pelvis dropping toward the swing leg, the trunk counter-rotating against it, the hips rising twice a
// cycle, heel strike and toe-off roll, the arms in opposition.
//
// Stance is 60% of the cycle and swing 40%, so both feet are down for the 20% overlap — real double
// support. That is also why one sole travels 1.2 step lengths per stance and not one: the body advances 1.2
// steps in the time a single foot is down. Getting that factor wrong is what left the previous version's
// phase rate wrong by a constant, and a constant-factor error is invisible in a screenshot.
const D = Math.PI / 180;
const STANCE = 0.60;

// A two-link solve for one leg. Every angle is a DELTA from the rest pose, which is standing, so 0 is a
// straight leg. Forward-positive throughout; FWD carries the file's actual bone direction.
function legIK(rig, L, footZ, footY, hipZ, hipY, roll){
  const g = rig.leg, dz = footZ - hipZ, dy = footY - hipY;
  const reach = Math.min(g.L1 + g.L2 - 0.02, Math.max(Math.abs(g.L1 - g.L2) + 0.02, Math.hypot(dz, dy)));
  const th = Math.atan2(dz, -dy);                                        // hip-to-ankle line, 0 = straight down
  const cb = (g.L1 * g.L1 + reach * reach - g.L2 * g.L2) / (2 * g.L1 * reach);
  const ck = (g.L1 * g.L1 + g.L2 * g.L2 - reach * reach) / (2 * g.L1 * g.L2);
  const beta = Math.acos(Math.max(-1, Math.min(1, cb)));                 // the thigh sits forward of that line by beta
  const knee = Math.PI - Math.acos(Math.max(-1, Math.min(1, ck)));       // …and the knee bends backward by this
  const thigh = th + beta;
  set(rig, 'thigh.' + L, FWD * thigh, 0, 0);
  set(rig, 'shin.' + L, FWD * -knee, 0, 0);
  // The sole stays parallel to the ground unless it is rolling over the heel or the toes: the ankle undoes
  // whatever the shin is doing in world terms. Without this the foot points wherever the shin left it,
  // which is the most doll-like thing a walk can do.
  set(rig, 'foot.' + L, FWD * (-(thigh - knee) + roll), 0, 0);
}

// The sole's path in her own frame as a function of the cycle. z is fore-aft (+ is the way she faces), y is
// height above her feet plane. The numbers are step lengths and leg lengths, not tuning knobs.
function footPath(rig, u, S){
  const half = 0.6 * S;                                     // 1.2 step lengths of travel over one stance
  if (u < STANCE){
    const t = u / STANCE;
    return { z: half - 2 * half * t, y: rig.ankle,
             // heel strike, flat through mid-stance, then the heel lifts and she rolls over the toes
             roll: (t < 0.12 ? (1 - t / 0.12) * 10 * D : 0) - (t > 0.72 ? (t - 0.72) / 0.28 * 24 * D : 0) };
  }
  const w = (u - STANCE) / (1 - STANCE);
  const e = w * w * (3 - 2 * w);                            // the swing leg accelerates and settles; never linear
  return { z: -half + 2 * half * e, y: rig.ankle + Math.sin(Math.PI * w) * rig.leg.len * 0.20,
           roll: 8 * D * Math.sin(Math.PI * w) };           // toes up through the swing, so she does not stub 13 blocks of leg
}

export function giantessWalk(rig, phase, speed){
  const s = Math.min(1, speed == null ? 1 : speed);
  const S = giantessStep(rig);
  const u = (phase / (Math.PI * 2)) % 1, v = (u + 0.5) % 1;
  // The hips rise and fall TWICE per cycle — highest over each planted leg, lowest at double support. It is
  // the one piece of vertical motion that is authored, and it is small: 2% of leg length.
  const hipY = rig.leg.hipY - rig.leg.len * 0.02 * (1 - Math.cos(4 * Math.PI * u)) * 0.5 * s;
  const fl = footPath(rig, u, S), fr = footPath(rig, v, S);
  legIK(rig, 'L', fl.z * s, fl.y, 0, hipY, fl.roll * s);
  legIK(rig, 'R', fr.z * s, fr.y, 0, hipY, fr.roll * s);
  set(rig, 'toe.L', FWD * -Math.max(0, -fl.roll) * 1.4 * s, 0, 0);       // the toes extend as the heel comes off
  set(rig, 'toe.R', FWD * -Math.max(0, -fr.roll) * 1.4 * s, 0, 0);
  // THE PELVIS BONE MUST NOT MOVE, and this is not a stylistic choice. Both thighs are children of `spine`
  // in this rig, so rotating it swings the whole leg chain bodily and every IK target the solve just hit is
  // displaced — measured, 4 degrees of pelvic rotation plus 5 of drop reintroduced 0.29 blocks of foot slip
  // per block walked, which was 90% of all the slip left after the IK went in. So the sway lives ABOVE the
  // legs: the lumbar carries the counter-rotation and the lateral lean, which is what a viewer reads as the
  // hips working anyway, and the legs keep the ground they were solved against.
  rest(rig, 'spine');
  const rot = Math.sin(phase) * 5 * D * s, drop = Math.cos(phase) * 6 * D * s;
  set(rig, 'spine.001', 0, rot, drop);
  set(rig, 'spine.003', -2 * D * s, -rot * 1.2, -drop * 0.5);
  set(rig, 'Neck', 0, -rot * 0.3, 0);                                    // the head stays level, facing where she is going
  // The arms stay out (Ben) and swing in opposition — left arm forward with the right leg.
  const sw = Math.sin(phase) * 22 * D * s;
  set(rig, 'upper_arm.L', FWD * -sw, 0, -ARM);
  set(rig, 'upper_arm.R', FWD * sw, 0, ARM);
  set(rig, 'forearm.L', FWD * -(20 + 18 * Math.max(0, -Math.sin(phase))) * D * s, 0, 0);
  set(rig, 'forearm.R', FWD * -(20 + 18 * Math.max(0, Math.sin(phase))) * D * s, 0, 0);
}

// STEP LENGTH, FROM THE LEG. It is no longer measured by sampling the animation: with the path solved by
// IK, any step length walks without slipping, so this is a choice about how she moves rather than a
// constraint. 0.60 of leg length is the longest step that keeps the sole inside the hip's reach at both
// ends of stance — past that the IK clamps, and a clamped IK is a foot that slides again. At her size that
// is 4.1 blocks, so 5.2 blocks/s comes out near one step a second: a giant's cadence, not a human's.
export function giantessStep(rig){ return rig.leg.len * 0.60; }

// GROUNDED ON THE SUPPORT ANKLE. The IK already puts both soles at the right height in her own frame, so
// this is a small correction now rather than the thing holding her up: it absorbs the fact that the rest
// pose is not a perfectly straight leg, and it is what keeps her feet on sloping ground.
export function giantessGroundY(rig, groundY){
  rig.group.position.y = groundY;
  rig.group.updateMatrixWorld(true);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  rig.bone['foot.L'].getWorldPosition(a); rig.bone['foot.R'].getWorldPosition(b);
  return groundY + (groundY + rig.ankle - Math.min(a.y, b.y));
}

export const STOMP_HIT = 0.62;
export function giantessStomp(rig, t, leg){
  const L = leg === 'L' ? 'L' : 'R', O = L === 'L' ? 'R' : 'L';
  const lift = t < 0.45 ? Math.sin(t / 0.45 * Math.PI * 0.5) : (t < STOMP_HIT ? 1 - (t - 0.45) / (STOMP_HIT - 0.45) : 0);
  const settle = t < STOMP_HIT ? 0 : Math.max(0, 1 - (t - STOMP_HIT) / 0.38);
  const plant = t < 0.45 ? 0 : (t < STOMP_HIT ? (t - 0.45) / (STOMP_HIT - 0.45) : 1);
  // THE KNEE COMES UP PAST HER WAIST (Ben 08-11: "leg doesnt raise high enough"). 1.35 rad on the thigh put
  // the sole about a body's width off the ground on a 13.5-block frame, which at her scale is a step, not a
  // stomp. 2.15 folds the leg up in front of her; the shin follows it or the shin passes through her chest.
  const thighA = 2.15 * lift + 0.5 * plant, kneeA = 2.0 * lift;
  set(rig, 'thigh.' + L, FWD * thighA, 0, 0);                               // knee to the chest, then the sole out and down
  set(rig, 'shin.' + L, FWD * -kneeA, 0, 0);                                // the shin folds the other way — that is a knee
  // THE ANKLE UNDOES THE LEG, exactly as it does in the walk (legIK). The stomp used to author the ankle as
  // its own curve, and at the impact frame that left the thigh's 0.5 rad of forward drive still in the sole:
  // she landed toes-up by about 43 degrees and hit the ground with her heel edge. Sole angle is not a free
  // number on a chain — it is -(thigh - knee), plus whatever dorsiflexion is wanted on top, which is only
  // the lift here so the sole faces the player on the way up.
  set(rig, 'foot.' + L, FWD * (-(thighA - kneeA) - 0.35 * lift), 0, 0);
  set(rig, 'thigh.' + O, FWD * (-0.25 * lift - 0.1 * settle), 0, 0);        // the planted leg takes the whole weight and bends for it
  set(rig, 'shin.' + O, FWD * -0.35 * (lift + settle), 0, 0);
  rest(rig, 'foot.' + O);
  set(rig, 'spine.003', FWD * (-0.3 * lift + 0.3 * plant + 0.2 * settle), 0, 0);   // rocks back to lift, folds over the foot on the way down
  set(rig, 'Neck', FWD * (0.3 * lift - 0.35 * settle), 0, 0);               // …and she looks down at what she is standing on
  // The arms stay out and come out FURTHER as she takes her whole weight on one leg.
  set(rig, 'upper_arm.L', FWD * 0.4 * lift, 0, -ARM * (1 + 0.5 * lift));
  set(rig, 'upper_arm.R', FWD * 0.4 * lift, 0, ARM * (1 + 0.5 * lift));
}

// THE COLLAPSE. t runs 0→1 over the fall. The knees go first and the body follows them down — a felled
// body does not tip over like a statue, it loses the leg that was holding it and folds. The pitch itself is
// index.html's, because it rotates her whole group about her feet (her origin IS her feet plane, so that
// pivot is free); this is only what the limbs do on the way.
// SHE GOES OVER BACKWARDS AND SPRAWLS (Ben 08-12). The first version folded her forward over her own knees,
// which is how a body drops when the legs are shot out from under it — but she is being shot in the front,
// and a 13-block frame taking that goes the other way. Backwards is also the harder one to get right, and
// the two things that make it read are:
//
//   1. IT IS THREE EVENTS, NOT ONE ARC. The knees buckle first and she loses maybe a fifth of her height on
//      the spot; only then does the topple take over and accelerate; then the body ARRIVES and stops dead
//      while the limbs keep going for a beat. A single eased rotation reads as a falling statue.
//   2. THE SPRAWL IS ASYMMETRIC. Two legs at the same angle and two arms at the same angle is a pose, not a
//      body. Every pair below is deliberately unequal, and the difference is bigger than the tuning.
//
// The pitch and the lift are here rather than in the caller because they belong to the same curve as the
// limbs — the body cannot arrive at a different time from the arms that arrive with it.
// t runs 0→1 over the fall.
export function giantessDeathFall(rig, t){
  const e = Math.min(1, Math.max(0, t));
  const buckle = Math.min(1, e / 0.22);                            // the legs go first, before anything rotates
  const q = e < 0.14 ? 0 : Math.min(1, (e - 0.14) / 0.62);
  const p = q * q * (1.06 - 0.06 * q);                             // gravity: slow off the top, fastest at the floor
  // The impact, and then the body settling into the ground. Shoulders and hips are not a rigid bar, so she
  // rocks once and stops — this is the beat that makes the ground feel solid.
  const land = e > 0.76 ? Math.max(0, 1 - (e - 0.76) / 0.2) : 0;
  const pitch = -(Math.PI * 0.5) * Math.min(1, p) - land * 0.05 * Math.sin((e - 0.76) / 0.2 * Math.PI * 2);
  // WHY SHE DOES NOT SINK. The group's origin is her FEET PLANE, and everything rotates about it — so once
  // she is flat, half of a body that is about 1.5 blocks thick is below the floor unless it is lifted by its
  // own half-thickness. 0.075 of her height is that half-thickness, measured off the rig's bounds, and it is
  // multiplied by how far over she is so it arrives exactly as her back does.
  const lift = rig.height * 0.075 * Math.min(1, p) - rig.height * 0.055 * buckle * (1 - Math.min(1, p));
  return { pitch, lift, land };
}
export function giantessDie(rig, t){
  const e = Math.min(1, Math.max(0, t));
  const s = Math.min(1, e / 0.5);
  const buckle = Math.min(1, e / 0.22), settle = Math.min(1, Math.max(0, (e - 0.62) / 0.38));
  // The legs. They buckle under her, and then they are simply left where the floor found them: the near leg
  // half-folded with the knee fallen outward, the far one thrown straighter. Feet drop toes-down and roll
  // out, which is what an unloaded ankle does and what tells a viewer nothing is holding her up any more.
  const knee = { L: 1.0, R: 0.45 }, splay = { L: 0.34, R: 0.16 };
  for (const L of ['L', 'R']){
    set(rig, 'thigh.' + L, FWD * (0.85 * buckle - 0.55 * settle), 0, 0);
    set(rig, 'shin.' + L, FWD * -(1.5 * buckle) * (0.45 + 0.55 * knee[L]), 0, 0);
    set(rig, 'foot.' + L, FWD * (0.30 * buckle + 0.35 * settle), 0, 0);     // toes point: nothing is dorsiflexing now
    rest(rig, 'toe.' + L);
    const b = rig.bone['thigh.' + L];
    if (b){ rig._e.set(0, 0, (L === 'L' ? 1 : -1) * splay[L] * settle); b.quaternion.multiply(rig._q.setFromEuler(rig._e)); }
  }
  rest(rig, 'spine');
  // The trunk ARCHES as she goes over — the reflex of a body falling backwards — and then gives up and
  // flattens once the ground has it. Both stages live on the lumbar/chest, never the pelvis.
  const arch = Math.max(0, s - settle);
  set(rig, 'spine.001', FWD * 0.20 * arch, 0.10 * settle, 0.12 * settle);
  set(rig, 'spine.003', FWD * (0.34 * arch - 0.12 * settle), -0.14 * settle, 0);
  // The head is last and it is the tell: it whips back with the fall, hits, and then lolls to one side.
  set(rig, 'Neck', FWD * (-0.55 * arch + 0.18 * settle), 0.30 * settle, 0);
  set(rig, 'Head', FWD * -0.15 * settle, 0.22 * settle, 0.10 * settle);
  // The arms fly up as she loses her feet, then land wide and unequal — one flung out past her shoulder
  // line, the other across her body. Forearms end supinated and open, which is the whole sprawl.
  const fling = Math.max(0, Math.min(1, e / 0.34)) * (1 - settle);
  set(rig, 'upper_arm.L', FWD * (-0.85 * fling + 0.25 * settle), -0.20 * settle, -ARM * (1 + 1.35 * fling + 1.1 * settle));
  set(rig, 'upper_arm.R', FWD * (-0.85 * fling - 0.35 * settle), 0.28 * settle, ARM * (1 + 1.35 * fling + 0.55 * settle));
  set(rig, 'forearm.L', FWD * -(0.9 * fling + 0.30 * settle), 0, 0);
  set(rig, 'forearm.R', FWD * -(0.9 * fling + 0.85 * settle), 0, 0);
}

// A flinch, layered on whatever she is already doing: struck, the torso snaps away from the hit and the head
// with it. f decays in index.html, so one call per frame with a falling number is the whole effect.
export function giantessFlinch(rig, f, side){
  if (!(f > 0)) return;
  const b = rig.bone['spine.003']; if (!b) return;
  rig._e.set(FWD * -0.22 * f, 0.18 * f * (side || 1), 0);
  b.quaternion.multiply(rig._q.setFromEuler(rig._e));               // MULTIPLIED onto the pose, not replacing it
  const n = rig.bone['Neck'];
  if (n){ rig._e.set(FWD * -0.3 * f, 0, 0); n.quaternion.multiply(rig._q.setFromEuler(rig._e)); }
}

// The bones a bullet can find, as spheres in world space, with the damage share each is worth. Her body is
// 13.5 blocks of moving limb, so a single capsule at her origin would either miss her legs mid-stride or
// swallow the air she is striding through — the hit volume has to be the skeleton, and the skeleton is right
// here. Cheap enough because callers reject on a bounding cylinder first.
const HITBOX = [['Head', 1.05, 2.0], ['spine.003', 1.75, 1.0], ['spine', 1.6, 1.0],
                ['thigh.L', 1.25, 0.85], ['shin.L', 1.0, 0.85], ['foot.L', 0.95, 0.7],
                ['thigh.R', 1.25, 0.85], ['shin.R', 1.0, 0.85], ['foot.R', 0.95, 0.7],
                ['upper_arm.L', 0.8, 0.6], ['upper_arm.R', 0.8, 0.6]];
export function giantessHit(rig, x, y, z){
  rig.group.updateMatrixWorld(true);
  const p = rig._hitV || (rig._hitV = new THREE.Vector3());
  for (const [name, r, mult] of HITBOX){
    const b = rig.bone[name]; if (!b) continue;
    b.getWorldPosition(p);
    const dx = x - p.x, dy = y - p.y, dz = z - p.z, rr = r * rig.scale / 8;   // radii are quoted at her shipped x8
    if (dx * dx + dy * dy + dz * dz < rr * rr) return { part: name, mult };
  }
  return null;
}
export function giantessIdle(rig, t){
  const b = Math.sin(t * 1.1) * 0.04;
  for (const n of LIMBS) rest(rig, n);
  set(rig, 'spine.003', b, 0, 0);
  set(rig, 'upper_arm.L', 0, 0, -ARM); set(rig, 'upper_arm.R', 0, 0, ARM);
}

// ---- the squat -------------------------------------------------------------------------------------
// SHE SQUATS BY THE SAME SOLVE THE WALK USES, and that is the whole reason it looks like a body and not a
// doll folding. A squat is not "bend the knees": it is the hips travelling DOWN AND BACK while the soles
// stay where they are, and every other joint answering to that. So the depth is spent on the IK's hip
// height and the hip's setback, and the knee angle is whatever the chain needs — never authored.
//
// Her hips do not move here either. The rig has both thighs under `spine` (see the walk), so the hips can
// only descend the way they descend in the walk: the solve places the soles HIGHER in her own frame, and
// giantessGroundY then drops the whole group until they are back on the ground. Head height falls by the
// same amount, which is what a viewer reads as her going down.
//
// d is depth 0..1 (0 = standing, 1 = heels-down deep squat), t is seconds for the breathing.
export function giantessSquat(rig, d, t){
  const u = Math.max(0, Math.min(1, d));
  const g = rig.leg;
  // Breathing rides INSIDE the depth, not on top of the pose: a held squat is never perfectly still, and a
  // 2 cm sway on a 13-block frame is a foot of movement at the head.
  const br = Math.sin((t || 0) * 0.9) * 0.012 * u;
  // 0.46 of hip height is a real deep squat — thigh below parallel, which is the pose that reads as
  // crouching over something rather than perching on a chair. Past 0.5 the two-link solve clamps (the sole
  // reaches the hip) and the legs stop folding, which is why the depth is spent here and capped.
  const hipY = g.hipY * (1 - (0.46 + br) * u);
  // The hips go BACK, so the sole ends up ahead of the hip — the counterweight that keeps her over her feet
  // instead of falling on her face. Without it a deep squat topples backward and the model reads as sitting.
  const footZ = g.len * 0.20 * u;
  legIK(rig, 'L', footZ, rig.ankle, 0, hipY, 0);      // roll 0: heels DOWN, the sole flat on the ground
  legIK(rig, 'R', footZ, rig.ankle, 0, hipY, 0);
  rest(rig, 'toe.L'); rest(rig, 'toe.R');
  // The knees splay out over the feet. Applied ON TOP of the solve rather than inside it, because the solve
  // is a 2D chain in her sagittal plane and splay is the one thing that is not in that plane.
  for (const L of ['L', 'R']){
    const b = rig.bone['thigh.' + L]; if (!b) continue;
    rig._e.set(0, 0, (L === 'L' ? 1 : -1) * 0.20 * u);
    b.quaternion.multiply(rig._q.setFromEuler(rig._e));
  }
  rest(rig, 'spine');                                  // the pelvis, as everywhere else — see the walk
  set(rig, 'spine.001', FWD * -0.22 * u, 0, 0);        // lumbar folds first
  set(rig, 'spine.003', FWD * -0.30 * u + br * 3, 0, 0);   // then the chest, forward over the knees
  set(rig, 'Neck', FWD * 0.34 * u, 0, 0);              // …and the head comes back UP: she is still looking at you
  set(rig, 'Head', FWD * 0.10 * u, 0, 0);
  // The arms come down and IN, forearms hanging between the knees. They are held out at ARM when she is
  // standing (Ben), so the abduction has to be spent on the way down or she squats like a scarecrow.
  const ab = ARM * (1 - 0.65 * u);
  set(rig, 'upper_arm.L', FWD * 0.55 * u, 0, -ab);
  set(rig, 'upper_arm.R', FWD * 0.55 * u, 0, ab);
  set(rig, 'forearm.L', FWD * -0.85 * u, 0, 0);
  set(rig, 'forearm.R', FWD * -0.85 * u, 0, 0);
}

// World position of a foot (or any bone), so the game can put the shockwave, the print and the kill
// where the foot actually landed instead of under her origin.
export function giantessBonePos(rig, name, out){
  const b = rig.bone[name]; if (!b) return null;
  rig.group.updateMatrixWorld(true);
  return b.getWorldPosition(out || new THREE.Vector3());
}

// For the bench: numbers a screenshot of a 14-block model cannot give.
export function giantessProbe(rig){
  rig.group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const m of rig.meshes){ m.geometry.computeBoundingBox(); box.expandByObject(m); }
  const p = new THREE.Vector3(), l = new THREE.Vector3(), r = new THREE.Vector3();
  rig.group.getWorldPosition(p);
  giantessBonePos(rig, 'foot.L', l); giantessBonePos(rig, 'foot.R', r);
  return { bones: rig.bones.length, meshes: rig.meshes.length,
           mapped: rig.meshes.filter(m => m.material.map).length,
           names: rig.meshes.map(m => m.name),
           height: +(box.max.y - box.min.y).toFixed(3),
           origin: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
           footL: [+l.x.toFixed(2), +l.y.toFixed(2), +l.z.toFixed(2)],
           footR: [+r.x.toFixed(2), +r.y.toFixed(2), +r.z.toFixed(2)] };
}
