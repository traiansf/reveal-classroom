// Messages of the reveal.js Multiplex protocol (https://github.com/reveal/multiplex), shared by the
// browser client and the Node tests. The controller emits EVENT with { state, secret, socketId };
// the relay checks that sha256(secret) equals socketId and broadcasts the message, with the secret
// removed, as an event named after the socketId. Followers only ever see the socketId.
// A classic script for browsers (window.RevealClassroomRelay); Node tests import it for its side effect.
(function (root, factory) {
  root.RevealClassroomRelay = factory();
}(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  var EVENT = 'multiplex-statechanged';
  var ID = /^[0-9a-f]{64}$/;
  var SECRET = /^[0-9a-f]{32,128}$/;

  // Only slide coordinates and the pause screen are forwarded; the overview is never mirrored.
  function sanitizeState(state) {
    if (!state || typeof state !== 'object') return null;
    var h = state.indexh, v = state.indexv;
    var f = state.indexf === undefined || state.indexf === null ? -1 : state.indexf;
    var valid = function (n, min) { return Number.isInteger(n) && n >= min && n <= 10000; };
    if (!valid(h, 0) || !valid(v, 0) || !valid(f, -1)) return null;
    return { indexh: h, indexv: v, indexf: f, paused: state.paused === true, overview: false };
  }

  function controllerMessage(state, secret, id) {
    return { state: sanitizeState(state), secret: secret, socketId: id };
  }

  // Returns the state to apply, or null for messages of other sessions and malformed input.
  function acceptMessage(message, id) {
    if (!message || typeof message !== 'object' || message.socketId !== id) return null;
    return sanitizeState(message.state);
  }

  function isValidToken(token) {
    return !!token && typeof token.secret === 'string' && SECRET.test(token.secret)
      && typeof token.socketId === 'string' && ID.test(token.socketId);
  }

  function base(url) {
    var parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('The relay URL must use http or https.');
    parsed.search = '';
    parsed.hash = '';
    if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
    return parsed;
  }

  // A relay may live under a path prefix; Socket.IO then needs an explicit path, not a namespace.
  function connection(url) {
    var parsed = base(url);
    return { origin: parsed.origin, path: parsed.pathname + 'socket.io' };
  }

  return {
    EVENT: EVENT,
    ID: ID,
    sanitizeState: sanitizeState,
    controllerMessage: controllerMessage,
    acceptMessage: acceptMessage,
    isValidToken: isValidToken,
    tokenUrl: function (url) { return new URL('token', base(url)).href; },
    clientScriptUrl: function (url) { return new URL('socket.io/socket.io.js', base(url)).href; },
    connection: connection
  };
}));
