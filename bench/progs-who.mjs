// WHICH SHADER PROGRAMS ARE BEING LINKED DURING PLAY, BY NAME.
//
// br-portal-phase.mjs establishes that Ben's "loading new chunks is still extremely fucking laggy" is `draw` time with
// the program count stepping: 37 -> 127 programs over 240 frames of ordinary streaming, four frames of 200-620 ms.
// The plan's A1 assumes the cause is a MOVING POINT-LIGHT COUNT, mirroring what brStableLightCount fixes for the
// Backrooms. That assumption is worth exactly nothing until the keys are read, and reading them is cheap:
// three stores every linked program in renderer.info.programs with the cacheKey it was keyed on, and the light counts
// are IN that key. So a diff of the key list across a window says whether lights moved, and if they did not, it says
// what did instead.
//
// No hypothesis is needed to interpret it:
//   keys differ only in their light-count fields  -> A1 is the fix, build the stable pool.
//   keys are new MATERIALS                        -> the cause is material variants appearing as the world streams,
//                                                    and a stable light count would remove none of them.
//
// usage: node bench/progs-who.mjs      (HC_ROOT=<pinned tree> to measure a pinned hash)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = process.env.HC_ROOT || 'D:/code/Minecraft';
const REPO = 'D:/code/Minecraft';
const FRAMES = +(process.env.PW_FRAMES || 240);

// The renderer is a module-scoped const and __hc exposes no handle to it. One line of reach, and it REFUSES to patch
// the shared checkout: three sessions share D:\code\Minecraft and a stray edit there is swept into someone's commit.
function ensureProbe(root) {
  const f = path.join(root, 'index.html');
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('window.__PW=')) return 'already patched';
  if (path.resolve(root).toLowerCase() === path.resolve(REPO).toLowerCase())
    throw new Error('refusing to patch the shared checkout — pin a tree and set HC_ROOT (git archive <hash> | tar -x -C <dir>)');
  const a = 'PERF.T = T; PERF.TID = TID; PERF.TN = TN;';
  if (!s.includes(a)) throw new Error('probe anchor missing — this tree predates PERF.T');
  fs.writeFileSync(f, s.replace(a, a + '\nwindow.__PW={get renderer(){return renderer;},get world(){return world;},get scene(){return scene;},T,TN};   // BENCH PROBE (progs-who.mjs), pinned trees only'));
  return 'patched';
}

