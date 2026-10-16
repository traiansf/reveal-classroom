// reveal-classroom server: serves a built dist/ directory and synchronizes presentations.
// Self-contained on purpose (only socket.io is imported): deploy bundles ship it as a single file.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Server } from 'socket.io';

const here = dirname(fileURLToPath(import.meta.url));
const token = () => randomBytes(24).toString('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.map':'application/json' };
const escape = value => String(value).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
// Files of dist/ that may be served; decks only when listed in decks.json.
const PUBLIC_FILES = ['index.html', 'site.js', 'decks.json', 'presentation.js', 'launcher.js', 'relay-protocol.js', 'reveal-classroom.css', 'theme.css'];
const FALLBACK = {
  notFound:'File not found.', tooManyAttempts:'Too many attempts.', wrongPassword:'Incorrect password.',
  tooLarge:'Request too large.', badRequest:'Invalid request.', unknownDeck:'Unknown presentation.',
  tooManySessions:'Too many sessions.', methodNotAllowed:'Method not allowed.', cannotProcess:'The request cannot be processed.',
  sessionExpired:'The session does not exist or has expired.', deckMismatch:'The presentation does not match the session.',
  unauthorized:'Unauthorized control.', nowTitle:'Current presentation', nowHeading:'The presentation has not started yet',
  nowText:'There is no active session. This page checks again every 5 seconds; you can leave it open.'
};

