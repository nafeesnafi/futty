// Touch controls for phones and tablets. Writes into the same input object as keyboard/mouse:
// left thumb = floating move stick (push to the edge to sprint), right side = drag to look,
// buttons for fire (drag it to aim while shooting), ADS toggle, jump, crouch/slide, reload, swap.
(function () {
  const VG = window.VG, G = VG.Game;
  if (!G.touch) return;
  const inp = G.input;
  const $ = (id) => document.getElementById(id);
  document.body.classList.add('touch');
  const vp = document.querySelector('meta[name=viewport]');
  if (vp) vp.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

  const root = document.createElement('div');
  root.id = 'touch'; root.className = 'hidden';
  root.innerHTML = `
    <div id="tLeft" class="tzone"></div><div id="tRight" class="tzone"></div>
    <div id="stickBase"><div id="stickKnob"></div></div>
    <button class="tb" id="tFire">FIRE</button>
    <button class="tb" id="tAds">AIM</button>
    <button class="tb" id="tJump">JUMP</button>
    <button class="tb" id="tCrouch">CROUCH</button>
    <button class="tb" id="tReload">R</button>
    <button class="tb" id="tSwap">⇄</button>
    <button class="tb" id="tSteady">STEADY</button>
    <button class="tb pill" id="tUav">UAV</button>
    <button class="tb pill" id="tAir">AIRSTRIKE</button>
    <button class="tb sq" id="tPause">❚❚</button>
    <button class="tb sq" id="tBoard">☰</button>
    <button class="tb" id="tMic">MIC</button>
    <button class="tb story" id="tLight">LIGHT</button>
    <button class="tb story" id="tNV">NV</button>
    <div id="tEdit">
      <div class="tEdTitle">Drag buttons to move them · tap one to select it, then resize</div>
      <label>Size <input type="range" id="tEdSize" min="0.6" max="1.7" step="0.05" value="1"></label>
      <label>Opacity <input type="range" id="tEdOp" min="0.25" max="1" step="0.05" value="1"></label>
      <button id="tEdReset">RESET</button><button id="tEdDone">SAVE</button>
    </div>`;
  document.body.appendChild(root);
  const rot = document.createElement('div');
  rot.id = 'rotate'; rot.innerHTML = '<div>⟳</div>Turn your phone sideways to play';
  document.body.appendChild(rot);

  const LOOK = 1.5;           // touch look speed multiplier on top of the sensitivity setting
  const R = 56;               // stick radius in px
  const looks = new Map();    // pointerId -> {x, y}
  let stickId = null, sx = 0, sy = 0;
  const base = $('stickBase'), knob = $('stickKnob');

  const live = () => G.running && !G.paused && !G.ended;
  function tapRespawn() {
    if (G.player && !G.player.alive && G.respawnT <= 0) { G.respawnPlayer(); return true; }
    return false;
  }

  // ---- move stick (floating: appears where the thumb lands) ----
  const left = $('tLeft');
  left.addEventListener('pointerdown', (e) => {
    e.preventDefault(); VG.Audio.init();
    if (tapRespawn() || stickId !== null) return;
    stickId = e.pointerId; sx = e.clientX; sy = e.clientY;
    left.setPointerCapture(e.pointerId);
    base.style.left = sx + 'px'; base.style.top = sy + 'px'; base.classList.add('on');
    knob.style.transform = 'translate(-50%,-50%)';
    inp.stick = { x: 0, y: 0 };
  });
  left.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - sx, dy = e.clientY - sy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const x = dx / R, y = dy / R;
    inp.stick = { x: Math.abs(x) < 0.12 ? 0 : x, y: Math.abs(y) < 0.12 ? 0 : y };
    // auto-sprint when the stick is pushed all the way forward (or past the rim)
    inp.down.ShiftLeft = (d > R * 1.05 || Math.hypot(x, y) > 0.95) && y < -0.65 && !steadyHeld;
  });
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null; inp.stick = null; if (!steadyHeld) inp.down.ShiftLeft = false;
    base.classList.remove('on');
  };
  left.addEventListener('pointerup', endStick); left.addEventListener('pointercancel', endStick);

  // ---- look (right side, and while holding FIRE) ----
  function lookStart(e, el) {
    looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }
  function lookMove(e) {
    const l = looks.get(e.pointerId); if (!l) return;
    const dx = e.clientX - l.x, dy = e.clientY - l.y;
    l.x = e.clientX; l.y = e.clientY;
    if (live() && G.player.alive) G.player.look(dx * LOOK, dy * LOOK);
  }
  const lookEnd = (e) => looks.delete(e.pointerId);
  const right = $('tRight');
  right.addEventListener('pointerdown', (e) => { e.preventDefault(); VG.Audio.init(); if (tapRespawn()) return; lookStart(e, right); });
  right.addEventListener('pointermove', lookMove);
  right.addEventListener('pointerup', lookEnd); right.addEventListener('pointercancel', lookEnd);

  // ---- buttons ----
  // ---- layout (custom button positions/sizes, saved per device) ----
  const LAYOUT_KEY = 'fsg.vanguard.touchLayout';
  const EDITABLE = ['tFire', 'tAds', 'tJump', 'tCrouch', 'tReload', 'tSwap', 'tSteady', 'tUav', 'tAir', 'tPause', 'tBoard', 'tMic', 'tLight', 'tNV'];
  let layout = {};
  try { layout = JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch (_) { layout = {}; }
  let editing = false, sel = null, drag = null;
  function applyLayout() {
    for (const id of EDITABLE) {
      const el = $(id), L = layout[id];
      if (L) {
        el.style.left = (L.x * 100) + '%'; el.style.top = (L.y * 100) + '%'; el.style.right = 'auto'; el.style.bottom = 'auto';
        el.style.transform = `translate(-50%, -50%) scale(${L.s || 1})`;
      } else { el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.transform = ''; }
    }
    root.style.setProperty('--tbOpacity', layout._op || 1);
  }
  function entry(el) {
    const id = el.id;
    if (!layout[id]) { const r = el.getBoundingClientRect(); layout[id] = { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight, s: 1 }; }
    return layout[id];
  }
  function select(el) {
    if (sel) sel.classList.remove('sel');
    sel = el; el.classList.add('sel');
    $('tEdSize').value = entry(el).s || 1;
    applyLayout();
  }
  VG.TouchLayout = {
    open() {
      editing = true; root.classList.add('editing'); root.classList.remove('hidden');
      $('menu').classList.add('hidden'); $('tEdOp').value = layout._op || 1; sel = null; applyLayout();
    },
  };
  $('tEdSize').addEventListener('input', () => { if (sel) { entry(sel).s = +$('tEdSize').value; applyLayout(); } });
  $('tEdOp').addEventListener('input', () => { layout._op = +$('tEdOp').value; applyLayout(); });
  $('tEdReset').addEventListener('click', () => { layout = {}; $('tEdOp').value = 1; $('tEdSize').value = 1; if (sel) sel.classList.remove('sel'); sel = null; applyLayout(); });
  $('tEdDone').addEventListener('click', () => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch (_) { /* private mode */ }
    editing = false; root.classList.remove('editing'); if (sel) sel.classList.remove('sel'); sel = null;
    root.classList.add('hidden'); $('menu').classList.remove('hidden');
  });
  ['tEdit', 'tEdSize', 'tEdOp'].forEach(id => $(id).addEventListener('pointerdown', (e) => e.stopPropagation()));

  function btn(id, down, up) {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (editing) { select(el); drag = { id: e.pointerId }; try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } return; }
      VG.Audio.init(); el.classList.add('held'); down(e, el);
    });
    el.addEventListener('pointermove', (e) => {
      if (!editing || !drag || drag.id !== e.pointerId) return;
      const L = entry(el);
      L.x = Math.max(0.03, Math.min(0.97, e.clientX / innerWidth)); L.y = Math.max(0.05, Math.min(0.95, e.clientY / innerHeight));
      applyLayout();
    });
    const rel = (e) => { if (editing) { drag = null; return; } el.classList.remove('held'); if (up) up(e, el); };
    el.addEventListener('pointerup', rel); el.addEventListener('pointercancel', rel);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return el;
  }
  btn('tFire', (e, el) => { if (tapRespawn()) return; inp.mouse[0] = true; lookStart(e, el); },
    (e) => { inp.mouse[0] = false; lookEnd(e); });
  $('tFire').addEventListener('pointermove', lookMove);
  const ads = btn('tAds', () => { inp.mouse[2] = !inp.mouse[2]; });
  btn('tJump', () => { inp.pressed.Space = true; });
  btn('tCrouch', () => { inp.pressed.KeyC = true; });
  btn('tReload', () => { inp.pressed.KeyR = true; });
  btn('tSwap', () => { inp.wheel = 1; inp.mouse[2] = false; });
  let steadyHeld = false;
  btn('tSteady', () => { steadyHeld = true; inp.down.ShiftLeft = true; }, () => { steadyHeld = false; inp.down.ShiftLeft = false; });
  btn('tUav', () => { inp.pressed.Digit4 = true; });
  btn('tAir', () => { inp.pressed.Digit5 = true; });
  btn('tPause', () => { G.setPaused(true); });
  btn('tLight', () => { inp.pressed.KeyL = true; });
  btn('tNV', () => { inp.pressed.KeyN = true; });
  btn('tMic', () => { if (VG.Voice) VG.Voice.setPtt(true); }, () => { if (VG.Voice) VG.Voice.setPtt(false); });
  let board = false;
  btn('tBoard', () => { board = !board; VG.HUD.showBoard(board); });

  applyLayout();
  $('keysBtn').textContent = 'TOUCH LAYOUT';

  // ---- lifecycle ----
  G.onMatchStart = () => { inp.mouse = [false, false, false]; inp.stick = null; looks.clear(); stickId = null; board = false; };
  G.onPauseChange = (p) => { if (p) { looks.clear(); stickId = null; base.classList.remove('on'); } };
  $('playBtn').addEventListener('click', () => {
    const d = document.documentElement;
    try {
      const r = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen && d.webkitRequestFullscreen();
      if (r && r.then) r.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    } catch (_) { /* fullscreen is optional */ }
  });

  // show/hide controls and context buttons every frame (cheap class toggles)
  const els = { fire: $('tFire'), steady: $('tSteady'), uav: $('tUav'), air: $('tAir'), ads };
  (function poll() {
    requestAnimationFrame(poll);
    if (editing) return;
    const on = live();
    root.classList.toggle('hidden', !on);
    document.body.classList.toggle('playing', G.running && !G.ended);
    if (!on) { inp.mouse[0] = false; return; }
    const p = G.player;
    if (p.alive === false && inp.mouse[2]) inp.mouse[2] = false;
    els.ads.classList.toggle('active', !!inp.mouse[2]);
    els.steady.classList.toggle('show', !!p.scopedNow);
    els.uav.classList.toggle('show', !!G.uavReady);
    els.air.classList.toggle('show', !!G.airReady);
  })();
})();
