// DOES THE RANGE ACTUALLY LOOM BY THE ANGLE ON THE DIAL, and is there a ridge line under it? Two questions, one frame.
// uDbg 3 paints the layer magenta, so the topmost magenta pixel in each column IS the skyline; the horizon row comes
// from the camera's own pitch rather than from the picture. Angle is rectilinear, not rows/height: elev = atan((yc-y)
// /(h/2) * tan(fov/2)) + pitch.
// The second number is the one the old clamp destroyed. Capped, every bearing drew to the same height, so the crest
// was noise on a flat top; the spread of the skyline across columns says whether the range has ridges again.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const PITCH=0.02;
// ELEVATION IS NOT A FUNCTION OF THE ROW ALONE. A rectilinear projection foreshortens off-axis: a point at screen
// (x,y) sits at atan(yt / sqrt(1 + xt^2)), and at this frame's left edge xt is 1.33, so ignoring the x term reported
// the skyline at 33 degrees where it actually stands at 18. That error is the whole reason the dial looked wrong.
function skyline(file, fovDeg){
  const P=decodePNG(fs.readFileSync(file)), h=P.h, w=P.w, half=h/2, t=Math.tan(fovDeg*Math.PI/360);
  const asp=w/h, tops=[];
  for(let x=0;x<w;x++){
    const xt=((x-w/2)/(w/2))*t*asp;
    for(let y=0;y<h;y++){ const i=(y*w+x)*P.ch, r=P.data[i], g=P.data[i+1], b=P.data[i+2];
      if(r>g+25 && b>g+25){ const yt=((half-y)/half)*t;
        tops.push(Math.atan(yt/Math.sqrt(1+xt*xt))+PITCH); break; } }
  }
  if(!tops.length) return null;
  const deg=v=>v*180/Math.PI, mx=Math.max(...tops), mn=Math.min(...tops);
  const mean=tops.reduce((a,b)=>a+b,0)/tops.length;
  const sd=Math.sqrt(tops.reduce((a,b)=>a+(b-mean)*(b-mean),0)/tops.length);
  return { cols:tops.length, maxDeg:+deg(mx).toFixed(2), meanDeg:+deg(mean).toFixed(2), minDeg:+deg(mn).toFixed(2), sdDeg:+deg(sd).toFixed(2) };
}
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:${PITCH}}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(900); await pin(W,0.25);
  // THE FOV IS MEASURED, NOT ASSUMED. There is no hook that reports it and the camera is constructed at 74 but the
  // settings and the cinema mode both touch it; assuming 74 put the skyline at 33 degrees for a 20-degree dial, which
  // is the assumption failing rather than the geometry. Rotate a known angle, see how far the band's own right-hand
  // edge travels, and the horizontal fov falls out of tan((x-cx)/(w/2)*tan(f/2)) — then vertical from the aspect.
  await W.ev(`__hc.mtnDbg(3)`); await sleep(600);
  const edgeAt=async(yaw,tag)=>{ await W.ev(`H.cam({yaw:${yaw}, pitch:${PITCH}})`); await sleep(450);
    const P=decodePNG(fs.readFileSync((await shots(W,tag,0.25,1))[0]));
    for(let x=P.w-1;x>=0;x--){ let hit=0;
      for(let y=0;y<P.h;y++){ const i=(y*P.w+x)*P.ch; if(P.data[i]>P.data[i+1]+25 && P.data[i+2]>P.data[i+1]+25){ hit++; if(hit>6) return x; } } }
    return null; };
  const D=0.20, x1=await edgeAt(3.665-D/2,'fovA'), x2=await edgeAt(3.665+D/2,'fovB');
  // a feature at screen x maps to angle atan((x-cx)/(w/2)*tan(fh/2)); for a small rotation about the centre the shift
  // in tangent units is D, so tan(fh/2) = D_tangent_units^-1 solved from the two positions
  const w=1280, cx=w/2, solve=(x)=> (x-cx)/(w/2);
  const FOVH = x1!=null && x2!=null && Math.abs(solve(x1)-solve(x2))>1e-6
    ? 2*Math.atan(D/Math.abs(solve(x1)-solve(x2)))*180/Math.PI : null;
  const FOV = FOVH ? 2*Math.atan(Math.tan(FOVH*Math.PI/360)*720/1280)*180/Math.PI : 74;
  console.log(`fov measured: horizontal ${FOVH?FOVH.toFixed(1):'?'}  vertical ${FOV.toFixed(1)}  (edges x ${x1} -> ${x2})`);
  await W.ev(`H.cam({yaw:3.665, pitch:${PITCH}})`); await sleep(400);
  console.log('mask', JSON.stringify(await W.ev(`__hc.mtnMask()`)));
  await W.ev(`__hc.mtnDbg(3)`);
  await W.ev(`__hc.pass('bloom',false)`); await sleep(400);   // a bloom halo over a bright band is skyline that is not there
  for(const deg of [10,14,20,26,34]){
    const st=await W.ev(`__hc.mtn(true,{deg:${deg}})`);
    await sleep(800);
    const f=(await shots(W,`loom-${deg}`,0.25,1))[0];
    const sk=skyline(f,FOV), mk=await W.ev(`__hc.mtnMask()`);
    console.log(`dial ${String(deg).padStart(2)}deg  wall ${String(Math.round(mk.wall)).padStart(5)}  peak ${mk.rows[0].peakMax}  skyline max ${String(sk.maxDeg).padStart(6)}  mean ${String(sk.meanDeg).padStart(6)}  sd ${String(sk.sdDeg).padStart(5)}  cols ${sk.cols}`);
  }
  await W.ev(`__hc.mtnDbg(0); __hc.pass('bloom',true); __hc.mtn(true,{deg:20})`);
}finally{ await W.close(); }
