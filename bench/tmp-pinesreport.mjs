// Ben, third report: "i still dont se skybox pines". Everything below is read out of the running game, from the sand
// at standing eye height, with nothing derived.
import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); const sea=40; let bx=p.x, bz=p.z;
    for(let r=0;r<200;r+=2){ const x=Math.round(p.x-r), z=Math.round(p.z); if(H.surfH(x,z)<=sea+1){ bx=x; bz=z; break; } }
    __hc.tpAt(bx+3, H.surfH(Math.round(bx+3),Math.round(bz))+2, bz); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(2500); await pin(W,0.25); await sleep(600);
  console.log('(1) __hc.pines():', JSON.stringify(await W.ev(`__hc.pines()`)));
  console.log('(1) outcome     :', JSON.stringify(await W.ev(`__hc.pinesMask()`), null, 1));
  console.log('(4) skycube/scene:', JSON.stringify(await W.ev(`(()=>{const m=__hc.pinesMask(); return {skycube:m.skycube, pinesInScene:m.pinesInScene, oceanLayerVisible:m.oceanLayerVisible};})()`)));
}finally{ await W.close(); }
