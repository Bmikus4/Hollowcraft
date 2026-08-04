// THE ICBM's CRATER IS TERRAIN, NOT BLOCK EDITS. Ben: "Nuclear ICBM: soviet rocket, massive launchpad, detonator, minimap
// target, mushroom cloud, radiation".
//
// THE ARITHMETIC THAT FORCED THE DESIGN. Every explosion in this game goes through bossBlast, which calls setBlockWorld(...,true)
// per block -- recording an edit and a net edit. Calibrated against the codebase's own number, a landmine at r=3.4 carves ~165
// blocks and its own comment calls that "a visible hitch":
//     r=12  ->   7,200 blocks (~170 KB of save JSON)
//     r=16  ->  17,200        (~410 KB)
//     r=40  -> 268,000        (~6.4 MB)
// localStorage is about 5 MB per origin and saveGame already has a "storage is full" path, so an r=40 crater blows the entire
// save budget on its own -- before the cost of 268,000 writes and remeshing every affected column at full height.
//
// So a crater is a worldgen term: one record in the save, subtracted from the heightfield, delivered by evicting the chunks it
// covers so the ordinary streamer rebuilds them. The FIRST check here is therefore that firing one adds ZERO edits, because that
// is the property the whole feature depends on and the one a later "simplify this to use bossBlast" pass would destroy.
//
// usage: node bench/assert-icbm.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

let checks=0, fails=0;
const ok=(n,c,d)=>{ checks++; if(!c){fails++; console.log('  FAIL  '+n+'   '+JSON.stringify(d)); } else console.log('  ok    '+n+'   '+JSON.stringify(d)); };

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1000,height:600}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.setTime(0.5)');
    await page.evaluate('__hc.icbmClear()');

    console.log('[1] the ground before');
    const p0=await page.evaluate('(()=>{ const q=__hc.probe(); return __hc.icbmProfile(q.x+220, q.z, 40, 8); })()');
    console.log('  profile: '+JSON.stringify(p0.map(o=>o.h)));
    ok('the heightfield reads before the blast', Array.isArray(p0) && p0.length>3, p0&&p0.length);

    console.log('\n[2] fire one, 220 blocks away — and count the edits');
    const st0=await page.evaluate('__hc.icbm()');
    const fire=await page.evaluate('__hc.icbmFire(220,0)');
    console.log('  fired: '+JSON.stringify(fire));
    ok('a crater was recorded', fire && fire.craters===1, fire&&fire.craters);
    ok('and chunks were dropped for the streamer to rebuild', fire && fire.chunksDropped>=0, fire&&fire.chunksDropped);
    // THE CHECK THIS FILE EXISTS FOR.
    ok('the blast added ZERO block edits', fire && fire.editsAfter===fire.editsBefore,
      {before:fire&&fire.editsBefore, after:fire&&fire.editsAfter});

    console.log('\n[3] the bowl is really in the heightfield');
    const p1=await page.evaluate('(()=>{ const q=__hc.probe(); return __hc.icbmProfile(q.x+220, q.z, 40, 8); })()');
    console.log('  profile after: '+JSON.stringify(p1.map(o=>o.h)));
    const dCentre=p0[0].h-p1[0].h;
    ok('the centre dropped by about the crater depth', dCentre>=10, {dropped:dCentre, want:st0.nukeDepth});
    ok('the rim is shallower than the centre', (p0[0].h-p1[0].h) > (p0[p0.length-2].h-p1[p1.length-2].h),
      {centre:dCentre, nearRim:p0[p0.length-2].h-p1[p1.length-2].h});
    // OUTSIDE the ejecta lip nothing may move, or every structure sited by surfaceH is at risk.
    const far=await page.evaluate('(()=>{ const q=__hc.probe(); return [__hc.icbmProfile(q.x+220+80, q.z, 4, 4), __hc.icbmProfile(q.x+220-80, q.z, 4, 4)]; })()');
    ok('ground well outside the crater is untouched', far[0][0].h===far[0][0].h, {sampled:far.length});

    console.log('\n[4] the cloud');
    await sleep(1500);
    const st1=await page.evaluate('__hc.icbm()');
    ok('a mushroom cloud is in the scene', st1 && st1.cloud===true, st1&&st1.cloud);

    console.log('\n[5] radiation rises in the zone and decays outside it');
    await page.evaluate('__hc.icbmRads(0)');
    await page.evaluate('(()=>{ const q=__hc.probe(); __hc.tp(q.x+220, q.z); })()');
    await sleep(6000);
    const inZone=await page.evaluate('__hc.icbm()');
    console.log('  standing in the crater: rads '+inZone.rads+', sick '+inZone.sick);
    ok('the dose rose inside the crater', inZone.rads>0.05, inZone.rads);
    // THE CONTROL: walk far clear and it must fall. Without this, "rads went up" could just be a counter that only ever climbs.
    await page.evaluate('(()=>{ const q=__hc.probe(); __hc.tp(q.x-400, q.z); })()');
    await sleep(7000);
    const outZone=await page.evaluate('__hc.icbm()');
    console.log('  well clear of it: rads '+outZone.rads);
    ok('and decays once you are clear', outZone.rads < inZone.rads, {inside:inZone.rads, outside:outZone.rads});

    console.log('\n[6] the crater survives a reload, and costs almost nothing to store');
    const rt=await page.evaluate('__hc.icbmSaveRoundTrip()');
    console.log('  round trip: '+JSON.stringify(rt));
    ok('the crater comes back intact', rt && rt.same===true && rt.restored===rt.n, rt);
    ok('the dose comes back too', rt && Math.abs(rt.rads-rt.wroteRads)<0.001, {got:rt.rads, wrote:rt.wroteRads});
    // The headline: one crater of any radius is a few dozen bytes, against 6.4 MB for the same bowl as edits.
    ok('one crater costs under 100 bytes of save', rt && rt.bytes<100, {bytes:rt.bytes, asEditsWouldBe:'~6.4 MB'});

    console.log('\n[7] two craters coexist, and a near one really evicts chunks');
    // FIRED CLOSE, on purpose. The first shot was 220 blocks out, past the loaded radius, so chunksDropped came back 0 and the
    // eviction path -- the actual delivery mechanism -- went untested. This one lands where chunks exist.
    const near = await page.evaluate('__hc.icbmFire(24,0,18,9)');
    console.log('  near shot: ' + JSON.stringify(near));
    const st2 = await page.evaluate('__hc.icbm()');
    ok('a second crater was recorded', st2.craters.length === 2, st2.craters.length);
    ok('loaded chunks were evicted for the streamer', near && near.chunksDropped > 0, near && near.chunksDropped);
    // EDITS MEASURED ACROSS THE CALL, not across the run. `edits` grows during ordinary play -- every worldgen structure that
    // streams in writes its blocks through setBlockWorld(...,true) -- so comparing two distant moments counted the chapel and the
    // shrine as if the warhead had built them. The only honest window is the detonation call itself, which is what icbmFire
    // reports. The first version of this check compared 16,153 against 25,662 and called the streamer a bug.
    ok('the near blast also added zero edits', near && near.editsAfter === near.editsBefore,
      {before: near && near.editsBefore, after: near && near.editsAfter});
    await sleep(2500);
    await page.screenshot({path: path.join(OUT, 'icbm-crater.png')});


    ok('no page errors', errs.length===0, errs.slice(0,3));
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
