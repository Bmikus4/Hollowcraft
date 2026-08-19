import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6}); const p=W.page;
  try{ await sleep(2500);
    await p.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.45); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(800);
    const m=await p.evaluate('__hc.attMatrix()');
    const map={suppressor:'muzzle',foregrip:'grip',weapon_light:'light',laser_sight:'laser'};
    const rows=[];
    for(const r of m.rows){
      for(const a of Object.keys(map)){
        if(!r.fits[a]) continue;
        await p.evaluate(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${r.gun} 1"); __hc.hold(${JSON.stringify(r.gun)})`); await sleep(250);
        const q=await p.evaluate(`(()=>{ for(const s of __hc.attProbe().slots) __hc.attFit(s,null); __hc.attFit(${JSON.stringify(map[a])},${JSON.stringify(a)}); return __hc.attProbe(); })()`);
        const f=(q.fitted||[]).find(x=>x.id===a);
        rows.push({gun:r.gun,a,pos:f&&f.pos,size:f&&f.size,mz:q.muzzleZ,len:q.len,built:!!f});
      }
    }
    const bad=[];
    for(const r of rows){
      if(!r.built){ bad.push(r.gun+' + '+r.a+'  NO MODEL'); continue; }
      const [x,y,z]=r.pos;
      if(r.a==='suppressor'){
        if(z > r.mz+0.005) bad.push(`${r.gun} + can  sits BEHIND the muzzle  z=${z} muzzleZ=${r.mz}`);
        if(Math.abs(x)>0.01) bad.push(`${r.gun} + can  off the bore x=${x}`);
      }
      if(r.a==='foregrip'){
        if(z < r.mz) bad.push(`${r.gun} + grip  is past the muzzle  z=${z} muzzleZ=${r.mz}`);
        if(y>0) bad.push(`${r.gun} + grip  sits ABOVE the bore y=${y}`);
      }
      if(r.a==='weapon_light'||r.a==='laser_sight'){
        if(z < r.mz) bad.push(`${r.gun} + ${r.a}  past the muzzle z=${z} muzzleZ=${r.mz}`);
        if(x<=0) bad.push(`${r.gun} + ${r.a}  not on the right rail x=${x}`);
      }
    }
    console.log('--- '+rows.length+' fits measured ---');
    for(const b of bad) console.log('  '+b);
    console.log(bad.length+' faults');
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
