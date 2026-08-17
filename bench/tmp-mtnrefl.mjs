// THE LAST CANDIDATE FOR THE LEAK: the sea reflects the horizon, and wet sand and foam near the waterline are the same
// bright pixels my "sand" classifier picks up. Kill the water's reflection and toggle the range again — if the leak on
// everything below the waterline dies with it, nothing is being drawn over near geometry and the layer is behind the
// wood where it belongs.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const px=f=>decodePNG(fs.readFileSync(f));
function surfaces(A1,A2,B){
  const cls={tree:0,sand:0}, acc={tree:[0,0],sand:[0,0]};
  for(let y=0;y<B.h;y++) for(let x=0;x<B.w;x++){
    const i=(y*B.w+x)*B.ch, r=B.data[i], g=B.data[i+1], b=B.data[i+2], lum=0.2126*r+0.7152*g+0.0722*b;
    let k=null;
    if(g>r+10&&g>b+10&&lum<90) k='tree'; else if(Math.abs(r-g)<18&&r>150&&y>B.h*0.5) k='sand';
    if(!k) continue; cls[k]++;
    const d=(P,Q)=>(Math.abs(P.data[i]-Q.data[i])+Math.abs(P.data[i+1]-Q.data[i+1])+Math.abs(P.data[i+2]-Q.data[i+2]))/3;
    acc[k][0]+=d(A1,B); acc[k][1]+=d(A1,A2);
  }
  return Object.keys(cls).map(k=>`${k} n=${cls[k]} vsOff=${(acc[k][0]/cls[k]).toFixed(2)} noise=${(acc[k][1]/cls[k]).toFixed(2)}`).join('   ');
}
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:0.02}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(900); await pin(W,0.25);
  console.log('refl off:', JSON.stringify(await W.ev(`(()=>{try{return [__hc.ocean3Refl(false), __hc.waterRefl({on:false})]}catch(e){return String(e.message||e)}})()`)));
  await sleep(900);
  const a1=(await shots(W,'rf-on1',0.25,1))[0], a2=(await shots(W,'rf-on2',0.25,1))[0];
  await W.ev(`__hc.mtn(false)`); await sleep(800);
  const b=(await shots(W,'rf-off',0.25,1))[0];
  console.log('no reflection  ', surfaces(px(a1),px(a2),px(b)));
  await W.ev(`__hc.mtn(true)`);
}finally{ await W.close(); }
