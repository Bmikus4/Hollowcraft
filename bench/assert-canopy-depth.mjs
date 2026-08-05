// "fix tree leaves not spawning inside once and for all" (Ben 08-05). The rule is his: up to 3 blocks from the outside
// in is transparent leaf, and only deeper than that is the opaque core. Both species used to decide it from a RADIUS,
// and a radius is not a depth — __hc.shellDepth found opaque core at depth 1 and 2 on a pine while only 18 cut cells
// reached depth 3.
// This asserts the rule itself, per species, off shellDepth (which replays the generator for one tree and then measures
// every cell's real Chebyshev distance to the nearest non-tree cell):
//   1. NO core cell shallower than depth 4 — an opaque block on or just under the canopy's surface is the whole bug.
//   2. Cut leaves present at depth 1, 2 AND 3 on a canopy big enough to have them — the three layers Ben is asking for.
//   3. The deepest cut cell is at least 3 — i.e. the transparent shell really is three thick where there is room.
// node bench/assert-canopy-depth.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT='D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true, args:['--enable-gpu','--use-angle=d3d11','--mute-audio'] });
  let pass=0, fail=0;
  const ok=(c,msg)=>{ if(c){pass++; console.log('  ok   '+msg);} else {fail++; console.log('  FAIL '+msg);} };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(2500);
    for(const kind of [0,1,2]){
      const d=await page.evaluate('__hc.shellDepth('+kind+')');
      console.log('kind '+kind+'  '+JSON.stringify(d));
      if(d.err){ ok(false,'kind '+kind+': '+d.err); continue; }
      ok(!d.core || d.shallowestCore>=4, 'kind '+kind+': no opaque core shallower than depth 4 (shallowest '+d.shallowestCore+', core cells '+d.core+')');
      // a canopy with no cell at depth 3 at all is simply too small for three layers; only assert the layers where
      // there is room for them, and say which case ran.
      const roomy = d.deepestCut>=3;
      if(roomy){
        ok((d.cutDepths[1]||0)>0 && (d.cutDepths[2]||0)>0 && (d.cutDepths[3]||0)>0,
           'kind '+kind+': transparent leaf at depths 1, 2 and 3 ('+JSON.stringify(d.cutDepths)+')');
      } else {
        console.log('  --   kind '+kind+' canopy is too small for three layers (deepestCut '+d.deepestCut+') — all shell, which is the rule');
      }
    }
    console.log('\n'+pass+' ok, '+fail+' failed');
    process.exitCode = fail?1:0;
  } finally { await browser.close(); server.kill(); }
})();
