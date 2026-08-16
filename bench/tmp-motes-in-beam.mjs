// THE DUST AND THE BEAM ARE ONE MEASUREMENT (Ben's items 6 and 7).
//
// "A beam with nothing in it is a gradient; a beam with motes in it is air." So the question is not "are there motes"
// but the pair of claims the design rests on:
//   1. INSIDE a beam the dust ADDS light - a crop near the lit air is brighter with the motes on than without them;
//   2. OUTSIDE every beam the dust is EXACTLY NOTHING - with the volumetric pass disabled the frame must be identical
//      with the motes on and off, because they have no ambient term and additive black is nothing. If this one fails
//      the motes are screen noise, which is the single failure that would make the feature worse than not having it.
// Claim 2 is the one worth the bench. Claim 1 can be seen; claim 2 is invisible by construction and is exactly the
// thing that rots later when someone adds "a little base brightness so you can see them".
//
// A GLSL ERROR IN A POINTS MATERIAL DRAWS NOTHING AND THE JS SYNTAX CHECK CANNOT SEE IT - the same trap the ocean
// shader set. Every console line is captured and printed, because a silent zero here reads identically to a working
// pass that is subtle.
//
//   node bench/tmp-motes-in-beam.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const logs=[];
    // Split MY errors from the rest of the game's. A creature's drift step throwing is a real bug and it is printed,
    // but failing this bench on it would mean a mote shader could never be called clean while another session has a
    // live fault in the same page - and this bench exists to catch a GLSL error the syntax check cannot see.
    const foreign=[];
    page.on('console',m=>{ const t=m.text(); if(!/error|Error|ERROR|invalid|fail|WARNING/.test(t)) return;
      // CASE-INSENSITIVE, because three.js says "THREE.WebGLProgram: Shader Error" - capital S, and a case-sensitive
      // list of 'shader|SHADER' filed the one message this bench exists to catch under someone else's faults.
      (/motes:|points|gl_point|vLit|uVL|shader|program|glsl|compile/i.test(t) ? logs : foreign).push(t.slice(0,300)); });
    page.on('pageerror',e=>logs.push('PAGEERROR: '+String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.freezeT(0); __hc.setTime(0.85);`);

    // READ THE CROP OFF A SCREENSHOT, NOT OFF THE LIVE CANVAS. Drawing the WebGL canvas into a 2D context returns a
    // blank image once the frame is composited - the context is created without preserveDrawingBuffer, as it should be -
    // so the first version of this bench reported 0.000 for every reading including the controls and called a working
    // shader dead. The screenshot is the composited frame and the only honest source. Fixed box, same box every time:
    // a crop that moves between the on and the off frame is the oldest way to manufacture a difference.
    let _shotN=0;
    const one=async(tag)=>{ await sleep(700);
      const f=path.join(OUT,'motes-'+(tag||('s'+(_shotN++)))+'.png'); await page.screenshot({path:f});
      const buf=fs.readFileSync(f).toString('base64');
      return await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
        await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const g=c.getContext('2d'); g.drawImage(im,0,0); const d=g.getImageData(340,180,600,360).data;
        let s=0,n=0; for(let i=0;i<d.length;i+=4){ s+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; n++; }
        return +(s/n).toFixed(3); })()`); };
    // MEDIAN OF THREE FRAMES, because the thing being measured is a drifting cloud. One frame's reading depends on
    // where 260 particles happen to be, and this file's own bench notes already carry the rule: fix the measurement
    // box once and use medians, since falling leaf particles move any edge detector. A single frame is how the same
    // lit room read 35.8 and 20.5 on consecutive samples.
    const read=async(tag)=>{ const v=[]; for(let i=0;i<3;i++) v.push(await one(tag+'-'+i));
      v.sort((a,b)=>a-b); return v[1]; };

    // ---- Reach an interior with a light in it. The dungeon is the proving ground the item names. ----
    // __hc.dungeon() REPORTS where the dungeon is; it does not take you there. Calling it alone and then measuring
    // produced a night COAST frame - sky, shoreline, village torches - which still had air and a light and so passed
    // every check while proving nothing about an interior. Look at the frame before reading a statistic off it.
    const dun=await page.evaluate(`(()=>{ try{ const d=__hc.dungeon&&__hc.dungeon(); return d&&d.pos?d.pos:null; }catch(e){ return null; } })()`);
    if(!dun){ console.log('  the dungeon does not report a position - refusing to measure an interior claim outdoors'); process.exit(1); }
    await page.evaluate(`__hc.tpAt(${dun.x}, ${dun.y}+2, ${dun.z}); __hc.fog(0)`); await sleep(2500);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1500);
    const vl=await page.evaluate(`__hc.volLights()`);
    const m0=await page.evaluate(`__hc.motes()`);
    console.log(`  where   air ${vl.air}  why "${vl.why}"  chosen ${vl.chosen.length}/${vl.budget}`);
    console.log(`  motes   ${JSON.stringify(m0)}`);
    check('the volumetric pass has a light here, or nothing below means anything', vl.chosen.length>0, vl.why);
    check('the motes share the pass\'s own light uniforms', m0.sharesPos===true && m0.sharesI===true, `sharesPos ${m0.sharesPos} sharesI ${m0.sharesI}`);
    check('the mote update threw nothing', !m0.err, String(m0.err));

    // ---- CLAIM 1: inside a beam, the dust adds light. Three readings, on-off-on, so drift is visible as disagreement
    // between the two ONs rather than being folded into the result.
    await page.evaluate(`__hc.vol(1); __hc.motes(1)`); const a1=await read("beam-on");
    await page.evaluate(`__hc.motes(0)`);              const a0=await read("beam-off");
    await page.evaluate(`__hc.motes(1)`);              const a2=await read("beam-on2");
    const noise=Math.abs(a2-a1), add=((a1+a2)/2)-a0;
    console.log(`  in beam   motes on ${a1}  off ${a0}  on-again ${a2}   contribution ${add.toFixed(3)}  noise ${noise.toFixed(3)}`);
    check('inside a beam the dust adds light above the noise', add>noise && add>0.05, `add ${add.toFixed(3)} vs noise ${noise.toFixed(3)}`);
    const drawing=await page.evaluate(`__hc.motes().drawing`);
    check('and the mote cloud is actually drawing there', drawing===true, `drawing ${drawing}`);

    // ---- CLAIM 2: with no beam, the dust is exactly nothing. THE ONE THAT MATTERS.
    // ON/OFF/ON here too, and its OWN noise floor. A two-point comparison read a 1.290 "leak" in a frame where
    // __hc.motes().drawing was false on both sides - the cloud was not rendered at all, and the whole difference was
    // the room drifting between two single samples (a torch flicker, a spider crossing). Claim 1 was already measured
    // as a triple for that reason; measuring the control with a weaker instrument than the result is how a bench
    // manufactures a failure it can then be "fixed" for.
    await page.evaluate(`__hc.vol(0); __hc.motes(1)`); const b1=await read("nobeam-on");
    await page.evaluate(`__hc.motes(0)`);              const b0=await read("nobeam-off");
    await page.evaluate(`__hc.motes(1)`);              const b2=await read("nobeam-on2");
    const bNoise=Math.abs(b2-b1), leak=Math.abs(((b1+b2)/2)-b0);
    console.log(`  no beam   motes on ${b1}  off ${b0}  on-again ${b2}   leak ${leak.toFixed(3)}   (its own drift floor ${bNoise.toFixed(3)})`);
    check('with no beam the dust contributes nothing', leak<=Math.max(0.05,bNoise), `leak ${leak.toFixed(3)} vs drift ${bNoise.toFixed(3)}`);
    const drawing2=await page.evaluate(`__hc.motes().drawing`);
    check('and the cloud is not even drawn without a pass', drawing2===false, `drawing ${drawing2}`);

    await page.evaluate(`__hc.vol(1); __hc.motes(1)`); await sleep(900);
    const f=path.join(OUT,'motes-in-beam.png'); await page.screenshot({path:f}); console.log('   ->',path.basename(f));
    console.log('  shader/mote logs:\n   '+(logs.length?logs.slice(0,6).join('\n   '):'(none)'));
    if(foreign.length) console.log('  OTHER faults live in this page (not this bench\'s subject, still real):\n   '+foreign.slice(0,3).join('\n   '));
    check('no shader or mote errors', logs.length===0, logs.slice(0,1).join('').slice(0,160));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
