// PROBE (not an assertion): #75's AUDIT TABLE, built by the game rather than from memory.
// Every tool (4 kinds x 4 tiers, plus the two spears) x its representations:
//   icon   — does the hotbar show the 3D bake or the flat TOOLPIX sprite?
//   model  — the itemModel dispatch (hotbar icon / ground drop / a peer's hand)
//   held   — the viewmodel's SEPARATE dispatch (your own hands)
// The columns that matter are whether model and held DISAGREE, and which material each uses (Lambert takes no
// specular highlight — that is what "the swords are dull" means in code).
// usage: node bench/tmp-tool-audit.mjs
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

const TIERS=['wood','stone','iron','diamond'], KINDS=['pickaxe','axe','shovel','sword'];
const IDS=[]; for(const t of TIERS) for(const k of KINDS) IDS.push(t+'_'+k);
IDS.push('wooden_spear','rusty_spear');
const matStr = m => Object.keys(m||{}).map(k=>k.replace('Mesh','').replace('Material','')+':'+m[k]).join(' ');

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
    await page.goto(base+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:180000});
    await sleep(1500);

    const rows=[];
    for(const id of IDS){
      // SYNCHRONOUS, no frame wait: the main loop calls setViewItem(inv[selSlot]) EVERY frame, and hold() can only
      // reach the hotbar for the first 9 items — wait a frame and every later row reads back the 9th tool's model.
      const r=await page.evaluate(`(()=>{ __hc.hold(${JSON.stringify(id)});
        return { icon:__hc.iconRoute(${JSON.stringify(id)}), model:__hc.toolSig(${JSON.stringify(id)}), held:__hc.heldSig() }; })()`);
      rows.push({id, ...r});
    }

    console.log('id                icon   model(meshes/tris/mats)                    held(meshes/tris/mats)                     agree');
    let disagree=0, lambertOnly=0;
    for(const r of rows){
      const m=r.model, h=r.held;
      const ms=(m.meshes+'/'+m.tris+' '+matStr(m.mats)).padEnd(42);
      const hs=(h.meshes+'/'+h.tris+' '+matStr(h.mats)).padEnd(42);
      // the held form wraps the model in a posing Group, so mesh count and triangles are the comparable part
      const same = m.meshes===h.meshes && m.tris===h.tris;
      if(!same) disagree++;
      if(m.mats && m.mats.MeshPhongMaterial===undefined && !m.sprite) lambertOnly++;
      console.log(r.id.padEnd(16)+' '+(r.icon.threeD?'3D  ':'2D  ')+' '+ms+' '+hs+' '+(same?'yes':'NO')+(m.sprite?'  [SPRITE]':''));
    }
    console.log('\n'+disagree+' of '+rows.length+' disagree between the two dispatches');
    console.log(lambertOnly+' of '+rows.length+' have NO Phong material at all (cannot take a specular highlight)');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
