// BURIED / FLOATING DECORATION around a structure pad.
//  buried  = a cross block (bush/fern/grass/flower) with a SOLID block directly above it — it is inside the ground
//  floating= a cross block with AIR directly beneath it — it is standing on nothing
// Both are the same defect from opposite directions: groundStructure's cut only removes isSolid blocks and its fill
// only writes into AIR, and every cross block is solid:false, so decoration survives a pad being raised or lowered.
// usage: node bench/tmp-buriedeco.mjs [tag]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OUT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/b81b0b86-2fc5-472c-bd08-724753d453f0/scratchpad';
const TAG = process.argv[2] || 'buried';
const FLAGS = process.argv[3] ? ('&'+process.argv[3]) : '';
fs.mkdirSync(OUT, { recursive:true });

function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

const SCAN = (cx,cz,R) => `(()=>{
  const names={}; for(const k of __hc.bid()) names[__hc.bid(k)]=k;
  const CROSS=['bush','fern','tallgrass','meadow_grass','meadow_grass_tall','mush_red','mush_brown','foxglove','anemone','bellflower','sage','yarrow','bloodroot','berry','sapling']
    .map(n=>__hc.bid(n)).filter(v=>v!=null);
  const isCross=(b)=>CROSS.indexOf(b)>=0;
  const B=(x,y,z)=>__hc.blockAt(x,y,z)|0;
  const out={ cols:0, deco:0, buried:0, floating:0, ex:[] };
  for(let x=${cx}-${R}; x<=${cx}+${R}; x++) for(let z=${cz}-${R}; z<=${cz}+${R}; z++){
    const g=__hc.surfH(x,z);
    let any=false; for(let y=g-6;y<=g+30;y++) if(B(x,y,z)){ any=true; break; }
    if(!any) continue;
    out.cols++;
    for(let y=Math.max(2,g-8); y<=g+30; y++){
      const b=B(x,y,z); if(!b || !isCross(b)) continue;
      out.deco++;
      const above=B(x,y+1,z), below=B(x,y-1,z);
      if(above && !isCross(above)){ out.buried++; if(out.ex.length<10) out.ex.push({x,y,z,what:names[b],above:names[above]||above,kind:'buried'}); }
      else if(!below){ out.floating++; if(out.ex.length<10) out.ex.push({x,y,z,what:names[b],kind:'floating'}); }
    }
  }
  return out; })()`;

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl=`(()=>{try{const c=document.createElement('canvas');const g=c.getContext('webgl2')||c.getContext('webgl');if(!g)return 'NO';const e=g.getExtension('WEBGL_debug_renderer_info');return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):'?';}catch(e){return 'E';}})()`;
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,780']) });
      ctx=await browser.newContext({ viewport:{width:1280,height:720} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1&t=252&rd=8'+FLAGS, { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,null, {timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null, {timeout:90000});

    const v = await page.evaluate(`__hc.qaVillage()`);
    console.log('village spot', JSON.stringify(v.spot||v).slice(0,120));
    await sleep(5000);
    const P = await page.evaluate(`__hc.pos()`);
    const cx=Math.round(P.x), cz=Math.round(P.z);

    const a = await page.evaluate(SCAN(cx,cz,22));
    console.log('AT VILLAGE   cols='+a.cols, 'deco='+a.deco, 'buried='+a.buried, 'floating='+a.floating);
    if(a.ex.length) console.log('   ex', JSON.stringify(a.ex.slice(0,6)));

    // control: pristine ground far away — decoration there must be neither buried nor floating
    await page.evaluate(`__hc.tp(${cx+1500}, ${cz-1200})`); await sleep(10000);
    const Q = await page.evaluate(`__hc.pos()`);
    const b = await page.evaluate(SCAN(Math.round(Q.x),Math.round(Q.z),22));
    console.log('PRISTINE     cols='+b.cols, 'deco='+b.deco, 'buried='+b.buried, 'floating='+b.floating);
    if(b.ex.length) console.log('   ex', JSON.stringify(b.ex.slice(0,6)));

    fs.writeFileSync(path.join(OUT, TAG+'.json'), JSON.stringify({village:a, pristine:b},null,1));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
