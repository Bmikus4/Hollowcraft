import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('no')); else setTimeout(poll,250); }); })(); }); }
(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try {
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true, args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
    const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=210', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(1500);
    await page.evaluate(`__hc.ripTest && __hc.ripTest()`);   // summon the REAL seraph through the rip
    await sleep(7000);                                        // arrival cutscene + build
    await page.evaluate(`__hc.heal && __hc.heal()`);
    await page.evaluate(`__hc.killBoss && __hc.killBoss()`);  // real death → _startBossCorpse (seraph ragdoll)
    // capture a mid-fall frame, then sample the corpse settling
    await sleep(600);
    let rs=await page.evaluate(`__hc.ragState()`);
    let c=rs[0]||{x:0,y:0,z:0};
    await page.evaluate(`__hc.aimAt(${(rs[0]?rs[0].x:0)}, ${(rs[0]?rs[0].y+6:0)}, ${(rs[0]?rs[0].z:0)})`).catch(()=>{});
    await sleep(300); await page.screenshot({ path: path.join(OUT,'bosscorpse-fall.png') });
    const fall=[];
    for(let i=0;i<10;i++){ await page.evaluate(`__hc.heal && __hc.heal()`); const s=await page.evaluate(`__hc.ragState()`); fall.push(s.map(r=>r.y+(r.settled?'S':r.landed?'L':'.'))); await sleep(400); }
    rs=await page.evaluate(`__hc.ragState()`); c=rs[0]||{x:0,y:0,z:0};
    await page.evaluate(`__hc.aimAt(${c.x||0}, ${(c.y||0)+3}, ${c.z||0})`); await sleep(500);
    await page.screenshot({ path: path.join(OUT,'bosscorpse.png') });
    console.log(JSON.stringify({ fall, corpse:rs, errors }));
    await browser.close(); process.exit(0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
