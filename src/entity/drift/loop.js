// THE DRIFT LOOP — an autoregressive image model whose weights are a fragment shader.
//
// Oasis-style AI video is a next-frame predictor: frame_t = f(frame_{t-1..t-k}, action_t), with no world state anywhere.
// Everything you see persists only while it is inside the context window, which is why the geometry morphs, why the
// inventory numbers drift, and why looking away and back gives you a different building. None of that comes from the
// model being large. It comes from the SHAPE of the channel: a short-context feedback loop driven by player input.
//
// So we build that channel and put a hand-written function in the model's place.
//
//   state_t  = the previous output frame (a render target — this is the entire context window, k=1)
//   action_t = how the player's viewing angle moved this step
//   frame_t  = warp(state_t, flow(action_t)) blended with a small share of a clean render, plus injected noise
//
// The clean render is the anchor that keeps it from melting into soup; the blend rate is how short the memory is. Two
// details are load-bearing:
//
//   ALPHA LAGS COLOUR. The silhouette is fed back more slowly than the interior, so the body's outline is always a few
//   steps behind its actual shape. That is what "melting" is. Feed alpha at the same rate as colour and you get a
//   sharp-edged creature with a smeary middle, which reads as motion blur, not as hallucination.
//
//   THE BURST IS THE POINT. flush() spikes the noise. It is called when the player loses sight of the subject — the same
//   cause as Oasis forgetting a house when you look at your feet, not an imitation of it. The decaying burst is Oasis's
//   dynamic noising run backwards: inject hard, then taper as the image re-converges.
//
// Runs at a fixed STEP_HZ, not once per rendered frame. Three reasons, in order of importance: a feedback loop stepped at
// a variable rate has a variable time constant, so the look would change with framerate; at 140fps it would cost 6x what
// it needs to; and a sub-30Hz update cadence is itself the tell — AI video does not run at monitor rate.
//
// The loop owns no subject. Whoever creates it supplies a scene to render as the clean anchor: the demo harness supplies
// a throwaway box creature, the game supplies the real Wretch rig.

const RES = 128;             // the whole subject is 128x128. Its own resolution being wrong is part of the read.
const STEP_HZ = 22;

const FRAG = `
uniform sampler2D tFresh, tHist;
uniform vec2 uFlow;
uniform vec3 uTint;
uniform float uFeed, uAlphaLag, uWarp, uCurl, uNoise, uGrid, uBlockMix, uDecay, uTime, uSeed, uBurst;
varying vec2 vUv;

float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1.0,0.0)), f.x), mix(h21(i+vec2(0.0,1.0)), h21(i+vec2(1.0,1.0)), f.x), f.y); }
// A curl of value noise: divergence-free, so the warp SHEARS the image instead of pumping it toward or away from a
// point. A plain gradient warp drains the frame into its own corners within a couple of seconds.
vec2 curl(vec2 p, float t){ const float e = 0.04;
  float n0 = vnoise(p*2.6 + vec2(0.0, t*0.09));
  float nx = vnoise(p*2.6 + vec2(e,   t*0.09));
  float ny = vnoise(p*2.6 + vec2(0.0, t*0.09 + e));
  return vec2(ny - n0, -(nx - n0)) / e; }

void main(){
  vec2 uv = vUv;
  // LATENT GRID. A latent-diffusion frame is decoded from a coarse grid, and the grid shows: features snap to it and
  // detail arrives at the wrong spatial frequency. Sampling history through a quantised UV reproduces both.
  vec2 luv = (floor(uv*uGrid) + 0.5) / uGrid;
  vec2 suv = mix(uv, luv, uBlockMix);
  vec2 w = uFlow*uWarp + curl(uv, uTime)*uCurl;

  // Per-channel warp offsets. VAE decoders bleed chroma across edges; equal offsets would just be a clean smear.
  vec4 h;
  h.r = texture2D(tHist, suv - w*1.09).r;
  h.g = texture2D(tHist, suv - w      ).g;
  h.b = texture2D(tHist, suv - w*0.91).b;
  h.a = texture2D(tHist, suv - w      ).a;
  h.rgb *= uDecay;                                     // without this the loop's gain sits at 1.0 and the frame saturates

  // The tint is re-rolled on every flush and applied to the CLEAN sample only, so the previous colour bleeds out of the
  // history over the following second rather than cutting. For a subject whose body the game owns this is the only thing
  // about its appearance that can change — and value and hue are what the eye reads first anyway.
  vec4 f = texture2D(tFresh, uv);
  f.rgb *= uTint;
  vec4 o;
  o.rgb = mix(h.rgb, f.rgb, uFeed);
  o.a   = mix(h.a,   f.a,   uFeed*uAlphaLag);          // the silhouette runs behind the body — see the header

  float n = vnoise(uv*uGrid*1.9 + uSeed + uTime*2.7) - 0.5;
  o.rgb += n * (uNoise + uBurst*0.85);
  o.a   += n * uBurst * 0.5;
  // Erode slightly, then re-gain. Feedback alone would let the alpha halo creep outward every step until the subject is
  // a square; the erode holds the silhouette in while still letting it wander.
  o.a = clamp((o.a - 0.035) * 1.06, 0.0, 1.0);
  o.rgb = clamp(o.rgb, 0.0, 1.5);
  gl_FragColor = o;
}`;

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Every number here was found by moving it until the thing looked wrong in the right way. The demo harness
// (demo/harness.html) puts a slider on each one; that page is the only reason these are tunable at all.
// feed and blockMix were chosen by looking at three frames in-game, not by reasoning: at 0.13/0.55 the creature is a
// vertical red smear with no head or limbs, which reads as a broken texture, and a glitch is not frightening. At
// 0.25/0.32 the smear still dominates and the head only appears once you know to look for it. At 0.42/0.15 the brain
// resolves a body FIRST — head, shoulders, arms, legs, the dark chest cavity — and it is still boiling and mottling, so
// the hallucinated quality survives. Recognition, then wrongness: that is the order horror has to arrive in.
// They are swept together deliberately because they fight — feed returns the clean body, blockMix eats its features.
export const TUNING = {
  feed:      0.42,   // share of the clean render blended in per step = 1/memory-length. Higher is saner, lower is soup.
  alphaLag:  0.62,   // silhouette feed as a fraction of colour feed
  warp:      1.00,   // gain on the action-driven flow
  curl:      0.0016, // gain on the idle wander (curl() output is ~1/e, so this is small by construction)
  noise:     0.022,
  grid:      22.0,   // latent cells across the frame
  blockMix:  0.15,   // how much of the history sample snaps to that grid
  decay:     0.994,
  burstTau:  0.30,   // seconds for a flush burst to decay to 1/e
};

