// DO THE PANELS BUTT EDGE TO EDGE, AND DO THEY SHARE ONE ARC?
// Ben: "remember when we mirrored the pines? they were right up against eachother, I want the same effect here."
// A gap or an overlap at the join fails the first; a z mismatch at the join fails the second, because two panels
// that touch but bow about their own centres still crease there.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,160)));
page.on('console',m=>{const t=m.text(); if(/\[loop\] exception|not defined|not a function/i.test(t)) errs.push(t.slice(0,160));});
await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
await page.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.setTime(0.28); localStorage.removeItem('hollowcraft_pines_v2'); __hc.cmdRun('/pines clear');");
const B=await page.evaluate('__hc.islandCentres().mass'); const SEA=await page.evaluate('__hc.island().sea');
await page.evaluate(`__hc.tpAt(${B.x}+Math.cos(150*Math.PI/180)*250, ${SEA}+30, ${B.z}+Math.sin(150*Math.PI/180)*250);`);
for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
await sleep(2500);
await page.evaluate("__hc.cmdRun('/waypoint island center mass'); __hc.cmdRun('/waypoint shore'); __hc.cmdRun('/waypoint radius'); __hc.cmdRun('/pines at 180');");
await sleep(1500);
const P=await page.evaluate('__hc.pinesPanels()');
for(const st of P){
  console.log(`  stand at dial ${st.dial}: ${st.panels.length} panels`);
  for(const p of st.panels) console.log(`    ${p.ext?'ext  ':'trees'}  x ${String(p.left).padStart(8)} .. ${String(p.right).padStart(7)}   z ${String(p.zLeft).padStart(7)} .. ${String(p.zRight).padStart(7)}   bottom y ${p.yBottom}`);
  for(let i=1;i<st.panels.length;i++){
    const a=st.panels[i-1], b=st.panels[i];
    const gap=+(b.left-a.right).toFixed(3), zStep=+(b.zLeft-a.zRight).toFixed(3), yStep=+(b.yBottom-a.yBottom).toFixed(2);
    console.log(`    join ${i}: gap ${gap}  (0 = touching)   z step ${zStep}  (0 = one arc, no crease)   bottom step ${yStep}`);
  }
}
const f=path.join(ROOT,'bench','results','pines-butt.png');
const st0=await page.evaluate('__hc.pinesState()'); const me=await page.evaluate('__hc.pos()');
{ const s0=(st0.stands||[])[0]; if(s0){ const dx=s0.at[0]-me.x, dz=s0.at[1]-me.z;
    await page.evaluate('__hc.cam({yaw:'+Math.atan2(-dx,-dz)+', pitch:-0.04});'); } }
await sleep(1200); await page.screenshot({path:f});
console.log('  stand at', JSON.stringify((st0.stands||[])[0]));
console.log('  -> bench/results/pines-butt.png');
console.log(errs.length?('  ERRORS: '+errs.slice(0,3).join(' | ')):'  no page errors');
await browser.close(); server.kill();
