// Visual checks (THREE-free, via __hc): book/bible pose, horizon deep-blue day+night, bullet-hole up-close + through scope.
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
const ev=(page,e)=>page.evaluate(e);
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
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await ev(page,`__hc.lock(true)`); await sleep(1200);

    // BOOK + BIBLE pose
    const books={};
    for(const id of ['field_guide','bible']){ await ev(page,`__hc.gun('${id}')`); await sleep(800);
      books[id]=await ev(page,`__hc.viewDbg()`); await sleep(200); await page.screenshot({ path: path.join(OUT,'vis-book-'+id+'.png') }); }

    // BULLET HOLE — clean probe: pillar + hole at eye height, empty hand, daytime. View close, mid, then through the scope.
    const hole = await ev(page,`__hc.holeProbe(2)`);
    await sleep(400); await page.screenshot({ path: path.join(OUT,'vis-hole-2.png') });
    for(const dist of [0.8,6]){
      await ev(page,`__hc.tp(${hole.hx-dist}, ${hole.gy}, ${hole.hz}, ${-Math.PI/2}, 0)`);
      await sleep(350); await page.screenshot({ path: path.join(OUT,'vis-hole-'+dist+'.png') });
    }
    // through the scoped rifle (hunting_rifle = the bolt PiP scope), aimed at the hole from 12 blocks
    await ev(page,`__hc.tp(${hole.hx-12}, ${hole.gy}, ${hole.hz}, ${-Math.PI/2}, 0)`);
    const scope = await ev(page,`__hc.gun('hunting_rifle')`);
    await ev(page,`__hc.aim(true)`); await sleep(1300); await page.screenshot({ path: path.join(OUT,'vis-hole-scope.png') });
    await ev(page,`__hc.aim(false)`);

    // HORIZON deep-blue: noon then midnight
    await ev(page,`__hc.setTime(0.5)`); await sleep(700);
    const dayCol=await ev(page,`__hc.seaColor()`); await page.screenshot({ path: path.join(OUT,'vis-horizon-day.png') });
    await ev(page,`__hc.setTime(0.0)`); await sleep(700);
    const nightCol=await ev(page,`__hc.seaColor()`); await page.screenshot({ path: path.join(OUT,'vis-horizon-night.png') });

    console.log(JSON.stringify({ pageErrors:errors, books, hole, scope, dayCol, nightCol }, null, 1));
    await browser.close();
  } catch(e){ console.error('FATAL', e.message); console.log(JSON.stringify({pageErrors:errors})); process.exitCode=1; }
  finally { try{ server.kill(); }catch(e){} }
})();
