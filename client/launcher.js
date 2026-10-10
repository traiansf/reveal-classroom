(async function () {
  const site = window.REVEAL_CLASSROOM || {};
  const text = { loadError:'The list of presentations cannot be loaded.', noDecks:'No presentations are available yet.',
    wrongPassword:'Incorrect password.', sessionFailed:'The session cannot be started.',
    sessionReady:'Session ready.', relayFailed:'The relay did not answer.', relayReady:'Relay session ready.',
    ...(site.strings && site.strings.launcher) };
  const relayProtocol = window.RevealClassroomRelay;
  const select = document.getElementById('deck');
  const message = document.getElementById('message');
  const form = document.getElementById('remote');
  const newSession = document.getElementById('new-session');
  try {
    const response = await fetch('decks.json');
    if (!response.ok) throw new Error(text.loadError);
    const decks = await response.json();
    for (const deck of decks) select.add(new Option(deck.title, deck.file));
    if (!decks.length) throw new Error(text.noDecks);
    // Optional preselection: the deck whose file name matches the pattern with the largest number,
    // e.g. "^curs-(\\d+)" selects the latest lecture rather than the first deck in the list.
    const pattern = site.launcher && site.launcher.preselect;
    if (pattern) {
      const matches = decks.map(d => [d.file, new RegExp(pattern).exec(d.file)]).filter(([, m]) => m);
      if (matches.length) select.value = matches.reduce((a, b) => Number(b[1][1]) > Number(a[1][1]) ? b : a)[0];
    }
  } catch (error) { message.textContent = error.message; }
  document.getElementById('local').onclick = () => window.open('decks/' + select.value, '_blank');

  // Sessions on this server: only offered when the page is served by reveal-classroom itself.
  try {
    const health = await fetch('health', { cache:'no-store' });
    if (health.ok && (await health.json()).ok === true) document.getElementById('server-section').hidden = false;
  } catch { /* static hosting or a local file: no server sessions */ }
  newSession.onclick = () => {
    form.hidden = false;
    newSession.hidden = true;
    document.getElementById('links').hidden = true;
    message.textContent = '';
    document.getElementById('password').focus();
  };
  form.onsubmit = async event => {
    event.preventDefault();
    message.textContent = '';
    try {
      const response = await fetch('api/sessions', { method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + document.getElementById('password').value },
        body:JSON.stringify({ deck:select.value }) });
      if (!response.ok) throw new Error(response.status === 401 ? text.wrongPassword : text.sessionFailed);
      const { room, key } = await response.json();
      sessionStorage.setItem('rc-room-' + room, key);
      const url = new URL('decks/' + select.value, location.href);
      url.searchParams.set('room', room);
      document.getElementById('presenter').href = url.href;
      const audienceUrl = new URL('now', location.href).href;
      document.getElementById('audience').href = audienceUrl;
      document.getElementById('audience-url').value = audienceUrl;
      document.getElementById('links').hidden = false;
      // A successful AJAX login hides the form without clearing its credentials,
      // allowing password managers to detect success and offer to save them.
      form.hidden = true;
      newSession.hidden = false;
      message.textContent = text.sessionReady;
    } catch (error) { message.textContent = error.message; }
  };

  // Sessions on a Multiplex-compatible relay: the secret stays in this tab, the audience link carries the id.
  const configuredRelay = site.relay && site.relay.url;
  if (configuredRelay && relayProtocol) {
    const relayInput = document.getElementById('relay-url');
    const relayMessage = document.getElementById('relay-message');
    relayInput.value = configuredRelay;
    document.getElementById('relay-section').hidden = false;
    document.getElementById('relay-start').onclick = async () => {
      relayMessage.textContent = '';
      document.getElementById('relay-links').hidden = true;
      try {
        const relayUrl = relayInput.value.trim();
        const response = await fetch(relayProtocol.tokenUrl(relayUrl), { cache:'no-store' });
        const token = response.ok ? await response.json() : null;
        if (!relayProtocol.isValidToken(token)) throw new Error(text.relayFailed);
        sessionStorage.setItem('rc-relay-' + token.socketId, token.secret);
        const params = new URLSearchParams({ id:token.socketId });
        if (relayUrl !== configuredRelay) params.set('relay', relayUrl);
        document.getElementById('relay-presenter').href = new URL('decks/' + select.value + '?' + params, location.href).href;
        params.set('follow', '1');
        const audienceUrl = new URL('audience/' + select.value + '?' + params, location.href).href;
        document.getElementById('relay-audience').href = audienceUrl;
        document.getElementById('relay-audience-url').value = audienceUrl;
        document.getElementById('relay-links').hidden = false;
        relayMessage.textContent = text.relayReady;
      } catch (error) { relayMessage.textContent = error.message === text.relayFailed ? error.message : text.relayFailed; }
    };
  }
})();
