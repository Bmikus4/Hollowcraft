// THE TENANT. Three claims, and every one of them is about something NOT happening, which is the hard kind to test.
//
//   1. It only exists indoors. Outside is the escape, and an escape that leaks is not one.
//   2. It never travels while you are looking at it. Counted in the engine, frame by frame, because a relocation takes one
//      frame and a bench polling four times a second would miss it in the gap — see __hc.tenant().movedWhileWatched.
//   3. It relocates at all. Without this, claim 2 is satisfied perfectly by a creature that is simply a statue.
//
//   node bench/assert-tenant.mjs
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
    await pg.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:90000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(3500); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.75)');

    // 1. OUTDOORS IT MUST NOT EXIST. Ask for it in a field and it has to refuse — or spawn and immediately give up.
    const out=await ev('__hc.tenant(true)');
    await sleep(600);
    const out2=await ev('__hc.tenant()');
    console.log('  in the open: '+JSON.stringify(out2));
    say(out2.inside===false, 'the harness really is outdoors ('+out2.inside+')');
    say(out2.alive===false, 'it does not exist outdoors — going outside is the escape ('+out2.alive+')');

    // Build a room around the player. Everything below is inside it.
    console.log('  box   '+JSON.stringify(await ev('__hc.tenBox()')));
    await sleep(1200);
    const inn=await ev('__hc.tenant(true)');
    await sleep(600);
    let s1=await ev('__hc.tenant()');
    console.log('  indoors: '+JSON.stringify(s1));
    say(s1.inside===true, 'the box reads as an interior ('+s1.inside+')');
    say(s1.alive===true, 'and indoors it is there ('+s1.alive+')');
    if(!s1.alive) throw new Error('nothing to measure');

    // 2+3. Watch it for twelve seconds with the camera pointed at it half the time. It must relocate, and never while seen.
    for(let i=0;i<60;i++){
      if(i%2===0) await ev('__hc.look()');                       // stare straight at it
      else await ev('__hc.cam({yaw:Math.PI*1.5,pitch:0})');       // and then away
      await sleep(200);
    }
    const s2=await ev('__hc.tenant()');
    console.log('  after twelve seconds: '+JSON.stringify(s2));
    say((s2.relocations||0)>0, 'it moves at all when unwatched ('+s2.relocations+' relocations) — without this the next check is a statue passing');
    say((s2.movedWhileWatched||0)===0, 'and it never travelled while it was being looked at ('+s2.movedWhileWatched+' frames)');
    say(s2.lightSlots>0, 'the light pool is untouched ('+s2.lightSlots+' slots)');
  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
  console.log(bad?('FAILED '+bad):'PASS');
  process.exit(bad?1:0);
})();