const KNOB_UNIFORM = { feed:'uFeed', alphaLag:'uAlphaLag', warp:'uWarp', curl:'uCurl', noise:'uNoise',
                       grid:'uGrid', blockMix:'uBlockMix', decay:'uDecay' };

export function setTuning(k, v, loops){
  if(!(k in TUNING)) return { err:'no such knob', knobs:Object.keys(TUNING) };
  TUNING[k] = +v;
  const u = KNOB_UNIFORM[k];
  if(u) for(const L of (loops||[])) L.uniforms[u].value = +v;
  return { ...TUNING };
}

// `subjectScene` is rendered as the clean anchor. It must contain whatever is being hallucinated, plus its own lights:
// it is NOT the world scene, so the world's sun does not reach it.
export function createLoop(THREE, renderer, subjectScene){
  const rtOpt = { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, generateMipmaps:false };
  const fresh = new THREE.WebGLRenderTarget(RES, RES, { ...rtOpt, depthBuffer:true });
  const a = new THREE.WebGLRenderTarget(RES, RES, { ...rtOpt, depthBuffer:false });
  const b = new THREE.WebGLRenderTarget(RES, RES, { ...rtOpt, depthBuffer:false });
  // Marking the targets sRGB makes three convert on the way IN, so a MeshBasicMaterial sampling them decodes correctly
  // and the subject's colours match the world's. Left linear, it renders about a stop too bright.
  for(const rt of [fresh,a,b]) rt.texture.colorSpace = THREE.SRGBColorSpace;

  const uniforms = {
    tFresh:{value:fresh.texture}, tHist:{value:a.texture}, uFlow:{value:new THREE.Vector2()},
    uTint:{value:new THREE.Color(1,1,1)},
    uFeed:{value:TUNING.feed}, uAlphaLag:{value:TUNING.alphaLag}, uWarp:{value:TUNING.warp},
    uCurl:{value:TUNING.curl}, uNoise:{value:TUNING.noise}, uGrid:{value:TUNING.grid},
    uBlockMix:{value:TUNING.blockMix}, uDecay:{value:TUNING.decay}, uTime:{value:0},
    uSeed:{value:0}, uBurst:{value:0},
  };
  const quadMat = new THREE.ShaderMaterial({ uniforms, vertexShader:VERT, fragmentShader:FRAG, depthTest:false, depthWrite:false });
  const quadScene = new THREE.Scene();
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), quadMat));
  const quadCam = new THREE.Camera();
  const cam = new THREE.PerspectiveCamera(20, 1, 0.05, 240);

  const L = {
    fresh, a, b, cur:a, prev:b, scene:subjectScene, cam, uniforms, quadMat, quadScene, quadCam,
    acc:0, t:0, burst:0, steps:0, lastAz:null, lastEl:null, flow:new THREE.Vector2(), quadSize:1, _v:new THREE.Vector3(),
    texture(){ return L.cur.texture; },
    flush(){ L.burst = 1.0; },
    // One render of each stage so both programs are compiled now rather than on the frame the subject first appears.
    // tHist is pointed at `b` first: it defaults to `a`, and warming the drift pass INTO `a` while sampling `a` is a
    // framebuffer feedback loop — GL_INVALID_OPERATION, one warning per spawn, undefined output for that draw.
    prewarm(){ const p=renderer.getRenderTarget(); renderer.setRenderTarget(fresh); renderer.clear(); renderer.render(subjectScene, cam);
      uniforms.tHist.value = b.texture;
      renderer.setRenderTarget(a); renderer.render(quadScene, quadCam); renderer.setRenderTarget(p); },
    dispose(){ fresh.dispose(); a.dispose(); b.dispose(); quadMat.dispose();
      quadScene.traverse(o=>{ if(o.geometry) o.geometry.dispose(); }); },
  };
  return L;
}

