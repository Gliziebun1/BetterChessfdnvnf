'use strict';
// BetterChess server: static files + Elo matchmaking + move relay.
// Zero dependencies. Run: node server.js   (env: PORT, SITE_URL)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = +process.env.PORT || 3000;
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');
const PUB = path.join(__dirname, 'public');
const GRACE_MS = 15000; // reconnect grace before a dropped player counts as gone

const clients = new Map(); // id -> client
const games = new Map();   // gid -> game

const clampR = x => Number.isFinite(+x) ? Math.max(100, Math.min(3000, Math.round(+x))) : 1200;
const cleanName = x => (typeof x === 'string' ? x : '').replace(/[^\w .\-]/g, '').trim().slice(0, 16) || 'Player';
const validId = x => typeof x === 'string' && /^c[a-z0-9]{8,40}$/.test(x);
const rangeAt = (ms, cap) => Math.min(cap, 50 + 50 * Math.floor(ms / 3000));

function send(c, event, data) {
  if (c && c.res && !c.res.writableEnded) {
    try { c.res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); } catch (e) {}
  }
}

function lobbyFor(c) {
  const q = [];
  let searching = 0;
  for (const o of clients.values()) {
    if (o.queuedAt) {
      searching++;
      if (o !== c) q.push({ n: o.name, r: o.rating });
    }
  }
  return { online: clients.size, searching, q: q.slice(0, 30) };
}
let lobbyTimer = null;
function pushLobby() {
  if (lobbyTimer) return;
  lobbyTimer = setTimeout(() => {
    lobbyTimer = null;
    for (const c of clients.values()) if (c.res) send(c, 'lobby', lobbyFor(c));
  }, 250);
}

function endGameFor(c, reason) {
  // c is leaving/resigning/disconnected: notify opponent, destroy game
  const g = c.game && games.get(c.game);
  c.game = null;
  if (!g) return;
  games.delete(g.id);
  const oid = g.w === c.id ? g.b : g.w;
  const o = clients.get(oid);
  if (o && o.game === g.id) {
    o.game = null;
    send(o, 'end', { reason });
  }
}

function dropClient(c) {
  if (c.queuedAt) c.queuedAt = null;
  endGameFor(c, 'left');
  clients.delete(c.id);
  pushLobby();
}

function matchLoop() {
  const now = Date.now();
  const q = [...clients.values()].filter(c => c.queuedAt && c.res && !c.game)
    .sort((a, b) => a.queuedAt - b.queuedAt);
  const used = new Set();
  const rg = c => rangeAt(now - c.queuedAt, c.cap);
  for (const a of q) {
    if (used.has(a.id)) continue;
    let best = null, bd = 1e9;
    for (const b of q) {
      if (b === a || used.has(b.id)) continue;
      const d = Math.abs(a.rating - b.rating);
      if (d <= Math.min(rg(a), rg(b)) && d < bd) { bd = d; best = b; }
    }
    if (!best) continue;
    used.add(a.id); used.add(best.id);
    const gid = 'g' + Math.random().toString(36).slice(2, 10);
    const aWhite = Math.random() < 0.5;
    const g = { id: gid, w: aWhite ? a.id : best.id, b: aWhite ? best.id : a.id, turn: 'w', moves: { w: [], b: [] } };
    games.set(gid, g);
    for (const [p, o] of [[a, best], [best, a]]) {
      p.queuedAt = null; p.game = gid;
      send(p, 'match', { g: gid, c: g.w === p.id ? 'w' : 'b', opp: o.name, or: o.rating });
    }
  }
  if (used.size) pushLobby();
}
setInterval(matchLoop, 1000);
setInterval(() => { for (const c of clients.values()) if (c.res && !c.res.writableEnded) { try { c.res.write(': hb\n\n'); } catch (e) {} } }, 20000);
setInterval(() => { for (const c of clients.values()) if (c.res) send(c, 'lobby', lobbyFor(c)); }, 5000);

// --- static ---
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
let indexHtml = '';
const loadIndex = () => { indexHtml = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/%SITE_URL%/g, SITE_URL); };
loadIndex();

