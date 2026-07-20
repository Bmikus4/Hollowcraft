// PROP-PLACEMENT VERIFIER — isolated positioning tests for the three placed props, measured off the ACTUAL models:
//   1. cabin gun rack: rifle underside vs cradle tops (ray up through each cradle column) + clear of the wall face
//   2. cuffs on Herobrine: click-to-cuff flow, then cuff-ring centres vs wrist ends (must coincide)
//   3. dungeon handcuffs: model's lowest edge vs the main-room floor plane (must kiss, not float/sink)
//   node bench/verify-props.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('no server')); else setTimeout(poll,250); }); })(); }); }

const checks=[];
function check(name, ok, detail){ checks.push({name, ok:!!ok, detail}); console.log(`${ok?'PASS':'FAIL'}  ${name}  ${JSON.stringify(detail)}`); }

(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try {
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const ctx = await browser.newContext({ viewport:{width:1280,height:720} });
    const page = await ctx.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=252', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true && __hc.probe().chunkHere===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(3000);
    const shot = n => page.screenshot({ path: path.join(ROOT,'bench','results',`verify-props-${n}.png`) });

    // ---------- 1. GUN RACK ----------
    await page.waitForFunction(`(() => { try { return !__hc.propsRifle().err; } catch(e){ return false; } })()`, { timeout:60000 });
    const rifle = await page.evaluate(`__hc.propsRifle()`);
    console.log('rifle:', JSON.stringify(rifle));
    check('rifle: clear of wall face', rifle.wallClear >= -0.005, {wallClear:rifle.wallClear});
    check('rifle: fore cradle contact', rifle.contacts[0].gap!=null && Math.abs(rifle.contacts[0].gap) <= 0.02, rifle.contacts[0]);
    check('rifle: butt cradle contact', rifle.contacts[1].gap!=null && Math.abs(rifle.contacts[1].gap) <= 0.02, rifle.contacts[1]);
    // screenshot: stand in the cabin facing the rack
    await page.evaluate(`(() => { const p=__hc.propsRifle(); __hc.tpExact(p.pos[0]+2.3, p.pos[2], p.gy+1.05); __hc.aimAt(p.pos[0], p.pos[1], p.pos[2]); __hc.qa(50); })()`);
    await sleep(600); await shot('rifle-rack');

    // ---------- 2. CUFFS ON HEROBRINE ----------
    await page.evaluate(`(() => { const p=__hc.probe(); __hc.qa(false); const r=__hc.propsRifle(); __hc.tp(r.pos[0]+30, r.pos[2]+10); })()`);   // open ground away from the cabin
    await sleep(400);
    const brSpawn = await page.evaluate(`__hc.qaCuffBrine()`);
    console.log('brine spawn:', JSON.stringify(brSpawn));
    check('brine: spawned surrendered holding-cuffs setup', !brSpawn.err && brSpawn.held==='handcuffs', brSpawn);
    await page.evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);        // let surrender pose + camera apply
    const preState = await page.evaluate(`__hc.hbPos()`);
    check('brine: does NOT follow before the click', preState.state==='surrender' && !preState.cuffed, preState);
    const click = await page.evaluate(`__hc.cuffClick()`);
    console.log('cuff click:', JSON.stringify(click));
    check('brine: click cuffs → follow', click.consumed===true && click.state==='follow' && click.cuffed===true, click);
    check('brine: handcuffs consumed from hand', click.held===null, {held:click.held});
    await page.evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
    const wrists = await page.evaluate(`__hc.propsBrine()`);
    console.log('wrists:', JSON.stringify(wrists));
    check('brine: cuff model visible on wrists', wrists.cuffVisible===true, {cuffVisible:wrists.cuffVisible});
    check('brine: L ring centred on L wrist', wrists.misL!=null && wrists.misL <= 0.08, {misL:wrists.misL, wristL:wrists.wristL, ringL:wrists.ringL});
    check('brine: R ring centred on R wrist', wrists.misR!=null && wrists.misR <= 0.08, {misR:wrists.misR, wristR:wrists.wristR, ringR:wrists.ringR});
    await page.evaluate(`(() => { const h=__hc.hbPos(); __hc.aimAt(h.x, h.y+1.2, h.z); __hc.qa(60); })()`);
    await sleep(500); await shot('brine-cuffed');

    // ---------- 3. DUNGEON CUFFS ON THE FLOOR ----------
    const lair = await page.evaluate(`__hc.lairInfo()`);
    console.log('lair:', JSON.stringify(lair));
    await page.evaluate(`__hc.qa(false); __hc.tp(${lair.x}, ${lair.z})`);
    await page.waitForFunction(`(() => { try { const L=__hc.lairInfo(); return L && L.built && L.cuffs; } catch(e){ return false; } })()`, { timeout:120000 });
    await sleep(1500);   // let the bulk carve/remesh settle
    const floor = await page.evaluate(`__hc.propsCuffsFloor()`);
    console.log('dungeon cuffs:', JSON.stringify(floor));
    check('cuffs: in the main room', floor.inRoom===true, {pos:floor.pos});
    check('cuffs: floor block beneath is solid', floor.floorSolid===true, {floorSolid:floor.floorSolid});
    check('cuffs: model edge kisses the floor', floor.gap!=null && Math.abs(floor.gap) <= 0.02, {gap:floor.gap, minY:floor.minY, floorTop:floor.floorTop});
    const tpIn = await page.evaluate(`(() => { const f=__hc.propsCuffsFloor(); const t=__hc.tpExact(f.pos[0]+2.1, f.pos[2]-2.1, f.floorTop+0.02); __hc.aimAt(f.pos[0], f.pos[1], f.pos[2]); __hc.qa(40); return t; })()`);
    await sleep(600);
    const tpAfter = await page.evaluate(`(() => { const f=__hc.propsCuffsFloor(); __hc.aimAt(f.pos[0], f.pos[1], f.pos[2]); const p=__hc.probe(); return {feet:p.feet, gyHere:p.gyHere, py:__hc.st().py}; })()`);
    console.log('dungeon cam: tp=', JSON.stringify(tpIn), 'after=', JSON.stringify(tpAfter));
    await shot('dungeon-cuffs');

    const fails = checks.filter(c=>!c.ok);
    console.log(JSON.stringify({ pass:checks.length-fails.length, fail:fails.length, pageErrors:errors.slice(0,5) }));
    await browser.close();
    if (fails.length || errors.length) process.exit(1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
