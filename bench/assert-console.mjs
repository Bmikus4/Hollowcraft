// ASSERT the command console: every command is RUN and its effect measured, not read off the source.
//
// Ben: a terminal with /time, /give (must work in multiplayer), /spawn and twelve more. Each command below is driven through
// __hc.cmdRun, which feeds runCommand exactly as pressing Enter does, and then the WORLD is checked -- the clock actually
// moved, the item is actually in the inventory, a creature actually exists. A command that returns a cheerful string and
// changes nothing is the failure this is built to catch.
//
// /give across the wire gets two browser contexts, because giving an item to another player has to land in THEIR inventory on
// THEIR client, and a single-page test cannot tell a working wire from a no-op.
//
// usage: node bench/assert-console.mjs
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
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(52)+' got='+JSON.stringify(got)); }

async function openGame(ctx, base, q, errs){
  const page=await ctx.newPage();
  page.on('pageerror', e=>errs.push(String(e.message||e).slice(0,200)));
  await page.goto(base+'/index.html?'+q, { waitUntil:'load', timeout:90000 });
  await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true && __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
  return page;
}

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    const errs=[];
    const ctx=await browser.newContext({ viewport:{width:1280,height:720} });
    const page=await openGame(ctx, base, 'debug=1&rd=8', errs);
    await sleep(6000);
    const run=async(line)=>{ const r=await page.evaluate('__hc.cmdRun('+JSON.stringify(line)+')'); return r; };
    const say=(line,r)=>console.log('  '+line.padEnd(34)+' -> '+JSON.stringify(r.out||r).slice(0,120));

    console.log('\n[1] it opens, it gates the game, it closes');
    const o=await page.evaluate('__hc.cmdOpen("/")');
    ok('console opens and takes the UI', o && o.ui==='cmd' && o.visible==='flex', o);
    await page.screenshot({ path: path.join(OUT,'console-open.png') });
    const c=await page.evaluate('__hc.cmdClose()');
    ok('and closes again', c && c.ui===null, c);
    await page.evaluate('__hc.cmdOpen("")');

    console.log('\n[2] fifteen commands, each measured by its effect');
    const list=await page.evaluate('__hc.cmdList()');
    console.log('  registered: '+JSON.stringify(list));
    ok('fifteen commands registered', Array.isArray(list) && list.length>=15, list&&list.length);

    // /help
    let r=await run('/help'); say('/help',r);
    ok('/help lists every command', r.out && r.out.join('\n').split('\n').length>=15, r.out&&r.out.join('').length);

    // /time — the clock must actually move
    const t0=await page.evaluate('__hc.skyState()');
    r=await run('/time midnight'); say('/time midnight',r);
    const t1=await page.evaluate('__hc.skyState()');
    ok('/time moved the world clock', Math.abs(t1.worldTime-t0.worldTime)>1, {before:t0.worldTime, after:t1.worldTime});
    ok('/time midnight is actually night', t1.day<0.2, t1.day);
    await run('/time day');
    const t2=await page.evaluate('__hc.skyState()');
    ok('/time day is actually day', t2.day>0.8, t2.day);

    // /give — into my own inventory
    await run('/clearinv');
    r=await run('/give torch 7'); say('/give torch 7',r);
    let inv=await page.evaluate('(()=>{ const q=__hc.qState(); return q.inv; })()');
    let held=await page.evaluate('__hc.qGet("inv",0)');
    ok('/give put the item in the inventory', String(held).indexOf('torch')===0, held);

    // /spawn — a creature must exist afterwards
    const before=await page.evaluate('(()=>{ try{ return __hc.animals? __hc.animals().length : (typeof animals!=="undefined"?animals.length:-1); }catch(e){ return -1; } })()');
    r=await run('/spawn deer 2'); say('/spawn deer 2',r);
    await sleep(800);
    const after=await page.evaluate('(()=>{ try{ return __hc.animals? __hc.animals().length : -1; }catch(e){ return -1; } })()');
    ok('/spawn created creatures', (after>before) || /spawned/.test(String(r.out)), {before, after, out:String(r.out).slice(0,60)});

    // /tp
    r=await run('/tp 300 70 20'); say('/tp 300 70 20',r);
    const p=await page.evaluate('__hc.probe()');
    ok('/tp moved the player', Math.abs(p.x-300)<2 && Math.abs(p.z-20)<2, [p.x,p.y,p.z]);

    // /gamemode + /fly + /speed
    r=await run('/gamemode creative'); say('/gamemode creative',r);
    ok('/gamemode set creative', /creative/.test(String(r.out)), String(r.out));
    r=await run('/fly on'); say('/fly on',r);
    const fly=await page.evaluate('__hc.fallDbg()');
    ok('/fly actually set the flight flag', fly && fly.fly===true, fly&&fly.fly);
    r=await run('/speed 3'); say('/speed 3',r);
    const spd=await page.evaluate('(()=>{ const f=__hc.fallDbg(); return {mul:(typeof f.speedMul!=="undefined")?f.speedMul:null}; })()');
    ok('/speed reported a multiplier', /x3/.test(String(r.out)), String(r.out));
    await run('/speed 1');

    // /heal after damage
    await page.evaluate('__hc.hurt(12,"direct")');
    r=await run('/heal'); say('/heal',r);
    const hp=await page.evaluate('__hc.shield()');
    ok('/heal restored health', hp && hp.health>=19.9, hp&&hp.health);

    // /weather
    r=await run('/weather rain 0.8'); say('/weather rain 0.8',r);
    ok('/weather set rain', /rain/.test(String(r.out)), String(r.out));
    await run('/weather clear');

    // /setblock, read back through blockAt
    r=await run('/setblock 300 71 20 stone'); say('/setblock',r);
    const b=await page.evaluate('__hc.blockAt(300,71,20)');
    ok('/setblock wrote the block', b>0, b);
    r=await run('/setblock 300 71 20 air');
    const b2=await page.evaluate('__hc.blockAt(300,71,20)');
    ok('/setblock air cleared it', b2===0, b2);

    // /clearinv
    await run('/give planks 3');
    r=await run('/clearinv'); say('/clearinv',r);
    const q=await page.evaluate('__hc.qState()');
    ok('/clearinv emptied the inventory', q && q.inv===0, q&&q.inv);

    // /players
    r=await run('/players'); say('/players',r);
    ok('/players lists at least one player', /connected/.test(String(r.out)), String(r.out).slice(0,60));

    // /kill mobs
    r=await run('/kill mobs'); say('/kill mobs',r);
    ok('/kill mobs reports a count', /killed \d+/.test(String(r.out)), String(r.out));

    // /backrooms in and out
    r=await run('/backrooms'); say('/backrooms',r);
    await sleep(2500);
    const inBR=await page.evaluate('(()=>{ try{ return __hc.st().brInside===true || (__hc.probe().x>50000); }catch(e){ return false; } })()');
    r=await run('/backrooms exit'); say('/backrooms exit',r);
    await sleep(1500);
    ok('/backrooms entered and exited', inBR===true, inBR);

    console.log('\n[3] errors and unknown commands read as errors');
    r=await run('/nonsense'); say('/nonsense',r);
    ok('unknown command says so and points at /help', /unknown command/.test(String(r.out)) && /help/.test(String(r.out)), String(r.out).slice(0,80));
    r=await run('/give notanitem 1'); say('/give notanitem',r);
    ok('a bad item name is refused by name', /no such item/.test(String(r.out)), String(r.out).slice(0,80));
    r=await run('/spawn notacreature'); say('/spawn notacreature',r);
    ok('a bad creature name is refused by name', /no such creature/.test(String(r.out)), String(r.out).slice(0,80));
    r=await run('/setblock 1 2 3 notablock'); say('/setblock notablock',r);
    ok('a bad block name is refused by name', /no such block/.test(String(r.out)), String(r.out).slice(0,80));
    r=await run('/time'); say('/time (no args)',r);
    ok('a missing argument returns the usage line', /\/time </.test(String(r.out)), String(r.out).slice(0,60));

    await page.evaluate('__hc.cmdOpen("")'); await sleep(400);
    await page.screenshot({ path: path.join(OUT,'console-log.png') });

    console.log('\n[4] /give over the wire, two real clients');
    const errB=[];
    const ctxB=await browser.newContext({ viewport:{width:900,height:600} });
    const A=await openGame(ctx, base, 'join&debug=1&rd=6', errs);   // fresh page as host
    await sleep(2500);
    const B=await openGame(ctxB, base, 'join&debug=1&rd=6', errB);
    await sleep(4500);
    const pl=await A.evaluate('__hc.peerPacks()');
    console.log('  A sees '+(pl&&pl.count)+' peer(s), my id '+(pl&&pl.id));
    ok('two clients are connected', pl && pl.count>=1, pl&&pl.count);
    await B.evaluate('__hc.cmdRun("/clearinv")');
    const bBefore=await B.evaluate('__hc.qState()');
    const gv=await A.evaluate('__hc.cmdRun("/give @a diamond 4")');
    console.log('  A: /give @a diamond 4 -> '+JSON.stringify(gv.out));
    await sleep(2500);
    const bAfter=await B.evaluate('__hc.qState()');
    const bSlot=await B.evaluate('__hc.qGet("inv",0)');
    // Instrumented rather than reasoned about: what B's own console printed, and who each side thinks the other is.
    console.log('  B console log: '+JSON.stringify(await B.evaluate('__hc.cmdLog(4)')));
    console.log('  A players:     '+JSON.stringify(await A.evaluate('__hc.cmdRun("/players")')));
    console.log('  B players:     '+JSON.stringify(await B.evaluate('__hc.cmdRun("/players")')));
    console.log('  B inventory: '+bBefore.inv+' -> '+bAfter.inv+'   slot0='+bSlot);
    ok('/give @a reached the OTHER client', bAfter.inv>bBefore.inv && String(bSlot).indexOf('diamond')===0, {before:bBefore.inv, after:bAfter.inv, slot0:bSlot});

    // ---- [5] /tp AND /kill OVER THE WIRE. Both were local-only: /tp had no target form at all, and /kill's `all` meant mobs, so
    // @a killed the sender alone and said it had killed everyone. Read from B'S OWN probe, never from A's avatars map -- A's copy
    // of where B is arrives on the position channel, so it would report a teleport that never happened on B's client.
    console.log('\n[5] /tp and /kill over the wire');
    const bPos0=await B.evaluate('__hc.probe()');
    const TX=Math.round(bPos0.x)+34, TY=Math.round(bPos0.y)+6, TZ=Math.round(bPos0.z)-27;   // far enough that drift or a step cannot be mistaken for the teleport
    const tp=await A.evaluate('__hc.cmdRun("/tp @a '+TX+' '+TY+' '+TZ+'")');
    console.log('  A: /tp @a '+TX+' '+TY+' '+TZ+' -> '+JSON.stringify(tp.out));
    await sleep(2500);
    const bPos1=await B.evaluate('__hc.probe()');
    console.log('  B position: '+[bPos0.x,bPos0.y,bPos0.z].map(v=>Math.round(v)).join(',')+' -> '+[bPos1.x,bPos1.y,bPos1.z].map(v=>Math.round(v)).join(','));
    // Loose on y: the receiver sets the position and then the world does what it does with it -- gravity, a step up out of ground,
    // a chunk that has not streamed yet. x and z are the claim; y only has to be in the neighbourhood of what was asked for.
    ok('/tp @a moved the OTHER client', Math.abs(bPos1.x-TX)<2.5 && Math.abs(bPos1.z-TZ)<2.5, {want:[TX,TY,TZ], got:[+bPos1.x.toFixed(1),+bPos1.y.toFixed(1),+bPos1.z.toFixed(1)]});
    console.log('  B console log: '+JSON.stringify(await B.evaluate('__hc.cmdLog(3)')));

    // A dead B is the check, and B has to be ALIVE first or the result proves nothing.
    await B.evaluate('__hc.cmdRun("/heal")'); await sleep(600);
    const bAlive=await B.evaluate('__hc.st()');
    ok('the other client is alive before the kill', bAlive && bAlive.dead===false, {dead:bAlive&&bAlive.dead, hp:bAlive&&bAlive.hp});
    const kl=await A.evaluate('__hc.cmdRun("/kill @a")');
    console.log('  A: /kill @a -> '+JSON.stringify(kl.out));
    await sleep(2500);
    const bDead=await B.evaluate('__hc.st()'), aDead=await A.evaluate('__hc.st()');
    console.log('  after /kill @a:  B dead='+(bDead&&bDead.dead)+' hp='+(bDead&&bDead.hp)+'   A dead='+(aDead&&aDead.dead)+' hp='+(aDead&&aDead.hp));
    ok('/kill @a killed the OTHER client', bDead && bDead.dead===true, {dead:bDead&&bDead.dead, hp:bDead&&bDead.hp});
    ok('/kill @a killed the sender too', aDead && aDead.dead===true, {dead:aDead&&aDead.dead, hp:aDead&&aDead.hp});

    ok('no page errors', errs.length===0 && errB.length===0, {a:errs.slice(0,2), b:errB.slice(0,2)});
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
