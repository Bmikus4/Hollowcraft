// SCRATCH. Ben: "i dont see the clean blend between block types." Look at a beach-to-grass edge from standing height.
import { openWorld, sleep, OUT, pin } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2000);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await pin(W,0.25);
    // The sand/grass seam: walk out from the shore until the surface stops being sand, then stand back from it.
    const spot=await W.page.evaluate(`(()=>{ const S=__hc.shoreSpot(); if(!S||S.err) return null;
      const SA=__hc.bid('sand'), G=__hc.bid('grass');
      const dx=(S.seaAt[0]-S.x), dz=(S.seaAt[1]-S.z), L=Math.hypot(dx,dz)||1, ux=dx/L, uz=dz/L;
      for(let t=0;t<40;t++){ const x=Math.round(S.x-ux*t), z=Math.round(S.z-uz*t), h=__hc.surfH(x,z);
        const b=__hc.mineState(x,h,z).block;
        if(b===G){ return {x, z, h, ux, uz}; } }
      return null; })()`);
    console.log('seam '+JSON.stringify(spot));
    if(!spot) return;
    await W.page.evaluate('__hc.tpExact('+(spot.x - spot.ux*10)+', '+(spot.z - spot.uz*10)+', '+(spot.h+3)+')');
    await sleep(320);
    await W.page.evaluate('__hc.look('+(spot.x + spot.ux*6)+', '+(spot.h)+', '+(spot.z + spot.uz*6)+')');
    for(let i=0;i<15;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(300); }
    await sleep(1500);
    await W.page.screenshot({path:path.join(OUT,'blend_beach.png')});
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
