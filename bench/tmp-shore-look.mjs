// SCRATCH PROBE. "The shoreline needs receded by 14 blocksish, it should contact the shore and have no gaps in its
// corners." A/B the coast rule off and on at the GENERATOR level (coastCensus reads surfaceH, so it answers without a
// regen), plus a traverse across the waterline and the streaming cost, then a picture of the bay.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2000);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    const shore=await W.page.evaluate('__hc.shoreSpot()');
    console.log('shore '+JSON.stringify(shore));
    const read=async(tag)=>{
      const t0=Date.now();
      const c=await W.page.evaluate('__hc.coastCensus(120,1)');
      const ms=Date.now()-t0;
      const cross=await W.page.evaluate(`(()=>{ const S=${JSON.stringify(shore)};
        const dx=(S.seaAt[0]-S.x), dz=(S.seaAt[1]-S.z), L=Math.hypot(dx,dz)||1, ux=dx/L, uz=dz/L; const r=[];
        for(let t=-6;t<=34;t++) r.push(__hc.surfH(Math.round(S.x+ux*t), Math.round(S.z+uz*t)));
        return r.join(','); })()`);
      console.log(tag+' '+JSON.stringify(c));
      console.log(tag+' cross '+cross+'   (58081 columns in '+ms+'ms)');
    };
    await W.page.evaluate('__hc.coast(false)'); await read('OFF');
    await W.page.evaluate('__hc.coast(true)');  await read('ON ');
    await W.page.evaluate(`(()=>{ const S=${JSON.stringify(shore)}; __hc.tpExact(S.x, S.z, S.y+22); __hc.cam({yaw:S.yaw, pitch:-0.5}); return 1; })()`);
    for(let i=0;i<30;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1500);
    await W.page.screenshot({path:path.join(OUT,'shore_air.png')});
    console.log('fill '+JSON.stringify(await W.page.evaluate('__hc.fill()')));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
