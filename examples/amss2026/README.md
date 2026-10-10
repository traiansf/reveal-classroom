# Example instance: AMSS 2026/2027

The course *Analiza și Modelarea Sistemelor Software* (University of Bucharest) is where
reveal-classroom started. Its decks live in
[`traiansf/traiansf.github.io`](https://github.com/traiansf/traiansf.github.io/tree/main/class/amss-2026),
are released week by week through a `RELEASED` list, and are presented from
`https://cs.unibuc.ro/~tserbanuta/amss/`, a user-level service on a shared university server.

This folder holds the instance's files as they appear in that repository's
`class/amss-2026/presentation/` folder (paths in the configuration are relative to it):

| File | Role |
|---|---|
| `reveal-classroom.config.json` | Romanian interface; decks from `../RELEASED` (lectures and labs, not the Lab 0 guide); the course's Lua filters (diagrams, title splitting), metadata, highlighting theme and logo; preselects the latest lecture; navy section dividers |
| `theme.css` | The course look (navy/teal, title slide with logo); recolors the phone controller through `--rc-*` |
| `template.html` | Cover with session, headline, course and author, as split by the course's `amss.lua` filter |
| `deploy/` | The scripts installed on cs.unibuc.ro (Apache route, user service, update timer, installer), predating the generic kit |
| `README.ro.md` | The course's operating notes (Romanian), written before the extraction; commands refer to the course repository |
| `workflow.yml` | The course's GitHub Actions workflow once it uses this package (see below) |

## How it is deployed

On every push to `main` of the course repository, GitHub Actions installs Pandoc, Graphviz,
PlantUML and the Mermaid CLI, builds the released decks, packs a bundle named
`amss-presentation.tar.gz` and publishes it with `latest.json` in the release `amss-live`. On the
server, `amss-update.timer` checks that release every minute (`deploy/pull-release.sh`), verifies
the checksum and the archive, and reinstalls (`deploy/receive-ci.sh` → `deploy/install-cs-user.sh`)
into `~/.local/share/amss-presentation/app`, where `amss-presentation.service` runs
`node server.mjs` on `127.0.0.1:3107` with `BASE_PATH=/~tserbanuta/amss`. The password is in
`~/.config/amss-presentation/environment`.

## Moving the course to the package

Until the switch, the course repository keeps its own copy of the engine. To switch without
touching the server:

1. In `class/amss-2026/presentation/`, replace the engine files (`build.mjs`, `server.mjs`,
   `presentation.js`, `launcher.js`, `index.html`, `test/`) by:
   - `package.json` depending on `"reveal-classroom": "github:traiansf/reveal-classroom#v0.1.0"`
     (plus `npm install` to create the lock file);
   - `reveal-classroom.config.json`, `theme.css`, `template.html` from this folder;
   - the existing `deploy/` folder, unchanged.
2. Replace `.github/workflows/amss-presentation.yml` with [`workflow.yml`](workflow.yml).
3. Push outside teaching hours, watch the workflow and the server's update log, then check the
   launcher, a session between two devices and the phone controller.

Why the server needs no change: `reveal-classroom bundle --deploy deploy` lays the course's
`deploy/` over the engine's kit and keeps the bundle layout (`dist/`, `deploy/`, `server.mjs`,
`package.json`, `package-lock.json`) that the installed `receive-ci.sh` validates; the bundle
still contains `deploy/install-cs-user.sh`, which that script requires; `install-cs-user.sh`
runs `npm ci --omit=dev` and starts `server.mjs` exactly as before; the environment file's
variables (`HOST`, `PORT`, `BASE_PATH`, `PRESENTATION_PASSWORD`) are unchanged.

The decks built by the package are identical to the course's current ones except for three
lines: the engine stylesheet (`reveal-classroom.css`) and `site.js` are loaded, and Socket.IO is
loaded on demand instead of by the template.

Moving later to the generic kit (`deploy/user/`) would change the unit names and paths on the
server; it is not needed.
