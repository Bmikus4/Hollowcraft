// #55 — MONKS SPAWN IN GROUPS AND HOLD THEIR GROUND.
//
// What was wrong is worth stating, because every check here is the shape of one of the four faults: MONK_CAP was 3
// GLOBAL, so the cathedral, the chapel and the ruin drew from the same three bodies and the monks appeared to follow the
// player between churches; they trickled in at one per 22 s, so a monastery walked up to was never full; the 7-block
// cloister in _monkGoal was a nudge rather than a leash, so a community bled onto the hillside; and monks share the
// `animals` array with a cap of 9, so a full cathedral would have starved the wildlife spawner.
//
//   1 each site knows its own quota, inside Ben's ranges (chapel 3-4, cathedral 4-6, ruin 1)
//   2 a site fills its quota AS A GROUP, and does it by itself with no hook, in one tick
//   3 the leash is the building's footprint and it holds over time
//   4 a shot rouses THAT community and only that one, and rousing lifts the leash
//   5 monks and wildlife no longer compete for one cap
//   6 the spawn window sits inside the cull radius, so nothing is built only to be deleted
// usage: node bench/assert-monk-groups.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let pass=0, fail=0;
const chk=(c,n,d)=>{ if(c){pass++;console.log('  PASS  '+n+(d?'   '+d:''));} else {fail++;console.log('  FAIL  '+n+(d?'   '+d:''));} };
const site=(M,id)=>M.sites.find(s=>s.id===id);

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    const page=await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', null, {timeout:180000});
    await sleep(2500);

    console.log('\n--- 2  a site fills its own quota, by itself, in one tick ---');
    // Stand off the chapel inside the window and let the builder and the spawner run. This is the path Ben actually
    // takes to meet them: no hook places a monk in this section.
    const cs = await page.evaluate('__hc.church()');
    await page.evaluate("__hc.monkClear()");
    await page.evaluate('__hc.tp('+cs.x+','+(cs.z+40)+')');
    let M=null, built=false, ticks=0;
    for(let i=0;i<14;i++){ await sleep(3000); ticks++;
      const c=await page.evaluate('__hc.church()'); built=built||!!c.done;
      M=await page.evaluate('__hc.monks()');
      const s=site(M,'chapel'); if(s && s.known && s.alive>=s.quota) break; }
    const ch=site(M,'chapel');
    console.log('  chapel ' + JSON.stringify(ch) + '  after ' + ticks*3 + 's, built=' + built);
    chk(built, 'the chapel finished building', built);
    chk(ch && ch.known, 'the chapel registered as a site', JSON.stringify(ch));
    chk(ch && ch.alive>=ch.quota, 'and filled its quota with no hook involved', (ch?ch.alive+' of '+ch.quota:'-')+' in '+(ticks*3)+'s');

    console.log('\n--- 1  the quotas are Ben\'s numbers ---');
    chk(ch && ch.lo===3 && ch.hi===4, 'chapel is 3-4', ch?ch.lo+'-'+ch.hi:'-');
    const ca0=site(M,'cathedral'); chk(ca0 && ca0.lo===4 && ca0.hi===6, 'cathedral/monastery is 4-6 (his revision of 8-12)', ca0?ca0.lo+'-'+ca0.hi:'-');
    const ru0=site(M,'ruin'); chk(ru0 && ru0.lo===1 && ru0.hi===1, 'the ruin is one hermit', ru0?ru0.lo+'-'+ru0.hi:'-');
    chk(ch && ch.quota>=ch.lo && ch.quota<=ch.hi, 'the rolled quota is inside its range', ch?('quota '+ch.quota):'-');

    console.log('\n--- 3  the leash is the building, and it holds ---');
    await sleep(9000);   // three ticks of wandering
    M = await page.evaluate('__hc.monks()');
    const chL=site(M,'chapel');
    console.log('  chapel after wandering ' + JSON.stringify(chL));
    chk(chL.stray <= chL.r+1.5, 'no brother has strayed past his own church',
      'furthest '+chL.stray+' against a leash of '+chL.r);
    chk(chL.alive>=chL.quota, 'and the community is still at quota', chL.alive+' of '+chL.quota);
    // Every live monk carries the site's radius, not the old flat 7 — a monk with the wrong leash is invisible until he
    // has walked out of the building.
    const leashes = await page.evaluate("(()=>{ const l=__hc.monks().live.map(m=>m.leashR); return {min:Math.min(...l), max:Math.max(...l), n:l.length}; })()");
    chk(leashes.n>0 && leashes.min===chL.r && leashes.max===chL.r, 'and every one of them carries it', JSON.stringify(leashes));
    // …and it binds where it is enforced: no wander target is ever generated outside it while the site is calm. The old
    // code drew targets from a ring that could sit outside the cloister and then walked the monk back, which is why a
    // community bled onto the hillside between corrections.
    const goalsCalm = await page.evaluate("__hc.monkGoals('chapel',300)");
    console.log('  calm goals ' + JSON.stringify(goalsCalm));
    chk(goalsCalm.beyondLeash===0, 'and no wander target is ever generated outside it',
      goalsCalm.beyondLeash+' of '+goalsCalm.n+' beyond, furthest '+goalsCalm.maxGoal+' against a leash of '+goalsCalm.leashR);

    console.log('\n--- 4  a shot rouses that community, and only that one ---');
    // The cathedral is filled LATER, standing next to it. spawnMonkNear reads groundYAt, which needs real chunk data, so
    // a fill attempted from 460 blocks away places nobody — and the two sites are far enough apart that no camera
    // position can hold both. That is why the cross-site check is on the ROUSED FLAG, which is site state and outlives
    // the bodies, rather than on two live congregations.
    const shot = await page.evaluate("__hc.monkShoot('chapel')");
    console.log('  shot ' + JSON.stringify(shot));
    M = await page.evaluate('__hc.monks()');
    chk(shot.before && shot.before.roused===false && shot.after.roused===true, 'one shot rouses the site', JSON.stringify(shot));
    chk(shot.after.fleeing>1, 'and the whole community reacts, not just the man who was hit', shot.after.fleeing+' monks moving');
    chk(site(M,'cathedral').roused===false, 'the monastery across the island did NOT hear it', 'roused '+site(M,'cathedral').roused);
    // Rousing lifts confinement, asked of the leash itself rather than of where a monk has got to. Wandering is half
    // "stand still" and the roused radius is random, so twelve seconds of walking reports the dice: the same build gave
    // 39.7 blocks of stray on one run and 7.1 on the next. goalsAfter asks _monkGoal three hundred times.
    const goalsAfter = await page.evaluate("__hc.monkGoals('chapel',300)");
    console.log('  roused goals ' + JSON.stringify(goalsAfter));
    chk(goalsAfter.roused===true && goalsAfter.beyondLeash>0, 'the roused community is free of its ground',
      goalsAfter.beyondLeash+' of '+goalsAfter.n+' goals reach past the leash, furthest '+goalsAfter.maxGoal);

    console.log('\n--- 5  monks and wildlife do not share a cap ---');
    // Driven, not waited for: the cap is 9 on the array both populations live in, so this is a question about the cap.
    // Before this item, N monks alive meant the wildlife could only ever reach 9-N — walk toward a church and the island
    // empties of deer.
    const wf = await page.evaluate('__hc.wildFill(24)');
    console.log('  wildFill ' + JSON.stringify(wf));
    chk(wf.monks>=3, 'there is a congregation alive for this to mean anything', wf.monks+' monks');
    chk(wf.wild>=9, 'and the wildlife can still reach its own cap of 9 alongside them',
      wf.wildBefore+' -> '+wf.wild+' wild, with '+wf.monks+' monks and '+wf.total+' in the array');

    console.log('\n--- 6  the spawn window sits inside the cull radius ---');
    // The cull is 82 blocks. Standing at 78 — outside the 16..74 window but inside the cull — nothing new may appear;
    // that band used to spawn monks out to 95 that were deleted before the next frame.
    await page.evaluate("__hc.monkClear()");
    await page.evaluate('__hc.monkWrathSet(0)');
    await page.evaluate('__hc.tp('+cs.x+','+(cs.z+78)+')');
    await sleep(9000);
    const far = await page.evaluate('__hc.monks()');
    const farCh = far.live.filter(m=>m.site==='chapel').length;
    console.log('  at 78 blocks: ' + JSON.stringify(far.sites.map(s=>({id:s.id,alive:s.alive,dist:s.dist}))));
    chk(farCh===0, 'no chapel monk is built at 78 blocks, where the cull would eat him',
      farCh+' chapel monks at '+(site(far,'chapel')||{}).dist+' blocks (other sites may legitimately be in range)');
    await page.evaluate('__hc.tp('+cs.x+','+(cs.z+40)+')');
    await sleep(9000);
    const near = await page.evaluate('__hc.monks()');
    chk(near.live.filter(m=>m.site==='chapel').length>0, 'and they are built again at 40',
      near.live.length+' monks at '+(site(near,'chapel')||{}).dist+' blocks');

    console.log('\n--- 4b  the monastery, standing next to it: its own quota, and it never heard the shot ---');
    await page.evaluate('__hc.setTime(0.32)');
    const ca = await page.evaluate('__hc.cathedralDiag()');
    if(!ca || !ca.spot) chk(false, 'the monastery has a site');
    else{
      await page.evaluate('__hc.tp('+ca.spot.x+','+(ca.spot.z+30)+')');
      await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()', null, {timeout:90000}).catch(()=>{});
      await sleep(4000);
      const caFill = await page.evaluate("__hc.monkFill('cathedral')");
      console.log('  cathedral filled ' + JSON.stringify(caFill));
      chk(!caFill.err && caFill.alive===caFill.quota, 'the monastery fills to its own quota, 4-6 of them',
        JSON.stringify(caFill));
      const Mc = await page.evaluate('__hc.monks()');
      chk(site(Mc,'cathedral').roused===false, 'and it is still unroused — the chapel\'s shot was the chapel\'s',
        'roused '+site(Mc,'cathedral').roused);
      await sleep(9000);
      const Mc2 = await page.evaluate('__hc.monks()');
      chk(site(Mc2,"cathedral").stray <= site(Mc2,"cathedral").r+3, 'so its brothers hold their own ground',
        'stray '+site(Mc2,'cathedral').stray+' against leash '+site(Mc2,'cathedral').r);
      // A frame of the congregation, since "does it look like a monastery" is not a number. Stand back and wait for the
      // meshes: the first version photographed torn, half-streamed chunks from inside a wall four seconds after landing.
      await page.evaluate('__hc.tp('+ca.spot.x+','+(ca.spot.z+34)+')');
      await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()', null, {timeout:90000}).catch(()=>{});
      await sleep(4000);
      await page.evaluate('__hc.monkPark()');
      await page.evaluate('__hc.look('+ca.spot.x+','+(ca.spot.y!=null?ca.spot.y+2:46)+','+ca.spot.z+')'); await sleep(1500);
      fs.writeFileSync(path.join(ROOT,'bench','results','monk-group.png'), await page.screenshot());
      chk(true, 'wrote monk-group.png for judging');
    }

    console.log('\n'+pass+'/'+(pass+fail)+' passed');
    await browser.close();
    process.exit(fail?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
