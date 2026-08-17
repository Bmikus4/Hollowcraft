import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS); await W.ev(`atSpawn()`); await sleep(1500);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(2500); await pin(W,0.25); await sleep(500);
  const c = await W.ev(`__hc.foliageCensus()`);
  for(const k of ['sunflower','sunflower_wild','sunflower_top','tree_flower','pale_bloom','vine'])
    console.log(String(k).padEnd(16), JSON.stringify(c.per[k]));
  const t = (c.per.vine && c.per.vine.at);
  if(t){
    await W.ev(`(function(){ __hc.tpAt(${t[0]}+4, ${t[1]}+1, ${t[2]}+4);
      const p=__hc.pos(); H.cam({yaw:Math.atan2(-(${t[0]}-p.x), -(${t[2]}-p.z)), pitch:-0.06}); })()`);
    for(let i=0;i<30;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
    await sleep(2200); await shots(W,'foliage-wild',0.25,1);
    console.log('shot at', JSON.stringify(t));
  }
}finally{ await W.close(); }
