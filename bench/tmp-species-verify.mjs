// #68 follow-up — the three things the species commits shipped UNVERIFIED.
//   1 a sapling drops from a birch/oak leaf, not just from a pine's
//   2 a structure sweep erases a new-species tree standing in its footprint
//   3 a save round-trip decodes the new block ids as themselves
// node bench/tmp-species-verify.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
let pass=0, fail=0;
const chk=(c,n,d)=>{ if(c){pass++;console.log('  PASS  '+n+(d?'   '+d:''));} else {fail++;console.log('  FAIL  '+n+(d?'   '+d:''));} };

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
      args:['--enable-gpu','--use-angle=d3d11','--mute-audio'] });
    const ctx = await browser.newContext({ viewport:{width:800,height:600} });
    const page = await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', null, {timeout:180000});
    await sleep(2500);

    console.log('\n--- 1  saplings from the new leaves ---');
    // 200 breaks of a birch leaf through the real break path; the drop is a 6% roll, so this is a rate, not one break.
    const sap = await page.evaluate(`__hc.leafSaplingTest ? __hc.leafSaplingTest('birch',200) : null`);
    console.log('  ' + JSON.stringify(sap));
    if(!sap || sap.err) chk(false,'the hook ran', JSON.stringify(sap));
    else{
      chk(sap.saplings>0, 'a birch leaf can drop a sapling', sap.saplings+' from '+sap.breaks+' breaks');
      chk(sap.saplings<sap.breaks*0.25, 'and it is a rare drop, not every leaf', (100*sap.saplings/sap.breaks).toFixed(1)+'%');
    }

    console.log('\n--- 2  a structure sweep erases a new-species tree ---');
    // Try birch, then oak, then pine: which species is standing inside the loaded radius depends on where spawn is,
    // and spawn sits in oak country in this world.
    let sw=null;
    for(const k of [2,1,0]){ sw = await page.evaluate(`__hc.sweepTest(${k})`); if(sw && !sw.err) break; }
    console.log('  ' + JSON.stringify(sw));
    if(!sw || sw.err) chk(false,'a generated tree was found inside the loaded world', JSON.stringify(sw));
    else{
      chk(sw.before>0, 'there was a tree there to begin with', sw.before+' tree blocks');
      chk(sw.after===0, 'and the sweep took all of it', sw.before+' before, '+sw.after+' after');
    }

    console.log('\n--- 3  a save round-trip keeps the new ids ---');
    const rt = await page.evaluate(`__hc.idRoundTrip ? __hc.idRoundTrip() : null`);
    console.log('  ' + JSON.stringify(rt));
    if(!rt || rt.err) chk(false,'the hook ran', JSON.stringify(rt));
    else{
      chk(rt.savedId===rt.loadedId, 'a birch_log written, saved and reloaded is still a birch_log', rt.savedId+' -> '+rt.loadedId);
      chk(rt.name==='birch_log', 'and it is named what it was', rt.name);
    }

    console.log('\n'+pass+'/'+(pass+fail)+' passed');
    await browser.close();
    process.exit(fail?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
