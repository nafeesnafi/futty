// Voice chat for online lobbies and matches. Every pair of players gets a direct WebRTC audio call
// (PeerJS media calls), so voice never goes through the host. Everyone hears everyone in the lobby;
// in a match you only hear your own team. Mic modes: off, push-to-talk (V / MIC button), open mic.
(function () {
  const VG = window.VG, G = VG.Game;
  const $ = (id) => document.getElementById(id);
  const MODE_KEY = 'fsg.vanguard.mic';
  let mode = 'ptt';
  try { mode = localStorage.getItem(MODE_KEY) || 'ptt'; } catch (_) { /* private mode */ }

  const V = VG.Voice = { calls: new Map(), peer: null, mic: null, silent: null, ptt: false, tx: false, error: '' };
  let actx = null;
  const ctx = () => actx || (actx = new (window.AudioContext || window.webkitAudioContext)());

  function silentStream() {
    if (!V.silent) V.silent = ctx().createMediaStreamDestination().stream;
    return V.silent;
  }
  const outStream = () => V.mic || silentStream();

  async function ensureMic() {
    if (mode === 'off' || mode === 'listen' || V.mic || V.asking) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { V.error = 'Voice needs a secure (https) page.'; render(); return; }
    V.asking = true;
    try {
      V.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      V.error = '';
      const track = V.mic.getAudioTracks()[0];
      // swap the silent track for the mic in calls that are already running
      for (const e of V.calls.values()) {
        const pc = e.call.peerConnection; if (!pc) continue;
        const s = pc.getSenders().find(x => x.track && x.track.kind === 'audio') || pc.getSenders()[0];
        if (s) s.replaceTrack(track).catch(() => {});
      }
    } catch (_) { V.error = 'Microphone blocked. Allow it in the browser to talk.'; }
    V.asking = false;
    updateTx(); render();
  }

  function updateTx() {
    V.tx = !!V.mic && (mode === 'open' || (mode === 'ptt' && V.ptt));
    if (V.mic) for (const t of V.mic.getAudioTracks()) t.enabled = V.tx;
  }

  function knownPid(pid) { return VG.Net.players.some(p => p.pid === pid); }

  function wire(call) {
    const old = V.calls.get(call.peer);
    if (old && old.call !== call) { try { old.call.close(); } catch (_) { /* ignore */ } }
    const e = { call, audio: null, an: null, buf: null, level: 0 };
    V.calls.set(call.peer, e);
    call.on('stream', (s) => {
      if (e.audio) return;
      const el = new Audio(); el.srcObject = s; el.autoplay = true; el.playsInline = true;
      el.play().catch(() => {});
      e.audio = el;
      updateMuting();
    });
    const gone = () => { if (V.calls.get(call.peer) === e) { V.calls.delete(call.peer); if (e.audio) e.audio.srcObject = null; } };
    call.on('close', gone); call.on('error', gone);
  }

  V.attach = function (peer) {
    V.peer = peer;
    peer.on('call', (call) => {
      if (!knownPid(call.peer)) { setTimeout(() => { if (knownPid(call.peer)) { call.answer(outStream()); wire(call); } else call.close(); }, 1500); return; }
      call.answer(outStream()); wire(call);
    });
  };

  // make sure there is exactly one call to every other player (the lower peer id places it)
  V.sync = function () {
    const N = VG.Net;
    if (!V.peer || !V.peer.id || !N.role || mode === 'off') return;
    const me = V.peer.id, want = new Set(N.players.map(p => p.pid).filter(pid => pid && pid !== me));
    for (const [pid, e] of V.calls) if (!want.has(pid)) { try { e.call.close(); } catch (_) { /* ignore */ } V.calls.delete(pid); }
    for (const pid of want) if (!V.calls.has(pid) && me < pid) wire(V.peer.call(pid, outStream()));
    updateMuting();
  };

  function teamOfPid(pid) {
    const pl = VG.Net.players.find(p => p.pid === pid); if (!pl) return null;
    const r = G.online && G.online.roster.find(x => x.id === pl.id);
    return r ? r.team : pl.team;
  }
  function updateMuting() {
    const inMatch = G.running && G.online;
    for (const [pid, e] of V.calls) if (e.audio) e.audio.muted = mode === 'off' || (inMatch && teamOfPid(pid) !== G.player.team);
  }

  V.reset = function () {
    for (const e of V.calls.values()) { try { e.call.close(); } catch (_) { /* ignore */ } if (e.audio) e.audio.srcObject = null; }
    V.calls.clear(); V.peer = null;
    if (V.mic) { for (const t of V.mic.getTracks()) t.stop(); V.mic = null; }
    V.tx = false; render();
  };

  V.setMode = function (m) {
    mode = m;
    try { localStorage.setItem(MODE_KEY, m); } catch (_) { /* private mode */ }
    if (m === 'off') { for (const e of V.calls.values()) { try { e.call.close(); } catch (_) { /* ignore */ } } V.calls.clear(); if (V.mic) { for (const t of V.mic.getTracks()) t.stop(); V.mic = null; } }
    else { if (actx && actx.state === 'suspended') actx.resume(); ensureMic(); V.sync(); }
    updateTx(); render();
  };
  V.mode = () => mode;
  V.setPtt = function (on) {
    if (V.ptt === on) return;
    V.ptt = on;
    if (on && !V.mic && mode === 'ptt') ensureMic();
    updateTx();
  };

  // push-to-talk key (rebindable as "Push to talk" on the controls screen)
  addEventListener('keydown', (e) => { if (G.binds && e.code === G.binds.talk && VG.Net.role && !e.repeat && document.activeElement.tagName !== 'INPUT') V.setPtt(true); });
  addEventListener('keyup', (e) => { if (G.binds && e.code === G.binds.talk) V.setPtt(false); });
  addEventListener('mousedown', (e) => { if (G.binds && G.binds.talk === 'Mouse' + e.button && VG.Net.role) V.setPtt(true); });
  addEventListener('mouseup', (e) => { if (G.binds && G.binds.talk === 'Mouse' + e.button) V.setPtt(false); });
  addEventListener('blur', () => V.setPtt(false));

  // ---------- UI ----------
  function render() {
    const sel = $('onMic'); if (!sel) return;
    sel.value = mode;
    const key = G.keyLabel ? G.keyLabel('talk') : 'V';
    $('onMicNote').textContent = V.error || (mode === 'off' ? 'Voice chat is off.'
      : mode === 'listen' ? 'You can hear others but your mic stays off.'
        : !V.mic ? 'Waiting for microphone permission…'
        : mode === 'ptt' ? `Hold ${G.touch ? 'the MIC button' : '[' + key + ']'} to talk · team-only in matches` : 'Open mic · team-only in matches');
    $('onMicNote').classList.toggle('err', !!V.error);
  }
  V.render = render;
  $('onMic').addEventListener('change', () => V.setMode($('onMic').value));

  // who is talking (HUD + lobby), refreshed ~10x a second
  let tick = 0;
  (function loop() {
    requestAnimationFrame(loop);
    if (++tick % 6) return;
    const list = $('voiceList'); if (!list) return;
    if (!VG.Net.role) { if (list.innerHTML) list.innerHTML = ''; return; }
    updateMuting();
    const names = [];
    if (V.tx) names.push(['YOU', true]);
    for (const [pid, e] of V.calls) {
      if (!e.audio || e.audio.muted) continue;
      // incoming volume straight from WebRTC (works even while the page's AudioContext is suspended)
      let lvl = 0;
      try {
        const pc = e.call.peerConnection, r = pc && pc.getReceivers().find(x => x.track && x.track.kind === 'audio');
        const src = r && r.getSynchronizationSources ? r.getSynchronizationSources()[0] : null;
        if (src && performance.timeOrigin + performance.now() - src.timestamp < 500) lvl = src.audioLevel || 0;
      } catch (_) { /* older browsers: no meter */ }
      e.level = e.level * 0.6 + lvl * 0.4;
      if (e.level > 0.015) { const pl = VG.Net.players.find(p => p.pid === pid); if (pl) names.push([pl.name, false]); }
    }
    const html = names.map(([n, me]) => `<div class="vTalk${me ? ' me' : ''}">🎙 ${n}</div>`).join('');
    if (list.innerHTML !== html) list.innerHTML = html;
    const mic = $('tMic'); if (mic) mic.classList.toggle('show', !!(G.online && mode === 'ptt'));
  })();
  render();
})();
