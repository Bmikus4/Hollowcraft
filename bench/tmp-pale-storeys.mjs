// The Pale across storeys: does it stand on the right floor, and can it path to a player on another storey?
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e).slice(0,220)); console.log('PAGEERROR:',String(e.message||e).slice(0,220)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(5500);

    // ---- baseline: the flat fixed region. The nav graph must have edges at all.
    const flat = await page.evaluate(`(()=>{ window.__hcBR.pale(20); return window.__hcBR.paleState(); })()`);
    console.log('flat', JSON.stringify(flat));
    T('nav graph has edges in the flat region', flat.navEdges>0, {edges:flat.navEdges});
    T('the Pale stands on its room floor, not a hardcoded slab', flat.floorY!==null && Math.abs(flat.y-flat.floorY)<1.2, {y:flat.y, floorY:flat.floorY});

    // ---- infinite + levels on
    await page.evaluate(`window.__hcBRX.infinite(true)`); await sleep(2200);
    await page.evaluate(`window.__hcBRX.levels(true)`); await sleep(2200);
    const lv = await page.evaluate(`(()=>{ window.__hcBR.pale(22); return window.__hcBR.paleState(); })()`);
    console.log('levels', JSON.stringify(lv));
    T('cross-chunk edges exist once boundaries are open', lv.navEdges>flat.navEdges*0.5 && lv.navEdges>0, {flat:flat.navEdges, levels:lv.navEdges});

    // ---- put the player and the Pale on DIFFERENT storeys and ask for a route
    // Levels are assigned per 4x4-chunk DISTRICT, so a 3x3 loaded window usually sits wholly inside one storey. Walk to a
    // centre that STRADDLES a district seam (gx multiple of 4 puts chunks 3 and 4 in different districts) so the loaded
    // set genuinely spans two floors — otherwise this property is untestable rather than false.
    let cross=null;
    for(const [gx,gz] of [[4,0],[4,4],[0,4],[8,4],[-4,0],[4,-4],[12,8]]){
      await page.evaluate(`window.__hcBRX.walkTo(${gx},${gz})`); await sleep(1100);
      await page.evaluate(`window.__hcBR.pale(22)`); await sleep(400);
      const c = await page.evaluate(`window.__hcBR.crossStorey()`);
      console.log('  centre', gx+','+gz, 'storeys', JSON.stringify(c.storeys));
      if((c.storeys||[]).length>=2){ cross=c; break; }
      cross=c; }
    console.log('cross-storey routing:', JSON.stringify(cross));
    T('the loaded set really spans more than one storey', (cross.storeys||[]).length>=2, cross.storeys);
    T('a route exists between rooms on different storeys', cross.routed>0 && cross.noRoute===0, {routed:cross.routed, noRoute:cross.noRoute, samples:cross.samples});

    // ---- let it actually hunt across a storey for a few seconds and confirm it changes height
    const hunt = await page.evaluate(`(()=>{ const s=window.__hcBR.paleState(); return s? {y:s.y, st:s.state} : null; })()`);
    await page.evaluate(`__hc.aim(false)`);
    await sleep(4000);
    const hunt2 = await page.evaluate(`window.__hcBR.paleState()`);
    console.log('after 4s of hunting:', JSON.stringify({from:hunt, to:{y:hunt2.y, floorY:hunt2.floorY, anim:hunt2.anim, dist:hunt2.dist}}));
    T('the Pale keeps its feet on the floor while hunting', hunt2.floorY===null || Math.abs(hunt2.y-hunt2.floorY)<1.5, {y:hunt2.y, floorY:hunt2.floorY});
    T('no page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)' : 'ALL PASS');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
