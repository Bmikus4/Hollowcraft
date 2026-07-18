// HOLLOWCRAFT — minimal dependency-free WebSocket relay for co-op.
// Pure Node (RFC6455 handshake + text frames), no npm. Run:  node mp-server.js
// Then expose port 8788 with a tunnel (cloudflared/ngrok) and share  ?mp=wss://<tunnel-host>
// It is a RELAY + host-designation: the world is deterministic from the shared seed, so the
// server only forwards messages. The first player is HOST (authoritative for the Wretch/time/weather).
const http=require('http'), crypto=require('crypto'), fs=require('fs'), path=require('path'), dgram=require('dgram'), os=require('os');
const PORT=Number(process.env.MP_PORT)||8788;
const DISC_PORT=Number(process.env.MP_DISC)||8789;                 // UDP port for LAN game-browser beacons
const ROOT=__dirname;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.wasm':'application/wasm','.ogg':'audio/ogg','.wav':'audio/wav','.mp3':'audio/mpeg'};
const GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
// ---- HARDENING (public-tunnel model: anyone with the link can connect) ----
const MAX_CLIENTS = Number(process.env.MP_MAX)||12;   // reject beyond this
const MAX_MSG     = 64*1024;                           // drop any frame claiming to be bigger (memory-blow guard)
const RATE_MSGS   = 240;                               // per-client messages per second before we start dropping
const ALLOWED = new Set(['p','b','bb','tree','drop','drops','dpick','an','w','own','grab','rescue','sync','time','chest']);   // relay only known message types ('bb'/'drops' = per-frame batches)
const HIFREQ  = new Set(['p','w','an','time']);        // shed-able under backpressure: next tick resends fresher state anyway. Event messages (edits/drops/sync) are NEVER shed.
const MAX_BEHIND = 256*1024;                           // a client buffered further behind than this stops receiving high-frequency traffic until it drains
let nextId=1, hostId=null; const clients=new Map();   // id -> {sock, alive, msgs, win}
// ---- LAN GAME BROWSER state (UDP beacons; carried over Hamachi/real LAN) ----
const SELF=crypto.randomBytes(4).toString('hex');     // unique id so we ignore our own beacon
let advertise={on:false,name:'Hollowcraft'};          // toggled by the game via /advertise when you click Host
const lanHosts=new Map();                             // sid -> {ip,name,gport,players,last} discovered on the network

function send(sock, obj){ try{ if(HIFREQ.has(obj.t) && sock.writableLength>MAX_BEHIND) return; sock.write(frame(JSON.stringify(obj))); }catch(e){} }   // backpressure: a slow client loses transform ticks, never events
function broadcast(obj, exceptId){ const s=JSON.stringify(obj), hi=HIFREQ.has(obj.t); for(const [id,c] of clients){ if(id===exceptId)continue; try{ if(hi && c.sock.writableLength>MAX_BEHIND) continue; c.sock.write(frame(s)); }catch(e){} } }
function frame(str){ const b=Buffer.from(str); const len=b.length; let head;
  if(len<126){ head=Buffer.from([0x81,len]); }
  else if(len<65536){ head=Buffer.alloc(4); head[0]=0x81; head[1]=126; head.writeUInt16BE(len,2); }
  else { head=Buffer.alloc(10); head[0]=0x81; head[1]=127; head.writeUInt32BE(0,2); head.writeUInt32BE(len,6); }
  return Buffer.concat([head,b]); }

