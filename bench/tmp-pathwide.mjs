// SCRATCH. Paths, over the whole loaded world rather than one run: every trail column, what block is on top of it,
// and what tile that top face will draw.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:12});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const r=await W.page.evaluate(`(()=>{ const s=__hc.st(), px=Math.round(s.px), pz=Math.round(s.pz);
      const D=__hc.bid('dirt'), P=__hc.bid('path'), G=__hc.bid('grass'), S=__hc.bid('sand');
      let n=0; const by={}; const bad=[];
      for(let dz=-120;dz<=120;dz++) for(let dx=-120;dx<=120;dx++){
        const x=px+dx, z=pz+dz; if(!__hc.trailAt(x,z)) continue;
        const h=__hc.surfH(x,z); if(h<=40) continue; n++;
        const b=__hc.mineState(x,h,z).block;
        const nm = b===D?'dirt' : b===P?'path' : b===G?'grass' : b===S?'sand' : ('id'+b);
        by[nm]=(by[nm]|0)+1;
        if(nm!=='dirt' && nm!=='path' && bad.length<8) bad.push({x,z,h,nm}); }
      return { trailColumns:n, by, bad }; })()`);
    console.log(JSON.stringify(r));
    console.log('transCensus '+JSON.stringify((await W.page.evaluate('__hc.transCensus()')).surface));
  } finally { await W.close(); } })();
