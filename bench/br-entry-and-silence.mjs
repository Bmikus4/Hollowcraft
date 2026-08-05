// ASSERT TWO OF BEN'S PLAYTEST REPORTS, each against the thing he actually described.
//
//  3. "the backrooms portal looks like its on the roof of the backrooms, but when i go in the portal I AM brought to the
//     correct place" — so the see-through door's virtual camera and brEnter disagreed about the entry's height. The
//     check is that they agree, not that either number is a particular value: the portal camera is the player's camera
//     translated by (dst - src), so the eye it previews from is camera.y + (dsty - (door.y+1)), and stepping through
//     puts the eye at brEntryEyeY(). Those two must be the same number. Before the fix dsty was brEntryFloorY()+2
//     against an arrival of brEntryFloorY()+1.2, so this reports 0.8 on the old tree and 0 on the new one.
//
// 11. "there should be no game music in the backrooms". updateMusicSchedule already refuses to START a track while
//     BR.inside, which is exactly why reading the code says this was done: the gate says nothing about the track that
//     was already playing when you stepped through. So the check PLAYS a track first and then enters — entering with
//     silence already up would pass on the broken tree and prove nothing.
//
// usage: node bench/br-entry-and-silence.mjs      (HC_ROOT=<pinned tree> to measure a pinned hash)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = process.env.HC_ROOT || 'D:/code/Minecraft';
const REPO = 'D:/code/Minecraft';

// dsty is a local inside brRenderPortal and the music elements are module-scoped, so both need one line of reach.
// Refuses to patch the shared checkout: three sessions share D:\code\Minecraft.
function ensureProbe(root) {
  const f = path.join(root, 'index.html');
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('window.__PE=')) return 'already patched';
  if (path.resolve(root).toLowerCase() === path.resolve(REPO).toLowerCase())
    throw new Error('refusing to patch the shared checkout — pin a tree and set HC_ROOT (git archive <hash> | tar -x -C <dir>)');
  const a = 'PERF.T = T; PERF.TID = TID; PERF.TN = TN;';
  if (!s.includes(a)) throw new Error('probe anchor missing — this tree predates PERF.T');
  const probe = '\nwindow.__PE={ get pcam(){return typeof _brPortalCam!=="undefined"?_brPortalCam:null;},'
    + ' get cam(){return camera;},'
    // BR and AC are module-scoped and not on window — a page.evaluate reaching for either throws ReferenceError, which
    // is how "no door" got reported for a door that existed.
    + ' door(){ return (typeof BR!=="undefined"&&BR.door)?{x:BR.door.x,y:BR.door.y,z:BR.door.z}:null; },'
    + ' audio(){ try{ initAudio(); }catch(e){} return { ac:(typeof AC!=="undefined"&&!!AC) }; },'
    // The fallback is the height brEnter used BEFORE brEntryEyeY existed, not the portal's old +2: this has to compare
    // the preview against where the player really arrives, or a pre-fix tree would report off=0 and pass.
    + ' eyeY(){ return (typeof brEntryEyeY==="function") ? brEntryEyeY() : (brEntryFloorY()+1.2); },'
    + ' floorY(){ return brEntryFloorY(); },'
    + ' music(){ const o=[]; for(const [n,a] of [["game",typeof _gameMusicEl!=="undefined"?_gameMusicEl:null],'
    + ' ["rain",typeof _rainMusicEl!=="undefined"?_rainMusicEl:null]]) if(a) o.push({n, paused:!!a.paused, t:+(a.currentTime||0).toFixed(2), v:+(a.volume||0).toFixed(2)}); return o; },'
    + ' play(){ try{ _ensureMusicEls(); if(_gameMusicEl){ _gameMusicEl.volume=0.5; _gameMusicEl.play(); return true; } }catch(e){} return false; },'
    // The gesture path itself. Ben did not "enter with music playing" — he clicked, inside, and every pointer-lock
    // gesture calls resumeMusic. Driving the real function is the only way this bench sees what he saw.
    + ' gesture(){ try{ resumeMusic(); return true; }catch(e){ return String(e); } },'
    + ' leave(){ try{ brExit(); return true; }catch(e){ return String(e); } } };'
    + '   // BENCH PROBE (br-entry-and-silence.mjs), pinned trees only';
  fs.writeFileSync(f, s.replace(a, a + probe));
  return 'patched';
}

