// The size answer is not enough: at 3.2 degrees the horizon is still bare. So ask the question that separates "too
// small to see" from "not drawn at all" in one shot — 32 degrees of treeline at triple gain. If that is invisible the
// fault is the gate or the vertical placement, not the dial, and Ben's image is being discarded rather than shrunk.
import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); const sea=40; let bx=p.x, bz=p.z;
    for(let r=0;r<220;r+=2){ const x=Math.round(p.x-r), z=Math.round(p.z); if(H.surfH(x,z)<=sea+1){ bx=x+2; bz=z; break; } }
    __hc.tpAt(bx, H.surfH(Math.round(bx),Math.round(bz))+2, bz); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  const fill=await W.ev(`__hc.fill()`); if(fill.meshed<fill.want) throw new Error('not meshed');
  await sleep(2500); await pin(W,0.25); await sleep(500);
  const p0=await W.ev(`__hc.pinesProbe()`);
  await W.ev(`H.cam({yaw:${p0.strongestBearing.lookYaw}, pitch:0.06})`); await sleep(400);
  console.log('dials:', JSON.stringify(await W.ev(`__hc.pines(true,{d:360,h:200,gain:3})`)));
  await sleep(900);
  await shots(W,'pines-absurd',0.25,1);
  // and with the ocean ring hidden, in case the sea band is drawn over it
  await W.ev(`__hc.horizonBand&&__hc.horizonBand({on:false})`); await sleep(600);
  await shots(W,'pines-absurd-nooceanband',0.25,1);
  await W.ev(`__hc.horizonBand&&__hc.horizonBand({on:true}); __hc.pines(true,{d:2600,h:20,gain:0.42})`);
}finally{ await W.close(); }
