// DO THE PUDDLES EVER GO AWAY? Ben's frame 015525 shows dozens of one-block, grid-aligned water quads lying on dry
// grass in clear weather, blades poking through. Fill them, stop the rain, and watch `drawn` over a minute and a
// half -- the dry ramp is dt/70, so a puddle that is going to clear clears inside seventy seconds.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');
    const P=await ev('__hc.probe()');
    await ev(`__hc.tp(${P.x+20}, ${P.z})`);
    for(let i=0;i<12;i++){ const f=await ev('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const q=async()=>{ const r=await ev('__hc.puddles()'); return r; };
    console.log('  clear start  '+JSON.stringify(await q()).slice(0,96));
    await ev('__hc.rain(0.95)'); await sleep(22000);
    const r0=await q();
    console.log('  after rain   filled '+r0.filled+'  drawn '+r0.drawn+'  (drawn should now be ONE quad per filled site, not a cluster of block tiles)');
    // OVERHANG: how many cells of each drawn disc are not at the water's own level. The whole point of the shrink
    // is that this is zero without the puddle becoming a grid of tiles.
    console.log('  overhang     '+JSON.stringify(await ev(`(()=>{ const Q=__hc.puddles(); let cells=0, over=0;
      for(const p of Q.at){ if(!p.r) continue; const r=p.r, ri=Math.ceil(r);
        for(let cz=-ri;cz<=ri;cz++) for(let cx=-ri;cx<=ri;cx++){ if(Math.hypot(cx,cz)>r) continue; cells++;
          if(Math.floor(__hc.surfH(p.x+cx,p.z+cz))+1 !== p.y) over++; } }
      return { sampled:Q.at.length, drewNothing:Q.at.filter(p=>!p.r).length, cellsCovered:cells, notAtWaterLevel:over, radii:Q.at.map(p=>p.r) }; })()`)));
    await ev('__hc.rain(0)');
    for(const s of [5,15,30,45,60,75,90]){
      await sleep(s===5?5000:(s===15?10000:15000));
      const r=await q();
      console.log('  +'+String(s).padStart(2)+'s dry    raining '+r.raining+'  filled '+r.filled+'  drawn '+r.drawn+'  meanFill '+r.meanFill); }
  } finally { await W.close(); } })();
