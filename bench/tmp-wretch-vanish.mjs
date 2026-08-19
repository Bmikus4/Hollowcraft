// Scratch: can the creature be deleted while it is on top of you and in plain view? Dawn, the 58-block flee cut, the sea cut and the
// day-peek all call despawnWretch, which sets group.visible=false on the spot. Deletable.
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
  let b=null;
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
    await ev('__hc.wretchArm(true,false)');
    await ev('__hc.wretchAt(7)');
    await ev('__hc.wretchCommit()');
    for(let i=0;i<8;i++){ await ev('__hc.setTime(0.75)'); await ev('__hc.wretchCommit()'); await sleep(70); }
    console.log('before dawn: '+JSON.stringify(await ev('(()=>{const c=__hc.wretchCharge();return{state:c.state,dist:c.dist,active:c.active,vis:!!(window.__hc.pose()),day:__hc.setTime(0.75)};})()')));
    // dawn arrives while it is seven blocks away and coming
    const t=[];
    for(let i=0;i<12;i++){ const day=await ev('__hc.setTime('+(0.50+i*0.01).toFixed(3)+')');
      const c=await ev('__hc.wretchCharge()'); t.push({day, state:c.state, dist:c.dist, active:c.active}); await sleep(120); }
    for(const r of t) console.log('  uDay '+String(r.day).padStart(6)+'  '+String(r.state).padEnd(7)+' dist '+String(r.dist).padStart(6)+' active '+r.active);
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
})();
