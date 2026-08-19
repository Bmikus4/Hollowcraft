import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6}); const p=W.page;
  try{ await sleep(2500);
    await p.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/give iron_ingot 64'); __hc.cmdRun('/give stone 64')");
    await sleep(1500);
    console.log(await p.evaluate("(()=>{const k=document.querySelector('.vkg'); const pips=document.getElementById('walkpips');"+
      "return {kg:k?k.textContent:null, colour:k?k.style.color:null, pips:!!pips, glyphKids:document.querySelector('.vglyphs').children.length};})()"));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
