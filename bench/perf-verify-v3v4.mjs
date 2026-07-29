// V3 + V4 — the two properties the whole streaming design rests on, and the ones the perf pass could most
// easily have broken without anyone noticing.
//
//   V3 ORDER-INDEPENDENCE : a BRX chunk must be a pure function of (gx, gz, seed). Generate a 5x5 region in
//                           many different orders, and each chunk alone in a cleared cache, and demand the
//                           chunk records hash identically every time.
//   V4 SEAMS              : every voxel column is decided by brSlabColumn(wx, wz). Walk the shared boundary
//                           between adjacent chunks and demand the column agrees whichever chunk is loaded,
//                           and that the two columns straddling a boundary do not disagree about the floor.
//
// The shared-EDGE oracle is already covered by tmp-brx-edges.mjs; this covers the chunk data it produces and
// the voxels that come out the far end.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf('--'+k);return i>=0?argv[i+1]:d;};
const BRSEED=+arg('brseed',20260728), ORDERS=+arg('orders',20), SAMPLES=+arg('samples',2000);

function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function p(){ const r=http.get(u,x=>{x.resume();res();}); r.on('error',()=>{ Date.now()-t0>t?rej(new Error('down')):setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
// deterministic shuffle, so a failure is reproducible
function shuffle(a, seed){ let s=seed>>>0; const r=()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; };
  for(let i=a.length-1;i>0;i--){ const j=(r()*(i+1))|0; const t=a[i]; a[i]=a[j]; a[j]=t; } return a; }

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
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:180000});
    await page.evaluate(`window.__hcPERF.arm()`);
    await page.evaluate(`window.__hcPERF.enterBR()`); await sleep(3000);

    // ---------------- V3 : order independence -------------------------------------------------------
    const ent = await page.evaluate(`(()=>{const c=window.__hcBRX.chunkOf(100033,0); return [c.gx,c.gz];})()`);
    const region=[]; for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) region.push([ent[0]+dx, ent[1]+dz]);

    // reference: each chunk generated ALONE, in a cache cleared before every single one
    const ref={};
    for(const [gx,gz] of region){
      await page.evaluate(`window.__hcPERF.dropChunkCache()`);
      ref[gx+'_'+gz] = await page.evaluate(`window.__hcPERF.chunkHash(${gx},${gz})`);
    }
    const bad=Object.entries(ref).filter(([,h])=>typeof h!=='number');
    T('every chunk hashes cleanly in isolation', bad.length===0, bad.slice(0,3));

    let mismatches=[], orderCount=0;
    for(let o=0;o<ORDERS;o++){
      const order=shuffle(region.slice(), 0x51ed+o);
      await page.evaluate(`window.__hcPERF.dropChunkCache()`);
      const got = await page.evaluate(`(()=>{const out={}; for(const [gx,gz] of ${JSON.stringify(order)}) out[gx+'_'+gz]=window.__hcPERF.chunkHash(gx,gz); return out;})()`);
      orderCount++;
      for(const k in ref) if(got[k]!==ref[k]) mismatches.push({order:o, chunk:k, alone:ref[k], inOrder:got[k]});
    }
    T(`a 5x5 region hashes identically in ${orderCount} different generation orders`, mismatches.length===0,
      { chunks:region.length, orders:orderCount, mismatches:mismatches.length, first:mismatches.slice(0,3) });

    // and regenerating after a full cache drop reproduces the same thing again
    await page.evaluate(`window.__hcPERF.dropChunkCache()`);
    const again = await page.evaluate(`(()=>{const out={}; for(const [gx,gz] of ${JSON.stringify(region)}) out[gx+'_'+gz]=window.__hcPERF.chunkHash(gx,gz); return out;})()`);
    const drift=Object.keys(ref).filter(k=>again[k]!==ref[k]);
    T('evicting and regenerating reproduces the identical chunk', drift.length===0, {drifted:drift.slice(0,3)});

    // ---------------- V4 : seams -------------------------------------------------------------------
    // Columns ON a chunk boundary, asked for twice with different chunks resident in between. brSlabColumn is
    // supposed to be a pure function of world coordinates; if anything it touches is chunk-scoped, this fails.
    const span = await page.evaluate(`(()=>{const o1=window.__hcBRX.origin(0,0), o2=window.__hcBRX.origin(1,0); return o2.x-o1.x;})()`);
    const v4 = await page.evaluate(`(()=>{
      const out={ checked:0, disagree:[], voids:0, floorMismatch:[] };
      const org=window.__hcBRX.origin(${ent[0]}, ${ent[1]});
      let s=0x1234abcd; const rnd=()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; };
      for(let i=0;i<${SAMPLES};i++){
        // pick a real shared boundary and a random point along it
        const bx = org.x + (((rnd()*4)|0) - 2) * ${span};
        const bz = org.z + Math.floor((rnd()*4-2) * ${span});
        const along = Math.floor(rnd()*${span});
        const vertical = rnd()<0.5;
        const wx = vertical ? bx : bx + along;
        const wz = vertical ? bz + along : bz;
        const a = window.__hcPERF.columnStack(wx, wz);
        if(a.err){ out.disagree.push({wx,wz,err:a.err}); continue; }
        // force a different chunk to be the "current" one, then ask again for the SAME world column
        window.__hcPERF.dropChunkCache();
        window.__hcPERF.chunkHash(${ent[0]}+2, ${ent[1]}-2);
        const b = window.__hcPERF.columnStack(wx, wz);
        out.checked++;
        if(a.hash!==b.hash || a.htop!==b.htop) out.disagree.push({wx,wz,a:a.hash,b:b.hash,ha:a.htop,hb:b.htop});
        // the column immediately across the boundary must not differ by a whole storey — that is a cliff, not a seam
        const c = window.__hcPERF.columnStack(wx + (vertical?-1:0), wz + (vertical?0:-1));
        if(!c.err && Math.abs((a.htop|0)-(c.htop|0)) > 9) out.floorMismatch.push({wx,wz,a:a.htop,c:c.htop});
        if(a.solid===0) out.voids++;
      }
      return out;
    })()`);
    T(`a boundary column is the same whichever chunk is resident (n=${v4.checked})`, v4.disagree.length===0,
      { checked:v4.checked, disagree:v4.disagree.length, first:v4.disagree.slice(0,3) });
    T('no boundary column steps more than one storey against its neighbour', v4.floorMismatch.length===0,
      { offenders:v4.floorMismatch.length, first:v4.floorMismatch.slice(0,3) });
    T('boundary columns are not empty void', v4.voids===0, { emptyColumns:v4.voids, of:v4.checked });

    // The one that would actually catch a visible seam: do the voxels sitting in the loaded chunks still agree
    // with the oracle? Only meaningful for boundary columns inside the region that is really resident.
    const v4b = await page.evaluate(`(()=>{
      const out={ checked:0, skipped:0, mismatched:[] };
      const org=window.__hcBRX.origin(${ent[0]}, ${ent[1]});
      let s=0x77c0ffee; const rnd=()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; };
      for(let i=0;i<${SAMPLES};i++){
        const bx = org.x + (((rnd()*3)|0) - 1) * ${span};
        const bz = org.z + (((rnd()*3)|0) - 1) * ${span};
        const along = Math.floor(rnd()*${span});
        const vertical = rnd()<0.5;
        const wx = vertical ? bx : bx + along, wz = vertical ? bz + along : bz;
        const r = window.__hcPERF.columnVsWorld(wx, wz);
        if(r.err){ out.mismatched.push({wx,wz,err:r.err}); continue; }
        if(r.skipped){ out.skipped++; continue; }
        out.checked++;
        if(r.diff) out.mismatched.push({wx, wz, diff:r.diff, firstY:r.firstY});
      }
      return out;
    })()`);
    T(`the voxels in the loaded chunks still match the oracle on boundaries (n=${v4b.checked})`,
      v4b.mismatched.length===0,
      { checked:v4b.checked, notResident:v4b.skipped, mismatched:v4b.mismatched.length, first:v4b.mismatched.slice(0,3) });

    T('zero page errors', errs.length===0, errs.slice(0,3));
    await browser.close(); browser=null;
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
  console.log(fails? ('\n'+fails+' FAILED') : '\nALL PASS');
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
