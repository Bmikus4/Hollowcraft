# HOLLOWCRAFT — co-op over the web (quick-tunnel model)

Play with friends over the internet by running the relay on your PC and exposing it with a
tunnel. No accounts, no cloud host — the link is live only while your PC runs it.

## How to host
1. **Run the relay** (serves the game AND the co-op relay on port 8788):
   - Double-click **`Hollowcraft-Coop.bat`**, or run `node mp-server.js`.
2. **Expose it to the internet** with a tunnel in a second terminal — pick one:
   - **Cloudflare** (no signup): `cloudflared tunnel --url http://localhost:8788`
   - **ngrok**: `ngrok http 8788`
   Either prints an **https URL** (e.g. `https://something.trycloudflare.com`).
3. **Share that https URL.** Friends open it → the game loads → **Multiplayer → Join**.
4. **You (the host):** open the game at **http://localhost:8788** (or the tunnel URL) → **Multiplayer → Host**.
   The first person connected is the authority for the monster + world time.

The client auto-connects to whatever host served the page (same origin), so opening the tunnel
link is all a friend needs. You can also force a relay with `?mp=wss://<host>` on the URL.

## What syncs (full co-op, v2)
- **Players** — everyone sees each other move as articulated avatars with **nametags** (set in Settings → *Your name*, sent over the net, drawn above each player), **walk animations** (legs/arms swing, derived locally from movement) and **head pitch**, and the **item they're holding rendered in their hand** (held id sent server-side, modelled locally); dead/tied states shared.
- **World building** — deterministic from the seed (terrain + structures identical for all); **block break/place synced**, **tree-fall synced** (the whole trunk falls for everyone), **dropped items synced** (shared IDs — a picked-up item vanishes for all, no dupes), **dropped torches light up** for all.
- **Animals** — **host-authoritative**: the host runs the herds; everyone sees them in the same places.
- **The Wretch** — **hunts the NEAREST connected player** (anyone). It's host-driven while free-roaming; when it grabs a player, **capture ownership transfers to that player** — they get the jumpscare/drag/tunnel/tie sequence locally while everyone else watches, then it hands control back to the host.
- **Rescue** — stand next to a **tied** teammate for ~1.2s and you cut them free (auto).
- **Day/night** — host broadcasts world time so it's the same for all.
- **Dungeons are unbreakable** for everyone.

## Limitations / notes
- Chest contents and tool durability aren't synced yet (local). Structures build identically from the seed so they don't need syncing.
- No server persistence; the world regenerates from the seed each session.
- LAN without a tunnel: friends on your network use `http://<your-LAN-ip>:8788`.
- **Built but UNTESTED over a real network** — needs a two-machine (or PC + phone via tunnel) playtest. Most likely rough spots: avatar smoothing, capture hand-off timing, host migration.

## Files
- `mp-server.js` — dependency-free Node WebSocket relay + static file server.
- Client netcode lives in `index.html` (`NET` object): connect, peer avatars, block-edit sync, host world broadcast, guest mirror (`netWretchTick`).
