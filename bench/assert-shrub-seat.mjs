// ASSERTION: every decoration block sits on solid ground with open air above it, in REAL generated terrain.
//
// "Shrubs one block deep" has been reported three times and closed twice — once by changing the bush ARTWORK, once by
// eye. So this is failing-test-first, and proved capable of failing on THIS build before its PASS is worth anything:
//   ?nodecoseat=1 disables the engine invariant. With that flag the run must FAIL; without it, PASS.
//   A control bush is written one block low with dirt on top. Flag on -> it survives and is flagged. Flag off -> the
//   invariant must have removed it.
// It asks the engine its OWN questions (__hc.isSolidId / __hc.catId) rather than carrying a hardcoded block list, so the
// harness and the rule cannot drift apart and quietly test different things.
//
// Three scenarios, because one location is not a global rule. The first version of this check was vacuous in exactly
// that way: its "pristine" control reported deco=0 across 2025 columns — impossible in forest — so ordinary terrain was
// never tested and it PASSed on nothing.
//
// usage: node bench/assert-shrub-seat.mjs [flags]     e.g. nodecoseat=1
//        exit 0 = pass, 1 = fail
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const FLAGS = process.argv[2] ? ('&'+process.argv[2]) : '';
const INVARIANT_OFF = /nodecoseat/.test(FLAGS);

