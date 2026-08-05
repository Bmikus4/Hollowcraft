// DOES THE VOXEL SLAB STEP THROUGH A ROOM, AND IS "4 FIXTURES BELOW THEIR ROOM'S FLOOR" A BUG OR THE PROBE?
//
// br-storey.mjs asks whether a column's carpet sits at its own CHUNK's base — a stale-slab question. This asks the
// other one: whether a ROOM's footprint covers columns that the carve slabs at different heights, which is the
// diagnosis behind Ben's "some rooms also have a roof/ceiling halfway in them".
//
// Both questions have been answered with the wrong field before, so the right one is stated up front: it is r.fy.
// brxUnion sets `r.fy = BR_WY0 + dy`, dy being the storey offset of the chunk that GENERATED the room, so a room
// already knows its own floor in world space. An earlier attempt derived the floor as `r.ceil - BR_CH` and produced
// dozens of non-integer bases, because rooms have VARIED ceiling heights (see _roomCeil) — that derivation is wrong and
// every verdict from it was worthless.
//
// Q1, the carve: for every loaded room, evaluate the carve's own FLOOR (brxChunkBaseY of the column's chunk, which is
// what brSlabColumn uses) across the room's whole footprint. More than one value, or one value that disagrees with the
// room's own r.fy, means that room is carpeted or lidded at a height it does not belong to.
//
// Q2, the fixtures: br-lights heights() flags them using brxRoomAt, which is 2D and returns the FIRST rectangle
// containing x,z — with storeys stacked that need not be the room the fixture is in. Fixtures carry f.room, a rebased
// index into BR.rooms, which is the authoritative link. Resolve through that instead and compare against that room's
// own fy and ceil.
//
// usage: node bench/br-room-storey.mjs      (HC_ROOT=<pinned tree>, BR_SEED=<n> to pin the maze)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = process.env.HC_ROOT || 'D:/code/Minecraft';
const REPO = 'D:/code/Minecraft';
const SEED = process.env.BR_SEED || '';

function ensureProbe(root) {
  const f = path.join(root, 'index.html');
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('window.__RS=')) return 'already patched';
  if (path.resolve(root).toLowerCase() === path.resolve(REPO).toLowerCase())
    throw new Error('refusing to patch the shared checkout — pin a tree and set HC_ROOT');
  const a = 'PERF.T = T; PERF.TID = TID; PERF.TN = TN;';
  if (!s.includes(a)) throw new Error('probe anchor missing');
  const probe = '\nwindow.__RS={'
    + ' rooms(){ return (BR.rooms||[]).map(r=>({id:r.id,x0:r.x0,x1:r.x1,z0:r.z0,z1:r.z1,fy:r.fy,ceil:r.ceil,baseY:(r.baseY==null?null:r.baseY)})); },'
    + ' fixtures(){ return (BR.fixtures||[]).map(f=>({x:f.x,z:f.z,y:f.y,room:f.room,dead:!!f.dead})); },'
    + ' colBase(x,z){ const c=brxChunkOf(x,z); return BR.levels?brxChunkBaseY(c.gx,c.gz):BR_FLOOR; },'
    + ' chunkOf(x,z){ const c=brxChunkOf(x,z); return c.gx+"_"+c.gz; },'
    + ' consts(){ return { CH:BR_CH, WY0:BR_WY0, FLOOR:BR_FLOOR, levels:!!BR.levels, seed:BR.seed>>>0 }; } };'
    + '   // BENCH PROBE (br-room-storey.mjs), pinned trees only';
  fs.writeFileSync(f, s.replace(a, a + probe));
  return 'patched';
}

