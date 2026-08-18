// DROPS, EATING, SWIMMING AND VOICE, WITH TWO REAL CLIENTS ON ONE RELAY.
//
// All four have replication written and none of it had ever been RUN across the wire. That is the whole reason this
// file exists and is the one exception to the no-benches rule: a single client cannot tell a message that was sent
// from a message that was delivered, and the relay's ALLOWED list has silently eaten six message types with both
// ends reporting success — 'flare', 'eyeSeal' and 'storm' were found by reading it, not by playing.
//
// SHAPE COPIED FROM assert-girl-coop.mjs: one relay, two headless clients, the host does something and the GUEST is
// asked what it can see. Every check reads the far side; nothing here trusts the sender.
//
// WHAT CANNOT BE ASSERTED HERE, written down so a reader does not think it was covered: voice PLAYBACK. Scheduling a
// frame needs a running AudioContext and that needs a user gesture, which a headless page has no way to make. So the
// voice check is the WIRE — frames leaving A and arriving at B — which is the half the relay owns and the half that
// has actually been broken. VOICE.rx counts arrivals before the playback gate for exactly this reason.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
async function boot(b, base, tag){
  const p=await (await b.newContext({viewport:{width:800,height:450}})).newPage();
  p.on('pageerror',e=>console.log(tag+' PAGEERROR:',String(e.message).slice(0,160)));
  await p.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
  await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
  await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
  await p.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative')");
  return p;
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:['ignore','pipe','pipe']});
  // THE RELAY'S OWN STDOUT IS PART OF THE MEASUREMENT. It prints a line the first time it drops an unknown message
  // type, so a type this test forgot to add to ALLOWED shows up as a named cause instead of a silent failure.
  const relayLog=[]; server.stdout.on('data',d=>{ const s=String(d); relayLog.push(s.trim()); if(/DROPPED/.test(s)) console.log('RELAY:',s.trim()); });
  server.stderr.on('data',d=>relayLog.push(String(d).trim()));
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const A=await boot(b,base,'A'), B=await boot(b,base,'B');
    const ws='ws://127.0.0.1:'+port;
    await A.evaluate(u=>__hc.mpConnect(u), ws); await sleep(2000);
    await B.evaluate(u=>__hc.mpConnect(u), ws); await sleep(3500);
    const na=await A.evaluate("__hc.netInfo()"), nb=await B.evaluate("__hc.netInfo()");
    console.log('A', JSON.stringify(na)); console.log('B', JSON.stringify(nb));
    T('both clients are on the relay', na.on===true && nb.on===true, {a:na.on,b:nb.on});
    T('and each can see the other', (na.peers||0)>=1 && (nb.peers||0)>=1, {a:na.peers,b:nb.peers});

    // PUT THEM IN THE SAME PLACE. Every check below is about what B can see of A, and an avatar 400 blocks away is
    // streamed but not meaningful — the drop test in particular needs both clients to have the cell loaded.
    const pa=await A.evaluate("__hc.pos()");
    await B.evaluate(`__hc.tp(${pa.x+2}, ${pa.y}, ${pa.z}, 0, 0)`);
    await sleep(2500);

    // ---- 1. A DROP THROWN BY A EXISTS ON B ----------------------------------------------------------------------
    const dA0=await A.evaluate("__hc.dropsHere()"), dB0=await B.evaluate("__hc.dropsHere()");
    await A.evaluate("__hc.dropAt('diamond',3,0,-2)"); await sleep(2500);
    const dA1=await A.evaluate("__hc.dropsHere()"), dB1=await B.evaluate("__hc.dropsHere()");
    console.log('drops A', dA0.entities+' -> '+dA1.entities, ' B', dB0.entities+' -> '+dB1.entities);
    T('the thrower has the drop', dA1.entities>dA0.entities, {before:dA0.entities,after:dA1.entities});
    T('and so does the other client', dB1.entities>dB0.entities, {before:dB0.entities,after:dB1.entities});
    const gotIt=(dB1.rows||[]).some(d=>d.id==='diamond');
    T('as the same item', gotIt, {sawIds:[...new Set((dB1.rows||[]).map(d=>d.id))].slice(0,6)});

    // ---- 2. EATING READS ON THE PEER ---------------------------------------------------------------------------
    // `ea` is on the player packet and the avatar eases it into an arm raise. B is asked for the value it received
    // WHILE A is chewing, so a zero here is a wire fault and not a timing one — the window is a whole second.
    await A.evaluate("(()=>{__hc.cmdRun('/clearinv'); __hc.giveItem('bread',4); __hc.hold('bread'); __hc.hungerSet(6);})()"); await sleep(1200);
    let eatPeak=0, eatRows=[];
    console.log('eat started:', JSON.stringify(await A.evaluate("__hc.eatNow()")));
    for(let i=0;i<14;i++){ await sleep(140);
      const r=await B.evaluate("__hc.mpPeers()");
      const pr=(r.peers||[])[0]; if(pr){ eatRows.push(pr.ea); if(pr.ea>eatPeak) eatPeak=pr.ea; } }
    console.log('eat on the peer, samples:', JSON.stringify(eatRows));
    T('the other client sees the eat animation run', eatPeak>0.05, {peak:eatPeak});

    // ---- 3. SWIMMING READS ON THE PEER -------------------------------------------------------------------------
    // `sw` is the same shape. A is put in the sea and made to push, because p.swimming is "in water, off the bottom
    // and actually moving" — a client standing in the shallows is wet and is not swimming, and asserting on `sw`
    // without moving would fail for the right reason and read as a wire fault.
    // DEEP water, not the shoreline. swimProbe reports sea level 40, and the first version of this looked for a column
    // whose ground was at or under 42 — which is LAND two blocks above the waterline. The second problem is the same
    // one from the other side: a seabed at 38 gives two blocks of water, which is wading, and p.swimming is
    // deliberately false for a body whose knees are damp. So: a seabed at 34 or lower, entered at 38.
    const sea=await A.evaluate(`(()=>{ const P=__hc.pos(); for(let r=10;r<300;r+=8) for(let a=0;a<12;a++){
        const x=Math.round(P.x+Math.cos(a*0.5236)*r), z=Math.round(P.z+Math.sin(a*0.5236)*r);
        if(__hc.groundY(x,z) <= 34) return {x,z,g:__hc.groundY(x,z)}; } return null; })()`);
    console.log('sea found at', JSON.stringify(sea));
    let swimPeak=0;
    if(sea){
      // SEA LEVEL IS 40 (swimProbe reports it), so the swimmer goes IN the water rather than over it — the first run
      // of this put A at y 46, which is six blocks of air, and read the resulting zero as a wire fault.
      await A.evaluate(`(()=>{ __hc.cmdRun('/fly off'); __hc.tp(${sea.x}+0.5, 38.5, ${sea.z}+0.5, 0, 0); })()`);
      await sleep(3000);
      // SPACE AS WELL AS W, and that is the third thing this took to get right: dropped into deep water the swimmer
      // SINKS to the seabed and stands on it, and p.swimming is deliberately false for a body with its feet down —
      // "a body that goes horizontal the moment its knees are damp is the bug this gate exists to avoid". Space is
      // what lifts them off the bottom to the float point; W is what makes it a stroke rather than treading.
      await A.keyboard.down('Space'); await sleep(1400);
      await A.keyboard.down('w');
      let ownPeak=0, ctl=[];
      for(let i=0;i<18;i++){ await sleep(200);
        const sp=await A.evaluate("__hc.swimProbe()").catch(()=>null);
        if(sp){ if(sp.swimming) ownPeak=1; if(i<4) ctl.push({sw:sp.swimming,og:sp.onGround,y:sp.y,w:sp.keysW}); }
        const r=await B.evaluate("__hc.mpPeers()"); const pr=(r.peers||[])[0];
        if(pr && pr.sw>swimPeak) swimPeak=pr.sw; }
      await A.keyboard.up('w'); await A.keyboard.up('Space');
      console.log('swim control samples', JSON.stringify(ctl));
      const own=await A.evaluate("__hc.swimProbe()").catch(()=>null);
      console.log('swim: peer saw sw peak', swimPeak, ' swimmer own state', JSON.stringify(own));
      // THE POSITIVE CONTROL, and it has to be here: if the swimmer is not swimming, a zero on the peer is this
      // harness failing to get into the water and says nothing about replication.
      T('the swimmer is actually swimming (control)', ownPeak===1, {inWater:own&&own.inWater, y:own&&own.y});
    }
    T('the other client sees the swim stroke', swimPeak>0.05, {peak:swimPeak, sea:!!sea});

    // ---- 4. VOICE CROSSES THE WIRE ------------------------------------------------------------------------------
    // 'va' is the only continuous type the game sends and the only one that had no way to be checked at all: a
    // headless page cannot play a frame, so arrival was indistinguishable from the relay eating it.
    const vB0=await B.evaluate("__hc.voiceWire()");
    const vsend=await A.evaluate("__hc.voiceTestSend(12)");
    await sleep(1500);
    const vB1=await B.evaluate("__hc.voiceWire()"), vA1=await A.evaluate("__hc.voiceWire()");
    console.log('voice: A sent', vsend, ' A meter', JSON.stringify(vA1), ' B rx', vB0.rx+' -> '+vB1.rx);
    T('the frames leave the sender', (vA1.sent|0)>=12, {sent:vA1.sent});
    T('and arrive at the other client', (vB1.rx|0)-(vB0.rx|0) >= 10, {before:vB0.rx, after:vB1.rx});
    T('and they are attributed to the sender', vB1.rxFrom!=null && vB1.rxFrom!==nb.id, {from:vB1.rxFrom, self:nb.id});
    // NOT ASSERTED: playback. Recorded rather than skipped silently.
    console.log('note: B AudioContext is', vB1.ctx, '— playback is not asserted, only delivery');

    // ---- 5. THE WORN CUIRASS, THE CROUCH KNEE AND THE BIPOD, ON A REAL PEER --------------------------------------
    // All three run the same code on a peer that they run on your own body, and none had ever been driven across a
    // wire. po and crouchT say what the packet ASKED for; shell, kneeLx and bipodDeg say whether the rig is in it,
    // which is the difference between a posture arriving and a posture being drawn.
    await A.evaluate("__hc.tp(" + (pa.x) + ", " + (pa.y) + ", " + (pa.z) + ", 0, 0)");
    await sleep(1200);
    const peer=async()=>{ const r=await B.evaluate("__hc.mpPeers()"); return (r.peers||[])[0]||{}; };

    await A.evaluate("__hc.wornArmor('iron_chestplate')"); await sleep(1800);
    const pA=await peer();
    console.log('peer sees chest:', JSON.stringify({shell:pA.shell}));
    T("a peer sees the worn cuirass", pA.shell==='iron_chestplate', {shell:pA.shell});
    await A.evaluate("__hc.wornArmor(null)"); await sleep(900);

    await A.keyboard.down('Control'); await sleep(1800);
    const pC=await peer();
    console.log('peer sees crouch:', JSON.stringify({po:pC.po, crouchT:pC.crouchT, kneeLx:pC.kneeLx}));
    T("a peer sees the crouch posture", pC.po===1, {po:pC.po});
    T("and the peer's knee is folded, not the whole leg", (pC.kneeLx||0)>0.5, {kneeLx:pC.kneeLx});
    await A.keyboard.up('Control'); await sleep(1200);

    await A.evaluate("(()=>{__hc.cmdRun('/clearinv'); __hc.giveItem('chassis_rifle',1); __hc.hold('chassis_rifle');})()");
    await sleep(1200);
    const pB0=await peer();
    await A.evaluate("__hc.proneSet(true)"); await sleep(2600);
    const pB1=await peer();
    console.log('peer sees prone:', JSON.stringify({po:pB1.po, proneT:pB1.proneT, bipodFolded:pB0.bipodDeg, bipodNow:pB1.bipodDeg}));
    T("a peer sees the prone posture", pB1.po===2, {po:pB1.po});
    T("and the peer's bipod has deployed", pB0.bipodDeg!=null && pB1.bipodDeg!=null && pB1.bipodDeg < pB0.bipodDeg-10,
      {folded:pB0.bipodDeg, deployed:pB1.bipodDeg});
    await A.evaluate("__hc.proneSet(false)"); await sleep(900);

    T('the relay dropped no message type during this run', !relayLog.some(l=>/DROPPED/.test(l)),
      relayLog.filter(l=>/DROPPED/.test(l)).slice(0,4));

    await b.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log(fails? ('\n'+fails+' FAILED') : '\nall passed');
  process.exit(fails?1:0);
})();
