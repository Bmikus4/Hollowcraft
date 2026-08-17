// A 60-DEGREE RANGE, OR NOTHING AT ALL. The layer paints no debug green at any bearing, and that has two shapes: it is
// drawn somewhere off-screen (placement) or it is not drawn at all (covered, discarded, or alpha zero). uMtnMax is the
// apparent height dial, so cranking it to 60 degrees must smear the range across half the sky if the layer reaches the
// framebuffer. Green pixels are counted with r and b near zero, which foliage never is under uDbg=2.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const paint=(file)=>{ const P=decodePNG(fs.readFileSync(file)); let n=0,y0=1e9,y1=-1;
  for(let y=0;y<P.h;y++) for(let x=0;x<P.w;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i], g=P.data[i+1], b=P.data[i+2];
    if(g>60 && r<25 && b<25){ n++; if(y<y0)y0=y; if(y>y1)y1=y; } }
  return { pct:+(100*n/(P.w*P.h)).toFixed(3), rows:y1<0?'none':y0+'..'+y1 }; };
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:0.10}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(2500);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(600); await pin(W,0.25);
  console.log('horizonDbg:', JSON.stringify(await W.ev(`__hc.horizonDbg(true)`)));
  console.log('dbg mode  :', await W.ev(`__hc.mtnDbg(2)`));
  for(const deg of [20, 60, 120]){
    console.log('dials', JSON.stringify(await W.ev(`__hc.mtn(true,{deg:${deg}, gain:2.0, fogMul:0.0, force:true})`)));
    await sleep(1200);
    const f=(await shots(W,`md-${deg}`,0.25,1))[0];
    console.log(`  deg ${String(deg).padStart(3)}  painted ${JSON.stringify(paint(f))}`);
  }
  // ...and with the ocean ring's whole group hidden, in case something in it is drawn over the range.
  await W.ev(`__hc.ocean3(false)`); await sleep(800);
  { const f=(await shots(W,'md-noocean',0.25,1))[0]; console.log('  ocean3 off  painted', JSON.stringify(paint(f))); }
  await W.ev(`__hc.mtnDbg(0); __hc.ocean3(true); __hc.mtn(true,{deg:20, gain:1.1, fogMul:0.1});`);
}finally{ await W.close(); }
