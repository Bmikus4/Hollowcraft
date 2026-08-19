// IS THE SEALED ROOM'S DAY LIFT A CONSTANT, OR IS IT THE HAND?
//
// assert-unlit-black and assert-cave-black both report the same number from a room carved sixteen blocks under
// the surface with no sky access at all: noon 6 of 255, midnight 2, flat across the centre crop. A sealed room
// cannot know the hour, so something day-scaled is reaching it. The frames it already wrote contain a candidate
// in plain sight — the viewmodel forearm renders at ~230 in a lightless room, and it is BRIGHTER at noon.
//
// A full-screen additive term is FLAT. Bloom off a bright corner slab is a GRADIENT that decays with distance
// from that slab. Those two hypotheses are separable from the PNGs alone, with no bench run and no GPU:
// tile the frame, take each tile's mean, and regress it against distance from the arm.
//
//   node bench/tmp-sealed-lift.mjs
import fs from 'node:fs'; import path from 'node:path';
import { decodePNG } from './pngprobe.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT = path.join(ROOT,'bench','results');

// The HUD is a bright constant and would dominate any tile it lands in, so the band excludes the top strip
// (objective/compass) and the bottom-left bars — but it MUST still contain the viewmodel arm, which sits bottom
// RIGHT. The first version of this file cut at y 0.72 and cut the arm out with the HUD, then dutifully found the
// crosshair as its brightest tile and regressed everything against a 12-pixel reticle.
const BAND = { x0:0.30, x1:0.98, y0:0.10, y1:0.95 };

function tiles(file, nx=16, ny=8){
  const P = decodePNG(fs.readFileSync(file));
  const X0=(P.w*BAND.x0)|0, X1=(P.w*BAND.x1)|0, Y0=(P.h*BAND.y0)|0, Y1=(P.h*BAND.y1)|0;
  const tw=((X1-X0)/nx)|0, th=((Y1-Y0)/ny)|0;
  const out=[];
  for(let ty=0;ty<ny;ty++) for(let tx=0;tx<nx;tx++){
    let s=0,n=0,mx=0;
    for(let y=Y0+ty*th; y<Y0+(ty+1)*th; y++) for(let x=X0+tx*tw; x<X0+(tx+1)*tw; x++){
      const i=(y*P.w+x)*P.ch, l=0.2126*P.data[i]+0.7152*P.data[i+1]+0.0722*P.data[i+2];
      s+=l; n++; if(l>mx) mx=l; }
    out.push({ tx, ty, cx:(X0+(tx+0.5)*tw)/P.w, cy:(Y0+(ty+0.5)*th)/P.h, mean:s/n, max:mx });
  }
  return out;
}

// The arm is the brightest tile in the frame, found rather than assumed — it sits bottom-right at this vantage
// but the vantage is not this file's to know.
function armTile(T){ return T.reduce((a,b)=> b.max>a.max?b:a, T[0]); }

function report(tag, file){
  const T = tiles(file);
  const A = armTile(T);
  const dark = T.filter(t => t.max < 40);            // tiles with no bright object in them: the room itself
  const d = t => Math.hypot(t.cx-A.cx, t.cy-A.cy);
  dark.sort((a,b)=> d(a)-d(b));
  const near = dark.slice(0, Math.max(1, (dark.length*0.25)|0));
  const far  = dark.slice(-Math.max(1, (dark.length*0.25)|0));
  const mean = L => L.reduce((s,t)=>s+t.mean,0)/L.length;
  console.log(`  ${tag}`);
  console.log(`    brightest tile (the arm)  mean ${A.mean.toFixed(1)}  max ${A.max.toFixed(0)}  at ${A.cx.toFixed(2)},${A.cy.toFixed(2)}`);
  console.log(`    dark tiles ${dark.length}/${T.length}   nearest quartile ${mean(near).toFixed(2)}   farthest quartile ${mean(far).toFixed(2)}   spread ${(mean(near)-mean(far)).toFixed(2)}`);
  return { arm:A.mean, armMax:A.max, near:mean(near), far:mean(far) };
}

const N = report('noon ', path.join(OUT,'ub-cave-noon-0.png'));
const G = report('night', path.join(OUT,'ub-cave-night-0.png'));
console.log('');
console.log(`  arm      noon ${N.arm.toFixed(1)} vs night ${G.arm.toFixed(1)}   (max ${N.armMax.toFixed(0)} vs ${G.armMax.toFixed(0)})`);
console.log(`  room     noon ${N.far.toFixed(2)} vs night ${G.far.toFixed(2)}   far from the arm`);
console.log(`  gradient noon ${(N.near-N.far).toFixed(2)} vs night ${(G.near-G.far).toFixed(2)}   near minus far`);
console.log('');
console.log('  A gradient that scales with the arm says the lift is the viewmodel through bloom.');
console.log('  A flat spread with a day-scaled level says it is a full-screen term and the arm is innocent.');
