# Deployment

The build produces a self-contained `dist/` folder. How you serve it decides which presenting
modes are available:

| Option | Presenting modes | Needs |
|---|---|---|
| [On your computer](#on-your-computer) | all three, on your network | Node.js |
| [Docker](#docker) | all three | a container host + HTTPS proxy |
| [User-level service without root](#user-level-service-without-root) | all three | a Linux account with systemd; a proxy rule by the administrator |
| [System service](#system-service) | all three | root on a Linux server |
| [Static hosting + relay](#static-hosting-and-a-relay) | one computer, relay sessions | any static web space (GitHub Pages…) |

A server session needs HTTPS in practice: projectors and phones are on other networks, and
browsers restrict pages served over plain HTTP. Put the service behind a reverse proxy with a
certificate ([examples](#reverse-proxies)).

## Deploy bundles

Servers do not build: they receive a **bundle**, a `.tar.gz` with exactly these top-level
entries:

```
dist/               the built presentations (+ dist/revision.txt when --revision is given)
deploy/             the engine's deploy kit with your instance's files laid over it
server.mjs          the server, a single file
package.json        the engine's package (runtime dependency: socket.io)
package-lock.json
```

```bash
npx reveal-classroom build
npx reveal-classroom bundle --dist dist --deploy deploy --revision "$(git rev-parse HEAD)" --out reveal-classroom.tar.gz
```

`--deploy` names your instance's folder, usually containing only `instance.env`; it is copied over
the engine's `deploy/` kit. On the server: `npm ci --omit=dev`, then `node server.mjs` (it serves
`dist/` next to it). **Keep this layout**: installed update scripts check it before replacing
themselves (see [architecture.md](architecture.md#bundle-contract)).

## On your computer

```bash
npx reveal-classroom serve                          # http://127.0.0.1:3000, temporary password printed
PRESENTATION_PASSWORD='…' npx reveal-classroom serve --host 0.0.0.0   # reachable from your network
```

Fine for one computer and a projector, and for trying the phone controller on a local network.

## Docker

The bundle contains a Dockerfile:

```bash
mkdir bundle && tar -xzf reveal-classroom.tar.gz -C bundle
docker build -t my-presentations -f bundle/deploy/docker/Dockerfile bundle
docker run -d --name presentations --restart unless-stopped \
  -p 127.0.0.1:3000:3000 -e PRESENTATION_PASSWORD='a-long-random-password' \
  -e BASE_PATH=/slides my-presentations
```

Publish the port on the loopback interface only and proxy it over HTTPS. A new bundle means a new
image; restarting the container ends the running sessions.

## User-level service without root

`deploy/user/install.sh` installs a bundle into your home directory: a private Node.js runtime,
a systemd **user** service on a loopback port, and optionally a timer that pulls updates. This is
how the AMSS course runs on a shared university server. Requirements: Linux with systemd, `bash`,
`curl`, `tar`, `sha256sum`, `python3`.

### 1. Describe the instance

In your repository, create `deploy/instance.env` from
[`deploy/instance.env.example`](../deploy/instance.env.example):

```bash
APP_NAME=my-presentations      # ~/.local/share/my-presentations, my-presentations.service
PORT=3107                      # loopback port, unused on the server
BASE_PATH=/~me/slides          # the proxy serves https://host/~me/slides/
RELEASE_URL=https://github.com/me/my-lectures/releases/download/presentations-live
BUNDLE_NAME=reveal-classroom.tar.gz
```

This file travels in the bundle: never put the password in it. Leave `RELEASE_URL` empty to update
by hand.

### 2. First installation

```bash
npx reveal-classroom bundle --dist dist --deploy deploy --revision "$(git rev-parse HEAD)" --out reveal-classroom.tar.gz
scp reveal-classroom.tar.gz me@server:
ssh me@server 'mkdir -p ~/rc-install && tar -xzf reveal-classroom.tar.gz -C ~/rc-install deploy/user/install.sh && bash ~/rc-install/deploy/user/install.sh ~/reveal-classroom.tar.gz'
```

The script:

1. reads `deploy/instance.env` from the bundle;
2. downloads Node.js (`NODE_VERSION`, verified against `NODE_SHA256_LINUX_X64`/`ARM64` or
   nodejs.org's `SHASUMS256.txt`) into `~/.local/share/$APP_NAME/runtime`, unless
   `USE_SYSTEM_NODE=1`;
3. extracts the bundle into `app.new`, installs its dependencies, then swaps it with `app`
   (the previous version stays in `app.old`);
4. creates `~/.config/$APP_NAME/environment` **once** with a random `PRESENTATION_PASSWORD`;
5. writes `~/.config/systemd/user/$APP_NAME.service` (and the update timer when `RELEASE_URL` is
   set), restarts the service and checks `http://127.0.0.1:$PORT$BASE_PATH/health`.

User services stop when you log out unless *lingering* is enabled. Ask the administrator once:
`sudo loginctl enable-linger me`.

Read the password with `cat ~/.config/$APP_NAME/environment`; change it by editing that file and
running `systemctl --user restart $APP_NAME`.

### 3. The proxy rule

The administrator adds a rule to the HTTPS virtual host — see [reverse proxies](#reverse-proxies).
Afterwards check `https://host/~me/slides/health` and a session between two devices.

### 4. Operations

```bash
systemctl --user status my-presentations                  # service
journalctl --user -u my-presentations -n 50 --no-pager    # logs
systemctl --user status my-presentations-update.timer     # updates
journalctl --user -u my-presentations-update -n 30 --no-pager
cat ~/.local/share/my-presentations/installed-revision    # deployed commit
systemctl --user start my-presentations-update.service    # check for an update now
systemctl --user stop my-presentations-update.timer       # pause updates (e.g. during a lecture)
systemctl --user start my-presentations-update.timer      # resume
```

An update restarts the service and **ends all running sessions**; pause the timer during lectures.
To roll back, swap `app` and `app.old` and restart the service.

## Automatic updates from GitHub

[`deploy/github-actions/publish.yml`](../deploy/github-actions/publish.yml) is a workflow for your
instance repository. On every push to `main` it builds, packs a bundle and publishes two assets in
a GitHub release (default tag `presentations-live`):

- `reveal-classroom.tar.gz` — the bundle;
- `latest.json` — `{"revision": "<commit>", "sha256": "<bundle checksum>"}`, uploaded last.

With `RELEASE_URL` pointing at that release, the server's timer checks `latest.json` every minute.
When the revision changed, it downloads the bundle, verifies the checksum, the revision recorded in
`dist/revision.txt` and the archive's entries (no absolute paths, `..`, links or unexpected
top-level names), then runs the **new** bundle's `install.sh`. The server needs no inbound SSH and
no GitHub credentials; the repository's releases must be public.

The workflow installs Pandoc only; add the tools your filters need (the AMSS example installs
Graphviz, PlantUML and Mermaid's CLI).

## System service

With root, [`deploy/systemd/reveal-classroom.service`](../deploy/systemd/reveal-classroom.service)
runs an extracted bundle from `/opt/reveal-classroom` as a dedicated user:

```bash
sudo useradd --system --home /opt/reveal-classroom --shell /usr/sbin/nologin reveal-classroom
sudo mkdir -p /opt/reveal-classroom && sudo tar -xzf reveal-classroom.tar.gz -C /opt/reveal-classroom
(cd /opt/reveal-classroom && sudo npm ci --omit=dev --ignore-scripts)
sudo install -m 600 /dev/null /etc/reveal-classroom.env
sudoedit /etc/reveal-classroom.env      # HOST=127.0.0.1 PORT=3000 BASE_PATH= PRESENTATION_PASSWORD=…
sudo cp /opt/reveal-classroom/deploy/systemd/reveal-classroom.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now reveal-classroom
```

## Reverse proxies

Both examples forward WebSocket upgrades and keep the URL prefix, which must equal `BASE_PATH`.

- **Apache 2.4.47+** — [`deploy/proxy/apache.conf.example`](../deploy/proxy/apache.conf.example):
  `ProxyPass "/slides/" "http://127.0.0.1:3000/slides/" upgrade=websocket` inside the HTTPS
  virtual host (`a2enmod proxy proxy_http`).
- **nginx** — [`deploy/proxy/nginx.conf.example`](../deploy/proxy/nginx.conf.example): a dedicated
  host name, or a `location /slides/` block.

Then test `https://host/slides/health` (→ `{"ok":true}`), the launcher, and a session between two
browsers on different networks.

## Static hosting and a relay

Without a server, publish `dist/` as static files and configure a relay
([relay.md](relay.md)):

```json
{ "relay": { "url": "https://multiplex.up.railway.app/" } }
```

```bash
npx reveal-classroom build
# publish dist/ — e.g. copy it into a GitHub Pages folder, or: npx gh-pages -d dist
```

The launcher then offers the one-computer mode and relay sessions (it hides server sessions,
probing `health` once; a 404 for it in the browser console is expected). Be aware that
`decks/*.html` — the presenter copies, with notes — are public files on a static host; the
projection links use `audience/*.html`, which have no notes.

## Security checklist

- A long random `PRESENTATION_PASSWORD`, stored only on the server (environment file mode 600, or
  a container secret); never in the repository, `instance.env`, bundles or workflow files.
- HTTPS in front; the service listens on `127.0.0.1` (or the container port is published on the
  loopback interface only).
- Session creation is rate-limited (20 attempts per minute per address) and capped (1000
  sessions); sessions expire after `SESSION_TTL_HOURS`.
- Only files listed in `decks.json` and the engine's assets are served; notes are removed from
  follower responses.
- Pause automatic updates during lectures.
