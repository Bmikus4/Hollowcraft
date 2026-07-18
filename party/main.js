// HOLLOWCRAFT — co-op relay on PARTYKIT (serverless, Cloudflare-backed WebSockets).
// This is the exact relay logic from mp-server.js, ported to PartyKit so it can be deployed
// with `npx partykit deploy` — no always-on server. The game static files live on Vercel;
// this handles only the realtime relay + host designation.
//
//   deploy:   npx partykit deploy         → gives  wss://hollowcraft.<you>.partykit.dev
//   join URL: wss://hollowcraft.<you>.partykit.dev/parties/main/<roomcode>
//
// The world is deterministic from the shared seed, so this only forwards messages and picks
// the authoritative HOST (first player in the room) — identical contract to the Node relay.

const ALLOWED = new Set(['p','b','bb','tree','drop','drops','dpick','an','w','own','grab','rescue','sync','time','chest']);   // 'bb'/'drops' = per-frame batches (parity with mp-server.js); backpressure is Cloudflare's problem here
const MAX_CLIENTS = 12;

export default class HollowcraftParty {
  constructor(room){ this.room = room; this.hostNid = null; this.next = 1; this.nids = new Map(); }   // connId(string) -> numeric id the client protocol expects
  conns(){ return [...this.room.getConnections()]; }
  connFor(nid){ for(const c of this.conns()) if(this.nids.get(c.id) === nid) return c; return null; }

  onConnect(conn){
    if(this.conns().length > MAX_CLIENTS){ conn.close(); return; }                                    // room full
    const nid = this.next++; this.nids.set(conn.id, nid);
    const isHost = this.hostNid === null; if(isHost) this.hostNid = nid;
    conn.send(JSON.stringify({ t:'welcome', id:nid, host:isHost, hostId:this.hostNid,
      peers: this.conns().map(c=>this.nids.get(c.id)).filter(x=>x && x!==nid) }));
    this.room.broadcast(JSON.stringify({ t:'peerJoin', id:nid }), [conn.id]);                          // tell everyone else
  }

  onMessage(message, sender){
    let msg; try{ msg = JSON.parse(message); }catch(e){ return; }
    if(!msg || !ALLOWED.has(msg.t)) return;                                                            // whitelist only
    msg.id = this.nids.get(sender.id);                                                                 // stamp sender
    if(msg.to != null){ const tgt = this.connFor(msg.to); if(tgt) tgt.send(JSON.stringify(msg)); return; }   // directed (late-join 'sync')
    this.room.broadcast(JSON.stringify(msg), [sender.id]);                                             // relay to everyone else
  }

  onClose(conn){ const nid = this.nids.get(conn.id); this.nids.delete(conn.id);
    this.room.broadcast(JSON.stringify({ t:'peerLeave', id:nid }));
    if(this.hostNid === nid){ const rest = this.conns();                                               // host left → promote the next player
      this.hostNid = rest.length ? this.nids.get(rest[0].id) : null;
      if(this.hostNid && rest[0]) rest[0].send(JSON.stringify({ t:'youAreHost' }));
    }
  }
  onError(conn){ this.onClose(conn); }
}
