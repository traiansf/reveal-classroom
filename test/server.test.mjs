import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { io as connect } from 'socket.io-client';
import { createPresentationServer } from '../server.mjs';
import { makeDist } from './helpers.mjs';

const rawStatus = (port, path) => new Promise((resolve, reject) => {
  http.get({ host:'127.0.0.1', port, path }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
});

for (const basePath of ['', '/~presenter/slides']) {
test('short address: waiting page, latest session, expiry: ' + (basePath || '/'), { timeout:15000 }, async t => {
  const dist = await makeDist();
  t.after(dist.cleanup);
  const { server, io } = await createPresentationServer({ dist:dist.dir, password:'test-only', basePath, ttl:1000 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => io.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port + basePath;
  const now = () => fetch(url + '/now', { redirect:'manual' });
  const waiting = await now();
  assert.equal(waiting.status, 200);
  const page = await waiting.text();
  assert.match(page, /http-equiv="refresh"/);
  assert.match(page, new RegExp(dist.strings.server.nowHeading));
  const create = async (deck, password = 'test-only') => fetch(url + '/api/sessions', {
    method:'POST', headers:{ Authorization:'Bearer ' + password, 'Content-Type':'application/json' }, body:JSON.stringify({ deck })
  });
  const first = await (await create('one.html')).json();
  assert.match((await now()).headers.get('location'), new RegExp(first.room));
  const latest = await (await create('two.html')).json();
  assert.equal((await create('one.html', 'wrong')).status, 401);
  assert.equal((await create('unknown.html')).status, 400);
  const redirect = await now();
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('cache-control'), 'no-store');
  assert.equal(redirect.headers.get('location'), basePath + '/decks/two.html?room=' + latest.room + '&follow=1');
  assert.ok(!redirect.headers.get('location').includes(latest.key));
  const html = await (await fetch(url + '/now')).text();
  assert.doesNotMatch(html, /<aside class="notes"/);
  const head = await fetch(url + '/now/', { method:'HEAD', redirect:'manual' });
  assert.equal(head.status, 302);
  assert.equal(await head.text(), '');
  await new Promise(resolve => setTimeout(resolve, 1100));
  const expired = await now();
  assert.equal(expired.status, 200);
  assert.equal(expired.headers.get('location'), null);
  assert.match(await expired.text(), /http-equiv="refresh"/);
});

test('control, isolation, fragments, reconnection: ' + (basePath || '/'), { timeout:15000 }, async t => {
  const dist = await makeDist();
  t.after(dist.cleanup);
  const { server, io } = await createPresentationServer({ dist:dist.dir, password:'test-only', basePath });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const url = origin + basePath;
  const sockets = [];
  t.after(async () => { sockets.forEach(s => s.disconnect()); await new Promise(resolve => io.close(resolve)); });
  const deck = 'two.html';
  const create = async (password = 'test-only') => fetch(url + '/api/sessions', {
    method:'POST', headers:{ Authorization:'Bearer '+password, 'Content-Type':'application/json' }, body:JSON.stringify({ deck })
  });
  assert.equal((await create('wrong')).status, 401);
  const room = await (await create()).json();
  const otherRoom = await (await create()).json();
  const socket = auth => { const s = connect(origin, { path:basePath + '/socket.io', auth:{ deck, ...auth }, reconnection:false }); sockets.push(s); return s; };
  const denied = socket({ room:room.room, key:'wrong' });
  assert.equal((await once(denied, 'connect_error'))[0].message, dist.strings.server.unauthorized);
  const wrongDeck = socket({ room:room.room, follower:true, deck:'one.html' });
  assert.equal((await once(wrongDeck, 'connect_error'))[0].message, dist.strings.server.deckMismatch);
  const master = socket(room);
  await once(master, 'connect');
  const follower = socket({ room:room.room, follower:true });
  await once(follower, 'connect');
  const isolated = socket({ room:otherRoom.room, follower:true });
  await once(isolated, 'connect');
  let leaked = false;
  isolated.on('state', () => { leaked = true; });
  const expected = { indexh:12, indexv:0, indexf:2, paused:false, overview:false };
  let state = once(follower, 'state');
  master.emit('state', expected);
  assert.deepEqual((await state)[0], expected);
  follower.emit('state', { ...expected, indexh:999 });
  // A new client receives retained master state, never follower input.
  const late = socket({ room:room.room, follower:true });
  assert.deepEqual((await once(late, 'state'))[0], expected);
  follower.disconnect();
  state = once(late, 'state');
  master.emit('state', { ...expected, indexh:13, indexf:-1, paused:true });
  const latest = (await state)[0];
  state = once(follower, 'state');
  follower.connect();
  assert.deepEqual((await state)[0], latest);
  assert.equal(leaked, false);
  // Followers never receive notes; the presenter's copy keeps them.
  assert.doesNotMatch(await (await fetch(url + '/decks/' + deck + '?follow=1')).text(), /<aside class="notes"/);
  assert.match(await (await fetch(url + '/decks/' + deck)).text(), /<aside class="notes"/);
  assert.doesNotMatch(await (await fetch(url + '/audience/' + deck)).text(), /<aside class="notes"/);
  for (const file of ['', 'site.js', 'decks.json', 'relay-protocol.js', 'socket.io/socket.io.js']) {
    assert.equal((await fetch(url + '/' + file)).status, 200, file);
  }
  for (const file of ['server.mjs', 'site.json', 'decks/unreleased.html', 'audience/unreleased.html']) {
    assert.equal((await fetch(url + '/' + file)).status, 404, file);
  }
  // Raw paths: fetch would normalize the dot segments before sending them.
  for (const path of ['/vendor/reveal/../../server.mjs', '/vendor/reveal/%2e%2e/%2e%2e/server.mjs', '/decks/..%2fserver.mjs']) {
    assert.equal(await rawStatus(server.address().port, basePath + path), 404, path);
  }
  if (basePath) {
    const redirect = await fetch(url, { redirect:'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), basePath + '/');
    assert.equal((await fetch(origin + '/health')).status, 404);
  }
});
}

test('interface strings follow the instance language', { timeout:10000 }, async t => {
  const dist = await makeDist({ language:'ro' });
  t.after(dist.cleanup);
  const { server, io } = await createPresentationServer({ dist:dist.dir, password:'test-only' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => io.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port;
  const page = await (await fetch(url + '/now')).text();
  assert.match(page, /lang="ro"/);
  assert.match(page, /Prezentarea nu a început încă/);
  const wrong = await fetch(url + '/api/sessions', { method:'POST', headers:{ Authorization:'Bearer x' }, body:'{}' });
  assert.deepEqual(await wrong.json(), { error:'Parolă incorectă.' });
});

test('a password is required and BASE_PATH is validated', async () => {
  const dist = await makeDist();
  try {
    await assert.rejects(createPresentationServer({ dist:dist.dir }), /password/);
    await assert.rejects(createPresentationServer({ dist:dist.dir, password:'x', basePath:'/a b' }), /BASE_PATH/);
  } finally { await dist.cleanup(); }
});
