// SCRATCH. Foliage density +10% and the new two-block tuft: count what is actually standing on the ground in the
// loaded world, and photograph a wood.
import { openWorld, sleep, OUT, pin } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2000);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await pin(W,0.25);
    const c=await W.page.evaluate(`(()=>{ const s=__hc.st(), px=Math.round(s.px), pz=Math.round(s.pz);
      const N=['tallgrass','meadow_grass','meadow_grass_tall','tallgrass2','tallgrass2_top','fern','bush','mush_red',
               'mush_brown','foxglove','anemone','bellflower','sage','yarrow','bloodroot','berry','tree_flower'];
      const ids={}; for(const n of N) ids[__hc.bid(n)]=n;
      let cols=0, grassCols=0, covered=0; const by={};
      for(let dz=-70;dz<=70;dz++) for(let dx=-70;dx<=70;dx++){
        const x=px+dx, z=pz+dz, h=__hc.surfH(x,z); if(h<=44||h>=100) continue; cols++;
        const g=__hc.mineState(x,h,z).block; if(g!==__hc.bid('grass')) continue; grassCols++;
        const b=__hc.mineState(x,h+1,z).block; const n=ids[b]; if(!n) continue;
        covered++; by[n]=(by[n]|0)+1; }
      return { cols, grassCols, covered, share:+(covered/Math.max(grassCols,1)).toFixed(3), by }; })()`);
    console.log(JSON.stringify(c));
    // a wood, at eye height, looking along the ground
    const at=await W.page.evaluate(`(()=>{ const s=__hc.st(), px=Math.round(s.px), pz=Math.round(s.pz);
      for(let r=8;r<70;r+=3) for(let a=0;a<6.2;a+=0.5){ const x=Math.round(px+Math.cos(a)*r), z=Math.round(pz+Math.sin(a)*r);
        const h=__hc.surfH(x,z); if(h<48||h>80) continue;
        if(__hc.mineState(x,h+1,z).block===__hc.bid('tallgrass2')){ __hc.tpExact(x-1, z-1, h+2.2); return {x,z,h}; } }
      return null; })()`);
    console.log('tuft at '+JSON.stringify(at));
    if(at){ await sleep(300); await W.page.evaluate('__hc.look('+(at.x+14)+', '+(at.h+1.4)+', '+(at.z+14)+')');
      for(let i=0;i<12;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(300); }
      await sleep(1400); await W.page.screenshot({path:path.join(OUT,'density_wood.png')}); }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
