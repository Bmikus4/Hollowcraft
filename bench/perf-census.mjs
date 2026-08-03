// WHOLE-GAME FPS CENSUS. The shipped suite (bench/perf-run.mjs, PERF.bench.SCENES) measures six places:
// the Backrooms, the portal, and the overworld at spawn. The game is much bigger than that — cathedral,
// dungeon hall, labyrinth, village, cabin, chapel, peak towers, deep forest, shoreline, underwater, the
// boss, the Wretch, a particle storm, a thunderstorm, third person, the field guide — and none of those
// had ever been on a stopwatch.
//
// It measures them WITHOUT editing index.html: everything is driven through the shipped QA hooks
// (__hc.* / __hcPERF.*) and the shipped command console (__hc.cmdRun). index.html is an ES module, so the
// page's own locals are NOT reachable from evaluate() — anything a site needs must already be exposed as
// a hook, and if it is not, the site says so rather than quietly measuring the wrong place.
//
//   node bench/perf-census.mjs                        # every site
//   node bench/perf-census.mjs --only forest,boss --dur 12
//   node bench/perf-census.mjs --repeat 3             # spread visible, not assumed
//   node bench/perf-census.mjs --perfoff all          # the same sites on pre-pass baseline flags
//
// Per site: frame median/p99/max, frames over 12 and 16.6 ms, the game's own per-system breakdown over
// the same window, draw calls, triangles, drawables, shadow faces, point lights, live shader programs and
// programs COMPILED during the window — a compile is a guaranteed hitch, and attributing it to the place
// it happens in is the whole reason to measure places separately.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT  = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const argv = process.argv.slice(2);
const arg = (k,d)=>{ const i=argv.indexOf('--'+k); return i>=0 ? argv[i+1] : d; };
const has = k => argv.includes('--'+k);

const DUR    = +arg('dur', 10);
const SETTLE = +arg('settle', 6);
const REPEAT = +arg('repeat', 1);
const ONLY   = arg('only', null);
const PERFOFF= arg('perfoff', null);
const HEADED = has('headed');

