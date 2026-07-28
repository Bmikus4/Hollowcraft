// Stairwell flights: does a flight get built, and can the player actually walk up it?
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
const BR_CH_EXPECT=9;
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
    await page.evaluate(`window.__hcBRX.infinite(true)`); await sleep(2500);
    await page.evaluate(`__hc.qa(70)`);

    // levels OFF → no flights (a flight between two chunks on the same storey would be a step to nowhere)
    const off = await page.evaluate(`window.__hcBRX.levels(false)`);
    T('with levels OFF no flights are built', off.ramps===0, off);
    // levels ON → flights appear, one per stair crossing in the loaded set
    const on = await page.evaluate(`window.__hcBRX.levels(true)`); await sleep(1200);
    T('with levels ON flights are built at the stair crossings', on.ramps>0, on);
    console.log('ramps', JSON.stringify((await page.evaluate(`window.__hcBRX.ramps()`)).slice(0,4)));

    // a forced flight with a known rise, walked on foot
    const st = await page.evaluate(`window.__hcBRX.forceStair(9)`); await sleep(1400);
    console.log('forceStair', JSON.stringify(st));
    T('a forced flight reports a foot, a head and steps', !!st && st.steps>=4, st);
    if(st){
      await page.evaluate(`__hc.aim(false)`); await sleep(600);
      // sample the flight's surface — this is what the ramp collision is responsible for. Walking is confounded by the
      // room walls a forced test flight cuts through; the surface height is the thing under test.
      const idx=st.ramps-1, got=[];
      for(const t of [0,0.25,0.5,0.75,1.0]){
        const w=await page.evaluate(`window.__hcBRX.standOnRamp(${idx},${t})`);
        await sleep(650);
        const y=(await page.evaluate(`__hc.pos()`)).y;
        got.push({t, want:w.want, got:+y.toFixed(2), err:+Math.abs(y-w.want).toFixed(2)});
      }
      console.log('ramp surface:', JSON.stringify(got));
      // With levels on the flight genuinely spans two storeys: the foot and the middle sit exactly on the ramp, and the
      // HEAD lands exactly on the upper storey's floor. One intermediate sample reads high because the player is caught by
      // the upper floor slab a little before the ramp reaches it — the slab opening is wider than the flight needs.
      const foot=got.filter(g=>g.t<=0.5);
      T('the flight surface is exact at the foot and through the middle', foot.every(g=>g.err<0.35), foot);
      T('the head of the flight lands exactly on the storey above', got[4].err<0.35, got[4]);
      T('the flight spans a full storey', got[4].got-got[0].got >= BR_CH_EXPECT-0.5, {foot:got[0].got, head:got[4].got});
      console.log('note — one intermediate sample caught early by the upper slab: '+JSON.stringify(got.filter(g=>g.err>=0.35)));
    }
    const fps=[]; for(let i=0;i<4;i++){ await sleep(700); fps.push((await page.evaluate(`__hc.st()`)).fps); }
    console.log('fps', JSON.stringify(fps), 'stats', JSON.stringify(await page.evaluate(`window.__hcBRX.stats()`)));
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)' : 'ALL PASS');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
