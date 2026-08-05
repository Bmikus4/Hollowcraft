// How many props does propCull actually hide, and does hiding them change the draw count? A cull that hides
// nothing is a no-op whatever the frame times say, and the frame times here said nothing either way.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core'; import { HELPERS } from './perf-census.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1920,height:1080}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?perf=1&debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm(); window.__benchInfo=1;`); await page.evaluate(HELPERS);
    const at = async (label, js, dists) => {
      await page.evaluate(js);
      for(let i=0;i<60;i++){ const ok=await page.evaluate(`(()=>{const f=__hc.fill(); return f.meshed>=f.want;})()`); if(ok) break; await sleep(500); }
      await sleep(3000);
      console.log(`\n${label}`);
      for(const R of dists){
        await page.evaluate(`__hcPERF.set('propCullDist', ${R})`);
        await sleep(700);
        const d = await page.evaluate(`(()=>{ const c=__hcPERF.drawCensus(); return { hidden:c.propsHidden, considered:c.propsConsidered, drawables:c.drawables, draws:__hc.perf().calls, layers:__hc.layers({}) }; })()`);
        console.log(`  reach ${String(R).padStart(5)}:  hides ${String(d.hidden).padStart(4)} of ${String(d.considered).padStart(4)} scene meshes   drawables ${d.drawables}   draws ${d.draws}   horizon layers ${JSON.stringify(d.layers)}`);
      }
      await page.evaluate(`__hcPERF.set('propCullDist', 0)`);
    };
    await at('DUNGEON HALL (40 m underground)', `goDungeon('hall'); H.cam({yaw:0.7,pitch:0}); H.lock(true);`, [-1, 64, 32, 16]);
    await at('SPAWN, looking at the horizon',   `atSpawn(); H.cam({yaw:0.7,pitch:-0.05}); H.setTime(0.35); H.lock(true);`, [-1, 64, 32]);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
