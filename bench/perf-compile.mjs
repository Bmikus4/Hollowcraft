// SHADER COMPILATION, measured on a COLD PAGE. A paired in-session A/B cannot see this change: by the time the
// second side runs, every program it would have compiled is already in the cache. The only honest instrument is
// two fresh page loads walking the same path, counting programs and the frames they were born on.
//
//   node bench/perf-compile.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT  = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf('--'+k);return i>=0?argv[i+1]:d;};
const SCENES = arg('scenes','B1,B2,B3,B4').split(',');
const BRSEED = +arg('brseed',20260728);

function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

async function session(browser, base, label, urlExtra){
  // A FRESH CONTEXT each time. A reused one keeps Chrome's on-disk program cache warm and the second run then
  // measures nothing at all.
  const ctx = await browser.newContext({ viewport:{width:1920,height:1080}, deviceScaleFactor:1 });
  const page = await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,160)));
  await page.goto(base+'/index.html?perf=1&debug=1&t=210&brseed='+BRSEED+urlExtra,{waitUntil:'load',timeout:120000});
  await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
  await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:180000});
  await page.evaluate(`window.__hcPERF.arm()`);
  await sleep(2500);
  const progAtLoad = await page.evaluate(`(()=>{try{return (renderer.info.programs||[]).length;}catch(e){return -1;}})()`)
    .catch(()=>null);
  const flags = await page.evaluate(`window.__hcPERF.flags()`);

  await page.evaluate(`window.__hcPERF.enterBR()`); await sleep(3500);
  const progAfterEnter = await page.evaluate(`window.__hcPERF.census? (renderer.info.programs||[]).length : -1`).catch(()=>null);

  const rows=[];
  for(const scene of SCENES){
    const meta = await page.evaluate(`window.__hcPERF.start(${JSON.stringify(scene)}, {dur:14, warmFrames:0})`);
    if(!meta || meta.err){ rows.push({scene, err:meta&&meta.err}); continue; }
    const budget=meta.dur*1000*12+90000, t0=Date.now();
    while(await page.evaluate(`window.__hcPERF.active()`)){
      if(Date.now()-t0>budget){ console.log('   TIMEOUT '+scene); break; }
      await sleep(200); }
    const r = await page.evaluate(`window.__hcPERF.result()`);
    if(!r){ rows.push({scene, err:'no result'}); continue; }
    rows.push({ scene, median:r.frame.median, p99:r.frame.p99, max:r.frame.max,
      over12:r.frame.over12, over33:r.frame.over33,
      programs:r.programs, worst:(r.worstFrames||[]).slice(0,3).map(f=>({ms:f.ms, prog:f.programs})) });
  }
  const progEnd = await page.evaluate(`(()=>{try{return (renderer.info.programs||[]).length;}catch(e){return -1;}})()`).catch(()=>null);
  await ctx.close();
  return { label, flags:{brStableLightCount:flags.brStableLightCount}, progAtLoad, progAfterEnter, progEnd, rows, errs };
}

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const out=[];
    // Separate BROWSER launches, each with its own throwaway profile, so Chrome's persistent shader cache
    // cannot carry programs from the first side into the second.
    for(const [label, extra] of [['baseline (flags off)','&perfoff=brStableLightCount,brPrecompile'], ['P3 on','']]){
      browser=await chromium.launch({executablePath:findBrowser(),headless:true,
        args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio',
              '--disable-gpu-vsync','--disable-frame-rate-limit','--disable-gpu-program-cache','--disable-gpu-shader-disk-cache']});
      out.push(await session(browser, base, label, extra));
      await browser.close(); browser=null;
    }
    console.log('');
    for(const s of out){
      console.log('=== '+s.label+'  (flag='+s.flags.brStableLightCount+') ===');
      console.log('  programs: at load '+s.progAtLoad+'  after entering '+s.progAfterEnter+'  at end '+s.progEnd
                  +'   grew '+(s.progEnd-s.progAtLoad));
      for(const r of s.rows){ if(r.err){ console.log('  '+r.scene+': '+r.err); continue; }
        console.log('  '+r.scene.padEnd(3)+' med '+String(r.median).padStart(6)+'  p99 '+String(r.p99).padStart(7)
          +'  max '+String(r.max).padStart(9)+'  >12ms '+String(r.over12).padStart(5)+'  >33ms '+String(r.over33).padStart(4)
          +'  compiles '+r.programs.growthEvents+' (+'+r.programs.grew+')'
          +'  worst '+r.worst.map(w=>w.ms).join('/')); }
      if(s.errs.length) console.log('  page errors: '+s.errs.slice(0,3).join(' | '));
    }
    const a=out[0], b=out[1];
    console.log('\nDELTA  programs grown: '+(a.progEnd-a.progAtLoad)+' -> '+(b.progEnd-b.progAtLoad));
    const sum=(s,k)=>s.rows.reduce((t,r)=>t+(r.programs?r.programs[k]:0),0);
    console.log('       compile events during play: '+sum(a,'growthEvents')+' -> '+sum(b,'growthEvents'));
    const worstOf=s=>Math.max(...s.rows.map(r=>r.max||0));
    console.log('       worst frame anywhere: '+worstOf(a).toFixed(1)+' ms -> '+worstOf(b).toFixed(1)+' ms');
    fs.writeFileSync(path.join(OUT,'perf-compile.json'), JSON.stringify(out,null,2));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
