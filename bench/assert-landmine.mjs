// ASSERT the landmine, both trigger cases Ben named:
//   1. a player WALKS OVER one -> it detonates
//   2. a player walks over a BLOCK IT IS PLACED UNDERNEATH -> it detonates
// and that the blast destroys the ground around it, hurts the player, and cannot be shielded.
//
// The trigger is driven through the REAL feet position (mineStand puts the player in the cell and the per-frame
// checkLandmines sees them), never by calling detonateMine directly -- a check that calls the detonation is testing the
// explosion, not the trip wire, and the trip wire is the half that can silently not fire.
//
// PROVEN-FAILING CONTROL: case 3 stands the player two blocks to the SIDE of a mine and asserts it does NOT go off. If the
// trigger were "any mine near the player" instead of the three feet cells, cases 1 and 2 would pass and this would fail.
//
// usage: node bench/assert-landmine.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(50)+' got='+JSON.stringify(got)); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:', String(e.message||e).slice(0,300)); });
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.setTime(0.42)');

    console.log('\n[0] the item and the block exist and are craftable');
    const defs = await page.evaluate(`(()=>{ const r=(typeof RECIPES!=='undefined')?RECIPES:null;
      return { item:!!(window.ITEMS&&ITEMS.landmine)||undefined, hasBlockId:__hc.blockAt!=null }; })()`).catch(()=>({}));
    const craft = await page.evaluate(`(()=>{ try{ return __hc.recipeFor? __hc.recipeFor('landmine') : 'no hook'; }catch(e){ return String(e.message||e); } })()`);
    console.log('  '+JSON.stringify(defs)+'  recipe: '+JSON.stringify(craft));
    // WHY IS IT NOT DRAWN? The chunk mesher dispatches on B[id].model and swallows a throwing builder, so a broken model
    // renders as bare ground with no error anywhere. This reports the dispatch inputs and calls the builder for real.
    const md = await page.evaluate('__hc.modelDiag("landmine")');
    console.log('  modelDiag: '+JSON.stringify(md));
    ok('the block is dispatched as a model', md && md.blockCat==='model', md&&md.blockCat);
    ok('its painted tile is in the atlas', md && md.tileIndex!=null, md&&md.tileIndex);
    ok('the model builder exists and does not throw', md && md.hasItemBuilder===true && !md.builderThrows, md&&(md.builderThrows||md.hasItemBuilder));
    ok('the builder produces meshes', md && md.builderMeshes>0, md&&md.builderMeshes);

    // ---- CASE 1: walk over it -------------------------------------------------------------------------------------
    console.log('\n[1] a player WALKS OVER a mine');
    await page.evaluate('__hc.eqPut(4,null)');
    let m = await page.evaluate('__hc.mineAt(0,0,-4)');   // 4 blocks ahead, at the player's own feet level
    console.log('  placed: '+JSON.stringify(m));
    ok('a landmine block was placed', m && m.isMine===true, m&&m.isMine);
    let before = await page.evaluate('__hc.mineState('+m.x+','+m.y+','+m.z+')');
    // A FRAME OF THE MINE ITSELF, from two blocks back and looking down at it: Ben asked for circular and textured, and
    // that is a thing a person judges, not a block id. Stand short of it so the trigger does not fire first.
    await page.evaluate('__hc.mineStand('+m.x+','+m.y+','+(m.z+3)+')'); await sleep(500);
    await page.evaluate('__hcBR.look(0,-0.62)'); await sleep(700);
    await page.screenshot({ path: path.join(OUT,'landmine-placed.png') });
    // The first frame of a freshly placed mine came out as bare ground, and a frame taken after poking a block into the
    // same chunk showed the disc. That is either a staging bug (the edit never reaching the stage that builds model
    // blocks, the family of index.html:3217) or simply latency: the remesh is time-sliced and a teleport in between
    // starves the queue with streaming work. Distinguished by waiting with NO poke at all.
    await sleep(3000);
    await page.screenshot({ path: path.join(OUT,'landmine-placed-t3.png') });
    await page.evaluate('__hc.mineStand('+m.x+','+m.y+','+m.z+')');
    await sleep(1200);
    let after = await page.evaluate('__hc.mineState('+m.x+','+m.y+','+m.z+')');
    console.log('  before: '+JSON.stringify(before)+'\n  after:  '+JSON.stringify(after));
    ok('the mine is consumed', after && after.isMine===false, after&&after.isMine);
    ok('the ground around it is destroyed', after && (before.solidAround-after.solidAround)>=20, {solidBefore:before.solidAround, solidAfter:after.solidAround, removed:before.solidAround-after.solidAround});
    ok('the earth beneath it is gone', after && after.groundBelow===0, after&&after.groundBelow);
    ok('the player was hurt', after && after.health < 20, after&&after.health);
    await page.screenshot({ path: path.join(OUT,'landmine-crater.png') });

    // ---- CASE 2: buried one block under what you walk on ----------------------------------------------------------
    console.log('\n[2] a player walks over a BLOCK the mine is placed UNDERNEATH');
    // BURY IT IN REAL GROUND. The first version of this case placed the mine at the player's own feet height after they had
    // been teleported above a crater, so it hung in mid-air: it detonated correctly and removed 11 solid cells, because
    // there was almost no earth inside the blast to remove. The column's actual surface has to be found first -- and by
    // scanning the blocks, not by asking surfaceH, which is the noise height and not where the blocks ended up.
    // Placed from a distance rather than by standing there, or the player trips it while setting it.
    const site = await page.evaluate(`(()=>{ const p=__hc.probe(); const tx=Math.floor(p.x)+8, tz=Math.floor(p.z)-8;
      let gy=null; for(let y=90;y>2;y--){ const b=__hc.blockAt(tx,y,tz); if(b && b!==${'/*WATER*/'}0){ gy=y; break; } }
      return {tx,tz,gy,py:Math.floor(p.y)}; })()`);
    console.log('  target column: '+JSON.stringify(site));
    const m2 = await page.evaluate(`(()=>{ const dy=${site.gy}+1-${site.py};
      const mine=__hc.setBlock(8,dy,-8,'landmine'); const cover=__hc.setBlock(8,dy+1,-8,'stone');
      return {x:mine.wx,y:mine.wy,z:mine.wz, mine:mine.id, cover:cover.id}; })()`);
    console.log('  buried: '+JSON.stringify(m2));
    ok('the mine is under a solid block', m2 && m2.cover>0, m2&&m2.cover);
    let before2 = await page.evaluate('__hc.mineState('+m2.x+','+m2.y+','+m2.z+')');
    await page.evaluate('__hc.mineStand('+m2.x+','+(m2.y+2)+','+m2.z+')');
    await sleep(1200);
    let after2 = await page.evaluate('__hc.mineState('+m2.x+','+m2.y+','+m2.z+')');
    console.log('  before: '+JSON.stringify(before2)+'\n  after:  '+JSON.stringify(after2));
    ok('the buried mine detonated', after2 && after2.isMine===false, after2&&after2.isMine);
    ok('it destroyed the ground too', after2 && (before2.solidAround-after2.solidAround)>=20, {solidBefore:before2.solidAround, solidAfter:after2.solidAround, removed:before2.solidAround-after2.solidAround});

    // ---- CASE 3: the proven-failing control ----------------------------------------------------------------------
    // ---- A BLOWN-UP CHEST SPILLS ----------------------------------------------------------------------------------
    // Ben: chests that are blown up should drop all items inside. Mining one already spilled; a blast deleted the block and the
    // chest record together, so the contents were simply gone. Stock a real chest, blow it up, count the drops.
    console.log('\n[2b] a chest inside the blast drops its contents');
    {
      await page.evaluate('__hc.mineStand('+m2.x+','+(m2.y+8)+','+m2.z+')'); await sleep(1200);
      const site = await page.evaluate(`(()=>{ const p=__hc.probe(); const x=Math.floor(p.x)+3, z=Math.floor(p.z);
        let gy=null; for(let y=90;y>2;y--){ if(__hc.blockAt(x,y,z)){ gy=y; break; } }
        return {x,z,gy,py:Math.floor(p.y)}; })()`);
      // Place and stock a chest through the real chest UI path, then close it.
      const ch = await page.evaluate('__hc.chest('+site.x+','+site.z+')');
      await sleep(700);
      const stocked = await page.evaluate(`(()=>{ const out=[];
        out.push(__hc.qSet('chest',0,'diamond',9)); out.push(__hc.qSet('chest',1,'iron_ingot',7)); out.push(__hc.qSet('chest',2,'torch',5));
        return out; })()`);
      await page.evaluate('__hc.chestClose()'); await sleep(600);
      console.log('  chest at '+JSON.stringify(ch)+'  stocked '+JSON.stringify(stocked));
      const dropsBefore = (await page.evaluate('__hc.qState()')).drops;
      // STAND BESIDE THE CHEST FIRST. mineAt places relative to the PLAYER, and the player was still parked eight blocks above
      // an old crater, so the mine went down next to nothing and the chest survived untouched -- the check failed on its own
      // geometry, not on the code. Two blocks away, mine one block from the chest, then step on it: the 3.4 radius covers it.
      await page.evaluate('__hc.mineStand('+(ch.bx+2)+','+ch.by+','+ch.bz+')'); await sleep(900);
      const mn = await page.evaluate('__hc.mineAt(-1,0,0)');
      await sleep(600);
      console.log('  mine at '+JSON.stringify(mn)+'  chest at ['+ch.bx+','+ch.by+','+ch.bz+']');
      await page.evaluate('__hc.mineStand('+mn.x+','+mn.y+','+mn.z+')');
      await sleep(1600);
      const st = await page.evaluate('__hc.qState()');
      const chestGone = await page.evaluate('__hc.blockAt('+ch.bx+','+ch.by+','+ch.bz+')');
      console.log('  drops '+dropsBefore+' -> '+st.drops+'   chest block now '+chestGone);
      ok('the chest was destroyed by the blast', chestGone===0, chestGone);
      ok('its contents dropped as items', st.drops >= dropsBefore+3, {before:dropsBefore, after:st.drops});
      await page.screenshot({ path: path.join(OUT,'landmine-chestspill.png') });
    }

    console.log('\n[3] CONTROL — standing two blocks to the SIDE must NOT set one off');
    let m3 = await page.evaluate('__hc.mineAt(-8,0,8)');
    await page.evaluate('__hc.mineStand('+(m3.x+2)+','+m3.y+','+(m3.z+2)+')');
    await sleep(1200);
    let after3 = await page.evaluate('__hc.mineState('+m3.x+','+m3.y+','+m3.z+')');
    console.log('  '+JSON.stringify(after3));
    ok('a mine you are not standing on stays armed', after3 && after3.isMine===true, after3&&after3.isMine);
    ok('and it did not hurt you', after3 && after3.health>=20, after3&&after3.health);

    // ---- the shield must not save you --------------------------------------------------------------------------
    console.log('\n[4] a shield cannot deflect it (damage kind blast)');
    await page.evaluate('(()=>{ __hc.eqPut(4,"shield"); return __hc.hurt(20,"blast"); })()');
    const shielded = await page.evaluate('__hc.shield()');
    console.log('  with a shield in the offhand, a 20 blast left health '+shielded.health);
    ok('the shield did not reduce the blast', shielded && shielded.health<=0.01, shielded&&shielded.health);

    ok('no page errors', errs.length===0, errs.length);
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
