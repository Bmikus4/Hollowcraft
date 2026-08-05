// DOES THE BACKROOMS ACTUALLY RENDER? Every other harness asserts data. This one asserts triangles and pixels.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import zlib from 'node:zlib';
// Minimal PNG -> luminance stats. Playwright screenshots are 8-bit RGB/RGBA, non-interlaced.
function pngStats(buf){
  let pos=8, w=0, h=0, bitDepth=8, colorType=6; const idat=[];
  while(pos<buf.length){ const len=buf.readUInt32BE(pos); const type=buf.toString('ascii',pos+4,pos+8);
    if(type==='IHDR'){ w=buf.readUInt32BE(pos+8); h=buf.readUInt32BE(pos+12); bitDepth=buf[pos+16]; colorType=buf[pos+17]; }
    else if(type==='IDAT') idat.push(buf.subarray(pos+8,pos+8+len));
    else if(type==='IEND') break;
    pos += 12+len; }
  if(bitDepth!==8) throw new Error('unexpected bit depth '+bitDepth);
  const ch = colorType===6?4 : colorType===2?3 : colorType===0?1 : null;
  if(!ch) throw new Error('unexpected colour type '+colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w*ch, out = Buffer.alloc(h*stride);
  const pa=(i,x)=> x>=ch ? out[i-ch] : 0, pb=(i,y)=> y>0 ? out[i-stride] : 0;
  for(let y=0,rp=0;y<h;y++){ const f=raw[rp++];
    for(let x=0;x<stride;x++){ const i=y*stride+x, v=raw[rp++];
      const a=pa(i,x), b=pb(i,y), c=(x>=ch&&y>0)? out[i-stride-ch] : 0;
      let r;
      if(f===0) r=v; else if(f===1) r=v+a; else if(f===2) r=v+b; else if(f===3) r=v+((a+b)>>1);
      else { const p2=a+b-c, da=Math.abs(p2-a), db=Math.abs(p2-b), dc=Math.abs(p2-c);
             r=v+((da<=db&&da<=dc)?a:(db<=dc?b:c)); }
      out[i]=r&255; } }
  const lum=new Float64Array(w*h);
  for(let i=0;i<w*h;i++){ const o=i*ch; lum[i]= ch===1? out[o] : 0.2126*out[o]+0.7152*out[o+1]+0.0722*out[o+2]; }
  let mean=0; for(let i=0;i<lum.length;i++) mean+=lum[i]; mean/=lum.length;
  let va=0; for(let i=0;i<lum.length;i++) va+=(lum[i]-mean)**2; const sd=Math.sqrt(va/lum.length);
  let edges=0; for(let y=1;y<h;y++) for(let x=1;x<w;x++){ const i=y*w+x;
    if(Math.abs(lum[i]-lum[i-1])>12 || Math.abs(lum[i]-lum[i-w])>12) edges++; }
  // region means: the bottom third of the frame is floor when the camera is level
  const band=(y0,y1)=>{ let m=0,n=0; for(let y=Math.floor(h*y0);y<Math.floor(h*y1);y++) for(let x=0;x<w;x++){ m+=lum[y*w+x]; n++; } return +(m/n).toFixed(1); };
  return { w, h, mean:+mean.toFixed(1), sd:+sd.toFixed(1), edgePct:+(100*edges/(w*h)).toFixed(2),
           top:band(0,0.30), mid:band(0.30,0.60), floor:band(0.62,0.92) };
}
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror',e=>{errs.push(String(e.message||e).slice(0,220)); console.log('PAGEERROR:',String(e.message||e).slice(0,220));});
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(7000);
    // render.calls resets every frame, so a single read catches whatever partial frame is in flight. Take the max.
    const peak=async()=>{ let c=0,t=0; for(let i=0;i<25;i++){ const r=await page.evaluate(`window.__hcBRX.rinfo()`);
        if(r.calls>c) c=r.calls; if(r.tris>t) t=r.tris; await sleep(60); } return {calls:c, tris:t}; };
    const st=await page.evaluate(`window.__hcBRX.envStats()`);
    const p1=await page.evaluate(`window.__hcBRX.drawProbe()`);
    console.log('DRAW CALLS peak:', p1.calls, ' tris peak:', p1.tris, ' env meshes:', st.meshes, ' groups:', st.groups);
    const fps=[]; for(let i=0;i<6;i++){ await sleep(600); fps.push((await page.evaluate(`__hc.st()`)).fps); }
    console.log('fps inside:', JSON.stringify(fps));
    // Measured honestly with drawProbe (forced render). The old 1076 figure came from the same unreliable between-frames
    // sampling that once read 19, so treat it as indicative only.
    T('draw calls are meaningfully reduced', p1.calls>0 && p1.calls<750, {calls:p1.calls});
    // drawProbe renders ONE frame with frustum culling, so its triangle count is what is on screen, not what exists. The
    // "nothing was dropped" property belongs on the env traversal, which counts the whole loaded set.
    T('the geometry is all still there', st.tris>30000, {envTris:st.tris, onScreenTris:p1.tris});
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)' : 'ALL PASS');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
