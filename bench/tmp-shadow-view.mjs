// A VANTAGE THAT ACTUALLY SEES GROUND. The previous shadow run measured a wall two blocks from the lens because
// goVillage() drops the camera inside the village rather than above it. Elevate and pitch down so the crop is
// terrain, then LOOK at the frame before reading any statistic off it.
import { openWorld, shots, diffStat, CROP, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High' });
try{
  await W.ev(HELPERS);
  const site = await W.ev(`(function(){ const r=goForest(); at(r.x, r.z, 14); H.cam({yaw:0.7, pitch:-0.55}); return r; })()`);
  console.log('site:', JSON.stringify(site));
  for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(2500);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.freezeT(120); __hc.cinema(true)`);
  for(const t of [0.15, 0.25]){
    await W.ev(`__hc.setTime(${t})`); await sleep(600); await W.ev(`__hc.setTime(${t})`); await sleep(1400);
    await W.ev(`__hc.shadowSoft({cast:true})`);  await sleep(900);
    const on  = await shots(W, `sv-${t}-on`, null, 2);
    await W.ev(`__hc.shadowSoft({cast:false})`); await sleep(900);
    const off = await shots(W, `sv-${t}-off`, null, 2);
    await W.ev(`__hc.shadowSoft({cast:true})`);
    const g=diffStat(on[0],off[0],CROP.frame), c=diffStat(on[0],on[1],CROP.frame);
    console.log(`t=${t}  shadow moves ${g.movedPct}% of frame (mad ${g.mad}, peak ${g.max})   noise ${c.movedPct}%`);
  }
  console.log('pos:', JSON.stringify(await W.ev(`__hc.pos()`)));
}finally{ await W.close(); }
