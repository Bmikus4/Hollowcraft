// Scratch: LET IT RUN. No forcing, no committing — arm the hunt, drop it at 26 blocks on a real night and watch what the creature
// actually does to a player who is standing there, for 90 seconds. Prints every state transition with distance. Deletable.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const LOOK = process.env.LOOK||'away';   // away | at
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
    console.log('placed', JSON.stringify(await ev('__hc.wretchAt(26)')).slice(0,120));
    if(LOOK==='away') await ev('__hc.cam({yaw:Math.PI/2,pitch:0})');
    await ev('__hc.wretchAudit(true,false)');

    let last='', minDist=99, t0=Date.now(), grabbed=0, despawns=0, states={};
    for(let i=0;i<360;i++){
      await ev('__hc.setTime(0.75)');
      if(LOOK==='at') await ev('__hc.look()');
      const p=await ev('(()=>{const p=__hc.pose(),c=__hc.wretchCharge();return {st:p.st,watched:p.watched,sneak:p.sneak,committed:p.committed,crawl:p.crawl,adv:p.adv,dist:c.dist,active:c.active,hp:c.hp,ph:c.playerHealth,mv:__hc.wretchAudit().mv};})()');
      states[p.st]=(states[p.st]||0)+1;
      if(p.dist<minDist && p.active) minDist=p.dist;
      if(!p.active) despawns++;
      const key=p.st+'|'+p.active+'|'+p.watched+'|'+p.sneak+'|'+(p.ph<20?'HURT':'ok');
      if(key!==last){ console.log(String(((Date.now()-t0)/1000).toFixed(1)).padStart(6)+'s '+String(p.st).padEnd(7)+' active '+String(p.active).padEnd(5)
        +' dist '+String(p.dist).padStart(6)+' mv '+String(p.mv).padStart(5)+' crawl '+String(p.crawl).padStart(5)
        +' watched '+String(p.watched).padEnd(5)+' sneak '+String(p.sneak).padEnd(5)+' committed '+String(p.committed).padEnd(5)+' playerHP '+p.ph); last=key; }
      await sleep(250);
    }
    console.log('states '+JSON.stringify(states));
    console.log('closest approach '+minDist+', polls with no creature '+despawns);
    console.log('audit '+JSON.stringify(await ev('__hc.wretchAudit()')));
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
})();
