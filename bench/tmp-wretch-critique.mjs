// Scratch: drive the Wretch through the states a player actually meets and print the trace. Not an assertion — this is the reading
// pass for "the three things most wrong". Deletable.
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
    await ev('__hc.qaLocked(true)');

    const run=async(label,armed,summoned,polls)=>{
      console.log('\n=== '+label+' ===');
      await ev('__hc.setTime(0.0)');
      console.log('  arm '+JSON.stringify(await ev(`__hc.wretchArm(${armed},${summoned})`)));
      await ev('__hc.wretchAt(16)'); await ev('__hc.cam({yaw:Math.PI/2,pitch:0})');
      await ev(`__hc.wretchArm(${armed},${summoned})`);
      const seen={};
      let last=null;
      for(let i=0;i<polls;i++){
        await ev('__hc.setTime(0.0)'); await ev('__hc.wretchCommit()');
        const c=await ev('__hc.wretchCharge()');
        seen[c.state]=(seen[c.state]||0)+1;
        const key=c.state+'|'+(c.dist<4?'CLOSE':'far')+'|'+c.creativeHits+'|'+c.playerHealth;
        if(key!==last){ console.log('   t'+String(i).padStart(3)+' '+String(c.state).padEnd(6)+' dist '+String(c.dist).padStart(6)
          +' hp '+String(c.playerHealth).padStart(6)+' hits '+c.creativeHits+' reachT '+c.reachT+' recommit '+c.recommitT+' canGrab '+c.canGrab+' fleeing '+c.fleeing);
          last=key; }
        await sleep(60);
      }
      console.log('  states: '+JSON.stringify(seen));
      console.log('  final: '+JSON.stringify(await ev('__hc.wretchCharge()')));
    };

    await run('NIGHT 1: not armed, not summoned — can a charge resolve at all?', false, false, 70);
    await run('ARMED (night 2+): the ordinary case', true, false, 60);
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
})();
