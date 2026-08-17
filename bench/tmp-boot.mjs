// SCRATCH BOOT PROBE. Whatever the current question is gets asked here rather than in a new file.
// Right now: Tab opens the inventory now that E is lean, and dragging a stack onto empty space drops it.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{
    await sleep(1500);
    await W.page.evaluate('__hc.lock(true)'); await sleep(300);
    await W.page.keyboard.press('Tab'); await sleep(600);
    const tab=await W.page.evaluate('__hc.qState()');
    // A STACK IN THE CURSOR, RELEASED OVER THE WORLD. Mouse-up in the top left corner, which no panel covers. Also
    // released over a PANEL first, which must NOT drop -- otherwise the test passes on a handler that fires anywhere.
    console.log('carry  '+JSON.stringify(await W.page.evaluate(`__hc.qCursor('stone',7)`)));
    console.log('before '+JSON.stringify(await W.page.evaluate('__hc.qDrops()')));
    const box=await W.page.evaluate(`(function(){const r=document.getElementById('invui').getBoundingClientRect();
      return [Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)];})()`);
    await W.page.mouse.move(box[0],box[1]); await W.page.mouse.down(); await W.page.mouse.up(); await sleep(300);
    console.log('onpanel'+JSON.stringify(await W.page.evaluate('__hc.qDrops()')));
    await W.page.mouse.move(6,6); await W.page.mouse.down(); await W.page.mouse.up(); await sleep(400);
    console.log('onworld'+JSON.stringify(await W.page.evaluate('__hc.qDrops()')));
    console.log('tab    '+JSON.stringify(tab));
    console.log('errors: '+ (W.errors.length? W.errors.slice(0,4).join(' | ') : 'none'));
  } finally { await W.close(); } })();
