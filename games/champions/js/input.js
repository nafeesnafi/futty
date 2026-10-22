// Keyboard, gamepad and touch input, merged into one stream:
//   FC.Input.poll() -> { x, y, sprint } in screen space (x right, y up)
//   FC.Input.onAction(fn) -> fn({ a: 'pass'|'through'|'shoot'|'switch', power }) on button release/press
// Shoot is a hold-to-charge button; its power is reported when it is released.
var FC = window.FC = window.FC || {};

(() => {
  const keys = {};
  const listeners = [];
  let charge = null;          // { t0 } while the shoot button is held
  let enabled = false;
  const touch = { x: 0, y: 0, sprint: false, active: false, shield: false };
  const pad = { prev: {} };

  const MAP = {
    pass: ['KeyJ', 'KeyZ'],
    through: ['KeyL', 'KeyC'],
    shoot: ['KeyK', 'KeyX'],
    switch: ['KeyQ', 'Space'],
  };
  const codeToAction = {};
  for (const [a, codes] of Object.entries(MAP)) for (const c of codes) codeToAction[c] = a;

  function fire(a, extra) { if (!enabled) return; for (const f of listeners) f(Object.assign({ a }, extra)); }
  function startCharge() { if (enabled && !charge) charge = { t0: performance.now() }; }
  function releaseCharge() {
    if (!charge) return;
    const power = FC.Input.chargeLevel();
    charge = null;
    fire('shoot', { power });
  }

  addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && enabled) e.preventDefault();
    if (keys[e.code]) return;         // ignore auto-repeat
    keys[e.code] = true;
    const a = codeToAction[e.code];
    if (!a) return;
    if (a === 'shoot') startCharge(); else fire(a);
  });
  addEventListener('keyup', e => {
    keys[e.code] = false;
    if (codeToAction[e.code] === 'shoot') releaseCharge();
  });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; charge = null; });

  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find(p => p && p.connected);
    if (!gp) return null;
    const btn = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    // standard mapping: 0 A, 1 B, 3 Y, 4 LB, 5 RB, 7 RT, 9 Start
    const now = { pass: btn(0), shoot: btn(1), through: btn(3), switch: btn(4), pause: btn(9) };
    if (now.pass && !pad.prev.pass) fire('pass');
    if (now.through && !pad.prev.through) fire('through');
    if (now.switch && !pad.prev.switch) fire('switch');
    if (now.shoot && !pad.prev.shoot) startCharge();
    if (!now.shoot && pad.prev.shoot) releaseCharge();
    if (now.pause && !pad.prev.pause) for (const f of FC.Input._pause) f();
    pad.prev = now;
    let x = gp.axes[0] || 0, y = -(gp.axes[1] || 0);
    if (Math.hypot(x, y) < 0.18) { x = 0; y = 0; }
    if (btn(14)) x = -1; if (btn(15)) x = 1; if (btn(12)) y = 1; if (btn(13)) y = -1;
    return { x, y, sprint: btn(5) || btn(7), shield: btn(4) };
  }

  FC.Input = {
    _pause: [],
    enable(on) { enabled = on; if (!on) charge = null; },
    onAction(f) { listeners.push(f); },
    onPause(f) { this._pause.push(f); },
    charging() { return !!charge; },
    chargeLevel() { return charge ? Math.min(1, (performance.now() - charge.t0) / 900) : 0; },
    poll() {
      let x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      let y = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      let sprint = !!(keys.ShiftLeft || keys.ShiftRight);
      // holding Switch while on the ball shields it
      let shield = MAP.switch.some(k => keys[k]);
      const g = pollGamepad();
      if (g && (g.x || g.y)) { x = g.x; y = g.y; }
      if (g && g.sprint) sprint = true;
      if (g && g.shield) shield = true;
      if (touch.shield) shield = true;
      if (touch.active) { x = touch.x; y = touch.y; }
      if (touch.sprint) sprint = true;
      const n = Math.hypot(x, y);
      if (n > 1) { x /= n; y /= n; }
      return { x, y, sprint, shield };
    },

    // on-screen controls for phones/tablets
    bindTouch(root) {
      const stick = root.querySelector('.stick'), knob = root.querySelector('.knob');
      let id = null;
      const move = e => {
        const r = stick.getBoundingClientRect();
        let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = -(e.clientY - r.top - r.height / 2) / (r.height / 2);
        const n = Math.hypot(x, y); if (n > 1) { x /= n; y /= n; }
        touch.x = x; touch.y = y; touch.active = true;
        knob.style.transform = `translate(${x * 34}px, ${-y * 34}px)`;
      };
      stick.addEventListener('pointerdown', e => { id = e.pointerId; stick.setPointerCapture(id); move(e); FC.Audio.unlock(); });
      stick.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
      const end = e => { if (e.pointerId !== id) return; id = null; touch.active = false; touch.x = touch.y = 0; knob.style.transform = ''; };
      stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
      for (const b of root.querySelectorAll('[data-act]')) {
        const a = b.dataset.act;
        b.addEventListener('pointerdown', e => {
          e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('down');
          if (a === 'shoot') startCharge(); else if (a === 'sprint') touch.sprint = true; else fire(a);
          if (a === 'switch') touch.shield = true;
        });
        const up = () => { b.classList.remove('down'); if (a === 'shoot') releaseCharge(); if (a === 'sprint') touch.sprint = false; if (a === 'switch') touch.shield = false; };
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      }
    },
  };
})();
