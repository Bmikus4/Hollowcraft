// IF IT IS RUNNING AT YOU, IT IS ON ALL FOURS (Ben 08-05: "WRETCH STILL IS ABLE TO RUN AT ME WHILE STANDING UP. FIGURE OUT EXACTLY
// WHY AND FIX IT NO MISTAKES").
//
// WHY IT SURVIVED TWO FIXES. The gait is keyed off wretch.crawl — claw = clamp((crawl-0.45)/0.55) is what the animator reads for the
// quadruped gallop — and the creature's SPEED is written by a dozen unrelated branches: the commit branch, the sighted maze sprint, the
// sea-discipline dash to cover, the scarecrow detour, the vigil walk, the unwedge, the intimidate run, a routed nav leg. Two earlier
// passes set crawl inside the two branches that were guilty at the time. Any other branch that commands a sprint and forgets the posture
// reproduces the report exactly, and nothing stopped one from doing so.
//
// WHAT IS MEASURED. Not a commanded speed and not a state name — both lie. _advRate is the smoothed REAL ground covered per second, so
// this pairs "how fast is it actually moving" against "is the gallop engaged" on every sample of a real chase. The claim is a single
// invariant: no sample may be fast and upright at once.
//
//   node bench/assert-wretch-run-on-fours.mjs   [HC_PAGE=index.qa.html]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/code/Minecraft';
const PAGE = process.env.HC_PAGE || 'index.html';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

// RUN = the threshold the invariant uses. 5 blocks/s is faster than a man walks; the charge is 14-20 and the maze creep 4-9.
const RUN = 5.0;
// claw>0.5 is the animator's own gate for "the gallop is engaged" (see assert-wretch-charge).
const FOURS = 0.5;

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
    // HC_ENV=0 forces the collision envelope off, so this assert can be run as a control pair too.
    if(process.env.HC_ENV!=null) await pg.evaluate('__hc.wretchEnv('+(process.env.HC_ENV!=='0')+')').catch(()=>{});

    // A CHASE HAS TO COVER GROUND TO BE MEASURABLE. assert-wretch-charge yanks the creature to 1.4 blocks and records dist pinned at
    // 1.40 for every frame — nothing advances, so nothing about locomotion can be read there. This drops it 22 blocks out instead and
    // re-commits every poll, because the sneak branch and the grace gate both clear `committed`.
    const trace=[];
    for(let round=0; round<3; round++){
      await pg.evaluate('__hc.setTime(0.0)');
      await pg.evaluate('__hc.wretchAt(22)');
      await pg.evaluate('__hc.cam({yaw:Math.PI/2,pitch:0})');   // gaze away: `watched` outranks HUNT and turns a charge into a flee
      for(let i=0;i<45;i++){
        await pg.evaluate('__hc.setTime(0.0)');
        await pg.evaluate('__hc.wretchCommit()');
        trace.push(await pg.evaluate('__hc.wretchCharge()'));
        await sleep(60); } }

    const moving=trace.filter(t=>t && t.advRate>RUN);
    console.log('  samples '+trace.length+', moving faster than a walk: '+moving.length);
    const worst=[...trace].filter(t=>t&&t.advRate!=null).sort((a,b)=>b.advRate-a.advRate).slice(0,6);
    for(const c of worst) console.log('    adv '+String(c.advRate).padStart(6)+'  crawl '+String(c.crawl).padStart(5)+'  claw '+String(c.claw).padStart(5)
      +'  '+String(c.state).padEnd(6)+' posture '+String(c.posture).padEnd(6)+' dist '+String(c.dist).padStart(6));

    say(moving.length>=5, 'the creature actually runs in this harness ('+moving.length+' samples over '+RUN+' blocks/s)');
    if(!moving.length) return;

    // THE INVARIANT. One number: how many samples were both fast and upright.
    const upright=moving.filter(t=>t.claw<FOURS);
    if(upright.length) console.log('    upright while running: '+JSON.stringify(upright.slice(0,4)));
    say(upright.length===0, 'nothing runs upright ('+upright.length+' of '+moving.length+' fast samples with claw<'+FOURS+')');

    // …AND THE OTHER HALF OF THE SAME RULE: a standing pose is allowed, as long as it is not travelling. This is what keeps the fix from
    // being "crawl=1 always", which would cost every deliberate upright moment in the game.
    const still=trace.filter(t=>t && t.advRate<1);
    say(still.length===0 || still.some(t=>t.claw<FOURS) || still.length<3,
        'a creature that is not travelling may still stand ('+still.filter(t=>t.claw<FOURS).length+' of '+still.length+' still samples upright)');
  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
  console.log(bad?('FAILED '+bad):'PASS');
  process.exit(bad?1:0);
})();
