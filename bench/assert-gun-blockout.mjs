// WHAT YOU HOLD DOES NOT GO THROUGH THE WALL — and the click that says so fires once.
//
// #62. The claim is geometric and therefore measurable: with the player pressed against a wall at full bend, the TIP of the
// held item must be in air, not inside the block. That is the check ac03f95 shipped RED — __hc.blockOut reported
// muzzleInBlock true at tilt 1.05 and full retraction, because the tilt pivoted near the receiver and a 0.58 m barrel
// swung up AND FORWARD as it turned. It now pivots at the butt (blockOutHand), which is what this harness is here to hold.
//
// WHY EVERY GUN AND NOT ONE. The fault scales with barrel length, so a revolver passes a bend the bolt rifle fails; "the
// rifle is out now" is what a one-gun run would have said while the minigun was still buried.
//
// WHY A CLICK COUNT AND NOT A LISTEN. The failure modes are a click per frame and a click that chatters as a probe step
// crosses in and out, and neither is visible in a screenshot or audible in a headless run. The hysteresis (in 1.00 /
// out 1.22) exists to stop exactly that, and a strafe ALONG a wall is the motion that breaks a single threshold.
//
// WHY THE NEAR-PLANE GUARD IS ASSERTED IN THE SAME BREATH. VIEW_NEAR_CLEAR (5815486) pushes the gun FORWARD when its
// rearmost corner enters near+0.10 — the opposite direction to the bend pulling it back. They must both hold at once, or
// fixing one silently undoes the other.
//
//   node bench/assert-gun-blockout.mjs        (run alone: parallel harnesses contend for the GPU and produce false reds)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const CLEAR=0.09;      // the unbent guard band: the code keeps 0.10, assert just under so float noise cannot flake a good build
const BENT_CLEAR=0.028; // …and 0.03 of it survives a full block-out, which is what "not cut by the near plane" costs
const AT_WALL=0.45;  // metres of gap between the eye and the wall's near face: the probe's first step (0.40) lands inside it = full press
const OFF_WALL=2.20; // past the probe's reach (1.56), AND far enough that the longest suppressed barrel is still in air unbent

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?('   '+d):'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1000,height:700}})).newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.45); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);
    const ev=js=>page.evaluate(js);

    // A WALL, WIDE AND TALL. Wide because the strafe check needs several probe steps of travel along it; tall because the
    // probe reads three heights and a 1-block wall would let the eye-0.55 and eye+0.25 rays both miss.
    await ev('__hc.cam({yaw:0,pitch:0})'); await sleep(200);
    const P0=await ev('__hc.pos()');
    const wallZ=Math.floor(P0.z)-2;
    await ev(`(()=>{ for(let dx=-8;dx<=8;dx++) for(let dy=-1;dy<=4;dy++) __hc.setBlock(dx,dy,-2,'stone'); })()`);
    await sleep(1200);
    const standX=Math.floor(P0.x)+0.5, standY=P0.y;
    const goTo=async(x,dz)=>{ await ev(`__hc.tpAt(${x},${standY},${wallZ+1+dz})`); await ev('__hc.cam({yaw:0,pitch:0})'); };
    // A REST POSE MUST BE READ WHEN THE BEND HAS ACTUALLY GONE, not a fixed sleep after stepping back. The ease is dt*10, so
    // 800 ms is nominally eight time constants — but MEASURED off the wall it reads 0.1735 at +200 ms and 0 at +900 ms, so a
    // sleep of 800 sits on the edge of it. That cost a red on the offhand drift check: the gun is the FIRST item in that loop
    // and therefore the only one entering it from the wall, so its "rest" was a mid-ease sample and its "returned" was not.
    // Compared against each other, a settling pose reads exactly like a pose that drifted.
    const relax=async(t=4000)=>{ const t0=Date.now();
      for(;;){ const b=await ev('__hc.blockOut()'); if(!(b.bend>0.02) || Date.now()-t0>t) return b.bend; await sleep(100); } };

    // ---- 1. EVERY GUN, PRESSED AGAINST IT ----
    const guns=(await ev('__hc.itemClasses()')).gunsAll||[];
    check('the build reports its guns', guns.length>=5, `${guns.length} variants`);
    const rows=[];
    for(const g of guns){
      await ev('__hc.offhandSet(null)');
      await ev(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${g} 1")`); await sleep(250);
      await ev(`__hc.hold(${JSON.stringify(g)})`); await sleep(250);
      await goTo(standX, AT_WALL); await sleep(900);                      // 0.9s: the bend eases at dt*10, so it needs ~0.4s to settle
      const hipB=await ev('__hc.blockOut()'), hipC=await ev('__hc.adsClearance()');
      // AND THE AIM MUST BE REFUSED HERE. Aiming extends the gun toward the sight line and relaxes the tilt, which put a
      // metre of barrel through the wall; the rule is that you cannot bring a sight up with the muzzle in brickwork.
      await ev('__hc.aim(true)'); await sleep(900);
      const adsB=await ev('__hc.blockOut()'), adsC=await ev('__hc.adsClearance()');
      await ev('__hc.aim(false)'); await sleep(200);
      rows.push({ g, bend:hipB.bend, out:hipB.out, tilt:hipB.tiltRx, tiltMax:hipB.tiltMax,
                  hipMuzzle:hipB.muzzleInBlock, adsMuzzle:adsB.muzzleInBlock,
                  hipTip:hipB.tip&&hipB.tip.inBlock, adsTip:adsB.tip&&adsB.tip.inBlock,
                  hipFwd:hipB.tip&&hipB.tip.fwd, adsFwd:adsB.tip&&adsB.tip.fwd,
                  adsT:adsC.adsT, hipClear:hipC.clearance, adsClear:adsC.clearance, ndc:hipB.tip&&hipB.tip.ndc,
                  ext:hipB.tip&&hipB.tip.ext });
    }
    for(const r of rows) console.log('     '+r.g.padEnd(28)+'bend '+String(r.bend).padStart(6)+'  tilt '+String(r.tilt).padStart(7)
      +'  muzzle '+(r.hipMuzzle?'IN ':'out')+'/'+(r.adsMuzzle?'IN ':'out')+'  tip '+(r.hipTip?'IN ':'out')+'/'+(r.adsTip?'IN ':'out')
      +'  fwd '+String(r.hipFwd).padStart(6)+'/'+String(r.adsFwd).padStart(6)+'  clear '+String(r.hipClear).padStart(6)+'  ndc '+JSON.stringify(r.ndc)+'  ext '+JSON.stringify(r.ext));

    check('the wall presses every gun to a full bend', rows.every(r=>r.bend>=0.9),
      rows.filter(r=>r.bend<0.9).map(r=>`${r.g} ${r.bend}`).join(' ')||`min ${Math.min(...rows.map(r=>r.bend))}`);
    check('and the latch is out for every one of them', rows.every(r=>r.out), rows.filter(r=>!r.out).map(r=>r.g).join(' ')||'all out');
    // THE ITEM'S CORE CLAIM, and the one that was red in ac03f95.
    const inBlk=rows.filter(r=>r.hipMuzzle||r.adsMuzzle);
    check('NO gun has its MUZZLE inside the block at full bend, hip or aimed', inBlk.length===0,
      inBlk.map(r=>r.g+(r.hipMuzzle?' hip':'')+(r.adsMuzzle?' ads':'')).join('; ')||`${rows.length} variants clear`);
    const tipIn=rows.filter(r=>r.hipTip||r.adsTip);
    check('and no gun has its front-most POINT inside it either', tipIn.length===0,
      tipIn.map(r=>r.g+(r.hipTip?' hip':'')+(r.adsTip?' ads':'')).join('; ')||'every tip in air');
    // The rifle is named because it is the longest barrel and was the measured failure.
    const bolt=rows.find(r=>r.g==='hunting_rifle');
    check('the bolt rifle in particular is out of the wall', bolt&&!bolt.hipMuzzle&&!bolt.adsMuzzle&&!bolt.hipTip,
      bolt?`tilt ${bolt.tilt} rad, muzzle ${bolt.hipMuzzle?'IN':'out'}`:'not found');
    check('the tilt reaches its limit at full press', rows.every(r=>r.tilt>=r.tiltMax*0.75),
      `min ${Math.min(...rows.map(r=>r.tilt))} vs max ${rows[0]&&rows[0].tiltMax}`);
    // THE DISTANCE, NOT THE VERDICT. inBlock depends on where a cell boundary happens to fall; how far the tip reaches in
    // front of the eye is the quantity the block-out controls, and it must come in under the gap the player is standing at.
    const over=rows.filter(r=>r.hipFwd>=AT_WALL-0.02);
    check(`every gun's tip stays inside the ${AT_WALL} gap (< ${(AT_WALL-0.02).toFixed(2)})`, over.length===0,
      over.map(r=>`${r.g} ${r.hipFwd}`).join('; ')||`worst ${Math.max(...rows.map(r=>r.hipFwd))}`);
    // AND IT IS STILL IN YOUR HANDS. Every check above is satisfied by a gun that has left the screen — photographed, the
    // shotgun did exactly that, standing up and out of the top of the frame. The bounds' centre must stay in shot.
    const offscreen=rows.filter(r=>!r.ndc || Math.abs(r.ndc[0])>1 || Math.abs(r.ndc[1])>1);
    check('and the gun is still ON SCREEN while bent', offscreen.length===0,
      offscreen.map(r=>`${r.g} ndc ${JSON.stringify(r.ndc)}`).join('; ')||`worst |y| ${Math.max(...rows.map(r=>Math.abs(r.ndc[1])))}`);
    // The aim is refused while bent, which is what stops the cheek-weld pose from undoing all of the above.
    const aimed=rows.filter(r=>r.adsT>0.15);
    check('and the sight cannot be raised with the muzzle in the wall', aimed.length===0,
      aimed.map(r=>`${r.g} adsT ${r.adsT}`).join('; ')||`max adsT ${Math.max(...rows.map(r=>r.adsT||0))}`);
    // BOTH GUARDS AT ONCE, which is the trap: the bend pulls the gun back, the near-plane guard pushes it forward, and
    // "fixed" either one alone silently undoes the other. What must hold while bent is that NOTHING is cut by the near plane
    // — the guard band deliberately narrows to 0.03 under a full block-out (see nearPlaneClear), because the full 0.10 and a
    // cleared muzzle cannot both be had for the thickest guns. The 0.09 band is asserted OFF the wall, below.
    const cut=rows.filter(r=>r.hipClear<BENT_CLEAR||r.adsClear<BENT_CLEAR);
    check(`no gun is cut by the near plane while bent (>= ${BENT_CLEAR})`, cut.length===0,
      cut.map(r=>`${r.g} ${r.hipClear}/${r.adsClear}`).join('; ')||`worst ${Math.min(...rows.map(r=>Math.min(r.hipClear,r.adsClear)))}`);

    // ---- 1b. AND THE FULL BAND IS BACK THE MOMENT YOU STEP OFF THE WALL ----
    // The narrowed band is a concession to being pressed against something. If it leaked into open ground it would be a
    // regression of 5815486 — Ben's stock-in-the-eye — wearing this item's clothes.
    const openRows=[];
    for(const g of ['hunting_rifle','shotgun','ar15','minigun']){
      await ev(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${g} 1")`); await sleep(200);
      await ev(`__hc.hold(${JSON.stringify(g)})`); await sleep(200);
      await goTo(standX, OFF_WALL); await sleep(200); await relax();
      const c=await ev('__hc.adsClearance()'), bo=await ev('__hc.blockOut()');
      openRows.push({ g, bend:bo.bend, clear:c.clearance });
    }
    check(`off the wall, every gun has the full ${CLEAR} clearance again`, openRows.every(r=>r.clear>=CLEAR && r.bend<0.05),
      openRows.map(r=>`${r.g} ${r.clear}`).join('  '));

    // ---- 2. THE CLICK: ONCE PER BLOCK-OUT, AND NEVER ALONG A WALL ----
    await ev(`__hc.cmdRun("/give hunting_rifle 1")`); await ev(`__hc.hold("hunting_rifle")`); await sleep(200);
    await goTo(standX, OFF_WALL); await sleep(200); await relax();
    await ev('__hc.blockOutReset()');
    const away=await ev('__hc.blockOut()');
    check('standing off the wall, the latch is clear', !away.out && away.bend<0.05, `bend ${away.bend}`);
    await goTo(standX, AT_WALL); await sleep(700);
    const one=await ev('__hc.blockOut()');
    check('walking into it clicks exactly ONCE', one.clicks===1, `clicks ${one.clicks}, out ${one.out}`);
    await sleep(2000);
    const held=await ev('__hc.blockOut()');
    check('and holding there for 2s adds no more', held.clicks===1, `clicks ${held.clicks} after 2s pressed`);
    // THE CHATTER TEST. Sliding along the wall crosses probe steps and re-samples three heights every frame; a bare
    // threshold flaps here. Several stops, all of them inside the enter distance, so the latch must never clear.
    for(const dx of [0.3,0.7,1.1,1.6,2.0,2.4,2.9,3.3]){ await goTo(standX+dx, AT_WALL); await sleep(220); }
    const strafe=await ev('__hc.blockOut()');
    check('a strafe ALONG the wall adds ZERO clicks', strafe.clicks===1, `clicks ${strafe.clicks} after 8 stops`);
    check('and the latch stayed out across it', strafe.out, `bend ${strafe.bend}`);
    // Out and back in: the second block-out is a second click, which is what proves the latch clears at all.
    await goTo(standX, OFF_WALL); await sleep(200); await relax();
    await goTo(standX, AT_WALL); await sleep(700);
    const two=await ev('__hc.blockOut()');
    check('leaving and returning clicks a SECOND time', two.clicks===2, `clicks ${two.clicks}`);

    // ---- 3. ANY HELD ITEM, NOT JUST GUNS (Ben 08-04) ----
    const cls=await ev('__hc.itemClasses()');
    const others=[cls.tool_pick,cls.tool_axe,cls.spear,cls.block_solid,cls.material].filter(Boolean);
    const orows=[];
    for(const id of others){
      await ev(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${id} 1")`); await sleep(200);
      await ev(`__hc.hold(${JSON.stringify(id)})`); await sleep(200);
      await goTo(standX, OFF_WALL); await sleep(200); await relax();
      const off=await ev('__hc.blockOut()');
      await goTo(standX, AT_WALL); await sleep(900);
      const at=await ev('__hc.blockOut()');
      orows.push({ id, restRx:off.tip&&off.tip.rx, wallRx:at.tip&&at.tip.rx, inBlock:at.tip&&at.tip.inBlock, bend:at.bend,
                   restFwd:off.tip&&off.tip.fwd, wallFwd:at.tip&&at.tip.fwd, ext:at.tip&&at.tip.ext });
    }
    for(const r of orows) console.log('     '+String(r.id).padEnd(28)+'rx '+String(r.restRx).padStart(8)+' -> '+String(r.wallRx).padStart(8)
      +'   fwd '+String(r.restFwd).padStart(7)+' -> '+String(r.wallFwd).padStart(7)+'   ext '+JSON.stringify(r.ext)+(r.inBlock?'   TIP IN BLOCK':''));
    // THE CONTRACT IS "NOTHING POKES INTO THE WALL", not "everything rotates". A flat extruded sprite has no depth to clear,
    // and standing one up would point its height at the wall instead — see the depth gate in blockOutHand. So the angle is
    // asserted on the items that HAVE depth, and the clearance is asserted on all of them.
    // NOT A SILENT EXCLUSION. An item whose viewmodel bounds exceed 1.5 m of depth cannot be measured against a wall at all:
    // the "front-most point" of a 7.69 m box is nowhere near the spear you can see, so both its tip and its rotation are
    // fiction. The code retracts those and leaves the angle alone (see the trust window in blockOutHand); the harness prints
    // them and holds nothing against them. Their held models are the bug, and that is a separate item.
    const untrusted=orows.filter(r=>r.ext && r.ext[0]>1.5);
    if(untrusted.length) console.log('     NOT MEASURED (viewmodel bounds > 1.5 deep, so tip and angle are meaningless): '
      +untrusted.map(r=>`${r.id} ext ${r.ext[0]}`).join(', '));
    const meas=orows.filter(r=>!(r.ext && r.ext[0]>1.5));
    const deepRows=meas.filter(r=>r.ext && r.ext[0]>=0.37);
    check('a held item with depth stands up at the wall', deepRows.length>0 && deepRows.every(r=>Math.abs((r.wallRx||0)-(r.restRx||0))>0.3),
      deepRows.filter(r=>Math.abs((r.wallRx||0)-(r.restRx||0))<=0.3).map(r=>r.id).join(' ')||`${deepRows.length} of ${orows.length} have depth`);
    check('and every non-gun item comes back out of the block', meas.every(r=>!r.inBlock),
      meas.filter(r=>r.inBlock).map(r=>`${r.id} fwd ${r.wallFwd}`).join('; ')||'all clear');
    // A CLEARED WALL IS NOT THE SAME AS A VANISHED ITEM. The retraction and the pivot both come out of bounds that some
    // viewmodels overstate wildly (a held spear's box reads 7.69 deep), and unclamped that sent the spear nine metres behind
    // the eye — which clears the block by deleting the thing from the screen. Both are capped; this is what holds the cap.
    const gone=meas.filter(r=>r.wallFwd<-0.6);
    check('and none of them retreats out of sight behind the eye', gone.length===0,
      gone.map(r=>`${r.id} fwd ${r.wallFwd}`).join('; ')||`rearmost ${Math.min(...meas.map(r=>r.wallFwd))}`);

    // ---- 4. THE OFFHAND HAS ITS OWN GROUP AND MUST BEND TOO ----
    await ev(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${cls.tool_pick||'stone'} 1")`);
    await ev(`__hc.hold(${JSON.stringify(cls.tool_pick||'stone')})`); await sleep(200);
    const offIds=[cls.gun, cls.shield, cls.material].filter(Boolean);
    const frows=[];
    for(const id of offIds){
      await ev(`__hc.offhandSet(${JSON.stringify(id)},1)`); await sleep(400);
      await goTo(standX, OFF_WALL); await sleep(300); await relax();
      const a=await ev('__hc.blockOut()');
      await goTo(standX, AT_WALL); await sleep(900);
      const b=await ev('__hc.blockOut()');
      // …and back off it, because the offhand group is the one that historically ACCUMULATED a += and span out.
      await goTo(standX, OFF_WALL); await sleep(300); await relax();
      const c=await ev('__hc.blockOut()');
      frows.push({ id, restRx:a.off&&a.off.rx, wallRx:b.off&&b.off.rx, backRx:c.off&&c.off.rx,
                   restPos:a.off&&a.off.pos, backPos:c.off&&c.off.pos, inBlock:b.off&&b.off.inBlock,
                   ext:b.off&&b.off.ext, wallFwd:b.off&&b.off.fwd });
    }
    for(const r of frows) console.log('     offhand '+String(r.id).padEnd(20)+'rx '+String(r.restRx).padStart(8)+' -> '+String(r.wallRx).padStart(8)+' -> '+String(r.backRx).padStart(8)+(r.inBlock?'   TIP IN BLOCK':''));
    const fdeep=frows.filter(r=>r.ext && r.ext[0]>=0.37);
    check('an OFFHAND item with depth stands up at the wall', fdeep.length>0 && fdeep.every(r=>Math.abs((r.wallRx||0)-(r.restRx||0))>0.3),
      fdeep.filter(r=>Math.abs((r.wallRx||0)-(r.restRx||0))<=0.3).map(r=>r.id).join(' ')||`${fdeep.length} of ${frows.length} have depth`);
    check('and every offhand item is out of the block', frows.every(r=>!r.inBlock),
      frows.filter(r=>r.inBlock).map(r=>`${r.id} fwd ${r.wallFwd}`).join('; ')||'all clear');
    // NOTHING ACCUMULATES: leaving the wall must put the left hand back exactly where it rested, not a little further each time.
    check('and it returns to its rest pose, with no drift', frows.every(r=>Math.abs((r.backRx||0)-(r.restRx||0))<0.02
        && r.restPos && r.backPos && Math.hypot(r.backPos[0]-r.restPos[0], r.backPos[1]-r.restPos[1], r.backPos[2]-r.restPos[2])<0.02),
      frows.map(r=>`${r.id} rx ${r.restRx}->${r.backRx}`).join('; '));

    // ---- 5. AN EMPTY FIST IS NOT A BLOCK-OUT ----
    await ev('__hc.offhandSet(null)'); await ev('__hc.cmdRun("/clearinv")');
    await ev('(()=>{ __hc.setViewItem ? __hc.setViewItem(null) : 0; })()').catch(()=>{});
    await goTo(standX, OFF_WALL); await sleep(200); await relax();
    await ev('__hc.blockOutReset()');
    await goTo(standX, AT_WALL); await sleep(900);
    const fist=await ev('__hc.blockOut()');
    check('an empty hand against the wall does not click', fist.id!=null || fist.clicks===0, `held ${fist.id}, clicks ${fist.clicks}`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

    console.log(`\n${checks-fails}/${checks} checks pass`);
    if(fails) console.log('A muzzle or tip reported IN means the held item is drawn inside the wall: the tilt is not clearing it, and\n'
      +'the pivot is the lever — a rotation about the group origin (near the receiver) sweeps the barrel FORWARD as it rises.');
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
