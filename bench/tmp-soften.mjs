// SCRATCH. Stone and sulfur, softened: did the tiles land, and what do they look like on a cliff and on a node?
import { openWorld, sleep, OUT, pin } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await pin(W,0.25);
    const st=await W.page.evaluate('__hc.stamped()');
    console.log('stamped '+st.got+'/'+st.want+'  missing '+JSON.stringify(st.missing)+
      '  stone:'+(st.list.indexOf('stone')>=0)+'  sulfur_ore:'+(st.list.indexOf('sulfur_ore')>=0));
    // A WALL OF STONE, built rather than hunted: the point is the texture, not the geology.
    const at=await W.page.evaluate(`(()=>{ const s=__hc.st(), px=Math.round(s.px), pz=Math.round(s.pz), y=110;
      __hc.waterSim(false);
      for(let a=-5;a<=5;a++) for(let b=0;b<6;b++) __hc.setBlk(px+9, y+b, pz+a, __hc.bid('stone'));
      // ON A FLOOR, not floating: sulfur_ore is a non-solid MODEL block and a write into open air does not stick.
      for(let a=-2;a<=2;a++) for(let b2=6;b2<=8;b2++) __hc.setBlk(px+b2, y, pz+a, __hc.bid('stone'));
      for(let a=-2;a<=2;a+=2) for(let b2=6;b2<=8;b2+=2) __hc.setBlk(px+b2, y+1, pz+a, __hc.bid('sulfur_ore'));
      __hc.tpExact(px+2.5, pz+0.5, y+2.2);
      return {px,pz,y, wall:__hc.mineState(px+9,y+2,pz).block, sulf:__hc.mineState(px+6,y+1,pz-2).block,
              ids:{stone:__hc.bid('stone'), sulfur:__hc.bid('sulfur_ore')}}; })()`);
    console.log('scene '+JSON.stringify(at));
    await sleep(300);
    await W.page.evaluate('__hc.look('+(at.px+7)+', '+(at.y+1.2)+', '+at.pz+')');
    for(let i=0;i<12;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(300); }
    await sleep(1500);
    await W.page.screenshot({path:path.join(OUT,'soften_wall.png')});
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
