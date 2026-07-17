# Hollowcraft — serverless deploy (Vercel + PartyKit)

**Short answer to "can we host multiplayer on Vercel serverless?"**
The *game* (static files) — yes, perfectly. The *multiplayer relay* — **no, not on Vercel itself.** Vercel's
serverless functions are short-lived and stateless, so they can't hold the persistent WebSocket connections a
realtime relay needs. The clean serverless fix is to keep the relay on a WebSocket-native serverless platform and
point the game at it. Best fit: **PartyKit** (Cloudflare-backed, one command to deploy, generous free tier). The
relay logic is already ported to it in `party/main.js`.

```
   Friends' browsers ──HTTPS──▶  Vercel   (static game: index.html, vendor/, sounds/)
          │
          └──────────WSS───────▶  PartyKit (party/main.js — relay + host designation)
```

---

## 1. Deploy the relay to PartyKit (serverless)

```bash
npm i -g partykit          # or: npx partykit@latest ...
npx partykit deploy        # from this folder — reads partykit.json → party/main.js
```

It prints a URL like:

```
  wss://hollowcraft.<your-partykit-username>.partykit.dev
```

Copy it. (Free tier is fine for friends-scale play.)

## 2. Point the game at the relay

Pick one:

- **Simplest — a global before the game loads.** In `index.html`, just above `<script type="module">`, add:
  ```html
  <script>window.HOLLOWCRAFT_RELAY = 'wss://hollowcraft.<you>.partykit.dev';</script>
  ```
  Now the **Host/Join** menu takes a plain **room code** (e.g. `WOOD-1234`) and routes it to
  `<relay>/parties/main/<code>` automatically. Everyone who types the same code lands in the same room.

- **Or per-link, no edit:** share `https://<your-vercel-app>/?mp=wss://hollowcraft.<you>.partykit.dev/parties/main/WOOD-1234`.
  `?mp=` overrides everything.

## 3. Deploy the game to Vercel (static)

```bash
npm i -g vercel
vercel            # first run links/creates the project
vercel --prod     # ship it
```

Vercel serves `index.html` + `vendor/` + `sounds/` as-is. `vercel.json` sets the COOP/COEP headers the game
expects. No build step, no server.

## 4. Play

1. Everyone opens the Vercel URL.
2. **Multiplayer → Host**, type a room code (or let it auto-generate one), share the code.
3. Friends **Multiplayer → Join**, same code.
4. First one in is the **authoritative host** (drives the Wretch, world time, animals). If the host leaves, the
   relay promotes the next player automatically.

---

## What syncs (unchanged from the Node relay)
Player avatars + nametags + held items, block break/place, tree-fall, dropped items, host-authoritative animals,
the Wretch (hunts the nearest player; capture ownership transfers to the grabbed player then hands back), tied-mate
rescue, day/night. World + structures are deterministic from the seed, so they aren't sent.

## Alternatives to PartyKit
- **Cloudflare Durable Objects / Workers** — same idea, more boilerplate; `party/main.js` maps directly onto a DO.
- **Ably / Pusher** — managed pub/sub; you'd swap `netConnect` to their SDK (more client changes).
- **Always-on Node** (Render / Railway / Fly free tier) — just run the existing `mp-server.js`; not serverless but
  zero code change. The LAN/tunnel model in `MULTIPLAYER.md` also still works untouched.

## Notes / rough edges (built, needs a real 2-machine playtest)
- Not yet synced: chest contents, tool durability (local-only).
- Most likely to need tuning under real latency: avatar smoothing, capture hand-off timing, host migration.
