// IS THERE MUD UNDER THE RIVERS, AND IS THERE STILL SAND UNDER THE SEA? (Ben 08-16.)
//
// Counted, not photographed. A screenshot of one riverbank proves nothing about generation - it proves that one column
// came out right - so this walks every water column in range, digs down to the first block that is not water, and
// reports the share that is mud, split between inland water and the ocean. Both halves matter: the ask is rivers and
// lakes, and sweeping the sea floor up with them would take the shelf and slant-path work with it.
//
// It reads the LOADED WORLD through getBlock. Asking the generator predicate whether the generator predicate is true
// would pass on a build where no mud is placed at all.
//
//   node bench/tmp-mud-beds.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const logs=[]; page.on('pageerror',e=>logs.push('PAGEERROR: '+String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.freezeT(0); __hc.setTime(0.32);`);

    // mudCensus().spots are mud columns that sit BESIDE water - which is exactly a river bank, and therefore a place
    // where a river bed is within reach. It reads the generator, so it answers before anything has streamed.
    const cen=await page.evaluate(`__hc.mudCensus(140,2)`);
    const spot=(cen.spots&&cen.spots[0])||null;
    console.log(`  mud census  ${cen.mud} mud of ${cen.dry} dry columns (${cen.mudFrac}), ${cen.spots?cen.spots.length:0} spots to stand on`);
    if(!spot){ console.log('\n  NO RIVER BANK FOUND NEAR SPAWN - refusing to report a bed census with no river in it.'); process.exit(1); }
    await page.evaluate(`__hc.tpAt(${spot.x}+0.5, ${spot.gy!=null?spot.gy:spot.y}+3, ${spot.z}+0.5)`);
    for(let i=0;i<60;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(3000);

    const bed=await page.evaluate(`__hc.bedCensus(60,1)`);
    console.log(`  INLAND  ${JSON.stringify(bed.inland)}   mud ${bed.inlandMudPct}%`);
    console.log(`  OCEAN   ${JSON.stringify(bed.ocean)}    mud ${bed.oceanMudPct}%`);
    if(bed.notMudOrSand&&bed.notMudOrSand.length) console.log(`  under the water and neither: ${JSON.stringify(bed.notMudOrSand)}`);
    check('the census threw nothing', !bed.err, String(bed.err));
    // A real sample, or the percentages below are one column's opinion.
    check('enough inland water was sampled to mean anything', bed.inland.n>=40, `${bed.inland.n} inland bed columns`);
    // Not 100%: a river runs out to the coast, where the falloff has taken the island away and the gate correctly stops.
    check('most of the inland bed is mud', bed.inlandMudPct!=null && bed.inlandMudPct>=80, `${bed.inlandMudPct}%`);
    // THE OTHER HALF OF THE ASK, AND IT NEEDS ITS OWN TRIP. A river bank is deep inside the island, so a census taken
    // there contains no ocean at all - the first run of this reported the sea floor clean over a sample of ZERO columns
    // and passed. An empty control is not a control, which is the fault this whole day has been made of. So go and
    // stand in the sea.
    const IC=await page.evaluate(`__hc.isleStats()`);
    let sea=null;
    for(const d of [40,80,120,-40,-80]){ const x=IC.x+IC.R+d;
      await page.evaluate(`__hc.tpAt(${x}, __hc.island().sea+6, ${IC.z})`);
      for(let i=0;i<50;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
      await sleep(2500);
      const s=await page.evaluate(`__hc.bedCensus(50,1)`);
      console.log(`  ocean probe x=${x}  ocean columns ${s.ocean.n}  inland ${s.inland.n}`);
      if(s.ocean.n>=40){ sea=s; break; }
    }
    if(!sea){ console.log('\n  COULD NOT REACH OPEN SEA FLOOR - refusing to certify the ocean is unchanged on no samples.'); process.exit(1); }
    console.log(`  OCEAN   ${JSON.stringify(sea.ocean)}    mud ${sea.oceanMudPct}%`);
    check('the ocean floor was actually sampled', sea.ocean.n>=40, `${sea.ocean.n} ocean bed columns`);
    check('the ocean floor is NOT mud', sea.oceanMudPct<=2, `${sea.oceanMudPct}% over ${sea.ocean.n} ocean bed columns`);

    // A frame as well - not as the evidence, but because a bed that counts correctly can still look wrong.
    await page.evaluate(`__hc.cam({pitch:-0.5})`); await sleep(900);
    const f=path.join(OUT,'mud-bed.png'); await page.screenshot({path:f}); console.log('   ->',path.basename(f));
    check('no page errors', logs.length===0, logs.slice(0,1).join('').slice(0,160));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
