// The three things this session shipped without looking at them: the leaves and the well at NIGHT and in
// RAIN, and a structure's base photographed from outside it, which is where Ben saw the dirt apron.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)');
    const shot=async(tag)=>{ await sleep(1100); await W.page.screenshot({path:path.join(OUT,'closeout_'+tag+'.png')}); console.log('  shot '+tag); };
    const wet=async(on)=>{ await ev(`(typeof weather!=="undefined") && (weather.raining=${!!on}, weather.rain=${on?0.9:0}, weather.rainTgt=${on?0.9:0}, weather.overcast=${on?0.8:0})`).catch(()=>{}); };

    // ---- 1. A STRUCTURE'S BASE FROM OUTSIDE IT. Found by scanning for planks at the surface rather than by a
    // hand-picked coordinate, so the shot is of whatever the generator actually built.
    const V=await ev(`(()=>{ const P=__hc.probe(), PL=__hc.bid('planks'), LG=__hc.bid('log');
      let bx=0,bz=0,n=0;
      for(let dz=-140;dz<=140;dz+=3) for(let dx=-140;dx<=140;dx+=3){
        const x=Math.round(P.x+dx), z=Math.round(P.z+dz), h=__hc.surfH(x,z);
        for(let y=h;y<=h+4;y++){ const b=__hc.blockAt(x,y,z); if(b===PL||b===LG){ bx+=x; bz+=z; n++; break; } } }
      return n? {x:Math.round(bx/n), z:Math.round(bz/n), n} : null; })()`);
    console.log('  structures centre '+JSON.stringify(V));
    if(V){
      // stand back from it on the ground and look at the foot of the wall, which is the framing of his shot
      const spot=await ev(`(()=>{ const cx=${V.x}, cz=${V.z};
        for(let r=7;r<=16;r++) for(let k=0;k<12;k++){ const a=k*Math.PI/6, x=Math.round(cx+Math.cos(a)*r), z=Math.round(cz+Math.sin(a)*r), h=__hc.surfH(x,z);
          let clear=true; for(let y=h+1;y<=h+3;y++) if(__hc.blockAt(x,y,z)!==0){ clear=false; break; }
          if(clear) return {x,z,h}; }
        return null; })()`);
      console.log('  vantage '+JSON.stringify(spot));
      if(spot){
        await ev(`__hc.tpExact(${spot.x}, ${spot.z}, ${spot.h+2})`);
        for(let i=0;i<12;i++){ const f=await ev('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
        await ev('__hc.setTime(0.30)');
        await ev(`__hc.look(${V.x}, ${spot.h}, ${V.z})`);
        await shot('base_noon');
      }
    }
    console.log('  grass '+JSON.stringify(await ev('__hc.buriedGrass()')).slice(0,90));

    // ---- 2. THE WELL AT NIGHT AND IN RAIN
    const P=await ev('__hc.probe()');
    const wx=P.spawnX+14, wz=P.spawnZ+34, gy=await ev(`__hc.surfH(${wx},${wz})`);
    for(const [tag,t,rain] of [['well_night',0.85,0],['well_rain',0.30,1]]){
      await ev(`__hc.tpExact(${wx+4}, ${wz}, ${gy+3})`); await sleep(400);
      await ev(`__hc.setTime(${t})`); await wet(rain);
      await ev(`__hc.look(${wx}, ${gy+1}, ${wz})`);
      await shot(tag); }
    await wet(0);

    // ---- 3. THE LEAVES AT NIGHT AND IN RAIN, from the shore vantage that photographed the orange dots
    await ev(`__hc.tp(${P.x}, ${P.z})`);
    for(let i=0;i<12;i++){ const f=await ev('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    for(const [tag,t,rain] of [['leaves_night',0.85,0],['leaves_rain',0.30,1]]){
      await ev(`__hc.setTime(${t})`); await wet(rain);
      await ev('__hc.cam({yaw:'+(158*Math.PI/180).toFixed(4)+', pitch:0})');
      await sleep(1500);
      console.log('  leaves '+tag+' '+JSON.stringify(await ev('__hc.leaves()')).slice(0,70));
      await shot(tag); }
    await wet(0);
  } finally { await W.close(); } })();
