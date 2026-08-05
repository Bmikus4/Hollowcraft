// THE INDUSTRIAL / BUNKER BLOCK PACK. Ben's list plus my eight, and the bar a block has to clear before it counts as shipped:
// it exists, it is APPENDED after the block that used to end the list (saves store block numbers, so an insertion renumbers
// somebody's world), it has a recipe, it is in the creative menu, it draws something when placed, and it is still itself after a
// save and a reload. The two multi-cell blocks get their own checks because they are the parts that can half-work: the 2x2 vault
// door has to claim four cells, toggle all four, and give back exactly one door when any of them is broken, and the 1x3 bench has
// to lay three. The hanging light has to hang on the chime pendulum and emit real light.
//
// usage: node bench/assert-industrial-pack.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT = 'D:\\code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let checks=0, fails=0;
function ok(name, cond, detail){ checks++; if(!cond){ fails++; console.log('  FAIL  '+name+(detail!==undefined?('   '+JSON.stringify(detail)):'')); }
  else console.log('  ok    '+name+(detail!==undefined?('   '+JSON.stringify(detail)):'')); }

// Ben's seven, then my eight. vault_door_x is the item; the other five vault ids are internal.
const PACK = ['vault_door_x','concrete','warning_block','metal_bench','reinforced_wall','reinforced_glass','hanging_light',
              'steel_grate','riveted_plate','corrugated_sheet','wall_vent','industrial_pipe','sandbag','chainlink','fuse_box'];

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>errs.push(String(e.message||e).slice(0,220)));
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(7000);
    ok('the game loads with the pack in it', errs.length===0, errs.slice(0,3));
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});

    // ---- 1. EVERY BLOCK EXISTS, AND IS APPENDED. landmine used to be the last block and its comment says new blocks go on the
    // end; if any pack id is lower than landmine's, a save written before this build reloads with its stone as something else.
    const ids=await page.evaluate('(()=>{ const o={}; for(const n of '+JSON.stringify(PACK.concat(['landmine','vault_part','vault_door_z']))+') o[n]=__hc.bid(n); return o; })()');
    const missing=PACK.filter(n=>ids[n]==null);
    ok('every block in the pack is registered', missing.length===0, missing.length?missing:{count:PACK.length});
    const below=PACK.filter(n=>ids[n]!=null && ids[n]<=ids.landmine);
    ok('all of them are appended AFTER the block that used to end the list', below.length===0, {landmine:ids.landmine, offenders:below});

    // ---- 2. REACHABLE: a recipe and a creative-menu entry. An unreachable block is an unfinished block.
    // RECIPES and ITEMS are module-scoped and unreachable from here, so the game answers for itself.
    const info=await page.evaluate('(()=>{ try{ return __hc.packInfo('+JSON.stringify(PACK)+'); }catch(e){ return {err:String(e.message||e)}; } })()');
    if(info && !info.err){
      const noRecipe=PACK.filter(n=>!info[n] || !info[n].recipe);
      const noMenu  =PACK.filter(n=>!info[n] || !info[n].inCreative);
      const noName  =PACK.filter(n=>!info[n] || !info[n].name || /_/.test(info[n].name));
      ok('every block has a crafting recipe', noRecipe.length===0, noRecipe);
      ok('every block appears in the creative menu', noMenu.length===0, noMenu);
      ok('every block has a written name rather than an id', noName.length===0, noName);
      ok('the atlas has room for the pack\'s tiles', info._atlas && info._atlas.used<info._atlas.total, info._atlas);
    } else ok('the pack can be introspected (__hc.packInfo)', false, info);

    // ---- 3. PLACED AND DRAWN. A block that meshes to nothing is the failure this catches: put each one in front of the camera
    // in open air and require the frame to change. Open air at height, because at ground level the subject lands inside a hill.
    const spot=await page.evaluate('(()=>{ const p=__hc.probe(); return {x:Math.round(p.x), z:Math.round(p.z), y:118}; })()');
    // A FLOOR AT AN ABSOLUTE HEIGHT, AND A CHECK THAT IT HELD. Physics runs while unlocked now (gravity does not pause for a
    // menu - Ben 08-04) and __hc.freeze does not hold the PLAYER, so this cell has to be stood on, not hovered in.
    //   The previous attempt DID build a floor but built it with __hc.setBlock, which is relative to the player - and the player
    // had already been falling for 500 ms when it ran, so the floor was laid four or five blocks BELOW spot.y. Landing on it put
    // the eye that far under the test cell, and a cell 5 blocks up and 6.5 blocks out sits 40 degrees above a -0.05 rad sweep:
    // never on screen, reported as "the pack does not draw". Absolute /setblock, then land one block, then verify.
    for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++)
      await page.evaluate('__hc.cmdRun("/setblock '+(spot.x+dx)+' '+(spot.y-1)+' '+(spot.z+dz)+' stone")');
    await sleep(700);
    await page.evaluate('__hc.tpExact('+spot.x+','+spot.z+','+spot.y+')');
    await sleep(1200);
    const stood=await page.evaluate('__hc.probe()');
    // The sweep below is worthless if this is not true, so it fails HERE, where the reason is visible, instead of as a mystery
    // "not on screen" twenty lines later.
    ok('the player is standing at the test height', Math.abs(stood.y-spot.y)<1.6, {want:spot.y, got:+stood.y.toFixed(2)});
    await page.evaluate('__hc.setTime(0.35)'); await page.evaluate('__hc.pinScene()'); await sleep(1200);
    console.log('    where the player actually is:', JSON.stringify(await page.evaluate('__hc.probe()')));
    console.log('    the cell it is looking for:', JSON.stringify(await page.evaluate('__hc.screenOf('+spot.x+'+6.5,'+spot.y+'+0.5,'+spot.z+'+0.5)')));
    const aim=await page.evaluate(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
      let best=null;
      for(let i=0;i<32;i++){ const yaw=i/32*Math.PI*2; __hcBR.look(yaw,-0.05); await f(); await f();
        const s=__hc.screenOf(${spot.x}+6.5, ${spot.y}+0.5, ${spot.z}+0.5);
        if(s.onScreen){ const off=Math.hypot(s.px-s.w/2,s.py-s.h/2); if(!best||off<best.off) best={yaw:+yaw.toFixed(3),off:+off.toFixed(0)}; } }
      if(best){ __hcBR.look(best.yaw,-0.05); await f(); await f(); } return best; })()`);
    ok('the test cell is on screen', !!aim, aim);
    const shoot=async(tag)=>{ const f=path.join(OUT,'indpack-'+tag+'.png'); await page.screenshot({path:f}); return decodePNG(fs.readFileSync(f)); };
    const bare=await shoot('bare');
    const px=(im)=>{ let s=0; for(let i=0;i<im.data.length;i+=im.ch) s+=im.data[i]+im.data[i+1]+im.data[i+2]; return s; };
    const drawn=[];
    for(const n of PACK){
      await page.evaluate('__hc.cmdRun("/setblock '+(spot.x+6)+' '+spot.y+' '+spot.z+' '+n+'")');
      await sleep(700);
      const im=await shoot('blk-'+n);
      const d=Math.abs(px(im)-px(bare))/1e3;
      drawn.push({n, delta:+d.toFixed(0)});
      await page.evaluate('__hc.cmdRun("/setblock '+(spot.x+6)+' '+spot.y+' '+spot.z+' air")');
      if(n==='vault_door_x'||n==='metal_bench'){ for(let k=0;k<3;k++){ await page.evaluate('__hc.cmdRun("/setblock '+(spot.x+6+k)+' '+(spot.y)+' '+spot.z+' air")');
        await page.evaluate('__hc.cmdRun("/setblock '+(spot.x+6+k)+' '+(spot.y+1)+' '+spot.z+' air")'); } }
      await sleep(250);
    }
    const invisible=drawn.filter(d=>d.delta<1);
    ok('every block draws something when placed', invisible.length===0, invisible.length?invisible:drawn.slice(0,3));

    // ---- 4. THE VAULT DOOR, four cells. /setblock places the leaf alone, so this drives the real placement path through the hook.
    const vd=await page.evaluate('(()=>{ try{ return __hc.vaultPlace('+(spot.x+6)+','+spot.y+','+(spot.z+2)+'); }catch(e){ return {err:String(e.message||e)}; } })()');
    console.log('  vault door: '+JSON.stringify(vd));
    ok('placing the vault door claims four cells', vd && vd.cells===4, vd);
    const vt=await page.evaluate('(()=>{ try{ return __hc.vaultToggle('+(spot.x+6)+','+spot.y+','+(spot.z+2)+'); }catch(e){ return {err:String(e.message||e)}; } })()');
    ok('opening it turns all four cells passable', vt && vt.openCells===4 && vt.solidAfter===0, vt);
    const vb=await page.evaluate('(()=>{ try{ return __hc.vaultBreakAt('+(spot.x+6)+','+(spot.y+1)+','+(spot.z+2)+'); }catch(e){ return {err:String(e.message||e)}; } })()');
    ok('breaking any cell removes all four and returns exactly one door', vb && vb.cleared===4 && vb.dropped===1, vb);

    // ---- 5. THE HANGING LIGHT: real block light, and a pendulum that moves.
    const hl=await page.evaluate('(()=>{ try{ return __hc.lampPlace('+(spot.x+6)+','+(spot.y+3)+','+(spot.z+4)+'); }catch(e){ return {err:String(e.message||e)}; } })()');
    await sleep(2200);   // the chunk has to remesh before the pendulum can bind to the lamp's model clone
    const hs=await page.evaluate('(()=>{ try{ return __hc.lampShove('+(spot.x+6)+','+(spot.y+3)+','+(spot.z+4)+'); }catch(e){ return {err:String(e.message||e)}; } })()');
    console.log('  hanging light: '+JSON.stringify(hl)+' '+JSON.stringify(hs));
    ok('the hanging light emits block light', hl && hl.light>=10, hl);
    ok('it is registered on the chime pendulum', hl && hl.onChimeList===true, hl);
    ok('the pendulum binds to its model (it exposes a swing group)', hs && hs.bound===true, hs);
    ok('and it swings', hs && hs.moved>0.0005, hs);

    // ---- 6. SAVE ROUND-TRIP. Block ids are what a save stores, so a pack block has to come back as itself.
    const sv=await page.evaluate('(()=>{ try{ return __hc.packSaveRoundTrip('+(spot.x+8)+','+spot.y+','+(spot.z+6)+'); }catch(e){ return {err:String(e.message||e)}; } })()');
    console.log('  save round-trip: '+JSON.stringify(sv));
    ok('pack blocks survive a save and reload as themselves', sv && sv.mismatched===0, sv);

    // ---- 7. THE TABLEAU. Every check above can pass on a block that looks wrong, and the earlier per-block frames catch the
    // door edge-on because the camera faces along +x: a door spanning x is invisibly thin from there. This builds one frame with
    // the door across the view, the bench beside it and the lamp hung over both, which is the frame a person can judge.
    const bx=spot.x+7, bz=spot.z-3;
    await page.evaluate(`(()=>{ const S=(x,y,z,n)=>__hc.cmdRun('/setblock '+x+' '+y+' '+z+' '+n);
      for(let dx=-2;dx<=4;dx++) for(let dz=-2;dz<=3;dz++) S(${bx}+dx, ${spot.y}-1, ${bz}+dz, 'concrete');
      __hc.vaultPlace(${bx}, ${spot.y}, ${bz}, false);
      for(let k=0;k<3;k++) S(${bx}+2, ${spot.y}, ${bz}+k-1, 'metal_bench');
      S(${bx}, ${spot.y}+2, ${bz}+2, 'hanging_light');
      S(${bx}+3, ${spot.y}, ${bz}-1, 'warning_block'); S(${bx}+3, ${spot.y}+1, ${bz}-1, 'reinforced_glass');
      S(${bx}+3, ${spot.y}, ${bz}+1, 'sandbag'); S(${bx}+3, ${spot.y}, ${bz}+2, 'steel_grate');
      S(${bx}+4, ${spot.y}, ${bz}, 'fuse_box'); S(${bx}+4, ${spot.y}+1, ${bz}, 'wall_vent');
      S(${bx}-1, ${spot.y}, ${bz}+3, 'industrial_pipe'); S(${bx}-1, ${spot.y}, ${bz}-1, 'chainlink');
      S(${bx}-2, ${spot.y}, ${bz}, 'corrugated_sheet'); S(${bx}-2, ${spot.y}+1, ${bz}, 'riveted_plate'); })()`);
    await sleep(2500);
    await page.evaluate('__hc.tpExact('+(bx-6)+','+(bz+1)+','+(spot.y+2)+')'); await sleep(2200);
    await page.evaluate(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
      let best=null;
      for(let i=0;i<32;i++){ const yaw=i/32*Math.PI*2; __hcBR.look(yaw,-0.06); await f(); await f();
        const s=__hc.screenOf(${bx}+0.5, ${spot.y}+1.0, ${bz}+0.5);
        if(s.onScreen){ const off=Math.hypot(s.px-s.w/2,s.py-s.h/2); if(!best||off<best.off) best={yaw:best?best.yaw:yaw,off:+off.toFixed(0),y:yaw}; if(!best||off<=best.off) best={yaw,off:+off.toFixed(0)}; } }
      if(best) __hcBR.look(best.yaw,-0.06); await f(); await f(); return best; })()`);
    await sleep(1600);
    await page.screenshot({ path:path.join(OUT,'indpack-tableau.png') });
    const tab=decodePNG(fs.readFileSync(path.join(OUT,'indpack-tableau.png')));
    ok('the tableau frame is not empty sky', Math.abs(px(tab)-px(bare))/1e3>50, {delta:+(Math.abs(px(tab)-px(bare))/1e3).toFixed(0)});
    console.log('  the frame to look at: bench/results/indpack-tableau.png');

    ok('no page errors', errs.length===0, errs.slice(0,3));
    console.log('\n'+checks+' checks, '+fails+' failed');
    await browser.close();
    process.exit(fails?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
