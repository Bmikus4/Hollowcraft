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
  const errors=[]; const R={};
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await ev(page,`__hc.setTime(0.4)`); await ev(page,`__hc.heal&&__hc.heal()`);

    // ---- summon the seraph + check all seven eyes present, distinct, with layout index i ----
    await ev(page,`__hc.boss&&__hc.boss({dist:16})`); await sleep(1600);
    const eyes = await ev(page,`__hc.eyes()`);
    const ii = (eyes.spheres||[]).map(e=>e.i).sort((a,b)=>a-b);
    const uniqPos = new Set((eyes.spheres||[]).map(e=>e.x+','+e.y+','+e.z)).size;
    R.eyes = { count:(eyes.spheres||[]).length, indices:ii, distinctPositions:uniqPos, hasAll7: JSON.stringify(ii)===JSON.stringify([-3,-2,-1,0,1,2,3]) };

    // ---- shoot-to-seal: seal side eye i=2 for 90s ----
    const seal = await ev(page,`__hc.sealEye(2)`);
    R.seal = { ok:seal.ok, closedCount:(seal.eyes||[]).filter(e=>e.closed).length, closedIsI2:(seal.eyes||[]).some(e=>e.i===2&&e.closed) };

    // ---- beam whiten span + shards ----
    R.whiten = await ev(page,`(__hc.whitenTest?__hc.whitenTest():'no-hook')`).catch(e=>({err:String(e)}));
    R.beam   = await ev(page,`(__hc.beamTest?__hc.beamTest():'no-hook')`).catch(e=>({err:String(e)}));
    R.shard  = await ev(page,`(__hc.shardTest?__hc.shardTest():'no-hook')`).catch(e=>({err:String(e)}));

    // ---- portal (round-star RT) ----
    await ev(page,`__hc.forcePortal&&__hc.forcePortal()`).catch(()=>{}); await sleep(500);
    R.portal = await ev(page,`(__hc.portalInfo?__hc.portalInfo():'no-hook')`).catch(e=>({err:String(e)}));
    await page.screenshot({ path: path.join(OUT,'fin-portal.png') }).catch(()=>{});

    // ---- BOSS CORPSE FALL: it must NOT float — lands flat, small vertical box, near ground ----
    await ev(page,`__hc.heal&&__hc.heal()`);
    await ev(page,`__hc.killBoss&&__hc.killBoss()`); await sleep(300);
    let rs=[];
    for(let i=0;i<14;i++){ await ev(page,`__hc.heal&&__hc.heal()`); rs=await ev(page,`__hc.ragState()`); await sleep(350); }
    const bc = (rs||[]).find(r=>r.boss)||null;
    R.corpse = bc ? { landed:bc.landed, settled:bc.settled, aboveGround:bc.aboveGround, boxH:bc.boxH, underGround:bc.underGround, floatOK: bc.aboveGround<8, boxOK: bc.boxH<18, sinkOK: bc.underGround>-1.2 } : 'no boss corpse';
    await sleep(200); await page.screenshot({ path: path.join(OUT,'fin-corpse.png') }).catch(()=>{});

    R.pageErrors = errors;
    fs.writeFileSync(path.join(OUT,'finish.txt'), JSON.stringify(R,null,1));
    console.log(JSON.stringify(R,null,1));
    await browser.close();
  } catch(e){ console.error('FATAL', e.message); console.log(JSON.stringify({pageErrors:errors, partial:R})); process.exitCode=1; }
  finally { try{ server.kill(); }catch(e){} }
})();
