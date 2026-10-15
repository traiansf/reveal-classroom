# Changelog

## 0.2.0 — 2026-10-15

- Phone controller clock: tapping it switches between the total time and the time on the current
  slide (the choice is kept across slides and reloads); holding it restarts the total, which a tap
  used to do. Both show minutes and quarter minutes.
- Session pages (control and projection) keep the screen awake with the Screen Wake Lock API while
  visible, so the projector's computer no longer starts its screen saver when the slides are
  driven from a phone.
- New interface strings `controller.slideTimerLabel`, `controller.timerTotal`,
  `controller.timerSlide`; `controller.timerTitle` changed meaning. Instances that override them
  should review their overrides.

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
