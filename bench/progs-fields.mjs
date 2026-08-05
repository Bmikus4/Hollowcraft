// WHICH FIELD OF THE PROGRAM KEY IS ACTUALLY MOVING — the follow-on from progs-who.mjs.
//
// progs-who answered WHAT recompiles: 69 new programs as chunks stream, all with identical light-count fields, so they are
// material variants and plan item A2 (the voxel light grid) would remove none of them. It cannot say WHY there are, for
// instance, sixteen distinct `basic` programs. three caches by cacheKey and reuses on an exact match, so sixteen keys means
// sixteen genuinely different configurations — and the key is a positional comma-joined list, so the answer is simply which
// POSITIONS differ within one material type.
//
// Reports, per material type: how many distinct keys, which field indices vary, and the values seen at each. A field that
// varies is a material property being set per chunk instead of shared; a field that never varies cannot be the cause.
//
// Needs the untruncated __hcPERF.programKeys() — it used to slice to 220 characters, which cut the numeric tail mid-field
// and made two keys differing late read as identical.
//
// usage: node bench/progs-fields.mjs      (HC_ROOT=<pinned tree>)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT=process.env.HC_ROOT||'D:/code/Minecraft';
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const ARGS=['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--disable-frame-rate-limit'];

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:960,height:600}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    page.on('console',m=>{ if(m.type()==='error' && /exception caught/.test(m.text())) console.log('LOOP-THREW:',m.text().slice(0,150)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});

    const before=await page.evaluate(`__hcPERF.programKeys()`);
    // Stream real chunks by walking the world, which is what produced the churn in progs-who — not a teleport, which
    // builds one neighbourhood and stops.
    await page.evaluate(`(()=>{ try{ __hcPERF.arm(); }catch(e){} })()`);
    for(let i=0;i<8;i++){ await page.evaluate(`(()=>{ const s=__hc.st(); player.pos.x+=90; })()`).catch(()=>{}); await sleep(1500); }
    await sleep(3000);
    const after=await page.evaluate(`__hcPERF.programKeys()`);
    const maxLen=Math.max(...after.map(k=>k.length));
    console.log('programs '+before.length+' -> '+after.length+'   longest key '+maxLen+' chars'+(maxLen>=220?'   (a 220-char probe would have truncated these)':''));

    const seen=new Set(before);
    const fresh=after.filter(k=>!seen.has(k));
    console.log('new keys: '+fresh.length+'\n');

    // Group by material type, which is the key's first field (or its first two when the first is numeric — a numbered
    // material carries an id pair before the type in this build).
    const groups=new Map();
    for(const k of after){ const f=k.split(','); const t=/^\d+$/.test(f[0]) ? 'numbered' : f[0];
      if(!groups.has(t)) groups.set(t,[]); groups.get(t).push(f); }
    for(const [t,rows] of [...groups.entries()].sort((a,b)=>b[1].length-a[1].length)){
      const uniq=new Set(rows.map(r=>r.join(',')));
      const width=Math.max(...rows.map(r=>r.length));
      const varying=[];
      for(let i=0;i<width;i++){ const vals=new Set(rows.map(r=>r[i]===undefined?'<none>':r[i]));
        if(vals.size>1) varying.push({i, vals:[...vals].slice(0,6), n:vals.size}); }
      console.log(t+': '+rows.length+' programs, '+uniq.size+' distinct keys, '+width+' fields');
      if(!varying.length) console.log('   nothing varies — these are duplicates of one configuration');
      for(const v of varying) console.log('   field '+String(v.i).padStart(3)+'  '+v.n+' values: '+JSON.stringify(v.vals));
      console.log();
    }
    await browser.close();
  } finally { server.kill(); }
})();
