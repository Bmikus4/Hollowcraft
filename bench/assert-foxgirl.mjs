// SHE IS A PERSON THE GAME CAN HURT. Ben: "human size... should also take damage and be able to die". She is registered as
// an animal rather than as a bespoke entity, which is the whole claim being checked here: doing it that way is supposed to
// hand her the game's own damage chokepoint, its death, its drops and its ragdoll without any of them being written again.
// A private entity that merely LOOKS right and answers to nothing is the failure this is guarding against.
//
// Spawned through her egg, so the path is the one a player takes rather than a constructor a bench found.
//
//   node bench/assert-foxgirl.mjs
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

    // HER MESH IS A FILE THAT LOADS IN THE BACKGROUND, so a spawn before it lands legitimately gets the fallback box. That
    // is a wait, not a failure — and the wait is what makes the later "she is the real model" check mean something.
    for(let i=0;i<40;i++){ const p=await ev(`__hc.humanProbe ? 1 : 1`); const d=await ev("__hc.human(3,1.8)"); if(!d.err){ await ev('__hc.humanGone()'); break; } await sleep(500); }

    const egg=await ev("__hc.useEgg('egg_foxgirl', 4)");
    console.log('  egg '+JSON.stringify(egg));
    ok('she has a spawn egg', !egg.err, egg.err);
    ok('the egg is named for her', egg.name==='Fox Girl Spawn Egg', egg.name);
    await sleep(1500);

    const A=await ev("(()=>{ const g=__hc.animals ? __hc.animals() : null; return g; })()").catch(()=>null);
    // No animals probe exists, so she is read through the damage path itself, which is the thing under test anyway.
    const before=await ev("__hc.foxgirl ? __hc.foxgirl() : {err:'no probe'}");
    console.log('  state '+JSON.stringify(before));
    ok('she is alive in the world', !before.err && before.alive===true, JSON.stringify(before));
    ok('she is human height', !before.err && Math.abs(before.height-1.8)<0.25, JSON.stringify(before));
    ok('she is the real model, not the fallback box', !before.err && before.meshes>4, JSON.stringify(before));

    // DAMAGE THROUGH hurtAnimal, the chokepoint every weapon in the game routes through.
    const h1=await ev("__hc.foxgirlHurt(4)");
    console.log('  hurt '+JSON.stringify(h1));
    ok('a blow takes hit points off her', !h1.err && h1.hp<10, JSON.stringify(h1));
    ok('and does not kill her outright', !h1.err && h1.dead===false, JSON.stringify(h1));

    const h2=await ev("__hc.foxgirlHurt(20)");
    await sleep(1200);
    const after=await ev("__hc.foxgirl()");
    console.log('  killed '+JSON.stringify(h2)+'  then '+JSON.stringify(after));
    ok('enough damage kills her', !h2.err && h2.dead===true, JSON.stringify(h2));
    // A DEATH THAT IS ONLY A DESPAWN PASSES EVERY TEST THAT CHECKS SHE IS GONE. killAnimal ragdolls the body and leaves it
    // for two minutes, so the body must still BE there after the death, which is the opposite assertion to the obvious one.
    ok('her body stays in the world rather than vanishing', !after.err && after.present===true, JSON.stringify(after));
    ok('no page errors through any of it', errs.length===0, errs.slice(0,2).join(' | '));

    console.log('');
    console.log('  '+pass+' passed, '+fail+' failed');
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} process.exit(fail?1:0); }
})();
