// SCRATCH. Ben: "Dig into a hillside, look at the exposed wall, and confirm you see grass only on the top and dirt on
// the sides." Cut a step into a slope and photograph the wall it leaves.
import { openWorld, sleep, OUT, pin } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await pin(W,0.25);
    const spot=await W.page.evaluate(`(()=>{ const S=__hc.st(), px=Math.round(S.px), pz=Math.round(S.pz);
      let best=null;
      for(let dz=-90;dz<=90;dz+=2) for(let dx=-90;dx<=90;dx+=2){
        const x=px+dx, z=pz+dz, h0=__hc.surfH(x,z), h1=__hc.surfH(x+8,z);
        if(!(h0>46 && h0<88)) continue; const d=h0-h1; if(d<2||d>8) continue;
        let grass=0; for(let a=0;a<8;a++) for(let b=-2;b<=2;b++){ const hh=__hc.surfH(x+a,z+b);
          if(__hc.mineState(x+a,hh,z+b).block===__hc.bid('grass')) grass++; }
        if(grass<30) continue;
        
        best={x,z,h:h0}; return best; }
      return best; })()`);
    console.log('slope '+JSON.stringify(spot));
    if(!spot){ console.log('no open slope'); return; }
    // A STEP CUT INTO THE HILL: 5 wide, 4 into the slope, 3 tall, so the back wall is a clean face of the hillside.
    await W.page.evaluate(`(()=>{ const S=${JSON.stringify(spot)};
      for(let a=0;a<5;a++) for(let b=-2;b<=2;b++){ const hh=__hc.surfH(S.x+a,S.z+b);
        for(let y=0;y<3;y++) __hc.setBlk(S.x+a, hh-y, S.z+b, 0); }
      return 1; })()`);
    for(let i=0;i<15;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(300); }
    await W.page.evaluate('__hc.tpExact('+(spot.x+2)+', '+spot.z+', '+(spot.h-1)+')');
    await sleep(350);
    await W.page.evaluate('__hc.look('+(spot.x+7)+', '+(spot.h-0.5)+', '+spot.z+')');
    await sleep(1600);
    await W.page.screenshot({path:path.join(OUT,'cut_wall.png')});
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
