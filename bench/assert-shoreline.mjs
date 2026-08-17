// THE WATER MEETS THE SHORE (Ben 08-17: "the shoreline needs receded by 14 blocksish, it should contact the shore and
// have no gaps in its corners").
// A column at EXACTLY sea level is dry land: water is only written above the ground, so its top face is level with the
// sea and a run of them is a sand pan lying between the water and the beach. That pan is the gap, and on the bay at
// spawn one traverse crossed sixteen unbroken blocks of it. _coastApron floods it (see the generator).
// Everything here is read at GENERATOR level through __hc.coastCensus, which calls surfaceH: __hc.coast(false) drops the
// height caches, so the A/B answers without regenerating a world, and it is the same read that would site a structure.
//   1. the pan is mostly gone, and what is left is not against the water
//   2. NO DRY CORNER NOTCH off a river -- a column at sea level with water only on the DIAGONAL, which is what an
//      orthogonal-only neighbour test leaves in every bend of a shoreline. River banks are excluded on purpose: the
//      rule declines channels so a 14-block reach cannot widen one into a lake.
//   3. no new DRY step of two -- ec6cf76's "cliff under the grass" must not come back. A seabed one block under the
//      water beside a beach one block over it is the same arithmetic and is a bank, so the census counts them apart.
//   4. inland flats at SEA+1 are still left alone, which is the other half of what ec6cf76 got wrong
//   5. the traverse across the waterline holds no run of dry sea-level columns, and the water came in by 8..24 blocks
// node bench/assert-shoreline.mjs
import { openWorld, sleep } from './lib/rig.mjs';

(async()=>{ const W=await openWorld({rd:10});
  let pass=0, fail=0;
  const ok=(c,msg)=>{ if(c){pass++; console.log('  ok   '+msg);} else {fail++; console.log('  FAIL '+msg);} };
  try{ await sleep(2000);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    const shore=await W.page.evaluate('__hc.shoreSpot()');
    console.log('shore '+JSON.stringify(shore));
    if(shore.err) throw new Error(shore.err);
    // The traverse: surface heights from 6 blocks inland to 34 out, along the bearing from the stand point to the water.
    const cross=`(()=>{ const S=${JSON.stringify(shore)};
      const dx=(S.seaAt[0]-S.x), dz=(S.seaAt[1]-S.z), L=Math.hypot(dx,dz)||1, ux=dx/L, uz=dz/L; const r=[];
      for(let t=-6;t<=34;t++) r.push(__hc.surfH(Math.round(S.x+ux*t), Math.round(S.z+uz*t)));
      return r; })()`;
    const runOfDry=(rows,sea)=>{ let best=0,run=0; for(const h of rows){ if(h===sea){ if(++run>best)best=run; } else run=0; } return best; };

    await W.page.evaluate('__hc.coast(false)');
    const A=await W.page.evaluate('__hc.coastCensus(120,1)'), Ac=await W.page.evaluate(cross);
    await W.page.evaluate('__hc.coast(true)');
    const B=await W.page.evaluate('__hc.coastCensus(120,1)'), Bc=await W.page.evaluate(cross);
    console.log('OFF '+JSON.stringify(A)+'\n    '+Ac.join(','));
    console.log('ON  '+JSON.stringify(B)+'\n    '+Bc.join(','));
    const sea=B.sea;

    ok(B.drySeaLevel < A.drySeaLevel*0.4, 'the pan is flooded: dry sea-level columns '+A.drySeaLevel+' -> '+B.drySeaLevel);
    ok(B.dryTouchingWater < A.dryTouchingWater, 'less dry land left standing against the water ('+A.dryTouchingWater+' -> '+B.dryTouchingWater+')');
    // EVERY remaining notch has a reason the rule states: it is a river bank (channels are declined so a 14-block reach
    // cannot widen one) or it is water ringed by land on 8 of 12 bearings, which is a pond and not the coast.
    const interior=c=>c.cornerNotches-c.cornerNotchesOnRiver-c.cornerNotchesRingedByLand-c.cornerNotchesOnShore;
    ok(B.cornerNotchesOnShore===0 && interior(B)===0,
       'every corner is closed: '+B.cornerNotchesOnShore+' where land meets water, '+interior(B)+
       ' at the inner limit of a pan (was '+A.cornerNotchesOnShore+' and '+interior(A)+'), leaving '+
       B.cornerNotches+' notches of which '+B.cornerNotchesOnRiver+' are river bank the rule declines on purpose');
    ok(B.dryStepsOf2Plus <= A.dryStepsOf2Plus, 'no new dry step of two ('+A.dryStepsOf2Plus+' -> '+B.dryStepsOf2Plus+
       ', of which submerged banks '+(B.adjacentStepsOf2Plus-B.dryStepsOf2Plus)+')');
    ok(B.inlandFlatsLeftAlone === A.inlandFlatsLeftAlone, 'inland flats at SEA+1 untouched ('+B.inlandFlatsLeftAlone+')');
    const rA=runOfDry(Ac,sea), rB=runOfDry(Bc,sea);
    ok(rB<=2, 'no run of dry sea-level columns across the waterline (longest run '+rA+' -> '+rB+')');
    const moved=Ac.filter((h,i)=>h===sea && Bc[i]<sea).length;
    ok(moved>=8 && moved<=24, 'the water came in by '+moved+' blocks along this traverse (Ben asked for 14ish)');
    ok(W.errors.length===0, 'no page errors ('+(W.errors[0]||'')+')');
    console.log('\n'+pass+' ok, '+fail+' failed');
    process.exitCode = fail?1:0;
  } finally { await W.close(); } })();