function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// BURIED = something solid sits directly on top of it. FLOATING = nothing solid sits directly under it.
// Read straight off the block array. No pixels, no judgement.
function CHECK(cx,cz,R){
  return '(()=>{ var out={cols:0,deco:0,buried:0,floating:0,ok:0,ex:[]};'
  + ' var names={}; var ks=__hc.bid(); for(var i=0;i<ks.length;i++) names[__hc.bid(ks[i])]=ks[i];'
  + ' function cross(b){ return b>0 && __hc.catId(b)==="cross"; }'
  + ' function solid(b){ return b>0 && !cross(b) && __hc.isSolidId(b); }'
  + ' function B(x,y,z){ return __hc.blockAt(x,y,z)|0; }'
  + ' for(var x='+(cx-R)+';x<='+(cx+R)+';x++) for(var z='+(cz-R)+';z<='+(cz+R)+';z++){'
  + '   var g=__hc.surfH(x,z); var loaded=false;'
  + '   for(var y=Math.max(1,g-2); y<=g+3; y++) if(B(x,y,z)){ loaded=true; break; }'
  + '   if(!loaded) continue; out.cols++;'
  + '   for(var y2=Math.max(2,g-6); y2<=g+36; y2++){'
  + '     var b=B(x,y2,z); if(!cross(b)) continue; out.deco++;'
  + '     var a=B(x,y2+1,z), u=B(x,y2-1,z);'
  + '     if(solid(a)){ out.buried++; if(out.ex.length<10) out.ex.push({x:x,y:y2,z:z,ground:g,what:names[b],above:names[a],why:"BURIED"}); }'
  + '     else if(!solid(u)){ out.floating++; if(out.ex.length<10) out.ex.push({x:x,y:y2,z:z,ground:g,what:names[b],below:(names[u]||"air"),why:"FLOATING"}); }'
  + '     else out.ok++;'
  + '   } }'
  + ' return out; })()';
}

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  let fail=false;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:900,height:600} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=920,640']) });
      ctx=await browser.newContext({ viewport:{width:900,height:600} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1&rd=8'+FLAGS, { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(9000);
    const P = await page.evaluate('__hc.pos()');
    const cx=Math.round(P.x), cz=Math.round(P.z);
    console.log('invariant '+(INVARIANT_OFF?'DISABLED (?nodecoseat=1)':'enabled')+'   spawn ('+cx+','+cz+')');

    // ---------- CONTROL ----------
    const ctl = await page.evaluate('(()=>{ var P=__hc.pos(); var x=Math.floor(P.x)+3, z=Math.floor(P.z)+3; var g=__hc.surfH(x,z);'
      + ' __hc.setBlockAt(x,g,z,"bush"); __hc.setBlockAt(x,g+1,z,"dirt"); return {x:x,z:z,g:g}; })()');
    await sleep(1200);
    const c1 = await page.evaluate(CHECK(ctl.x, ctl.z, 1));
    const there = await page.evaluate('(()=>{ var b=__hc.blockAt('+ctl.x+','+ctl.g+','+ctl.z+')|0; var n={}; var ks=__hc.bid();'
      + ' for(var i=0;i<ks.length;i++) n[__hc.bid(ks[i])]=ks[i]; return b?(n[b]||b):"air"; })()');
    if(INVARIANT_OFF){
      const caught = c1.buried > 0;
      console.log('CONTROL  sank a bush at ('+ctl.x+','+ctl.z+') y='+ctl.g+'  block there: '+there+'  -> buried='+c1.buried
                  +'   '+(caught?'CAUGHT — the check can fail':'NOT CAUGHT — THE CHECK IS VACUOUS'));
      if(!caught){ console.log('ABORT: a check that cannot fail is not evidence.'); fail=true; }
    } else {
      const removed = (there!=='bush');
      console.log('CONTROL  sank a bush at ('+ctl.x+','+ctl.z+') y='+ctl.g+'  block there: '+there
                  +'   '+(removed?'REMOVED by the invariant':'STILL BURIED — the global rule did not fire'));
      if(!removed) fail=true;
    }
    await page.evaluate('(()=>{ __hc.setBlockAt('+ctl.x+','+(ctl.g+1)+','+ctl.z+',0); __hc.setBlockAt('+ctl.x+','+ctl.g+','+ctl.z+',"grass"); })()');
    await sleep(800);

    // ---------- 1: ordinary generated terrain ----------
    if(!fail){
      const r = await page.evaluate(CHECK(cx, cz, 40));
      console.log('PLAIN TERRAIN  cols='+r.cols+'  deco='+r.deco+'  ok='+r.ok+'  BURIED='+r.buried+'  FLOATING='+r.floating);
      if(r.deco < 50){ console.log('ABORT: only '+r.deco+' decoration blocks — sample too thin to mean anything.'); fail=true; }
      else if(r.buried||r.floating){ console.log('  ex '+JSON.stringify(r.ex.slice(0,6))); fail=true; }
    }

    // ---------- 2: a structure pad has just moved the ground under existing decoration ----------
    if(!fail){
      await page.evaluate('__hc.qaVillage()');
      await sleep(6000);
      const Q = await page.evaluate('__hc.pos()');
      const r = await page.evaluate(CHECK(Math.round(Q.x), Math.round(Q.z), 26));
      console.log('VILLAGE PAD    cols='+r.cols+'  deco='+r.deco+'  ok='+r.ok+'  BURIED='+r.buried+'  FLOATING='+r.floating);
      if(r.deco < 50){ console.log('ABORT: only '+r.deco+' decoration blocks near the pad.'); fail=true; }
      else if(r.buried||r.floating){ console.log('  ex '+JSON.stringify(r.ex.slice(0,6))); fail=true; }
    }

    // ---------- 3: a wide sweep. The spawn ring holds the cabin, the trail network, the shrines and the lookout
    // towers, so walk it and scan each. Any violation at any site fails the run.
    if(!fail){
      let tot=0, bad=0, sites=0;
      const RING=[[0,0],[60,-40],[-70,30],[120,60],[-120,-60],[40,110],[-40,-110],[180,0],[0,-180]];
      for(let i=0;i<RING.length;i++){
        const ox=RING[i][0], oz=RING[i][1];
        await page.evaluate('__hc.tp('+(cx+ox)+','+(cz+oz)+')');
        await sleep(5200);
        const Q = await page.evaluate('__hc.pos()');
        const r = await page.evaluate(CHECK(Math.round(Q.x), Math.round(Q.z), 28));
        sites++; tot+=r.deco; bad+=r.buried+r.floating;
        const tag=(r.buried||r.floating)?('   <-- VIOLATIONS buried='+r.buried+' floating='+r.floating):'';
        console.log('  sweep '+String(ox).padStart(5)+','+String(oz).padStart(5)+'  deco='+String(r.deco).padStart(4)+'  ok='+String(r.ok).padStart(4)+tag);
        if(r.buried||r.floating) console.log('    ex '+JSON.stringify(r.ex.slice(0,4)));
      }
      console.log('WIDE SWEEP  '+sites+' sites, '+tot+' decoration blocks, '+bad+' violations');
      if(tot<300){ console.log('ABORT: '+tot+' decoration blocks over '+sites+' sites is too thin a sample.'); fail=true; }
      else if(bad>0) fail=true;
    }

    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log(fail?'RESULT: FAIL':'RESULT: PASS');
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
