// V5 — QA PARITY. The console helpers are the user's ground truth for this game; the brief says do not break
// them. This calls every read-only one twice in the same page — once with the optimisations off (?perfoff=all
// applied live) and once with them on — and diffs the results.
//
// Fields that legitimately move on their own (frame rate, clocks, live positions, anything counted per frame)
// are listed as VOLATILE and compared for presence and type rather than value. Everything else must match
// exactly, and any difference has to be justified in the output rather than waved through.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf('--'+k);return i>=0?argv[i+1]:d;};
const BRSEED=+arg('brseed',20260728);

function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function p(){ const r=http.get(u,x=>{x.resume();res();}); r.on('error',()=>{ Date.now()-t0>t?rej(new Error('down')):setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// read-only helpers only — anything that places blocks, gives items or opens UI would change the state the
// next call reads, and the diff would be meaningless
const HELPERS = [
  ['__hc','st'], ['__hc','pos'], ['__hc','perf'], ['__hc','ach'], ['__hc','saveInfo'], ['__hc','editCount'],
  ['__hc','invList'], ['__hc','leaves'], ['__hc','viewDbg'], ['__hc','fauna'], ['__hc','island'],
  ['__hc','golgotha'], ['__hc','church'], ['__hc','peaks'], ['__hc','vitals'], ['__hc','horizonDbg'],
  ['__hc','chimeState'], ['__hc','sight'],
  ['__hcBRX','envStats'], ['__hcBRX','stats'], ['__hcBRX','prewarm'],
];
// values that move on their own between two reads, whatever the flags are
const VOLATILE = new Set(['fps','day','obs','dist','t','time','elapsed','wy','py','px','pz','x','y','z','yaw','pitch',
  'adsT','bless','sick','vign','rang','ax','az','vx','vz','out','calls','tris','triangles','geoms','tex','progs',
  'litNear','meshes','heap','frames','ms','seconds','hz','renders']);

function diff(a, b, pathStr, out){
  if(a===b) return;
  const ta=typeof a, tb=typeof b;
  if(ta!==tb){ out.push({at:pathStr, kind:'type', off:ta, on:tb}); return; }
  if(a===null||b===null){ out.push({at:pathStr, off:a, on:b}); return; }
  if(Array.isArray(a)){
    if(a.length!==b.length){ out.push({at:pathStr+'.length', off:a.length, on:b.length}); return; }
    for(let i=0;i<a.length;i++) diff(a[i], b[i], pathStr+'['+i+']', out);
    return;
  }
  if(ta==='object'){
    const keys=new Set([...Object.keys(a),...Object.keys(b)]);
    for(const k of keys){
      if(VOLATILE.has(k)){
        if((k in a)!==(k in b)) out.push({at:pathStr+'.'+k, kind:'presence', off:(k in a), on:(k in b)});
        else if(typeof a[k]!==typeof b[k]) out.push({at:pathStr+'.'+k, kind:'type', off:typeof a[k], on:typeof b[k]});
        continue;
      }
      diff(a[k], b[k], pathStr+'.'+k, out);
    }
    return;
  }
  if(ta==='number' && Math.abs(a-b)<1e-9) return;
  out.push({at:pathStr, off:a, on:b});
}

let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };

(async()=>{
  const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?perf=1&debug=1&t=210&brseed='+BRSEED,{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:180000});
    await page.evaluate(`window.__hcPERF.arm()`);
    await page.evaluate(`window.__hcPERF.enterBR()`); await sleep(3000);
    // park, so the two reads are not separated by the player having moved
    await page.evaluate(`window.__hcPERF.portalRate(true, 3)`).catch(()=>{});
    await sleep(500);

    const callAll = async () => {
      const out={};
      for(const [ns,fn] of HELPERS){
        out[ns+'.'+fn] = await page.evaluate(`(()=>{ try{ const r=window.${ns} && window.${ns}.${fn} ? window.${ns}.${fn}() : '__MISSING__';
          return JSON.parse(JSON.stringify(r===undefined?null:r)); }catch(e){ return {__throw:String(e&&e.message||e)}; } })()`);
      }
      return out;
    };

    const SHIPPED = { brShadowLights:0, brMergeRigid:true, brStableLightCount:true, portalHz:120, brGenCacheMax:512, streamBudgetMs:8 };
    // A side — every optimisation restored to its baseline value, live
    await page.evaluate(`window.__hcPERF.restoreBaseline()`);
    await page.evaluate(`window.__hcPERF.rebuildEnv()`);
    await sleep(2500);
    const off = await callAll();

    // B side — back to shipped
    for(const [k,v] of Object.entries(SHIPPED)) await page.evaluate(`window.__hcPERF.set(${JSON.stringify(k)}, ${JSON.stringify(v)})`);
    await page.evaluate(`window.__hcPERF.shadowLights(0)`);
    await page.evaluate(`window.__hcPERF.rebuildEnv()`);
    await sleep(2500);
    const on = await callAll();

    let missing=[], threw=[], differing=[];
    for(const key of Object.keys(off)){
      if(off[key]==='__MISSING__' || on[key]==='__MISSING__'){ missing.push(key); continue; }
      if(off[key]&&off[key].__throw){ threw.push({key, err:off[key].__throw}); continue; }
      if(on[key]&&on[key].__throw){ threw.push({key, err:on[key].__throw}); continue; }
      const d=[]; diff(off[key], on[key], key, d);
      if(d.length) differing.push({key, diffs:d.slice(0,6), total:d.length});
    }

    T('every helper still exists', missing.length===0, missing);
    T('no helper throws', threw.length===0, threw.slice(0,4));
    console.log('\nhelpers compared: '+Object.keys(off).length);
    if(differing.length){ console.log('differences (each must be justified):');
      for(const d of differing) console.log('  '+d.key+'  ('+d.total+')  '+JSON.stringify(d.diffs)); }
    // Differences are expected in exactly one place: the merge changes how many MESHES a chunk arrives as.
    // Anything else is a regression in the user's ground truth.
    const EXPECTED = /(envStats|drawProbe)/;
    const unexplained = differing.filter(d=>!EXPECTED.test(d.key));
    T('no unexplained difference in any QA helper', unexplained.length===0,
      unexplained.map(d=>({key:d.key, first:d.diffs[0]})));
    T('zero page errors', errs.length===0, errs.slice(0,3));

    await browser.close(); browser=null;
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
  console.log(fails? ('\n'+fails+' FAILED') : '\nALL PASS');
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
