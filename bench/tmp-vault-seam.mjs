// Ben 08-04: "double check vault door texture overlap." The model says it was fixed — W went 1.88 -> 1.99 and the comment records
// WHY 1.99 and not 2.0: at exactly 2 the leaf's edges are coplanar with the faces of the wall blocks either side, and two coplanar
// surfaces at one depth is the flickering seam that got called overlapping textures. This checks the claim rather than the comment.
//
// HOW A SEAM IS MEASURED. Z-fighting is not a still-image artefact: it is the same pixel changing its mind between frames as the
// depth comparison flips. So photograph the SAME view twice, a frame apart, with nothing moving, and count pixels that changed.
// A clean door gives a handful (dither/grain); a fighting seam gives a line of them along the door's edges. Also shot at two
// distances, because coplanar faces separate on screen as you approach and fight hardest far away.
//   node bench/tmp-vault-seam.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// CLIPPED TO THE DOOR. Whole-frame diffs also caught the sky birds and the swaying foliage either side of the wall — 150,000
// changed pixels of perfectly legitimate motion. The door fills the middle of the frame by construction, so the seam question is
// asked only there.
function diff(a,b){ const A=decodePNG(fs.readFileSync(a)), B=decodePNG(fs.readFileSync(b));
  let n=0, worst=0; const {w,h,ch,data:da}=A, db=B.data;
  for(let y=Math.round(h*0.28); y<Math.round(h*0.82); y++) for(let x=Math.round(w*0.30); x<Math.round(w*0.70); x++){ const k=(y*w+x)*ch;
    const d=Math.abs(da[k]-db[k])+Math.abs(da[k+1]-db[k+1])+Math.abs(da[k+2]-db[k+2]);
    if(d>30){ n++; if(d>worst) worst=d; } }
  return {n, worst}; }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1000,height:640}})).newPage();
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.30); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    // GRAIN OFF, or this measures the wrong thing entirely: the film grain is animated off uTime and changes every pixel every
    // frame, which read as 45,000 "fighting" pixels on a door that was not moving at all. Weather pinned for the same reason.
    await page.evaluate('__hc.pinScene()');
    await page.evaluate('__hc.grainSet(0)');
    await sleep(2500);
    const g=await page.evaluate('__hc.probe()');
    // A WALL WITH A 2x2 DOORWAY IN IT, which is the case the seam lives in: the leaf's edges against the wall blocks either side.
    await page.evaluate(`(()=>{
      for(let dx=-4;dx<=4;dx++) for(let dy=0;dy<=4;dy++) __hc.setBlock(dx,dy,-6,'reinforced_wall');
      for(let dx=-1;dx<=0;dx++) for(let dy=0;dy<=1;dy++) __hc.setBlock(dx,dy,-6,null);      // the 2x2 opening
      __hc.setBlock(-1,0,-6,'vault_door_x');                                               // origin cell of the leaf
    })()`);
    await sleep(1800);
    const shots=[];
    for(const [tag,dz,pitch] of [['far',3.2,0.02],['near',1.1,0.02],['angled',2.2,0.02]]){
      const px=g.x-(tag==='angled'?2.2:0.5), pz=g.z-6+dz;
      await page.evaluate(`__hc.tpAt(${px},${g.gyHere+1},${pz})`);
      await page.evaluate(`__hc.cam({yaw:${tag==='angled'?-0.42:0},pitch:${pitch}})`);
      await sleep(1200);
      const f1=path.join(ROOT,'bench','results','vault-'+tag+'-a.png');
      const f2=path.join(ROOT,'bench','results','vault-'+tag+'-b.png');
      await page.screenshot({path:f1}); await sleep(140); await page.screenshot({path:f2});
      const d=diff(f1,f2);
      console.log('  '+tag.padEnd(8)+' frame-to-frame changed px: '+String(d.n).padStart(6)+'   worst delta '+d.worst);
      shots.push(tag);
    }
    console.log('  frames: bench/results/vault-<far|near|angled>-a.png');
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
