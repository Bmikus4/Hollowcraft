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
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,180)));
    const cons=[]; page.on('console', m=>{ if(m.type()==='error') cons.push(m.text().slice(0,180)); });
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=210', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(3000);
    // spawn coords
    const sp = await page.evaluate(`(()=>{ try{ return __hc.st(); }catch(e){ return {e:e.message}; } })()`);
    await page.screenshot({ path: path.join(OUT,'load-spawn.png') });
    // visit structures: cabin (+22,-14), dungeon (+95,+70), inland (+150,+150)
    const sx=sp.sx||0, sz=sp.sz||0;
    const spots=[['cabin',22,-14],['dungeon',95,70],['inland',150,150]];
    const shots={};
    for(const [name,dx,dz] of spots){
      const r=await page.evaluate(`__hc.tpExact(${sx+dx}, ${sz+dz})`);
      await sleep(6000);   // let it stream
      await page.evaluate(`__hc.pitch && __hc.pitch(-0.1)`); await sleep(300);
      await page.screenshot({ path: path.join(OUT,'load-'+name+'.png') });
      shots[name]=r;
    }
    console.log(JSON.stringify({ started:sp&&sp.started, spots:shots, pageErrors:errors.slice(0,10), consoleErrors:cons.slice(0,10) }));
    await browser.close(); process.exit(0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