function serveStatic(req, res, pathname) {
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'public, max-age=300' });
    return res.end(indexHtml);
  }
  if (pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('User-agent: *\nAllow: /\n' + (SITE_URL ? 'Sitemap: ' + SITE_URL + '/sitemap.xml\n' : ''));
  }
  if (pathname === '/sitemap.xml') {
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    return res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' + (SITE_URL || '') + '/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url></urlset>');
  }
  const fp = path.normalize(path.join(PUB, pathname));
  if (!fp.startsWith(PUB + path.sep) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' });
  fs.createReadStream(fp).pipe(res);
}

function readJson(req, cb) {
  let body = '';
  req.on('data', d => { body += d; if (body.length > 2048) req.destroy(); });
  req.on('end', () => { try { cb(JSON.parse(body || '{}')); } catch (e) { cb(null); } });
}
const ok = (res, o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o || { ok: 1 })); };
const bad = (res, code = 400) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end('{"ok":0}'); };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'GET' && p === '/events') {
    const id = u.searchParams.get('id');
    if (!validId(id)) return bad(res);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    let c = clients.get(id);
    if (!c) { c = { id, name: 'Player', rating: 1200, cap: 200, queuedAt: null, game: null, res: null, timer: null }; clients.set(id, c); }
    if (c.timer) { clearTimeout(c.timer); c.timer = null; }
    if (c.res && c.res !== res) { try { c.res.end(); } catch (e) {} }
    c.res = res;
    send(c, 'hello', { ok: 1 });
    send(c, 'lobby', lobbyFor(c));
    const g = c.game && games.get(c.game);
    if (g) { // reconnect: resync opponent's moves
      const oc = g.w === c.id ? 'b' : 'w';
      send(c, 'move', { mv: g.moves[oc] });
    }
    pushLobby();
    req.on('close', () => {
      if (c.res === res) {
        c.res = null;
        c.timer = setTimeout(() => dropClient(c), GRACE_MS);
        pushLobby();
      }
    });
    return;
  }

  if (req.method === 'POST' && p.startsWith('/api/')) {
    return readJson(req, b => {
      if (!b || !validId(b.id)) return bad(res);
      const c = clients.get(b.id);
      if (!c) return bad(res, 410);
      if (p === '/api/queue') {
        if (c.game) return bad(res, 409);
        c.name = cleanName(b.name); c.rating = clampR(b.rating);
        c.cap = [100, 200, 400, 3000].includes(+b.cap) ? +b.cap : 200;
        c.queuedAt = Date.now();
        pushLobby(); return ok(res);
      }
      if (p === '/api/dequeue') { c.queuedAt = null; pushLobby(); return ok(res); }
      if (p === '/api/leave') { c.queuedAt = null; endGameFor(c, 'left'); pushLobby(); return ok(res); }
      if (p === '/api/resign') { endGameFor(c, 'resign'); return ok(res); }
      if (p === '/api/move') {
        const g = c.game && games.get(c.game);
        if (!g) return bad(res, 409);
        const col = g.w === c.id ? 'w' : 'b';
        const m = b.m;
        if (col !== g.turn || !Array.isArray(m) || m.length !== 5) return bad(res, 409);
        const [fr, fc, tr, tc, pr] = m;
        if (![fr, fc, tr, tc].every(n => Number.isInteger(n) && n >= 0 && n < 8)) return bad(res);
        if (!(pr === '' || 'QRBN'.includes(pr)) || (pr && pr.length !== 1)) return bad(res);
        if (g.moves[col].length > 600) return bad(res);
        g.moves[col].push([fr, fc, tr, tc, pr]);
        g.turn = col === 'w' ? 'b' : 'w';
        const o = clients.get(col === 'w' ? g.b : g.w);
        send(o, 'move', { mv: g.moves[col] });
        return ok(res);
      }
      bad(res, 404);
    });
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    let pathname;
    try { pathname = decodeURIComponent(p); } catch (e) { return bad(res); }
    return serveStatic(req, res, pathname);
  }
  bad(res, 405);
});

server.listen(PORT, () => console.log('BetterChess running on port ' + PORT + (SITE_URL ? ' (' + SITE_URL + ')' : '')));
