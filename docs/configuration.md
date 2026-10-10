# Configuration

An instance is described by one JSON file, `reveal-classroom.config.json` by default. **Relative
paths are resolved from the folder of the configuration file.** The build validates the file and
stops with an explanation when something is wrong.

## A complete example

```json
{
  "title": "Software Analysis — presentations",
  "language": "en",
  "strings": "strings.json",
  "output": "dist",
  "theme": "theme.css",
  "decks": {
    "root": "..",
    "list": "../RELEASED",
    "include": ["lectures/*", "labs/*"],
    "exclude": ["labs/00-setup"]
  },
  "pandoc": {
    "command": "pandoc",
    "template": "template.html",
    "slideLevel": 1,
    "filters": ["../filters/diagram.lua"],
    "metadataFiles": ["../course.yaml"],
    "highlightStyle": "../code.theme",
    "variables": { "logo-path": { "path": "../assets/logo.png" }, "institution": "University" },
    "args": ["--number-sections"],
    "env": { "win32": { "MERMAID_BIN": "mmdc.cmd" } }
  },
  "launcher": { "preselect": "^lectures-(\\d+)" },
  "relay": { "url": "https://multiplex.up.railway.app/", "heartbeatSeconds": 5 },
  "reveal": { "width": 1280, "height": 720, "slideNumber": "c/t" },
  "slideBackgrounds": { "transition": "#13294b" },
  "fitText": true
}
```

Only `decks.root` usually needs setting; everything else has a default.

## Keys

### `title`
Shown on the launcher page and on the server's waiting page. Default: the language's
`launcher.pageTitle` (*Presentations*).

### `language`
`"en"` (default) or `"ro"`: the built-in interface strings (launcher, phone controller, server
messages). Another code is accepted when `strings` provides every text.

### `strings`
Path to a JSON file merged over the built-in strings, with the same structure as
[`i18n/en.json`](../i18n/en.json) (`launcher`, `controller`, `sync`, `server`). Override only what
you need:

```json
{ "launcher": { "passwordLabel": "Lecturer password", "username": "lecturer" } }
```

Values are text, except `launcher.localText`, which may contain HTML (it is inserted as is).

### `output`
Directory to build into. Default: `dist`. The build only replaces what it generates (`decks/`,
`audience/`, `vendor/` and its own files), and refuses to build into the configuration's own
folder or one of its parents. `reveal-classroom build --out DIR` overrides it.

### `theme`
CSS copied to `dist/theme.css` and loaded by every deck. Default:
[`client/theme.css`](../client/theme.css); copy it as a starting point. The phone controller has
its own stylesheet (`reveal-classroom.css`); a theme can recolor it through the `--rc-*` variables
defined there, e.g. `:root { --rc-accent: #8a1538; }`.

### `decks`
Which Markdown files become decks. A deck's **key** is its path relative to `root`, with `/` and
without `.md` (e.g. `lectures/01-intro`); its output file is the key with `/` replaced by `-`
(`lectures-01-intro.html`).

| Key | Default | Meaning |
|---|---|---|
| `root` | `.` | Folder containing the decks. |
| `list` | — | A file with one key per line, in launcher order (`#` starts a comment). Without it, every `*.md` under `root` is a candidate, sorted by key (`node_modules`, `.git` and the output folder are skipped). |
| `include` | `["**"]` | Globs on keys: `*` stays within a folder, `**` crosses folders. |
| `exclude` | `[]` | Globs on keys, applied after `include`. |

A `list` file is a convenient release switch: add a key when the deck may be published.

### `pandoc`

| Key | Default | Meaning |
|---|---|---|
| `command` | `pandoc` | Executable (Pandoc 3.5 or later). |
| `template` | [`client/template.html`](../client/template.html) | Pandoc template for decks. A custom template must keep the references to `vendor/reveal/reveal.js`, `reveal-classroom.css`, `site.js` and `presentation.js`, marked `data-external="1"` so that Pandoc links them instead of embedding them; the build stops if one is missing. |
| `slideLevel` | `1` | `--slide-level`. |
| `filters` | `[]` | Paths; `.lua` files become `--lua-filter`, others `--filter`. |
| `metadataFiles` | `[]` | `--metadata-file` paths. |
| `highlightStyle` | — | A style name (`pygments`, `kate`…) or a path to a `.theme` file. |
| `variables` | `{}` | Template variables (`-V name=value`). Use `{ "path": "file" }` for files, resolved from the configuration folder; images are embedded. |
| `args` | `[]` | Extra Pandoc arguments, passed as they are. |
| `env` | `{}` | Environment variables for Pandoc and its filters. Either flat, or per platform with keys `*`, `win32`, `linux`, `darwin`. |

