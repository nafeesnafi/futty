// Online team deathmatch (1v1 / 2v2 / 4v4) over WebRTC with PeerJS. Star topology: the host's browser
// runs the match (bots, health, kills, spawns) and relays everything. Each player moves their own soldier
// and reports their own hits (favour-the-shooter), so shooting feels instant even with some latency.
// Empty slots are filled with bots; a bot takes over if a player leaves mid-match.
(function () {
  const VG = window.VG, G = VG.Game;
  const $ = (id) => document.getElementById(id);
  const PREFIX = 'vanguard-web-v1-';
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const PROTOCOL = 1;
  const GOALS = { 1: 15, 2: 20, 4: 30 };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
  };

  const N = VG.Net = {
    role: null, peer: null, code: '', size: 2, players: [], me: null, conns: new Map(), host: null,
    inMatch: false, sendT: 0, error: '',
  };

  const r2 = (v) => Math.round(v * 100) / 100;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d || 0);
  const str = (v) => String(v || '').replace(/[<>&"]/g, '').trim().slice(0, 12);
  const makeCode = () => { let s = ''; for (let i = 0; i < 6; i++) s += ALPHABET[(Math.random() * ALPHABET.length) | 0]; return s; };
  const cleanCode = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const myName = () => str($('onName').value) || 'Player';

  function peerOptions(ice) {
    const q = new URLSearchParams(location.search), o = { debug: 0 };
    if (q.get('peerhost')) { o.host = q.get('peerhost'); o.port = +(q.get('peerport') || 443); o.path = q.get('peerpath') || '/'; o.secure = q.get('peersecure') !== '0'; }
    if (ice && window.FSGIce) o.config = FSGIce.config(ice); // TURN relays so players on different networks can connect
    return o;
  }
  // fetch relay credentials first (normally already prefetched), then run the lobby step
  let iceTicket = 0;
  function withIce(fn) {
    const t = ++iceTicket;
    (window.FSGIce ? FSGIce.get() : Promise.resolve(null)).then(ice => { if (t === iceTicket) fn(ice); });
  }
  // true when the host answered but the two networks never found a working route (needs a TURN relay)
  const stuck = (c) => { const pc = c && c.peerConnection; return !!pc && !!pc.remoteDescription && !['connected', 'completed'].includes(pc.iceConnectionState); };
  const NET_FAIL = "The lobby was found, but your networks couldn't link up (a strict firewall, VPN or mobile network blocks direct connections, and no relay server answered). Try again, or switch one player to another network.";
  function errorText(err) {
    const t = err && err.type;
    if (t === 'peer-unavailable') return `No lobby found for code ${N.code}. Check the code, or ask your friend to create a new one.`;
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Couldn\'t reach the matchmaking server. Check your internet connection and try again.';
    if (t === 'browser-incompatible') return 'This browser can\'t make direct connections (WebRTC is blocked).';
    if (t === 'webrtc') return 'The direct connection failed. A strict firewall or VPN may be blocking it.';
    return 'Something went wrong with the connection. Please try again.';
  }

  // ---------- sending ----------
  function sendConn(c, m) { if (c && c.open) { try { c.send(m); } catch (_) { /* dropped */ } } }
  function toHost(m) { sendConn(N.host, m); }
  function broadcast(m, except) { for (const [id, c] of N.conns) if (id !== except) sendConn(c, m); }
  function sendTo(id, m) { sendConn(N.conns.get(id), m); }

  function destroy() {
    iceTicket++; // cancels a lobby step still waiting for relay credentials
    if (VG.Voice) VG.Voice.reset();
    for (const c of N.conns.values()) { try { c.close(); } catch (_) { /* ignore */ } }
    try { if (N.host) N.host.close(); } catch (_) { /* ignore */ }
    try { if (N.peer) N.peer.destroy(); } catch (_) { /* ignore */ }
    N.peer = null; N.host = null; N.conns = new Map(); N.inMatch = false; N.players = [];
    G.net = null;
  }

  // ---------- lobby: host ----------
  function create() {
    destroy();
    if (!window.Peer) return fail('Online play needs the PeerJS library, which didn\'t load.');
    status('Creating lobby…'); withIce(createNow);
  }
  function createNow(ice) {
    destroy();
    N.role = 'host'; N.code = makeCode(); N.size = +$('onSize').value; N.me = 'h'; N.error = '';
    N.players = [{ id: 'h', name: myName(), team: 0, pid: PREFIX + N.code }];
    N.nextId = 1;
    status('Creating lobby…'); render();
    const peer = N.peer = new Peer(PREFIX + N.code, peerOptions(ice));
    if (VG.Voice) VG.Voice.attach(peer);
    peer.on('open', () => { status(''); render(); });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        if (N.players.length >= N.size * 2) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); return; }
        if (N.inMatch) { conn.send({ t: 'busy' }); setTimeout(() => conn.close(), 300); return; }
        const id = 'p' + N.nextId++;
        conn.vgId = id; N.conns.set(id, conn);
        conn.on('data', (m) => onHostData(id, m));
        conn.on('close', () => guestLeft(id));
        conn.on('error', () => guestLeft(id));
      });
    });
    peer.on('error', (err) => { if (err.type === 'unavailable-id') { create(); return; } if (!N.inMatch) fail(errorText(err)); });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (_) { /* ignore */ } });
  }

  function teamCount(t) { return N.players.filter(p => p.team === t).length; }
  function sendLobby() {
    const base = { t: 'lobby', size: N.size, code: N.code, players: N.players.map(p => ({ id: p.id, name: p.name, team: p.team, pid: p.pid })) };
    for (const id of N.conns.keys()) sendTo(id, Object.assign({ you: id }, base));
    render();
    if (VG.Voice) VG.Voice.sync();
  }
  function rebalance() {
    // keep every team within the format's size
    for (const p of N.players) if (teamCount(p.team) > N.size) p.team = 1 - p.team;
  }

  function onHostData(id, m) {
    if (!m || typeof m !== 'object') return;
    const c = N.conns.get(id); if (c) c.vgSeen = performance.now();
    if (m.t === 'bye') { guestLeft(id); return; }
    const pl = N.players.find(p => p.id === id);
    switch (m.t) {
      case 'hello': {
        if (m.v !== PROTOCOL) { sendTo(id, { t: 'reject' }); return; }
        if (pl) return;
        const team = teamCount(0) <= teamCount(1) ? 0 : 1;
        N.players.push({ id, name: str(m.name) || 'Player', team, pid: c ? c.peer : null });
        sendLobby(); return;
      }
      case 'team':
        if (pl && !N.inMatch && teamCount(1 - pl.team) < N.size) { pl.team = 1 - pl.team; sendLobby(); }
        return;
    }
    if (!N.inMatch || !G.running) return;
    const a = G.byId && G.byId.get(id);
    if (!a) return;
    switch (m.t) {
      case 'ready': a.ready = true; if (!a.alive) a.respawnT = 0; break;
      case 'me': {
        const s = m.s; if (!Array.isArray(s)) return;
        a.setState(num(s[0]), num(s[1]), num(s[2]), num(s[3]), num(s[4]), num(s[5], 1.8), s[6] | 0);
        a.score = num(s[7], a.score);
        break;
      }
      case 'shot': // relay + let bots hear it
        if (!a.alive) return;
        showShot(a, m);
        broadcast({ t: 'shot', id, f: m.f, e: m.e, w: m.w }, id);
        G.noise(a, 70, true);
        break;
      case 'hit': {
        const v = G.byId.get(m.v), def = VG.WEAPONS[m.w];
        if (!v || !def || !a.alive || !v.alive || !G.hostile(a, v)) return;
        const dmg = Math.max(0, Math.min(def.dmg * def.headMult * 1.05, num(m.d)));
        G.damage(v, dmg, a, def, !!m.hd, { x: num(m.dx), y: 0, z: num(m.dz) }, num(m.dist));
        break;
      }
      case 'air': if (a.alive) G.startAirstrike(a, num(m.x), num(m.z), num(m.dx), num(m.dz, 1)); break;
    }
  }

  function guestLeft(id) {
    const i = N.players.findIndex(p => p.id === id);
    if (i < 0 && !N.conns.has(id)) return;
    N.conns.delete(id);
    const name = i >= 0 ? N.players[i].name : 'A player';
    if (i >= 0) N.players.splice(i, 1);
    if (N.inMatch && G.running && G.byId && G.byId.has(id)) {
      G.replaceWithBot(id);
      broadcast({ t: 'left', name });
      VG.HUD.banner(name.toUpperCase() + ' LEFT', 'A BOT TAKES OVER');
    } else sendLobby();
  }

  // ---------- lobby: guest ----------
  function join(code) {
    code = cleanCode(code);
    if (code.length !== 6) { N.error = 'Lobby codes are 6 characters, like K7QX2M.'; render(); return; }
    destroy();
    if (!window.Peer) return fail('Online play needs the PeerJS library, which didn\'t load.');
    status('Connecting…'); withIce(ice => joinNow(code, ice));
  }
  function joinNow(code, ice) {
    destroy();
    N.role = 'guest'; N.code = code; N.error = ''; status('Connecting…'); render();
    const peer = N.peer = new Peer(undefined, peerOptions(ice));
    if (VG.Voice) VG.Voice.attach(peer);
    peer.on('open', () => {
      const conn = N.host = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => { conn.send({ t: 'hello', v: PROTOCOL, name: myName() }); status(''); });
      conn.on('data', onGuestData);
      conn.on('close', () => hostGone());
      conn.on('error', () => hostGone());
      setTimeout(() => { if (N.role === 'guest' && N.code === code && !N.players.length && N.peer === peer) fail(stuck(conn) ? NET_FAIL : `Couldn't connect to lobby ${code}. Check the code and that the host is still waiting.`); }, 15000);
    });
    peer.on('error', (err) => { if (!N.inMatch) fail(errorText(err)); });
  }

  function hostGone() {
    if (N.role !== 'guest' || !N.peer) return;
    const was = N.inMatch;
    fail(was ? 'The host left the match.' : 'The connection to the host closed.');
  }

  function onGuestData(m) {
    if (!m || typeof m !== 'object') return;
    N.lastHost = performance.now();
    if (m.t === 'bye') { hostGone(); return; }
    switch (m.t) {
      case 'full': return fail('That lobby is full.');
      case 'busy': return fail('That lobby is already in a match. Try again when it ends.');
      case 'reject': return fail('The host is on a different version of the game. Both of you should reload the page.');
      case 'lobby': N.players = m.players || []; N.size = m.size; N.me = m.you; if (!N.inMatch) render(); if (VG.Voice) VG.Voice.sync(); return;
      case 'start': return startMatch(m.roster, m.you, m.size, m.diff);
    }
    if (!N.inMatch || !G.running) return;
    switch (m.t) {
      case 's': applySnap(m); break;
      case 'shot': { const a = G.byId.get(m.id); if (a) showShot(a, m); break; }
      case 'kill': {
        const v = G.byId.get(m.v), a = m.a ? G.byId.get(m.a) : null;
        const def = m.w === 'air' ? G.AIRSTRIKE : VG.WEAPONS[m.w];
        if (v) G.applyKill(v, a, def, !!m.hd, m.dx != null ? { x: m.dx, y: 0, z: m.dz } : null, num(m.dist));
        break;
      }
      case 'dmg': G.localHurt(num(m.d), m.a ? G.byId.get(m.a) : null); break;
      case 'spawn': G.respawnPlayer(num(m.x), num(m.z), num(m.yaw)); break;
      case 'boom': G.explosionFx(num(m.x), num(m.y), num(m.z)); break;
      case 'jet': VG.Audio.jet(); break;
      case 'left': VG.HUD.banner(str(m.name).toUpperCase() + ' LEFT', 'A BOT TAKES OVER'); break;
      case 'end': G.endMatch(); break;
    }
  }

  // ---------- match ----------
  function botNames(n, taken) {
    return VG.CALLSIGNS.filter(c => !taken.includes(c)).sort(() => Math.random() - 0.5).slice(0, n);
  }
  function hostStart() {
    if (N.role !== 'host') return;
    rebalance();
    const roster = [];
    const names = botNames(N.size * 2, N.players.map(p => p.name));
    let idx = 0, bi = 0;
    for (const t of [0, 1]) {
      for (const p of N.players.filter(q => q.team === t)) roster.push({ id: p.id, name: p.name, team: t, kind: 'human', idx: idx++ });
      for (let k = teamCount(t); k < N.size; k++) roster.push({ id: 'b' + bi, name: names[bi++] || 'Bot', team: t, kind: 'bot', idx: idx++ });
    }
    const diff = +G.settings.diff;
    for (const id of N.conns.keys()) sendTo(id, { t: 'start', roster, you: id, size: N.size, diff });
    startMatch(roster, 'h', N.size, diff);
  }
  function startMatch(roster, you, size, diff) {
    N.inMatch = true; N.sendT = 0; N.size = size; N.lastHost = performance.now();
    for (const c of N.conns.values()) c.vgSeen = performance.now();
    G.net = N;
    $('online').classList.add('hidden');
    G.startMatch({ roster, me: you, goal: GOALS[size] || 30, diff, role: N.role });
  }
  N.ready = function () { if (N.role === 'guest') toHost({ t: 'ready' }); };

  // called by the game every frame
  N.update = function (dt) {
    N.sendT -= dt;
    if (N.sendT > 0) return;
    N.sendT = 0.05;
    const p = G.player;
    const now = performance.now();
    if (N.role === 'guest') {
      if (p.alive) toHost({ t: 'me', s: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch), r2(p.height), VG.WEAPON_ORDER.indexOf(p.cur), p.score] });
      if (now - (N.lastHost || now) > 15000) hostGone();
      return;
    }
    // drop players who went silent (closed tab, lost connection) so a bot can take over
    for (const [id, c] of N.conns) {
      if (c.vgSeen && now - c.vgSeen > 15000) { try { c.close(); } catch (_) { /* ignore */ } guestLeft(id); }
    }
    // host snapshot: every actor's state, team scores, clock
    const a = [];
    for (const e of G.actors) {
      const yaw = e.isPlayer ? e.yaw : e.aimYaw, pitch = e.isPlayer ? e.pitch : e.aimPitch;
      const w = VG.WEAPON_ORDER.indexOf(e.isPlayer ? e.cur : e.wpn);
      a.push([e.id, r2(e.pos.x), r2(e.pos.y), r2(e.pos.z), r2(yaw || 0), r2(pitch || 0), r2(e.height), w, e.alive ? 1 : 0, Math.round(e.health), e.kills, e.deaths, e.score]);
    }
    broadcast({ t: 's', a, tk: G.teamKills, tl: Math.round(G.timeLeft) });
  };

  function applySnap(m) {
    if (Array.isArray(m.tk)) G.teamKills = m.tk;
    G.timeLeft = num(m.tl, G.timeLeft);
    for (const s of m.a || []) {
      const e = G.byId.get(s[0]); if (!e) continue;
      e.kills = s[10] | 0; e.deaths = s[11] | 0;
      if (e.isPlayer) {
        if (e.alive && s[8]) e.health = Math.min(e.health + 100, s[9]); // never "heal" faster than the host says
        continue;
      }
      e.score = s[12] | 0; e.health = s[9];
      if (s[8] && !e.alive) e.spawnAt(s[1], s[2], s[3], s[4]);
      else if (!s[8] && e.alive) e.die(null);
      e.setState(s[1], s[2], s[3], s[4], s[5], s[6], s[7]);
    }
  }

  // tracer, flash and sound for someone else's shot; radar ping
  function showShot(a, m) {
    const f = m.f, e = m.e, def = VG.WEAPONS[m.w] || VG.WEAPONS.ar;
    if (!Array.isArray(f) || !Array.isArray(e)) return;
    a.lastFired = G.now;
    VG.FX.tracer(f[0], f[1], f[2], e[0], e[1], e[2]);
    VG.FX.muzzle(f[0], f[1], f[2], false);
    VG.Audio.shot(def.sound, false, f[0], f[2]);
    G.bulletPast(f, e);
  }

  // ---- outgoing events used by game.js ----
  N.shot = function (id, f, e, w) {
    const m = { t: 'shot', id, f: f.map(r2), e: e.map(r2), w };
    if (N.role === 'host') broadcast(m); else toHost(m);
  };
  N.hit = function (v, d, hd, w, dx, dz, dist) { toHost({ t: 'hit', v, d: r2(d), hd: hd ? 1 : 0, w, dx: r2(dx), dz: r2(dz), dist: r2(dist) }); };
  N.dmgTo = function (id, d, a) { sendTo(id, { t: 'dmg', d: r2(d), a }); };
  N.kill = function (v, a, w, hd, dir, dist) { broadcast({ t: 'kill', v, a, w, hd: hd ? 1 : 0, dx: dir ? r2(dir.x) : null, dz: dir ? r2(dir.z) : null, dist: r2(dist || 0) }); };
  N.spawn = function (id, x, z, yaw) { sendTo(id, { t: 'spawn', x: r2(x), z: r2(z), yaw: r2(yaw) }); };
  N.air = function (x, z, dx, dz) { toHost({ t: 'air', x: r2(x), z: r2(z), dx: r2(dx), dz: r2(dz) }); };
  N.boom = function (x, y, z) { broadcast({ t: 'boom', x: r2(x), y: r2(y), z: r2(z) }); };
  N.jet = function () { broadcast({ t: 'jet' }); };
  N.end = function () { broadcast({ t: 'end' }); };
  N.isHost = () => N.role === 'host';

  // back to the lobby after a match (connections stay open)
  N.toLobby = function () {
    N.inMatch = false; G.net = null;
    $('online').classList.remove('hidden');
    if (N.role === 'host') sendLobby(); else render();
  };
  N.leave = function () { destroy(); N.role = null; render(); };

  // ---------- UI ----------
  function status(s) { $('onStatus').textContent = s; }
  function fail(msg) {
    const wasMatch = N.inMatch;
    destroy(); N.role = null; N.error = msg;
    if (wasMatch) G.quitToMenu(true);
    $('menu').classList.add('hidden'); $('online').classList.remove('hidden');
    render();
  }

  function render() {
    const inLobby = !!N.role && (N.role === 'host' ? !!N.peer : N.players.length > 0);
    $('onHome').classList.toggle('hidden', inLobby);
    $('onLobby').classList.toggle('hidden', !inLobby);
    $('onError').textContent = N.error || '';
    if (!inLobby) return;
    $('onCodeShow').textContent = N.code;
    $('onFormat').textContent = `${N.size}V${N.size} TEAM DEATHMATCH · FIRST TO ${GOALS[N.size]}`;
    for (const t of [0, 1]) {
      const ul = $('onTeam' + t), list = N.players.filter(p => p.team === t);
      let html = list.map(p => `<li class="${p.id === N.me ? 'me' : ''}">${p.name}${p.id === 'h' ? ' <i>HOST</i>' : ''}</li>`).join('');
      for (let k = list.length; k < N.size; k++) html += '<li class="bot">Bot</li>';
      ul.innerHTML = html;
    }
    const host = N.role === 'host';
    $('onStart').classList.toggle('hidden', !host);
    $('onSizeRow').classList.toggle('hidden', !host);
    $('onWait').classList.toggle('hidden', host);
    $('onStart').disabled = host && !N.peer.open;
    if (host) $('onSize2').value = String(N.size);
  }

  // ---------- wiring ----------
  $('onName').value = store.get('fsg.vanguard.name', '') || '';
  $('onName').addEventListener('change', () => store.set('fsg.vanguard.name', myName()));
  $('onlineBtn').addEventListener('click', () => {
    VG.Audio.init(); VG.Audio.ui();
    $('menu').classList.add('hidden'); $('online').classList.remove('hidden'); render();
  });
  $('onCreate').addEventListener('click', () => { VG.Audio.ui(); store.set('fsg.vanguard.name', myName()); create(); });
  $('onJoin').addEventListener('click', () => { VG.Audio.ui(); store.set('fsg.vanguard.name', myName()); join($('onCode').value); });
  $('onCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('onJoin').click(); });
  $('onSwitch').addEventListener('click', () => {
    VG.Audio.ui();
    if (N.role === 'host') { const me = N.players[0]; if (teamCount(1 - me.team) < N.size) { me.team = 1 - me.team; sendLobby(); } }
    else toHost({ t: 'team' });
  });
  $('onSize2').addEventListener('change', () => {
    const s = +$('onSize2').value;
    if (N.players.length > s * 2) { $('onSize2').value = String(N.size); status(`Too many players for ${s}v${s}.`); return; }
    N.size = s; rebalance(); sendLobby(); status('');
  });
  $('onStart').addEventListener('click', () => { VG.Audio.ui(); hostStart(); });
  $('onCopy').addEventListener('click', () => {
    const u = new URL(location.href.split(/[?#]/)[0]), q = new URLSearchParams(location.search);
    u.searchParams.set('join', N.code);
    for (const k of ['peerhost', 'peerport', 'peerpath', 'peersecure', 'peerice', 'turn', 'turnuser', 'turnpass']) if (q.get(k)) u.searchParams.set(k, q.get(k));
    const url = u.toString();
    const done = () => { $('onCopy').textContent = 'LINK COPIED'; setTimeout(() => { $('onCopy').textContent = 'COPY INVITE LINK'; }, 1600); };
    if (navigator.share && G.touch) navigator.share({ title: 'Vanguard Web', text: `Join my Vanguard Web lobby: ${N.code}`, url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => status(url));
    else status(url);
  });
  $('onBack').addEventListener('click', () => {
    VG.Audio.ui(); N.leave(); N.error = '';
    $('online').classList.add('hidden'); $('menu').classList.remove('hidden');
  });
  // heartbeat on a timer: keeps running (throttled) when a tab is in the background, unlike animation frames
  setInterval(() => {
    if (!N.inMatch) return;
    if (N.role === 'guest') toHost({ t: 'p' }); else if (N.role === 'host') broadcast({ t: 'p' });
  }, 1000);
  addEventListener('pagehide', () => { if (N.role === 'host') broadcast({ t: 'bye' }); else if (N.role === 'guest') toHost({ t: 'bye' }); });

  // invite links: index.html?join=CODE
  const q = new URLSearchParams(location.search).get('join');
  if (q) {
    $('onCode').value = cleanCode(q);
    $('menu').classList.add('hidden'); $('online').classList.remove('hidden'); render();
  }
})();