const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = (u) => new Promise((res, rej) => { const t0 = Date.now();
  (function poll(){ const q = http.get(u, r => { r.resume(); res(); }); q.on('error', () => { Date.now() - t0 > 15000 ? rej(new Error('down')) : setTimeout(poll, 250); }); })(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const findBrowser = () => ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const J = v => JSON.stringify(v);

(async () => {
  console.log('probe: ' + ensureProbe(ROOT));
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'mp-server.js')], { cwd: ROOT, env: { ...process.env, MP_PORT: String(port), MP_DISC: String(port + 1) }, stdio: 'ignore' });
  let fail = 0;
  try {
    const base = 'http://127.0.0.1:' + port;
    await waitHttp(base + '/index.html');
    // NOT --mute-audio: with no AudioContext every element reads back silent and a broken seal looks like a working one.
    const browser = await chromium.launch({ executablePath: findBrowser(), headless: true,
      args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required',
             '--disable-background-timer-throttling', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 180)));
    const ev = async (js) => { try { return await page.evaluate(js); } catch (e) { return { err: String(e.message || e).slice(0, 150) }; } };
    const frames = (n) => ev(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(r)); for(let i=0;i<${n};i++) await f(); return 1; })()`);

    await page.goto(base + '/index.html?debug=1&rd=8', { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', null, { timeout: 90000 });
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', null, { timeout: 90000 });
    await sleep(6000);
    await ev('__hc.cmdRun("/gamemode creative")');

    // initAudio() is gated on a user gesture in a real browser and simply never runs headless, so an AudioContext has
    // to be asked for explicitly — without one _ensureMusicEls returns early, every element reads null, and a music
    // check would pass on a tree that plays music all the way through the halls.
    console.log('audio: ' + J(await ev('__PE.audio()')));

    // ---- REPORT 3. Spawn a door, let a frame render the portal, then compare the two heights.
    await ev('__hcBR.door()');
    await frames(20);
    const eye = await ev(`(()=>{ const P=window.__PE; if(!P) return {err:'__PE probe missing'};
      const d=P.door(); if(!d) return {err:'no door'};
      const pc=P.pcam; if(!pc) return {err:'portal camera never built — did brRenderPortal run?'};
      // The portal camera IS the player camera translated, so the delta recovers dsty without exposing the local.
      const dsty = pc.position.y - P.cam.position.y + (d.y+1);
      return { dsty:+dsty.toFixed(3), arrivalEyeY:+P.eyeY().toFixed(3), floorY:+P.floorY().toFixed(3),
               off:+(dsty - P.eyeY()).toFixed(3) }; })()`);
    console.log('\nREPORT 3, portal preview vs arrival: ' + J(eye));
    if (eye.err) { console.log('  FAIL — ' + eye.err); fail++; }
    else if (Math.abs(eye.off) > 0.001) { console.log('  FAIL — the preview eye sits ' + eye.off + ' from where stepping through puts you'); fail++; }
    else console.log('  PASS — one height, off by ' + eye.off);

    // ---- REPORT 11. Get a track genuinely playing, THEN enter.
    const played = await ev('__PE.play()');
    await frames(30);
    const before = await ev('__PE.music()');
    console.log('\nREPORT 11, music before entering: ' + J(before) + '  (play() returned ' + J(played) + ')');
    const wasPlaying = Array.isArray(before) && before.some(m => !m.paused);
    if (!wasPlaying) console.log('  INCONCLUSIVE — nothing was playing, so entering cannot be shown to stop it');
    await ev('__hcBR.enter()');
    await frames(60);
    const after = await ev('__PE.music()');
    console.log('REPORT 11, music inside the halls: ' + J(after));
    const stillPlaying = Array.isArray(after) ? after.filter(m => !m.paused) : [];
    if (!wasPlaying) { console.log('  (not counted as a pass or a fail)'); }
    else if (stillPlaying.length) { console.log('  FAIL — still playing: ' + J(stillPlaying)); fail++; }
    else console.log('  PASS — every world track paused inside');

    // THE SCHEDULE HAS TO WANT A TRACK, or nothing here means anything. The soundtrack opens on two minutes of silence
    // (Ben 08-04), so a bench 30 s into the world sits inside that silence: the first version of this check reported
    // "a gesture starts nothing" on BOTH trees and "the world came back silent" on both, which is a statement about
    // the schedule and not about the Backrooms. __hc.musicSkew moves the session clock past the opening silence.
    console.log('\nschedule skewed past the opening silence: ' + J(await ev('__hc.musicSkew(300)')));

    // ---- REPORT 11, THE PART THAT ACTUALLY BIT. Entering already stopped the track on the pre-fix tree; what put it
    // back was any gesture, because resumeMusic -> startGameMusic had no BR.inside gate. This is the real check.
    await ev('__PE.gesture()');
    await frames(30);
    const afterClick = await ev('__PE.music()');
    console.log('REPORT 11, after a gesture INSIDE the halls: ' + J(afterClick));
    const backOn = Array.isArray(afterClick) ? afterClick.filter(m => !m.paused) : [];
    if (backOn.length) { console.log('  FAIL — a click inside the halls restarted: ' + J(backOn)); fail++; }
    else console.log('  PASS — a gesture inside the halls starts nothing');

    // ---- AND THE COUNTER-METRIC: the guard must not leave the world permanently silent on the way out.
    await ev('__PE.leave()');
    await frames(60);
    const out = await ev('__PE.music()');
    console.log('COUNTER-METRIC, music after leaving: ' + J(out));
    if (!(Array.isArray(out) && out.some(m => !m.paused))) { console.log('  FAIL — the world came back silent'); fail++; }
    else console.log('  PASS — the world music returns outside');

    console.log('\npage errors: ' + (errs.length ? errs.slice(0, 6).join(' | ') : 'none'));
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL PASS');
    await browser.close();
  } catch (e) { console.log('HARNESS ERROR: ' + (e && e.stack || e)); fail++; }
  finally { try { server.kill(); } catch (e) {} process.exit(fail ? 1 : 0); }
})();
