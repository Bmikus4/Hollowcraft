// SHE IS GONE (Ben 08-17: "remove the foxgirl from the game entirely ... Load a world and confirm nothing references
// her"). This is the check that a grep cannot make: a booted world with every route to her tried.
//   1. the module loads and the world starts with no page error -- a dangling import or a missing asset shows here
//   2. /foxgirl is an unknown command, and /spawn foxgirl is refused by the command table's own nearest-match
//   3. neither she nor the rig built for her is in ANIMALS, in the spawn list, or on the QA surface
//   4. the GIANTESS still spawns, because she was built from a different asset by a different reader and the first
//      removal's note wrongly recorded that the two shared a file
// node bench/assert-no-foxgirl.mjs
import { openWorld, sleep } from './lib/rig.mjs';

(async()=>{ const W=await openWorld({rd:8});
  let pass=0, fail=0;
  const ok=(c,msg)=>{ if(c){pass++; console.log('  ok   '+msg);} else {fail++; console.log('  FAIL '+msg);} };
  const say=r=>String((r&&r.out&&r.out.join(' '))||r||'');
  try{ await sleep(2500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    ok(await W.page.evaluate('__hc.st().started===true'), 'the world booted');

    const fx=say(await W.page.evaluate("__hc.cmdRun('/foxgirl')"));
    console.log('/foxgirl -> '+fx);
    ok(/unknown command/i.test(fx), '/foxgirl is not a command');

    const sp=say(await W.page.evaluate("__hc.cmdRun('/spawn foxgirl')"));
    console.log('/spawn foxgirl -> '+sp);
    ok(/no such creature/.test(sp), '/spawn does not know her');

    const list=say(await W.page.evaluate("__hc.cmdRun('/spawn')"));
    ok(!/foxgirl/.test(list), '/spawn does not list her');

    const probes=await W.page.evaluate(`(()=>({ foxgirl:typeof __hc.foxgirl, human:typeof __hc.human,
      humanGone:typeof __hc.humanGone, foxgirlPose:typeof __hc.foxgirlPose }))()`);
    console.log('probes '+JSON.stringify(probes));
    ok(Object.values(probes).every(v=>v==='undefined'), 'no probe of hers is on the QA surface');

    // HER NAME, NOT THE STEM: `foxglove` is a flower and `fox` is an animal, and both are supposed to be here.
    const inWorld=await W.page.evaluate(`(()=>{ const ids=__hc.bid()||[];
      return { blockNamed:ids.filter(n=>/foxgirl/i.test(n)) }; })()`);
    ok(inWorld.blockNamed.length===0, 'no block id carries her name ('+JSON.stringify(inWorld.blockNamed)+')');

    // and the asset is gone from disk, which is the half a booted world cannot see on its own
    const res=await W.page.evaluate(`(async()=>{ try{ const r=await fetch('assets/characters/foxgirl.glb'); return r.status; }catch(e){ return 'err'; } })()`);
    console.log('assets/characters/foxgirl.glb -> HTTP '+res);
    ok(res===404, 'her asset is not on disk (HTTP '+res+')');

    // THE GIANTESS IS UNAFFECTED. She is the reason the first removal stopped short of the file.
    const g=say(await W.page.evaluate("__hc.cmdRun('/spawn giantess')"));
    console.log('/spawn giantess -> '+g);
    ok(!/no such creature/.test(g), '/spawn giantess still works');

    ok(W.errors.length===0, 'no page errors ('+(W.errors[0]||'')+')');
    console.log('\n'+pass+' ok, '+fail+' failed');
    process.exitCode = fail?1:0;
  } finally { await W.close(); } })();
