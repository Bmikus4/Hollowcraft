// Verify the Backrooms rework (Ben 07-27): non-grid rooms, 1-2 doorways, thick walls, big start room, fluorescent lights,
// robustness across many random seeds (no freeze), portal, and the 12-anim Pale.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'bench', 'results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no chrome'); }
const ev=(p,e)=>p.evaluate(e);
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errors=[];
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,220)));
    globalThis.__browser=browser;
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await sleep(800);

    // ---- OVERWORLD: cinematic grade + detailed skybox pines (midday, look at the horizon) ----
    try{ await ev(page,`__hc.setTime&&__hc.setTime(0.5)`); }catch(e){}
    await sleep(1200);
    for(let i=0;i<3;i++){ await ev(page,`window.__hcBR.look(${(i*2.09).toFixed(2)},0)`); await sleep(500); await page.screenshot({path:path.join(OUT,'ow-horizon-'+i+'.png')}); }

    await ev(page,`window.__hcBR.enter()`); await sleep(1200);

    // ---- ROBUSTNESS: rebuild the maze on 24 random seeds; the loop must never crash (fps stays >0, err stays null) ----
    const seedStats=[]; let worst=null;
    for(let k=0;k<24;k++){ const sd=(1+Math.floor((k*269+7)*104729)%4000000000);
      const r=await ev(page,`window.__hcBR.seed(${sd})`); await sleep(120);
      const rooms=await ev(page,`window.__hcBR.rooms()`); const err=await ev(page,`window.__hcBR.err()`); const fps=await ev(page,`__hc.st().fps`);
      seedStats.push({sd, rooms:rooms.rooms, doors:rooms.doors, avgDoors:rooms.avgDoors, maxDoors:rooms.maxDoors, angledWalls:rooms.angledWalls, minArea:rooms.minArea, maxArea:rooms.maxArea, fixtures:rooms.fixtures, err:err?String(err).slice(0,140):null, fps});
      if(err) worst=err; }

    // ---- back to the canonical seed for screenshots ----
    await ev(page,`window.__hcBR.seed(99991)`); await sleep(300);
    await ev(page,`window.__hcBR.tp(0,0)`); await sleep(400);
    for(const [i,yaw] of [[0,0],[1,1.57],[2,3.14],[3,4.71]]){ await ev(page,`window.__hcBR.look(${yaw},0.05)`); await sleep(450); await page.screenshot({path:path.join(OUT,'br2-look-'+i+'.png')}); }
    await ev(page,`window.__hcBR.tp(0,0); window.__hcBR.look(0.4,1.5)`); await sleep(400); await page.screenshot({path:path.join(OUT,'br2-ceiling.png')});   // near-straight UP → modeled fluorescent troffer panels
    await ev(page,`window.__hcBR.tp(18,6); window.__hcBR.look(0.7,0)`); await sleep(600); await page.screenshot({path:path.join(OUT,'br2-maze-1.png')});
    await ev(page,`window.__hcBR.tp(34,-14); window.__hcBR.look(2.2,0)`); await sleep(600); await page.screenshot({path:path.join(OUT,'br2-maze-2.png')});
    // ---- DOORS: interactive open/close ----
    const doorList=await ev(page,`window.__hcBR.doorList()`);
    const closedIdx=doorList.findIndex(d=>d.closed);
    let doorClosedShot=null, doorOpenShot=null, toggledOK=null;
    if(closedIdx>=0){ await ev(page,`window.__hcBR.tpDoor(${closedIdx})`); await sleep(500); await page.screenshot({path:path.join(OUT,'br2-door-closed.png')}); doorClosedShot=true;
      toggledOK=await ev(page,`window.__hcBR.toggle()`); await sleep(900); await page.screenshot({path:path.join(OUT,'br2-door-open.png')}); doorOpenShot=true; }
    const doorAfterState=closedIdx>=0? (await ev(page,`window.__hcBR.doorList()`))[closedIdx] : null;

    await ev(page,`window.__hcBR.tp(10,2); window.__hcBR.look(3.1,0); window.__hcBR.anim('idle')`); await sleep(300); await page.screenshot({path:path.join(OUT,'br2-pale-idle.png')});

    // ---- CRAWL PASSAGES: find one, screenshot it, and gate-test (blocked standing, free crouching) ----
    let crawlTest=null, crawlCount=0;
    { let sd=99991, found=false;
      for(let k=0;k<12 && !found;k++){ await ev(page,`window.__hcBR.seed(${sd})`); await sleep(120); const cl=await ev(page,`window.__hcBR.crawlList()`); if(cl.length){ found=true; crawlCount=cl.length; await ev(page,`window.__hcBR.tpCrawl(0)`); await sleep(400); await page.screenshot({path:path.join(OUT,'br2-crawl.png')}); crawlTest=await ev(page,`window.__hcBR.testCrawl()`); } sd=(sd*1103515245+12345)>>>0; }
    }

    await ev(page,`window.__hcBR.seed(99991)`); await sleep(200);
    const finalRooms=await ev(page,`window.__hcBR.rooms()`); const finalErr=await ev(page,`window.__hcBR.err()`);
    const crashed=seedStats.filter(s=>s.err||s.fps<=0);
    const maxDoorsSeen=Math.max(...seedStats.map(s=>s.maxDoors));
    console.log(JSON.stringify({ pageErrors:errors.slice(0,10), finalRooms, finalErr, crashedSeeds:crashed.length, maxDoorsSeen, doorCount:doorList.length, closedCount:doorList.filter(d=>d.closed).length, toggledOK, doorAfterState, crawlCount, crawlTest, seedSample:seedStats.slice(0,4), crashed:crashed.slice(0,4) }, null, 1));
  } catch(e){ console.error('FATAL', e.message); console.log(JSON.stringify({pageErrors:errors.slice(0,10)})); process.exitCode=1; }
  finally { try{ if(globalThis.__browser)await globalThis.__browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})();
