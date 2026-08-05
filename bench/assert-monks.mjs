// THE MONKS. Ben: "create monks which wear robes like jesus but look like the monks on mount athos, they hold bibles, and can
// chant biblical passage when the player gets close ... they should be dark blue with gold crosses on their hats and robes ...
// they should spawn in the church or the monestary but also very occasionally one alone can spawn at a ruin", and "killing one
// should convert the wretch into the horrific wretch". Then: "ritual stays the hard way, gate the monk kill" and "three monks".
//
// The gate is the part a harness has to hold down, because it is the part that can silently rot. Three things can each break it
// on their own: the count could fire on the first kill (which would end the escalation the crypt ritual builds toward), it could
// never fire at all, or it could forget across a save -- and a gate that forgets is not a gate. So the checks walk the counter
// kill by kill, assert NO Horrific Wretch on one and two, assert exactly one appears on three, and then round-trip the counter
// through the save.
//
// The model is checked by counting, not by eye: how many gold (0xd4af37) materials are on the rig, and whether the bible is
// there. A robed figure with the crosses left off is the single most likely way this ships wrong, and it is invisible in a
// screenshot taken from the back.
//
// usage: node bench/assert-monks.mjs   -> bench/results/monk-*.png
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
    const page=await (await browser.newContext({viewport:{width:1000,height:640}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.setTime(0.42)');

    console.log('[1] the egg exists and is reachable from the creative menu');
    const egg=await page.evaluate('__hc.packInfo(["egg_monk"]).egg_monk');
    console.log('  egg_monk: '+JSON.stringify(egg));
    ok('the monk spawn egg is a named item', egg && egg.name==='Monk Spawn Egg', egg&&egg.name);
    ok('and it is in the creative menu', egg && egg.inCreative===true, egg&&egg.inCreative);

    console.log('\n[2] the model: dark-blue robe, gold crosses, a bible');
    const spawned=await page.evaluate('__hc.monkSpawn(3,0)');
    console.log('  spawned: '+JSON.stringify(spawned));
    ok('a monk can be spawned on the ground', spawned && spawned.y!=null, spawned);
    const M=await page.evaluate('__hc.monks()');
    console.log('  monks(): '+JSON.stringify(M).slice(0,400));
    const m0=M.live && M.live[0];
    ok('the rig has a body of parts', m0 && m0.parts>=14, m0&&m0.parts);
    ok('three gold crosses are on the rig', m0 && m0.gold>=6, m0&&m0.gold);   // 3 crosses x 2 boxes each = 6 gold meshes: hat, chest, bible cover
    ok('he is holding a bible', m0 && m0.book===true, m0&&m0.book);
    // LOOK AT HIM. A count of gold materials proves the crosses were built; it does not prove any of it is drawn.
    //
    // MEASURE INSIDE HIS PROJECTED BOX, not across the frame. Counting the whole frame read 1721 "gold" pixels off the MINIMAP's
    // compass ring, which would have passed with the crosses deleted; and it read 223 blue ones because he had walked out of
    // frame during the second the shot took. So: park him, turn him to face the camera, project his feet and head for the box.
    await page.evaluate('__hc.monkPark()');
    const box=await page.evaluate(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
      const m=__hc.monks().live[0]; let best=null;
      for(let i=0;i<64;i++){ const yaw=i/64*Math.PI*2;
        for(const pit of [-0.16,-0.08,0.0,0.08]){ __hcBR.look(yaw,pit); await f(); await f();
          const s=__hc.screenOf(m.x,m.y+1.0,m.z);
          if(s.onScreen){ const off=Math.hypot(s.px-s.w/2,s.py-s.h/2); if(!best||off<best.off) best={yaw:+yaw.toFixed(3),pit,off:+off.toFixed(0)}; } } }
      if(best){ __hcBR.look(best.yaw,best.pit); await f(); await f(); }
      __hc.monkFace(); await f(); await f();
      const mm=__hc.monks().live[0];
      return { best, feet:__hc.screenOf(mm.x,mm.y,mm.z), head:__hc.screenOf(mm.x,mm.y+2.0,mm.z) }; })()`);
    console.log('  framed at '+JSON.stringify(box.best));
    ok('he could be framed at all', box.best && box.feet.onScreen && box.head.onScreen, box.best);
    await sleep(700);
    const shot=path.join(OUT,'monk-model.png'); await page.screenshot({path:shot});
    const { decodePNG }=await import('./pngprobe.mjs'); const img=decodePNG(fs.readFileSync(shot));
    const y0=Math.max(0,Math.min(box.head.py,box.feet.py)|0), y1=Math.min(img.h-1,Math.max(box.head.py,box.feet.py)|0);
    const hw=Math.max(4,((y1-y0)*0.30)|0), cx=box.feet.px|0, x0=Math.max(0,cx-hw), x1=Math.min(img.w-1,cx+hw);
    let blue=0, goldPx=0, grey=0, tot=0;
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){ const i=(y*img.w+x)*img.ch, r=img.data[i], g=img.data[i+1], b=img.data[i+2]; tot++;
      if(b>r+30 && b>g+16) blue++;                                              // the rason: blue-dominant, which grass, dirt and a night sky in this box are not
      if(r>140 && g>100 && b<130 && r>b+50) goldPx++;                           // the gold crosses
      if(r>150 && g>145 && b>135 && Math.abs(r-b)<40 && Math.abs(r-g)<22) grey++; }   // the grey beard
    console.log('  in his box ('+tot+' px): blue '+blue+'  gold '+goldPx+'  beard-grey '+grey);
    ok('the robe fills most of him and reads BLUE', blue>tot*0.35, {blue,tot,pct:+(100*blue/tot).toFixed(0)});
    ok('gold crosses are drawn on him', goldPx>120, goldPx);
    // THE BEARD. It was built from the first pass and invisible in every frame: the rason's collar reached his jaw and swallowed
    // it whole. Counting materials could never have caught that, which is why this check is on pixels.
    ok('the grey beard is visible under his chin', grey>90, grey);

    console.log('\n[3] he chants when you come near, and only one at a time');
    const c1=await page.evaluate('__hc.monkChant()');
    console.log('  chant: '+JSON.stringify(c1));
    ok('the chant fires', c1 && c1.fired===true, c1);
    const c2=await page.evaluate('(()=>{ const M=__hc.monks(); return {chantIn:M.live[0].chantIn, chanting:M.live[0].chanting}; })()');
    ok('it sets a long cooldown on him', c2.chantIn>20, c2);
    ok('and marks him as singing', c2.chanting>0, c2);
    // The overlap lock: a second monk asked to sing DURING the first must be refused.
    await page.evaluate('__hc.monkSpawn(-3,2)');
    const c3=await page.evaluate('(()=>{ const A=__hc.monks().live; return A.length; })()');
    ok('two monks can stand together', c3>=2, c3);
    // THE OVERLAP LOCK. Two drones at once is a dissonant mess, so monkChant refuses while another is still ringing. Asked again
    // with the lock left standing (keepLock), it must refuse — that is the proven-failing control for the lock existing at all.
    const c5=await page.evaluate('__hc.monkChant(true)');
    console.log('  asked again while the first is still ringing: '+JSON.stringify(c5));
    ok('a second chant is refused during the first', c5 && c5.fired===false, c5);
    ok('the lock still has time to run', c5 && c5.lockAhead>4, c5&&c5.lockAhead);

    console.log('\n[4] he can be damaged without dying — Ben: "they can be damaged, but when they are killed..."');
    await page.evaluate('__hc.monkWrathSet(0)');
    const h1=await page.evaluate('__hc.monkHurt(5)');
    console.log('  hit for 5: '+JSON.stringify(h1));
    ok('a hit takes health off him', h1 && h1.hp===9 && h1.dead===false, h1);
    ok('and a wounded monk angers nobody', h1 && h1.wrath===0, h1&&h1.wrath);

    console.log('\n[5] the gate: three kills, and not one');
    const k=[];
    for(let n=1;n<=3;n++){
      if(!(await page.evaluate('__hc.monks().live.length'))) await page.evaluate('__hc.monkSpawn(3,1)');
      k.push(await page.evaluate('__hc.monkKill()'));
      console.log('  kill '+n+': '+JSON.stringify(k[n-1]));
      await sleep(800); }
    ok('kill 1 counts and makes no creature', k[0] && k[0].wrath===1 && k[0].hwAfter===k[0].hwBefore, k[0]);
    ok('kill 1 rouses the beast instead', k[0] && k[0].armed===true && k[0].menace>0.4, k[0]&&[k[0].armed,k[0].menace]);
    ok('kill 2 counts and still makes no creature', k[1] && k[1].wrath===2 && k[1].hwAfter===k[1].hwBefore, k[1]);
    // OWED COUNTS. The conversion dresses the PRIME wretch and only on a frame where it is active: dressing a dormant one put a
    // creature in the world that nothing drew (871f77a), so the third kill records the debt in HORROR.hwPending and it is paid on
    // the first frame the beast is out. In this bench the wretch is asleep in its lair, so asserting hwAfter>hwBefore here was
    // asserting the bug that fix removed.
    ok('kill 3 makes the Horrific Wretch, or owes it', k[2] && k[2].wrath===3 && (k[2].hwAfter>k[2].hwBefore || k[2].pending===1), k[2]);

    console.log('\n[6] the counter survives a reload');
    const rt=await page.evaluate('__hc.monkSaveRoundTrip(2)');
    console.log('  round trip: '+JSON.stringify(rt));
    ok('a wrath of 2 goes into the save and comes back', rt && rt.wrote===2 && rt.restored===2, rt);
    const rt0=await page.evaluate('__hc.monkSaveRoundTrip(0)');
    ok('and zero round-trips as zero, not as a default', rt0 && rt0.restored===0, rt0);   // control: the restore is reading the field, not falling back to a constant
    const rt3=await page.evaluate('__hc.monkSaveRoundTrip(3)');
    ok('a completed gate stays completed', rt3 && rt3.restored===3, rt3);

    console.log('\n[7] the sites');
    const sites=await page.evaluate('(()=>({ church:__hc.church(), cath:__hc.cathedralDiag(), shrine:__hc.monks().shrine }))()');
    console.log('  church '+JSON.stringify(sites.church)+'\n  cathedral spot '+JSON.stringify(sites.cath&&sites.cath.spot));
    ok('the chapel has a site for them', sites.church && sites.church.x!=null, sites.church);
    ok('the monastery has a site for them', sites.cath && sites.cath.spot && sites.cath.spot.x!=null, sites.cath&&sites.cath.spot);

    // THE WAY BEN WILL ACTUALLY MEET ONE. Everything above spawns monks by hook; none of it proves the site spawner runs. Stand
    // off the chapel at a distance inside the 14..95 band, let the builder finish, and wait for the 22s tick to put one there.
    console.log('\n[8] one turns up at the chapel by himself');
    const cs=await page.evaluate('__hc.church()');
    await page.evaluate('__hc.monkWrathSet(0)');
    await page.evaluate('(()=>{ animals.filter(a=>a.type==="monk").forEach(a=>killAnimal(a)); })()').catch(()=>{});
    await page.evaluate('__hc.tp('+cs.x+','+(cs.z+40)+')');
    let seen=null, built=false;
    for(let i=0;i<16;i++){ await sleep(3000);
      const c=await page.evaluate('__hc.church()'); built=built||!!c.done;
      const M=await page.evaluate('__hc.monks()');
      if(M.live && M.live.length){ seen=M; break; } }
    console.log('  chapel built='+built+'  monks: '+JSON.stringify(seen&&seen.live));
    ok('the chapel finished building', built, built);
    ok('a monk appeared at it with no hook involved', seen && seen.live.length>=1, seen&&seen.live.length);
    ok('and he is standing at the chapel, not out at sea', seen && Math.hypot(seen.live[0].x-cs.x, seen.live[0].z-cs.z)<16,
      seen && +Math.hypot(seen.live[0].x-cs.x, seen.live[0].z-cs.z).toFixed(1));
    // ON THE CHAPEL'S OWN STOREY. groundYAt returns the topmost solid, so an unguarded ring put one run's monk at y=60 beside a
    // chapel floored at y=43 — on its ridge. This is the check that would have caught it.
    // The window is +6/-3 rather than tight, because the cathedral floors its nave on a 4-block plinth. It is still nowhere near
    // the 19 blocks the unguarded ring put one monk above the beach.
    ok('and on the chapel\'s own storey, not its roof', seen && seen.live[0].terrainY!=null && (seen.live[0].y-seen.live[0].terrainY)<=6 && (seen.live[0].y-seen.live[0].terrainY)>=-3,
      seen && {monkY:seen.live[0].y, terrainY:seen.live[0].terrainY});
    if(seen){ await page.evaluate('__hc.monkPark()');
      await page.evaluate(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
        const m=__hc.monks().live[0]; let best=null;
        for(let i=0;i<48;i++){ const yaw=i/48*Math.PI*2; for(const pit of [-0.14,-0.04,0.06]){ __hcBR.look(yaw,pit); await f(); await f();
          const s=__hc.screenOf(m.x,m.y+1.0,m.z); if(s.onScreen){ const off=Math.hypot(s.px-s.w/2,s.py-s.h/2); if(!best||off<best.off) best={yaw,pit,off}; } } }
        if(best){ __hcBR.look(best.yaw,best.pit); await f(); await f(); } })()`);
      await sleep(900); await page.screenshot({path:path.join(OUT,'monk-at-chapel.png')}); }

    ok('no page errors', errs.length===0, errs.slice(0,3));
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
