// BOTTLENECK MATRIX — GPU Gems 2, ch.28. Deliberately starve one pipeline stage at a time and read the delta.
// A stage that can be starved with no change in frame time is not the bottleneck. Run in the overworld, at the
// portal, and in the Backrooms, because the three have different answers.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT  = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

const SETTLE = 2500;                       // let the pipeline reach steady state before sampling
async function sample(page, label){
  await page.evaluate(`window.__hcPERF.reset()`);
  await sleep(SETTLE);
  const s = await page.evaluate(`window.__hcPERF.live()`);
  const c = await page.evaluate(`window.__hcPERF.census()`);
  return { label, median:s.median, p99:s.p99, drawables:c.drawables, shadowFaces:c.shadowFaces };
}

// each experiment: apply, sample, revert. Never leave two experiments on at once (one change per measurement).
const EXPERIMENTS = [
  { id:'baseline',  on:null, off:null,
    why:'reference for this world' },
  { id:'fill 1%',   on:`window.__hcPERF.fill(0.1)`,     off:`window.__hcPERF.fill(1)`,
    why:'1% of the pixels — flat response means NOT fragment/fill bound' },
  { id:'nullFrag',  on:`window.__hcPERF.nullFrag(true)`, off:`window.__hcPERF.nullFrag(false)`,
    why:'one untextured material everywhere — flat means NOT shader/texture bound' },
  { id:'halfObj',   on:`window.__hcPERF.halfObj(true)`,  off:`window.__hcPERF.halfObj(false)`,
    why:'half the drawables — halving means per-object submission bound' },
  { id:'noShadow',  on:`window.__hcPERF.noShadow(true)`, off:`window.__hcPERF.noShadow(false)`,
    why:'no shadow-casting lights — isolates the extra-pass multiplier' },
];

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  const out={};
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?perf=1&debug=1&t=210&brseed=20260728',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:180000});
    await page.evaluate(`window.__hcPERF.arm()`);
    await sleep(3000);

    const WORLDS = [
      { id:'overworld', enter:null },
      { id:'portal',    enter:`window.__hcPERF.spawnDoor()` },
      { id:'backrooms', enter:`window.__hcPERF.enterBR()` },
    ];
    for(const w of WORLDS){
      if(w.enter){ await page.evaluate(w.enter); await sleep(4000); }
      // park somewhere representative and hold still — the matrix measures render cost, not motion
      if(w.id==='portal') await page.evaluate(`(()=>{const d=window.__hcBR&&BR.door; if(d){ __hcPERF.arm(); } return true;})()`).catch(()=>{});
      const rows=[];
      for(const e of EXPERIMENTS){
        if(e.on) await page.evaluate(e.on);
        await sleep(400);
        rows.push({ ...(await sample(page, e.id)), why:e.why });
        if(e.off) await page.evaluate(e.off);
        await sleep(400);
      }
      out[w.id]=rows;
      const b=rows[0].median;
      console.log('\n=== '+w.id.toUpperCase()+' ===  (drawables '+rows[0].drawables+', shadow faces '+rows[0].shadowFaces+')');
      for(const r of rows) console.log(('  '+r.label).padEnd(14)+String(r.median).padStart(8)+' ms   p99 '+String(r.p99).padStart(8)+
        '   delta '+(r.label==='baseline'?'—':(((r.median-b)/b*100).toFixed(0)+'%').padStart(6))+'   '+r.why);
    }
    const f=path.join(OUT,'perf-matrix-latest.json');
    fs.writeFileSync(f, JSON.stringify(out,null,2));
    console.log('\nwrote '+f);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
