// THE POSE INVARIANT, COUNTED BY THE ENGINE. Ben, 08-16: "the wretch is still running at the player without being in his animation,
// this needs to be fixed once and for all".
//
// WHY THIS EXISTS ALONGSIDE assert-wretch-run-on-fours. That bench is green and has been green while the bug was live, which makes it
// the more interesting failure of the two. It samples from OUTSIDE, over a chase it drives itself: it forces `committed` every poll
// and reads __hc.wretchCharge(). So it can only ever see the commit branch — the one branch both previous fixes had already patched
// — and it reads _advRate, a field eleven branches assign by hand. Every path that returns early out of updateWretch (the drag, the
// grab scenes, the intimidation run, the vignettes, the crypt descent, the lurk, the boss, every co-op guest) is invisible to it, and
// so is any branch that sprints while declaring an advance rate of zero. A green light from it means "the branch we already fixed is
// still fixed", not "the creature never runs upright".
//
// SO THE COUNTING MOVED INTO THE ENGINE. placeWretch is the one function every path calls; it measures real displacement and
// increments a violation counter on any frame the creature is travelling faster than a walk in a standing pose for longer than the
// dive grace. This bench's job is no longer to catch the bug itself — it cannot see more branches than it drives, and that was the
// flaw — it is to (a) prove the counter is wired to something, and (b) drive as much of the creature's life as a harness can reach
// and read the counter afterwards. Anything it did not think to drive is still counted, in play, by the engine.
//
//   node bench/assert-wretch-pose-invariant.mjs   [HC_PAGE=index.qa.html]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const PAGE = process.env.HC_PAGE || 'index.html';
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
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/'+PAGE+'?debug=1&rd=10',{waitUntil:'load',timeout:90000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(3500);
    await pg.evaluate('__hc.qaLocked(true)');
    await pg.evaluate('__hc.wretchArm(true,true)');
    const ev=s=>pg.evaluate(s);

    // Drive a charge the harness can rely on covering ground: 22 blocks out, gaze away (being watched outranks HUNT and turns the
    // charge into a flee), re-commit every poll because the sneak branch and the grace gate both clear it.
    const charge=async(polls)=>{ await ev('__hc.setTime(0.0)'); await ev('__hc.wretchAt(22)'); await ev('__hc.cam({yaw:Math.PI/2,pitch:0})');
      let maxMv=0;
      for(let i=0;i<polls;i++){ await ev('__hc.setTime(0.0)'); await ev('__hc.wretchCommit()');
        const a=await ev('__hc.wretchAudit()'); if(a && a.mv>maxMv) maxMv=a.mv; await sleep(60); }
      return maxMv; };

    // 1. NEGATIVE CONTROL, FIRST, because every later assertion is worthless until this one has fired. wretchAudit(_,true) withholds
    //    the correction and holds the body upright — exactly what a future branch that sprints and forgets the posture would do.
    await ev('__hc.wretchAudit(true,true)');
    const ctlMv=await charge(30);
    const ctl=await ev('__hc.wretchAudit()');
    await ev('__hc.wretchAudit(false,false)');
    console.log('  control: peak measured speed '+ctlMv+' blocks/s, violations '+ctl.n);
    say(ctlMv>5, 'the harness makes the creature genuinely run ('+ctlMv+' blocks/s measured, not commanded)');
    say(ctl.n>0, 'the detector fires when the pose is withheld ('+ctl.n+' violations) — without this, zero below means nothing');
    if(ctl.samples&&ctl.samples.length) console.log('    e.g. '+JSON.stringify(ctl.samples[ctl.samples.length-1]));

    // 2. THE REAL RUN. Reset once, then put the creature through every branch a harness can reach, and read the counter at the end.
    await ev('__hc.wretchAudit(true,false)');
    const legs=[];
    const leg=async(name,fn)=>{ const b4=(await ev('__hc.wretchAudit()')).n; await fn(); const a=await ev('__hc.wretchAudit()');
      legs.push({name, n:a.n-b4}); console.log('  '+name.padEnd(26)+' violations '+(a.n-b4)); };

    await leg('committed charge', ()=>charge(45));

    // Free hunt: armed and near, but NOTHING forced. The state ladder picks its own branch each frame — TRACK, CHASE, STALK, the
    // unwedge, a routed leg around a tree — which is the half of the creature's life the older bench never touches.
    await leg('free hunt, unforced', async()=>{ await ev('__hc.setTime(0.0)'); await ev('__hc.wretchAt(26)'); await ev('__hc.cam({yaw:Math.PI/2,pitch:0})');
      for(let i=0;i<60;i++){ await ev('__hc.setTime(0.0)'); await sleep(70); } });

    // Flee: look straight at it while it is committed. `watched` outranks HUNT, and the flee branch is the fastest thing the
    // creature does — 19 blocks/s, 24 when routed — on a code path no charge test reaches.
    await leg('flee under gaze', async()=>{ await ev('__hc.setTime(0.0)'); await ev('__hc.wretchAt(10)'); await ev('__hc.wretchCommit()');
      for(let i=0;i<45;i++){ await ev('__hc.setTime(0.0)'); await ev('__hc.look()'); await sleep(70); } });

    // Close stalk: the band where the creature rises off all fours deliberately (crawl is driven DOWN by the sneak branch) while
    // still closing. This is the leg most likely to produce an honest failure, and it is the one the player sees most often.
    await leg('close stalk', async()=>{ await ev('__hc.setTime(0.0)'); await ev('__hc.wretchAt(14)'); await ev('__hc.cam({yaw:Math.PI/2,pitch:0})');
      for(let i=0;i<50;i++){ await ev('__hc.setTime(0.0)'); await sleep(70); } });

    const total=(await ev('__hc.wretchAudit()'));
    console.log('  total violations across '+legs.length+' legs: '+total.n);
    if(total.n) console.log('    '+JSON.stringify(total.samples,null,1));
    say(total.n===0, 'nothing travels faster than a walk in a standing pose ('+total.n+' frames past the 0.30s dive grace)');
  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
  console.log(bad?('FAILED '+bad):'PASS');
  process.exit(bad?1:0);
})();