// ---------------------------------------------------------------------------
// SITES. `setup` is a body run once in the page; it may use `H` (=window.__hc), `P` (=window.__hcPERF)
// and `at(x,z[,dy])`. `move` is a body run ~60x/s with `t` in seconds — used only where the cost under
// test is movement or streaming. Everything else is a fixed camera on purpose: a scripted walk adds its
// own variance to a question about draw cost.
// ---------------------------------------------------------------------------
const SITES = [
  // ---- overworld: where the game is actually played ----
  { name:'spawn_day',    setup:`H.setTime(0.35); atSpawn(); H.look(0.7,-0.05);` },
  { name:'spawn_night',  setup:`H.setTime(0.85); atSpawn(); H.look(0.7,-0.05);` },
  { name:'spawn_spin',   setup:`H.setTime(0.35); atSpawn(); H.look(0,0);`, move:`H.look(t*2.2, 0);` },
  { name:'spawn_run',    setup:`H.setTime(0.35); atSpawn(); H.look(-1.5708,0); H.key('KeyW',true); H.key('ShiftLeft',true);`,
    teardown:`H.key('KeyW',false); H.key('ShiftLeft',false);` },
  { name:'forest',       setup:`H.setTime(0.35); goForest(); H.look(0.7,-0.02);` },
  { name:'forest_night', setup:`H.setTime(0.85); goForest(); H.look(0.7,-0.02);` },
  { name:'forest_run',   setup:`H.setTime(0.35); goForest(); H.look(0.7,0); H.key('KeyW',true); H.key('ShiftLeft',true);`,
    teardown:`H.key('KeyW',false); H.key('ShiftLeft',false);` },
  { name:'shore',        setup:`H.setTime(0.35); goShore();` },
  { name:'underwater',   setup:`H.setTime(0.35); goWater();` },
  { name:'storm',        setup:`H.setTime(0.40); atSpawn(); H.cmdRun('/weather storm 1');`, teardown:`H.cmdRun('/weather clear');` },
  { name:'fogbank',      setup:`H.setTime(0.35); atSpawn(); H.cmdRun('/weather fog 1');`, teardown:`H.cmdRun('/weather clear');` },
  { name:'peak_tower',   setup:`H.setTime(0.35); goPeak();`, settle:10 },

  // ---- built places ----
  { name:'cabin',        setup:`H.setTime(0.85); goCabin();` },
  { name:'village',      setup:`H.setTime(0.35); goVillage();`, settle:10 },
  { name:'chapel',       setup:`H.setTime(0.35); goChapel();`, settle:10 },
  { name:'golgotha',     setup:`H.setTime(0.85); goGolgotha();`, settle:8 },
  { name:'cathedral',    setup:`H.setTime(0.35); H.goCathedral(0,3,44); H.look(null,-0.02);`, settle:14 },
  { name:'cathedral_in', setup:`H.setTime(0.35); H.goCathedral(0,2,0); H.look(null,0.10);`, settle:14 },

  // ---- underground ----
  { name:'dungeon_hall', setup:`goDungeon('hall');`, settle:10 },
  { name:'dungeon_lab',  setup:`goDungeon('lab');`, settle:10 },
  { name:'dungeon_run',  setup:`goDungeon('lab'); H.key('KeyW',true);`, teardown:`H.key('KeyW',false);`, settle:10 },

  // ---- entities, combat, boss ----
  { name:'animals',      setup:`H.setTime(0.35); atSpawn(); for(const c of ['cow','pig','sheep','chicken']) H.cmdRun('/spawn '+c+' 4 9');` },
  { name:'wretch_near',  setup:`H.setTime(0.85); atSpawn(); H.summon(); H.yank();`, settle:5 },
  { name:'horrific',     setup:`H.setTime(0.85); atSpawn(); H.hw(11);`, settle:5 },
  { name:'boss',         setup:`H.setTime(0.85); atSpawn(); H.boss({dist:24}); H.aimEye();`, settle:9 },
  { name:'boss_stage2',  setup:`H.setTime(0.85); atSpawn(); H.boss({dist:24}); H.aimEye(); H.stage2&&H.stage2();`, settle:11 },
  { name:'particles',    setup:`H.setTime(0.35); atSpawn();`, move:`const k=(t*6)|0; if(k!==window.__pk){ window.__pk=k; H.fx(45); }` },
  { name:'gunfire',      setup:`H.setTime(0.35); atSpawn(); H.gun&&H.gun('ar15'); H.sight&&H.sight(true);`,
    move:`const k=(t*8)|0; if(k!==window.__gk){ window.__gk=k; try{ H.shoot(); }catch(e){} }` },

  // ---- views and held UI ----
  { name:'thirdperson',  setup:`H.setTime(0.35); atSpawn(); tps(true);`, teardown:`tps(false);` },
  { name:'field_guide',  setup:`H.setTime(0.35); atSpawn(); H.hold('field_guide'); H.book&&H.book(true);` },

  // ---- the Backrooms and the portal: regression watch on the shipped P1-P5 pass ----
  { name:'br_halls',     setup:`P.enterBR(); H.look(0.7,0);`, settle:9 },
  { name:'br_run',       setup:`P.enterBR(); H.look(0.7,0); H.key('KeyW',true); H.key('ShiftLeft',true);`,
    teardown:`H.key('KeyW',false); H.key('ShiftLeft',false);`, settle:9 },
  { name:'br_portal',    setup:`P.exitBR(); goPortal();`, settle:9 },
];

