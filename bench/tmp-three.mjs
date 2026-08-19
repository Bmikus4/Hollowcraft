// SCRATCH. Ben's three places: walk a path, stand on a cliff edge, look at the sea floor.
import { openWorld, sleep, OUT, pin } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  const shot=async(n)=>{ await sleep(1400); await W.page.screenshot({path:path.join(OUT,n)}); };
  const aim=async(cx,cz,cy,tx,ty,tz)=>{ await W.page.evaluate(`__hc.tpExact(${cx}, ${cz}, ${cy})`); await sleep(320);
    await W.page.evaluate(`__hc.look(${tx}, ${ty}, ${tz})`);
    for(let i=0;i<12;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(300); } };
  try{ await sleep(2000);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await pin(W,0.25);
    // 1. A PATH, above the waterline, longest straight run away from the cabin.
    const run=await W.page.evaluate(`(()=>{ const s=__hc.st(), px=Math.round(s.px), pz=Math.round(s.pz);
      const cx=s.sx+22, cz=s.sz-14; let best=null;
      for(let dz=-80;dz<=80;dz++) for(let dx=-80;dx<=80;dx++){
        const x=px+dx, z=pz+dz, h=__hc.surfH(x,z);
        if(h<48 || Math.hypot(x-cx,z-cz)<24 || !__hc.trailAt(x,z)) continue;
        for(const [ux,uz] of [[1,0],[0,1]]){
          let n=0; while(n<30 && __hc.trailAt(x+ux*n, z+uz*n) && __hc.surfH(x+ux*n,z+uz*n)>=h-2) n++;
          if(!best || n>best.n) best={x,z,ux,uz,n,h}; } }
      if(best){ const D=__hc.bid('dirt'); let dirt=0;
        for(let i=0;i<best.n;i++){ const x=best.x+best.ux*i, z=best.z+best.uz*i;
          if(__hc.mineState(x,__hc.surfH(x,z),z).block===D) dirt++; }
        best.dirtOfRun=dirt; }
      return best; })()`);
    console.log('path run '+JSON.stringify(run));
    if(run && run.n>5){
      await aim(run.x-run.ux*3, run.z-run.uz*3, run.h+2.2, run.x+run.ux*run.n, run.h+0.4, run.z+run.uz*run.n);
      await shot('three_path.png');
    }
    // 2. A CLIFF EDGE: the biggest drop within 80 blocks, stood on top looking along it.
    const cliff=await W.page.evaluate(`(()=>{ const s=__hc.st(), px=Math.round(s.px), pz=Math.round(s.pz); let best=null;
      for(let dz=-80;dz<=80;dz+=2) for(let dx=-80;dx<=80;dx+=2){ const x=px+dx, z=pz+dz, h=__hc.surfH(x,z);
        if(h<50) continue; const d=h-__hc.surfH(x+3,z);
        if(!best || d>best.d) best={x,z,h,d}; }
      return best; })()`);
    console.log('cliff '+JSON.stringify(cliff));
    if(cliff){ await aim(cliff.x-6, cliff.z+4, cliff.h+3, cliff.x+2, cliff.h-1, cliff.z); await shot('three_cliff.png'); }
    // 3. THE SEA FLOOR, from just above the water looking down.
    const sea=await W.page.evaluate(`(()=>{ const S=__hc.shoreSpot(); if(!S||S.err) return null;
      const dx=(S.seaAt[0]-S.x), dz=(S.seaAt[1]-S.z), L=Math.hypot(dx,dz)||1;
      return {x:Math.round(S.x+dx/L*14), z:Math.round(S.z+dz/L*14), y:S.y}; })()`);
    console.log('sea '+JSON.stringify(sea));
    if(sea){ await aim(sea.x, sea.z, sea.y+6, sea.x+6, sea.y-6, sea.z+6); await shot('three_sea.png'); }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
