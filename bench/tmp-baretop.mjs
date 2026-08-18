import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2000);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    const bg=await ev('__hc.buriedGrass()');
    console.log('bareTops '+bg.bareTops+' grown '+bg.grown);
    console.log('regrow   '+JSON.stringify(await ev('__hc.regrow()')));
    const bg2=await ev('__hc.buriedGrass()');
    console.log('after    bareTops '+bg2.bareTops+' grown '+bg2.grown);
    for(const s of bg.bareWhere.slice(0,6)){
      const d=await ev(`(()=>{ const x=${s.x}, z=${s.z}, y=${s.y};
        const col=[]; for(let yy=y-3; yy<=y+4; yy++){ const b=__hc.blockAt(x,yy,z); col.push(yy+':'+(b===0?'air':b)); }
        return { x, z, y, surfH:__hc.surfH(x,z), trail:__hc.trailAt? __hc.trailAt(x,z):null, col:col.join(' ') }; })()`);
      console.log('  '+JSON.stringify(d));
    }
  } finally { await W.close(); } })();
