// THREE DEATHS. The failure this exists to catch is the one every despawn passes: kill the creature, look afterwards, find it
// gone, call it a death. A death is the seconds BETWEEN the blow and the disappearance, so every assertion here is about that
// window — the body has to move, it has to still be there while it does, and each one has to move differently.
//
//   Burrower — goes back into the ground. It must travel DOWN, and end below where it was standing.
//   Meek     — drops, and is gone inside about a second. Cheap, because it happens six times a night.
//   Tenant   — topples from the ankles. It must PITCH most of a right angle, and take longer than the other two.
//
// The kill goes through hurtWretch, the real damage path, rather than through a hook that sets a flag — a death that only
// happens when a bench asks for it politely is not the death the player will see.
//
//   node bench/assert-kind-deaths.mjs
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

    // Sample the whole window at 20 Hz and keep the extremes. A single reading taken at the wrong moment would find a body
    // that has already finished falling, which looks exactly like a body that never fell.
    const die=async(kind, seconds)=>{
      const k=await ev(`__hc.kindKill('${kind}')`);
      if(k.err) return {err:k.err};
      let maxRot=0, minDy=0, maxDead=0, frames=0, aliveFrames=0;
      for(let i=0;i<seconds*20;i++){
        const d=await ev(`__hc.kindDeath('${kind}')`);
        if(!d.err){ frames++;
          if(d.active) aliveFrames++;
          if(Math.abs(d.rotX)>Math.abs(maxRot)) maxRot=d.rotX;
          if(d.dy<minDy) minDy=d.dy;
          if(d.dead>maxDead) maxDead=d.dead; }
        await sleep(50); }
      const end=await ev(`__hc.kindDeath('${kind}')`);
      return { kill:k, maxRot:+maxRot.toFixed(3), minDy:+minDy.toFixed(3), maxDead:+maxDead.toFixed(2), frames, aliveFrames, end };
    };

    console.log('\n[burrower]');
    await ev('__hc.burrower(8)'); await sleep(1500);
    const B=await die('burrower', 3);
    console.log('  '+JSON.stringify(B));
    say(!B.err, 'there was one to kill');
    if(!B.err){
      say(B.aliveFrames>6, 'it stays in the world while it dies ('+B.aliveFrames+' frames)');
      say(B.minDy<-0.5, 'and goes back down into the ground ('+B.minDy+' blocks below where it stood)');
      say(B.end.active===false, 'and is gone when the death is finished');
    }

    console.log('\n[meek]');
    await ev('__hc.meek(1)'); await sleep(1500);
    const M=await die('meek', 3);
    console.log('  '+JSON.stringify(M));
    say(!M.err, 'there was one to kill');
    if(!M.err){
      say(M.aliveFrames>4, 'it stays in the world while it dies ('+M.aliveFrames+' frames)');
      say(Math.abs(M.maxRot)>0.6, 'it goes down face first ('+M.maxRot+' rad of pitch)');
      say(M.maxDead<1.6, 'and its death is a cheap one, because it happens all night ('+M.maxDead+' s)');
      say(M.end.active===false, 'and is gone when it is over');
    }

    console.log('\n[tenant]');
    await ev('__hc.tenBox()'); await sleep(1200); await ev('__hc.tenant(true)'); await sleep(800);
    const T=await die('tenant', 4);
    console.log('  '+JSON.stringify(T));
    say(!T.err, 'there was one to kill');
    if(!T.err){
      say(T.aliveFrames>20, 'it stays in the world while it goes over ('+T.aliveFrames+' frames)');
      say(Math.abs(T.maxRot)>1.3, 'and pitches most of a right angle, from the ankles ('+T.maxRot+' rad)');
      say(T.maxDead>1.8, 'slowly, because it never moved in life ('+T.maxDead+' s)');
      say(T.end.active===false, 'and is gone when it lands');
    }

    if(!B.err && !M.err && !T.err){
      say(T.maxDead>M.maxDead*1.5, 'the three deaths are not one death at three speeds (tenant '+T.maxDead+' s against meek '+M.maxDead+' s)');
      say(Math.abs(B.minDy)>Math.abs(M.minDy)*1.5, 'and the Burrower is the only one that leaves downward ('+B.minDy+' against '+M.minDy+')');
    }
  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
  console.log(bad?('FAILED '+bad):'PASS');
  process.exit(bad?1:0);
})();
