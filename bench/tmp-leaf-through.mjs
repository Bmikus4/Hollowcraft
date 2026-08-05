// "still cant see those leaves through other leaves" (Ben 08-05), after the leaf pass stopped culling leaf-to-leaf
// faces. The faces exist — a ray through a canopy crosses 4-18 leaf surfaces now (bench/tmp-leaf-depth.mjs) — so the
// thing in the way is what those surfaces ARE. This asks the world, not the renderer:
//   for each species, walk a line straight through the canopy in BLOCK space and print the ids in order.
// If the answer is cut,core,core,... then there are no inner leaf layers to see: the interior is the OPAQUE core block,
// and no mesher change can show a layer that was never generated.
// node bench/tmp-leaf-through.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT='D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const SCAN = `(function(){
  // block id -> short name, built from __hc.bid()'s name list (ids are module scope; blockAt hands back raw numbers)
  const NAMES={}; for(const n of __hc.bid()) NAMES[__hc.bid(n)]=n;
  const nm=(x,y,z)=>{ const id=__hc.blockAt(x,y,z); const s=NAMES[id]||('#'+id);
    return s==='air'?'.':s.replace('leaves_core','CORE').replace('_leaves_core','_CORE').replace('leaves','leaf'); };
  const P=__hc.probe(); const out=[];
  const kinds=[0,1,2];
  for(const k of kinds){ let d=null; try{ d=__hc.shellDepth(k); }catch(e){ d={err:String(e.message||e)}; } out.push(d); }
  // and a live block-space traverse through the nearest canopy, at three heights
  const lines=[];
  let spot=null;
  for(let r=8;r<200&&!spot;r+=4) for(let a=0;a<16;a++){ const th=a*0.3927, x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
    const g=__hc.treeGates(x,z); if(g&&g.emits){ spot={x,z,h:g.h,kind:g.kindName}; break; } }
  // AND ONE TREE OF EVERY SPECIES, not just the nearest. Ben named OAK; every probe so far landed on a pine, and a
  // species whose canopy is two blocks thick has no third layer for any renderer change to reveal.
  const spots=[];
  if(spot) spots.push({tag:'nearest '+spot.kind, x:spot.x, z:spot.z, h:spot.h});
  for(const s of out){ if(s && s.x!=null) spots.push({tag:'kind'+s.kind, x:s.x, z:s.z, h:null}); }
  for(const sp of spots){
    const h = sp.h!=null ? sp.h : (__hc.treeGates(sp.x,sp.z)||{}).h;
    if(h==null) continue;
    for(const dy of [4,7,10,13]){
      const y=h+dy, row=[]; let thick=0, run=0, best=0;
      for(let dx=-9;dx<=9;dx++){ const n2=nm(sp.x+dx,y,sp.z); row.push(n2);
        if(n2.indexOf('leaf')>=0||n2.indexOf('CORE')>=0){ thick++; run++; if(run>best)best=run; } else run=0; }
      lines.push({tag:sp.tag, y:dy, leafBlocks:thick, longestRun:best, row:row.join(' ')});
    }
  }
  return { spot, shell:out, lines };
})`;

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(2000);
    const r=await page.evaluate(SCAN+'()');
    console.log(JSON.stringify(r.spot));
    for(const s of r.shell) console.log('shellDepth ' + JSON.stringify(s));
    for(const l of (r.lines||[])) console.log(l.tag.padEnd(16)+' y+'+String(l.y).padStart(2)+'  thick '+String(l.leafBlocks).padStart(2)+' run '+String(l.longestRun).padStart(2)+'  '+l.row);
  } finally { await browser.close(); server.kill(); }
})();
