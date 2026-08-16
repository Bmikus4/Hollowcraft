// THE ITEM INVENTORY — every item, what it does, what form it takes, and where it comes from.
//
// Ben: "redo the item system", and "add to this list a pass over all items that makes them functional". The first
// deliverable is the inventory, because you cannot redo what you have not enumerated, and nobody has this list.
//
// IT IS BUILT FROM THE CODE AND FROM THE RUNNING GAME, NEVER FROM MEMORY. Two halves:
//   · STATIC — every quoted occurrence of each item id in index.html, tagged with the function that encloses it. An
//     item whose only mentions are its own defItem line and a model dispatch has NO SOURCE: nothing in the world
//     gives it to you. That is the question item 7 is really asking.
//   · LIVE — for every item, the two dispatches that decide whether it exists properly. itemModel is the world, the
//     ground drop, the icon and a peer's hands; the viewmodel is a SECOND dispatch for your own hands, and the
//     buckshot item shipped with a real shell on the ground and a flat sprite in hand while every number said done.
//     __hc.toolSig / __hc.heldSig report both, and `sprite:true` is what a drawn glyph looks like from outside.
//
// WHAT "INERT" MEANS HERE, stated so the list can be argued with: an item is inert if nothing reads it. A block item
// places, a tool has a tool field, a food eats, a gun fires, a spear throws — those are flags a dispatch tests. An
// item with none of them and no id-specific branch anywhere is an item you can hold and do nothing with.
//
//   node tools/item-audit.mjs              # writes docs/ITEM-AUDIT.md and prints the summary
//   node tools/item-audit.mjs --static     # skip the browser (source map only, seconds instead of minutes)
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const SRC=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const LINES=SRC.split('\n');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const STATIC_ONLY=process.argv.includes('--static');

