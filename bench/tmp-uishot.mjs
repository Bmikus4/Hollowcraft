// Shots of the reskinned UI: main menu, the settings panel, the pause card, and the HUD in play.
// usage: node bench/tmp-uishot.mjs  -> bench/results/ui-*.png
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\Code\\Minecraft', OUT = path.join(ROOT, 'bench', 'results');
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ Date.now()-t0>t?rej(new Error('down')):setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720}});
    const page=await ctx.newPage();
    const bad=[]; page.on('pageerror',e=>bad.push('PAGEERROR '+e));
    page.on('response',r=>{ if(r.status()>=400 && /assets\/ui\//.test(r.url())) bad.push('HTTP '+r.status()+' '+r.url()); });
    await page.goto(base+'/index.html',{waitUntil:'load'});
    await sleep(3500);
    await page.screenshot({path:path.join(OUT,'ui-menu.png')});
    // The hover must not resize the button: measure it cold, hover it, measure again.
    const cold=await page.evaluate(()=>{const r=document.getElementById('mb-solo').getBoundingClientRect();return {w:+r.width.toFixed(1),h:+r.height.toFixed(1)};});
    await page.hover('#mb-solo'); await sleep(500);
    const hot=await page.evaluate(()=>{const r=document.getElementById('mb-solo').getBoundingClientRect();return {w:+r.width.toFixed(1),h:+r.height.toFixed(1)};});
    console.log('hover size', JSON.stringify({cold,hot,same:cold.w===hot.w&&cold.h===hot.h}));
    await page.screenshot({path:path.join(OUT,'ui-menu-hover.png'),clip:{x:440,y:250,width:420,height:300}});
    await page.mouse.move(10,10); await sleep(300);
    await page.click('#mb-settings'); await sleep(600);
    await page.screenshot({path:path.join(OUT,'ui-settings.png')});
    await page.evaluate(()=>document.querySelector('#set-panel [data-back]').click()); await sleep(400);
    await page.click('#mb-solo');
    for(let i=0;i<90;i++){ if(await page.evaluate(()=>window.__hc&&window.__hc.loadState().circleDone)) break; await sleep(500); }
    await sleep(2500);
    await page.evaluate(()=>window.__hc.hudVitals({health:14,hunger:11,water:17,stam:60}));
    await page.evaluate(()=>window.__hc.hudCompass(-35));
    await sleep(400);
    await page.screenshot({path:path.join(OUT,'ui-hud.png')});
    await page.evaluate(()=>{ const b=document.getElementById('vitals').getBoundingClientRect(); window.__vb={x:b.x,y:b.y,w:b.width,h:b.height}; });
    const vb=await page.evaluate(()=>window.__vb);
    await page.screenshot({path:path.join(OUT,'ui-vitals-crop.png'),clip:{x:Math.max(0,vb.x-10),y:Math.max(0,vb.y-10),width:vb.w+30,height:vb.h+20}});
    await page.screenshot({path:path.join(OUT,'ui-compass-crop.png'),clip:{x:340,y:0,width:600,height:60}});
    // Escape only pauses out of pointer lock, which a headless page never has: open the card the way the lock-change
    // handler does instead.
    await page.evaluate(()=>{ try{ buildPauseSettings(); }catch(e){} document.getElementById('pause').style.display='flex'; });
    await sleep(700);
    await page.screenshot({path:path.join(OUT,'ui-pause.png')});
    console.log(bad.length?bad.slice(0,12).join('\n'):'clean: no page errors, no missing assets/ui files');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})();
