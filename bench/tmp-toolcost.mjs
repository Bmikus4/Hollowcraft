// PROBE (not an assertion): what does the 3D icon bake cost at cold load, and what does a tool model cost inside it?
// #75's hard budget: icon3DURL was measured spending 6.9s of an 8.5s cold load. Run this BEFORE and AFTER any
// change to a tool builder and put both numbers in the commit. Reads __hcPERF.iconCost() (count/model/render/readback/encode).
// usage: node bench/tmp-toolcost.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

const TOOLS=[];
for(const t of ['wood','stone','iron','diamond']) for(const k of ['pickaxe','axe','shovel','sword']) TOOLS.push(t+'_'+k);
TOOLS.push('wooden_spear','rusty_spear');

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:900,height:600} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=920,640']) });
      ctx=await browser.newContext({ viewport:{width:900,height:600} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    const t0=Date.now();
    await page.goto(base+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    const tLoad=Date.now()-t0;
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:180000});
    const tStart=Date.now()-t0;
    // the preload gate bakes icons in slices; let it drain
    let prev=-1, settled=0;
    for(let i=0;i<120;i++){ await sleep(250); const c=await page.evaluate('__hcPERF.iconCost()');
      if(i%8===0) console.log('  t+'+((Date.now()-t0)/1000).toFixed(1)+'s  icons='+c.count+'  bakeMs='+c.totalMs);
      if(c.count===prev){ if(++settled>=16) break; } else settled=0; prev=c.count; }
    const tBake=Date.now()-t0;
    const cost=await page.evaluate('__hcPERF.iconCost()');

    console.log('COLD LOAD');
    console.log('  load event        '+tLoad+'ms');
    console.log('  started           '+tStart+'ms');
    console.log('  icon bake settled '+tBake+'ms');
    console.log('ICON BAKE  '+JSON.stringify(cost));
    console.log('  per icon          '+(cost.totalMs/Math.max(1,cost.count)).toFixed(2)+'ms');

    // per-tool triangle count — the thing that actually grows when a builder gets richer
    const tri=await page.evaluate(`(()=>{const out={};for(const id of ${JSON.stringify(TOOLS)}){
      const s=__hc.toolSig(id); out[id]=s.err?{err:s.err}:{tris:s.tris}; } return out;})()`);
    console.log('PER-TOOL GEOMETRY');
    let total=0;
    for(const id of TOOLS){ const r=tri[id]||{}; if(r.err){ console.log('  '+id.padEnd(16)+'ERR '+r.err); continue; }
      total+=r.tris; console.log('  '+id.padEnd(16)+String(r.tris).padStart(6)+' tris'); }
    console.log('  '+'TOTAL'.padEnd(16)+String(total).padStart(6)+' tris');

    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
