// SCRATCH BOOT PROBE. The additive pose stack: does every layer declare itself, and does a dial move only its own?
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await W.page.evaluate(`__hc.hold('chassis_rifle')`); await sleep(700);
    const show=async(tag)=>{ const r=await W.page.evaluate('__hc.pose()');
      console.log(tag.padEnd(14)+'active '+JSON.stringify(r.active));
      for(const k of r.active) console.log('     '+k.padEnd(8)+' pos '+JSON.stringify(r.layers[k].pos)+' rot '+JSON.stringify(r.layers[k].rot)+'  gain '+r.layers[k].gain);
      return r; };
    await show('idle');
    await W.page.evaluate('__hc.attOpen(true)'); await sleep(900); await show('attach open');
    await W.page.evaluate('__hc.attOpen(false)'); await sleep(700);
    await W.page.evaluate('__hc.proneSet(true)'); await sleep(1600); await show('prone (bipod)');
    console.log('--- dial the bipod layer to 0 ---');
    await W.page.evaluate('__hc.pose({gain:{bipod:0}})'); await sleep(500); await show('bipod gain 0');
    await W.page.evaluate('__hc.pose({reset:1})'); await W.page.evaluate('__hc.proneSet(false)');
    console.log('known layers '+JSON.stringify((await W.page.evaluate('__hc.pose()')).known));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