const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = (u) => new Promise((res, rej) => { const t0 = Date.now();
  (function poll(){ const q = http.get(u, r => { r.resume(); res(); }); q.on('error', () => { Date.now() - t0 > 15000 ? rej(new Error('down')) : setTimeout(poll, 250); }); })(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const findBrowser = () => ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const J = v => JSON.stringify(v);

// A program's identity for this purpose is (shaderName, numPointLights, numDirLights, numSpotLights, shadowMap on/off).
// three's cacheKey is a long concatenation and its field ORDER is a three-internal detail, so the fields are read off
// the WebGLProgram object itself where three stores them, and the raw key is kept only as a tiebreaker string.
const KEYS = `(()=>{ const r=window.__PW&&__PW.renderer; if(!r) return {err:'__PW probe missing'};
  const out=[]; for(const p of (r.info.programs||[])) out.push(p.cacheKey);
  return out; })()`;

// The counter-metric: if this window meshed no chunks, "no new programs" proves nothing about streaming.
const STATE = `(()=>{ const r=__PW.renderer; let meshed=0; __PW.world.forEach(c=>{ if(c.meshed) meshed++; });
  return { chunks:__PW.world.size, meshed, progs:(r.info.programs||[]).length }; })()`;

// WHICH LIGHTS three is actually counting. Its light count is taken from the render list, so only VISIBLE lights in the
// scene graph count — a light parked at intensity 0 but visible still holds the count steady, which is the whole trick
// brStableLightCount uses. Each light is labelled by its ancestry so "25 more point lights" becomes a place in the code.
const LIGHTS = `(()=>{ const root=__PW.scene; if(!root) return {err:'no scene handle'};
  const out={}; let counted=0, hidden=0;
  // three's projectObject returns early on an invisible node, so an invisible PARENT hides its lights too. Mirroring
  // that here is the difference between counting what three counts and counting what the scene graph holds.
  const walk=(o,path)=>{
    if(!o.visible){ o.traverse(x=>{ if(x.isLight) hidden++; }); return; }
    if(o.isLight){ counted++;
      const kind=o.isPointLight?'point':o.isSpotLight?'spot':o.isDirectionalLight?'dir':o.isHemisphereLight?'hemi':'other';
      const k=kind+' @ '+path; out[k]=(out[k]||0)+1; }
    for(const c of (o.children||[])) walk(c, path+'/'+(c.name||c.type));
  };
  walk(root,'scene');
  return { counted, hidden, byPlace:out }; })()`;

// The census above reads ONE scene at ONE moment, and neither is enough on its own: the frame renders several times
// (composer, the portal's second pass, the scope RT, the inventory mannequin, a monitor) and some of those pass a
// DIFFERENT scene. If a program key's moving field really is a light count, then some render call must be seeing a
// different number of lights — so tally the count three would compute, per render call, and report the distinct values.
// If every call reports the same number while the program count climbs, the moving field is not lights and A1 is dead.
const HOOK = `(()=>{ const r=__PW.renderer; if(r.__lightTally) return 'already';
  const tally=new Map(); r.__lightTally=tally;
  const count=(root)=>{ let n=0; const walk=o=>{ if(!o.visible) return; if(o.isLight) n++;
    for(const c of (o.children||[])) walk(c); }; walk(root); return n; };
  const orig=r.render.bind(r);
  r.render=function(sc,cam){ try{ const k=count(sc)+' lights, scene '+(sc.name||sc.type)+(sc===__PW.scene?' (world)':' (other)');
      tally.set(k,(tally.get(k)||0)+1); }catch(e){} return orig(sc,cam); };
  return 'hooked'; })()`;
const TALLY = `(()=>{ const t=__PW.renderer.__lightTally; if(!t) return {err:'not hooked'};
  const o={}; for(const [k,v] of t) o[k]=v; return o; })()`;

const WALK = (n) => `(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(r));
  // Real input flags, never __hcBR.tp: a teleport forces six streamChunks in one frame and manufactures a fake
  // multi-second frame, which is the mistake the resume file retracted.
  try{ __hc.key('w',true); }catch(e){}
  for(let i=0;i<${n};i++) await f();
  try{ __hc.key('w',false); }catch(e){}
  return true; })()`;

(async () => {
  console.log('probe: ' + ensureProbe(ROOT));
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'mp-server.js')], { cwd: ROOT, env: { ...process.env, MP_PORT: String(port), MP_DISC: String(port + 1) }, stdio: 'ignore' });
  try {
    const base = 'http://127.0.0.1:' + port;
    await waitHttp(base + '/index.html');
    const browser = await chromium.launch({ executablePath: findBrowser(), headless: true,
      args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
             '--disable-background-timer-throttling', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 180)));
    const ev = async (js) => { try { return await page.evaluate(js); } catch (e) { return { err: String(e.message || e).slice(0, 150) }; } };

    await page.goto(base + '/index.html?perf=1&debug=1&rd=8', { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', null, { timeout: 90000 });
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', null, { timeout: 90000 });
    await sleep(7000);
    await ev('__hc.cmdRun("/gamemode creative")'); await ev('__hc.setTime(0.42)');
    await ev('window.__benchInfo=1');
    await ev('__hcPERF.arm()');

    const before = await ev(KEYS);
    const s0 = await ev(STATE);
    const l0 = await ev(LIGHTS);
    console.log('before: ' + J(s0) + '  lights counted=' + l0.counted + ' hidden=' + l0.hidden);

    console.log('hook:   ' + J(await ev(HOOK)));
    await ev(WALK(FRAMES));
    console.log('\nLIGHT COUNT PER RENDER CALL (distinct values seen over the window):');
    const tally = await ev(TALLY);
    for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log('  ' + String(v).padStart(5) + ' calls   ' + k);

    const after = await ev(KEYS);
    const s1 = await ev(STATE);
    const l1 = await ev(LIGHTS);
    console.log('after:  ' + J(s1) + '  lights counted=' + l1.counted + ' hidden=' + l1.hidden);
    console.log('\nLIGHTS THAT APPEARED (three counts these, so each one is a program key):');
    const places = new Set([...Object.keys(l0.byPlace||{}), ...Object.keys(l1.byPlace||{})]);
    for (const p of [...places].sort()) { const a = (l0.byPlace||{})[p] || 0, b = (l1.byPlace||{})[p] || 0;
      if (a !== b) console.log('  ' + String(a).padStart(3) + ' -> ' + String(b).padStart(3) + '   ' + p); }

    if (before.err || after.err) { console.log('PROBE ERROR ' + J(before) + ' ' + J(after)); }
    else {
      const seen = new Set(before);
      const fresh = after.filter(k => !seen.has(k));
      console.log('\nprograms ' + before.length + ' -> ' + after.length + ', NEW ' + fresh.length +
                  ' (chunks meshed ' + s0.meshed + ' -> ' + s1.meshed + ')');
      // Group by shader name so the answer is readable, and print the numeric light fields for each group: those are
      // the fields A1 would move, so their spread across the new keys IS the verdict on A1.
      const grp = new Map();
      for (const k of fresh) {
        const name = (k.match(/^([A-Za-z0-9_]+)/) || ['?', '?'])[1];
        const lights = (k.match(/\b\d+\b/g) || []).slice(0, 8).join('/');
        const key = name;
        if (!grp.has(key)) grp.set(key, []);
        grp.get(key).push(lights);
      }
      for (const [name, list] of [...grp].sort((a, b) => b[1].length - a[1].length)) {
        const uniq = [...new Set(list)];
        console.log('  ' + String(list.length).padStart(3) + '  ' + name +
                    '   distinct numeric signatures: ' + uniq.length + (uniq.length <= 4 ? '  [' + uniq.join(' | ') + ']' : ''));
      }
      console.log('\nsample NEW keys:');
      for (const k of fresh.slice(0, 6)) console.log('  ' + k.slice(0, 220));
    }
    // THE HALLS ARM. If the overworld renders at 19 point lights and the halls at 44, then every lit material in the
    // game is linked TWICE — once per count — and the second set lands on whichever frame first renders the halls.
    // That is one number away from being the whole of Ben's reports 1 and 2, so it is worth asking outright.
    await ev('(()=>{ __PW.renderer.__lightTally.clear(); return 1; })()');
    const pIn0 = (await ev(STATE)).progs;
    await ev('__hcBR.enter()');
    await ev(WALK(120));
    const pIn1 = (await ev(STATE)).progs;
    console.log('\nINSIDE THE HALLS — programs ' + pIn0 + ' -> ' + pIn1);
    const tIn = await ev(TALLY);
    for (const [k, v] of Object.entries(tIn).sort((a, b) => b[1] - a[1])) console.log('  ' + String(v).padStart(5) + ' calls   ' + k);
    const lIn = await ev(LIGHTS);
    console.log('\nWHERE THE LIGHTS ARE  (outside -> inside), so the count becomes a place in the code:');
    const pl = new Set([...Object.keys(l0.byPlace || {}), ...Object.keys(lIn.byPlace || {})]);
    for (const k of [...pl].sort()) console.log('  ' + String((l0.byPlace || {})[k] || 0).padStart(3) + ' -> ' +
      String((lIn.byPlace || {})[k] || 0).padStart(3) + '   ' + k);
    console.log('page errors: ' + (errs.length ? errs.slice(0, 6).join(' | ') : 'none'));
    await browser.close();
  } catch (e) { console.log('HARNESS ERROR: ' + (e && e.stack || e)); }
  finally { try { server.kill(); } catch (e) {} process.exit(0); }
})();