// Injected helpers. This file is a measuring instrument, so it adds nothing to the game: every helper is
// a composition of hooks index.html already ships.
const HELPERS = `
(function(){
  const H = window.__hc, P = window.__hcPERF;
  window.H = H; window.P = P;
  window.probe0 = H.probe();
  window.creative = ()=>{ try{ H.cmdRun('/gamemode creative'); H.cmdRun('/fly on'); H.cmdRun('/heal 20'); }catch(e){} };
  window.at = (x,z,dy)=>{ const r=H.tp(Math.round(x), Math.round(z)); if(dy) H.tpAt(r.x, r.y+dy, r.z); return H.pos(); };
  window.atSpawn = ()=>at(probe0.spawnX, probe0.spawnZ);
  window.tps = (on)=>{ const s=H.st(); if(!!window.__tps !== !!on){ dispatchEvent(new KeyboardEvent('keydown',{code:'F3'})); window.__tps=!!on; } return !!window.__tps; };
  // Densest canopy inside 200 m, measured off the terrain itself: surfH is the ground, and a tall stack of
  // non-air above it is a tree. Sampling the surface is the only foliage signal reachable from out here.
  window.goForest = ()=>{
    const S=probe0.spawnX, Z=probe0.spawnZ; let best=null, bs=-1;
    for(let r=24; r<=200; r+=14) for(let a=0; a<6.283; a+=0.45){
      const x=Math.round(S+Math.cos(a)*r), z=Math.round(Z+Math.sin(a)*r);
      const pts=[]; for(let dx=-7;dx<=7;dx+=7) for(let dz=-7;dz<=7;dz+=7) pts.push([x+dx,z+dz]);
      const hs=H.surfH(pts); if(!Array.isArray(hs)) break;
      let lo=1e9, hi=-1e9, sea=0; for(const h of hs){ if(h<lo)lo=h; if(h>hi)hi=h; if(h<=probe0.sea) sea++; }
      if(sea) continue;                                    // canopy score is meaningless over water
      const s=(hi-lo);                                     // ragged surface over dry land == canopy
      if(s>bs){ bs=s; best={x,z}; }
    }
    if(!best) return {err:'no forest'};
    at(best.x, best.z); creative(); return {x:best.x, z:best.z, relief:bs};
  };
  window.goShore = ()=>{
    const S=probe0.spawnX, Z=probe0.spawnZ; let best=null, bs=-1;
    for(let r=40; r<=280; r+=20) for(let a=0; a<6.283; a+=0.35){
      const x=Math.round(S+Math.cos(a)*r), z=Math.round(Z+Math.sin(a)*r);
      const here=H.surfH(x,z); if(!(here>probe0.sea+3)) continue;
      const pts=[]; for(let b=0;b<6.283;b+=0.6) for(let d=30;d<=110;d+=20) pts.push([Math.round(x+Math.cos(b)*d), Math.round(z+Math.sin(b)*d)]);
      const hs=H.surfH(pts); let w=0; for(const h of hs) if(h<=probe0.sea) w++;
      const s=w + here*0.4; if(s>bs){ bs=s; best={x,z}; }
    }
    if(!best) return {err:'no shore'};
    at(best.x, best.z, 6);
    // face whichever bearing has the most open water in it — the ocean layer + horizon pines are the cost here
    let bd=-1, byaw=0;
    for(let a=0;a<6.283;a+=0.2){ const pts=[]; for(let d=30;d<=120;d+=15) pts.push([Math.round(best.x+Math.cos(a)*d), Math.round(best.z+Math.sin(a)*d)]);
      const hs=H.surfH(pts); let w=0; for(const h of hs) if(h<=probe0.sea) w++;
      if(w>bd){ bd=w; byaw=Math.atan2(-Math.cos(a), -Math.sin(a)); } }
    H.look(byaw, -0.05); creative(); return {x:best.x, z:best.z, water:bd};
  };
  window.goWater = ()=>{ const d=H.deepWater(); if(!d || d.err) return {err:'no deep water: '+JSON.stringify(d)};
    const x=d.x!=null?d.x:(d[0]||0), z=d.z!=null?d.z:(d[1]||0);
    H.tpAt(x, probe0.sea-1.5, z); H.look(0.7,-0.10); return {x, z, water:H.water()}; };
  window.goCabin = ()=>{ const x=probe0.spawnX+22, z=probe0.spawnZ-14; at(x,z); H.look(0.7,0); creative(); return {x,z}; };
  window.goVillage = ()=>{ const r=H.qaVillage(); const s=(r&&r.x!=null)?r:null; if(s) at(s.x, s.z, 4); creative(); return r; };
  window.goChapel = ()=>{ const c=H.church(); if(!c || c.x==null) return {err:'no chapel spot: '+JSON.stringify(c)};
    at(c.x, c.z, 2); H.look(0.7,0); creative(); return c; };
  window.goGolgotha = ()=>{ const g=H.golgotha(); if(!g || g.x==null) return {err:'no golgotha: '+JSON.stringify(g)};
    at(g.x+18, g.z+18, 3); H.look(Math.atan2(-(g.x-(g.x+18)), -(g.z-(g.z+18))), 0); creative(); return g; };
  window.goPeak = ()=>{ const p=H.peaks(); const s=p&&p.spots&&p.spots.length?p.spots.slice().sort((a,b)=>b.h-a.h)[0]:null;
    if(!s) return {err:'no peaks: '+JSON.stringify(p)};
    at(s.x+20, s.z+20, 6); H.look(Math.atan2(-(s.x-(s.x+20)), -(s.z-(s.z+20))), 0.05); creative(); return s; };
  window.goDungeon = (which)=>{
    const L=H.lairInfo(); if(!L) return {err:'no lair'};
    const cx=(L.cx!=null?L.cx:L.x), cz=(L.cz!=null?L.cz:L.z);
    at(cx, cz);                                            // stream the surface above it so the build fires
    const L2=H.lairInfo(), fy=(L2&&L2.fy!=null)?L2.fy:null;
    if(fy==null) return {err:'lair has no floor yet: '+JSON.stringify(L2)};
    if(which==='lab') H.tpAt(cx+22, fy+1.8, cz-13); else H.tpAt(cx, fy+1.8, cz);
    H.look(0.7,0); creative(); return {which, cx, cz, fy, built:L2.built};
  };
  window.goPortal = ()=>{ const d=P.spawnDoor(); if(!d || d.err) return {err:'no door: '+JSON.stringify(d)};
    H.tpAt(d.x+4, d.y+1.7, d.z+0.2); H.look(Math.atan2(-(d.x-(d.x+4)), -(d.z-(d.z+0.2))), 0); return d; };
  // A site must not inherit the previous one's world: third person, a live boss, a hall of spawned animals
  // and a weather bank all persist, and any of them silently lands in the next site's number.
  window.censusReset = ()=>{
    const o={};
    try{ tps(false); }catch(e){ o.tps=String(e.message||e); }
    try{ H.key('KeyW',false); H.key('KeyA',false); H.key('KeyS',false); H.key('KeyD',false); H.key('ShiftLeft',false); }catch(e){}
    try{ H.cmdRun('/kill mobs'); }catch(e){ o.kill=String(e.message||e); }
    try{ H.cmdRun('/weather clear'); }catch(e){}
    try{ H.cmdRun('/heal 20'); }catch(e){}
    try{ if(H.st().started && H.hwState) for(const w of (H.hwState()||[])) if(H.hwKill) H.hwKill(w.hid); }catch(e){}
    try{ H.freeze(false); }catch(e){}
    try{ H.pinScene(); }catch(e){}
    try{ P.exitBR(); }catch(e){}
    try{ H.lock(true); }catch(e){}
    return o;
  };
  // MOVE DRIVER for the few sites whose cost is motion. Deliberately not hooked into the render loop —
  // this measures the game as it is, and a hook would be a change to it.
  window.__census = { iv:null, t0:0,
    start(body){ this.stop(); const f=new Function('t', body); this.t0=performance.now();
      this.iv=setInterval(()=>{ try{ f((performance.now()-this.t0)/1000); }catch(e){} }, 16); },
    stop(){ if(this.iv){ clearInterval(this.iv); this.iv=null; } } };
  return { hooks:Object.keys(H).length, probe:window.probe0 };
})()`;

