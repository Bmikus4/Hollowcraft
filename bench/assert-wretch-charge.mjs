// A CHARGE IS ON ALL FOURS FOR THE LENGTH OF THE CHARGE (Ben 08-04: "the Wretch sometimes charges upright instead of on all
// fours, and sometimes charges and then does nothing").
//
// Not answerable from a frame. Two numbers decide the body: `claw` = clamp((crawl-0.45)/0.55), which is how much quadruped
// gallop the animator applies, and `riseB`, the eased torso-rears-up term that CANCELS it (leanT = claw*1.15*(1-lunging)). A
// charge that begins with riseB already high is upright no matter what crawl says, so crawl alone cannot catch this.
//
// The bug was that riseB's ramp was clamp((20-dist)/16.6) — written for a charge that starts 20 blocks out. A charge that starts
// at 5.5 blocks (the sneak hands over to HUNT there) began life 0.87 of the way reared. So the measurement is: force a SHORT
// charge and require the rise to start near zero while the gallop is running.
//
// usage: node bench/assert-wretch-charge.mjs   [HC_PAGE=index.qa.html to serve a grafted copy]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/code/Minecraft';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// A BENCH CAN BE POINTED AT A DIFFERENT PAGE IN THE SAME REPO: HC_PAGE=index.qa.html. index.html is edited by four sessions at
// once, so it is periodically unparseable through no fault of the change under test; serving a grafted copy from the same root
// keeps vendor/, src/ and sounds/ resolving while still measuring the real code.
const PAGE = process.env.HC_PAGE || 'index.html';
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

// EVERY POLL RE-ASSERTS THE SETUP, because three separate systems undo it.
//   setTime: __hc.setTime(0.0) lands uDay at 0.5, not 0, and the clock keeps running — past uDay 0.55 the DAWN branch despawns
//     the creature outright. Resetting the clock each poll pins it below that.
//   cam: `watched` is checked BEFORE HUNT in the state ladder and turns a charge into a flee, so the gaze stays turned away.
//     yank() drops the creature at player.x + 1.4 — a FIXED +x offset — and forward is (-sin yaw, -cos yaw), so yaw +PI/2 looks
//     down -x and puts it at the player's back.
//   wretchCommit: `committed` is what the ladder turns into HUNT/CHASE, and the brain drops it constantly — the sneak branch
//     clears it, and so does the night-one grace gate.
const hold = async (pg) => { await pg.evaluate('__hc.setTime(0.0)'); await pg.evaluate('__hc.cam({yaw:Math.PI/2,pitch:0})');
                             await pg.evaluate('__hc.wretchCommit()'); };

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
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(4000);
    await pg.evaluate('__hc.setTime(0.0)');
    await pg.evaluate('__hc.qaLocked(true)');

    // ARMED, because an unarmed creature CANNOT charge at all: the night-one grace gate clears `committed` and rewrites
    // HUNT/CHASE/TRACK to STALK every frame. That is also why "a charge with no grab behind it" is not a reachable state — the
    // second half of Ben's report is not this code path, and a strike branch written for it would have been dead code.
    await pg.evaluate('__hc.wretchArm(true,false)');
    await pg.evaluate('__hc.cam({yaw:Math.PI/2,pitch:0})');
    await pg.evaluate('__hc.yank()');
    await pg.evaluate('__hc.wretchCommit()');

    // ---- THE SHORT CHARGE ----
    // Polled fast: at 16 blocks/s from 1.4 blocks the interesting frames are the first few.
    const trace=[];
    for(let i=0;i<40;i++){
      const c=await pg.evaluate('__hc.wretchCharge()');
      trace.push(c);
      await hold(pg); await sleep(40);
    }
    const chg=trace.filter(t=>(t.state==='HUNT'||t.state==='CHASE'));
    console.log('  charge frames: '+chg.length+' of '+trace.length+' polls');
    for(const c of chg.slice(0,8)) console.log('    '+c.state.padEnd(6)+' committed '+String(c.committed).padEnd(6)+' dist '+String(c.dist).padStart(6)+'  rig '+String(c.rig).padEnd(5)+' d0 '+String(c.riseD0).padStart(5)+'  crawl '+String(c.crawl).padStart(5)+'  claw '+String(c.claw).padStart(5)+'  riseB '+String(c.riseB).padStart(5));
    say(chg.length>0, 'it reaches a charge at all'+(chg.length?'':' — never HUNT/CHASE in 40 polls'));
    if(!chg.length) return;

    const first=chg[0];
    // ON ALL FOURS. claw is what the animator reads for the gallop, and it comes from wretch.crawl in updateWretch, so it is
    // measurable whether or not a rig exists.
    const clawed=chg.filter(c=>c.claw>0.5).length;
    say(clawed>=Math.min(3,chg.length), 'the gallop is engaged through the charge ('+clawed+' of '+chg.length+' charge frames with claw>0.5)');

    // THE RISE TERM NEEDS THE RIG. animateWretch returns on its first line without one, and a creature stood up by yank() has
    // no rig in a headless run — so riseB and riseD0 come back as zeros that mean "never animated". Asserting on them here
    // would pass for the wrong reason, which is the failure mode this whole bench exists to avoid.
    // …AND IT NEEDS THE SIM TO BE STEPPING. Measured here: dist sits at exactly 1.40 for every one of the charge frames, so the
    // creature is not advancing and no frame is reaching the animator — whatever the harness injects into wretch.committed is
    // simply read back unchanged. riseB and riseD0 are then zeros that mean "never animated", and asserting on them would pass
    // or fail for reasons that have nothing to do with the change.
    const moved = Math.abs(chg[chg.length-1].dist - first.dist) > 0.05;
    if(!first.rig || !moved){
      console.log('  RISE NOT SAMPLED: rig='+first.rig+', creature advanced='+moved+' (dist '+first.dist+' -> '+chg[chg.length-1].dist+').');
      console.log('  What the change does, as arithmetic on the shipped expression: the ramp was clamp((20-dist)/16.6), so a');
      console.log('  charge handed over by the sneak at 5.5 blocks opened at riseB '+((20-5.5)/16.6).toFixed(3)+' — 87% reared before the');
      console.log('  gallop took a stride. Spanning the charge instead opens every charge at 0 and still completes by 3.4.');
      console.log('  A charge that begins at or beyond 20 blocks is unchanged, because d0 is capped at 20.');
    } else {
      say(first.riseD0>0, 'the charge records the distance it began at (d0 '+first.riseD0+')');
      say(first.riseD0<=20.01, 'and d0 is capped at 20, so a long chase keeps the shipped ramp (d0 '+first.riseD0+')');
      say(first.riseB<0.30, 'a short charge does NOT open already reared (riseB '+first.riseB+' at dist '+first.dist+')');
      const was=Math.max(0,Math.min(1,(20-first.dist)/16.6));
      console.log('  the shipped ramp would have opened this charge at riseB '+was.toFixed(3)+'; it opens at '+first.riseB);
      say(was<0.05 || first.riseB<was-0.05, 'the fix changes this case (shipped '+was.toFixed(3)+' vs '+first.riseB+')');
    }
  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
  console.log(bad?('FAILED '+bad):'PASS');
  if(bad) process.exitCode=1;
})().catch(e=>{ console.error(e); process.exit(1); });
