// DOES ?cine=1 GIVE A CLEAN RECORDING? (Ben 08-05: "whip up a rendered cinematic of these with NO game menu, I will
// record it, then we just make it the background.") The whole value of the mode is that there is NOTHING on screen but
// the world, so this checks two things a person cannot check by eye in one pass: that every overlay is gone, and that no
// shot is showing before its chunks are meshed — the empty cabin shot was exactly that failure.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = process.argv[2] || path.join(ROOT,'bench','results','cine');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u,t=20000)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>t?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
// Anything that paints over the viewport. Checked by COMPUTED style, so a rule in the stylesheet counts the same as an
// inline one, and a hidden parent is caught through the offsetParent test rather than assumed from the id list.
const UI = `(()=>{ const ids=['boot','load','pause','death','objhud','prof','director','err','xh','bgvid','menucard','tip','hotbar'];
  const on=[]; for(const id of ids){ const e=document.getElementById(id); if(!e) continue;
    const cs=getComputedStyle(e); if(cs.display!=='none' && cs.visibility!=='hidden' && +cs.opacity>0.02 && e.getClientRects().length) on.push(id); }
  // and anything else big and visible that is not the canvas
  for(const e of document.body.children){ if(e.tagName==='CANVAS'||e.tagName==='SCRIPT'||e.tagName==='STYLE') continue;
    const cs=getComputedStyle(e); const r=e.getBoundingClientRect();
    if(cs.display!=='none' && cs.visibility!=='hidden' && +cs.opacity>0.02 && r.width>200 && r.height>80 && !on.includes(e.id)) on.push(e.id||('<'+e.tagName.toLowerCase()+'>')); }
  return on; })()`;
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
    page.on('console',m=>{ const t=m.text(); if(t.startsWith('[cine]')) console.log('  '+t); });
    await page.goto(base+'/index.html?cine=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return !!window.__hc;}catch(e){return false;}})()`,null,{timeout:120000});
    const t0=Date.now(); let worstUI=[];
    for(let i=0;i<14;i++){
      await sleep(4000);
      const ui=await page.evaluate(UI);
      const el=((Date.now()-t0)/1000).toFixed(0);
      await page.screenshot({path:path.join(OUT,'cine-'+String(el).padStart(3,'0')+'s.png')});
      if(ui.length>worstUI.length) worstUI=ui;
      console.log('@'+el.padStart(3)+'s  visible UI: '+(ui.length? ui.join(',') : 'NONE'));
    }
    console.log('\nRESULT: '+(worstUI.length? 'UI ON SCREEN — '+worstUI.join(',') : 'CLEAN — no overlay at any sample'));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
