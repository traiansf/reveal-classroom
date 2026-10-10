# Minimal example

Two short English decks that show the authoring features (notes, section dividers, pauses, pacing
markers, a table, columns, code) and the three presenting modes, with the public Multiplex relay
configured.

From the repository root:

```bash
npm ci
npm run build   # = node bin/reveal-classroom.mjs build --config examples/minimal/reveal-classroom.config.json
npm start       # = node bin/reveal-classroom.mjs serve --dist examples/minimal/dist
```

Open <http://127.0.0.1:3000>. The configuration is deliberately short:

```json
{
  "title": "reveal-classroom demo",
  "language": "en",
  "decks": { "root": "decks" },
  "launcher": { "preselect": "^(\\d+)-" },
  "relay": { "url": "https://multiplex.up.railway.app/" },
  "slideBackgrounds": { "transition": "#13294b" }
}
```

Everything else uses the defaults: `client/template.html`, `client/theme.css`, English strings.