// serve the game files too, so ONE tunnel to this port = game + co-op (friends open the tunnel URL and auto-join)
const server=http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/lan'){ const now=Date.now();                                                       // the game menu polls this for the LAN list
    const list=[...lanHosts.values()].filter(h=>now-h.last<6000).map(h=>({name:h.name,ip:h.ip,gport:h.gport,players:h.players}));
    if(advertise.on) list.unshift({name:advertise.name,ip:null,gport:PORT,players:clients.size,self:true});   // so a friend who opened THIS host's URL sees a one-click Join (same-origin)
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Cache-Control':'no-cache'}); res.end(JSON.stringify(list)); return; }
  if(p==='/advertise'){ const q=new URLSearchParams(req.url.split('?')[1]||'');                // Host on/off + game name → start/stop beaconing
    advertise.on = q.get('on')!=='0'; const nm=q.get('name'); if(nm) advertise.name=nm.slice(0,24);
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify({ok:true,on:advertise.on,name:advertise.name})); return; }
  if(p==='/')p='/index.html';
  const full=path.join(ROOT,path.normalize(p).replace(/^(\.\.[\/\\])+/,'')); if(!full.startsWith(ROOT)){ res.writeHead(403); res.end(); return; }
  fs.readFile(full,(err,data)=>{ if(err){ res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200,{'Content-Type':MIME[path.extname(full).toLowerCase()]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'}); res.end(data); }); });
server.on('upgrade',(req,sock)=>{
  const key=req.headers['sec-websocket-key']; if(!key){ sock.destroy(); return; }
  const accept=crypto.createHash('sha1').update(key+GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  if(clients.size>=MAX_CLIENTS){ sock.destroy(); return; }                              // room full → refuse
  const id=nextId++; const isHost = hostId===null; if(isHost) hostId=id;
  clients.set(id,{sock,alive:true,msgs:0,win:Date.now()});
  send(sock,{t:'welcome',id,host:isHost,hostId,peers:[...clients.keys()].filter(x=>x!==id)});
  broadcast({t:'peerJoin',id},id);
  let buf=Buffer.alloc(0);
  sock.on('data',(d)=>{ buf=Buffer.concat([buf,d]);
    if(buf.length > MAX_MSG*2){ sock.destroy(); return; }                                 // runaway/slowloris buffer → kill
    while(buf.length>=2){ const op=buf[0]&0x0f, masked=(buf[1]&0x80)!==0; let len=buf[1]&0x7f, off=2;
      if(len===126){ if(buf.length<4)break; len=buf.readUInt16BE(2); off=4; } else if(len===127){ if(buf.length<10)break; len=buf.readUInt32BE(6); off=10; }
      if(len>MAX_MSG){ sock.destroy(); return; }                                          // oversized frame → kill (never buffer it)
      const need=off+(masked?4:0)+len; if(buf.length<need)break;
      let payload; if(masked){ const mask=buf.slice(off,off+4); payload=Buffer.alloc(len); for(let i=0;i<len;i++)payload[i]=buf[off+4+i]^mask[i&3]; } else payload=buf.slice(off,off+len);
      buf=buf.slice(need);
      if(op===8){ sock.end(); return; }
      if(op===1){
        const c=clients.get(id); if(!c)return;                                            // per-client rate limit (sliding 1s window)
        const now=Date.now(); if(now-c.win>=1000){ c.win=now; c.msgs=0; }
        if(++c.msgs > RATE_MSGS) continue;                                                // over budget → drop this frame
        let msg; try{ msg=JSON.parse(payload.toString()); }catch(e){ continue; }
        if(!msg || !ALLOWED.has(msg.t)) continue;                                         // only relay known message types
        if(msg.to!=null){ const tgt=clients.get(msg.to); if(tgt){ msg.id=id; send(tgt.sock,msg); } continue; }   // directed (e.g. late-join 'sync') → one recipient, not a broadcast
        msg.id=id; broadcast(msg,id);                                                     // relay to everyone else, stamped with sender id
      }
    } });
  const bye=()=>{ if(!clients.has(id))return; clients.delete(id); broadcast({t:'peerLeave',id});
    if(hostId===id){ hostId = clients.size? [...clients.keys()][0] : null; if(hostId){ send(clients.get(hostId).sock,{t:'youAreHost'}); } } };   // promote a new host
  sock.on('close',bye); sock.on('error',bye); sock.on('end',bye);   // also catch a graceful half-close → clean peerLeave + host migration
});
server.listen(PORT,()=>console.log('HOLLOWCRAFT relay on :'+PORT+'  — LAN: friends open http://<your-hamachi-ip>:'+PORT+'  (or expose with a tunnel + ?mp=wss://<host>)'));

// ---- LAN DISCOVERY: hosts shout a UDP beacon; every server listens and builds the game list ----
const disc=dgram.createSocket({type:'udp4',reuseAddr:true});
disc.on('error',()=>{});   // a busy discovery port must never crash the relay
disc.on('message',(buf,rinfo)=>{ let m; try{ m=JSON.parse(buf.toString()); }catch(e){ return; }
  if(!m||m.hc!==1||m.sid===SELF) return;                                                        // ours or junk → ignore
  lanHosts.set(m.sid,{sid:m.sid,ip:rinfo.address,name:(m.name||'Hollowcraft').slice(0,24),gport:m.gport||PORT,players:m.players|0,last:Date.now()}); });
disc.bind(DISC_PORT,()=>{ try{ disc.setBroadcast(true); }catch(e){} });
function bcastAddrs(){ const out=new Set(['255.255.255.255']);                                   // limited broadcast + every interface's directed broadcast (covers the Hamachi 25.x adapter)
  const ifs=os.networkInterfaces(); for(const n in ifs){ for(const a of (ifs[n]||[])){ if(a.family==='IPv4'&&!a.internal&&a.netmask){
    const ip=a.address.split('.').map(Number), mk=a.netmask.split('.').map(Number); out.add(ip.map((o,i)=>(o&mk[i])|(~mk[i]&255)).join('.')); } } } return [...out]; }
setInterval(()=>{ if(!advertise.on)return; const msg=Buffer.from(JSON.stringify({hc:1,sid:SELF,name:advertise.name,gport:PORT,players:clients.size}));
  for(const b of bcastAddrs()){ try{ disc.send(msg,DISC_PORT,b); }catch(e){} } },2000);         // announce every 2s while hosting
setInterval(()=>{ const now=Date.now(); for(const [k,v] of lanHosts){ if(now-v.last>6000)lanHosts.delete(k); } },3000);   // drop hosts that went quiet
