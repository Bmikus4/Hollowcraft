// THE FLAT WATER PLANES ON DRY GRASS (Ben, frame 212849: four unlit horizontal quads at ground level,
// "one white/pink blurry, two grey-blue speckled. Two different materials are in play").
// Photographs the same ground with the puddle mesh on and off, and lists every horizontal quad in the
// scene near the player with the material that draws it -- a count says they are there, the list says
// what emits them.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2000);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');
    console.log('puddles '+JSON.stringify(await ev('__hc.puddles()')));
    console.log('stray   '+JSON.stringify(await ev('__hc.strayWater(4000)')));
    // AND AFTER RAIN, because a puddle dries over seventy seconds and his frame is of dry grass.
    await ev('__hc.rain? __hc.rain(1) : (weather.raining=true)').catch(()=>{});
    await sleep(6000);
    console.log('wet     '+JSON.stringify(await ev('__hc.puddles()')));
    // A PUDDLE HAS TO EXIST BEFORE IT CAN BE THE FAULT. The site scan only runs when the player has moved,
    // and spawn has no flat low ground, so it reported zero sites all through the first pass.
    const P=await ev('__hc.probe()');
    for(let d=20; d<=200; d+=20){
      await ev('__hc.tp('+(P.x+d)+','+P.z+')');
      for(let k=0;k<6;k++){ await ev('typeof streamChunks==="function"&&streamChunks(160,160)').catch(()=>{}); await sleep(400); }
      const q=await ev('__hc.puddles()');
      if(q.sites>0){ console.log('sites at +'+d+'  '+JSON.stringify(q)); break; }
      if(d===200) console.log('no puddle site within 200 blocks east: '+JSON.stringify(q)); }
    await sleep(20000);
    console.log('after20 '+JSON.stringify(await ev('__hc.puddles()')));
    // HOW MUCH OF THE OLD DISC WAS NOT AT THE WATER'S OWN LEVEL. r = 0.5 + 1.6*fill, so a full puddle was a
    // 4.2-block sheet; every cell in it whose surface is not the site's surface was a plane hanging over grass.
    console.log('overhang '+JSON.stringify(await ev(`(()=>{ const q=__hc.puddles(); let cells=0, over=0;
      for(const p of q.at){ const r=0.5+1.6*p.fill, ri=Math.ceil(r);
        for(let cz=-ri;cz<=ri;cz++) for(let cx=-ri;cx<=ri;cx++){
          if(Math.hypot(cx,cz)>r) continue; cells++;
          if(Math.floor(__hc.surfH(p.x+cx,p.z+cz))+1 !== p.y) over++; } }
      return { sitesSampled:q.at.length, cellsInOldDisc:cells, notAtWaterLevel:over,
               pct:cells? +(100*over/cells).toFixed(1):0, quadsNow:q.drawn }; })()`)));
    await ev('__hc.rain? __hc.rain(0) : null').catch(()=>{});
    await ev('(typeof weather!=="undefined") && (weather.raining=false, weather.rain=0, weather.rainTgt=0, weather.overcast=0, weather.fog=0, weather.fogTgt=0)').catch(()=>{});
    await ev('__hc.setTime(0.30)'); await sleep(1500);
    await ev('__hc.cam({pitch:-0.55})'); await sleep(800);
    await W.page.screenshot({path:path.join(OUT,'puddles.png')});
  } finally { await W.close(); } })();
