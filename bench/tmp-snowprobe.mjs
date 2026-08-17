// DOES THE SNOW UNIFORM REACH THE SHADER AT ALL? A line at world 112 against peaks of 92 must leave zero snow, and
// the band came back fully red anyway. Drive the dial to an absurd value: if the red survives a snow line at 10000
// then the program running in the page is not the one being edited, and every other reading is worthless.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const BAND=[0.00,0.52,0.05,0.52];
function red(file){ const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*BAND[0])|0,x1=(P.w*BAND[1])|0,y0=(P.h*BAND[2])|0,y1=(P.h*BAND[3])|0; let n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch;
    if(P.data[i]>P.data[i+1]+18 && P.data[i]>P.data[i+2]+18) n++; }
  return n; }
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:0.02}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(800); await pin(W,0.25);
  await W.ev(`__hc.mtnDbg(1)`);
  for(const s of [[-9999,-9999],[10000,10000],[82,92]]){
    console.log('dial', JSON.stringify(await W.ev(`__hc.mtn(true,{snow:[${s[0]},${s[1]}]})`)));
    await sleep(700);
    const f=(await shots(W,`sp-${s[0]}`,0.25,1))[0];
    console.log(`   red px ${red(f)}`);
  }
  // and the source the page is actually running, so "the edit is in the file" and "the edit is in the program" stop
  // being the same claim
  console.log('served file has uSnowY:', await W.ev(`fetch('/index.html').then(r=>r.text()).then(t=>[t.indexOf('uSnowY')>0, t.indexOf('float wy=uCamY+elev*dist')>0, t.length])`));
  await W.ev(`__hc.mtnDbg(0)`);
}finally{ await W.close(); }
