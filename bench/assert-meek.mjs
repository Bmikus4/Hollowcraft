// THE MEEK, ASSERTED AS A POPULATION. "Spawns all the time" is the hard part of this creature, not the model, so the three
// questions are the ones volume asks: does the cap hold, does the crow mechanism actually reach the Wretch's ears, and what does
// a full house cost per frame.
//
// The cost measurement is A against B on the same session — an absolute frame time on this box means nothing on Ben's, and a
// number taken from a fresh page load would be measuring the load. Nothing here reads a frame time out of a probe: there is no
// T.ms in the engine and a probe that returned one would return a confident zero.
//
//   node bench/assert-meek.mjs
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

    // A — the empty baseline, measured before anything is spawned.
    // frameProf takes a FRAME COUNT, not milliseconds, and needs ?perf=1 on the URL. ms.wretch is the per-system figure and is
    // the honest one here: avgFrameMs moves with anything else the engine happens to be doing in the window.
    const A=await ev('__hc.frameProf(240)');
    console.log('  baseline '+JSON.stringify({frames:A.frames, avgFrameMs:A.avgFrameMs, wretch:A.ms&&A.ms.wretch}));

    // 1. THE CAP. Ask for ten; four is the budget, and a budget that is not enforced is a wish.
    const m=await ev('__hc.meek(10)');
    console.log('  after asking for ten: '+JSON.stringify({live:m.live, cap:m.cap, closest:m.closest, states:m.states, lights:m.lightSlots}));
    say(m.live>0, 'they spawn at all ('+m.live+' alive)');
    say(m.live<=m.cap, 'the population budget holds under a request to exceed it ('+m.live+' alive, cap '+m.cap+')');
    say(m.lightSlots>0, 'the light pool is whole with a full house alive ('+m.lightSlots+' slots) — none of them borrows one');

    // 2. THEY KEEP THEIR DISTANCE. A creature that closes is a threat, and this one is explicitly not one.
    // THE THIRD TEST THAT PASSED AGAINST NOTHING. `closest` is null when none are alive, so this loop left minSeen at 99 and
    // the assertion below read "they watch instead of closing (99.00)" — a green light produced by an empty world. Two of
    // these have already been found today (the Tenant's stillness, and a fork's pose never running); this was the third.
    let minSeen=99, livePolls=0;
    for(let i=0;i<40;i++){ const r=await ev('__hc.meek()');
      if(r.live>0) livePolls++;
      if(r.closest!=null && r.closest<minSeen) minSeen=r.closest; await sleep(100); }
    console.log('  closest any of them came over four seconds: '+minSeen.toFixed(2)+' ('+livePolls+'/40 polls with any alive)');
    say(livePolls>30, 'they were alive for the whole watch ('+livePolls+' of 40 polls) — without this the next line passes on an empty world');
    say(minSeen>2.5 && minSeen<40, 'they watch instead of closing ('+minSeen.toFixed(2)+' blocks at the nearest)');

    // 3. THE CROW MECHANISM. Disturbing one has to reach the WRETCH — not make a sound effect, but write into PNOISE, which is
    //    the array the Wretch's hearing reads. If this does not fire, the creature is decoration.
    const before=(await ev('__hc.meek()')).noise;
    console.log('  flush '+JSON.stringify(await ev('__hc.meekFlush()')));
    await sleep(700);
    const after=(await ev('__hc.meek()')).noise;
    console.log('  PNOISE entries '+before+' -> '+after);
    say(after>before, 'disturbing one reaches the Wretch\u2019s hearing (PNOISE '+before+' -> '+after+')');

    // 4. COST AT VOLUME, priced before shipping rather than after.
    await ev('__hc.meek(4)');
    await sleep(4000);
    const B=await ev('__hc.frameProf(240)');
    console.log('  full house '+JSON.stringify({frames:B.frames, avgFrameMs:B.avgFrameMs, wretch:B.ms&&B.ms.wretch}));
    const a=(A.ms&&A.ms.wretch)||0, bb=(B.ms&&B.ms.wretch)||0;
    console.log('  creature system '+a+' ms -> '+bb+' ms with a full population');
    say(B.frames>0, 'the profiler produced frames to read ('+B.frames+')');
    say(bb-a<1.5, 'a full population costs the creature system under 1.5 ms a frame ('+(bb-a).toFixed(3)+' ms)');
    // NO ASSERTION ON avgFrameMs, DELIBERATELY. Measured here: 57.81 ms empty and 30.37 ms with a full population — the frame is
    // dominated by this headless box warming up, so a threshold on it would fail with no creatures alive and pass with four,
    // which is worse than no test. The per-system figure is the one that isolates the creature, and it is what is asserted.
    console.log('  frame average '+A.avgFrameMs+' -> '+B.avgFrameMs+' ms (headless warm-up, not the creatures — not asserted)');
  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
  console.log(bad?('FAILED '+bad):'PASS');
  process.exit(bad?1:0);
})();
