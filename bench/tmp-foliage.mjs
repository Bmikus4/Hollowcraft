// SCRATCH. Did the ground-foliage tiles reach the atlas, and what does a meadow look like now?
import { openWorld, sleep, OUT, pin } from './lib/rig.mjs';
import path from 'node:path';
const WANT=['grass_tall','grass_meadow','grass_meadow_tall','fern','bush','vine','mush_red','mush_brown','foxglove',
  'anemone','bellflower','sage','yarrow','bloodroot','berry','sapling','sunflower_stem','sunflower_head','sunflower_wild',
  'tree_flower','pale_bloom'];
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await pin(W,0.25);
    const st=await W.page.evaluate('__hc.stamped()');
    const got=new Set(st.list||[]);
    const missing=WANT.filter(n=>!got.has(n));
    console.log('stamped '+st.got+' of '+st.want+' wanted;  foliage landed '+(WANT.length-missing.length)+'/'+WANT.length+';  all missing: '+JSON.stringify(st.missing));
    if(missing.length) console.log('MISSING: '+missing.join(' '));
    // A GRASS SHELF IN OPEN SKY, and the reason is framing: every open flat near spawn is under a canopy, and three
    // attempts at a ground shot photographed leaves. Up here nothing stands between the camera and the plants.
    const names=['tallgrass','meadow_grass','meadow_grass_tall','fern','bush','mush_red','mush_brown','foxglove','anemone','bellflower','sage','yarrow','bloodroot','berry','sapling','vine','sunflower_wild','tree_flower','pale_bloom'];
    const built=await W.page.evaluate(`(()=>{ const s=__hc.st(), px=Math.round(s.px), pz=Math.round(s.pz), y=110, N=${JSON.stringify(names)};
      __hc.waterSim(false);
      for(let i=-2;i<N.length*2+2;i++) for(let b=-3;b<=3;b++) __hc.setBlk(px+6+i, y, pz+b, __hc.bid('grass'));
      const placed=[];
      for(let i=0;i<N.length;i++){ const id=__hc.bid(N[i]);
        if(id!=null){ __hc.setBlk(px+6+i*2, y+1, pz, id); placed.push(N[i]+'@'+(px+6+i*2)+':'+__hc.mineState(px+6+i*2,y+1,pz).block); } }
      __hc.tpExact(px+6+(N.length), pz-9.5, y+2.4);
      return {px, pz, y, placed}; })()`);
    console.log('planted '+built.placed.join(' '));
    await sleep(300);
    await W.page.evaluate('__hc.look('+(built.px+6+names.length)+', '+(built.y+1.5)+', '+built.pz+')');
    for(let i=0;i<12;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(300); }
    await sleep(5000);
    await W.page.screenshot({path:path.join(OUT,'foliage_row.png')});
    console.log('sky at the shelf '+JSON.stringify(await W.page.evaluate('__hc.st().day')));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
