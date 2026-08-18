// THE FOX GIRL IS BACK, ON HER OWN COMMAND ONLY, MOVING AS THE GIANTESS DOES (Ben 08-17: "add the foxgirl back but only
// on the /foxgirl command no /spawn command, and make her have the exact same animations as the giantess").
// Three claims, each of which has failed before in this file and none of which a screenshot settles:
//   1. /foxgirl puts her in the world with a real body -- not the fallback box, which is a pale slab and reads as a bug.
//   2. /spawn does NOT know her: not accepted, not listed, and not offered as a did-you-mean.
//   3. Her bones are driven by the giantess's own functions. The retarget is a MAP -- her 18 hand-named joints against
//      the giantess's 115 Rigify ones, of which exactly one name is shared -- so "the same animations" is a claim about
//      which bones actually move, sampled over time rather than asserted once.
// node bench/assert-foxgirl.mjs
import { openWorld, sleep } from './lib/rig.mjs';

(async()=>{ const W=await openWorld({rd:8});
  let pass=0, fail=0;
  const ok=(c,msg)=>{ if(c){pass++; console.log('  ok   '+msg);} else {fail++; console.log('  FAIL '+msg);} };
  try{ await sleep(2500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    // her model loads in the background; the command refuses until it is here, which is itself the behaviour under test
    let loaded=false;
    for(let i=0;i<30 && !loaded;i++){ loaded=await W.page.evaluate('__hc.human?!!__hc.human().loaded:true').catch(()=>false); if(!loaded) await sleep(500); }

    const spawn=await W.page.evaluate("__hc.cmdRun('/foxgirl 1 8')");
    console.log('/foxgirl -> '+JSON.stringify(spawn));
    await sleep(1200);
    const g=await W.page.evaluate('__hc.foxgirl()');
    console.log('foxgirl  '+JSON.stringify(g));
    ok(!g.err && g.present && g.alive, 'she is in the world alive ('+(g.err||'')+')');
    ok(g.meshes>1, 'she has a real body rather than the fallback box ('+g.meshes+' meshes)');
    ok(g.rig && g.mapped>=11, 'the giantess retarget took (spine, neck, head, legs; the arms are deliberately out, see FOX_BONE_MAP): '+g.mapped+' of her bones answer giantess names, '+g.bones+' bones in the skeleton');
    ok(Math.abs(g.footGap||0) < 0.2, 'her feet are on the ground (footGap '+g.footGap+')');

    // /spawn must not know her, by all three routes
    const say=r=>String((r&&r.out&&r.out.join(' '))||r||'');
    const s1=say(await W.page.evaluate("__hc.cmdRun('/spawn foxgirl')"));
    const s2=say(await W.page.evaluate("__hc.cmdRun('/spawn')"));
    console.log('/spawn foxgirl -> '+s1);
    ok(/no such creature/.test(String(s1)), '/spawn refuses her by name');
    // the reply necessarily REPEATS the name that was typed, so the test is on the suggestion half of it
    ok(!/did you mean:.*foxgirl/.test(s1), '/spawn does not offer her as a did-you-mean ("'+s1+'")');
    ok(!/foxgirl/.test(String(s2)), '/spawn does not list her');

    // THE POSE MOVES, and it moves through the giantess's own functions: sample the four bones her idle writes.
    const poses=[];
    for(let i=0;i<10;i++){ const f=await W.page.evaluate('__hc.foxgirl()'); if(f.pose) poses.push(f.pose); await sleep(320); }
    const moved=k=>{ const v=poses.map(p=>p[k]).filter(x=>x!=null); if(v.length<3) return 0;
      return +(Math.max(...v)-Math.min(...v)).toFixed(4); };
    const m={head:moved('head'), chest:moved('chest'), thighL:moved('thighL'), armL:moved('armL')};
    console.log('pose swing over 3s '+JSON.stringify(m));
    ok(m.head>0.0005 || m.chest>0.0005, 'she is animated: the idle moves her head or chest ('+JSON.stringify(m)+')');

    ok(W.errors.length===0, 'no page errors ('+(W.errors[0]||'')+')');
    console.log('\n'+pass+' ok, '+fail+' failed');
    process.exitCode = fail?1:0;
  } finally { await W.close(); } })();
