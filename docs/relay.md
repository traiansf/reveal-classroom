# Relay sessions (no server of your own)

A *relay* forwards slide changes from the presenter's device to every projection that knows the
session id. reveal-classroom speaks the protocol of the official
[reveal.js Multiplex](https://github.com/reveal/multiplex) server, so you can use:

- the **public Multiplex server** run by the reveal.js project, `https://multiplex.up.railway.app/`
  — its README warns that *"availability and stability are not guaranteed"* and recommends your own
  server *"for anything mission critical"*;
- **your own Multiplex server** (any host that can run Node.js), see [below](#running-your-own-relay);
- any server implementing the same protocol.

Relay sessions combine well with static hosting (GitHub Pages, a university web space): the
launcher, decks and client are plain files, and only the slide positions travel through the relay.

## Enabling relay sessions

```json
{ "relay": { "url": "https://multiplex.up.railway.app/" } }
```

Build and publish `dist/`. The launcher shows **Synchronize through a public relay** with the
configured address, which presenters may change for one session.

## What happens

1. **Start a relay session**: the launcher requests `RELAY/token` and receives
   `{ "secret": "…", "socketId": sha256(secret) }`. The secret is stored in that browser tab only.
2. **Control link** (`decks/DECK?id=SOCKETID`, plus `&relay=URL` when it differs from the
   configured one): the page loads the Socket.IO client *from the relay itself* (so the versions
   match — the official server uses Socket.IO 2) and, on every slide or fragment change and every
   five seconds, sends `multiplex-statechanged` with `{ state, secret, socketId }`.
3. The relay checks `sha256(secret) === socketId`, removes the secret and broadcasts the message
   as an event named after the `socketId`.
4. **Projection link** (`audience/DECK?id=SOCKETID&follow=1`): a copy of the deck without notes
   that listens for that event and applies only the slide coordinates and the pause screen.

Messages from other sessions, forged messages (wrong secret, dropped by the relay) and malformed
states are ignored. The overview is never mirrored.

## Limits compared with the server

| | Server session | Relay session |
|---|---|---|
| Who may start a session | holders of the presenter password | anyone who can open the launcher |
| Short address for the audience | `/now` | no — share the projection link |
| Late joiners | current slide immediately | within the heartbeat (5 s by default) |
| Speaker notes | never leave the server for followers | not sent; but presenter decks with notes are public files on a static host |
| Third parties | none | the relay operator sees slide positions, the session id and the controller's secret |
| Availability | yours | the relay's |

The relay operator could in principle send slide changes for your session (it sees the secret).
Other people could only follow it, and only if they know the session id.

## Running your own relay

The official server is a small Node.js application:

```bash
mkdir multiplex && cd multiplex
npm init -y
npm install reveal-multiplex
node node_modules/reveal-multiplex   # listens on port 1948 (PORT to change it)
```

The server also serves the files of its working directory as static content, so start it from an
empty folder. Put it behind HTTPS, then use its address as `relay.url`. A relay below a path
(`https://host/multiplex/`, with a proxy that strips the prefix) works too: reveal-classroom
connects with the matching Socket.IO path.

Prefer a [reveal-classroom server](deployment.md) when you can run Node.js anyway: it adds the
password, the short address, retained state and private notes.

## Testing a relay

```bash
curl https://multiplex.up.railway.app/token         # {"secret":"…","socketId":"…"}
```

Then start a relay session in the launcher, open the projection link on a second device, and step
through a few slides. A yellow *Synchronization unavailable* message on either page means the
relay cannot be reached.
