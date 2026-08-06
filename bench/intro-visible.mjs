// ARE THE INTRO CINEMATICS ACTUALLY ON SCREEN, and is the loading circle up while the world renders? Ben: "intro
// cinematics are invisible, and the circular loading screen should be visible when a player loads in for about 20s
// while the world renders."
//
// This is a LOOKING instrument, not a counter: it drives the real menu button and writes PNGs, because "the cinematic
// is invisible" is a claim about pixels and no probe can stand in for the frame. Alongside each shot it records what
// the DOM thinks is up (#boot, #load, the letterbox) and what the intro state machine says its phase is, so an
// invisible cinematic can be told apart from an absent one.
//
// usage: node bench/intro-visible.mjs [outdir]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = process.argv[2] || path.join(ROOT,'bench','results','intro');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u,t=20000)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>t?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

const STATE = `(()=>{ const g=id=>{ const e=document.getElementById(id); if(!e) return null;
    const cs=getComputedStyle(e); return { disp:cs.display, op:+cs.opacity, z:cs.zIndex, vis:cs.visibility }; };
  // The letterbox is read from __hc.intro() below, not sniffed out of the DOM. Two attempts at sniffing it both
  // reported an overlay present at the MENU, where _introDOM cannot have run: matching on inline z-index 30 hit some
  // other element, and matching a div's PARENT by text hit <body>, whose textContent contains every string in the page.
  const lb=null;
  return { boot:g('boot'), load:g('load'), letterbox: lb? {disp:getComputedStyle(lb).display} : null,
           started:(window.__hc? __hc.st().started : null),
           intro:(window.__hc && __hc.intro? __hc.intro() : 'NO HOOK'),
           menuShot:(window.__hc && __hc.menuShot? __hc.menuShot() : null),
           load2:(window.__hc? __hc.loadState() : null) }; })()`;

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,180)));
    // NO ?debug: that auto-starts the session and skips the menu entirely, which is the very thing under test.
    await page.goto(base+'/index.html',{waitUntil:'load',timeout:120000});   // NO ?t: the boot time of day is part of what a player sees
    await page.waitForFunction(`(()=>{try{return !!window.__hc;}catch(e){return false;}})()`,null,{timeout:120000});

    // REAL ELAPSED SINCE THE CLICK, printed with every sample. The first version labelled samples by their intended
    // sleep, and a 1080p screenshot plus two evaluates costs a good fraction of a second each — so "play-12s" was
    // nowhere near 12 s and the hold could not be checked against the 20 s it is supposed to last.
    let _clickAt=0;
    const shot = async (name) => { const f=path.join(OUT,name+'.png');
      await page.screenshot({path:f});
      const st=await page.evaluate(STATE);
      const el=_clickAt? ((Date.now()-_clickAt)/1000).toFixed(1)+'s' : '-';
      console.log(name.padEnd(14)+' @'+el.padStart(6)+'  boot='+JSON.stringify(st.boot&&st.boot.disp)+' load='+JSON.stringify(st.load&&st.load.disp)+
                  ' letterbox='+JSON.stringify(st.letterbox&&st.letterbox.disp)+' started='+st.started+
                  '  intro='+JSON.stringify(st.intro)+'  menuShot='+JSON.stringify(st.menuShot));
      return st; };

    console.log('--- THE MENU. The flythrough is meant to play BEHIND a translucent #boot.');
    await sleep(4000); await shot('00-menu-4s');
    await sleep(7000); await shot('01-menu-11s');

    console.log('\n--- PRESS "Enter the Wood" (the real button, not a hook)');
    await page.click('#mb-solo'); _clickAt=Date.now();
    let at=0;
    for(const t of [0.5, 1, 2, 3, 5, 8, 12, 16, 20, 24]){ await sleep(Math.max(0, t*1000-at)); at=t*1000;
      await shot('play-'+String(t).replace('.','p')+'s'); }
    console.log('\nPNGs in '+OUT);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
