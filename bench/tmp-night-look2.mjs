// DUSK MUST STILL BE DUSK, AND THE SEA MUST STILL HAVE THE MOON ON IT. Frames only.
//   node bench/tmp-night-look2.mjs
import { openWorld, pin, shots, statMedian, CROP, fmt, sleep } from './lib/rig.mjs';
(async()=>{
  const W = await openWorld({ rd:8, w:900, h:520 }); const P=W.page;
  try{
    for(const [tag,x,z,pitch,hours] of [['open',281,23,-0.18,[0.42,0.50,0.55,0.62]],
                                        ['shore',263,17,-0.12,[0.75]]]){
      const gy = await P.evaluate(`__hc.groundY(${x},${z})`);
      await P.evaluate(`__hc.tp(${x}, ${gy+1.7}, ${z}, 0, ${pitch})`); await sleep(1500);
      for(const h of hours){
        await pin(W,h);
        const f = await shots(W, `look2-${tag}-${String(h).replace('.','')}`, h, 3);
        const day = await P.evaluate(`__hc.st().day`);
        console.log(`  ${tag} h${h} day${day}  ground ${fmt(statMedian(f,CROP.ground))}`);
      }
    }
  } finally { await W.close(); }
})();
