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
// Every at-spawn site uses ONE view. Two sites that differ in where the camera points are not comparable:
// aimed at the horizon spawn measures 3.37 ms, aimed at the ground two metres away it measures 8.9 ms,
// because the overworld is fill-bound up close. The entity sites exist to price the entity, not the view.
const SPAWN_VIEW = '{yaw:0.7, pitch:-0.05}';
export const SITES = [
  // ---- overworld: where the game is actually played ----
  { name:'spawn_day',    setup:`H.setTime(0.35); atSpawn(); H.cam({yaw:0.7, pitch:-0.05});` },
  { name:'spawn_night',  setup:`H.setTime(0.85); atSpawn(); H.cam({yaw:0.7, pitch:-0.05});` },
  { name:'spawn_spin',   setup:`H.setTime(0.35); atSpawn(); H.cam({yaw:0, pitch:0});`, move:`H.cam({yaw:t*2.2, pitch:0});` },
  { name:'spawn_run',    setup:`H.setTime(0.35); atSpawn(); H.cam({yaw:-1.5708, pitch:0}); H.key('KeyW',true); H.key('ShiftLeft',true);`,
    teardown:`H.key('KeyW',false); H.key('ShiftLeft',false);` },
  { name:'forest',       setup:`H.setTime(0.35); goForest(); H.cam({yaw:0.7, pitch:-0.02});` },
  { name:'forest_night', setup:`H.setTime(0.85); goForest(); H.cam({yaw:0.7, pitch:-0.02});` },
  { name:'forest_run',   setup:`H.setTime(0.35); goForest(); H.cam({yaw:0.7, pitch:0}); H.key('KeyW',true); H.key('ShiftLeft',true);`,
    teardown:`H.key('KeyW',false); H.key('ShiftLeft',false);` },
  { name:'shore',        setup:`H.setTime(0.35); goShore();` },
  { name:'underwater',   setup:`H.setTime(0.35); goWater();` },
  { name:'storm',        setup:`H.setTime(0.40); atSpawn(); H.cam(${SPAWN_VIEW}); H.cmdRun('/weather storm 1');`, teardown:`H.cmdRun('/weather clear');` },
  { name:'fogbank',      setup:`H.setTime(0.35); atSpawn(); H.cam(${SPAWN_VIEW}); H.cmdRun('/weather fog 1');`, teardown:`H.cmdRun('/weather clear');` },
  { name:'peak_tower',   setup:`H.setTime(0.35); goPeak();`, settle:10 },

  // ---- built places ----
  { name:'cabin',        setup:`H.setTime(0.85); goCabin();` },
  { name:'village',      setup:`H.setTime(0.35); goVillage();`, settle:10 },
  { name:'chapel',       setup:`H.setTime(0.35); goChapel();`, settle:10 },
  { name:'golgotha',     setup:`H.setTime(0.85); goGolgotha();`, settle:8 },
  { name:'cathedral',    setup:`H.setTime(0.35); H.goCathedral(0,3,44); H.cam({pitch:-0.02});`, settle:14 },
  { name:'cathedral_in', setup:`H.setTime(0.35); H.goCathedral(0,2,0); H.cam({pitch:0.10});`, settle:14 },

  // ---- underground ----
  { name:'dungeon_hall', setup:`goDungeon('hall');`, settle:10 },
  { name:'dungeon_lab',  setup:`goDungeon('lab');`, settle:10 },
  { name:'dungeon_run',  setup:`goDungeon('lab'); H.key('KeyW',true);`, teardown:`H.key('KeyW',false);`, settle:10 },

  // ---- entities, combat, boss ----
  { name:'animals',      setup:`H.setTime(0.35); atSpawn(); H.cam(${SPAWN_VIEW}); for(const c of ['cow','pig','sheep','chicken']) H.cmdRun('/spawn '+c+' 4 9');` },
  { name:'wretch_near',  setup:`H.setTime(0.85); atSpawn(); H.cam(${SPAWN_VIEW}); H.summon(); H.yank(); H.look();`, settle:5 },
  { name:'horrific',     setup:`H.setTime(0.85); atSpawn(); H.cam(${SPAWN_VIEW}); H.hw(11);`, settle:5 },
  // aimEye alone points the camera up at a 11 m eye and fills the frame with sky: keep the boss in shot but
  // hold the pitch near level so the world is being drawn too.
  { name:'boss',         setup:`H.setTime(0.85); atSpawn(); H.boss({dist:24}); H.aimEye(); H.cam({pitch:Math.min(0.12, H.pitchNow())});`, settle:9 },
  { name:'boss_stage2',  setup:`H.setTime(0.85); atSpawn(); H.boss({dist:24}); H.aimEye(); H.cam({pitch:Math.min(0.12, H.pitchNow())}); H.stage2&&H.stage2();`, settle:11 },
  { name:'particles',    setup:`H.setTime(0.35); atSpawn(); H.cam(${SPAWN_VIEW});`, move:`const k=(t*6)|0; if(k!==window.__pk){ window.__pk=k; H.fx(45); }` },
  // The camera is aimed AFTER the sight goes up: raising the AR-15's sight pitches the view to +1.50 rad,
  // which the camera assertion (correctly) refuses to measure.
  { name:'gunfire',      setup:`H.setTime(0.35); atSpawn(); H.gun&&H.gun('ar15'); H.sight&&H.sight(true); H.cam(${SPAWN_VIEW});`,
    move:`const k=(t*8)|0; if(k!==window.__gk){ window.__gk=k; try{ H.shoot(); }catch(e){} }` },

  // ---- views and held UI ----
  { name:'thirdperson',  setup:`H.setTime(0.35); atSpawn(); H.cam(${SPAWN_VIEW}); tps(true);`, teardown:`tps(false);` },
  { name:'field_guide',  setup:`H.setTime(0.35); atSpawn(); H.cam(${SPAWN_VIEW}); H.hold('field_guide'); H.book&&H.book(true);` },

  // ---- the Backrooms and the portal: regression watch on the shipped P1-P5 pass ----
  { name:'br_halls',     setup:`P.enterBR(); H.cam({yaw:0.7, pitch:0});`, settle:9 },
  { name:'br_run',       setup:`P.enterBR(); H.cam({yaw:0.7, pitch:0}); H.key('KeyW',true); H.key('ShiftLeft',true);`,
    teardown:`H.key('KeyW',false); H.key('ShiftLeft',false);`, settle:9 },
  { name:'br_portal',    setup:`P.exitBR(); goPortal();`, settle:9 },
  // Standing the same 4 m from the door with your BACK to it. The gate on the portal's second scene render
  // was distance-only, so this cost exactly as much as looking straight through it.
  { name:'br_portal_away', setup:`P.exitBR(); goPortal(); H.cam({yaw:H.yawNow()+Math.PI, pitch:0});`, settle:9 },
  // TURNING PAST THE DOOR, over and over. This is the site that can expose the on-screen gate's own risk:
  // skipping the portal pass also skips brxUpdateLights, so the Backrooms pool goes dark while the door is
  // behind you and lights again when you turn back. three keys its programs on the light COUNT, so a pool
  // that toggles 18<->40 once per turn is the exact recompile churn brStableLightCount exists to stop.
  // Watch progsCompiled and the worst frame here, not the median.
  { name:'br_portal_turn', setup:`P.exitBR(); goPortal(); window.__y0=H.yawNow();`,
    move:`H.cam({yaw:window.__y0 + t*1.6, pitch:0});`, settle:9 },
];

