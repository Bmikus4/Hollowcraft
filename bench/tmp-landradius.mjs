// WHERE THE LAST LAND IS. Ben's pines fault is "still FAR BEHIND the map", so the ring's distance has to be set
// from the island's own extent rather than from a number anybody likes the look of.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2000);
    const ev=s=>W.page.evaluate(s);
    const P=await ev('__hc.probe()');
    const out=await ev(`(()=>{ const cx=${P.spawnX}, cz=${P.spawnZ}, sea=${P.sea}, r=[];
      for(let k=0;k<16;k++){ const a=k*Math.PI/8; let last=0;
        for(let d=8; d<900; d+=4){ const x=Math.round(cx+Math.cos(a)*d), z=Math.round(cz+Math.sin(a)*d);
          if(__hc.surfH(x,z)>sea+1) last=d; }
        r.push(last); }
      r.sort((a,b)=>a-b);
      return { worldSize:__hc.probe().worldSize, min:r[0], median:r[8], max:r[15], all:r }; })()`);
    console.log(JSON.stringify(out));
  } finally { await W.close(); } })();
