// THREE SIZES OF COAST FOR BEN TO PICK FROM. The shipped one subtends 0.441 degrees — five pixels at 720p — which is
// the physical minimum honoured exactly, and it is why he says the feature looks undone. The lever is the apparent
// DISTANCE, not the tree height: the trees are the generator's own 20-block conifers and should stay that, so d is
// what moves. 0.44 / 1.6 / 2.7 degrees is 2600 / 700 / 420 blocks.
// A CONTROL PAIR PER BEARING, because the sea animates: two frames of the same condition set the noise floor, and
// anything the toggle moves has to beat it. Without that every reading here is wave.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const px=f=>decodePNG(fs.readFileSync(f));
function moved(a,b){ let n=0; for(let y=0;y<a.h;y++) for(let x=0;x<a.w;x++){ const i=(y*a.w+x)*a.ch;
  const d=(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]))/3;
  if(d>10) n++; } return n; }
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); const sea=40; let bx=p.x, bz=p.z;
    for(let r=0;r<200;r+=2){ const x=Math.round(p.x-r), z=Math.round(p.z); const h=H.surfH(x,z); if(h<=sea+1) break; bx=x; bz=z; }
    __hc.tpAt(bx, H.surfH(Math.round(bx),Math.round(bz))+2, bz); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(900); await pin(W,0.25);
  let best=null;
  for(let k=0;k<12;k++){
    const yaw=+(k*Math.PI/6).toFixed(3);
    await W.ev(`H.cam({yaw:${yaw}, pitch:0.01}); __hc.pines(true,{d:420})`); await sleep(420);
    const a1=px((await shots(W,`ps-a-${k}`,0.25,1))[0]), a2=px((await shots(W,`ps-b-${k}`,0.25,1))[0]);
    await W.ev(`__hc.pines(false)`); await sleep(420);
    const off=px((await shots(W,`ps-off-${k}`,0.25,1))[0]);
    await W.ev(`__hc.pines(true)`); await sleep(300);
    const sig=moved(a1,off), noise=moved(a1,a2);
    if(!best || sig-noise>best.d) best={yaw,k,sig,noise,d:sig-noise};
    console.log(`yaw ${String(Math.round(yaw*57.3)).padStart(3)}deg  pines px ${String(sig).padStart(6)}  noise ${String(noise).padStart(6)}  net ${String(sig-noise).padStart(6)}`);
  }
  console.log('picked bearing', JSON.stringify(best));
  await W.ev(`H.cam({yaw:${best.yaw}, pitch:0.01})`); await sleep(400);
  for(const d of [2600,700,420]){
    await W.ev(`__hc.pines(true,{d:${d}})`); await sleep(600);
    const st=await W.ev(`__hc.pines(true)`);
    await shots(W,`pinesize-${d}`,0.25,1);
    console.log(`d=${d}  canopy ${st.canopyDeg} deg`);
  }
  await W.ev(`__hc.pines(true,{d:2600});`);
}finally{ await W.close(); }