// Injected helpers. This file is a measuring instrument, so it adds nothing to the game: every helper is
// a composition of hooks index.html already ships.
export const HELPERS = `
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
    H.cam({yaw:byaw, pitch:-0.05}); creative(); return {x:best.x, z:best.z, water:bd};
  };
  window.goWater = ()=>{ const d=H.deepWater(); if(!d || d.err) return {err:'no deep water: '+JSON.stringify(d)};
    const x=d.x!=null?d.x:(d[0]||0), z=d.z!=null?d.z:(d[1]||0);
    H.tpAt(x, probe0.sea-1.5, z); H.cam({yaw:0.7, pitch:-0.10}); return {x, z, water:H.water()}; };
  window.goCabin = ()=>{ const x=probe0.spawnX+22, z=probe0.spawnZ-14; at(x,z); H.cam({yaw:0.7, pitch:0}); creative(); return {x,z}; };
  window.goVillage = ()=>{ const r=H.qaVillage(); const s=(r&&r.x!=null)?r:null; if(s) at(s.x, s.z, 4); creative(); return r; };
  window.goChapel = ()=>{ const c=H.church(); if(!c || c.x==null) return {err:'no chapel spot: '+JSON.stringify(c)};
    at(c.x, c.z, 2); H.cam({yaw:0.7, pitch:0}); creative(); return c; };
  window.goGolgotha = ()=>{ const g=H.golgotha(); if(!g || g.x==null) return {err:'no golgotha: '+JSON.stringify(g)};
    at(g.x+18, g.z+18, 3); H.cam({yaw:Math.atan2(18, 18), pitch:0}); creative(); return g; };
  window.goPeak = ()=>{ const p=H.peaks(); const s=p&&p.spots&&p.spots.length?p.spots.slice().sort((a,b)=>b.h-a.h)[0]:null;
    if(!s) return {err:'no peaks: '+JSON.stringify(p)};
    at(s.x+20, s.z+20, 6); H.cam({yaw:Math.atan2(20, 20), pitch:0.05}); creative(); return s; };
  window.goDungeon = (which)=>{
    const L=H.lairInfo(); if(!L) return {err:'no lair'};
    const cx=(L.cx!=null?L.cx:L.x), cz=(L.cz!=null?L.cz:L.z);
    at(cx, cz);                                            // stream the surface above it so the build fires
    const L2=H.lairInfo(), fy=(L2&&L2.fy!=null)?L2.fy:null;
    if(fy==null) return {err:'lair has no floor yet: '+JSON.stringify(L2)};
    // STAND WHERE A PLAYER CAN STAND. cx+22/cz-13 was an arithmetic guess at "in the maze" and it lands in the 2-block rock
    // shell between corridors; the un-suffocate push then lifts you to y=fy+10, inside a one-block pocket with rock above and
    // below. Measurements taken from there are taken from inside a wall — it is what made the hunting Wretch look unable to
    // reach the player's floor when the maze and the hall share one. __hc.lairNodes() is the creature's own waypoint graph.
    if(which==='lab'){ const g=H.lairNodes ? H.lairNodes() : null;
      const n=(g && g.nodes) ? g.nodes.filter(v=>!v.hall) : [];
      // prefer a node whose column is genuinely open at the walkway height, and say so loudly if none is
      let put=null;
      for(const v of n){ const air=!H.blockAt(Math.floor(v.x), fy+1, Math.floor(v.z)) && !H.blockAt(Math.floor(v.x), fy+2, Math.floor(v.z));
        if(air && H.blockAt(Math.floor(v.x), fy, Math.floor(v.z))){ put=v; break; } }
      if(!put) return {err:'no open labyrinth node found: '+JSON.stringify(n.slice(0,4))};
      H.tpAt(put.x+0.5, fy+1.6, put.z+0.5);
    } else H.tpAt(cx, fy+1.8, cz);
    H.cam({yaw:0.7, pitch:0}); creative(); return {which, cx, cz, fy, built:L2.built};
  };
  window.goPortal = ()=>{ const d=P.spawnDoor(); if(!d || d.err) return {err:'no door: '+JSON.stringify(d)};
    H.tpAt(d.x+4, d.y+1.7, d.z+0.2); H.cam({yaw:Math.atan2(4, 0.2), pitch:0}); return d; };
  // A site must not inherit the previous one's world: third person, a live boss, a hall of spawned animals
  // and a weather bank all persist, and any of them silently lands in the next site's number.
  window.censusReset = ()=>{
    const o={};
    try{ tps(false); }catch(e){ o.tps=String(e.message||e); }
    try{ H.key('KeyW',false); H.key('KeyA',false); H.key('KeyS',false); H.key('KeyD',false); H.key('ShiftLeft',false); }catch(e){}
    try{ H.cmdRun('/kill mobs'); }catch(e){ o.kill=String(e.message||e); }
    try{ H.cmdRun('/weather clear'); }catch(e){}
    try{ H.cmdRun('/heal 20'); }catch(e){}
    try{ if(H.hwState) for(const w of (H.hwState()||[])) if(H.hwKill) H.hwKill(w.hid); }catch(e){}
    try{ H.set({active:false, boss:false, _park:false, _bossPhase:0}); }catch(e){}
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

const IS_MAIN = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if(IS_MAIN) await (async()=>{
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
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    // renderer.info resets per render() call, so an ordinary read reports only the composer's final quad
    // pass — draws came back as 1. __benchInfo makes the loop accumulate across every pass and snapshot it.
    await page.evaluate(`window.__hcPERF.arm(); window.__benchInfo = 1;`);
    const hi = await page.evaluate(HELPERS);
    console.log('helpers:', JSON.stringify(hi).slice(0,180));
    const ref = await page.evaluate(`__hcPERF.ref()`);
    console.log('gpu:', ref.gpu, '| cores', ref.cores, '| buffer', ref.drawingBuffer.join('x'), '| rd', ref.renderDist, '| flags', PERFOFF?('perfoff='+PERFOFF):'shipped');

    // CLEANLINESS BASELINE. The first version of this harness reported the dungeon at 16 ms and then the
    // FIELD GUIDE at spawn at 15.4 ms — the same camera that read 7.9 ms as the first site. The cause was
    // this harness, not the game: a spawned boss, sixteen animals and a Horrific Wretch survived the reset
    // and were still being drawn eleven sites later. bench/README.md's rule applies to a harness measuring
    // itself too, so the baseline is captured once and every site now has to come back to it.
    // Cleanliness must not count chunk meshes: those arrive as streaming fills and would make a
    // half-streamed world look "clean" and a settled one look contaminated. What leaks between sites is
    // scene-level objects — entities, props, boss parts — so that is what gets counted.
    const sceneObjs = async () => page.evaluate(`(()=>{ const o=__hcPERF.census().byOwner||{}; let n=0;
      for(const k in o) if(k!=='chunkRoot') n+=o[k]; return n; })()`);
    const cleanBaseline = async () => {
      await page.evaluate(`window.censusReset(); atSpawn(); H.cam({yaw:0.7, pitch:-0.05});`);
      await sleep(6000);
      return await sceneObjs();
    };
    let BASE = await cleanBaseline();
    const CLEAN_DRAWS = await page.evaluate(`__hc.perf().calls`);
    console.log('clean scene at spawn: '+BASE+' non-chunk objects, '+CLEAN_DRAWS+' draws');

    for(let pass=1; pass<=REPEAT; pass++){
      for(const site of sites){
        await page.evaluate(`window.__census.stop()`);
        await page.evaluate(`window.censusReset()`);
        // Back to spawn and check the scene really did empty. If it did not, the leftovers would be drawn
        // inside the next site's number, so reload the page rather than publish a contaminated figure.
        await page.evaluate(`atSpawn()`); await sleep(2500);
        let dirty = await sceneObjs();
        // +150, not +40. The leak this guard exists to catch was 500-700 objects (a boss, sixteen animals
        // and a Horrific Wretch surviving the reset). The ambient fauna spawner alone moves the count by
        // ±60 between two identical visits, so a tight threshold fires on noise and reloads the page every
        // site — a guard that cannot tell contamination from weather is just a slow harness.
        if(dirty > BASE+150){
          console.log(`\n  ! scene did not clean up after the previous site (${dirty} non-chunk objects vs ${BASE} baseline) — reloading the page so ${site.name} is measured on a clean world`);
          await page.goto(url,{waitUntil:'load',timeout:120000});
          await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
          await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
          await page.evaluate(`window.__hcPERF.arm(); window.__benchInfo=1;`);
          await page.evaluate(HELPERS);
          BASE = await cleanBaseline();
          dirty = BASE;
        }
        const run = body => page.evaluate(`(()=>{ try{ const r=(function(){${body}\nreturn null;})(); return r===null?'ok':r; }catch(e){ return {err:String(e&&e.message||e)}; } })()`);
        let setupOut=null;
        try{ setupOut = await run(site.setup); } catch(e){ setupOut={err:String(e.message||e)}; }
        if(setupOut && setupOut.err){ console.log(`\n${site.name}: SETUP FAILED — ${setupOut.err}`); rows.push({pass, site:site.name, err:setupOut.err}); continue; }
        if(site.move) await page.evaluate(`window.__census.start(${JSON.stringify(site.move)})`);
        // WAIT FOR THE WORLD TO BE THERE, do not wait for a duration. The cathedral read 3.11 ms with 302
        // draws on a fixed 14 s settle because a 300-block teleport had not finished streaming: the harness
        // measured an empty world and called it the fastest place in the game. Poll the game's own
        // meshed/want ring count, with the old fixed settle only as the deadline.
        const deadline = Date.now() + (site.settle!=null?site.settle:SETTLE)*3000;
        let fillState=null;
        for(;;){
          fillState = await page.evaluate(`(()=>{ const f=__hc.fill(); return {meshed:f.meshed, want:f.want, chunks:f.chunks}; })()`);
          if(fillState.meshed >= fillState.want) break;
          if(Date.now() > deadline){ console.log(`\n  ! ${site.name}: only ${fillState.meshed}/${fillState.want} chunks meshed when the deadline expired — this site is measured on a partly-built world`); break; }
          await sleep(500);
        }
        await sleep(2000);            // one breath past "meshed" so the first-draw uploads are not in the window
        // THE CAMERA MUST BE A CAMERA. __hc.look is the world-POINT overload — look(x,y,z) — and calling it
        // as look(yaw,pitch) leaves z undefined, which makes yaw NaN and pitches the view at the floor. A
        // whole census ran that way and produced 33 plausible-looking numbers of the ground. Check, do not
        // assume: a NaN yaw is not a slow frame, it is a measurement of nothing.
        const cam = await page.evaluate(`(()=>{ const p=__hc.pos(); return { yaw:p.yaw, pitch:p.pitch, ok:Number.isFinite(p.yaw)&&Number.isFinite(p.pitch)&&Math.abs(p.pitch)<1.4 }; })()`);
        if(!cam.ok){ console.log(`\n${site.name}: CAMERA IS NOT AIMED (yaw ${cam.yaw}, pitch ${cam.pitch}) — refusing to report a number for it`);
          rows.push({pass, site:site.name, err:`bad camera yaw=${cam.yaw} pitch=${cam.pitch}`}); continue; }
        // Adaptive quality sheds internal resolution, god rays, bloom, shadow rate and render distance when
        // the frame is tight, so a slow site quietly renders a CHEAPER game and reads faster than it is.
        // Pin it to full at the start of the window and report where it ended up — a "win" that is really
        // adaptive handing resolution back is the easiest false positive there is.
        await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hcPERF.reset();`);
        const q0 = await page.evaluate(`({ px:__hc.sceneState().pixelScale, rd:__hc.rd() })`);
        await sleep(DUR*1000);
        const r = await page.evaluate(`(()=>{ const f=__hcPERF.live(), p=__hc.frameProf(4000), i=__hc.perf(), L=__hc.lights(), c=__hcPERF.census();
          return { f, p, i, L, drawables:c.drawables, culledOff:c.culledOff, shadowFaces:c.shadowFaces, byOwner:c.byOwner,
                   px:__hc.sceneState().pixelScale, rd:__hc.rd(),
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
          heap:r.heap, ms:r.p.ms, byOwner:r.byOwner, pos:r.pos, avgFrameMs:r.p.avgFrameMs,
          pxStart:q0.px, pxEnd:r.px, rdStart:q0.rd, rdEnd:r.rd, preDrawables:dirty, baseDrawables:BASE };
        rows.push(q);
        // A site whose camera ended up pointing at empty sky measures the sky, and reads as the fastest
        // place in the game. boss and cathedral both did exactly that (289 and 302 draws against 894 for
        // the same clean spawn view) before the cameras were fixed, and 3.1 ms looked like good news.
        if(q.draws < CLEAN_DRAWS*0.5)
          console.log(`  ! ONLY ${q.draws} draws against ${CLEAN_DRAWS} for a clean spawn view — this camera is probably looking at sky or into a wall, so the ms below is not a measurement of this place`);
        if(q.pxEnd < q.pxStart || q.rdEnd < q.rdStart)
          console.log(`\n  ! ADAPTIVE SHED QUALITY HERE: pixelScale ${q.pxStart}->${q.pxEnd}, renderDist ${q.rdStart}->${q.rdEnd} — the ms below is a cheaper game than the one that started`);
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