function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const med = a => { const s=a.slice().sort((x,y)=>x-y); return s.length%2 ? s[(s.length-1)/2] : (s[s.length/2-1]+s[s.length/2])/2; };

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const want = ONLY ? new Set(ONLY.split(',')) : null;
  const sites = SITES.filter(s=>!want || want.has(s.name));
  if(!sites.length){ console.error('no sites match --only. known: '+SITES.map(s=>s.name).join(',')); process.exit(1); }

  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null; const rows=[];
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:!HEADED,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1})).newPage();
    const errs=[]; page.on('pageerror',e=>{ const m=String(e.message||e).slice(0,180); errs.push(m); if(errs.length<=10) console.log('  PAGEERROR:',m); });
    const url = base+'/index.html?perf=1&debug=1&brseed=20260728'+(PERFOFF?('&perfoff='+PERFOFF):'');
    await page.goto(url,{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm()`);
    const hi = await page.evaluate(HELPERS);
    console.log('helpers:', JSON.stringify(hi).slice(0,180));
    const ref = await page.evaluate(`__hcPERF.ref()`);
    console.log('gpu:', ref.gpu, '| cores', ref.cores, '| buffer', ref.drawingBuffer.join('x'), '| rd', ref.renderDist, '| flags', PERFOFF?('perfoff='+PERFOFF):'shipped');

    for(let pass=1; pass<=REPEAT; pass++){
      for(const site of sites){
        await page.evaluate(`window.__census.stop()`);
        await page.evaluate(`window.censusReset()`);
        const run = body => page.evaluate(`(()=>{ try{ const r=(function(){${body}\nreturn null;})(); return r===null?'ok':r; }catch(e){ return {err:String(e&&e.message||e)}; } })()`);
        let setupOut=null;
        try{ setupOut = await run(site.setup); } catch(e){ setupOut={err:String(e.message||e)}; }
        if(setupOut && setupOut.err){ console.log(`\n${site.name}: SETUP FAILED — ${setupOut.err}`); rows.push({pass, site:site.name, err:setupOut.err}); continue; }
        if(site.move) await page.evaluate(`window.__census.start(${JSON.stringify(site.move)})`);
        // Streaming and any deferred structure build must finish BEFORE the ring is reset, or the number
        // measures arriving somewhere rather than being there.
        await sleep((site.settle!=null?site.settle:SETTLE)*1000);
        await page.evaluate(`__hc.lock(true); __hcPERF.reset();`);
        await sleep(DUR*1000);
        const r = await page.evaluate(`(()=>{ const f=__hcPERF.live(), p=__hc.frameProf(4000), i=__hc.perf(), L=__hc.lights(), c=__hcPERF.census();
          return { f, p, i, L, drawables:c.drawables, culledOff:c.culledOff, shadowFaces:c.shadowFaces, byOwner:c.byOwner,
                   pos:__hc.pos(), st:__hc.st(), heap:(performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(0):null) }; })()`);
        if(site.move) await page.evaluate(`window.__census.stop()`);
        if(site.teardown) await run(site.teardown);
        const q = { pass, site:site.name, setup:setupOut,
          n:r.f.n, median:r.f.median, p95:r.f.p95, p99:r.f.p99, max:r.f.max,
          over12:r.f.over12, over16:r.f.over16_6, over33:r.f.over33,
          fps:+(1000/Math.max(0.01,r.f.median)).toFixed(0), lowFps:+(1000/Math.max(0.01,r.f.p99)).toFixed(0),
          draws:r.i.calls, tris:r.i.tris, progs:r.i.progs, progsCompiled:r.p.progsCompiledInWindow,
          drawables:r.drawables, culledOff:r.culledOff, shadowFaces:r.shadowFaces,
          point:r.L.point, pointShadow:r.L.pointShadow, dirShadow:r.L.dirShadow,
          heap:r.heap, ms:r.p.ms, byOwner:r.byOwner, pos:r.pos, avgFrameMs:r.p.avgFrameMs };
        rows.push(q);
        console.log(`\n${site.name}  ${q.median} ms med (${q.fps} fps)  p99 ${q.p99}  max ${q.max}   >12ms ${q.over12}  >16.6 ${q.over16}  >33 ${q.over33}  n=${q.n}`);
        console.log(`  draws ${q.draws}  tris ${(q.tris/1000|0)}k  drawables ${q.drawables} (${q.culledOff} unculled)  shadowFaces ${q.shadowFaces}  point ${q.point}  progs ${q.progs} (+${q.progsCompiled} here)  heap ${q.heap}MB`);
        console.log(`  ${Object.entries(q.ms||{}).slice(0,7).map(([k,v])=>k+' '+v).join('  ')}`);
      }
    }
    const stamp = arg('tag','census');
    const f=path.join(OUT,`perf-census-${stamp}${PERFOFF?'-perfoff-'+PERFOFF:''}.json`);
    fs.writeFileSync(f, JSON.stringify({ ref, dur:DUR, settle:SETTLE, perfoff:PERFOFF, rows, pageErrors:errs.slice(0,60) },null,2));

    console.log('\n=== RANKED BY MEDIAN FRAME TIME ===');
    const byName={}; for(const r of rows){ if(r.err) continue; (byName[r.site]=byName[r.site]||[]).push(r); }
    const ranked = Object.entries(byName).map(([k,v])=>({ site:k, median:med(v.map(r=>r.median)), p99:med(v.map(r=>r.p99)),
      max:Math.max(...v.map(r=>r.max)), over12:med(v.map(r=>r.over12)), over16:med(v.map(r=>r.over16)), draws:med(v.map(r=>r.draws)),
      spread:+(Math.max(...v.map(r=>r.median))-Math.min(...v.map(r=>r.median))).toFixed(2),
      top:Object.entries(v[0].ms||{}).slice(0,3).map(([a,b])=>a+':'+b).join(' ') })).sort((a,b)=>b.median-a.median);
    console.log('site'.padEnd(15)+'med'.padStart(8)+'p99'.padStart(8)+'max'.padStart(9)+'>12'.padStart(7)+'>16.6'.padStart(7)+'draws'.padStart(8)+'spread'.padStart(8)+'   top systems');
    for(const r of ranked) console.log(r.site.padEnd(15)+String(r.median).padStart(8)+String(r.p99).padStart(8)+String(r.max).padStart(9)+String(r.over12).padStart(7)+String(r.over16).padStart(7)+String(r.draws).padStart(8)+String(r.spread).padStart(8)+'   '+r.top);
    const failed = rows.filter(r=>r.err);
    if(failed.length) console.log('\nSITES THAT COULD NOT BE REACHED (not measured, not a pass): '+failed.map(r=>r.site+' ('+r.err+')').join('; '));
    console.log('\nTarget from PERF_MATH: median <= 7.143 ms, p99 <= 9.5 ms, zero frames > 16.6 ms.');
    console.log('wrote '+f);
    if(errs.length) console.log('page errors: '+errs.length+' (first: '+errs[0]+')');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
