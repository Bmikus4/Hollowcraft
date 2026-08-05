// FIX-LIST #8 (the visual knobs in the MAIN-MENU settings) plus a look at #3 (cabin) and #6 (shrubs) in one pass.
// Batched deliberately: one server, one browser, one world stream, four shots.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:900}})).newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:',String(e.message||e).slice(0,200)); });
    // NO ?debug=1 here: that flag auto-enters the world, and the whole point of this probe is the MENU panel
    await page.goto(base+'/index.html?t=210',{waitUntil:'load',timeout:90000});   // t=210 of DAY_LEN 840 = midday, so the shots are readable
    // ---- 1. the MAIN-MENU Settings panel now carries the VISUALS section ----
    await page.waitForSelector('#mb-settings',{state:'visible',timeout:120000});
    await sleep(1500);
    await page.click('#mb-settings'); await sleep(1200);
    const panel=await page.evaluate(`(()=>{ const el=document.getElementById('menuvisuals');
      const labels=[...el.querySelectorAll('span')].map(s=>s.textContent).filter(t=>t&&t.length>2&&!t.endsWith('%'));
      return { sliders:el.querySelectorAll('input[type=range]').length, reset:el.querySelectorAll('button').length,
               visible:getComputedStyle(document.getElementById('set-panel')).display!=='none', labels }; })()`);
    T('main-menu Settings shows all six visual sliders', panel.sliders===6, panel);
    T('…and a reset button', panel.reset===1);
    await page.screenshot({path:path.join(OUT,'menu-visuals.png')});

    // a drag must move the live uniform, and reset must put it back
    const knob=await page.evaluate(`(()=>{ const s=document.getElementById('menuvisuals').querySelector('input[type=range]');
      s.value=0.5; s.dispatchEvent(new Event('input')); const hi=__hc.vis().skydark;
      const b=document.getElementById('menuvisuals').querySelector('button'); b.click(); return {hi, after:__hc.vis().skydark}; })()`);
    T('a drag drives the live sky uniform', knob.hi===0.5, knob);
    T('reset returns it to the shipped default', knob.after===0.2, knob);

    // ---- 2 & 3. into the world: the cabin (#3) and a shrub close-up (#6) ----
    await page.click('#set-panel [data-back]'); await sleep(400);   // both hidden panels carry a back button — scope it
    await page.click('#mb-solo');
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await sleep(3000); await page.evaluate(`__hc.cineKill&&__hc.cineKill()`);
    await page.evaluate(`__hc.hud(false)`); await sleep(500);

    // MIDDAY, set on the live clock: the ?t= URL param is read at load, and entering a world from the menu moves past it.
    await page.evaluate(`__hc.setTime(0.5)`);
    // the cabin stands at spawn+22, spawn-14 with its door facing +z — stand off to the south and look at the facade.
    // tp() ground-snaps the BODY (+2) and the eye rides EYE above that, so the look target must sit BELOW the body y or
    // the shot points at the canopy — which is exactly what the first two attempts framed.
    const cab=await page.evaluate(`(()=>{ const p=__hc.st(), cx=p.sx+22.5, cz=p.sz-13.5;
      const t=__hc.tp(cx, cz+13); return {t, cx, cz}; })()`);
    await sleep(3000);
    await page.evaluate(`(()=>{ const c=${JSON.stringify(cab)}; __hc.setTime(0.5); __hc.look(c.cx, c.t.y-0.4, c.cz); })()`);
    await sleep(1200);
    await page.screenshot({path:path.join(OUT,'cabin.png')});
    const rifle=await page.evaluate(`__hc.propsRifle()`);
    T('the cabin is built (its racked rifle exists)', !rifle.err, rifle.err||{x:rifle.x});

    // shrubs: stand on the forest floor and look down the ground line, where a sunk plant shows as a clipped base
    const sh=await page.evaluate(`(()=>{ const p=__hc.st(); return __hc.tp(p.sx+40, p.sz+40); })()`);
    await sleep(2500);
    await page.evaluate(`(()=>{ const t=${JSON.stringify(sh)}; __hc.setTime(0.5); __hc.look(t.x+3.5, t.y-2.0, t.z+3.5); })()`);
    await sleep(1200);
    await page.screenshot({path:path.join(OUT,'shrubs.png')});

    T('no page errors', errs.length===0, errs.slice(0,3));
    await browser.close();
  } finally { server.kill(); }
  console.log(fails? ('FAILURES: '+fails) : 'ALL GREEN');
  process.exit(fails?1:0);
})();