export async function createPresentationServer({ dist = resolve(here, 'dist'), password, ttl = 8*60*60*1000, basePath = '' } = {}) {
  if (!password) throw new Error('A presenter password is required.');
  basePath = basePath.replace(/\/$/, '');
  if (basePath && (!/^\/[A-Za-z0-9_~/-]+$/.test(basePath) || basePath.includes('//'))) throw new Error('Invalid BASE_PATH.');
  const manifest = JSON.parse(await readFile(resolve(dist, 'decks.json'), 'utf8'));
  let site = {};
  try { site = JSON.parse(await readFile(resolve(dist, 'site.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const text = { ...FALLBACK, ...(site.strings && site.strings.server) };
  const decks = new Set(manifest.map(d => d.file));
  const rooms = new Map();
  let currentRoom = null;
  const attempts = new Map();
  const json = (res, code, body) => { res.writeHead(code, { 'Content-Type':'application/json', 'Cache-Control':'no-store' }); res.end(JSON.stringify(body)); };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (basePath && url.pathname === basePath) {
        res.writeHead(308, { Location:basePath + '/' + url.search });
        return res.end();
      }
      if (basePath && !url.pathname.startsWith(basePath + '/')) return json(res, 404, { error:text.notFound });
      url.pathname = url.pathname.slice(basePath.length);
      if (url.pathname === '/health') return json(res, 200, { ok:true });
      if (req.method === 'POST' && url.pathname === '/api/sessions') {
        const ip = req.socket.remoteAddress;
        const now = Date.now();
        for (const [k,v] of attempts) if (now-v.since > 60000) attempts.delete(k);
        const attempt = attempts.get(ip) || { count:0, since:now };
        attempts.set(ip, attempt);
        if (++attempt.count > 20) return json(res, 429, { error:text.tooManyAttempts });
        if (!equal(req.headers.authorization, 'Bearer ' + password)) return json(res, 401, { error:text.wrongPassword });
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 4096) return json(res, 413, { error:text.tooLarge });
        }
        let data;
        try { data = JSON.parse(body); } catch { return json(res, 400, { error:text.badRequest }); }
        if (!decks.has(data.deck)) return json(res, 400, { error:text.unknownDeck });
        if (rooms.size >= 1000) return json(res, 503, { error:text.tooManySessions });
        const room = token(), key = token();
        rooms.set(room, { key, deck:data.deck, expires:now+ttl, state:null });
        currentRoom = room;
        return json(res, 201, { room, key });
      }
      // Ending a session: DELETE /api/sessions/current with the presenter password, or
      // DELETE /api/sessions/<room> with that session's control key (or the password). Open
      // projections are told and return to the waiting page; /now shows it until a new session.
      if (req.method === 'DELETE' && /^[/]api[/]sessions[/][A-Za-z0-9_-]+$/.test(url.pathname)) {
        const ip = req.socket.remoteAddress;
        const now = Date.now();
        for (const [k,v] of attempts) if (now-v.since > 60000) attempts.delete(k);
        const attempt = attempts.get(ip) || { count:0, since:now };
        attempts.set(ip, attempt);
        if (++attempt.count > 20) return json(res, 429, { error:text.tooManyAttempts });
        const id = url.pathname.slice('/api/sessions/'.length);
        const room = id === 'current' ? currentRoom : id;
        const session = room && rooms.get(room);
        const auth = req.headers.authorization;
        const byPassword = equal(auth, 'Bearer ' + password);
        if (!byPassword && !(session && equal(auth, 'Bearer ' + session.key))) return json(res, 401, { error:text.unauthorized });
        if (!session || session.expires < now) return json(res, 404, { error:text.sessionExpired });
        endSession(room);
        res.writeHead(204, { 'Cache-Control':'no-store' });
        return res.end();
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error:text.methodNotAllowed });
      if (url.pathname === '/now' || url.pathname === '/now/') {
        const session = rooms.get(currentRoom);
        const headers = { 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' };
        if (session && session.expires > Date.now()) {
          const location = basePath + '/decks/' + encodeURIComponent(session.deck)
            + '?' + new URLSearchParams({ room:currentRoom, follow:'1' });
          res.writeHead(302, { ...headers, Location:location });
          return res.end();
        }
        res.writeHead(200, { ...headers, 'Content-Type':'text/html; charset=utf-8' });
        const title = (site.title ? site.title + ' — ' : '') + text.nowTitle;
        return res.end(req.method === 'HEAD' ? undefined : `<!doctype html>
<html lang="${escape(site.language || 'en')}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5"><title>${escape(title)}</title>
<body style="max-width:760px;margin:50px auto;padding:0 24px;font:18px/1.5 system-ui;color:#0a2145">
<h1>${escape(text.nowHeading)}</h1><p>${escape(text.nowText)}</p></body></html>`);
      }
      const path = decodeURIComponent(url.pathname);
      const relative = path === '/' ? 'index.html' : path.slice(1);
      const allowed = PUBLIC_FILES.includes(relative)
        || (/^(decks|audience)\//.test(relative) && decks.has(relative.replace(/^(decks|audience)\//, '')))
        || /^vendor\/(reveal|notes)\/[a-zA-Z0-9_./-]+$/.test(relative);
      if (!allowed || relative.split('/').includes('..')) return json(res, 404, { error:text.notFound });
      let content = await readFile(resolve(dist, relative));
      if (relative.startsWith('decks/') && url.searchParams.has('follow')) {
        content = Buffer.from(content.toString('utf8').replace(/<aside\b[^>]*class="notes"[^>]*>[\s\S]*?<\/aside>/g, ''));
      }
      res.writeHead(200, { 'Content-Type':types[extname(relative)] || 'application/octet-stream',
        'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!res.headersSent) json(res, error.code === 'ENOENT' ? 404 : 400, { error:text.cannotProcess });
      else res.end();
    }
  });
  const io = new Server(server, { path:basePath + '/socket.io', maxHttpBufferSize:8192 });
  const endSession = room => {
    io.in(room).emit('ended');
    io.in(room).disconnectSockets();
    rooms.delete(room);
    if (currentRoom === room) currentRoom = null;
  };
  io.use((socket, next) => {
    const { room, key, follower, deck } = socket.handshake.auth;
    const session = rooms.get(room);
    if (!session || session.expires < Date.now()) return next(new Error(text.sessionExpired));
    if (session.deck !== deck) return next(new Error(text.deckMismatch));
    if (follower !== true && !equal(key, session.key)) return next(new Error(text.unauthorized));
    socket.data = { room, follower:follower === true };
    next();
  });
  io.on('connection', socket => {
    const { room, follower } = socket.data;
    socket.join(room);
    const session = rooms.get(room);
    if (follower && session.state) socket.emit('state', session.state);
    socket.on('state', raw => {
      if (follower || !raw || session.expires < Date.now()) return;
      if (![raw.indexh,raw.indexv].every(n => Number.isInteger(n) && n >= 0 && n < 10000)) return;
      const indexf = raw.indexf ?? -1;
      if (!Number.isInteger(indexf) || indexf < -1 || indexf > 10000) return;
      session.state = { indexh:raw.indexh, indexv:raw.indexv, indexf, paused:raw.paused === true, overview:false };
      socket.to(room).emit('state', session.state);
    });
  });
  const cleanup = setInterval(() => {
    for (const [id,session] of rooms) {
      if (session.expires < Date.now()) { io.in(id).disconnectSockets(); rooms.delete(id); }
    }
  }, 60000);
  cleanup.unref();
  server.on('close', () => clearInterval(cleanup));
  return { server, io };
}

// Starts the service from environment-style options; used by `reveal-classroom serve` and `node server.mjs`.
export async function startServer({ dist = resolve(here, 'dist'), host = '127.0.0.1', port = 3000, basePath = '', password, ttlHours = 8 } = {}) {
  if (host !== '127.0.0.1' && host !== 'localhost' && !password) {
    throw new Error('Set PRESENTATION_PASSWORD before listening on a network interface.');
  }
  const temporary = !password;
  password ||= token();
  const { server, io } = await createPresentationServer({ dist, password, basePath, ttl:ttlHours*60*60*1000 });
  await new Promise(done => server.listen(port, host, done));
  console.log('Presentations: http://' + host + ':' + server.address().port + basePath + '/');
  if (temporary) console.log('Temporary presenter password for testing synchronization: ' + password);
  return { server, io };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const env = process.env;
  await startServer({ dist:env.DIST ? resolve(env.DIST) : undefined, host:env.HOST || '127.0.0.1',
    port:Number(env.PORT || 3000), basePath:env.BASE_PATH || '', password:env.PRESENTATION_PASSWORD,
    ttlHours:Number(env.SESSION_TTL_HOURS || 8) });
}
