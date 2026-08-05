// THE WORLDEDIT PENCIL (Ben 08-04): "Left/right click marks two opposite corners of a cuboid selection and speaks the
// coordinates in chat; chat accepts terminal messages typed without a `/`; plus basic worldedit commands (set / replace /
// walls / clear) over the selection."
//
// Every claim here is checked by reading the WORLD back, not by trusting the message the command printed. The one that matters
// most is that a marking click does not also mine or place: the pencil aims at a block to mark it, so a branch in the wrong
// order would destroy the thing it was pointing at, and the selection would still look correct in the log.
//
// usage: node bench/assert-worldedit.mjs   [HC_PAGE=index.qa.html]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/code/Minecraft';
const PAGE = process.env.HC_PAGE || 'index.html';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

(async()=>{
  const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null, bad=0;
  const say=(ok,msg,extra)=>{ console.log((ok?'ok   ':'FAIL ')+msg+(ok||extra===undefined?'':'   '+JSON.stringify(extra))); if(!ok) bad++; };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/'+PAGE+'?debug=1&rd=10',{waitUntil:'load',timeout:90000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(4000);
    await pg.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});

    // ---- 1. THE ITEM EXISTS AND IS OBTAINABLE ----
    // ITEMS, RECIPES and the selection are all module scope, so everything here goes through __hc probes rather than reaching
    // into the page — an earlier version of this bench referenced ITEMS directly and died on ReferenceError.
    const info=await pg.evaluate('__hc.we()');
    say(!!(info&&info.item), 'the WorldEdit Pencil is a registered item', info);
    if(info&&info.item){ say(info.item.we===true, 'it carries the we flag the click paths test for', info.item);
              say(info.recipes>0, 'and it has a recipe, so it is not creative-only', {recipes:info.recipes}); }

    // ---- 2. A MARKING CLICK MARKS, AND DOES NOT MINE OR PLACE ----
    // Build a small stone shell to click on, at absolute coordinates on a floor the player is standing on, so nothing here
    // depends on where worldgen put a hill.
    const spot=await pg.evaluate('(()=>{ const p=__hc.probe(); return {x:Math.round(p.x), y:118, z:Math.round(p.z)}; })()');
    // The floor spans the whole working area, because the player has to WALK (teleport) to each corner to mark it: a mark is a
    // raycast at the block, and the reach is a few blocks — the first version of this bench put corner 2 eight blocks away, got
    // a null hit, and the pencil correctly answered "you are pointing at sky".
    for(let dx=-2;dx<=8;dx++) for(let dz=-2;dz<=8;dz++)
      await pg.evaluate('__hc.cmdRun("/setblock '+(spot.x+dx)+' '+(spot.y-1)+' '+(spot.z+dz)+' stone")');
    await sleep(500);
    await pg.evaluate(`__hc.tpExact(${spot.x},${spot.z},${spot.y})`); await sleep(1200);

    // Two marker blocks 4 apart, and the camera aimed at each in turn.
    const A={x:spot.x+2, y:spot.y, z:spot.z+2}, Bc={x:spot.x+5, y:spot.y+2, z:spot.z+5};   // 4 x 3 x 4 = 48 cells
    for(const c of [A,Bc]) await pg.evaluate(`__hc.cmdRun("/setblock ${c.x} ${c.y} ${c.z} stone")`);
    await sleep(400);
    const held=await pg.evaluate('__hc.hold("we_pencil")');
    say(held && held.held==='we_pencil', 'the pencil is in hand', held);

    await pg.evaluate(`__hc.tpExact(${A.x-1},${A.z-1},${A.y+1})`); await sleep(900);
    await pg.evaluate(`__hc.look(${A.x}+0.5,${A.y}+0.5,${A.z}+0.5)`); await sleep(200);
    const m1=await pg.evaluate('__hc.breakHeld()');
    await sleep(200);
    const aStill=await pg.evaluate(`__hc.blockAt(${A.x},${A.y},${A.z})`);
    say(aStill!==0, 'the left-click MARK did not mine the block it marked', {blockAt:aStill, aim:m1.aim});

    await pg.evaluate(`__hc.tpExact(${Bc.x-1},${Bc.z-1},${Bc.y+1})`); await sleep(900);
    await pg.evaluate(`__hc.look(${Bc.x}+0.5,${Bc.y}+0.5,${Bc.z}+0.5)`); await sleep(200);
    const m2=await pg.evaluate('__hc.useHeld()');
    say(!!m2, 'the right-click mark ran', m2);
    await sleep(200);
    const sel=await pg.evaluate('__hc.cmdRun("/sel")');
    const selTxt=String((sel&&sel.out||[]).join(' '));
    console.log('  /sel says: '+selTxt.split(String.fromCharCode(10)).join(' | '));
    const st=await pg.evaluate('__hc.we()');
    say(!!(st.a&&st.b), 'both corners are marked', {a:st.a,b:st.b});
    // The box between (x+3,y,z+3) and (x+6,y+2,z+6) is 4 x 3 x 4 = 48 cells.
    say(!!st.box && st.box.w===4 && st.box.h===3 && st.box.d===4 && st.box.n===48, 'the selection is the cuboid between the two marks (4x3x4 = 48)', st.box);
    say(/corner 1/.test(selTxt) && /corner 2/.test(selTxt), 'and /sel speaks the coordinates', selTxt.slice(0,120));

    // ---- 3. /set, READ BACK OUT OF THE WORLD ----
    const setOut=await pg.evaluate('__hc.cmdRun("/set planks")');
    await sleep(900);
    const filled=await pg.evaluate(`__hc.countBox([${A.x},${A.y},${A.z}],[${Bc.x},${Bc.y},${Bc.z}],['planks'])`);
    console.log('  /set: '+JSON.stringify(setOut&&setOut.out));
    say(filled.byName.planks===filled.total, 'every cell in the selection is now planks', filled);

    // ---- 4. /replace ONLY TOUCHES THE MATCHING BLOCK ----
    // One cell is turned to stone first, so a /replace of planks must leave exactly that one alone.
    await pg.evaluate(`__hc.cmdRun("/setblock ${A.x} ${A.y} ${A.z} stone")`); await sleep(300);
    const repOut=await pg.evaluate('__hc.cmdRun("/replace planks cobble")');
    await sleep(900);
    const rep=await pg.evaluate(`__hc.countBox([${A.x},${A.y},${A.z}],[${Bc.x},${Bc.y},${Bc.z}],['planks','cobble','stone'])`);
    console.log('  /replace: '+JSON.stringify(repOut&&repOut.out));
    say(rep.byName.planks===0 && rep.byName.cobble===47 && rep.byName.stone===1, 'replace swapped the 47 planks and left the one stone alone', rep.byName);

    // ---- 5. /walls IS THE FOUR VERTICAL FACES, NOT A HOLLOW BOX ----
    await pg.evaluate('__hc.cmdRun("/set air")'); await sleep(700);
    const wallOut=await pg.evaluate('__hc.cmdRun("/walls stone")');
    await sleep(900);
    const walls=await pg.evaluate(`__hc.countBox([${A.x},${A.y},${A.z}],[${Bc.x},${Bc.y},${Bc.z}],[])`);
    console.log('  /walls: '+JSON.stringify(wallOut&&wallOut.out));
    say(walls.edgeSolid===walls.edgeTotal, 'every cell on the four vertical faces is filled', walls);
    say(walls.innerSolid===0, 'and the inside is left open - walls, not a solid block or a closed box', walls);

    // ---- 6. /clear EMPTIES IT ----
    const clrOut=await pg.evaluate('__hc.cmdRun("/clear")');
    await sleep(900);
    const cleared=(await pg.evaluate(`__hc.countBox([${A.x},${A.y},${A.z}],[${Bc.x},${Bc.y},${Bc.z}],[])`)).solid;
    console.log('  /clear: '+JSON.stringify(clrOut&&clrOut.out));
    say(cleared===0, 'the selection is empty', {solidLeft:cleared});

    // ---- 7. NO LEADING SLASH ----
    // runCommand strips one leading slash before it looks the name up, so this is the same code path — which is the point:
    // there is no second parser to disagree with the first.
    const noSlash=await pg.evaluate('__hc.cmdRun("set stone")');
    await sleep(900);
    const bare=await pg.evaluate(`__hc.countBox([${A.x},${A.y},${A.z}],[${Bc.x},${Bc.y},${Bc.z}],['stone'])`);
    console.log('  bare "set stone": '+JSON.stringify(noSlash&&noSlash.out));
    say(bare.byName.stone===bare.total, 'a command typed WITHOUT a leading slash runs', bare.byName);

    // ---- 8. THE CAP REFUSES A SILLY SELECTION ----
    // A typo in three coordinates is a likelier way to ask for 200k cells than any real build, and 200k setBlockWorld calls
    // would lock the frame for minutes.
    await pg.evaluate('__hc.we([0,1,0],[80,60,80])');
    const big=await pg.evaluate('__hc.cmdRun("/set stone")');
    const bigTxt=String((big&&big.out||[]).join(' '));
    say(/limit/.test(bigTxt), 'an oversized selection is refused instead of freezing the game', bigTxt.slice(0,140));

    // ---- 9. AND IT CLEARS ----
    await pg.evaluate('__hc.cmdRun("/sel clear")');
    const c3=await pg.evaluate('__hc.cmdRun("/set stone")');
    say(/no selection/.test(String((c3&&c3.out||[]).join(' '))), 'with no selection the commands say so rather than acting', String((c3&&c3.out||[]).join(' ')).slice(0,100));

  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
  console.log(bad?('FAILED '+bad):'PASS');
  if(bad) process.exitCode=1;
})().catch(e=>{ console.error(e); process.exit(1); });
