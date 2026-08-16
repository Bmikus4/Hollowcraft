// PLAY IT. Ben opened the game and said the new creatures' models and animations are broken, while every bench I own was
// green. So this does not measure a bone: it spawns each creature the way the game spawns it, stands at a normal distance,
// and photographs it over several seconds — and the only number it reports is HOW MUCH OF THE SCREEN THE BODY OCCUPIES,
// which is the thing a player's eye actually answers.
//
// No kindLook teleport, no hwHold, no forced visibility. Anything this harness has to arrange in order to see a creature is
// a thing the player will not have arranged, and that gap is exactly where four green tests have hidden today.
//
//   node bench/play-creatures.mjs      → bench/results/play/<creature>-<n>.png
import { spawn, spawnSync } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench/results/play');
const W=900, H=600;
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
function pixels(f){ const r=spawnSync('ffmpeg',['-loglevel','error','-i',f,'-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:1<<28});
  if(r.status!==0) throw new Error('ffmpeg failed'); return r.stdout; }
// How many pixels differ between two frames, over the whole screen. With the camera still, the only thing that moves is the
// creature — so this counts the creature, including any part of it the bounding box would have missed.
function moved(a,b){ let n=0; for(let i=0;i<a.length;i+=3){
  if((Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]))/3 > 10) n++; } return n; }

(async()=>{
  const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null;
  try{
    fs.mkdirSync(OUT,{recursive:true});
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,140)));
    await pg.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction("(()=>{try{const l=document.getElementById('load');return !l||l.style.display==='none';}catch(e){return false;}})()",null,{timeout:300000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(4000); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.25)');   // daylight, so anything on screen is legible

    const watch=async(name, seconds, aim)=>{
      console.log('');
      console.log('['+name+']');
      const files=[];
      for(let i=0;i<seconds*2;i++){
        if(aim) await aim();
        const f=path.join(OUT,name+'-'+String(i).padStart(2,'0')+'.png');
        await pg.screenshot({path:f}); files.push(f);
        await sleep(500);
      }
      // Consecutive frames differ by whatever moved. A creature that is drawn and animating moves thousands of pixels; a
      // creature that is not drawn moves the leaves and nothing else.
      let peak=0, tot=0;
      for(let i=1;i<files.length;i++){ const d=moved(pixels(files[i-1]), pixels(files[i])); tot+=d; if(d>peak)peak=d; }
      console.log('  frames '+files.length+'  peak pixels changed between consecutive frames: '+peak+'  mean '+Math.round(tot/(files.length-1)));
      return peak;
    };

    // THE WRETCH, the parent, first. Summoned and armed the way the QA path does it, then simply watched.
    console.log('spawn wretch '+JSON.stringify(await ev('__hc.wretchAt(12)')).slice(0,90));
    await ev('__hc.wretchArm(true,true)');
    console.log('  pose '+JSON.stringify(await ev('__hc.pose()')).slice(0,180));
    await watch('wretch', 5, async()=>{ await ev('__hc.look()'); });

    // THE MEEK. Spawned by its own hook at its own distance, then looked at where it actually is.
    console.log('spawn meek '+JSON.stringify(await ev('__hc.meek(1)')).slice(0,90));
    await sleep(1200);
    console.log('  where '+JSON.stringify(await ev("__hc.kindLook('meek')")));
    console.log('  shape '+JSON.stringify(await ev("__hc.kindShape('meek')")));
    await watch('meek', 5, async()=>{ await ev("__hc.kindLook('meek')"); });

    // THE BURROWER. Spawned close so it surfaces, and watched through the emergence.
    console.log('spawn burrower '+JSON.stringify(await ev('__hc.burrower(7)')).slice(0,90));
    await watch('burrower', 6, async()=>{ await ev("__hc.kindLook('burrower')"); });
    console.log('  after '+JSON.stringify(await ev('__hc.burrower()')));

    // THE TENANT. Needs an interior, so the room is built last and the player is inside it.
    console.log('room '+JSON.stringify(await ev('__hc.tenBox()')));
    await sleep(1000);
    console.log('spawn tenant '+JSON.stringify(await ev('__hc.tenant(true)')).slice(0,90));
    await watch('tenant', 5, async()=>{ await ev("__hc.kindLook('tenant')"); });

    console.log('');
    console.log('  frames in '+OUT);
  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
})();
