(async function () {
  // Instance settings and interface strings come from site.js, which the build injects into every deck.
  const site = window.REVEAL_CLASSROOM || {};
  const strings = site.strings || {};
  const text = {
    navigation:'Presentation controls', previous:'Back', next:'Next', timerTitle:'Tap to restart the timer',
    timerLabel:'Elapsed time: ', timerConfirm:'Restart the timer from 0:00?', notes:'Speaker notes',
    noNotes:'This slide has no notes.', onTime:'on time', slowDown:'slow down (−{min} min)', speedUp:'speed up (+{min} min)',
    missingKey:'Session control is missing. Start a session from the main page.',
    disconnected:'Synchronization interrupted. Reconnecting…', unavailable:'Synchronization unavailable: ',
    relayMissingSecret:'The relay control secret is missing in this tab. Start a relay session from the main page.',
    ...strings.controller, ...strings.sync
  };
  const escape = value => String(value).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');

  const query = new URLSearchParams(location.search);
  const room = query.get('room');                    // session on this server
  const relayId = query.get('id');                   // session on a Multiplex-compatible relay
  const relayUrl = query.get('relay') || (site.relay && site.relay.url) || '';
  const follower = query.has('follow');
  const receiver = query.has('receiver'); // Speaker-view previews must never open synchronization sockets.
  const mobileScreen = matchMedia('(pointer: coarse), (max-width: 600px)');
  const mobileController = () => !follower && !receiver && mobileScreen.matches;

  let status = document.getElementById('connection-status');
  if (!status) {
    status = document.createElement('div');
    status.id = 'connection-status';
    status.setAttribute('role', 'status');
    status.hidden = true;
    document.body.append(status);
  }
  const showStatus = message => { status.textContent = message; status.hidden = !message; };
  const loadScript = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(src));
    document.head.append(script);
  });

  // Optional slide backgrounds by class, e.g. { "transition": "#0a2145" } for section-divider slides.
  for (const [className, color] of Object.entries(site.slideBackgrounds || {})) {
    document.querySelectorAll('section.' + CSS.escape(className)).forEach(s => s.dataset.backgroundColor = color);
  }
  if (follower) document.querySelectorAll('aside.notes').forEach(n => n.remove());
  let panel;
  if (!follower && !receiver) {
    panel = document.createElement('div');
    panel.id = 'mobile-presenter';
    panel.hidden = !mobileController();
    // Notes first, buttons at the bottom of the screen: away from the progress bar under the slide.
    panel.innerHTML = `<section id="mobile-notes" aria-label="${escape(text.notes)}" tabindex="0">
      <div id="mobile-notes-content"></div></section><nav aria-label="${escape(text.navigation)}">
      <button type="button" id="previous-slide">${escape(text.previous)}</button>
      <button type="button" id="mobile-timer" role="timer" title="${escape(text.timerTitle)}">0:00</button>
      <button type="button" id="next-slide">${escape(text.next)}</button>
      <span id="mobile-pace" hidden></span>
    </nav>`;
    document.body.append(panel);
  }
  document.body.classList.toggle('mobile-controller', mobileController());
  const plugins = !follower && typeof RevealNotes !== 'undefined' ? [RevealNotes] : [];
  await Reveal.initialize({
    width:1280, height:720, margin:0.025, hash:true, slideNumber:'c/t',
    transition:'none', backgroundTransition:'none', center:true, progress:true,
    ...site.reveal,
    controls:!follower && !mobileController(), keyboard:!follower, touch:!follower,
    embedded:mobileController(), scrollActivationWidth:0,
    overview:!follower, plugins
  });
  // Scale only dense slides; headings, diagrams and tables retain their proportions.
  if (site.fitText !== false) {
    const limit = Reveal.getConfig().height - 40;
    for (const slide of Reveal.getSlides()) {
      if (slide.classList.contains('titlepage') || slide.classList.contains('transition')) continue;
      const oldDisplay = slide.style.display;
      slide.style.display = 'block';
      const base = parseFloat(getComputedStyle(slide).fontSize) || 28;
      for (let size = base; size >= Math.round(base * 0.78); size--) {
        slide.style.fontSize = size + 'px';
        if (slide.scrollHeight <= limit) break;
      }
      if (parseFloat(slide.style.fontSize) === base) slide.style.removeProperty('font-size');
      slide.style.display = oldDisplay;
    }
    Reveal.layout();
  }
  // Hidden pacing markers in the notes: []{.pace at=25} is the planned start minute of a slide,
  // []{.pace dur=8} its planned duration, of=100 the planned total. Unmarked slides share the rest evenly.
  const slides = Reveal.getSlides();
  const at = [], dur = [];
  let total;
  slides.forEach((slide, i) => {
    for (const mark of slide.querySelectorAll('aside.notes .pace')) {
      if (mark.dataset.at) at[i] = Number(mark.dataset.at);
      if (mark.dataset.dur) dur[i] = Number(mark.dataset.dur);
      if (mark.dataset.of) total = Number(mark.dataset.of);
      const parent = mark.parentElement;
      mark.remove();
      if (parent.matches('p') && !parent.textContent.trim() && !parent.children.length) parent.remove();
    }
  });
  let plan; // plan[i] is the minute at which slide i should start; plan[slides.length] is the end.
  if (total !== undefined) {
    const anchors = at[0] === undefined ? [[0, 0]] : [];
    at.forEach((minute, i) => anchors.push([i, minute]));
    anchors.push([slides.length, total]);
    plan = [];
    for (let k = 0; k + 1 < anchors.length; k++) {
      const [a, from] = anchors[k], [b, to] = anchors[k + 1];
      const span = Math.max(0, to - from);
      let fixed = 0, free = 0;
      for (let i = a; i < b; i++) dur[i] === undefined ? free++ : fixed += dur[i];
      const share = free ? Math.max(0, span - fixed) / free : 0;
      const scale = fixed > span ? span / fixed : 1;
      for (let i = a, t = from; i < b; i++) {
        plan[i] = t;
        t += dur[i] === undefined ? share : dur[i] * scale;
      }
    }
    plan[slides.length] = total;
  }
  if (panel) {
    const previous = document.getElementById('previous-slide');
    const next = document.getElementById('next-slide');
    const notes = document.getElementById('mobile-notes');
    let lastSlide;
    const updatePanel = () => {
      const slide = Reveal.getCurrentSlide();
      const fragments = Reveal.availableFragments();
      previous.disabled = Reveal.isFirstSlide() && !fragments.prev;
      next.disabled = Reveal.isLastSlide() && !fragments.next;
      if (slide !== lastSlide) {
        document.getElementById('mobile-notes-content').innerHTML = Reveal.getSlideNotes(slide) || '<p>' + escape(text.noNotes) + '</p>';
        notes.scrollTop = 0;
        lastSlide = slide;
      }
      updatePace();
    };
    // Elapsed time survives reloads of the same tab; tapping the timer restarts it when the lecture begins.
    const timer = document.getElementById('mobile-timer');
    const timerKey = 'rc-timer-' + (room || relayId || location.pathname);
    const storage = { get:() => { try { return Number(sessionStorage.getItem(timerKey)); } catch { return 0; } },
      set:value => { try { sessionStorage.setItem(timerKey, value); } catch {} } };
    let started = storage.get() || Date.now();
    storage.set(started);
    // Minutes and quarter minutes, matching the minute checkpoints in the notes.
    const updateTimer = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
      timer.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60 - seconds % 15).padStart(2, '0');
      timer.setAttribute('aria-label', text.timerLabel + timer.textContent);
      updatePace();
    };
    // Compares the elapsed time with the current slide's planned interval, allowing two minutes either way.
    const pace = document.getElementById('mobile-pace');
    function updatePace() {
      if (!plan) return;
      const i = slides.indexOf(Reveal.getCurrentSlide());
      const elapsed = (Date.now() - started) / 60000;
      const early = plan[i] - elapsed, late = elapsed - plan[i + 1];
      const [state, message] = late > 2 ? ['faster', text.speedUp.replace('{min}', Math.round(late))]
        : early > 2 ? ['slower', text.slowDown.replace('{min}', Math.round(early))] : ['on-time', text.onTime];
      pace.dataset.pace = state;
      pace.textContent = message;
      pace.hidden = false;
    }
    timer.onclick = () => {
      if (!confirm(text.timerConfirm)) return;
      started = Date.now();
      storage.set(started);
      updateTimer();
    };
    updateTimer();
    setInterval(updateTimer, 1000);
    previous.onclick = () => Reveal.prev();
    next.onclick = () => Reveal.next();
    for (const event of ['slidechanged', 'fragmentshown', 'fragmenthidden']) Reveal.on(event, updatePanel);
    updatePanel();
    mobileScreen.addEventListener('change', () => {
      const mobile = mobileController();
      document.body.classList.toggle('mobile-controller', mobile);
      panel.hidden = !mobile;
      Reveal.configure({ embedded:mobile, controls:!mobile });
      Reveal.layout();
    });
  }
  if (receiver) return;
  const changes = ['slidechanged', 'fragmentshown', 'fragmenthidden', 'paused', 'resumed'];

  // Synchronization through this server: per-session control key, retained state for late joiners.
  if (room) {
    const key = follower ? undefined : sessionStorage.getItem('rc-room-' + room);
    if (!follower && !key) { showStatus(text.missingKey); return; }
    try {
      if (typeof io === 'undefined') await loadScript(new URL('../socket.io/socket.io.js', location.href).href);
    } catch { showStatus(text.unavailable + 'socket.io'); return; }
    const socket = io({ path:new URL('../socket.io', location.href).pathname,
      auth:{ room, key, follower, deck:location.pathname.split('/').pop() } });
    let applying = false;
    const publish = () => {
      if (!follower && !applying && socket.connected) socket.emit('state', Reveal.getState());
    };
    socket.on('connect', () => { showStatus(''); publish(); });
    socket.on('disconnect', () => showStatus(text.disconnected));
    socket.on('connect_error', error => showStatus(text.unavailable + error.message));
    socket.on('state', state => {
      if (!follower) return;
      applying = true;
      Reveal.setState(state);
      applying = false;
    });
    for (const event of changes) Reveal.on(event, publish);
    return;
  }

  // Synchronization through a Multiplex-compatible relay: the relay keeps no state, so the controller
  // repeats its position every few seconds for projections that join or reconnect later.
  if (relayId) {
    let relay;
    try {
      await loadScript(new URL('../relay-protocol.js', location.href).href);
      relay = window.RevealClassroomRelay;
      if (!relay.ID.test(relayId) || !relayUrl) throw new Error('relay');
      await loadScript(relay.clientScriptUrl(relayUrl)); // the relay's own Socket.IO client, matching its version
    } catch { showStatus(text.unavailable + 'relay'); return; }
    const secret = follower ? null : sessionStorage.getItem('rc-relay-' + relayId);
    if (!follower && !secret) { showStatus(text.relayMissingSecret); return; }
    const { origin, path } = relay.connection(relayUrl);
    const socket = io.connect(origin, { path });
    const post = () => {
      if (!follower && socket.connected) socket.emit(relay.EVENT, relay.controllerMessage(Reveal.getState(), secret, relayId));
    };
    socket.on('connect', () => { showStatus(''); post(); });
    socket.on('disconnect', () => showStatus(text.disconnected));
    socket.on('connect_error', error => showStatus(text.unavailable + ((error && error.message) || 'relay')));
    if (follower) {
      socket.on(relayId, message => {
        const state = relay.acceptMessage(message, relayId);
        if (state) Reveal.setState(state);
      });
    } else {
      for (const event of changes) Reveal.on(event, post);
      setInterval(post, Math.max(2, Number(site.relay && site.relay.heartbeatSeconds) || 5) * 1000);
    }
  }
})();
