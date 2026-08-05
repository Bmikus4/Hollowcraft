// Ben 08-05: "some north and south facing block faces are completely blacked out as well. IT is ONLY north and south
// facing ones". _snapT is 18x18 — the chunk plus ONE column of pad, holding -1..16. The 3x3 sky neighbourhood asked for
// lz+1 on a +Z boundary face, i.e. 17, which is off the END of the array: undefined comes back, `ly >= undefined` is
// false, and the ramp returns NaN, so the face packs a NaN sky and renders black. Off the end in X lands on the next ROW
// — wrong but finite — which is exactly why only the north and south faces went black.
// THE ASSERT IS A CENSUS, NOT A SCREENSHOT: a NaN in the bake is invisible unless you happen to be looking at that seam,
// so this walks every aSky value in every loaded chunk mesh. Any non-zero count is the bug.
// `node bench/assert-sky-nan.mjs base` runs it against the newest commit that predates the clamp, where it must FAIL.
// node bench/assert-sky-nan.mjs
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:\\code\\Minecraft';
const BASE=process.argv[2]==='base';
const MARK='CLAMPED INTO THE PAD';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  let FILE='index.html';
  if(BASE){
    // The baseline needs the skyCensus hook, which only the fixed file has, so it is built by putting the CLAMP back to
    // the unclamped read in a copy — one expression, everything else identical.
    const cur=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
    const A='const cx = lx<-1?-1 : lx>16?16 : lx, cz = lz<-1?-1 : lz>16?16 : lz;';
    if(!cur.includes(A)) throw new Error('the clamp is not in index.html');
    fs.writeFileSync(path.join(ROOT,'_skynan_old.html'), cur.replace(A, 'const cx = lx, cz = lz;   // baseline: unclamped'));
    FILE='_skynan_old.html';
    console.log('BASELINE: the same file with the pad clamp removed');
  }
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true, args:['--enable-gpu','--use-angle=d3d11','--mute-audio'] });
  let pass=0, fail=0;
  const ok=(c,msg,data)=>{ if(c){pass++; console.log('  ok   '+msg);} else {fail++; console.log('  FAIL '+msg+'  '+JSON.stringify(data||{}));} };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/'+FILE+'?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(4000);
    // Spawn, then a wood, then a coast: three different chunk populations, so the census sees plenty of seams.
    const spots=await page.evaluate(`(()=>{ const P=__hc.probe(); const out=[[P.x,P.y,P.z]];
        for(let r=40;r<200;r+=8){ for(let a=0;a<12;a++){ const th=a*0.5236;
          const x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
          const g=__hc.treeGates(x,z); if(g&&g.emits){ out.push([x, g.h+3, z]); break; } } if(out.length>1) break; }
        return out; })()`);
    let total=0, worst=null;
    for(const s of spots){
      await page.evaluate('__hc.tpAt('+s.join(',')+')');
      await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()',null,{timeout:120000}).catch(()=>{});
      await sleep(4000);
      const c=await page.evaluate('__hc.skyCensus()');
      console.log('  at '+JSON.stringify(s)+'  '+JSON.stringify(c));
      if(c.err) throw new Error(c.err);
      total+=c.nan; if(c.nan && !worst) worst=c;
    }
    ok(total===0, 'no face in the loaded world carries a NaN baked sky', {nan:total, firstNaNAt:worst&&worst.firstNaNAt});
    console.log('\n'+pass+' ok, '+fail+' failed');
    process.exitCode = fail?1:0;
  } finally { await browser.close(); server.kill(); if(BASE){ try{ fs.unlinkSync(path.join(ROOT,'_skynan_old.html')); }catch(e){} } }
})();
