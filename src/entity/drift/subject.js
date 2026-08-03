// A STAND-IN SUBJECT for the drift loop — used ONLY by demo/harness.html.
//
// The loop needs something to hallucinate. In game that is the real Wretch rig, which lives inside index.html and cannot
// be imported from a standalone page. So the harness supplies this instead: a fixed budget of 26 boxes in one
// InstancedMesh whose transforms and colours are re-rolled from a seed. Every part exists for the whole life of the
// subject; a part the current roll does not want is scaled to zero rather than removed. That is what makes a reseed
// free — no geometry built, no material made, no shader compiled, one buffer upload.
//
// Its only job is to let the shader be tuned without booting a 1.9 MB game and walking to the creature.
//
// The features are placed WRONG on purpose (eyes off the centreline, limbs at uneven heights, a second head some rolls).
// A diffusion model's tell is not blur, it is confident misplacement, and the drift pass can smear but it cannot invent
// that. It has to be in the thing being smeared — which is worth remembering when judging the loop on the real Wretch,
// whose anatomy is correct and therefore stays readable for longer.

const N = 26;                                                    // torso, 2 heads, 6 limbs, 4 eyes, 13 growths/spares

function mulberry32(a){ return function(){ a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }

export function buildBody(THREE){
  const geo = new THREE.BoxGeometry(1,1,1);
  const mat = new THREE.MeshLambertMaterial({ color:0xffffff });   // instanceColor tints per part; one material = one program
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;                                      // it lives in its own offscreen scene, always framed
  mesh.castShadow = false;
  const state = { mesh, geo, mat, dummy:new THREE.Object3D(), col:new THREE.Color(), seed:1, height:1.8 };
  reseedBody(THREE, state, 1);
  return state;
}

// Re-roll the whole creature from `seed`. Returns the body height so the caller can frame it.
export function reseedBody(THREE, S, seed){
  const r = mulberry32((seed|0) || 1), d = S.dummy, c = S.col, m = S.mesh;
  const rng = (a,b)=>a+(b-a)*r();
  let i = 0;
  const put = (x,y,z, sx,sy,sz, rx,ry,rz, col)=>{
    if(i>=N) return;
    d.position.set(x,y,z); d.scale.set(sx,sy,sz); d.rotation.set(rx,ry,rz);
    d.updateMatrix(); m.setMatrixAt(i, d.matrix);
    m.setColorAt(i, c.setHex(col)); i++;
  };
  const skip = ()=>put(0,-99,0, 0,0,0, 0,0,0, 0x000000);           // an unused part: zero-scaled and parked below the floor

  // PALETTE — desaturated ash/flesh. Saturation stays under 0.22: a saturated body survives the drift pass as a
  // recognisable coloured object, and the thing must not be recognisable.
  const hue = r(), sat = rng(0.03,0.20), lum = rng(0.22,0.52);
  const skin = new THREE.Color().setHSL(hue, sat, lum).getHex();
  const dark = new THREE.Color().setHSL(hue, sat*0.8, lum*0.55).getHex();
  const eyeC = new THREE.Color().setHSL(rng(0.06,0.14), rng(0.15,0.45), rng(0.72,0.93)).getHex();

  const H = rng(1.45, 2.25);                                       // it is not the same size twice either
  const tW = rng(0.34,0.62), tD = rng(0.20,0.40), tH = H*rng(0.34,0.46);
  const hipY = H*rng(0.40,0.52);
  put(rng(-0.05,0.05), hipY+tH*0.5, 0, tW, tH, tD, 0, rng(-0.2,0.2), rng(-0.1,0.1), skin);   // torso

  // HEADS. One always, a second on ~22% of rolls — and when there are two, neither sits on the centreline.
  const headS = rng(0.26,0.44), neck = hipY+tH+headS*rng(0.35,0.7);
  put(rng(-0.06,0.06), neck, rng(-0.04,0.06), headS, headS*rng(0.85,1.25), headS*rng(0.8,1.1), 0, rng(-0.5,0.5), rng(-0.25,0.25), skin);
  const twoHead = r()<0.22;
  if(twoHead) put(rng(-0.28,0.28), neck+rng(-0.16,0.12), rng(-0.12,0.12), headS*0.8, headS*0.8, headS*0.7, 0, rng(-1.2,1.2), rng(-0.4,0.4), skin);
  else skip();

  // LIMBS — 4 to 6, and their lengths are drawn INDEPENDENTLY per limb. A matched pair reads as anatomy; mismatched
  // pairs read as something that does not know how many arms it has.
  const nLimb = 4 + ((r()<0.30)?2:0);
  for(let k=0;k<6;k++){
    if(k>=nLimb){ skip(); continue; }
    const arm = k<2 || k>=4, len = (arm?H*rng(0.24,0.44):H*rng(0.34,0.50)), th = rng(0.055,0.115);
    const sx = (k%2===0?-1:1) * (tW*0.5 + th*rng(0.4,1.6));
    const yTop = arm ? (hipY+tH-rng(0.0,0.14)) : hipY;
    put(sx, yTop-len*0.5, rng(-0.09,0.09), th, len, th, rng(-0.25,0.25), 0, rng(-0.35,0.35)*(arm?1:0.4), arm?skin:dark);
  }

  // EYES — 2, 3 or 4, on the FRONT of the head but not paired and not level. This is the load-bearing detail.
  const nEye = 2 + ((r()<0.42)?1:0) + ((r()<0.18)?1:0);
  const eyeZ = headS*0.52;
  for(let k=0;k<4;k++){
    if(k>=nEye){ skip(); continue; }
    const es = headS*rng(0.10,0.24);
    put(rng(-headS*0.42, headS*0.42), neck+rng(-headS*0.30, headS*0.34), eyeZ, es, es*rng(0.6,1.3), es*0.5, 0, 0, rng(-0.6,0.6), eyeC);
  }

  // GROWTHS — 0..13 slabs hung off the torso. These are what make the silhouette unstable between reseeds; the drift
  // pass smears them into the body so they read as the thing being partly dissolved rather than as decoration.
  const nG = (r()*10)|0;
  for(let k=0;k<13;k++){
    if(k>=nG){ skip(); continue; }
    const a = r()*6.283, rad = tW*rng(0.35,0.85);
    put(Math.cos(a)*rad, hipY+tH*rng(0.05,0.95), Math.sin(a)*rad*0.7,
        rng(0.05,0.22), rng(0.05,0.30), rng(0.04,0.16), rng(-0.6,0.6), a, rng(-0.6,0.6), r()<0.15?eyeC:dark);
  }

  while(i<N) skip();
  m.instanceMatrix.needsUpdate = true;
  if(m.instanceColor) m.instanceColor.needsUpdate = true;
  S.seed = seed; S.height = H;
  return H;
}

export function disposeBody(S){ try{ S.geo.dispose(); S.mat.dispose(); S.mesh.dispose(); }catch(e){} }
