// THREE BODIES, MEASURED AS RATIOS. Ben asked for models and textures of their own, in the same family as the Wretch, and
// "they look different" is exactly the claim a screenshot appears to answer and does not: the world does not render in this
// harness, and even when it does, three creatures at three distances in three light levels say nothing about proportion.
//
// So every assertion here is a ratio taken off the live bones, which is pose-independent and camera-independent:
//   Tenant   — tallest, longest limbed, smallest head relative to its height. It has to be too tall for the room.
//   Burrower — the highest arm-over-leg of the three. Its body is a digging tool: long arms, short legs.
//   Meek     — the largest head relative to its height. Neoteny is what reads as harmless, and harmless is the point.
// And one that is not about any single creature: no two of them may share a material, which is invisible in the geometry and
// would make every number above meaningless.
//
// The three are priced TOGETHER at the end, with a full population alive, because that is the only honest way to ask what
// three creatures cost.
//
//   node bench/assert-kind-bodies.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
(async()=>{
  const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null, bad=0;
  const say=(ok,msg)=>{ console.log((ok?'ok   ':'FAIL ')+msg); if(!ok) bad++; };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/index.html?debug=1&rd=10&perf=1',{waitUntil:'load',timeout:90000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(3500); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.75)');

    const cost0=await ev('__hc.kindCost()');
    console.log('  before any of them exist: '+JSON.stringify(cost0));

    // All three alive at once, which is also the state they are priced in.
    await ev('__hc.burrower(20)');
    await ev('__hc.meek(4)');
    await ev('__hc.tenBox()'); await sleep(1000); await ev('__hc.tenant(true)');
    await sleep(1200);

    const B=await ev("__hc.kindShape('burrower')");
    const M=await ev("__hc.kindShape('meek')");
    const T=await ev("__hc.kindShape('tenant')");
    for(const [n,r] of [['burrower',B],['meek',M],['tenant',T]]) console.log('  '+n.padEnd(9)+' '+JSON.stringify(r));
    if(B.err||M.err||T.err){ say(false,'all three are alive to be measured'); throw new Error('missing creature'); }

    // ABSOLUTES FIRST. Every assertion in the first version of this file was a ratio, and ratios passed with a creature 8.5
    // blocks wide whose arms were longer than its whole body. A player is about 1.8 blocks and the Wretch about 4, so these
    // are the bounds inside which a thing is a creature rather than a landmark.
    for(const [n,r] of [['burrower',B],['meek',M],['tenant',T]]){
      say(r.height>1.0 && r.height<7.0, n+' is creature-sized rather than architecture ('+r.height+' blocks tall)');
      // SPAN, NOT "TALLER THAN WIDE". The first form of this rule was a rule about bipeds, and the Burrower is deliberately
      // not one — it is low and long-armed because it digs, and a badger is wider than it is tall too. What actually matters
      // is that nothing sprawls: no creature may span more than half again its own height in any direction.
      const span=Math.max(r.width,r.depth);
      say(span<r.height*1.6, n+' does not sprawl (spans '+span.toFixed(2)+' against '+r.height+' tall)');
      say(r.armLen<r.height, n+'’s arms are shorter than it is tall ('+r.armLen+' against '+r.height+')'); }

    say(T.height>M.height*1.8, 'the Tenant towers over the Meek ('+T.height+' against '+M.height+' blocks)');
    say(T.height>B.height*1.25, 'and stands taller than the Burrower ('+T.height+' against '+B.height+')');
    say(B.armOverLeg>T.armOverLeg*1.4 && B.armOverLeg>M.armOverLeg*1.4,
        'the Burrower is arms where the others are legs (arm/leg '+B.armOverLeg+' against '+T.armOverLeg+' and '+M.armOverLeg+')');
    say(M.headOverHeight>T.headOverHeight*1.4, 'the Meek is head-heavy the way a young animal is ('+M.headOverHeight+' of its height against the Tenant\u2019s '+T.headOverHeight+')');
    say(T.headOverHeight<B.headOverHeight && T.headOverHeight<M.headOverHeight,
        'and the Tenant has the smallest head of the three, which is what makes the body read as bigger than it is ('+T.headOverHeight+')');

    // MATERIALS. Three creatures sharing one material is invisible in every number above.
    const ids=[B.matId,M.matId,T.matId];
    console.log('  materials '+JSON.stringify(ids)+'  gloss '+JSON.stringify([B.shininess,M.shininess,T.shininess]));
    say(new Set(ids).size===3 && ids.every(x=>x!=null), 'each of them wears a material of its own ('+ids.join(', ')+')');
    say(T.shininess<B.shininess && B.shininess<M.shininess, 'and they are dry, damp and wet in that order (Tenant '+T.shininess+', Burrower '+B.shininess+', Meek '+M.shininess+')');

    // PRICED TOGETHER, with everything alive.
    const cost1=await ev('__hc.kindCost()');
    const prof=await ev('__hc.frameProf(240)');
    console.log('  with all of them alive: '+JSON.stringify(cost1));
    console.log('  creature system '+(prof.ms&&prof.ms.wretch)+' ms/frame over '+prof.frames+' frames');
    say(cost1.programs-cost0.programs<=4, 'three bodies and three texture sets cost at most four shader programs ('+(cost1.programs-cost0.programs)+')');
    say((prof.ms&&prof.ms.wretch||0)<1.5, 'and the whole population runs the creature system under 1.5 ms a frame ('+(prof.ms&&prof.ms.wretch)+')');
    say(cost1.lightSlots>0, 'with the light pool still whole ('+cost1.lightSlots+' slots)');
  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
  console.log(bad?('FAILED '+bad):'PASS');
  process.exit(bad?1:0);
})();