// Frame the subject from `eye`, render it clean, then run one drift step. Returns the world-space edge length the display
// quad must have for the render target to map onto it exactly.
//
// The FOV is solved per step so the subject always fills `fill` of the frame — which makes the quad's world size CONSTANT
// (2*d*tan(fov/2) = span/fill), so it scales with distance for free while never wasting render-target pixels on air.
export function stepLoop(THREE, renderer, L, dt, o){
  const { eye, center, span, fill, snap } = o;
  const d = Math.max(0.35, L._v.copy(eye).sub(center).length());

  // ACTION CHANNEL: how far the eye swung around the subject since the last step, in radians, mapped into frame space.
  const az = Math.atan2(eye.z - center.z, eye.x - center.x);
  const el = Math.atan2(eye.y - center.y, Math.hypot(eye.x-center.x, eye.z-center.z));
  if(L.lastAz != null){
    let dAz = az - L.lastAz; while(dAz > Math.PI) dAz -= 6.2831853; while(dAz < -Math.PI) dAz += 6.2831853;
    L.flow.set(dAz * 0.36, (el - L.lastEl) * -0.36);
  }
  L.lastAz = az; L.lastEl = el;

  const period = 1/STEP_HZ;
  L.acc += dt;
  if(L.acc < period) return L.quadSize;
  L.acc = Math.min(L.acc - period, period);                 // at most one step per frame; never spiral on a long hitch
  L.t += period;
  L.burst *= Math.exp(-period / TUNING.burstTau);
  if(L.burst < 0.002) L.burst = 0;

  const half = (span * 0.5) / Math.max(0.05, fill);
  L.cam.fov = Math.min(70, Math.max(1.5, 2 * Math.atan(half / d) * 57.29578));
  L.cam.position.copy(eye);
  L.cam.up.set(0,1,0);
  L.cam.lookAt(center);
  L.cam.updateProjectionMatrix();
  L.quadSize = half * 2;

  const pRT = renderer.getRenderTarget(), pAC = renderer.autoClear, pa = renderer.getClearAlpha();
  const pc = L._pc || (L._pc = new THREE.Color()); renderer.getClearColor(pc);
  renderer.autoClear = true;
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(L.fresh);
  renderer.clear(true, true, false);
  renderer.render(L.scene, L.cam);

  const U = L.uniforms;
  U.tFresh.value = L.fresh.texture;
  U.tHist.value  = L.cur.texture;                            // read the current frame...
  U.uFlow.value.copy(L.flow);
  U.uTime.value  = L.t;
  U.uBurst.value = L.burst;
  U.uSeed.value  = (L.steps++ % 977) * 0.6180339;            // decorrelate the noise field between steps
  U.uFeed.value  = snap ? 1.0 : TUNING.feed;                 // snap = ignore history, take the clean render whole
  renderer.setRenderTarget(L.prev);                          // ...and write the next into the other one
  renderer.render(L.quadScene, L.quadCam);
  const sw = L.cur; L.cur = L.prev; L.prev = sw;

  renderer.setRenderTarget(pRT); renderer.setClearColor(pc, pa); renderer.autoClear = pAC;
  return L.quadSize;
}

export { RES, STEP_HZ };
