# reveal-classroom

Write lectures in Pandoc Markdown, present them as [reveal.js](https://revealjs.com) slides, and keep
the projector and the audience in step with the device in your hand.

- **One source, one deck per file.** Pandoc Markdown with speaker notes (`::: notes`), section
  dividers, pauses, columns, tables, code and whatever your Pandoc filters add (Mermaid, PlantUML…).
- **Present from anywhere.** On one computer with the reveal.js speaker view; or from a laptop or a
  phone while the projector and any audience device follow your slide.
- **A phone controller made for teaching.** The slide on top, your notes in the middle, large
  **Back / Next** buttons and an elapsed-time clock at the bottom, with *on time / slow down /
  speed up* hints computed from hidden pacing markers in your notes.
- **Your own small server** (Node.js): password-protected sessions, a stable short address
  (`/now`) for the projector and the audience, state kept for late joiners and reconnections, and
  speaker notes never sent to followers.
- **Or no server at all.** Host the built files statically (GitHub Pages, any web space) and
  synchronize through a [reveal.js Multiplex](https://github.com/reveal/multiplex) relay — the
  public one or your own.
- **One JSON file per instance:** which decks, theme, Pandoc template and filters, interface
  language (English and Romanian included), relay.
- **Deployment kit:** user-level install without root (private Node.js, systemd user service),
  automatic pull-based updates from GitHub Releases, Docker, Apache and nginx examples.

reveal-classroom was extracted from the slides of the course *Analiza și Modelarea Sistemelor
Software* (AMSS 2026/2027, University of Bucharest), which remains a complete real-world instance:
see [examples/amss2026](examples/amss2026/).

## Requirements

- **Node.js 22 or later** (build and server).
- **Pandoc 3.5 or later** to build decks (not needed on the server). Anything your Pandoc filters
  call must be installed too (e.g. `mmdc` for Mermaid).
- `tar` to create deploy bundles; Linux with systemd, `curl`, `python3` and `sha256sum` for the
  user-level server installation.

## Try it in five minutes

```bash
git clone https://github.com/traiansf/reveal-classroom.git
cd reveal-classroom
npm ci
npm run build   # builds examples/minimal into examples/minimal/dist
npm start       # serves it at http://127.0.0.1:3000 and prints a temporary presenter password
```

Open <http://127.0.0.1:3000>:

1. **One computer:** choose a deck, *Open the presentation*, press **S** for the speaker view.
2. **Two devices:** enter the printed password and *Start a synchronized session*. Open the control
   link in the same tab, then open the short address (`http://127.0.0.1:3000/now`) in another
   browser window: it follows every slide change. Narrow the control window (or open it on a
   phone, see below) to get the phone controller.
3. **Public relay:** *Start a relay session* uses the public Multiplex server configured in the
   example; the projection link works from any device with internet access.

To reach the server from a phone on the same network, see
[docs/presenting.md](docs/presenting.md#trying-it-from-a-phone).

## Your own presentations

An *instance* is a folder with your Markdown decks and a `reveal-classroom.config.json`:

```bash
mkdir my-lectures && cd my-lectures
npm init -y
npm install github:traiansf/reveal-classroom#v0.1.0   # or a local path to this repository
mkdir decks
```

`decks/01-intro.md`:

```markdown
---
title: "Introduction"
author: "Your Name"
lang: en
---

# Why this course? {.transition}

::: notes
Start with a question to the room. []{.pace at=0 of=90}
:::

---

# What you will learn

- First idea
- Second idea

::: notes
Only you see these notes.
:::
```

`reveal-classroom.config.json`:

```json
{
  "title": "My lectures",
  "language": "en",
  "decks": { "root": "decks" }
}
```

```bash
npx reveal-classroom build    # writes dist/
npx reveal-classroom serve    # http://127.0.0.1:3000
```

Every option — themes, templates, Pandoc filters, deck lists, relays, Reveal.js settings — is in
[docs/configuration.md](docs/configuration.md).

## Documentation

| Guide | For |
|---|---|
| [docs/presenting.md](docs/presenting.md) | Presenters: the three ways to present, the phone controller, pacing, troubleshooting. |
| [docs/authoring.md](docs/authoring.md) | Writing decks: slides, notes, section dividers, pauses, pacing markers, diagrams. |
| [docs/configuration.md](docs/configuration.md) | The configuration file, interface strings, environment variables, CLI. |
| [docs/deployment.md](docs/deployment.md) | Running the server: local, Docker, systemd (with or without root), reverse proxies, automatic updates, static hosting. |
| [docs/relay.md](docs/relay.md) | Public and self-hosted Multiplex relays: how they work, limits, security. |
| [docs/architecture.md](docs/architecture.md) | How the pieces fit: build output, protocols, security model, bundle format. |
| [AGENTS.md](AGENTS.md) | Instructions for AI coding agents working on this repository. |

## Security in one paragraph

The presenter password protects the creation of sessions; each session has its own control key,
kept only in the browser tab that created it. Followers (`/now`, `?follow=1`) can only receive
slide positions, and the server removes speaker notes from what it sends them. Sessions live in
memory: restarting the server ends them. With a public relay, the relay operator sees slide
positions and the session id, and on static hosting the presenter decks (with notes) are public
files — use the server when notes must stay private. Details: [docs/architecture.md](docs/architecture.md#security-model).

## License

[MIT](LICENSE). reveal.js and Socket.IO are MIT-licensed too; reveal.js's license is copied into
every build.
