// ONE generation per invocation, by design. fal.ai is a paid API and a corpus run on this box once cost $57 in a night, so this
// script has no list, no loop and no retry-on-cost: it submits exactly one job, waits for it, writes the file, and prints what the
// call cost at the published rate. If you want three clips, run it three times and look at each one.
//
//   node scripts/fal.mjs image  <slug> "<prompt>"          ~$0.04   fal-ai/flux-pro/kontext/text-to-image
//   node scripts/fal.mjs edit   <slug> "<prompt>" <image>  ~$0.04   fal-ai/flux-pro/kontext (restyle a real frame)
//   node scripts/fal.mjs video  <slug> "<prompt>" [image]  ~$0.07/s kling 2.5 turbo pro, 5s = $0.35
//
// The key lives in .env (gitignored) and must never reach a commit, a bench fixture or a log line.
import fs from 'node:fs'; import path from 'node:path';
const ROOT='D:/Code/Minecraft';
const KEY=(fs.readFileSync(path.join(ROOT,'.env'),'utf8').match(/FAL_KEY=(.+)/)||[])[1];
if(!KEY) { console.error('no FAL_KEY in .env'); process.exit(1); }
const [kind,slug,prompt,img]=process.argv.slice(2);
// A LOCAL FILE IS ALLOWED WHERE A URL IS, and that is the whole point of this argument now: Ben asked for the
// jumpscare to be built off REAL reference screenshots of the creature rather than a text-to-image invention of
// it, and the real ones only exist on this disk. Anything that is not http(s) is read and inlined as a data URI,
// which the image-to-video endpoints accept in place of a hosted URL -- no upload step, no bucket, nothing left
// on someone else's storage afterwards.
let imgRef=img;
if(img && !/^https?:|^data:/.test(img)){
  const bin=fs.readFileSync(path.isAbsolute(img)?img:path.join(ROOT,img));
  const mime=/\.png$/i.test(img)?'image/png':'image/jpeg';
  imgRef='data:'+mime+';base64,'+bin.toString('base64');
  console.log('reference '+img+'  '+(bin.length/1024).toFixed(0)+' KB inlined');
}
if(!kind||!slug||!prompt){ console.error('usage: node scripts/fal.mjs image|video <slug> "<prompt>" [image-url]'); process.exit(1); }

const MODELS={
  image:{ ep:'fal-ai/flux-pro/kontext/text-to-image', body:{prompt, aspect_ratio:'16:9', output_format:'jpeg'}, cost:0.04, ext:'jpg' },
  // EDIT KEEPS THE CREATURE AND CHANGES THE RENDER. The first jumpscare clip came back unmistakably the Wretch --
  // same crimson flesh, same gaunt limbs -- and rendered in the game's own blocky look, because image-to-video
  // preserves the style of the frame it is given. Ben asked for hyperrealistic, so the plate is restyled first at
  // four cents and looked at before anything spends thirty-five on five seconds of the wrong look.
  edit:{ ep:'fal-ai/flux-pro/kontext', body:{prompt, image_url:'', output_format:'jpeg'}, cost:0.04, ext:'jpg' },
  video:{ ep:img?'fal-ai/kling-video/v2.5-turbo/pro/image-to-video':'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
          body:img?{prompt, image_url:imgRef, duration:'5'}:{prompt, duration:'5'}, cost:0.35, ext:'mp4' } };
const M=MODELS[kind]; if(!M){ console.error('kind must be image, edit or video'); process.exit(1); }
if(kind==='edit'){ if(!imgRef){ console.error('edit needs an image: node scripts/fal.mjs edit <slug> "<prompt>" <file-or-url>'); process.exit(1); } M.body.image_url=imgRef; }
console.log('model '+M.ep+'   estimated cost $'+M.cost.toFixed(2)+'   (one generation, no batch)');

const H={'Authorization':'Key '+KEY,'Content-Type':'application/json'};
const q='https://queue.fal.run/'+M.ep;
const sub=await fetch(q,{method:'POST',headers:H,body:JSON.stringify(M.body)});
const j=await sub.json();
if(!j.request_id){ console.error('submit failed: '+JSON.stringify(j).slice(0,400)); process.exit(1); }
console.log('queued '+j.request_id);
const base='https://queue.fal.run/'+M.ep.split('/').slice(0,2).join('/')+'/requests/'+j.request_id;
let out=null;
for(let i=0;i<180;i++){
  await new Promise(r=>setTimeout(r,3000));
  const st=await (await fetch(base+'/status',{headers:H})).json();
  if(i%5===0) console.log('  '+(st.status||'?'));
  if(st.status==='COMPLETED'){ out=await (await fetch(base,{headers:H})).json(); break; }
  if(st.status==='FAILED'||st.error){ console.error('failed: '+JSON.stringify(st).slice(0,400)); process.exit(1); } }
if(!out){ console.error('timed out waiting'); process.exit(1); }
const url=(out.images&&out.images[0]&&out.images[0].url)||(out.video&&out.video.url);
if(!url){ console.error('no media in result: '+JSON.stringify(out).slice(0,400)); process.exit(1); }
const buf=Buffer.from(await (await fetch(url)).arrayBuffer());
const dest=path.join(ROOT,'assets/creature-ref',slug+'.'+M.ext);
fs.writeFileSync(dest,buf);
console.log('wrote '+dest+'  '+(buf.length/1024).toFixed(0)+' KB   spent ~$'+M.cost.toFixed(2));
// A FILTERED GENERATION STILL BILLS. The safety filter returns a fully black frame at about 10 KB rather than an error, so a
// caller that only checks the exit code pays for blanks and never learns why. Say it here, on the one line anybody reads.
if(buf.length<30*1024) console.log('  WARNING: '+(buf.length/1024).toFixed(0)+' KB is the size of a filtered blank frame, not an image. Look at it before spending again.');
