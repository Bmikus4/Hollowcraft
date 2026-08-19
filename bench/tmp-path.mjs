// SCRATCH. "Dirt paths are still gone." A trail is a strip of surface DIRT written by genColumn where trailDist<1.6.
// Two questions: are the dirt blocks still written, and what TILE is drawn on them?
import { openWorld, sleep, OUT, pin } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2000);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await pin(W,0.25);
    // WALK THE TRAIL ITSELF. trailDist is generator-level, so ask it rather than hunting for brown blocks.
    const scan=await W.page.evaluate(`(()=>{ const s=__hc.st(), px=Math.round(s.px), pz=Math.round(s.pz);
      const D=__hc.bid('dirt'), G=__hc.bid('grass');
      let onTrail=0, dirtOnTrail=0, grassOnTrail=0, otherOnTrail=0; const other={}; let sample=null;
      for(let dz=-80;dz<=80;dz++) for(let dx=-80;dx<=80;dx++){
        const x=px+dx, z=pz+dz;
        if(!__hc.trailAt || !__hc.trailAt(x,z)) continue;
        onTrail++;
        const h=__hc.surfH(x,z), b=__hc.mineState(x,h,z).block;
        if(b===D){ dirtOnTrail++; if(!sample) sample={x,z,h}; }
        else if(b===G) grassOnTrail++;
        else { otherOnTrail++; const n=(__hc.bid()||[]).find(k=>__hc.bid(k)===b)||('id'+b); other[n]=(other[n]|0)+1; } }
      return { onTrail, dirtOnTrail, grassOnTrail, otherOnTrail, other, sample }; })()`);
    console.log(JSON.stringify(scan));
    // THE LONGEST STRAIGHT RUN OF TRAIL in the scanned box, away from the cabin, so the shot is of a PATH and not of
    // whatever building happens to stand on one.
    const run=await W.page.evaluate(`(()=>{ const s=__hc.st(), px=Math.round(s.px), pz=Math.round(s.pz);
      const cx=s.sx+22, cz=s.sz-14; let best=null;
      for(let dz=-80;dz<=80;dz+=1) for(let dx=-80;dx<=80;dx+=1){
        const x=px+dx, z=pz+dz;
        if(Math.hypot(x-cx,z-cz)<26) continue;
        if(!__hc.trailAt(x,z)) continue;
        for(const [ux,uz] of [[1,0],[0,1]]){
          let n=0; while(n<40 && __hc.trailAt(x+ux*n, z+uz*n)) n++;
          if(!best || n>best.n) best={x,z,ux,uz,n,h:__hc.surfH(x,z)}; } }
      return best; })()`);
    console.log('longest run '+JSON.stringify(run));
    if(run && run.n>6){
      await W.page.evaluate('__hc.tpExact('+(run.x-run.ux*2)+', '+(run.z-run.uz*2)+', '+(run.h+2.4)+')');
      await sleep(300);
      await W.page.evaluate('__hc.look('+(run.x+run.ux*run.n)+', '+(run.h+0.6)+', '+(run.z+run.uz*run.n)+')');
      for(let i=0;i<12;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(300); }
      await sleep(1400);
      await W.page.screenshot({path:path.join(OUT,'path_look.png')});
    }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
