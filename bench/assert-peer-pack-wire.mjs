// ASSERT: a backpack worn by a REAL second client is seen on that client's avatar, over the wire.
//
// The local half of this is already proven (assert-peer-pack.mjs, d65cb5e): with __hc.fakePeer the bag lands on the avatar's
// back and photographs as 4919 magenta pixels. What that CANNOT prove is the protocol -- fakePeer builds the avatar in the
// same page and sets a.pack.visible directly, so the 'p' packet's pk flag, the send side that fills it, and the receive side
// at index.html:6192 are all bypassed. This runs two browser contexts against mp-server: one wears a pack, the other looks.
//
// The failure this is built to catch is a flag that never leaves the sender: the receiving client would show an avatar with
// no bag, exactly as it did before any of this work, and every LOCAL check would still pass.
//
// usage: node bench/assert-peer-pack-wire.mjs
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
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(54)+' got='+JSON.stringify(got)); }

async function openGame(ctx, base, q, errs){
  const page=await ctx.newPage();
  page.on('pageerror', e=>errs.push(String(e.message||e).slice(0,200)));
  await page.goto(base+'/index.html?'+q, { waitUntil:'load', timeout:90000 });
  await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true && __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
  return page;
}

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    const errA=[], errB=[];
    const ctxA=await browser.newContext({ viewport:{width:1100,height:700} });
    const ctxB=await browser.newContext({ viewport:{width:1100,height:700} });

    console.log('\n[1] two clients on one relay');
    const A = await openGame(ctxA, base, 'join&debug=1&rd=6', errA);      // the WEARER
    await sleep(2500);
    const B = await openGame(ctxB, base, 'join&debug=1&rd=6', errB);      // the WATCHER
    await sleep(4000);
    const netA = await A.evaluate('(()=>{ try{ return __hc.netInfo? __hc.netInfo() : {on:null}; }catch(e){ return {err:String(e.message||e)}; } })()');
    const netB = await B.evaluate('(()=>{ try{ return __hc.netInfo? __hc.netInfo() : {on:null}; }catch(e){ return {err:String(e.message||e)}; } })()');
    console.log('  A: '+JSON.stringify(netA).slice(0,160));
    console.log('  B: '+JSON.stringify(netB).slice(0,160));
    // Each must see exactly one peer, or nothing after this means anything.
    const peersOf=async(p)=>{ const r=await p.evaluate('__hc.peerPacks()'); return (r&&r.count!=null)?r.count:-1; };
    let pa=-1, pb=-1;
    for(let i=0;i<40;i++){ pa=await peersOf(A); pb=await peersOf(B); if(pa>=1&&pb>=1) break; await sleep(500); }
    console.log('  avatars: A sees '+pa+', B sees '+pb);
    ok('each client has an avatar for the other', pa>=1 && pb>=1, {A:pa,B:pb});

    // CLOSE THE MENU ON BOTH. ?join leaves the multiplayer/settings overlay up, so the watcher's screenshot came out as a
    // picture of the settings panel: every boolean passed and the frame showed no world at all.
    for(const p of [A,B]){ try{ await p.keyboard.press('Escape'); }catch(e){}
      try{ await p.evaluate('(()=>{ try{ if(typeof __hc.eqUI==="function") __hc.eqUI("close"); }catch(e){} try{ __hc.aim(true); }catch(e){} })()'); }catch(e){} }
    await sleep(1200);

    console.log('\n[2] A stands still, B walks up behind A, A wears the pack');
    // Put them at a known spot. A faces away from B so B sees A's back, which is the only side a pack is on.
    const P = await A.evaluate('__hc.probe()');
    await A.evaluate('__hc.tpExact('+P.x+','+P.z+','+(P.y)+')');
    await A.evaluate('__hcBR.look(0,0)');
    await sleep(1200);
    // B stands 3.4 behind A and looks at A's back. lookDir is (-sin yaw, ., -cos yaw), so yaw 0 faces -Z: A at yaw 0 walks
    // AWAY from B, and B at yaw 0 looks straight at A. Both are 0. The first version had B at PI, which pointed it out to sea
    // and produced a screenshot of empty beach while every boolean passed.
    await B.evaluate('__hc.tpExact('+P.x+','+(P.z+3.4)+','+(P.y)+')');
    await B.evaluate('__hcBR.look(0,-0.06)');
    await sleep(2500);

    // The wearer equips a pack through the REAL equip slot, so the send path fills pk from armor[EQ_PACK].
    console.log('  A equips: '+JSON.stringify(await A.evaluate('__hc.eqPut(5,"backpack")')));
    await sleep(3000);

    // What does B's copy of A's avatar say? Read the RECEIVED flag, not anything local.
    const seen=async()=>{ const r=await B.evaluate('__hc.peerPacks()'); return (r&&r.peers&&r.peers[0])?r.peers[0]:r; };
    let s=await seen();
    for(let i=0;i<20 && !(s&&s.packVisible); i++){ await sleep(500); s=await seen(); }
    console.log('  B sees of A: '+JSON.stringify(s));
    // AIM AT WHERE THE AVATAR ACTUALLY IS, from B's own position, rather than assuming both teleports landed where intended.
    if(s && s.pos){
      const bp=await B.evaluate('__hc.probe()');
      const yaw=Math.atan2(-(s.pos[0]-bp.x), -(s.pos[2]-bp.z));
      const dist=Math.hypot(s.pos[0]-bp.x, s.pos[2]-bp.z);
      const pitch=Math.atan2((s.pos[1]+1.1)-(bp.y+1.6), Math.max(0.1,dist));
      console.log('  B at ('+bp.x+','+bp.z+') aiming at avatar '+JSON.stringify(s.pos)+'  dist '+dist.toFixed(2)+'  yaw '+yaw.toFixed(2));
      await B.evaluate('__hcBR.look('+yaw+','+pitch+')');
      await sleep(900);
      ok('the avatar is close enough to photograph', dist<10, +dist.toFixed(2));
    }
    ok('the pk flag arrived over the wire', s && s.peerPk===true, s&&s.peerPk);
    ok('B made the bag visible on A\'s avatar', s && s.packVisible===true, s&&s.packVisible);
    await B.screenshot({ path: path.join(OUT,'peerwire-worn.png') });

    console.log('\n[3] A takes it off again — the flag has to fall as well as rise');
    await A.evaluate('__hc.eqPut(5,null)');
    await sleep(3000);
    let s2=await seen();
    for(let i=0;i<20 && s2 && s2.packVisible; i++){ await sleep(500); s2=await seen(); }
    console.log('  B sees of A: '+JSON.stringify(s2));
    ok('the bag came off on B\'s copy too', s2 && s2.packVisible===false, s2&&s2.packVisible);
    await B.screenshot({ path: path.join(OUT,'peerwire-bare.png') });

    ok('no page errors on the wearer', errA.length===0, errA.slice(0,2));
    ok('no page errors on the watcher', errB.length===0, errB.slice(0,2));
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    console.log('shots: bench/results/peerwire-worn.png, peerwire-bare.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
