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
  // THE BODY IS OCCLUDED PER PIXEL, NOT AS A PLANE (Ben 08-04: "we should not be able to see the wretchs body through
  // blocks"). This is one camera-facing quad, so every fragment of it shared a single depth — the subject's CENTRE. The
  // depth test then answered "is the centre behind that block" for the whole body at once, which is right for a creature
  // squarely behind a wall and wrong for every case where it is partly inside the world: standing in a hillside, in a
  // doorway, in a tunnel mouth, its embedded half drew over the rock in front of it.
  //
  // The clean render's depth buffer knows where each surface really is. Reconstructing a world position from (uv, depth)
  // with the loop camera's inverse projection-view and re-projecting it through the WORLD camera gives that pixel its true
  // depth, so the ordinary depth test hides exactly the parts that are behind something.
  //
  // Injected into MeshBasicMaterial rather than written as a ShaderMaterial: the map is an sRGB render target and this
  // material's own chunks handle the decode, the fog and the tone mapping. A hand-written shader here shipped a body a
  // stop too bright the last time that was tried.
  const mat = new THREE.MeshBasicMaterial({ map:loop.texture(), transparent:true, depthWrite:false, side:THREE.DoubleSide });
  mat.extensions = { fragDepth:true };
  mat.onBeforeCompile = (sh)=>{
    sh.uniforms.tDriftDepth = { value: loop.depth() };
    sh.uniforms.uDriftInvVP = { value: loop.freshInvVP };
    // projectionMatrix and viewMatrix are VERTEX-stage uniforms in three. Naming them in a fragment shader is a compile
    // error — "undeclared identifier" — after which the material draws NOTHING and the creature simply is not there. The
    // world camera's projection*view is uploaded here instead, per frame, from driftStep.
    sh.uniforms.uWorldToClip = { value: new THREE.Matrix4() };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tDriftDepth;\nuniform mat4 uDriftInvVP;\nuniform mat4 uWorldToClip;')
      // AFTER the colour is final, and at a chunk every build of this material has.
      .replace('#include <dithering_fragment>', `
      { float _dd = texture2D(tDriftDepth, vMapUv).x;
        if(_dd < 0.99999){
          vec4 _ndc = vec4(vMapUv*2.0-1.0, _dd*2.0-1.0, 1.0);
          vec4 _wp = uDriftInvVP * _ndc; _wp /= _wp.w;
          vec4 _cp = uWorldToClip * _wp;
          gl_FragDepthEXT = clamp(_cp.z/_cp.w*0.5+0.5, 0.0, 1.0);
        } else {
          // No subject at this pixel in the clean render — this is drift smeared BEYOND the silhouette. It has no true
          // depth of its own, so it keeps the quad's plane depth, which is what the whole body used to use.
          gl_FragDepthEXT = gl_FragCoord.z;
        } }
      #include <dithering_fragment>`);
    mat.userData.driftShader = sh; };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1,1), mat);
  quad.frustumCulled = false;                                 // it is one quad; culling it costs more than drawing it
  // 5, ABOVE the chunk water meshes, which are renderOrder 3. At 3 the two tied, three fell back to depth sorting, and a
  // transparent water surface won often enough that the creature simply did not render underwater.
  quad.renderOrder = 5;
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

