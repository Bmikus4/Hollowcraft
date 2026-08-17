// EVERY CREATURE'S VOICE, PROVED TO REACH THE GRAPH. The Burrower already shipped mute once: it dug with a voice type that
// had been cut from the game and returned on the first line of wretchVoice, so every call site read correctly and nothing was
// ever heard. That is the fault this file exists to make impossible for the other two.
//
// The AudioContext is built in the game's own gesture handler, so the harness CLICKS. Without that, every request counts as
// silent and the run reads exactly like a mute creature — which is the same reading a genuinely broken voice gives.
//
// It also checks the thing that makes these voices design rather than decoration: RANGE. The Meek's alarm has to carry
// further than its shuffle, because its whole function is to be heard by something far away.
//
//   node bench/assert-kind-voices.mjs
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
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required']});
    const pg=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,140)));
    await pg.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:90000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    try{ await pg.mouse.click(450,300); }catch(e){}
    await sleep(900);
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(2500); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.75)');

    // Every sound is asked for at the player's own position, so distance is not what is under test here — only whether the
    // graph gets built. Range is tested separately below, where it IS the point.
    await ev('__hc.burAudio(true)');
    for(const k of ['dig','surface','cry','meek_stir','meek_scream','tenant_call','tenant_touch']){
      await ev(`__hc.kindSay('${k}', 0)`);
      await sleep(120);
    }
    const a=await ev('__hc.burAudio()');
    console.log('  '+JSON.stringify(a));
    if(a.noAC>0){ say(false, 'the AudioContext started, so a silent count means a silent creature and not a headless run ('+a.noAC+' silent)'); }
    for(const k of ['dig','surface','cry','meek_stir','meek_scream','tenant_call','tenant_touch'])
      say((a.played[k]||0)>0, k+' reaches the audio graph ('+(a.played[k]||0)+' built of '+(a.req[k]||0)+' asked)');
    say(a.dropped===0, 'nothing was asked for and quietly dropped ('+a.dropped+')');

    // RANGE. The alarm must be audible from where the shuffle is not — that difference is the creature's mechanism, not a
    // mixing preference, so it is asserted rather than trusted to a constant nobody reads.
    await ev('__hc.burAudio(true)');
    await ev("__hc.kindSay('meek_stir', 30)"); await sleep(150);
    await ev("__hc.kindSay('meek_scream', 30)"); await sleep(150);
    const r=await ev('__hc.burAudio()');
    console.log('  at thirty blocks '+JSON.stringify(r));
    say((r.played['meek_scream']||0)>0, 'the alarm still carries at thirty blocks');
    say((r.played['meek_stir']||0)===0 && r.far>0, 'the shuffle does not ('+r.far+' out of range)');
  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
  console.log(bad?('FAILED '+bad):'PASS');
  process.exit(bad?1:0);
})();
