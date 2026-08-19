// SCRATCH. Which of the written foliage PNGs does the BROWSER decode differently from the tool that wrote them?
// The copies are byte-for-byte zip entries; the tinted, the composited and the left-as-is rows all go back out through
// tools/pack-foliage.mjs's own PNG writer, and a file a Node reader is happy with can still be wrong.
import { openWorld, sleep } from './lib/rig.mjs';
const NAMES=['grass_tall','grass_meadow','grass_meadow_tall','fern','bush','vine','sunflower_wild',
             'mush_red','mush_brown','foxglove','anemone','bellflower','sage','yarrow','bloodroot','berry','sapling',
             'sunflower_stem','sunflower_head','tree_flower','pale_bloom'];
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(1500);
    const out=await W.page.evaluate(`(async(names)=>{ const res=[];
      for(const n of names){
        const im=new Image(); im.src='assets/blocks/'+n+'.png';
        await new Promise(r=>{ im.onload=r; im.onerror=()=>r(); });
        if(!im.width){ res.push(n+'  LOAD FAILED'); continue; }
        const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const x=c.getContext('2d'); x.clearRect(0,0,c.width,c.height); x.drawImage(im,0,0);
        const d=x.getImageData(0,0,c.width,c.height).data;
        let t=[0,0,0], op=0, semi=0;
        for(let i=0;i<d.length;i+=4){ const a=d[i+3]; if(a<8) continue; op++; if(a<248) semi++;
          t[0]+=d[i]; t[1]+=d[i+1]; t[2]+=d[i+2]; }
        res.push(n.padEnd(20)+im.width+'x'+im.height+'  opaque '+Math.round(100*op/(c.width*c.height))+
          '%  semi '+Math.round(100*semi/Math.max(op,1))+'%  mean ['+t.map(v=>Math.round(v/Math.max(op,1))).join(',')+']');
      }
      return res; })(${JSON.stringify(NAMES)})`);
    console.log(out.join('\n'));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
