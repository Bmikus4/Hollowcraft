import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  // on open ground with the wood in front: goShore lands inside it, so step seaward first
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); const sea=40; let bx=p.x, bz=p.z;
    for(let r=0;r<200;r+=2){ const x=Math.round(p.x-r), z=Math.round(p.z); if(H.surfH(x,z)<=sea+2){ bx=x+8; bz=z; break; } }
    __hc.tpAt(bx, H.surfH(Math.round(bx),Math.round(bz))+2, bz); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(2500);
  for(const [tag,t] of [['noon',0.25],['dusk',0.47]]){
    await pin(W,t); await sleep(900); await pin(W,t);
    // face the wood
    await W.ev(`H.cam({yaw:3.665, pitch:0.10})`); await sleep(500);
    await shots(W,`foliage-${tag}`,t,1);
  }
  // BACKLIT: put the low sun behind the trees by facing INTO its bearing
  await pin(W,0.47); await sleep(800);
  const sd=await W.ev(`__hc.sunDir&&__hc.sunDir()`);
  if(sd){ const yaw=Math.atan2(-sd.x,-sd.z);
    await W.ev(`H.cam({yaw:${sd.yawToSun}, pitch:0.14})`); await sleep(600);   // face the sun: backlit is the point
    await shots(W,'foliage-backlit',0.47,1);
    console.log('sun', JSON.stringify(sd));
  }
}finally{ await W.close(); }
