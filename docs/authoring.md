# Authoring decks

Each deck is one Pandoc Markdown file. The build runs Pandoc's reveal.js writer with
`--slide-level=1` (configurable), so **every level-1 heading starts a slide**; `---` between slides
is optional but makes the source easier to scan.

## Front matter

```markdown
---
title: "Introduction to requirements"
subtitle: "Week 3"
author: "Your Name"
date: "October 2026"
lang: en
---
```

- `title` names the deck in the launcher and in the browser tab. Without it, the launcher shows
  the deck's file key (e.g. `lectures/03-requirements`).
- The default template turns `title`, `subtitle`, `author`, `date` and the optional `logo-path`
  variable into a title slide. Custom templates may use other fields (the AMSS example splits
  `"Course — Lecture 2: Title"` with a Lua filter).
- `lang` sets the document language (hyphenation, screen readers).

## Slides and speaker notes

```markdown
# Slide title

Content seen by everybody.

::: notes
Only the presenter sees this: in the speaker view (S) and on the phone controller.
:::
```

Notes are removed from everything sent to followers: the server strips them from projection
requests, and the build writes notes-free copies (`dist/audience/`) for relay sessions.

## Section dividers

```markdown
# Building a model {.transition}

Which concepts explain the problem?
```

Any class works; `transition` is the convention. The default theme styles it as a divider, and the
instance can give such slides a background color through `"slideBackgrounds": { "transition":
"#13294b" }` ([configuration.md](configuration.md)).

## Step-by-step reveals

Pandoc pauses become reveal.js fragments:

```markdown
# Three steps

. . .

First.

. . .

Second.
```

Incremental lists work too (`::: incremental`). The phone's **Back / Next** buttons, the arrow
keys and the projection all follow the fragments.

## Pacing markers

Hidden markers in the notes describe the timing plan; the phone controller compares it with the
elapsed time and shows *on time*, *slow down* or *speed up*.

```markdown
::: notes
Opening question.

[]{.pace at=0 of=100}
:::
```

| Marker | Meaning |
|---|---|
| `[]{.pace at=25}` | this slide should start at minute 25 |
| `[]{.pace dur=8}` | this slide is planned to last 8 minutes |
| `[]{.pace of=100}` | the presentation lasts 100 minutes; put it once, usually with `at=0` on the first slide |

- Slides without a marker share the time left until the next `at` evenly; a span whose `dur`
  values exceed it is scaled down.
- A deck without `of` shows no pacing hint.
- The markers are removed from the notes before display and never appear on slides.
- Use only `at`, `dur` and `of`: Pandoc keeps standard HTML attribute names (such as `min`)
  without the `data-` prefix, and the client would not see them.

A typical lecture marks the start of each section on its divider slide (`at`) and the duration of
each exercise (`dur`):

```markdown
# Working in pairs {.transition}

::: notes
[]{.pace at=45}
:::

---

# Exercise: write two acceptance examples

...

::: notes
Expected answers: ...

[]{.pace dur=9}
:::
```

## Columns, tables, code, images

Everything Pandoc's reveal.js writer supports works. Columns use fenced divs:

```markdown
:::::: {.columns}
::: {.column width="48%"}
Left
:::
::: {.column width="48%"}
Right
:::
::::::
```

Images and other local resources are embedded into the deck HTML (`--embed-resources`), so each
deck is a single file. Paths are relative to the Markdown file. Very dense slides are shrunk a
little to fit (down to 78% of the theme's font size); disable this with `"fitText": false`.

## Diagrams and other filters

Pandoc filters listed in the configuration run for every deck, for example a Lua filter that
renders ```` ```mermaid ```` blocks to SVG with `mmdc`. The filters and their tools are your
instance's choice; reveal-classroom only passes them to Pandoc (`pandoc.filters`, `pandoc.env`).

## Checking a deck

```bash
npx reveal-classroom build
npx reveal-classroom serve
```

Open the deck from the launcher, press **S** to check the notes, narrow the window below 600 px to
see the phone controller and its pacing hint, and step through the fragments.
