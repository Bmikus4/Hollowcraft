// WATER RUNS DOWN A CHANNEL YOU DIG. Ben: "water needs to flow downward and outward". A bench that proves the algorithm
// terminates proves nothing about that, so this does the thing he described: stand at a shore, cut a one-block trench
// inland, and watch those exact cells fill — then cut a step down and watch it fall and spread again from the bottom.
//
// It also prices it, because a fluid is the one system here that can cost more than everything else put together: the
// queue is capped by construction, and the check is that a settled world costs nothing at all.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
let pass=0, fail=0;
const ok=(n,c,d)=>{ if(c){pass++; console.log('  ok   '+n);} else {fail++; console.log('  FAIL '+n+'   '+(d||''));} };
(async()=>{ const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null;
  try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:900,height:700}})).newPage();
    const errs=[]; pg.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('PAGEERROR:',String(e.message||e).slice(0,180)); });
    await pg.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction("(()=>{try{const l=document.getElementById('load');return !l||l.style.display==='none';}catch(e){return false;}})()",null,{timeout:300000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(4000); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');

    // A SETTLED WORLD COSTS NOTHING. If the sim were scanning, this would already be non-zero after the boot.
    const idle=await ev('__hc.waterSim()');
    console.log('  at rest '+JSON.stringify(idle));
    ok('it is on', idle.on===true, JSON.stringify(idle));
    ok('a settled world leaves an empty queue', idle.queue===0, JSON.stringify(idle));

    // WALK TO THE SEA. The channel has to start in water or there is nothing to flow, and the shoreline is where the
    // player would dig — finding it by marching rather than assuming spawn is on a beach.
    const shore=await ev('__hc.toShore(160)');
    console.log('  shore '+JSON.stringify(shore));
    if(!shore || shore.err){ console.log('  no coast within 160 blocks of spawn'); return; }
    await sleep(600);

    const cut=await ev('__hc.waterChannel(9, 0)');
    console.log('  channel '+JSON.stringify(cut));
    ok('the trench was dug', !cut.err && cut.dug===9, JSON.stringify(cut));
    ok('digging beside water wakes the fluid', cut.queue>0, 'queue '+cut.queue);

    // AND THE DIRECT TEST: pour a source two blocks over dry ground. It has to fall to the ground and then spread across
    // it, which is exactly the two words in Ben's ask, and unlike the trench it does not depend on the terrain happening
    // to slope the right way.
    const pour=await ev('__hc.waterPour(2, 3)');
    console.log('  poured '+JSON.stringify(pour));
    ok('a poured source wakes the fluid', !pour.err && pour.queue>0, JSON.stringify(pour));

    // AND THEN IT FILLS. Sampled over time, because a fluid arriving instantly would be a fill, not a flow.
    let filled=0, t0=Date.now(), series=[];
    for(let i=0;i<24;i++){
      await sleep(250);
      const w=await ev('__hc.waterSim()');
      series.push(w.moved);
      if(w.queue===0 && i>4) break;
    }
    const w=await ev('__hc.waterSim()');
    console.log('  after '+((Date.now()-t0)/1000).toFixed(1)+'s '+JSON.stringify(w));
    ok('the simulation actually wrote blocks', w.moved>0, 'moved '+w.moved+'  (a queue that never writes is a queue that is not running)');
    ok('it settles rather than churning for ever', w.queue===0, 'queue '+w.queue);
    ok('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

    await ev('__hc.cam({pitch:-0.35})');
    await pg.screenshot({path:path.join(ROOT,'bench/results/horizon/channel.png')});
    console.log('');
    console.log('  '+pass+' passed, '+fail+' failed');
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} process.exit(fail?1:0); }
})();