// ---- the enclosing function of every line, so an occurrence can say WHERE it is ----
// A flat scan of `function name(` and `name(...){` at column 0. It is not a parser and does not need to be: the
// question is "which routine mentions this id", and a name that is one nesting level out still answers it.
const owner=new Array(LINES.length).fill('(top level)');
{ let cur='(top level)';
  for(let i=0;i<LINES.length;i++){ const m=/^\s{0,2}(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(LINES[i]);
    if(m) cur=m[1]; else if(/^const\s+([A-Za-z_$][\w$]*)\s*=/.test(LINES[i])) cur=/^const\s+([A-Za-z_$][\w$]*)/.exec(LINES[i])[1];
    owner[i]=cur; } }

// ---- every item id ----
// THE IDS COME FROM THE GAME, NOT FROM THIS FILE. __hc.itemIds() exists for exactly this: the block items are
// defined by a loop over the block table, so a source scan finds the defItem() calls and misses two hundred entries.
// The defItem scan below is the --static fallback only, and it is honest about being partial.
let ids=new Set();
for(const m of SRC.matchAll(/defItem\(\s*'([^']+)'/g)) ids.add(m[1]);

// ---- how a mention is classified ----
// One question per item: is there anything in the world that gives it to you? A recipe, a chest pool, a mob drop and
// a block drop all count as a SOURCE; a model dispatch and its own definition do not.
function classify(fn, line){
  if(/\bshaped\(|\bshapeless\(/.test(line)) return 'craft';
  if(/spawnDrop\(/.test(line))              return 'drop';
  if(/lootChest\(|loot:|pool/i.test(line))  return 'loot';
  if(/\bdrop:\s*'/.test(line))              return 'mine';       // a block that gives this item when broken
  if(/defItem\(|^ITEMS\./.test(line.trim()))return 'def';
  if(/itemModel|setViewItem|_sigModel|icon|MODEL_ITEM_BUILDERS/.test(line)) return 'model';
  return 'code';
}
const SOURCEY=new Set(['craft','loot','drop','mine']);

function scanMentions(idSet){
  const rec={};
  for(const id of idSet) rec[id]={ id, mentions:[], kinds:new Set() };
  for(let i=0;i<LINES.length;i++){
    const L=LINES[i]; if(!L.includes("'")) continue;
    for(const m of L.matchAll(/'([a-z0-9_]+)'/g)){
      const id=m[1]; const r=rec[id]; if(!r) continue;
      const k=classify(owner[i], L);
      r.kinds.add(k);
      if(r.mentions.length<40) r.mentions.push({ line:i+1, fn:owner[i], k, txt:L.trim().slice(0,120) });
    }
  }
  return rec;
}

// ---- the live half ----
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  let live=null, flags=null;
  if(!STATIC_ONLY){
    const { chromium }=await import('playwright-core');
    const port=await freePort();
    const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
    let browser=null;
    try{
      const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
      browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
      const page=await (await browser.newContext({viewport:{width:900,height:520}})).newPage();
      page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,140)));
      await page.goto(base+'/index.html?debug=1&rd=4',{waitUntil:'load',timeout:120000});
      await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
      await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
      await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative');`);
      flags=await page.evaluate(`__hc.itemIds()`);
      if(flags && !flags.err){ ids=new Set(Object.keys(flags)); console.log(`  ${ids.size} items in the live table (the source scan alone finds ${SRC.match(/defItem\(/g).length} defItem calls)`); }
      // BATCHED, because 250 items at one round trip each is minutes of waiting for numbers that are all read off
      // the same frame anyway. heldSig needs the item actually HELD, and __hc.hold mints a fresh stack every call.
      const list=[...ids];
      live={};
      for(let i=0;i<list.length;i+=40){
        const chunk=list.slice(i,i+40);
        const part=await page.evaluate(`(()=>{ const out={};
          for(const id of ${JSON.stringify(chunk)}){
            let w=null, h=null, err=null;
            try{ w=__hc.toolSig(id); }catch(e){ err=String(e.message||e); }
            try{ __hc.hold(id); h=__hc.heldSig(); }catch(e){ h={err:String(e.message||e)}; }
            out[id]={ world:w&&!w.err?{meshes:w.meshes,tris:w.tris,sprite:!!w.sprite}:{err:(w&&w.err)||err},
                      held: h&&!h.err?{meshes:h.meshes,tris:h.tris,sprite:!!h.sprite,id:h.id}:{err:(h&&h.err)||'not held'} };
          } return out; })()`);
        Object.assign(live,part);
        process.stdout.write(`  probed ${Math.min(i+40,list.length)}/${list.length}\r`);
      }
      console.log('');
    }catch(e){ console.log('  LIVE HALF FAILED: '+(e&&e.message||e)); live=null; }
    finally{ try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  }

  // ---- the report ----
  const rec=scanMentions(ids);
  // WHAT MAKES AN ITEM INERT, in one place so the list can be argued with: no flag any dispatch tests, and no
  // mention outside its own definition and the model dispatches. A block item places, a tool has a tool field, a
  // food eats, a gun fires — those are read. An item with none of them is one you can hold and do nothing with.
  const ACTIVE=['block','tool','food','drink','gun','spear','att','book','bible','backrooms','atlas','syringe','ghost','nvg','flashlight','stairs','roof','axial','turn','heal'];
  const rows=[...ids].sort().map(id=>{
    const r=rec[id]; const kinds=[...r.kinds];
    const src=kinds.filter(k=>SOURCEY.has(k));
    const L=live&&live[id], F=flags&&flags[id]||{};
    const act=ACTIVE.filter(k=>F[k]!=null);
    return { id, name:F.name||id, hidden:!!F.hidden, kinds, src, act,
             inert: act.length===0 && !kinds.has('code'),
             world:L?L.world:null, held:L?L.held:null,
             mentions:r.mentions };
  });
  const inert=rows.filter(r=>r.inert && !r.hidden);
  const noSource=rows.filter(r=>r.src.length===0);
  const spriteHeld=rows.filter(r=>r.held&&r.held.sprite);
  const mismatch=rows.filter(r=>r.world&&r.held&&!r.world.err&&!r.held.err&&r.world.sprite!==r.held.sprite);

  const md=[];
  md.push('# THE ITEM INVENTORY');
  md.push('');
  md.push('Generated by `tools/item-audit.mjs`. Do not hand-edit — regenerate it.');
  md.push('');
  md.push('Two questions per item, both answered from the code and the running game rather than from memory:');
  md.push('**where does it come from**, and **does it exist properly in all three forms** (the world/drop/icon');
  md.push('dispatch `itemModel`, and the separate viewmodel dispatch for your own hands).');
  md.push('');
  md.push(`- items: **${rows.length}**`);
  md.push(`- with no source in the world (nothing crafts, loots, drops or mines them): **${noSource.length}**`);
  md.push(`- inert (no flag any dispatch tests, and no id-specific branch): **${inert.length}**`);
  if(live){
    md.push(`- a flat sprite in your own hands: **${spriteHeld.length}**`);
    md.push(`- the two dispatches DISAGREE (real object one side, sprite the other): **${mismatch.length}**`);
  } else md.push('- live half skipped (`--static`)');
  md.push('');
  md.push('## Items with no source');
  md.push('');
  md.push('Nothing in the world gives these to you. That is the finding, not a proposal — a source for each is a');
  md.push("separate decision, and Ben's own words are that they are all meant to be obtainable.");
  md.push('');
  md.push('| item | mentioned in |');
  md.push('|---|---|');
  for(const r of noSource) md.push(`| \`${r.id}\` | ${[...new Set(r.mentions.map(m=>m.fn))].slice(0,6).join(', ')||'nowhere'} |`);
  md.push('');
  if(live){
    md.push('## The two dispatches disagree');
    md.push('');
    md.push('A real object on the ground and a drawn glyph in your hands, or the reverse. This is the class of');
    md.push('half-built item the buckshot shell was, and it is invisible to any check that looks at one view.');
    md.push('');
    md.push('| item | world (drop/icon/peer) | held (viewmodel) |');
    md.push('|---|---|---|');
    for(const r of mismatch) md.push(`| \`${r.id}\` | ${r.world.sprite?'sprite':'model'} ${r.world.meshes}m/${r.world.tris}t | ${r.held.sprite?'sprite':'model'} ${r.held.meshes}m/${r.held.tris}t |`);
    md.push('');
  }
  md.push('## Inert items');
  md.push('');
  md.push('Nothing reads these. You can hold one and there is no dispatch that does anything with it.');
  md.push('');
  md.push('| item | mentioned in |');
  md.push('|---|---|');
  for(const r of inert) md.push(`| \`${r.id}\` | ${[...new Set(r.mentions.map(m=>m.fn))].slice(0,6).join(', ')||'nowhere'} |`);
  md.push('');
  md.push('## Every item');
  md.push('');
  md.push('| item | does | source | world | held |');
  md.push('|---|---|---|---|---|');
  for(const r of rows){
    const w=r.world?(r.world.err?'ERR':(r.world.sprite?'sprite':'model')+` ${r.world.meshes}/${r.world.tris}`):'-';
    const h=r.held?(r.held.err?'ERR':(r.held.sprite?'sprite':'model')+` ${r.held.meshes}/${r.held.tris}`):'-';
    md.push(`| \`${r.id}\`${r.hidden?' _(hidden)_':''} | ${r.act.join(' ')||'**inert**'} | ${r.src.join(' ')||'**none**'} | ${w} | ${h} |`);
  }
  fs.mkdirSync(path.join(ROOT,'docs'),{recursive:true});
  fs.writeFileSync(path.join(ROOT,'docs','ITEM-AUDIT.md'), md.join('\n'));
  fs.writeFileSync(path.join(ROOT,'docs','item-audit.json'), JSON.stringify({rows},null,1));
  console.log(`  ${rows.length} items · ${noSource.length} with no source · ${inert.length} inert` + (live?` · ${spriteHeld.length} sprite-in-hand · ${mismatch.length} dispatch mismatches`:' · STATIC ONLY, block items missing'));
  console.log('  docs/ITEM-AUDIT.md');
  console.log('  no source: '+noSource.map(r=>r.id).join(' '));
  console.log('  inert:     '+inert.map(r=>r.id).join(' '));
})();
