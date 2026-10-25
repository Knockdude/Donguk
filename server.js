// Servidor multijugador de DONGUK
// Uso:  npm install  &&  npm start   →  abre http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 16;

const server = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 2048 });
const players = new Map();
let nextId = 1;

const spawnPoint = () => {
  const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 40;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
};
const broadcast = (obj, except) => {
  const s = JSON.stringify(obj);
  for (const p of players.values()) if (p.ws !== except && p.ws.readyState === 1) p.ws.send(s);
};
const sendTo = (p, obj) => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(obj)); };
const pub = p => ({ id: p.id, name: p.name, skin: p.skin, x: p.x, y: p.y, z: p.z, ry: p.ry, hp: p.hp });
const sendScores = () => broadcast({ t: 'scores', list: [...players.values()].map(p => ({ id: p.id, name: p.name, k: p.k, d: p.d })) });

wss.on('connection', ws => {
  let me = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!me) {
      if (m.t !== 'join') return;
      if (players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'full' })); return ws.close(); }
      const sp = spawnPoint();
      me = { id: nextId++, ws, name: String(m.name || 'Jugador').slice(0, 16), skin: String(m.skin || 'start').slice(0, 16),
             x: sp.x, y: 0, z: sp.z, ry: 0, hp: 100, k: 0, d: 0, lastHit: 0 };
      players.set(me.id, me);
      sendTo(me, { t: 'welcome', id: me.id, spawn: sp, players: [...players.values()].map(pub) });
      broadcast({ t: 'join', p: pub(me) }, ws);
      sendScores();
      return;
    }
    if (m.t === 'state' && me.hp > 0) {
      for (const k of ['x', 'y', 'z', 'ry']) if (typeof m[k] === 'number' && isFinite(m[k])) me[k] = m[k];
      broadcast({ t: 'state', id: me.id, x: me.x, y: me.y, z: me.z, ry: me.ry, mv: !!m.mv }, ws);
    } else if (m.t === 'shoot' && me.hp > 0) {
      broadcast({ t: 'shoot', id: me.id }, ws);
    } else if (m.t === 'hit' && me.hp > 0) {
      const target = players.get(m.id);
      const now = Date.now();
      if (!target || target === me || target.hp <= 0 || now - me.lastHit < 60) return;
      me.lastHit = now;
      const head = !!m.head;
      const dmg = head ? 50 : 20;
      target.hp -= dmg;
      if (target.hp > 0) return broadcast({ t: 'dmg', id: target.id, hp: target.hp, by: me.id });
      target.hp = 0; target.d++; me.k++;
      broadcast({ t: 'death', id: target.id, by: me.id, head });
      sendScores();
      setTimeout(() => {
        if (!players.has(target.id)) return;
        const sp = spawnPoint();
        target.hp = 100; target.x = sp.x; target.z = sp.z;
        broadcast({ t: 'respawn', id: target.id, x: sp.x, z: sp.z });
      }, 3000);
    }
  });
  ws.on('close', () => {
    if (!me) return;
    players.delete(me.id);
    broadcast({ t: 'leave', id: me.id });
    sendScores();
  });
});

server.listen(PORT, () => console.log(`DONGUK en http://localhost:${PORT}`));
