// THE LAUNCH TERMINAL (#54's console half; Ben 08-04: "i also dont see any clear way/designed interface for the icbm terminal, it
// still needs built").
//
// WHAT WAS THERE: window.prompt('TARGET COORDINATES (x z):'). Not an interface, and #54 names it as a drift to correct — the target
// is picked ON THE MAP, not typed.
//
// WHAT IS ASSERTED, and the interlock is the design: the board opens on a right-click, the map turns a CLICK into a designation,
// and the LAUNCH button is dead until four things hold — a warhead in the shaft, a target, an idle cool silo, and the key turned.
// Every refusal has to NAME itself in the status line, because a greyed button that will not say why reads as a broken game.
// Also asserted: it takes over input like every other panel (openUI), Escape closes it, and a launch actually leaves the silo.
//
//   node bench/assert-icbm-terminal.mjs
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
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?('   '+d):'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.30); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);
    const ev=js=>page.evaluate(js);
    // openUI is module scope and unreachable from here — reading it in a page.evaluate returned null and failed a check about the
    // panel taking over input while the panel was doing exactly that. It comes from the hook now.
    const state=async()=>{ const dom=await ev(`(()=>{ const q=(id)=>document.getElementById(id);
      const m=q('icbmui'); const st=(id)=>{ const e=q(id); return e?e.textContent.trim():null; };
      return { open:!!(m&&getComputedStyle(m).display!=='none'),
        silo:st('icbmsilo'), load:st('icbmload'), tgt:st('icbmtgt'), range:st('icbmrange'), eta:st('icbmeta'),
        arm:st('icbmarm'), stat:st('icbmstat'), fireDisabled:!!(q('icbmfire')&&q('icbmfire').disabled) }; })()`);
      const hk=await ev('__hc.icbmState ? __hc.icbmState() : null');
      return Object.assign(dom, { openUI:hk?hk.openUI:null, armed:hk?hk.armed:null, blocked:hk?hk.blocked:null, flight:hk?hk.flight:null }); };

    // ---- THE BOARD EXISTS AND OPENS ----
    check('the terminal is markup in the page, not a prompt', await ev(`!!document.getElementById('icbmui')`));
    // Through the hook, not by calling openIcbmUI directly: it is module scope, a page.evaluate cannot see it, and the first run of
    // this file swallowed the ReferenceError in a .catch and then asserted against a panel that had never opened — eight reds with
    // one cause, none of them the game's.
    await ev('__hc.icbmTerminal(true)');
    await sleep(600);
    let s=await state();
    console.log('     opened            '+JSON.stringify(s));
    check('it opens', s.open===true, JSON.stringify({open:s.open}));
    check('and it takes over input like every other panel', s.openUI==='icbm', 'openUI '+s.openUI);

    // ---- WITH NO SILO ON THE BOARD, IT SAYS SO ----
    check('with no silo it refuses and names the reason', s.fireDisabled===true && /silo/i.test(s.stat||''), JSON.stringify(s.stat));

    // ---- BUILD THE SILO, THEN WALK THE INTERLOCK ONE CONDITION AT A TIME ----
    await ev('__hc.icbmTerminal(false)');
    let sp=null; for(let i=0;i<60;i++){ sp=await ev('__hc.silo()'); if(sp&&sp.spot) break; await sleep(120); }
    await ev('__hc.siloGoto()'); await sleep(3000); await ev('__hc.siloForce()'); await sleep(1500);
    const pad=(await ev('__hc.silo()')).pad;
    await ev('__hc.icbmTerminal(true)'); await sleep(500);
    s=await state();
    console.log('     silo built        '+JSON.stringify({silo:s.silo,load:s.load,stat:s.stat}));
    check('the board reads the silo as ready and loaded', /READY/i.test(s.silo||'') && /LOADED/i.test(s.load||''),
      JSON.stringify({silo:s.silo,load:s.load}));
    check('with no target it refuses, by name', s.fireDisabled===true && /target/i.test(s.stat||''), JSON.stringify(s.stat));
    // A CLICK ON THE MAP IS THE DESIGNATION. Clicked through the real element at a real offset, so the screen-to-world inverse is
    // what is being tested and not a setter.
    const box=await ev(`(()=>{ const r=document.getElementById('icbmmap').getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; })()`);
    await page.mouse.click(box.x+box.w*0.70, box.y+box.h*0.32);
    await sleep(400);
    s=await state();
    console.log('     after map click   '+JSON.stringify({tgt:s.tgt,range:s.range,eta:s.eta,stat:s.stat}));
    check('clicking the map designates a target', s.tgt && /-?\d+\s*,\s*-?\d+/.test(s.tgt), JSON.stringify(s.tgt));
    check('and it works out the range and the flight time', /blocks/.test(s.range||'') && /s/.test(s.eta||''),
      JSON.stringify({range:s.range,eta:s.eta}));
    // The click must land where it was aimed, not merely somewhere: up and to the right of the player means +x and -z on a
    // north-up chart.
    const tgtNums=(s.tgt||'').split(',').map(v=>parseInt(v,10));
    check('the designation is in the direction that was clicked', tgtNums[0]>pad.x-400 && tgtNums[1]<pad.z+400,
      `clicked up-right, got ${s.tgt} against silo ${pad.x},${pad.z}`);
    check('still refuses without the key', s.fireDisabled===true && /key/i.test(s.stat||''), JSON.stringify(s.stat));
    // ---- ARM, THEN THE BUTTON IS LIVE ----
    await page.click('#icbmarm'); await sleep(350);
    s=await state();
    console.log('     armed             '+JSON.stringify({arm:s.arm,stat:s.stat,fireDisabled:s.fireDisabled}));
    check('the arming key latches', /ARMED/i.test(s.arm||''), JSON.stringify(s.arm));
    check('and the launch button goes live', s.fireDisabled===false, 'disabled '+s.fireDisabled);
    await page.screenshot({path:path.join(ROOT,'bench','results','icbm-terminal.png')});

    // ---- FIRE ----
    const before=await ev('__hc.icbmSilo()');
    await page.click('#icbmfire'); await sleep(700);
    const after=await ev('__hc.icbmSilo()');
    const fl=await ev('__hc.icbmFlightState()');
    s=await state();
    console.log('     fired             flight '+fl.state+'   shaft '+before.loaded+' -> '+after.loaded+'   board open '+s.open);
    check('the button launches', fl.state==='flight', JSON.stringify(fl.state));
    check('it spends the warhead in the shaft', before.loaded===true && after.loaded===false, `${before.loaded} -> ${after.loaded}`);
    check('and the board closes itself, handing control back', s.open===false && s.openUI!=='icbm', JSON.stringify({open:s.open,openUI:s.openUI}));

    // ---- ESCAPE CLOSES IT, AND THE KEY DOES NOT STAY TURNED ----
    await ev('__hc.icbmTerminal(true)'); await sleep(500);   // through the hook: called directly, this silently did nothing and the next two checks read the DOM as it stood BEFORE the launch
    let s2=await state();
    check('the key springs back after a launch', /^ARM$/i.test(s2.arm||''), JSON.stringify(s2.arm));
    // Asserted on the STATE and on there being a message, not on the wording: matching prose meant this failed on the word
    // "bird" when the board was saying exactly the right thing ("a bird is already in the air").
    check('and a busy silo is named as busy, whatever the words', !!s2.blocked && (s2.stat||'').length>4 && s2.fireDisabled===true,
      JSON.stringify({blocked:s2.blocked, stat:s2.stat, flight:s2.flight}));
    await page.keyboard.press('Escape'); await sleep(400);
    s2=await state();
    check('Escape closes the board', s2.open===false && s2.openUI!=='icbm', JSON.stringify({open:s2.open,openUI:s2.openUI}));
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
