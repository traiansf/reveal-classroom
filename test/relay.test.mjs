import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';

await import('../client/relay-protocol.js');
const relay = globalThis.RevealClassroomRelay;
const sha256 = value => createHash('sha256').update(value).digest('hex');

// The logic of the official reveal.js Multiplex server (reveal/multiplex, index.js), on Socket.IO 4.
async function startRelay() {
  const server = http.createServer((req, res) => {
    if (req.url === '/token') {
      const secret = randomBytes(16).toString('hex');
      res.writeHead(200, { 'Content-Type':'application/json' });
      return res.end(JSON.stringify({ secret, socketId:sha256(secret) }));
    }
    res.writeHead(404); res.end();
  });
  const io = new Server(server);
  io.on('connection', socket => socket.on('multiplex-statechanged', data => {
    if (!data || !data.secret) return;
    if (sha256(data.secret) === data.socketId) {
      data.secret = null;
      socket.broadcast.emit(data.socketId, data);
    }
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { url:`http://127.0.0.1:${server.address().port}/`, close:() => new Promise(done => io.close(done)) };
}

test('state sanitization keeps slide coordinates and the pause screen only', () => {
  assert.deepEqual(relay.sanitizeState({ indexh:3, indexv:1, indexf:2, paused:true, overview:true }),
    { indexh:3, indexv:1, indexf:2, paused:true, overview:false });
  assert.deepEqual(relay.sanitizeState({ indexh:0, indexv:0 }), { indexh:0, indexv:0, indexf:-1, paused:false, overview:false });
  for (const bad of [null, 'x', { indexh:-1, indexv:0 }, { indexh:1.5, indexv:0 }, { indexh:0, indexv:0, indexf:-2 }, { indexh:20000, indexv:0 }]) {
    assert.equal(relay.sanitizeState(bad), null);
  }
});

test('relay URLs, tokens and messages', () => {
  assert.equal(relay.tokenUrl('https://relay.example/'), 'https://relay.example/token');
  assert.equal(relay.tokenUrl('https://relay.example/multiplex'), 'https://relay.example/multiplex/token');
  assert.equal(relay.clientScriptUrl('https://relay.example/x/?q=1'), 'https://relay.example/x/socket.io/socket.io.js');
  assert.deepEqual(relay.connection('https://relay.example/'), { origin:'https://relay.example', path:'/socket.io' });
  assert.deepEqual(relay.connection('https://relay.example/multiplex/'), { origin:'https://relay.example', path:'/multiplex/socket.io' });
  assert.throws(() => relay.tokenUrl('ftp://relay.example/'));
  const secret = randomBytes(16).toString('hex');
  assert.ok(relay.isValidToken({ secret, socketId:sha256(secret) }));
  assert.ok(!relay.isValidToken({ secret, socketId:'abc' }));
  assert.ok(!relay.isValidToken(null));
  const id = sha256(secret);
  const message = relay.controllerMessage({ indexh:2, indexv:0, overview:true }, secret, id);
  assert.deepEqual(message, { state:{ indexh:2, indexv:0, indexf:-1, paused:false, overview:false }, secret, socketId:id });
  assert.equal(relay.acceptMessage({ ...message, socketId:sha256('other') }, id), null);
  assert.deepEqual(relay.acceptMessage({ ...message, secret:null }, id), message.state);
});

test('a Multiplex-compatible relay forwards only states signed with the session secret', { timeout:15000 }, async t => {
  const server = await startRelay();
  const sockets = [];
  t.after(async () => { sockets.forEach(s => s.disconnect()); await server.close(); });
  const open = () => { const s = connect(relay.connection(server.url).origin, { path:relay.connection(server.url).path, reconnection:false }); sockets.push(s); return s; };
  const token = await (await fetch(relay.tokenUrl(server.url))).json();
  assert.ok(relay.isValidToken(token));
  const controller = open(), follower = open(), intruder = open();
  await Promise.all([controller, follower, intruder].map(s => once(s, 'connect')));
  const received = [];
  follower.on(token.socketId, message => received.push(message));
  // A forged message (wrong secret) is dropped by the relay.
  intruder.emit(relay.EVENT, relay.controllerMessage({ indexh:9, indexv:0 }, 'f'.repeat(32), token.socketId));
  const delivered = once(follower, token.socketId);
  controller.emit(relay.EVENT, relay.controllerMessage({ indexh:4, indexv:0, indexf:1 }, token.secret, token.socketId));
  const [message] = await delivered;
  assert.equal(message.secret, null);
  assert.deepEqual(relay.acceptMessage(message, token.socketId), { indexh:4, indexv:0, indexf:1, paused:false, overview:false });
  await new Promise(done => setTimeout(done, 200));
  assert.equal(received.length, 1);
});
