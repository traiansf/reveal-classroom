# Presenting

This guide is for the person in front of the room. It assumes the presentations are already built
and available at an address such as `https://example.org/slides/` (the *launcher*), or at
`http://127.0.0.1:3000/` on your own computer.

## Choose a way to present

| Situation | Use | You need |
|---|---|---|
| One computer drives the projector | **One computer, two screens** | Nothing else |
| The projector's computer is not yours, or you want to walk around with a phone | **Session on the server** | The presenter password; internet on both devices |
| No reveal-classroom server is available (static hosting) | **Relay session** | Internet on both devices; the relay must be up |

The launcher shows only the options that work where it is served: the server section appears
when the page comes from a reveal-classroom server, the relay section when the instance
configures a relay.

## One computer, two screens

1. Choose the deck and press **Open the presentation**.
2. Press **S**. reveal.js opens the *speaker view*: current and next slide, notes, clock. Allow
   the pop-up if the browser blocks it.
3. Set the displays to **Extend** (Windows: `Win+P`; macOS: Displays settings, not mirroring).
4. Move the presentation window to the projector and make it full screen (**F**); keep the
   speaker view on your screen.
5. Navigate from either window: arrows, Page Up/Down, Space; **B** or `.` pauses with a black
   screen; **O** or **Esc** shows the overview.

This mode needs no session and no password. Open the launcher over HTTP (not as a `file://`
page): the speaker view needs a web server.

## Session on the server (two devices)

1. On the device you will control from (laptop or phone), open the launcher, choose the deck,
   enter the presenter password and press **Start a synchronized session**.
2. Follow **Open the control presentation** *in the same tab*. The control key is stored only in
   that tab (`sessionStorage`), so the link does not work if you copy it to another tab or
   device: start the session on the device you will hold.
3. On the projector's computer, open the **short address** shown by the launcher — the launcher
   address followed by `now`, e.g. `https://example.org/slides/now` — and make it full screen.
   Write it on the board for the audience: it always leads to the latest session.
4. Present from your device. The projection follows slide changes, pauses (`. . .`) and the black
   screen (**B**). Its own keys and touch gestures are disabled.

What else to know:

- **Late or reloaded projections** receive the current slide immediately. If the connection
  drops, the projection keeps the last slide, shows a yellow message and catches up after
  reconnecting. Your control tab keeps working offline and resynchronizes when it reconnects.
- **`/now` before the session starts** shows a waiting page that checks again every five
  seconds; leave it open on the projector.
- **A new session** (*Prepare another session*) moves `/now` to the new deck for every *new*
  visitor; open projections stay on the previous session until reloaded.
- **Sessions last eight hours** (configurable by the administrator) and **end when the server
  restarts**, for example during an update. Start a new session if the projection reports that
  the session does not exist.
- The **speaker view** (**S**) also works in the control tab on a laptop.

## Relay session (no server)

1. Open the launcher, choose the deck and press **Start a relay session**. The relay address is
   preconfigured; you can type another Multiplex-compatible relay.
2. Follow **Open the control presentation** in the same tab (the control secret stays in it).
3. Open the **projection link** on the projector and on any audience device. There is no short
   address: copy the link, or share it through your usual channel (chat, QR code generator).

Differences from server sessions:

- The relay keeps no state. Your control tab repeats its position every five seconds, so a
  projection that opens late or reconnects catches up within that time.
- Slide positions and the session id pass through the relay's operator; the control secret too.
  Speaker notes never do, and the projection link points to a copy of the deck without notes.
- On a static host, the presenter decks (`decks/…`, with notes) are ordinary public files. Use a
  server session when notes must stay private.
- Public relays offer no availability guarantee: test before the lecture and keep the one-computer
  mode as a fallback. See [relay.md](relay.md).

## The phone controller

Any control link opened on a touch screen or in a window narrower than 600 px becomes the phone
controller:

- **Portrait:** the slide at the top, your notes in the middle, the buttons at the bottom.
  **Landscape:** the slide on the left, notes and buttons on the right.
- **Back / Next** step through slides and pauses. Swiping horizontally on the slide does the same.
- The **notes** scroll on their own; long notes never push the buttons off the screen.
- The **clock** shows minutes and quarter minutes (`23:45`), either the **total** time or the
  time on the current **slide**, as its small label says. **Tap it** to switch between the two;
  the choice stays when you change slides. The slide time starts again at each new slide (not at
  each pause within it). In slide mode, the planned duration of the current slide follows the
  elapsed time (`1:30 / 5:00`) when the deck has pacing markers. The total starts when the control page first opens; **hold the clock**
  when the lecture actually begins to restart the total from `0:00`. Both survive reloads of the
  tab.
- Under the clock, **on time**, **slow down (−N min)** or **speed up (+N min)** compares the elapsed
  time with the planned interval of the current slide (two minutes of tolerance). The plan comes
  from pacing markers in the notes ([authoring.md](authoring.md#pacing-markers)); decks without
  them show no hint.
- During a session, the control page and the projection keep their **screen awake** while they
  are visible (the browser's Screen Wake Lock), so the projector's computer does not start its
  screen saver although nobody touches it. This needs HTTPS (or `localhost`) and a current
  browser.
- The thin progress bar under the slide only shows your position; tapping it does nothing (on
  other devices reveal.js would jump to the corresponding slide).

### Trying it from a phone

On a local network, start the server listening on all interfaces, with a password:

```bash
PRESENTATION_PASSWORD='choose-one' npx reveal-classroom serve --host 0.0.0.0
```

(PowerShell: `$env:PRESENTATION_PASSWORD='choose-one'; npx reveal-classroom serve --host 0.0.0.0`.)
Open `http://<computer's IP address>:3000/` on the phone. Your firewall may ask to allow Node.js.
For lectures, use an HTTPS deployment instead ([deployment.md](deployment.md)).

## Before the lecture

- Open the launcher and the deck once on the projector's computer to check the address and the
  network.
- With a server: confirm the password works; if the administrator runs automatic updates, ask
  them to pause updates during lectures (an update restarts the server and ends sessions).
- With a relay: start a test session and open the projection link on a second device.
- Keep the one-computer mode as a fallback: it only needs the launcher.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| *Session control is missing* on the control page | The link was opened in a different tab or device. Start the session again from the launcher, on this device, and follow the link in the same tab. |
| Projection: *the session does not exist or has expired* | The server restarted or eight hours passed. Start a new session; reload `/now` on the projector. |
| Projection: *Synchronization interrupted. Reconnecting…* | Network loss; it recovers by itself. Check the projector's connection if it persists. |
| *Incorrect password* | Ask the administrator; the password is set on the server (`PRESENTATION_PASSWORD`). |
| *The relay did not answer* | The relay is down or the address is wrong. Try again, use another relay, or present from one computer. |
| The speaker view (**S**) does not open | Allow pop-ups for the site; do not open decks as local files. |
| The projector's screen saver starts anyway | The projection tab must stay visible (not minimized or behind another tab) and the site must use HTTPS. An organization policy that locks the computer after a period of inactivity may still apply; then keep the one-computer mode, or move the mouse before the time runs out. |
| The phone shows the normal deck instead of the controller | It is a follower link (`?follow=1` or `/now`). Open the control link from the launcher on the phone. |
