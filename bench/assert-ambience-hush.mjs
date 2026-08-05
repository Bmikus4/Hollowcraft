// WHEN THE WORLD GOES QUIET, THE SOUNDTRACK GOES WITH IT.
//
// E2, and Ben 08-04: "when all ambient sound goes quiet other than footsteps for the wretch, game music should still fade out."
//
// WHAT WAS BROKEN, AND WHY A ONE-SIGNAL TEST COULD NOT SEE IT. Two proximity signals decided when the world falls silent and
// they were designed to disagree: `threat` (1 - dist/45, forced to 0.9 in HUNT and 0.5 in STALK) pulled the ambient bus and the
// wind down, while `_dread` (90 blocks out to 26) ducked the music. Drive only the dread ramp and the music ducks; drive only a
// HUNT and the world goes silent with the music still playing. So this harness drives EACH signal ALONE, which is the only way
// to catch the pair diverging.
//
// AND THE FADE. updateMusicFades wrote u*_musicVol with no duck in it, so a track starting during the silence came up to full,
// and after any fade finished nothing lowered it again until the ramp next moved — which at a plateau of 1 it never does.
// That is asserted here directly: start a fade while the hush is up, and the volume must stay under the ceiling.
//
// WHAT IS DELIBERATELY NOT SILENCED: the creature's own sound. Its rumble and crackle ride `threat` on purpose — they are the
// thing arriving, not the world it arrived in — and its footsteps go out through panners, untouched by the bus. "All ambient
// sound goes quiet OTHER THAN footsteps for the wretch" is the requirement, so a test that demanded total silence would be
// asserting the wrong thing.
//
//   node bench/assert-ambience-hush.mjs
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
    // NOT muted: --mute-audio silences the output device but the WebAudio graph still runs and its gains are still numbers, so
    // the run stays quiet without the measurement becoming fiction. Autoplay must be allowed or no music element ever starts.
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required']});
    const page=await (await browser.newContext({viewport:{width:900,height:600}})).newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await page.mouse.click(450,300);                       // a gesture, so the audio context is allowed to start
    const ev=js=>page.evaluate(js);
    // …and start it explicitly, because a synthetic click is not always counted as one: with no context the ambient bus and the
    // wind do not exist, every gain reads null, and the assertions below would "pass" on nothing at all. The first run of this
    // harness did exactly that.
    const ac=await ev('__hc.audioOn()');
    check('the audio graph is running (or nothing below measures anything)', !!(ac&&ac.ac&&ac.ambBus!=null), JSON.stringify(ac));
    await sleep(3000);
    const clear=async()=>{ await ev('__hc.dreadSet(0)'); await ev('__hc.threatSet(0)'); await sleep(1200); };

    // The soundtrack opens on two minutes of silence by design (73aeed0), so wind it forward rather than waiting it out.
    await ev('__hc.setTime(0.75)');   // night: crickets are night-only, so the cricket half of E2 is only measurable here
    await clear();
    let base0=await ev('__hc.dread()');
    check('the probe can see both signals and the world', base0.hush!=null && base0.ambBus!=null,
      `hush ${base0.hush}, ambBus ${base0.ambBus}, wind ${base0.wind}`);
    check('with nothing near, the world is at full ambience', base0.hush<0.05 && base0.ambBus>0.5,
      `hush ${base0.hush}, ambBus ${base0.ambBus}`);

    // ---- 1. EACH SIGNAL ALONE MUST QUIET BOTH THE WORLD AND THE MUSIC ----
    for(const [label,drive] of [['the distance ramp (dread)','__hc.dreadSet(1)'],['a HUNT alone (threat)','__hc.threatSet(1)']]){
      await clear();
      // The wind rides setTargetAtTime with a 1.4 s time constant, so 2.2 s only gets it 79% of the way and it measured 0.0246
      // against a 0.02 bar — a false red about the harness's patience, not the game. Wait for the destination.
      await ev(drive); await sleep(5500);
      const s=await ev('__hc.dread()');
      console.log('     '+label.padEnd(26)+' hush '+String(s.hush).padStart(6)+'  ambBus '+String(s.ambBus).padStart(6)
        +'  wind '+String(s.wind).padStart(6)+'  music '+String(s.gameEl).padStart(6)+(s.gamePaused?' (paused)':''));
      check(`${label} raises the shared hush`, s.hush>0.9, `hush ${s.hush}`);
      check(`${label} quiets the ambient bus`, s.ambBus<0.12, `ambBus ${s.ambBus} (0.6 at rest)`);
      check(`${label} takes the wind away too`, s.wind<0.02, `wind ${s.wind} (0.12 at rest)`);
      // THE ITEM'S ACTUAL CLAIM. A paused element is silent, which also satisfies it.
      check(`${label} silences the soundtrack`, s.gamePaused || s.gameEl<=0.02, `music ${s.gameEl}`);
    }

    // ---- 2. THE ONE-SHOTS AND CRICKETS THIN OUT, RAMPED ----
    // Counted over a window, because density is a rate. The gaps are 3-9 s at rest, so 12 s is a handful of cues either way —
    // enough to tell "some" from "none", which is what the gate decides.
    // THE WINDOW HAS TO BE LONG ENOUGH TO CONTAIN THE PROCESS. The gaps are 3-9 s, so a 12 s sample reads zero by luck about one
    // time in eight — which it did, and I wrote it up as "a canopy silences the ambient bed" with an explanation to match. It
    // does not: ambientOneShot's early-out reads opaqueTop, which is built from occludesSky, and leaves are excluded from that on
    // purpose (it was the fix for dark faces in the woods). MEASURED on the ground inside the wood: 16 one-shots and 5 crickets
    // in 90 s, with that early-out false in 30 of 30 samples (bench/tmp-canopy-amb.mjs). The perch below is only for a stable
    // vantage; it is not load-bearing, and 24 s windows are what stop this flaking.
    const perch=async()=>{ const g=await ev('__hc.probe()'); await ev(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`); await sleep(400); };
    const rate=async(label,drive,secs)=>{
      await clear(); if(drive) await ev(drive); await perch(); await sleep(600);
      await ev('__hc.ambCount(true)');
      // Gravity is still on, so hold the perch across the window rather than falling back into the canopy mid-count.
      for(let s=0;s<secs;s+=2){ await perch(); await sleep(2000); }
      const c=await ev('__hc.ambCount()');
      console.log('     '+label.padEnd(26)+' hush '+String(c.hush).padStart(6)+'  one-shots '+String(c.oneShots).padStart(3)+'  crickets '+String(c.crickets).padStart(3)+'   over '+secs+'s');
      return c;
    };
    const quiet=await rate('pressed (hush 1)','__hc.threatSet(1)',24);
    const open =await rate('open world (hush 0)',null,24);
    check('the ambient one-shots stop when the world is pressed', quiet.oneShots===0, `${quiet.oneShots} cues at hush 1`);
    check('and the crickets stop with them', quiet.crickets===0, `${quiet.crickets} chirps at hush 1`);
    check('while the open world still has ambience at all', open.oneShots+open.crickets>0,
      `${open.oneShots} one-shots + ${open.crickets} chirps in 12s`);
    // RAMPED, NOT A SWITCH (E2 is explicit). Half-way in, the world must be quieter but not silent — a hard flip would give
    // either the full rate or zero here, and this is the check that fails on one.
    const mid=await rate('half-way (hush 0.5)','__hc.threatSet(0.5)',28);
    check('half-way in it is thinner, not switched off', mid.oneShots+mid.crickets>0,
      `${mid.oneShots} one-shots + ${mid.crickets} chirps at hush 0.5`);

    // ---- 3. A REAL, PLAYING TRACK — the whole point, and the one thing a paused element cannot prove ----
    // The soundtrack opens on 180 s of silence by design, so every check above was satisfied by an element that was simply
    // PAUSED. That is a green light on nothing: Ben's fault was a track that was PLAYING and came up to full during the hush.
    // musicSkew jumps the music clock past the opening silence so there is something to duck.
    await clear();
    await ev(`__hc.musicSkew(${200})`); await sleep(1200);
    let live=await ev('__hc.dread()');
    for(let i=0;i<20 && (live.gamePaused || live.gameEl<0.01); i++){ await sleep(700); live=await ev('__hc.dread()'); }
    check('a track is actually playing before the duck is tested', !live.gamePaused && live.gameEl>0.01,
      `music ${live.gameEl}, paused ${live.gamePaused}`);
    // FADING IN AT FULL VOLUME IS THE BUG. Raise the hush mid-fade-in and the level must come down, not keep climbing.
    await ev('__hc.threatSet(1)'); await sleep(2500);
    const during=await ev('__hc.dread()');
    console.log('     playing, then pressed      music '+String(live.gameEl).padStart(6)+' -> '+String(during.gameEl).padStart(6)
      +'   fades in flight '+during.fading);
    // THIS IS THE LOAD-BEARING CHECK. Neutered (the fade writing u*_musicVol again) it reads 0.0455 -> 0.1403: the track climbs
    // while the world is silent, which is precisely what Ben heard. Every other check in this file stayed green under that
    // neuter, including the fresh-fade one below — so if this line is ever relaxed, the file stops testing the bug.
    check('a PLAYING track is silenced by the hush', during.gameEl<=0.02, `music ${during.gameEl} (was ${live.gameEl})`);
    // …and it comes back when the world does, because a duck that never releases is just a broken soundtrack.
    await clear(); await sleep(2500);
    const back=await ev('__hc.dread()');
    check('and it returns once the hush releases', back.gamePaused || back.gameEl>0.02, `music ${back.gameEl}`);
    // A FRESH FADE STARTED UNDER A FULL HUSH must also stay down: this is the exact line that was writing u*_musicVol.
    await ev('__hc.threatSet(1)'); await sleep(600);
    await ev('__hc.musicSkew(400)');                       // a new track's fade-in begins while the world is silent
    await sleep(4000);
    const fresh=await ev('__hc.dread()');
    console.log('     new fade under the hush    music '+String(fresh.gameEl).padStart(6)+'   fades in flight '+fresh.fading);
    check('a fade that STARTS during the silence never climbs out of it', fresh.gameEl<=0.02, `music ${fresh.gameEl}`);

    // ---- 4. AND THE WORLD ITSELF COMES BACK ----
    await clear(); await sleep(2500);
    const after=await ev('__hc.dread()');
    check('the world returns when it leaves', after.hush<0.05 && after.ambBus>0.5 && after.wind>0.10,
      `hush ${after.hush}, ambBus ${after.ambBus}, wind ${after.wind}`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
