import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS); await W.ev(`atSpawn()`); await sleep(1500);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(2500); await pin(W,0.25); await sleep(500);
  const c=await W.ev(`__hc.foliageCensus()`);
  console.log('sunflower at', JSON.stringify(c.per.sunflower_wild), ' pale_bloom at', JSON.stringify(c.per.pale_bloom));
  const at=(c.per.sunflower_wild&&c.per.sunflower_wild.at);
  if(at){
    await W.ev(`(function(){ __hc.tpAt(${at[0]}+6, ${at[1]}+2, ${at[2]}+6);
      const p=__hc.pos(); H.cam({yaw:Math.atan2(-(${at[0]}-p.x), -(${at[2]}-p.z)), pitch:-0.05}); })()`);
    for(let i=0;i<30;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
    await sleep(2000); await shots(W,'foliage-wild',0.25,1);
    console.log('above the stalk:', await W.ev(`(()=>{const b=__hc.blockAt(${at[0]},${at[1]}+1,${at[2]}); return b+' want '+__hc.bid('sunflower_top');})()`));
  }
}finally{ await W.close(); }
