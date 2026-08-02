// PROBE: are the ~36 shader programs that compile in play THIRTY-SIX distinct material configurations legitimately
// appearing as new content scrolls into view, or a handful of configurations being RECOMPILED because something mutates
// a material property mid-flight?
//
// Those have opposite fixes, so no fix should be attempted before this is answered.
//
// Two discriminators, both cheap:
//   1. DISTINCT keys vs TOTAL compiles over the same window. three caches on cacheKey, so a repeat of an existing key is
//      free and never appears as a new program. Total far exceeding distinct therefore means churn -- a program being
//      built, released and built again -- which shows up as the live program count NOT rising while compiles happen.
//   2. Field-by-field diff of the full cache keys. The key is positional and comma-joined, so the fields that vary across
//      the in-play set name the thing responsible. If the in-play keys are near-duplicates of loading-screen keys
//      differing in ONE field, that field is being mutated after the fact; if they differ in many, it is new content.
//
// usage: node bench/tmp-shaderdiff.mjs
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
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
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
    await page.goto(base+'/index.html?debug=1&perf=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:120000});

    // Track EVERY program id ever seen, and the live count, so churn (built then released) is distinguishable from growth.
    const everSeen=new Map();   // id -> {t, key, phase}
    let peakLive=0, readyAt=null, samples=0;
    const sample=async()=>{
      const rows=await page.evaluate('__hc.shaderKeys()');
      const st=await page.evaluate('__hc.loadState()');
      const el=Date.now()-t0; samples++;
      if(st.initialReady && !readyAt) readyAt=el;
      peakLive=Math.max(peakLive,rows.length);
      for(const r of rows) if(!everSeen.has(r.id)) everSeen.set(r.id,{t:el, key:r.key, phase:readyAt?'play':'loading'});
      return rows.length;
    };
    for(let i=0;i<50;i++){ const n=await sample();
      const f=await page.evaluate('__hc.fill()');
      if(f.meshed>=f.want && readyAt && Date.now()-t0>readyAt+4000) break;
      await sleep(400); }
    // look around so more of the world is drawn into frame
    for(const y of [1.6,3.1,4.7,0]){ await page.evaluate('__hc.look('+y+',0)').catch(()=>{}); await sleep(1400); await sample(); }
    await sleep(3000); const finalLive = await sample();

    const all=[...everSeen.values()];
    const play=all.filter(r=>r.phase==='play');
    const load=all.filter(r=>r.phase==='loading');
    const distinctPlay=new Set(play.map(r=>r.key));
    console.log('\n=== DISCRIMINATOR 1: churn vs new content ===');
    console.log('program ids ever seen: '+all.length+'   live at end: '+finalLive+'   peak live: '+peakLive);
    console.log('  behind loading screen: '+load.length+'   in play: '+play.length);
    console.log('  DISTINCT keys among the in-play programs: '+distinctPlay.size+' of '+play.length);
    console.log('  ids ever seen minus peak live = '+(all.length-peakLive)+'  (>0 means programs were RELEASED and rebuilt = churn)');

    // ---- DISCRIMINATOR 2: which fields vary ----
    const split=k=>k.split(',');
    const fieldsVarying=(rows)=>{ if(!rows.length) return [];
      const cols=Math.max(...rows.map(r=>split(r.key).length)), out=[];
      for(let i=0;i<cols;i++){ const vals=new Set(rows.map(r=>split(r.key)[i])); if(vals.size>1) out.push({i, n:vals.size, vals:[...vals].slice(0,6)}); }
      return out; };
    console.log('\n=== DISCRIMINATOR 2: which key fields differ across the in-play set ===');
    const vary=fieldsVarying(play);
    console.log('in-play programs differ in '+vary.length+' of '+(play.length?split(play[0].key).length:0)+' key fields');
    for(const v of vary.slice(0,18)) console.log('  field '+String(v.i).padStart(3)+'  '+v.n+' distinct  '+JSON.stringify(v.vals));

    // Is each in-play key a NEAR-DUPLICATE of something already compiled behind the loading screen?
    console.log('\n=== are the in-play keys near-duplicates of loading-screen keys? ===');
    const hamming=(a,b)=>{ const A=split(a), B=split(b), n=Math.max(A.length,B.length); let d=0, where=[];
      for(let i=0;i<n;i++) if(A[i]!==B[i]){ d++; if(where.length<4) where.push(i+':'+A[i]+'->'+B[i]); } return {d,where}; };
    let nearDup=0;
    for(const p of play){ let best={d:1e9,where:[]};
      for(const l of load){ const h=hamming(l.key,p.key); if(h.d<best.d) best=h; }
      if(best.d<=2){ nearDup++; console.log('  t+'+String(p.t).padStart(6)+'ms  differs from a loading-screen program in '+best.d+' field(s): '+JSON.stringify(best.where)); }
    }
    console.log('  '+nearDup+' of '+play.length+' in-play programs are within 2 fields of one already compiled');
    fs.writeFileSync(path.join(OUT,'shaderdiff.json'), JSON.stringify(all,null,1));
    console.log('\nfull keys written to bench/results/shaderdiff.json');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
