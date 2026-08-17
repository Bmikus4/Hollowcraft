// THE RANGE MOVES PIXELS IT DOES NOT COVER — sand changes by 2.77/255 against a noise floor of 0.13 when the layer is
// toggled, and sand is opaque geometry thirty blocks away. Either the shell is beating the depth test (a real bug) or a
// bright band on the horizon is bleeding through the post chain (not one). Same toggle, same crops, with bloom off and
// then with bloom and grade both off: if the leak dies with the passes, nothing is drawn where it should not be.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const px=f=>decodePNG(fs.readFileSync(f));
function surfaces(A1,A2,B){
  const cls={tree:0,sand:0,sky:0}, acc={tree:[0,0],sand:[0,0],sky:[0,0]};
  for(let y=0;y<B.h;y++) for(let x=0;x<B.w;x++){
    const i=(y*B.w+x)*B.ch, r=B.data[i], g=B.data[i+1], b=B.data[i+2], lum=0.2126*r+0.7152*g+0.0722*b;
    let k=null;
    if(g>r+10 && g>b+10 && lum<90) k='tree';
    else if(Math.abs(r-g)<18 && r>150 && y>B.h*0.5) k='sand';
    else if(b>r+6 && lum>150 && y<B.h*0.5) k='sky';
    if(!k) continue;
    cls[k]++;
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
  for(const [tag,setup] of [['all on',''],['bloom off',`__hc.pass('bloom',false)`],['bloom+grade off',`__hc.pass('bloom',false); __hc.pass('grade',false)`]]){
    if(setup) await W.ev(setup);
    await sleep(700);
    const a1=(await shots(W,`bl-${tag.replace(/\W+/g,'')}-on1`,0.25,1))[0];
    const a2=(await shots(W,`bl-${tag.replace(/\W+/g,'')}-on2`,0.25,1))[0];
    await W.ev(`__hc.mtn(false)`); await sleep(700);
    const b=(await shots(W,`bl-${tag.replace(/\W+/g,'')}-off`,0.25,1))[0];
    await W.ev(`__hc.mtn(true)`); await sleep(500);
    console.log(tag.padEnd(16), surfaces(px(a1),px(a2),px(b)));
  }
  await W.ev(`__hc.pass('bloom',true); __hc.pass('grade',true)`);
}finally{ await W.close(); }
