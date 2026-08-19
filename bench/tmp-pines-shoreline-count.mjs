// ONE SHORELINE, NOT TWO. Ben's frame showed the back sheet's own beach as a second sand line above the front's.
// Counting sand BANDS down the middle of the stand is the test: two bands means the layers are stacked pictures.
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
await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
await page.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.setTime(0.30); localStorage.removeItem('hollowcraft_pines_v2'); __hc.cmdRun('/pines clear');");
// Ben's vantage: up in the air, looking slightly down at a placed stand over the water.
const B=await page.evaluate('__hc.islandCentres().mass');
await page.evaluate(`__hc.tpAt(${B.x}+Math.cos(150*Math.PI/180)*250, ${await page.evaluate('__hc.island().sea')}+42, ${B.z}+Math.sin(150*Math.PI/180)*250);`);
for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
await sleep(2500);
await page.evaluate("__hc.cmdRun('/waypoint island center mass'); __hc.cmdRun('/waypoint shore'); __hc.cmdRun('/waypoint radius'); __hc.cmdRun('/pines at 180');");
await sleep(1500);
// AIM AT THE PINE ITSELF, from its reported world position. Deriving a yaw from the axis bearing pointed the
// camera back over the island and the first run of this "measured" real forest instead of the stand -- 0 sand
// bands, and meaningless.
const st0=await page.evaluate('__hc.pinesState()');
const front=(st0.sheets||[]).find(q=>!q.back);
if(!front) throw new Error('no front sheet to aim at');
const me=await page.evaluate('__hc.pos()');
{ const dx=front.at[0]-me.x, dz=front.at[1]-me.z;
  const yaw=Math.atan2(-dx,-dz);   // the game's yaw convention: 0 looks along -z
  await page.evaluate('__hc.cam({yaw:'+yaw+', pitch:-0.06});'); }
await sleep(1500);
console.log(`  aimed at the front sheet at ${JSON.stringify(front.at)} from ${me.x.toFixed(0)},${me.z.toFixed(0)}`);
const f=path.join(ROOT,'bench','results','pines-shorelines.png');
await page.screenshot({path:f});
// Count SAND BANDS in a vertical strip through the stand: runs of rows that are mostly sand-hued.
const bands=await page.evaluate(`(async()=>{ const c=document.querySelector('canvas');
  const g=document.createElement('canvas'); g.width=c.width; g.height=c.height;
  g.getContext('2d').drawImage(c,0,0);
  const d=g.getContext('2d').getImageData(0,0,g.width,g.height).data, W=g.width, H=g.height;
  const x0=(W*0.42)|0, x1=(W*0.58)|0;
  const rows=[];
  for(let y=0;y<H;y++){ let sand=0,tot=0;
    for(let x=x0;x<x1;x+=2){ const i=(y*W+x)*4, r=d[i],gg=d[i+1],b=d[i+2];
      tot++; if(r>b+28 && r>=gg-12 && r>90) sand++; }
    rows.push(sand/tot); }
  const bands=[]; let run=null;
  for(let y=0;y<H;y++){ if(rows[y]>0.45){ if(!run) run={a:y}; run.b=y; } else if(run){ if(run.b-run.a>=3) bands.push([run.a,run.b]); run=null; } }
  if(run&&run.b-run.a>=3) bands.push([run.a,run.b]);
  return bands; })()`);
console.log(`  sand bands down the middle of the stand: ${bands.length}  ${JSON.stringify(bands)}`);
console.log(`  ${bands.length<=1?'ONE shoreline — the layers read as one wood':'TWO OR MORE — the back is still showing its own ground'}`);
console.log('  -> bench/results/pines-shorelines.png');
console.log(errs.length?('  ERRORS: '+errs.slice(0,3).join(' | ')):'  no page errors');
await browser.close(); server.kill();
