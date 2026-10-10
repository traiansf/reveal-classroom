# Instructions for AI coding agents

reveal-classroom turns Pandoc Markdown decks into reveal.js presentations and synchronizes them
for teaching: a phone/laptop controller, projector and audience followers, through its own Node
server or a reveal.js Multiplex relay. Read [README.md](README.md) first, then the guide for your
task in [docs/](docs/). Human-facing behavior is specified in those guides: keep code and docs in
agreement in the same change.

## Repository map

| Path | What it is |
|---|---|
| `bin/reveal-classroom.mjs` | CLI: `build`, `serve`, `bundle`, `--version` |
| `lib/build.mjs` | Config loading/validation (`loadConfig`) and the build (`build`) |
| `lib/bundle.mjs` | Deploy bundle creation (engine `deploy/` + instance overlay) |
| `server.mjs` | HTTP + Socket.IO server; **single self-contained file** (imports only `socket.io`) |
| `client/` | Browser code and defaults: `presentation.js` (every deck), `launcher.html`/`launcher.js`, `relay-protocol.js`, `reveal-classroom.css`, default `theme.css` and Pandoc `template.html` |
| `i18n/en.json`, `i18n/ro.json` | Interface strings; same keys in every file |
| `deploy/` | Deploy kit shipped in every bundle: `user/` (no-root install + updates), `systemd/`, `proxy/`, `docker/`, `github-actions/`, `instance.env.example` |
| `examples/minimal/` | Small English instance used by `npm run build`/`npm start` and the build test |
| `examples/amss2026/` | Real instance (AMSS 2026/2027 course): config, theme, template, its own production deploy scripts, Romanian ops README |
| `test/` | `node:test` suites: server, relay protocol, build/bundle |
| `docs/` | Presenting, authoring, configuration, deployment, relay, architecture |

## Commands

```bash
npm ci                 # install (Node.js >= 22)
npm test               # all tests; the example build test runs only if pandoc is on PATH
npm run build          # build examples/minimal -> examples/minimal/dist
npm start              # serve it on http://127.0.0.1:3000 (temporary password printed)
node bin/reveal-classroom.mjs build --config path/to/reveal-classroom.config.json [--out DIR]
node bin/reveal-classroom.mjs serve --dist DIR [--port N] [--host H] [--base-path /p]
node bin/reveal-classroom.mjs bundle --dist DIR [--deploy DIR] [--revision SHA] --out FILE.tar.gz
```

Pandoc 3.5+ is needed only to build decks. On Windows, run the commands from PowerShell or Git
Bash; `tar` is invoked with a relative archive name because GNU tar reads `C:` as a remote host.

## Invariants — do not break

1. **Bundle layout**: top-level `dist/`, `deploy/`, `server.mjs`, `package.json`,
   `package-lock.json`; `node server.mjs` must run after `npm ci --omit=dev`. Installed update
   scripts validate this before installing (docs/architecture.md#bundle-contract).
2. **`server.mjs` stays a single file** importing only Node built-ins and `socket.io`.
3. **Notes never reach followers**: server strips `<aside class="notes">` for `decks/…?follow=1`;
   the build writes notes-free `audience/` copies; `presentation.js` removes notes in follower
   pages. Keep all three.
4. **Control secrets never in URLs**: server keys and relay secrets live in `sessionStorage` of the
   tab that created the session.
5. **`BASE_PATH` everywhere**: every server route, redirect and the Socket.IO path honor it;
   client URLs stay relative (`../socket.io`, `decks/…`), so `dist/` works under any prefix.
6. **Static allow-list**: the server serves only listed files, decks in `decks.json`, and
   `vendor/reveal/`. New client files must be added to `PUBLIC_FILES` in `server.mjs` and copied
   by `lib/build.mjs`.
7. **Template contract**: deck templates reference `vendor/reveal/reveal.js`,
   `reveal-classroom.css`, `site.js`, `presentation.js` with `data-external="1"` (else Pandoc
   embeds them). `REQUIRED_IN_TEMPLATE` in `lib/build.mjs` enforces the first part.
8. **Strings**: every user-visible text comes from `i18n/*.json` (via `site.js`/`site.json`), with
   English fallbacks in the code. Add a key to **both** language files.
9. **No secrets in the repository**: passwords live only in server environment files.
10. **Relay compatibility**: the official Multiplex server runs Socket.IO 2; the client must keep
   loading `RELAY/socket.io/socket.io.js` from the relay and use only APIs common to v2 and v4
   (`io.connect(origin, { path })`, `emit`, `on`, `connected`).

## Making changes

- **Server behavior**: edit `server.mjs`, extend `test/server.test.mjs` (it builds a throwaway
  `dist/` with `test/helpers.mjs`; no Pandoc needed). Test both `basePath` values, as the suite
  does.
- **Configuration key**: validate it in `loadConfig`, pass it through `site` if the browser needs
  it, document it in `docs/configuration.md`, cover errors in `test/build.test.mjs`.
- **Client (decks, launcher)**: no browser test runs in CI. After changes, verify by hand (below)
  and say so in your summary.
- **Interface text**: change `i18n/en.json` and `i18n/ro.json` together; keep placeholders such as
  `{min}`.
- **Deploy scripts**: `bash -n deploy/user/*.sh`; prefer testing in a disposable Linux VM or
  container with systemd. Never weaken the checksum, revision or archive-entry checks in
  `deploy/user/update.sh`.
- **Docs**: English; keep the README's feature list and the docs in sync with behavior.

### Manual browser check

1. `npm run build && npm start`; open the launcher: three sections (local, server, relay).
2. Start a server session; follow the control link in the same tab; open `/now` in another
   window; step through slides and fragments: the follower must match; reload it: it must catch up.
3. Narrow the control window below 600 px (or emulate a phone): slide on top, notes in the middle,
   Back/Next and clock at the bottom; the buttons must stay visible with long notes; tapping the
   progress bar must not jump.
4. Relay: start a relay session (public relay, or a local Multiplex server); open the projection
   link; it must follow within a second and catch up within 5 s after a reload.
5. Static: serve `examples/minimal/dist` with any static server; the server section must be
   hidden and relay sessions must work.

## Releases

Version in `package.json` and `CHANGELOG.md`; tag `vX.Y.Z`. Instances depend on a tag
(`github:traiansf/reveal-classroom#vX.Y.Z`). Note breaking changes to the configuration, the
template contract or the bundle layout prominently.

## The AMSS 2026/2027 instance

`examples/amss2026/` mirrors the course in `traiansf/traiansf.github.io` (`class/amss-2026/`). Its
`deploy/` scripts are the ones installed on the production server (cs.unibuc.ro): do not "clean
them up" without coordinating the migration described in its README. Its interface is Romanian;
its decks are not part of this repository.
