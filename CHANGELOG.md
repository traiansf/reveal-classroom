# Changelog

## 0.1.0 — 2026-10-10

First release as an independent project, extracted with its history from the AMSS 2026/2027
course (`traiansf/traiansf.github.io`, `class/amss-2026/presentation`).

- Configuration file (`reveal-classroom.config.json`) for decks, theme, Pandoc template and
  filters, launcher, Reveal.js options and slide backgrounds; validated with explanatory errors.
- CLI: `build`, `serve`, `bundle`.
- Interface in English and Romanian, with per-instance overrides.
- Relay sessions through reveal.js Multiplex servers (public or self-hosted), for static hosting;
  notes-free `audience/` copies of every deck.
- Default theme and Pandoc template; the phone controller's styles are separate and themable
  (`--rc-*` variables).
- Generic deploy kit: user-level installation without root with pull-based updates, system
  service, Docker, Apache and nginx examples, GitHub Actions publishing workflow.
- From the course version: synchronized sessions with a presenter password, `/now` short address,
  retained state, notes removed for followers, phone controller with notes, clock and pacing
  hints, buttons at the bottom and a progress bar that ignores taps on phones.