// Hand the subject BACK to the world scene for a moment, without tearing the loop down. The game's own jumpscare brings the
// rig's maw to the lens and hides everything else, and that close-up cannot work on a subject that only exists inside a
// private scene — so for those frames the real model is what gets drawn. Returning it re-hides it and treats the gap as a
// context loss, which it is: the loop's history is however many seconds stale by then.
export function driftHostWorld(id, on){
  const H = subjects.get(id); if(!H) return false;
  if(!!on === !!H.inWorld) return H.inWorld;
  if(on){ if(H.home) H.home.add(H.object); H.quad.visible=false; H.inWorld=true; }
  else { H.scene.add(H.object); H.inWorld=false; H.parked=true; }   // parked → the next step re-flushes and re-frames
  return H.inWorld;
}

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
  if(H.inWorld) return;                                      // the world scene owns the rig this frame — see driftHostWorld
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
  // The uniform holds the same Matrix4 instance the loop stamps, so nothing needs copying per frame; this only re-points it
  // if a program rebuild handed the material a fresh uniform object.
  { const sh=H.mat.userData.driftShader;
    if(sh){ if(sh.uniforms.tDriftDepth.value!==H.loop.depth()) sh.uniforms.tDriftDepth.value=H.loop.depth();
            if(sh.uniforms.uDriftInvVP.value!==H.loop.freshInvVP) sh.uniforms.uDriftInvVP.value=H.loop.freshInvVP;
            cam.updateMatrixWorld();
            sh.uniforms.uWorldToClip.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); } }
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
  if(!H.tintLock){ H.tint.setHSL(h, s, l); H.loop.uniforms.uTint.value.copy(H.tint); }   // a locked tint survives a context loss — see driftTintLock
  H.flushes++; H.lastFlush = performance.now();
  if(H.onFlush) H.onFlush(H.quad.position.x, H.quad.position.y, H.quad.position.z);
  return true;
}

// QA: PAINT THE BODY A COLOUR THE WORLD CANNOT PRODUCE, and stop the flush from changing it back. "Is any of it on screen"
// is a diff between two frames otherwise, and two frames of this world 1.3 seconds apart already differ across 68,000
// pixels of the middle of the screen on their own — the sea, the foliage and the sun all move. Against a locked magenta
// there is no noise floor at all: nothing else in the game is that colour.
export function driftTintLock(hex){
  let n=0;
  for(const H of subjects.values()){
    if(hex==null){ H.tintLock=false; n++; continue; }
    H.tintLock = true; H.tint.set(hex); H.loop.uniforms.uTint.value.copy(H.tint); n++; }
  return n;
}

// QA: read the middle of both stages back off the GPU. A dark night screenshot cannot tell "the loop is producing nothing"
// apart from "the loop is producing something you cannot see", and those have completely different causes — an empty
// subject scene versus lights too dim for the anchor render. Mean luma and mean alpha separate them in one call.
const _probeBuf = new Uint8Array(32*32*4);
const _fullBuf = new Uint8Array(512*512*4);      // sized past RES so a resolution bump cannot silently read a sub-rectangle
// How much of the render target does the subject actually cover, and is it touching the edges? The FOV is solved from a
// `span` the caller measures off the rig, so a span that is too large frames the creature small inside mostly-empty pixels
// and one that is too small crops it. Both are invisible in a screenshot of a dark forest.
export function driftFraming(id){
  const H = subjects.get(id); if(!H) return { attached:false };
  const rt = H.loop.cur, w = rt.width, h = rt.height;
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, _fullBuf);
  let covered=0, minX=w, maxX=-1, minY=h, maxY=-1, edge=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    if(_fullBuf[(y*w+x)*4+3] < 40) continue;
    covered++;
    if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y;
    if(x===0||y===0||x===w-1||y===h-1) edge++;
  }
  if(maxX<0) return { attached:true, covered:0, note:'nothing rendered' };
  return { attached:true, span:+H.span.toFixed(2),
    coverPct:+(100*covered/(w*h)).toFixed(1),
    boxW:maxX-minX+1, boxH:maxY-minY+1,
    heightPct:+(100*(maxY-minY+1)/h).toFixed(1),          // should sit near FILL*100 if the span is measured right
    edgePixels:edge };                                    // non-zero means it is being cropped
}
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
  // The light intensities come back too: the subject is a lit MeshPhongMaterial, so if a day/night comparison shows no
  // change in luma these numbers say whether the lights failed to move or moved and did not matter.
  return { attached:true, fresh:read(H.loop.fresh), out:read(H.loop.cur),
    hemi:+H.hemi.intensity.toFixed(3), dir:+H.dir.intensity.toFixed(3),
    daylight:ctx.daylight?+ctx.daylight().toFixed(3):null, steps:H.loop.steps };
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