const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = (u) => new Promise((res, rej) => { const t0 = Date.now();
  (function poll(){ const q = http.get(u, r => { r.resume(); res(); }); q.on('error', () => { Date.now() - t0 > 15000 ? rej(new Error('down')) : setTimeout(poll, 250); }); })(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const findBrowser = () => ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));

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
    const ev = async (js) => { try { return await page.evaluate(js); } catch (e) { return { err: String(e.message || e).slice(0, 200) }; } };
    const frames = (n) => ev(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(r)); for(let i=0;i<${n};i++) await f(); return 1; })()`);

    await page.goto(base + '/index.html?debug=1&rd=8' + (SEED ? '&brseed=' + SEED : ''), { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', null, { timeout: 90000 });
    await sleep(6000);
    await ev('__hcBR.enter()');
    await frames(120);

    // SEEDS ARE SWEPT WITH __hcBR.seed(), NOT WITH ?brseed. The query form did not reach BR.seed here: three runs at
    // three different ?brseed values all reported seed 99991 with an identical 73 rooms and 196 fixtures, which is one
    // maze measured three times and has no discriminating power at all. __hcBR.seed() clears both caches and re-streams,
    // which is the mechanism br-storey.mjs already uses, and it sweeps in ONE browser.
    const seeds = SEED ? [Number(SEED)] : [99991, 1234567, 31337, 4242];
    for (const s of seeds) {
      if (seeds.length > 1 || SEED) { await ev('__hcBR.seed(' + s + ')'); await frames(90); }

    // Real input flag, never __hcBR.tp: a teleport forces six streamChunks in one frame. Walking is what loads enough
    // BRX chunks for stacked storeys to appear at all.
    await ev(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(r)); __hc.key('w',true);
      for(let i=0;i<420;i++) await f(); __hc.key('w',false); return 1; })()`);
    await frames(60);

    console.log('\n================ seed asked for: ' + s + ' ================');
    const consts = await ev('__RS.consts()');
    const rooms = await ev('__RS.rooms()');
    const fixtures = await ev('__RS.fixtures()');
    if (rooms.err || fixtures.err || consts.err) { console.log('PROBE ERROR ' + JSON.stringify({ rooms, fixtures, consts })); }
    else {
      console.log('consts: ' + JSON.stringify(consts));
      const fys = [...new Set(rooms.map(r => r.fy))].sort((a, b) => a - b);
      console.log('rooms ' + rooms.length + ', fixtures ' + fixtures.length + ', distinct room floors (r.fy) ' + JSON.stringify(fys));

      // ---- Q1. Sample every 4 blocks plus the far edge, so a room cannot slip between samples.
      const pts = rooms.map(r => {
        const xs = [], zs = [];
        for (let x = Math.floor(r.x0); x < r.x1; x += 4) xs.push(x);
        xs.push(Math.ceil(r.x1) - 1);
        for (let z = Math.floor(r.z0); z < r.z1; z += 4) zs.push(z);
        zs.push(Math.ceil(r.z1) - 1);
        return { id: r.id, fy: r.fy, xs, zs };
      });
      const straddle = await ev(`(()=>{ const P=${JSON.stringify(pts)}, out=[];
        for(const p of P){ const seen={}, chunks={};
          for(const x of p.xs) for(const z of p.zs){ const b=__RS.colBase(x,z); seen[b]=(seen[b]||0)+1; chunks[__RS.chunkOf(x,z)]=1; }
          const bases=Object.keys(seen).map(Number).sort((a,b)=>a-b);
          const split = bases.length>1;
          // r.fy IS THE CARVE BASE PLUS ONE, BY DESIGN, and comparing them directly reports every room in the maze as
          // broken. brxChunkBaseY is BR_FLOOR + level*BR_CH = 40 + dy and names the CARPET BLOCK; r.fy is BR_WY0 + dy
          // = 41 + dy and names the surface you stand on, which is the top of that block. The difference is the block.
          const off = bases.length===1 && Math.abs((bases[0]+1)-p.fy)>0.001;
          if(split||off) out.push({ id:p.id, roomFloor:p.fy, carveBases:bases, chunksTouched:Object.keys(chunks).length,
                                    kind:(split?'SPLIT ACROSS STOREYS':'whole room on the wrong storey') }); }
        return out; })()`);
      const split = straddle.err ? [] : straddle.filter(s => s.kind[0] === 'S');
      const off = straddle.err ? [] : straddle.filter(s => s.kind[0] !== 'S');
      console.log('\nQ1 — rooms whose carve disagrees with the room\'s own floor: ' + (straddle.err ? straddle.err : straddle.length)
                  + '  (split across storeys ' + split.length + ', whole room on the wrong storey ' + off.length + ')');
      if (!straddle.err) for (const s of straddle.slice(0, 8)) console.log('  ' + JSON.stringify(s));

      // ---- Q2. Resolve through f.room, the authoritative link.
      const byId = new Map(rooms.map(r => [r.id, r]));
      let noRoom = 0; const below = [], above = [];
      for (const f of fixtures) {
        if (f.y == null) continue;
        const r = (f.room == null) ? null : byId.get(f.room);
        if (!r) { noRoom++; continue; }
        if (f.y < r.fy) below.push({ at: [f.x, f.z], y: +f.y.toFixed(1), roomFloor: r.fy, roomCeil: r.ceil, room: f.room });
        else if (f.y > r.ceil + 0.001) above.push({ at: [f.x, f.z], y: +f.y.toFixed(1), roomFloor: r.fy, roomCeil: r.ceil, room: f.room });
      }
      console.log('\nQ2 — fixtures resolved through f.room:  below their room floor ' + below.length
                  + ', above their ceiling ' + above.length + ', room unresolved ' + noRoom + ', of ' + fixtures.length);
      for (const b of below.slice(0, 6)) console.log('  BELOW ' + JSON.stringify(b));
      for (const a of above.slice(0, 6)) console.log('  ABOVE ' + JSON.stringify(a));

      // ---- Q3: a room TALLER THAN ITS STOREY. Rooms have varied ceilings (_roomCeil), and the storey pitch is BR_CH,
      // so a room whose ceiling reaches its own floor + BR_CH has the NEXT storey's carpet slab inside it — a floor
      // plane crossing the room partway up, which is what "some rooms also have a roof/ceiling halfway in them (top
      // level)" describes. The carve cannot express two storeys in one column, so this is not fixable by moving the
      // storey onto the room; it is a generator constraint, and the number says whether it is live.
      const tall = rooms.filter(r => r.ceil != null && r.fy != null && (r.ceil - r.fy) >= consts.CH - 1)
        .map(r => ({ id: r.id, fy: r.fy, ceil: r.ceil, height: +(r.ceil - r.fy).toFixed(2) }));
      const hs = rooms.filter(r => r.ceil != null && r.fy != null).map(r => +(r.ceil - r.fy).toFixed(2));
      console.log('\nQ3 — room heights (ceil - fy): min ' + Math.min(...hs) + ', max ' + Math.max(...hs)
                  + ', storey pitch BR_CH ' + consts.CH + '; rooms reaching the next storey\'s slab: ' + tall.length);
      for (const t of tall.slice(0, 6)) console.log('  TALL ' + JSON.stringify(t));

      console.log('\nVERDICT');
      console.log('  Q1 carve-vs-room: ' + (straddle.err ? 'UNKNOWN — ' + straddle.err : (straddle.length === 0
        ? 'every room is slabbed at exactly its own floor; the carve does NOT step through rooms'
        : straddle.length + ' rooms are slabbed at a height their own floor disagrees with')));
      console.log('  Q2 fixtures:      ' + ((below.length + above.length) === 0
        ? 'every fixture sits inside the room that owns it — "4 below their floor" was brxRoomAt\'s 2D first match'
        : (below.length + above.length) + ' fixtures really are outside the room that owns them'));
    }
    }   // end seed sweep
    await browser.close();
  } catch (e) { console.log('HARNESS ERROR: ' + (e && e.stack || e)); }
  finally { try { server.kill(); } catch (e) {} process.exit(0); }
})();
