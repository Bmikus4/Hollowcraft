// SCRATCH. How far does the pan actually go? Sweep the coast reach and read what is left dry at sea level, what the
// corners look like, and what it costs.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2000);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    for(const r of [0,14,24,40,64,120]){
      if(r===0) await W.page.evaluate('__hc.coast(false)'); else await W.page.evaluate('__hc.coast(true,'+r+')');
      const t0=Date.now(); const c=await W.page.evaluate('__hc.coastCensus(120,1)'); const ms=Date.now()-t0;
      console.log('reach '+String(r).padStart(3)+'  dry '+String(c.drySeaLevel).padStart(5)+
        '  touchingWater '+String(c.dryTouchingWater).padStart(4)+'  notch '+String(c.cornerNotches).padStart(4)+
        ' (river '+c.cornerNotchesOnRiver+', shore '+c.cornerNotchesOnShore+', interior '+
        (c.cornerNotches-c.cornerNotchesOnRiver-c.cornerNotchesRingedByLand-c.cornerNotchesOnShore)+
        ')  underWater '+c.underWater+'  drySteps2 '+c.dryStepsOf2Plus+'  census '+ms+'ms');
    }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
