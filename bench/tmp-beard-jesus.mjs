// JESUS'S BEARD, AT A CHOSEN DISTANCE. assert-beards sets the range by spawning him nearer or further, and the spawn
// does not honour it: over four runs the same call put him at 3.25, 1.54, 1.38 and 0.57 blocks, and at 0.57 the camera is
// inside his robe. This places the PLAYER instead - four blocks out on his own facing, then two - and aims with
// __hc.look, which the harness notes say is the one aim that works from the eye rather than a frame-late camera.
//
//   node bench/tmp-beard-jesus.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
(async()=>{ const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null;
  try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:1000,height:600}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(3500); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev("__hc.cmdRun('/gamemode creative')"); await ev("__hc.cmdRun('/fly on')");
    for(const kind of ['jesus','monk']){
      if(kind==='jesus') await ev("__hc.cmdRun('/spawn jesus 1 3')"); else await ev('__hc.monkSpawn(3,0)');
      await sleep(1800); await ev(`__hc.figurePark('${kind}')`);
      const F=await ev(`__hc.figureAt('${kind}')`);
      if(!F || F.err){ console.log('  '+kind+': not found', JSON.stringify(F)); continue; }
      for(const [dtag,d] of [['close',1.6],['talk',4.0]]){
        // Stand d blocks off him on +x and look at his head. Eye height matched to the head so the beard is not
        // foreshortened away, which is what a level look from the ground does at close range.
        // THE STANDING HEIGHT IS THE GROUND'S, NOT THE FIGURE'S. Placing the player at the figure's own y+0.4 put the
        // camera inside terrain on a slope and every frame came back black with the journal's "Location logged" over it.
        await ev(`(()=>{ const x=${F.x}+${d}, z=${F.z}; __hc.tpAt(x, __hc.groundY(x,z)+1.2, z); })()`); await sleep(400);
        await ev(`__hc.figureFace('${kind}')`); await sleep(300);
        await ev(`__hc.look(${F.x}, ${F.y}+1.55, ${F.z})`); await sleep(600);
        for(const [ttag,t] of [['day',0.30],['night',0.86]]){
          await ev(`__hc.setTime(${t})`); await sleep(700);
          const f=path.join(OUT,`bj-${kind}-${dtag}-${ttag}.png`); await pg.screenshot({path:f, timeout:60000});
          console.log(`  ${kind} ${dtag} ${ttag} d=${d} -> ${path.basename(f)}`);
        }
      }
    }
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} } })();
