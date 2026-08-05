// THE SECOND-ORDER RISK OF THE DEPTH RULE. leaves_core is the one leaf block with occludesSky true, so it is what makes
// a canopy cast shade at all: htop counts it, _ssky reads htop, and every face under the tree takes its skylight from
// that. The depth rule leaves an ordinary pine with ZERO core cells (assert-canopy-depth), so the question this answers
// is whether the forest floor just lost its shade and went as bright as a field — which would be a worse bug than the
// one being fixed, and is the exact inverse of the 07-19 lighting bug where an opaque canopy made everything black.
// ?dbg=sky paints vSky directly. Stand under a canopy looking down, and compare with the newest commit that predates
// the rule.
// node bench/tmp-canopy-shade.mjs
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT='D:\\code\\Minecraft';
const OLD=path.join(ROOT,'_shade_old.html');
const MARK='A LEAF IS CORE BECAUSE OF WHERE IT SITS IN THE CANOPY';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function grey(file,x0,y0,w,h){ const P=decodePNG(fs.readFileSync(file)); const ch=P.ch; let s=0,n=0;
  for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ const i=(y*P.w+x)*ch; s+=(P.data[i]+P.data[i+1]+P.data[i+2])/3; n++; }
  return +(s/n).toFixed(2); }

(async()=>{
  const refs=execSync('git log --format=%H -60',{cwd:ROOT}).toString().trim().split('\n');
  let base=null;
  for(const r of refs){ const src=execSync('git show '+r+':index.html',{cwd:ROOT,maxBuffer:64*1024*1024}).toString();
    if(!src.includes(MARK)){ base=r; fs.writeFileSync(OLD,src); break; } }
  if(!base) throw new Error('no commit in the last 60 without the marker');
  console.log('baseline '+base.slice(0,7)+'  '+execSync('git log -1 --format=%s '+base,{cwd:ROOT}).toString().trim());
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
  const run=async(file,tag,dbg)=>{
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/'+file+'?debug=1'+(dbg?'&dbg=sky':''),{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await page.evaluate('__hc.setTime(0.25)');
    const spot=await page.evaluate(`(()=>{ const P=__hc.probe(); for(let r=30;r<200;r+=6) for(let a=0;a<16;a++){
        const th=a*0.3927, x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g.emits) return {x,z,h:g.h}; } return null; })()`);
    // UNDER THE CANOPY, LOOKING DOWN at the ground the tree is shading.
    await page.evaluate('__hc.tpAt('+(spot.x+1)+','+(spot.h+2)+','+(spot.z+1)+')');
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()',null,{timeout:120000}).catch(()=>{});
    await sleep(4000);
    await page.evaluate('__hc.look('+(spot.x+3)+','+(spot.h-2)+','+(spot.z+3)+')');
    await sleep(1500); await page.evaluate('__hc.setTime(0.25)'); await sleep(400);
    const f=path.join(ROOT,'bench','results','canopyshade-'+tag+'.png');
    await page.screenshot({path:f});
    const floor=grey(f,200,120,400,260);
    // and the open field, as the reference for "no shade at all"
    await page.evaluate('__hc.tpAt('+(spot.x+70)+','+(spot.h+3)+','+(spot.z+70)+')');
    await sleep(3000);
    await page.evaluate('__hc.look('+(spot.x+73)+','+(spot.h-1)+','+(spot.z+73)+')');
    await sleep(1200); await page.evaluate('__hc.setTime(0.25)'); await sleep(300);
    const f2=path.join(ROOT,'bench','results','canopyshade-'+tag+'-field.png');
    await page.screenshot({path:f2});
    const field=grey(f2,200,120,400,260);
    // fps AND the geometry it is paying for, at the same vantage: a 133 -> 73 reading with no vert count beside it
    // cannot tell a real cost from a streaming hitch.
    const fps=[]; for(let i=0;i<14;i++){ await sleep(400); await page.evaluate('__hc.setTime(0.25)'); fps.push((await page.evaluate('__hc.st()')).fps); }
    fps.sort((a,b)=>a-b);
    const geo=await page.evaluate(`(()=>{ let lv=0,fv=0; __hc.leafMeshes().forEach(m=>lv+=m.geometry.attributes.position.count);
        __hc.foliageMeshes().forEach(m=>fv+=m.geometry.attributes.position.count);
        const c=__hc.canopyProbe(); return {leafVerts:lv, foliageVerts:fv, sky:c.sky}; })()`);
    await page.context().close();
    return { spot, floor, field, fps:fps[fps.length>>1], fpsAll:fps, geo };
  };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    const o=await run('_shade_old.html','old',true);
    const n=await run('index.html','new',true);
    console.log('  vSky on the ground UNDER a canopy   ' + o.floor + ' -> ' + n.floor + '   (255 = as open as a field)');
    console.log('  vSky on the open FIELD (reference)  ' + o.field + ' -> ' + n.field);
    console.log('  median fps in the open field        ' + o.fps + ' -> ' + n.fps);
    console.log('    fps samples  ' + JSON.stringify(o.fpsAll) + ' -> ' + JSON.stringify(n.fpsAll));
    console.log('  leaf verts    ' + o.geo.leafVerts + ' -> ' + n.geo.leafVerts + '   foliage verts ' + o.geo.foliageVerts + ' -> ' + n.geo.foliageVerts);
    console.log('  occludesSky   ' + JSON.stringify(o.geo.sky) + ' -> ' + JSON.stringify(n.geo.sky));
  } finally { await browser.close(); server.kill(); try{ fs.unlinkSync(OLD); }catch(e){} }
})();
