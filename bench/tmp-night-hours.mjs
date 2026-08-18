// IS NIGHT BLACK AT EVERY NIGHT HOUR, OR ONLY AT MIDNIGHT? And WHERE is the night that is not black?
// One boot, one vantage per site, the whole night swept. Baked block light read at the crop first (7b7be34's rule).
//   node bench/tmp-night-hours.mjs
import { openWorld, pin, shots, statMedian, CROP, fmt, sleep } from './lib/rig.mjs';
const HOURS=[0.55,0.62,0.68,0.75,0.85,0.93];
(async()=>{
  const W = await openWorld({ rd:8, w:900, h:520 });
  const P = W.page;
  try{
    // sites found in the world rather than guessed: open grass with no baked light, and sand at the water's edge.
    const found = await P.evaluate(`(function(){
      const S=__hc.st(), out={grass:null, sand:null};
      const gid=__hc.bid('grass'), sid=__hc.bid('sand'), air=__hc.bid('air'), wid=__hc.bid('water');
      for(let r=24;r<=160 && (!out.grass||!out.sand);r+=8)
        for(let a=0;a<32;a++){
          const x=Math.round(S.sx+Math.cos(a/32*6.2832)*r), z=Math.round(S.sz+Math.sin(a/32*6.2832)*r);
          const gy=__hc.groundY(x,z); const b=__hc.blockAt(x,gy,z); const bl=__hc.blockLight(x,gy+1,z);
          if(!bl.chunk||bl.lit==null||bl.lit>0) continue;
          if(!out.grass && b===gid) out.grass={x,z,gy};
          if(!out.sand  && b===sid) out.sand={x,z,gy};
        }
      return out; })()`);
    console.log('  sites', JSON.stringify(found));
    const SITES=[{tag:'wood',x:280,z:12},
                 found.grass?{tag:'grass',x:found.grass.x,z:found.grass.z}:null,
                 found.sand ?{tag:'sand', x:found.sand.x, z:found.sand.z }:null].filter(Boolean);
    for(const s of SITES){
      const gy = await P.evaluate(`__hc.groundY(${s.x},${s.z})`);
      await P.evaluate(`__hc.tp(${s.x}, ${gy+1.7}, ${s.z}, 0, -0.12)`);
      await sleep(1500);
      const lit = await P.evaluate(`(function(){const a=__hc.blockLight(${s.x},${gy+1},${s.z}),b=__hc.blockLight(${s.x},${gy+1},${s.z-6});return a.lit+'/'+b.lit;})()`);
      console.log(`  --- ${s.tag} (${s.x},${s.z}) gy${gy} baked ${lit}`);
      for(const h of HOURS){
        await pin(W, h);
        const f = await shots(W, `nh-${s.tag}-${String(h).replace('.','')}`, h, 3);
        const g = statMedian(f, CROP.ground);
        const day = await P.evaluate(`__hc.st().day`);
        console.log(`    h${h} day${day}  ground ${fmt(g)}`);
      }
    }
  } finally { await W.close(); }
})();
