// Controls screen: rebind keyboard keys and gamepad buttons, choose control options, and see the move list.
// Opened from the main menu or the pause menu; everything is saved by FC.Input.
var FC = window.FC = window.FC || {};

(() => {
  const $ = id => document.getElementById(id);
  const I = () => FC.Input;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ESSENTIAL = ['up', 'down', 'left', 'right', 'pass', 'shoot'];
  let tab = 'keyboard', from = 'scrTitle', note = '', resetArmed = false;

  function kbd(a) { return `<kbd>${esc(I().label(a))}</kbd>`; }
  function nameOf(list, a) { const r = list.find(x => x[0] === a); return r ? r[1].split(' · ')[0] : a; }

  function keyboardTab() {
    const k = I().keys();
    const missing = ESSENTIAL.filter(a => !k[a][0] && !k[a][1]);
    return `
      <p class="note">Click a slot, then press the key you want. <b>Esc</b> cancels, <b>Backspace</b> clears the slot.
        A key can only do one thing, so taking a key from another action clears it there.</p>
      ${missing.length ? `<p class="warn" role="alert">No key set for: ${missing.map(a => esc(nameOf(I().ACTIONS, a))).join(', ')}</p>` : ''}
      <div class="binds">
        <div class="bh"><span>Action</span><span>Main</span><span>Spare</span></div>
        ${I().ACTIONS.map(([a, label]) => `
          <div class="bindrow"><span class="bl">${esc(label)}</span>
            ${[0, 1].map(i => `<button class="slot${k[a][i] ? '' : ' empty'}" data-key="${a}" data-slot="${i}">${esc(I().keyName(k[a][i]))}</button>`).join('')}
          </div>`).join('')}
      </div>`;
  }

  function gamepadTab() {
    const p = I().pad();
    return `
      <p class="note">${I().padConnected() ? 'Gamepad connected.' : 'No gamepad detected. Connect one and press any button on it.'}
        Click a slot, then press a button on the gamepad. The left stick moves; the D-pad sets mentality (up attacking, left/right balanced, down defensive).
        Giving a button to another action swaps the two.</p>
      <div class="binds">
        <div class="bh"><span>Action</span><span>Button</span><span></span></div>
        ${I().PAD_ACTIONS.map(([a, label]) => `
          <div class="bindrow"><span class="bl">${esc(label)}</span>
            <button class="slot" data-pad="${a}">${esc(I().padName(p[a]))}</button><span></span>
          </div>`).join('')}
      </div>`;
  }

  function seg(id, value, options) {
    return `<span class="seg" data-opt="${id}">${options.map(([v, l]) => `<button data-v="${v}" class="${String(value) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</span>`;
  }
  function optionsTab() {
    const o = I().opts();
    return `
      <div class="optgrid">
        <span class="optlbl">Sprint</span>
        <span>${seg('sprintToggle', o.sprintToggle, [[false, 'Hold'], [true, 'Tap to toggle']])}
          <span class="note">Toggle: tap Sprint to start running and tap again to stop.</span></span>
        <span class="optlbl">Touch buttons</span>
        <span>${seg('touchSize', o.touchSize, [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']])}</span>
        <span class="optlbl">Touch layout</span>
        <span>${seg('touchSwap', o.touchSwap, [[false, 'Stick left'], [true, 'Stick right (left-handed)']])}</span>
      </div>
      <button class="btn${resetArmed ? ' danger' : ''}" id="ctlReset">${resetArmed ? 'Click again to reset everything' : 'Reset all controls to default'}</button>`;
  }

  function movesTab() {
    const rows = [
      [`${kbd('shoot')} while holding sideways`, 'Finesse shot that curls into the corner'],
      [`${kbd('pass')} while charging ${kbd('shoot')}`, 'Fake shot: defenders bite, you swerve away'],
      [`${kbd('sprint')} twice quickly`, 'Knock the ball about 5 m ahead and chase it'],
      [`Hold ${kbd('switch')} on the ball`, 'Shield the ball from a defender'],
      [`Hold ${kbd('switch')} when defending`, 'Send a team-mate to press the ball carrier'],
      [`${kbd('shoot')} or ${kbd('pass')} as a ball arrives`, 'Header, volley or first-time pass'],
      [`${kbd('lob')} from wide in the final third`, 'Whipped cross into the box'],
      ['Free kick near goal / penalty', `Move the gold target, ${kbd('switch')} cycles curl, hold ${kbd('shoot')} for power`],
      ['Facing a penalty', 'Hold left or right as the kick is taken to dive'],
    ];
    return `<div class="keys">${rows.map(r => `<span>${r[0]}</span><span>${r[1]}</span>`).join('')}</div>
      <p class="note">Touch: stick plus buttons; pass and shoot go the way you're holding. Gamepad: left stick moves, buttons as set on the Gamepad tab.</p>`;
  }

  function render() {
    const w = $('controlsWrap');
    const tabs = [['keyboard', 'Keyboard'], ['gamepad', 'Gamepad'], ['options', 'Options & touch'], ['moves', 'Moves']];
    w.innerHTML = `
      <div class="topbar"><h2>Controls</h2><button class="btn primary" id="ctlDone">Done</button></div>
      <div class="tabs" role="tablist">${tabs.map(([t, l]) => `<button role="tab" aria-selected="${t === tab}" class="${t === tab ? 'on' : ''}" data-tab="${t}">${l}</button>`).join('')}</div>
      ${note ? `<p class="note ctlnote" role="status">${note}</p>` : ''}
      <div class="ctlbody">${tab === 'keyboard' ? keyboardTab() : tab === 'gamepad' ? gamepadTab() : tab === 'options' ? optionsTab() : movesTab()}</div>`;
    w.querySelector('#ctlDone').onclick = close;
    w.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { I().cancelCapture(); tab = b.dataset.tab; note = ''; resetArmed = false; render(); });
    w.querySelectorAll('[data-key]').forEach(b => b.onclick = () => listenKey(b));
    w.querySelectorAll('[data-pad]').forEach(b => b.onclick = () => listenPad(b));
    w.querySelectorAll('[data-opt]').forEach(sg => sg.querySelectorAll('button').forEach(b => b.onclick = () => {
      const v = b.dataset.v, k = sg.dataset.opt;
      I().setOpt(k, v === 'true' ? true : v === 'false' ? false : v);
      note = 'Saved.'; render();
    }));
    const r = w.querySelector('#ctlReset');
    if (r) r.onclick = () => {
      if (!resetArmed) { resetArmed = true; render(); return; }
      I().reset(); resetArmed = false; note = 'All controls are back to their defaults.'; render();
    };
  }

  function listenKey(btn) {
    I().cancelCapture();
    render();   // clear any other slot that was listening
    const b = $('controlsWrap').querySelector(`[data-key="${btn.dataset.key}"][data-slot="${btn.dataset.slot}"]`);
    b.textContent = 'Press a key…'; b.classList.add('listening');
    const action = b.dataset.key, slot = +b.dataset.slot;
    I().captureKey(code => {
      const label = nameOf(I().ACTIONS, action);
      if (code === 'Escape') note = '';
      else if (code === 'Backspace' || code === 'Delete') { I().setKey(action, slot, null); note = `Cleared a key for ${esc(label)}.`; }
      else {
        const moved = I().setKey(action, slot, code);
        note = `${esc(label)}: ${esc(I().keyName(code))}` + (moved && moved !== action ? ` (taken from ${esc(nameOf(I().ACTIONS, moved))})` : '') + '. Saved.';
      }
      render();
    });
  }

  function listenPad(btn) {
    I().cancelCapture();
    render();
    const b = $('controlsWrap').querySelector(`[data-pad="${btn.dataset.pad}"]`);
    b.textContent = 'Press a button…'; b.classList.add('listening');
    const action = b.dataset.pad;
    I().captureKey(code => { if (code === 'Escape') { I().cancelCapture(); note = ''; render(); } });   // Esc cancels
    I().capturePadButton(i => {
      I().cancelCapture();
      const label = nameOf(I().PAD_ACTIONS, action);
      if (i >= 12 && i <= 15) note = 'The D-pad is used for mentality. Pick another button.';
      else {
        const moved = I().setPad(action, i);
        note = `${esc(label)}: ${esc(I().padName(i))}` + (moved ? ` (swapped with ${esc(nameOf(I().PAD_ACTIONS, moved))})` : '') + '. Saved.';
      }
      render();
    });
  }

  function close() {
    I().cancelCapture(); note = ''; resetArmed = false;
    FC.show(from);
  }

  FC.Controls = {
    open(opener) { from = opener || 'scrTitle'; tab = 'keyboard'; note = ''; resetArmed = false; render(); FC.show('scrControls'); },
  };
})();
