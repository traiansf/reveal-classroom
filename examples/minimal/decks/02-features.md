---
title: "Authoring features"
author: "Your Name"
lang: en
---

# Pacing {.transition}

Is the lecture on time?

::: notes
[]{.pace at=0 of=20}
:::

---

# Plan the timing in the notes

| Marker | Meaning |
|---|---|
| `[]{.pace at=5}` | this slide should start at minute 5 |
| `[]{.pace dur=8}` | this slide is planned to last 8 minutes |
| `[]{.pace of=100}` | the presentation lasts 100 minutes (once per deck) |

Slides without a marker share the remaining time evenly.

::: notes
The markers are hidden: they appear neither in the notes nor on the slides.

[]{.pace dur=5}
:::

---

# Two columns

:::::: {.columns}
::: {.column width="48%"}
Text on the left, code on the right.

Columns use Pandoc's fenced divs.
:::
::: {.column width="48%"}
```js
Reveal.on('slidechanged', event => {
  console.log(event.indexh);
});
```
:::
::::::

---

# Done {.transition}

Questions?

::: notes
[]{.pace at=18}
:::
