// SCRATCH BOOT PROBE. The 52: did every mapped tile reach the atlas, and do the blocks look like their materials?
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
const SHOW=['bricks','stone_bricks','slate','granite','marble','dark_planks','parquet','copper_sheet',
            'verdigris_copper','tar','bone_block','carpet_red','tiles_white','asphalt','root_mass','crate_side'];
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(2500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1200);
    const st=await W.page.evaluate('__hc.stamped()');
    console.log('want '+st.want+'  got '+st.got+'  missing '+JSON.stringify(st.missing));
    await W.page.evaluate('__hc.lock(true)');
    // A wall of them, two rows of eight, three blocks in front of the eye.
    const r=await W.page.evaluate(`(function(){ const ids=${JSON.stringify(SHOW)}; const out=[];
      for(let i=0;i<ids.length;i++){ const c=i%8, r=(i/8)|0;
        const res=__hc.setBlkRel(c-4, 1-r, -4, ids[i]); out.push(ids[i]+':'+res); }
      return out; })()`);
    console.log(r.join(' '));
    await sleep(900);
    await W.page.screenshot({path:path.join(OUT,'blocks52.png')});
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
