// Online play over WebRTC (PeerJS). The host's browser runs the match; the guest sends its controls
// and draws interpolated snapshots. The invite code is the host's PeerJS id (with a prefix).
var FC = window.FC = window.FC || {};

(() => {
  const $ = id => document.getElementById(id);
  const PREFIX = 'futt-champions-v1-';
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const SNAP_EVERY = 0.05;        // 20 snapshots per second
  const INTERP_DELAY = 0.1;       // guest renders 100 ms behind the newest snapshot
  const PROTOCOL = 2;

  const N = {
    peer: null, conn: null, role: null, code: '', state: 'home', error: '',
    oppTeam: null, halfSeconds: 180, inMatch: false,
    snapT: 0, seq: 0, snaps: [], offset: null, lastRecv: 0, pingT: 0, rtt: null,
    inT: 0, lastIn: '', rematchAsked: false,
  };

  // ---------- PeerJS setup (query-string overrides allow a self-hosted PeerServer) ----------
  function peerOptions() {
    const q = new URLSearchParams(location.search);
    const o = { debug: 0 };
    if (q.get('peerhost')) {
      o.host = q.get('peerhost'); o.port = +(q.get('peerport') || 443);
      o.path = q.get('peerpath') || '/'; o.secure = q.get('peersecure') !== '0';
    }
    if (q.get('peerice') === 'none') o.config = { iceServers: [] };
    return o;
  }
  function makeCode() { let s = ''; for (let i = 0; i < 6; i++) s += ALPHABET[(Math.random() * ALPHABET.length) | 0]; return s; }
  function cleanCode(s) { return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); }

  function destroy() {
    try { if (N.conn) N.conn.close(); } catch (_) {}
    try { if (N.peer) N.peer.destroy(); } catch (_) {}
    N.peer = null; N.conn = null; N.inMatch = false; N.snaps = []; N.offset = null; N.rtt = null;
  }

  function send(msg) { if (N.conn && N.conn.open) { try { N.conn.send(msg); } catch (_) {} } }

  function errorText(err) {
    const t = err && err.type;
    if (t === 'peer-unavailable') return `No match found for code ${N.code}. Check the code, or ask your friend to create a new invite.`;
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed')
      return 'Couldn\'t reach the matchmaking server. Check your internet connection and try again.';
    if (t === 'browser-incompatible') return 'This browser can\'t make direct connections (WebRTC is blocked). Try Chrome, Edge, Firefox or Safari.';
    if (t === 'webrtc') return 'The direct connection to your friend failed. A strict firewall or VPN may be blocking it.';
    return 'Something went wrong with the connection. Please try again.';
  }

  // ---------- hosting ----------
  function host(attempt = 0) {
    destroy();
    if (!window.Peer) { fail('Online play needs the PeerJS library, which didn\'t load.'); return; }
    N.role = 'host'; N.code = makeCode(); N.state = 'hosting'; N.error = ''; render();
    const peer = N.peer = new Peer(PREFIX + N.code, peerOptions());
    peer.on('open', () => render());
    peer.on('connection', conn => {
      if (N.conn && N.conn.open) { conn.on('open', () => { conn.send({ t: 'busy' }); setTimeout(() => conn.close(), 300); }); return; }
      N.conn = conn;
      wire(conn);
    });
    peer.on('error', err => {
      if (err.type === 'unavailable-id' && attempt < 3) { host(attempt + 1); return; }
      if (N.inMatch && err.type === 'peer-unavailable') return;
      fail(errorText(err));
    });
    peer.on('disconnected', () => { if (!N.conn && N.state === 'hosting') { try { peer.reconnect(); } catch (_) {} } });
  }

  // ---------- joining ----------
  function join(code) {
    code = cleanCode(code);
    if (code.length !== 6) { N.error = 'Invite codes are 6 characters, like K7QX2M.'; render(); return; }
    destroy();
    if (!window.Peer) { fail('Online play needs the PeerJS library, which didn\'t load.'); return; }
    N.role = 'guest'; N.code = code; N.state = 'joining'; N.error = ''; render();
    const peer = N.peer = new Peer(undefined, peerOptions());
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      N.conn = conn;
      wire(conn);
      // PeerJS reports a missing host as a peer error; also give up if nothing happens
      setTimeout(() => { if (N.state === 'joining' && N.code === code) fail(`Couldn't connect to code ${code}. Check the code and that your friend is still waiting.`); }, 15000);
    });
    peer.on('error', err => { if (!N.inMatch) fail(errorText(err)); });
  }

  function fail(msg) {
    const wasMatch = N.inMatch;
    destroy();
    N.state = 'home'; N.error = msg;
    if (wasMatch) FC.toMenu();
    FC.show('scrOnline'); render();
  }

  // ---------- connection wiring ----------
  function wire(conn) {
    N.lastRecv = performance.now();   // start the silence timer when the connection begins
    conn.on('open', () => {
      N.lastRecv = performance.now();
      if (N.role === 'guest') send({ t: 'hello', v: PROTOCOL, team: FC.pickedTeam() });
    });
    conn.on('data', onData);
    conn.on('close', () => onGone());
    conn.on('error', () => onGone());
  }

  function onGone() {
    if (!N.conn) return;
    const wasMatch = N.inMatch, role = N.role;
    N.conn = null;
    if (role === 'host') {
      if (wasMatch && FC.state.match) {
        // keep playing: the bot takes over the away side
        FC.state.match.setController(1, 'ai', 'normal');
        N.inMatch = false;
        $('netStat').textContent = 'Opponent left · bot playing';
        showBanner('Opponent left', 'The bot takes over their team');
        destroy();
        return;
      }
      // back to waiting with the same code
      N.oppTeam = null; N.state = 'hosting'; render();
      return;
    }
    fail(wasMatch ? 'The host left the match.' : 'The connection to the host closed.');
  }

  function showBanner(big, small) {
    const b = $('banner'); $('bnBig').textContent = big; $('bnSmall').textContent = small;
    b.classList.add('show'); setTimeout(() => b.classList.remove('show'), 3000);
  }

  function onData(m) {
    N.lastRecv = performance.now();
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'ping': send({ t: 'pong', ts: m.ts }); return;
      case 'pong': N.rtt = performance.now() - m.ts; return;
      case 'bye': onGone(); return;
    }
    if (N.role === 'host') {
      switch (m.t) {
        case 'hello':
          if (m.v !== PROTOCOL) { send({ t: 'reject', reason: 'version' }); return; }
          N.oppTeam = validTeam(m.team); N.state = 'lobby'; sendLobby(); render(); break;
        case 'team': N.oppTeam = validTeam(m.team); sendLobby(); render(); break;
        case 'in': if (N.inMatch && FC.state.match) FC.state.match.setInput(1, num(m.x), num(m.z), !!m.sp, !!m.sh); break;
        case 'act':
          if (N.inMatch && FC.state.match && ['pass', 'through', 'shoot', 'switch', 'lob', 'fake', 'knock'].includes(m.a))
            FC.state.match.queueAction(1, { a: m.a, power: clamp01(m.power), x: num(m.x), z: num(m.z) });
          break;
        case 'rematch': showBanner('Rematch?', 'Your friend wants a rematch'); break;
      }
    } else {
      switch (m.t) {
        case 'busy': fail('That match already has two players.'); break;
        case 'reject': fail('Your friend is using a different version of the game. Both of you should reload the page.'); break;
        case 'lobby': N.state = 'lobby'; N.lobby = m; render(); break;
        case 'start': startGuest(m); break;
        case 's': pushSnap(m); FC.state.hud = m.h; break;   // newest score/clock right away; positions are interpolated
        case 'ev': FC.handleEvents(m.evs); break;
        case 'lobbyback': N.inMatch = false; N.state = 'lobby'; FC.toMenu(); FC.show('scrOnline'); render(); break;
      }
    }
  }

  const num = v => (typeof v === 'number' && isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  const clamp01 = v => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5);
  const validTeam = t => (Number.isInteger(t) && t >= 0 && t < FC.TEAMS.length ? t : 0);

  function sendLobby() { send({ t: 'lobby', home: FC.pickedTeam(), away: N.oppTeam, halfSeconds: N.halfSeconds }); }

  // ---------- starting ----------
  function startHost() {
    if (!N.conn || !N.conn.open || N.oppTeam == null) return;
    const cfg = { role: 'host', home: FC.pickedTeam(), away: N.oppTeam, halfSeconds: N.halfSeconds };
    send({ t: 'start', home: cfg.home, away: cfg.away, halfSeconds: cfg.halfSeconds });
    N.inMatch = true; N.snapT = 0; N.rematchAsked = false;
    FC.resetScorers();
    FC.startMatch(cfg);
  }
  function startGuest(m) {
    N.inMatch = true; N.snaps = []; N.offset = null; N.rematchAsked = false;
    FC.resetScorers();
    FC.startMatch({ role: 'guest', home: validTeam(m.home), away: validTeam(m.away), halfSeconds: m.halfSeconds });
  }

  // ---------- snapshots ----------
  const r2 = v => Math.round(v * 100) / 100;
  function packSnap(view, hud) {
    const p = [];
    for (const s of view.players) p.push(r2(s.x), r2(s.z), r2(s.face), r2(s.spd), r2(s.kick), r2(s.dive || 0), r2(s.jump || 0), r2(s.slide || 0), s.shield ? 1 : 0);
    const b = view.ball;
    return { t: 's', k: ++N.seq, c: r2(performance.now() / 1000), b: [r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vz), r2(b.vy || 0)], p, a: view.active, h: hud };
  }
  function unpack(m) {
    const players = [];
    for (let i = 0; i < 22; i++) {
      const o = i * 9;
      players.push({ x: m.p[o], z: m.p[o + 1], face: m.p[o + 2], spd: m.p[o + 3], kick: m.p[o + 4], dive: m.p[o + 5], jump: m.p[o + 6], slide: m.p[o + 7], shield: m.p[o + 8] });
    }
    return { c: m.c, view: { ball: { x: m.b[0], y: m.b[1], z: m.b[2], vx: m.b[3], vz: m.b[4], vy: m.b[5] }, players, active: m.a }, hud: m.h };
  }
  function pushSnap(m) {
    const s = unpack(m);
    const est = s.c - performance.now() / 1000;
    N.offset = N.offset == null ? est : (est > N.offset ? N.offset + (est - N.offset) * 0.3 : N.offset + (est - N.offset) * 0.05);
    N.snaps.push(s);
    if (N.snaps.length > 30) N.snaps.shift();
  }
  function lerpAngle(a, b, t) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; }
  function interpolated() {
    const sn = N.snaps; if (!sn.length) return null;
    const rt = performance.now() / 1000 + N.offset - INTERP_DELAY;
    let i = sn.length - 1;
    while (i > 0 && sn[i - 1].c > rt) i--;
    const b = sn[i], a = sn[i - 1];
    const newest = sn[sn.length - 1];
    if (!a || rt >= b.c) return { view: b.view, hud: newest.hud };
    const t = Math.max(0, Math.min(1, (rt - a.c) / ((b.c - a.c) || 1)));
    const L = (x, y) => x + (y - x) * t;
    const view = {
      ball: { x: L(a.view.ball.x, b.view.ball.x), y: L(a.view.ball.y, b.view.ball.y), z: L(a.view.ball.z, b.view.ball.z), vx: b.view.ball.vx, vz: b.view.ball.vz, vy: b.view.ball.vy },
      players: b.view.players.map((q, k) => {
        const p = a.view.players[k];
        return { x: L(p.x, q.x), z: L(p.z, q.z), face: lerpAngle(p.face, q.face, t), spd: L(p.spd, q.spd), kick: q.kick, dive: q.dive, jump: q.jump, slide: q.slide, shield: q.shield };
      }),
      active: b.view.active,
    };
    return { view, hud: newest.hud };
  }

  // ---------- per-frame hooks called by app.js ----------
  function heartbeat(dt) {
    N.pingT -= dt;
    if (N.pingT <= 0) { N.pingT = 2; send({ t: 'ping', ts: performance.now() }); }
    if (N.conn && performance.now() - N.lastRecv > 10000) { onGone(); return; }
    $('netStat').textContent = N.conn ? `Online · ${N.rtt == null ? '…' : Math.round(N.rtt) + ' ms'}` : $('netStat').textContent;
  }

  FC.Net = {
    open() { if (N.state !== 'lobby' && N.state !== 'hosting' && N.state !== 'joining') N.state = 'home'; FC.show('scrOnline'); render(); },
    leave() { send({ t: 'bye' }); destroy(); N.state = 'home'; N.oppTeam = null; },
    sendAction(a) { send({ t: 'act', a: a.a, power: a.power, x: a.x, z: a.z }); },
    hostTick(dt, view, hud, evs) {
      if (!N.inMatch || !N.conn) return;
      heartbeat(dt);
      N.snapT -= dt;
      const urgent = evs.some(e => e.e === 'goal' || e.e === 'full' || e.e === 'half' || e.e === 'restart');
      if (N.snapT <= 0 || urgent) { N.snapT = SNAP_EVERY; send(packSnap(view, hud)); }
      const keep = evs.filter(e => e.e !== 'pass' && e.e !== 'possess' && e.e !== 'shot' && e.e !== 'block');
      if (keep.length) send({ t: 'ev', evs: keep });
      if (evs.some(e => e.e === 'full')) N.inMatch = false;
    },
    guestTick(dt, x, z, sprint, shield) {
      if (!N.conn) return;
      heartbeat(dt);
      N.inT -= dt;
      const key = `${x.toFixed(2)},${z.toFixed(2)},${sprint ? 1 : 0},${shield ? 1 : 0}`;
      if (key !== N.lastIn || N.inT <= 0) { N.inT = 0.1; N.lastIn = key; send({ t: 'in', x: r2(x), z: r2(z), sp: sprint ? 1 : 0, sh: shield ? 1 : 0 }); }
      const s = interpolated();
      if (s) FC.setGuestState(s.view, s.hud);
    },
    fullTimeButtons(add) {
      if (N.role === 'host') {
        if (N.conn && N.conn.open) {
          add('Rematch', () => startHost(), true);
          add('Back to lobby', () => { send({ t: 'lobbyback' }); N.state = 'lobby'; FC.toMenu(); FC.show('scrOnline'); render(); });
        }
      } else if (N.conn && N.conn.open) {
        add('Ask for rematch', function () { send({ t: 'rematch' }); this.textContent = 'Asked the host…'; this.disabled = true; }, true);
      }
    },
  };

  // ---------- lobby UI ----------
  function clubHtml(idx, label, you) {
    if (idx == null) return `<div class="side"><span class="shirt" style="background:transparent;border-style:dashed"></span><span><div class="lbl">${label}</div><div class="nm" style="color:var(--muted)">Waiting…</div></span></div>`;
    const t = FC.TEAMS[idx];
    return `<${you ? 'button' : 'div'} class="side${you ? ' picking' : ''}" ${you ? 'id="olChange"' : ''}><span class="shirt" style="background:${FC.kitCss(t.kit)}"></span><span><div class="lbl">${label}</div><div class="nm">${esc(t.name)}</div><div class="rt">${you ? 'Tap to change club' : t.country + ' · Overall ' + t.rating}</div></span></${you ? 'button' : 'div'}>`;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function inviteLink() {
    const u = new URL(location.href);
    u.search = ''; u.hash = '';
    const q = new URLSearchParams(location.search);
    for (const k of ['peerhost', 'peerport', 'peerpath', 'peersecure', 'peerice']) if (q.get(k)) u.searchParams.set(k, q.get(k));
    u.searchParams.set('join', N.code);
    return u.toString();
  }

  function copy(text, btn) {
    const done = () => { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = o), 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => selectFallback(text));
    else selectFallback(text);
  }
  function selectFallback(text) {
    const el = $('olCopyField');
    if (el) { el.value = text; el.classList.remove('hidden'); el.select(); }
  }

  function render() {
    const w = $('onlineWrap'); if (!w) return;
    const me = FC.pickedTeam();
    let body = '';
    const err = N.error ? `<p class="note" style="color:#ffb4b4" role="alert">${esc(N.error)}</p>` : '';
    if (N.state === 'home') {
      body = `
        <div class="matchup" style="grid-template-columns:1fr">${clubHtml(me, 'Your club', true)}</div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
          <div class="card" style="width:auto">
            <h2 style="font-size:26px">Create invite</h2>
            <p class="note">Get a 6-character code to send to a friend. You'll play as the home team.</p>
            <button class="btn primary" id="olHost">Create invite</button>
          </div>
          <div class="card" style="width:auto">
            <h2 style="font-size:26px">Enter invite code</h2>
            <input class="search" id="olCode" maxlength="7" placeholder="e.g. K7QX2M" autocomplete="off" autocapitalize="characters" spellcheck="false" style="font-size:22px;letter-spacing:4px;text-transform:uppercase;font-family:var(--display);font-weight:800" value="${esc(N.prefill || '')}">
            <button class="btn primary" id="olJoin">Join match</button>
          </div>
        </div>
        ${err}
        <p class="note">Online matches connect your two browsers directly. If a match won't connect, a strict network, VPN or firewall may be blocking it. Try a different network.</p>`;
    } else if (N.state === 'hosting') {
      const ready = N.peer && N.peer.open;
      body = `
        <div class="matchup">${clubHtml(me, 'You · home', true)}<div class="vs">VS</div>${clubHtml(null, 'Friend · away')}</div>
        <div class="card" style="width:auto;align-items:center;text-align:center">
          <div class="optlbl">Your invite code</div>
          <div style="font-family:var(--display);font-weight:800;font-size:clamp(48px,12vw,84px);letter-spacing:10px;color:var(--gold)" id="olCodeBig">${ready ? N.code : '······'}</div>
          <div class="opts" style="justify-content:center">
            <button class="btn" id="olCopyCode" ${ready ? '' : 'disabled'}>Copy code</button>
            <button class="btn" id="olCopyLink" ${ready ? '' : 'disabled'}>Copy invite link</button>
          </div>
          <input class="search hidden" id="olCopyField" readonly aria-label="Invite text to copy">
          <p class="note">${ready ? 'Waiting for your friend to join…' : 'Creating your invite…'}</p>
        </div>
        ${err}`;
    } else if (N.state === 'joining') {
      body = `<div class="card" style="width:auto;align-items:center;text-align:center"><h2>Connecting…</h2><p class="note">Joining match ${esc(N.code)}</p></div>${err}`;
    } else if (N.state === 'lobby') {
      const isHost = N.role === 'host';
      const home = isHost ? me : N.lobby && N.lobby.home, away = isHost ? N.oppTeam : me;
      const len = isHost ? N.halfSeconds : (N.lobby && N.lobby.halfSeconds) || 180;
      body = `
        <div class="matchup">${clubHtml(home, isHost ? 'You · home' : 'Host · home', isHost)}<div class="vs">VS</div>${clubHtml(away, isHost ? 'Friend · away' : 'You · away', !isHost)}</div>
        <div class="opts" style="justify-content:space-between">
          <span><span class="optlbl">Match</span><span class="seg" id="olLen">${[90, 180, 300].map(v => `<button data-v="${v}" class="${v === len ? 'on' : ''}" ${isHost ? '' : 'disabled'}>${v / 30} min</button>`).join('')}</span></span>
          <span class="note" id="olPing">${pingText()}</span>
        </div>
        ${isHost ? '<button class="btn primary" id="olStart">Start match ▸</button>' : '<div class="card" style="width:auto;text-align:center"><p class="note" style="font-size:15px">Waiting for the host to start the match…</p></div>'}
        ${err}`;
    }
    w.innerHTML = `
      <div class="topbar"><h2>Play Online</h2><button class="btn" id="olBack">${N.state === 'home' ? 'Back' : 'Leave'}</button></div>
      ${body}`;
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on('olBack', 'click', () => { if (N.state !== 'home') { FC.Net.leave(); N.state = 'home'; N.error = ''; render(); } else FC.show('scrTitle'); });
    on('olHost', 'click', () => host());
    on('olJoin', 'click', () => { N.prefill = $('olCode').value; join($('olCode').value); });
    on('olCode', 'keydown', e => { if (e.key === 'Enter') { N.prefill = e.target.value; join(e.target.value); } });
    on('olCode', 'input', e => { const v = cleanCode(e.target.value); if (v !== e.target.value) e.target.value = v; });
    on('olCopyCode', 'click', e => copy(N.code, e.currentTarget));
    on('olCopyLink', 'click', e => copy(inviteLink(), e.currentTarget));
    on('olStart', 'click', () => startHost());
    on('olChange', 'click', () => FC.openTeamPicker('Choose your club', i => { if (N.role === 'guest') send({ t: 'team', team: i }); else if (N.state === 'lobby') sendLobby(); }, () => { FC.show('scrOnline'); render(); }));
    const seg = $('olLen');
    if (seg && N.role === 'host') for (const b of seg.querySelectorAll('button')) b.addEventListener('click', () => { N.halfSeconds = +b.dataset.v; sendLobby(); render(); });
  }

  // keep the lobby's ping readout fresh (text only, so buttons aren't redrawn under the player's finger)
  function pingText() { return N.rtt == null ? 'Connected' : 'Connected · ' + Math.round(N.rtt) + ' ms'; }
  setInterval(() => {
    if (N.conn && !N.inMatch) {
      send({ t: 'ping', ts: performance.now() });
      if (N.conn && performance.now() - N.lastRecv > 10000) { onGone(); return; }
      const el = $('olPing'); if (el) el.textContent = pingText();
    }
  }, 2000);

  // invite links: ?join=CODE opens the online screen and connects
  const jq = new URLSearchParams(location.search).get('join');
  if (jq) setTimeout(() => { N.prefill = cleanCode(jq); FC.show('scrOnline'); join(jq); }, 300);

  FC._net = N;  // for debugging
})();
