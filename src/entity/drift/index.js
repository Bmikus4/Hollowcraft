// DRIFT-RENDERED SUBJECTS — the manager that hangs the loop in loop.js onto something the game already owns.
//
// The split this whole system rests on:
//
//   Oasis       keeps no state and renders plausibility. It cannot be a game — you cannot build in a world that forgets.
//   Hollowcraft keeps authoritative state and renders it.
//   A drift subject keeps authoritative state for everything that must be FAIR, and hallucinates only the image.
//
// So the Horrific Wretch is the real Wretch: the real AI, the real collider, the real damage, the real grab. What is
// hallucinated is exclusively what you see. It is honest to fight and impossible to describe.
//
// Mechanically, attaching a subject MOVES its Object3D out of the world scene into a private scene that only the loop's
// camera ever renders. Three consequences worth knowing before changing this:
//   - the subject is no longer lit by the world's sun, so this module carries its own two lights;
//   - it casts no shadow, ever. A thing rendered by a hallucination having no shadow is correct, and it is free;
//   - its rig keeps animating normally. three walks the whole graph in updateMatrixWorld, so bone transforms written by
//     the game's animation code still land — we have changed where it is drawn, not whether it is simulated.

import { createLoop, stepLoop, setTuning, TUNING, RES, STEP_HZ } from './loop.js';

const FILL = 0.66;      // fraction of the render target the subject spans (see stepLoop — this fixes the quad's size)
const LOSE_S = 0.28;    // out of sight this long → the context window has flushed
const SNAP_S = 0.16;    // first moments after an attach: take the clean render whole, then start drifting

let THREE=null, renderer=null, ctx=null;
const subjects = new Map();
let _frustum=null, _pm=null, _v=null, _eye=null, _center=null;

export function driftInit(c){
  ctx = c; THREE = c.THREE; renderer = c.renderer;
  _frustum = new THREE.Frustum(); _pm = new THREE.Matrix4();
  _v = new THREE.Vector3(); _eye = new THREE.Vector3(); _center = new THREE.Vector3();
}

export function driftAttach(id, object, opts){
  if(!ctx) return null;
  if(subjects.has(id)) driftDetach(id);
  const o = opts || {};
  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xbfc8d4, 0x2a2620, 0.9);
  const dir  = new THREE.DirectionalLight(0xfff0d8, 1.0);
  scene.add(hemi, dir);
  const home = object.parent;
  scene.add(object);                                          // three removes it from `home` on add
  object.visible = true;

  const loop = createLoop(THREE, renderer, scene);
  const mat = new THREE.MeshBasicMaterial({ map:loop.texture(), transparent:true, depthWrite:false, side:THREE.DoubleSide });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1,1), mat);
  quad.frustumCulled = false;                                 // it is one quad; culling it costs more than drawing it
  quad.renderOrder = 3;
  ctx.worldScene.add(quad);
  loop.prewarm();

  const H = { id, object, home, scene, hemi, dir, loop, quad, mat,
    span:o.span || 3.0, lift:o.lift==null?0.5:o.lift, unseen:0, seen:false, age:0,
    flushes:0, lastFlush:0, onFlush:o.onFlush || null, tint:new THREE.Color(1,1,1) };
  subjects.set(id, H);
  return H;
}

export function driftDetach(id){
  const H = subjects.get(id); if(!H) return false;
  if(H.home) H.home.add(H.object); else H.scene.remove(H.object);
  if(H.quad.parent) H.quad.parent.remove(H.quad);
  H.quad.geometry.dispose(); H.mat.dispose(); H.loop.dispose();
  H.scene.remove(H.hemi, H.dir); H.hemi.dispose && H.hemi.dispose(); H.dir.dispose && H.dir.dispose();
  subjects.delete(id);
  return true;
}

export function driftHas(id){ return subjects.has(id); }

// Is the anchor in frame AND not behind world geometry? The frustum test alone is not enough: standing behind a tree is
// the commonest way to lose sight of something in a forest, and if that did not count as a context loss the flush would
// only ever fire when the mouse moved.
function visible(cam, x, y, z){
  cam.updateMatrixWorld();
  _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pm);
  _v.set(x, y, z);
  if(!_frustum.containsPoint(_v)) return false;
  if(!ctx.solidAt) return true;
  const ex=cam.position.x, ey=cam.position.y, ez=cam.position.z;
  const dx=x-ex, dy=y-ey, dz=z-ez, len=Math.hypot(dx,dy,dz);
  const n = Math.min(110, Math.ceil(len/0.6));
  for(let i=1;i<n;i++){ const t=i/n;
    if(t*len > len-0.8) break;                                // its own cell is not cover
    if(ctx.solidAt(Math.floor(ex+dx*t), Math.floor(ey+dy*t), Math.floor(ez+dz*t))) return false; }
  return true;
}

