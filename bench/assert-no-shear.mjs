// IS THE RIG SHEARED. Ben played the game and said the new creatures' models and animations are broken while every bench I
// own was green, so this looks for the fault a bench of bone ANGLES cannot see by construction.
//
// Non-uniform scale on a joint that has rotating children does not stretch the child, it SHEARS it: the child's rotation
// happens inside the parent's squashed space, so a limb that is perfectly posed in angles comes out skewed on screen and
// changes shape as it moves. kindBody sets scales like (1.45, 0.45, 1.45) on a thigh whose shin then rotates inside it.
//
// The test is geometric and needs no eyes: in an honest rotate-and-scale matrix the three axes stay perpendicular. Any
// non-zero cosine between them is shear, and shear is the thing the player sees.
//
//   node bench/assert-no-shear.mjs
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
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,140)));
    await pg.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:90000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(3500); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.75)'); await ev('__hc.hwHold(true)');

    // The parent first: whatever the Wretch scores is the family's honest baseline, because nothing re-proportions it.
    await ev('__hc.wretchAt(12)'); await ev('__hc.wretchArm(true,true)'); await sleep(600);
    const wr=await ev("__hc.rigSkew('wretch')");
    console.log('  wretch   '+JSON.stringify(wr));
    say(!wr.err, 'the Wretch is there to measure');

    await ev('__hc.meek(1)'); await sleep(800);
    await ev('__hc.burrower(9)'); await sleep(800);
    await ev('__hc.tenBox()'); await sleep(1000); await ev('__hc.tenant(true)'); await sleep(800);

    for(const kind of ['meek','burrower','tenant']){
      const r=await ev(`__hc.rigSkew('${kind}')`);
      console.log('  '+kind.padEnd(9)+JSON.stringify(r));
      if(r.err){ say(false, kind+' is there to measure'); continue; }
      say(r.sheared===0, kind+' has no sheared bone (worst '+r.worst+' on '+r.worstBone+', '+r.sheared+' over tolerance)');
    }
    if(!wr.err) say(wr.sheared===0, 'and neither has the Wretch (worst '+wr.worst+' on '+wr.worstBone+')');
  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
  console.log(bad?('FAILED '+bad):'PASS');
  process.exit(bad?1:0);
})();
