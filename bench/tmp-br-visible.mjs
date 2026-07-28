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
    const errs=[], cons=[];
    page.on('pageerror',e=>{ errs.push(String(e.message||e).slice(0,300)); console.log('PAGEERROR:',String(e.message||e).slice(0,300)); });
    page.on('requestfailed',r=>console.log('REQFAIL:',r.url().slice(-80),r.failure()&&r.failure().errorText));
    page.on('response',r=>{ if(r.status()>=400) console.log('HTTP',r.status(),r.url().slice(-90)); });
    page.on('console',m=>{ if(m.type()==='error'){ const t=m.text().slice(0,300); cons.push(t); console.log('CONSOLE.ERROR:',t); } });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(7000);
    const st = await page.evaluate(`window.__hcBRX.envStats()`);
    console.log('envStats', JSON.stringify(st,null,1));
    T('the environment group exists', st.env===true, {env:st.env});
    T('no chunk failed to build', (st.errs||[]).length===0, (st.errs||[]).slice(0,3));
    T('all 9 loaded chunks contributed geometry', st.groups>=9, {groups:st.groups, loaded:st.loaded});
    T('the environment has a serious number of triangles', st.tris>20000, {tris:st.tris, meshes:st.meshes});
    // not ===: a few meshes are legitimately hidden at any moment (a closed door leaf, an unlit fixture, the Pale)
    T('essentially every mesh is visible', st.meshes>0 && st.visible/st.meshes>0.99, {meshes:st.meshes, visible:st.visible});
    // THE LIGHTS MUST ACTUALLY BE ON. Fixtures are stamped with a room id at generation and gated against brLitRooms'
    // unioned ids; when those two id spaces disagreed every fixture was culled and the halls had no pooled light at all,
    // which no data assertion noticed because the fixtures still existed — they were just never given a pool slot.
    const lit = await page.evaluate(`(()=>{ const s=window.__hcBRX.envStats(); return {litNear:s.litNear, fixtures:s.fixtures}; })()`);
    T('the fluorescents are actually lighting the halls', lit.litNear>0, lit);
    T('there are fixtures to light them with', lit.fixtures>20, lit);
    await page.evaluate(`__hc.aim(false)`); await sleep(1200);
    await page.screenshot({ path: path.join(OUT,'br-visible.png') });
    // PIXELS. Reading back the WebGL canvas in-page returns blank (no preserveDrawingBuffer), so decode the screenshot
    // Playwright actually composited. This is the check the entire suite was missing: every other assertion tested DATA,
    // so 1646 meshes could be missing from the scene and nothing went red.
    const shot = await page.screenshot();
    const px = pngStats(shot);
    console.log('pixels', JSON.stringify(px));
    T('the view is not a flat fog fill — there is structure on screen', px.sd>12 && px.edgePct>1.5, px);
    // The floor band reads much darker than the walls (14.5 vs 30.3). I theorised the skylight-dimming curves were
    // crushing it — vSky is 0 everywhere in a sealed interior — but an A/B with the camera held still moved it by 0.1/255,
    // so that theory is wrong and the change was reverted. Recorded here as an observation, not a fix.
    console.log('luminance bands', JSON.stringify({top:px.top, walls:px.mid, floor:px.floor}));
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)' : 'ALL PASS');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
