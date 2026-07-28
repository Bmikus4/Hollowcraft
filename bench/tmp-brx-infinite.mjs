// The generation refactor: does the maze actually continue forever, and is the fixed region unchanged when it is off?
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
    await page.evaluate(`window.__hcBR.enter()`); await sleep(6000);

    // ---- OFF: the fixed region must be exactly as before
    const off = await page.evaluate(`window.__hcBRX.stats()`);
    T('with infinity OFF the fixed region is intact', off.infinite===false && off.rooms>25 && off.walls>100, off);

    // ---- ON
    await page.evaluate(`window.__hcBRX.infinite(true)`); await sleep(2500);
    const on = await page.evaluate(`window.__hcBRX.stats()`);
    T('turning it on loads a 3x3 neighbourhood', on.infinite===true && on.loaded===9, on);
    T('the union has rooms and walls', on.rooms>40 && on.walls>150, {rooms:on.rooms, walls:on.walls});

    // ---- WALK OUT: far beyond the old 14x14 region, and keep finding rooms
    const seen=[];
    for(const [gx,gz] of [[0,0],[3,0],[9,-4],[25,17],[-40,-31],[140,-90],[1000,1000]]){
      const r=await page.evaluate(`window.__hcBRX.walkTo(${gx},${gz})`); await sleep(900);
      const st=await page.evaluate(`window.__hcBRX.stats()`);
      const room=await page.evaluate(`(()=>{ const r=window.__hcBRX.roomHere?window.__hcBRX.roomHere():null; return r; })()`).catch(()=>null);
      seen.push({want:[gx,gz], at:[st.at.gx,st.at.gz], rooms:st.rooms, loaded:st.loaded});
    }
    console.log('walk:', JSON.stringify(seen));
    T('every visited chunk generated content', seen.every(s=>s.rooms>25 && s.loaded===9), seen.filter(s=>!(s.rooms>25&&s.loaded===9)));
    T('the player really is in the chunk asked for', seen.every(s=>s.at[0]===s.want[0] && s.at[1]===s.want[1]), seen.filter(s=>s.at[0]!==s.want[0]||s.at[1]!==s.want[1]));

    // ---- DETERMINISM: revisit chunk 0,0 and 25,17 and confirm identical layouts
    const sig=async(gx,gz)=>{ await page.evaluate(`window.__hcBRX.walkTo(${gx},${gz})`); await sleep(700);
      return await page.evaluate(`window.__hcBRX.sig(${gx},${gz})`); };
    const a1=await sig(25,17), b1=await sig(-40,-31), a2=await sig(25,17);
    T('revisiting a chunk reproduces it exactly', a1!==null && a1===a2 && a1.length>0, {len:a1&&a1.length, same:a1===a2});
    T('different chunks are different mazes', a1!==b1, {a:(a1||'').slice(0,60), b:(b1||'').slice(0,60)});
    // zone must be a real district everywhere, including negative chunk coordinates (JS % keeps the dividend's sign)
    const zbad = await page.evaluate(`(()=>{ const bad=[];
      for(const [gx,gz] of [[0,0],[5,3],[-7,-9],[-40,-31],[-1,-1],[140,-90],[-1000,1000]]){
        window.__hcBRX.walkTo(gx,gz); const s=window.__hcBRX.sig(gx,gz);
        if(/,undefined,/.test(s) || !s.length) bad.push([gx,gz,s.slice(0,40)]); }
      return bad; })()`);
    T('no room anywhere has an undefined zone', zbad.length===0, zbad);

    // ---- COST of a chunk crossing (the honest number)
    await page.evaluate(`window.__hcBRX.walkTo(0,0)`); await sleep(1200);
    const cost = await page.evaluate(`(()=>{ const t0=performance.now(); window.__hcBRX.walkTo(7,7); return performance.now()-t0; })()`);
    console.log('chunk-crossing rebuild cost: '+cost.toFixed(1)+' ms');
    T('a chunk crossing completes in under 400ms', cost<400, {ms:+cost.toFixed(1)});

    await page.evaluate(`window.__hcBRX.walkTo(0,0)`); await sleep(1500);
    await page.evaluate(`__hc.qa(60)`); await sleep(600);
    await page.screenshot({ path: path.join(OUT,'v1-infinite.png') });
    const fps=[]; for(let i=0;i<4;i++){ await sleep(700); fps.push((await page.evaluate(`__hc.st()`)).fps); }
    console.log('fps in infinite mode', JSON.stringify(fps));
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)' : 'ALL PASS');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
