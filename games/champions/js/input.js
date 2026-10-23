// Keyboard, gamepad and touch input, merged into one stream:
//   FC.Input.poll() -> { x, y, sprint, shield } in screen space (x right, y up)
//   FC.Input.onAction(fn) -> fn({ a: 'pass'|'through'|'shoot'|'switch'|'lob'|'fake'|'knock'|'mentality', power, m })
// Shoot is a hold-to-charge button; its power is reported when it is released.
// Key and gamepad bindings and control options are player-editable and saved in localStorage.
var FC = window.FC = window.FC || {};

(() => {
  const STORE_KEY = 'fsg.champions.controls';
  const keys = {};
  const listeners = [];
  let charge = null;          // { t0 } while the shoot button is held
  let enabled = false;
  let sprintLatched = false;  // sprint state in "toggle" mode
  const touch = { x: 0, y: 0, sprint: false, active: false, shield: false };
  const pad = { prev: {} };

  // ---------- bindings ----------
  // Keyboard: two slots per action (main + spare). Codes are KeyboardEvent.code values.
  const DEFAULT_KEYS = {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    pass: ['KeyJ', 'KeyZ'], through: ['KeyL', 'KeyC'], lob: ['KeyI', 'KeyV'], shoot: ['KeyK', 'KeyX'],
    switch: ['KeyQ', 'Space'],
    mentDef: ['Digit1', null], mentBal: ['Digit2', null], mentAtt: ['Digit3', null],
    pause: ['KeyP', 'Escape'], mute: ['KeyM', null],
  };
  // Gamepad (standard mapping): one button per action; sprint also answers to a second trigger.
  const DEFAULT_PAD = { pass: 0, shoot: 1, lob: 2, through: 3, switch: 4, sprint: 5, sprint2: 7, pause: 9 };
  const DEFAULT_OPTS = { sprintToggle: false, touchSize: 'm', touchSwap: false };

  const ACTIONS = [
    ['up', 'Move up'], ['down', 'Move down'], ['left', 'Move left'], ['right', 'Move right'],
    ['sprint', 'Sprint · double-tap to knock the ball on'],
    ['pass', 'Pass · tackle when defending'], ['through', 'Through ball'], ['lob', 'Lob / cross'],
    ['shoot', 'Shoot (hold for power) · slide tackle'], ['switch', 'Switch player · hold to shield or press'],
    ['mentDef', 'Mentality: defensive'], ['mentBal', 'Mentality: balanced'], ['mentAtt', 'Mentality: attacking'],
    ['pause', 'Pause'], ['mute', 'Mute sound'],
  ];
  const PAD_ACTIONS = [
    ['pass', 'Pass · tackle'], ['shoot', 'Shoot · slide tackle'], ['lob', 'Lob / cross'], ['through', 'Through ball'],
    ['switch', 'Switch · hold to shield or press'], ['sprint', 'Sprint'], ['sprint2', 'Sprint (second button)'], ['pause', 'Pause'],
  ];

  const clone = o => JSON.parse(JSON.stringify(o));
  let cfg = load();
  let codeToAction = {};
  rebuild();

  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (_) {}
    const c = { keys: clone(DEFAULT_KEYS), pad: clone(DEFAULT_PAD), opts: clone(DEFAULT_OPTS) };
    if (saved && typeof saved === 'object') {
      for (const a in c.keys) if (saved.keys && Array.isArray(saved.keys[a])) c.keys[a] = [saved.keys[a][0] || null, saved.keys[a][1] || null];
      for (const a in c.pad) if (saved.pad && Number.isInteger(saved.pad[a])) c.pad[a] = saved.pad[a];
      for (const o in c.opts) if (saved.opts && typeof saved.opts[o] === typeof c.opts[o]) c.opts[o] = saved.opts[o];
    }
    return c;
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (_) {} }
  function rebuild() {
    codeToAction = {};
    for (const [a, slots] of Object.entries(cfg.keys)) for (const c of slots) if (c) codeToAction[c] = a;
    applyTouchOpts();
  }
  function applyTouchOpts() {
    if (!document.body) return;
    document.body.classList.toggle('touch-swap', !!cfg.opts.touchSwap);
    for (const s of ['s', 'm', 'l']) document.body.classList.toggle('touch-' + s, cfg.opts.touchSize === s);
  }
  const held = a => (cfg.keys[a] || []).some(c => c && keys[c]);

  // ---------- actions ----------
  function fire(a, extra) { if (!enabled) return; for (const f of listeners) f(Object.assign({ a }, extra)); }
  // Pass while charging a shot = fake shot
  function press(a) { if (a === 'pass' && charge) { charge = null; fire('fake'); } else fire(a); }
  // double-tapping sprint knocks the ball ahead
  let lastSprint = 0;
  function sprintTap() {
    const now = performance.now();
    if (now - lastSprint < 300) { fire('knock'); lastSprint = 0; } else lastSprint = now;
    if (cfg.opts.sprintToggle) sprintLatched = !sprintLatched;
  }
  function startCharge() { if (enabled && !charge) charge = { t0: performance.now() }; }
  function releaseCharge() {
    if (!charge) return;
    const power = FC.Input.chargeLevel();
    charge = null;
    fire('shoot', { power });
  }

  // ---------- capture (rebinding) ----------
  let captureKey = null, capturePad = null;

  addEventListener('keydown', e => {
    if (captureKey) { e.preventDefault(); const cb = captureKey; captureKey = null; cb(e.code); return; }
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const a = codeToAction[e.code];
    if (enabled && (a || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code))) e.preventDefault();
    if (keys[e.code]) return;         // ignore auto-repeat
    keys[e.code] = true;
    if (!a) return;
    if (a === 'pause') { for (const f of FC.Input._pause) f(); return; }
    if (a === 'mute') { for (const f of FC.Input._mute) f(); return; }
    if (a === 'sprint') { sprintTap(); return; }
    if (a === 'mentDef' || a === 'mentBal' || a === 'mentAtt') { fire('mentality', { m: ['mentDef', 'mentBal', 'mentAtt'].indexOf(a) }); return; }
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') return;
    if (a === 'shoot') startCharge(); else press(a);
  });
  addEventListener('keyup', e => {
    keys[e.code] = false;
    if (codeToAction[e.code] === 'shoot') releaseCharge();
  });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; charge = null; });

  function getPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return pads && [...pads].find(p => p && p.connected) || null;
  }

  function pollGamepad() {
    const gp = getPad();
    if (!gp) return null;
    const btn = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    if (capturePad) {
      // wait for a fresh press (ignore buttons already held when capture began)
      for (let i = 0; i < gp.buttons.length; i++) {
        if (btn(i) && !capturePad.held.has(i)) { const cb = capturePad.cb; capturePad = null; cb(i); break; }
        if (!btn(i)) capturePad && capturePad.held.delete(i);
      }
      return null;
    }
    const P = cfg.pad;
    const now = { pass: btn(P.pass), shoot: btn(P.shoot), lob: btn(P.lob), through: btn(P.through), switch: btn(P.switch), pause: btn(P.pause), sprint: btn(P.sprint) || btn(P.sprint2) };
    if (now.pass && !pad.prev.pass) press('pass');
    if (now.lob && !pad.prev.lob) fire('lob');
    if (now.sprint && !pad.prev.sprint) sprintTap();
    // D-pad: up attacking, left/right balanced, down defensive
    const dp = btn(12) ? 2 : btn(13) ? 0 : (btn(14) || btn(15)) ? 1 : -1;
    if (dp >= 0 && dp !== pad.prevDp) fire('mentality', { m: dp });
    pad.prevDp = dp;
    if (now.through && !pad.prev.through) fire('through');
    if (now.switch && !pad.prev.switch) fire('switch');
    if (now.shoot && !pad.prev.shoot) startCharge();
    if (!now.shoot && pad.prev.shoot) releaseCharge();
    if (now.pause && !pad.prev.pause) for (const f of FC.Input._pause) f();
    pad.prev = now;
    let x = gp.axes[0] || 0, y = -(gp.axes[1] || 0);
    if (Math.hypot(x, y) < 0.18) { x = 0; y = 0; }
    return { x, y, sprint: now.sprint, shield: now.switch };
  }

  // ---------- display names ----------
  const SPECIAL = {
    Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', CapsLock: 'Caps',
    Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  };
  function keyName(code) {
    if (!code) return '—';
    if (SPECIAL[code]) return SPECIAL[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return code;
  }
  const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L-stick', 'R-stick', 'D-up', 'D-down', 'D-left', 'D-right', 'Home'];
  const padName = i => (i == null ? '—' : PAD_NAMES[i] || 'Button ' + i);

  FC.Input = {
    _pause: [], _mute: [],
    ACTIONS, PAD_ACTIONS,
    enable(on) { enabled = on; if (!on) { charge = null; sprintLatched = false; } },
    onAction(f) { listeners.push(f); },
    onPause(f) { this._pause.push(f); },
    onMute(f) { this._mute.push(f); },
    charging() { return !!charge; },
    chargeLevel() { return charge ? Math.min(1, (performance.now() - charge.t0) / 900) : 0; },
    poll() {
      let x = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
      let y = (held('up') ? 1 : 0) - (held('down') ? 1 : 0);
      let sprint = cfg.opts.sprintToggle ? sprintLatched : held('sprint');
      // holding Switch while on the ball shields it
      let shield = held('switch');
      const g = pollGamepad();
      if (g && (g.x || g.y)) { x = g.x; y = g.y; }
      if (g && g.sprint && !cfg.opts.sprintToggle) sprint = true;
      if (g && g.shield) shield = true;
      if (touch.shield) shield = true;
      if (touch.active) { x = touch.x; y = touch.y; }
      if (touch.sprint && !cfg.opts.sprintToggle) sprint = true;
      const n = Math.hypot(x, y);
      if (n > 1) { x /= n; y /= n; }
      return { x, y, sprint, shield };
    },

    // ---------- settings API (used by the Controls screen) ----------
    keyName, padName,
    keys: () => clone(cfg.keys),
    pad: () => clone(cfg.pad),
    opts: () => clone(cfg.opts),
    padConnected: () => !!getPad(),
    // the main key for an action, for on-screen hints
    label(a) { const s = cfg.keys[a] || []; return keyName(s[0] || s[1]); },
    // bind a key; if another action used it, that slot is cleared and its action is returned
    setKey(action, slot, code) {
      let moved = null;
      if (code) for (const [a, slots] of Object.entries(cfg.keys)) slots.forEach((c, i) => {
        if (c === code && !(a === action && i === slot)) { slots[i] = null; moved = a; }
      });
      cfg.keys[action][slot] = code;
      rebuild(); save();
      return moved;
    },
    setPad(action, idx) {
      let moved = null;
      for (const [a, b] of Object.entries(cfg.pad)) if (b === idx && a !== action) { cfg.pad[a] = cfg.pad[action]; moved = a; }   // swap
      cfg.pad[action] = idx;
      save();
      return moved;
    },
    setOpt(k, v) { cfg.opts[k] = v; if (k === 'sprintToggle') sprintLatched = false; rebuild(); save(); },
    reset() { cfg = { keys: clone(DEFAULT_KEYS), pad: clone(DEFAULT_PAD), opts: clone(DEFAULT_OPTS) }; rebuild(); save(); },
    captureKey(cb) { captureKey = cb; },
    capturePadButton(cb) {
      const gp = getPad(), held = new Set();
      if (gp) gp.buttons.forEach((b, i) => b.pressed && held.add(i));
      capturePad = { cb, held };
      const tick = () => { if (capturePad) { pollGamepad(); requestAnimationFrame(tick); } };
      requestAnimationFrame(tick);
    },
    cancelCapture() { captureKey = null; capturePad = null; },
    capturing: () => !!(captureKey || capturePad),
    applyTouchOpts,

    // on-screen controls for phones/tablets
    bindTouch(root) {
      applyTouchOpts();
      const stick = root.querySelector('.stick'), knob = root.querySelector('.knob');
      let id = null;
      const move = e => {
        const r = stick.getBoundingClientRect(), R = r.width / 2;
        let x = (e.clientX - r.left - R) / R, y = -(e.clientY - r.top - R) / R;
        const n = Math.hypot(x, y); if (n > 1) { x /= n; y /= n; }
        touch.x = x; touch.y = y; touch.active = true;
        knob.style.transform = `translate(${x * R * 0.53}px, ${-y * R * 0.53}px)`;
      };
      stick.addEventListener('pointerdown', e => { id = e.pointerId; stick.setPointerCapture(id); move(e); FC.Audio.unlock(); });
      stick.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
      const end = e => { if (e.pointerId !== id) return; id = null; touch.active = false; touch.x = touch.y = 0; knob.style.transform = ''; };
      stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
      for (const b of root.querySelectorAll('[data-act]')) {
        const a = b.dataset.act;
        b.addEventListener('pointerdown', e => {
          e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('down');
          if (a === 'shoot') startCharge(); else if (a === 'sprint') { touch.sprint = true; sprintTap(); } else press(a);
          if (a === 'switch') touch.shield = true;
        });
        const up = () => { b.classList.remove('down'); if (a === 'shoot') releaseCharge(); if (a === 'sprint') touch.sprint = false; if (a === 'switch') touch.shield = false; };
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      }
    },
  };
})();