// `pos` is the subject's world FEET position. Call once per rendered frame, before the world pass draws — the loop writes
// render targets the world pass then samples.
// `show` false parks the subject: the quad hides and the loop stops stepping. Coming back out of that is treated as a
// context loss, because it is one — the history in the render target is however many seconds stale.
export function driftStep(id, dt, pos, show){
  const H = subjects.get(id); if(!H) return;
  const on = show !== false;
  if(!on){ H.quad.visible = false; H.parked = true; return; }
  if(H.parked){ H.parked = false; H.age = 0; H.loop.lastAz = H.loop.lastEl = null; driftFlush(id); }
  H.quad.visible = true;
  const cam = ctx.camera;
  H.age += dt;
  const cx = pos.x, cy = pos.y + H.lift + H.span*0.5, cz = pos.z;

  // CONTEXT LOSS. Lose sight for LOSE_S and the loop's memory is gone; the moment you re-acquire, it re-converges under
  // a noise burst onto a differently-tinted body. Same cause as Oasis handing you a different house, not a mimic of it.
  const vis = visible(cam, cx, cy, cz);
  if(vis){ if(H.unseen > LOSE_S) driftFlush(id); H.unseen = 0; }
  else H.unseen += dt;
  H.seen = vis;

  const dl = ctx.daylight ? Math.max(0.1, ctx.daylight()) : 1;
  H.hemi.intensity = 0.30 + 0.72*dl; H.dir.intensity = 0.18 + 1.00*dl;
  if(ctx.sunDir){ const s=ctx.sunDir(); H.dir.position.set(s.x, Math.max(0.25, s.y), s.z); }

  _eye.copy(cam.position);
  _center.set(cx, cy, cz);
  const size = stepLoop(THREE, renderer, H.loop, dt, {
    eye:_eye, center:_center, span:H.span, fill:FILL, snap:H.age < SNAP_S });

  H.mat.map = H.loop.texture();
  H.quad.position.set(cx, cy, cz);
  H.quad.scale.set(size, size, 1);
  H.quad.lookAt(cam.position);                                // the quad's normal IS the loop camera's axis
  H.quadSize = size;
}

// A flush is a context loss: burst the noise, and come back a different colour. For a subject whose body the game owns
// (the Wretch rig) the tint is the only thing that CAN change — and it is enough, because the burst covers the transition
// and the eye reads "that is not what I was looking at" from value and hue long before it reads it from shape.
export function driftFlush(id){
  const H = subjects.get(id); if(!H) return false;
  H.loop.flush();
  const h = Math.random(), s = 0.10 + Math.random()*0.30, l = 0.66 + Math.random()*0.34;
  H.tint.setHSL(h, s, l);
  H.loop.uniforms.uTint.value.copy(H.tint);
  H.flushes++; H.lastFlush = performance.now();
  if(H.onFlush) H.onFlush(H.quad.position.x, H.quad.position.y, H.quad.position.z);
  return true;
}

// QA: read the middle of both stages back off the GPU. A dark night screenshot cannot tell "the loop is producing nothing"
// apart from "the loop is producing something you cannot see", and those have completely different causes — an empty
// subject scene versus lights too dim for the anchor render. Mean luma and mean alpha separate them in one call.
const _probeBuf = new Uint8Array(32*32*4);
export function driftProbe(id){
  const H = subjects.get(id); if(!H) return { attached:false };
  const read = (rt)=>{
    const x = (rt.width>>1) - 16, y = (rt.height>>1) - 16;
    renderer.readRenderTargetPixels(rt, x, y, 32, 32, _probeBuf);
    let lum=0, alpha=0, maxA=0;
    for(let i=0;i<_probeBuf.length;i+=4){
      lum += (_probeBuf[i]*0.299 + _probeBuf[i+1]*0.587 + _probeBuf[i+2]*0.114);
      alpha += _probeBuf[i+3]; if(_probeBuf[i+3]>maxA) maxA=_probeBuf[i+3];
    }
    const n = _probeBuf.length/4;
    return { luma:+(lum/n).toFixed(1), alpha:+(alpha/n).toFixed(1), maxAlpha:maxA };
  };
  return { attached:true, fresh:read(H.loop.fresh), out:read(H.loop.cur) };
}

export function driftTune(k, v){
  if(k == null) return { ...TUNING };
  return setTuning(k, v, [...subjects.values()].map(H=>H.loop));
}

export function driftState(id){
  if(id == null) return { subjects:[...subjects.keys()], res:RES, hz:STEP_HZ, tuning:{...TUNING} };
  const H = subjects.get(id); if(!H) return { attached:false };
  return { attached:true, seen:H.seen, unseen:+H.unseen.toFixed(2), span:+H.span.toFixed(2),
    quad:+(H.quadSize||0).toFixed(2), steps:H.loop.steps, burst:+H.loop.burst.toFixed(3),
    flushes:H.flushes, sinceFlushMs:Math.round(performance.now()-H.lastFlush),
    tint:'#'+H.tint.getHexString(), res:RES, hz:STEP_HZ };
}

export { TUNING, RES, STEP_HZ };
