// PROBE: does the worn backpack actually appear on the player's back, and does it read as a bag?
//
// The only check that counts here is a frame. The offhand shield passed every state assertion for a day while sitting
// inside the camera's near plane and being clipped away — "the mesh exists and is tagged" said nothing about whether a
// human could see it. So this renders the inventory player model at front, back and both sides, worn and not worn.
//
// usage: node bench/tmp-packlook.mjs   -> bench/results/pack-*.png
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
const A = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:A });
    let ctx=await browser.newContext({ viewport:{width:1000,height:760} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:A.concat(['--window-position=-32000,-32000','--window-size=1020,800']) });
      ctx=await browser.newContext({ viewport:{width:1000,height:760} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1&rd=4', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(3000);
    await page.evaluate('__hc.eqUI("inv")');
    await sleep(600);

    const shoot = async (tag, yaw) => {
      const st = await page.evaluate('__hc.pview('+yaw+')');
      await sleep(250);
      const el = await page.$('#pview');
      if(el) await el.screenshot({ path: path.join(OUT,'pack-'+tag+'.png') });
      console.log('  '+tag.padEnd(14)+' '+JSON.stringify(st));
    };

    console.log('NOT WORN (bag in inventory only):');
    await page.evaluate('__hc.eqPut(5,null)');
    await page.evaluate('__hc.giveItem("backpack",1)');
    await shoot('off-front', 0);

    console.log('WORN in EQ_PACK:');
    await page.evaluate('__hc.eqPut(5,"backpack")');
    await shoot('worn-front',  0);
    await shoot('worn-back',   Math.PI);
    await shoot('worn-left',   Math.PI/2);
    await shoot('worn-right', -Math.PI/2);
    await shoot('worn-3q',     Math.PI*0.78);

    // and with armour on, to check the bag does not fight the chestplate overlay
    await page.evaluate('__hc.eqPut(1,"iron_chestplate")');
    await shoot('worn-armour-back', Math.PI);
    console.log('shots: bench/results/pack-*.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
