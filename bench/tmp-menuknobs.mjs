// LOOK AT THE MAIN-MENU SETTINGS PANEL. Ben: put the menu knobs back in. Before adding anything, the question is whether
// they are there at all: buildMenuVisuals() exists and is called at boot, and the backlog note saying they were REMOVED is
// second-hand. A panel that builds into a container nobody can see is the same class of bug as a mesh drawn off screen.
//
// usage: node bench/tmp-menuknobs.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1200,height:900} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,200)));
    // NO ?debug — that auto-starts the game and skips the menu entirely, which is the thing being looked at.
    await page.goto(base+'/index.html', { waitUntil:'load', timeout:90000 });
    await sleep(6000);
    await page.screenshot({ path: path.join(OUT,'menuknobs-main.png') });

    // Open Settings from the main menu, the way a player does.
    const clicked = await page.evaluate('(()=>{ const b=document.getElementById("mb-settings"); if(!b) return "no button"; b.click(); return "clicked"; })()');
    console.log('settings button: '+clicked);
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT,'menuknobs-settings.png') });

    // What is actually IN the panel, and is any of it on screen? getBoundingClientRect is the honest test: a container can
    // exist, hold children, and still be zero-height or clipped out of the card.
    const state = await page.evaluate(`(()=>{
      const panel=document.getElementById('set-panel'), host=document.getElementById('menuvisuals'), legacy=document.getElementById('settings');
      const r=el=>{ if(!el) return null; const b=el.getBoundingClientRect(); const s=getComputedStyle(el);
        return { w:Math.round(b.width), h:Math.round(b.height), top:Math.round(b.top), display:s.display, visible:s.visibility, kids:el.children.length }; };
      const labels=[...document.querySelectorAll('#menuvisuals *')].map(e=>e.textContent).filter(t=>t&&t.length<40&&/[A-Za-z]/.test(t));
      return { panel:r(panel), menuvisuals:r(host), legacySettingsDiv:r(legacy), labels:[...new Set(labels)].slice(0,14) }; })()`);
    console.log(JSON.stringify(state,null,1));
    console.log('shots: bench/results/menuknobs-main.png, menuknobs-settings.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