Pandoc always runs with `--standalone --embed-resources -t revealjs --wrap=none`, in the folder of
the deck, so relative image paths work.

### `launcher.preselect`
A regular expression with one numeric group, matched against output file names; the launcher
preselects the deck with the largest number. `"^lectures-(\\d+)"` preselects the latest lecture
rather than a lab. Default: the first deck.

### `relay`
Enables relay sessions in the launcher ([relay.md](relay.md)).

| Key | Default | Meaning |
|---|---|---|
| `url` | — | A Multiplex-compatible relay, e.g. `https://multiplex.up.railway.app/`. Presenters can type another one in the launcher. |
| `heartbeatSeconds` | `5` | How often the controller repeats its position for late projections (minimum 2). |

### `reveal`
Reveal.js options merged over the defaults (`width` 1280, `height` 720, `margin` 0.025, `hash`,
`slideNumber` `"c/t"`, no transitions, `center`, `progress`). Options that depend on the role —
controls, keyboard, touch, overview, embedded layout, plugins — are set by reveal-classroom and
cannot be overridden.

### `slideBackgrounds`
`{ "class": "color" }`: slides whose `<section>` has the class get that background color, e.g. the
`{.transition}` section dividers. Default: none.

### `fitText`
`true` (default) shrinks the text of overflowing slides, down to 78% of the theme's size;
`false` leaves slides as the theme renders them.

## What the build writes

```
dist/
  index.html              launcher (title and strings filled in)
  site.js, site.json      instance settings and interface strings (browser / server)
  decks.json              [{ "file": "...html", "title": "..." }] — the only decks the server serves
  decks/*.html            presenter decks, with notes
  audience/*.html         the same decks without notes (relay projections, static hosting)
  presentation.js, launcher.js, relay-protocol.js, reveal-classroom.css, theme.css
  vendor/reveal/          reveal.js and its license
```

## Server environment

`reveal-classroom serve` and `node server.mjs` (in a deploy bundle) read:

| Variable | Default | Meaning |
|---|---|---|
| `PRESENTATION_PASSWORD` | random, printed | Presenter password for creating sessions. **Required** unless the host is `127.0.0.1`/`localhost`. |
| `HOST` | `127.0.0.1` | Interface to listen on. |
| `PORT` | `3000` | Port. |
| `BASE_PATH` | empty | URL prefix when a reverse proxy serves the presentations below a path, e.g. `/slides`. Applies to every page, asset, API and Socket.IO URL. |
| `SESSION_TTL_HOURS` | `8` | Lifetime of a session. |
| `DIST` | `dist` next to `server.mjs` | Built directory (`node server.mjs` only; the CLI uses `--dist`). |

## Command line

```text
reveal-classroom build  [--config reveal-classroom.config.json] [--out DIR]
reveal-classroom serve  [--dist dist] [--host 127.0.0.1] [--port 3000] [--base-path /prefix]
reveal-classroom bundle [--dist dist] [--deploy DIR] [--revision SHA] --out FILE.tar.gz
reveal-classroom --version
```

`serve` options override the environment variables above (the password only comes from the
environment). `bundle` is described in [deployment.md](deployment.md#deploy-bundles).

## Using reveal-classroom from your own repository

Add it as a dependency, pinned to a release:

```json
{
  "private": true,
  "scripts": {
    "build": "reveal-classroom build",
    "start": "reveal-classroom serve"
  },
  "dependencies": { "reveal-classroom": "github:traiansf/reveal-classroom#v0.1.0" }
}
```

Keep the configuration, theme, template and strings next to it; commit `package-lock.json`;
ignore `dist/`. To upgrade, change the tag, run `npm install`, rebuild and check a deck on a
laptop and a phone.
