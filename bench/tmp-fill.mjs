// PROBE (not an assertion): how long a cold boot takes to put a visible world on screen, and where that time goes.
//
// Times the wall-clock from navigation to the render ring being MESHED -- a chunk that exists but has no mesh is invisible,
// so counting resident chunks overstates progress badly. Also reports generation and meshing unit counts side by side,
// which is what exposed the real finding: generation runs ~211 units before meshing gets its 2nd, because both share one
// frame deadline and generation is scheduled first. The two phases run strictly serially and the wait is their sum.
//
// Deliberately NOT an assert-*: there is no shipped fix here to guard, only a measured baseline (~12.2 s at rd=6).
//
// usage: node bench/tmp-fill.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const FLAGS = process.argv[2] ? ('&'+process.argv[2]) : '';
const KILLED = false;   // this is a PROBE, not an assertion: there is no fix here to guard, only a number to report
const FILL_LIMIT_MS = 6000;   // the ring must be resident within this. Pre-fix measured ~10-11 s; post-fix ~2-3 s.

function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  let fail=false; const pageErrors=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:900,height:600} }); let page=await ctx.newPage();
    page.on('pageerror', e=>{ const m=String(e.message||e).slice(0,300); pageErrors.push(m); console.log('PAGEERROR:', m); });
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=920,640']) });
      ctx=await browser.newContext({ viewport:{width:900,height:600} }); page=await ctx.newPage();
      page.on('pageerror', e=>{ const m=String(e.message||e).slice(0,300); pageErrors.push(m); console.log('PAGEERROR:', m); });
    }

    const t0=Date.now();
    await page.goto(base+'/index.html?debug=1'+FLAGS, { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:120000});
    const tStart=Date.now()-t0;
    console.log('started at '+tStart+'ms');

    // Poll until the ring is resident, or the limit is blown.
    let full=null, samples=[];
    for(let i=0;i<80;i++){
      const f = await page.evaluate('__hc.fill()');
      const el = Date.now()-t0;
      if(i%4===0) samples.push('  t+'+String((el/1000).toFixed(1)).padStart(5)+'s  meshed='+String(f.meshed).padStart(4)+'/'+f.want
        +'  fps='+String(f.fps).padStart(3)+'  mesh='+f.meshMS+'ms gen='+f.genMS+'ms'
        +'  units g/m='+f.genUnits+'/'+f.meshUnits+(f.filling?'  [FILLING]':''));
      if(f.meshed>=f.want){ full=el; break; }
      if(el>FILL_LIMIT_MS+9000) break;
      await sleep(250);
    }
    samples.forEach(s=>console.log(s));
    const F = await page.evaluate('__hc.fill()');
    console.log('render distance '+F.rd+'  ring '+F.ring+' chunks');

    if(full==null) console.log('ring NEVER became fully visible within the poll window');
    else console.log('ring fully MESHED (visible) at '+full+'ms');
    if(pageErrors.length){ console.log('page errors: '+pageErrors.length); fail=true; }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }

  process.exit(fail?1:0);   // non-zero only on a page error, never on the timing itself — this reports, it does not judge
})().catch(e=>{ console.error(e); process.exit(1); });
