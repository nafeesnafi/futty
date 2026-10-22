// Story engine for the campaign: timed moral decisions (time dilation, tunnel vision, tinnitus),
// radio / spoken subtitles, letterbox, title cards, objectives, and the Psyche & Guilt matrix.
// Everything is promise-based so chapter scripts read top to bottom; waits run on game time (pause-safe).
(function () {
  const VG = window.VG, G = VG.Game, A = VG.Audio;
  const $ = (id) => document.getElementById(id);

  const S = VG.Story = {};
  S.psyche = null;
  S.reset = function () {
    S.psyche = { guiltLevel: 0, civilianCasualties: 0, squadTrust: 70, brokenVows: 0, choices: {} };
    waits.length = 0; queue.length = 0; cur = null; decision = null;
    $('dlg').className = 'hidden'; $('decision').classList.add('hidden'); $('tunnel').classList.remove('on'); document.body.classList.remove('deciding');
    S.letterbox(false); S.objective('');
  };
  S.guilt = function (n) { const p = S.psyche; p.guiltLevel = Math.max(0, Math.min(100, p.guiltLevel + n)); };
  S.trust = function (n) { const p = S.psyche; p.squadTrust = Math.max(0, Math.min(100, p.squadTrust + n)); };

  // ---------- timing (driven by Campaign.update, so it stops while paused) ----------
  const waits = [];
  S.wait = (sec) => new Promise((res) => waits.push({ t: sec, res }));
  S.update = function (real) {
    for (let i = waits.length - 1; i >= 0; i--) { const w = waits[i]; w.t -= real; if (w.t <= 0) { waits.splice(i, 1); w.res(); } }
    updateDialogue(real);
    updateDecision(real);
  };

  // ---------- letterbox / objective / cards ----------
  S.letterbox = (on) => document.body.classList.toggle('letterbox', !!on);
  S.objective = function (text) {
    const el = $('objective');
    el.textContent = text ? '◆ ' + text : '';
    el.classList.toggle('show', !!text);
  };
  // full-screen title card: lines typed in, held, faded
  S.card = async function (lines, hold) {
    const el = $('card'); el.innerHTML = ''; el.classList.remove('hidden', 'out');
    for (const [cls, text] of lines) {
      const d = document.createElement('div'); d.className = cls; el.appendChild(d);
      for (let i = 1; i <= text.length; i++) { d.textContent = text.slice(0, i); await S.wait(cls === 'big' ? 0.05 : 0.025); }
      await S.wait(0.35);
    }
    await S.wait(hold || 2.5);
    el.classList.add('out'); await S.wait(1.2); el.classList.add('hidden');
  };

  // ---------- dialogue & radio ----------
  // line: { who, text, radio (bool), call (callsign), dur }
  const queue = []; let cur = null;
  const GLITCH = '█▓▒░#%&@$?!/\\<>';
  S.say = function (lines) {
    return new Promise((res) => {
      lines.forEach((l, i) => queue.push(Object.assign({}, l, i === lines.length - 1 ? { done: res } : {})));
      if (!lines.length) res();
    });
  };
  S.line = (who, text, o) => S.say([Object.assign({ who, text }, o || {})]);
  S.radio = (call, text, o) => S.say([Object.assign({ who: call, text, radio: true }, o || {})]);
  function updateDialogue(real) {
    const box = $('dlg');
    if (!cur) {
      if (!queue.length) { if (box.className !== 'hidden') box.className = 'hidden'; return; }
      cur = queue.shift(); cur.t = 0; cur.typed = 0;
      cur.hold = cur.dur || Math.max(2.3, cur.text.length / 15);
      box.className = cur.radio ? 'radio' : 'voice';
      $('dlgWho').textContent = cur.radio ? `[${cur.who}]` : cur.who;
      if (cur.radio) A.squelch();
    }
    cur.t += real;
    const n = Math.min(cur.text.length, Math.floor(cur.t * 48));
    let shown = cur.text.slice(0, n);
    // radio: a few corrupted characters while it comes in, and the odd dropout afterwards
    if (cur.radio && (cur.t < 0.25 || Math.random() < 0.01)) {
      shown = shown.split('').map(c => (c !== ' ' && Math.random() < 0.25 ? GLITCH[(Math.random() * GLITCH.length) | 0] : c)).join('');
      if (Math.random() < 0.2) A.static(0.05, 0.05);
    }
    $('dlgText').textContent = shown;
    if (cur.t > cur.text.length / 48 + cur.hold) { const d = cur.done; cur = null; if (d) d(); }
  }
  S.clearDialogue = function () { queue.length = 0; if (cur && cur.done) cur.done(); cur = null; };

  // ---------- timed moral decisions ----------
  // opts: { prompt, time, options: [{ key: 'F', label, value }], timeoutValue }
  let decision = null, heartT = 0;
  S.decide = function (opts) {
    return new Promise((res) => {
      decision = Object.assign({ left: opts.time || 4, total: opts.time || 4, res }, opts);
      $('decPrompt').textContent = opts.prompt;
      $('decOpts').innerHTML = opts.options.map((o, i) =>
        `<button class="decOpt" data-i="${i}"><span class="cap">${G.touch ? 'TAP' : o.key}</span>${o.label}</button>`).join('');
      $('decision').classList.remove('hidden'); $('tunnel').classList.add('on'); document.body.classList.add('deciding');
      G.timeScale = 0.25;
      A.setMuffle(380, 0.25); A.tinnitus(true); heartT = 0;
    });
  };
  function resolve(value, timedOut) {
    const d = decision; if (!d) return;
    decision = null;
    $('decision').classList.add('hidden'); $('tunnel').classList.remove('on'); document.body.classList.remove('deciding');
    G.timeScale = 1;
    A.setMuffle(20000, 0.8); A.tinnitus(false);
    d.res({ value, timedOut });
  }
  function updateDecision(real) {
    const d = decision; if (!d) return;
    d.left -= real;
    $('decBar').style.width = Math.max(0, d.left / d.total * 100) + '%';
    $('decTime').textContent = Math.max(0, d.left).toFixed(1);
    heartT -= real;
    if (heartT <= 0) { heartT = 0.62; A.heartbeatClear(0.7); }
    if (d.left <= 0) resolve(d.timeoutValue, true);
  }
  S.deciding = () => !!decision;
  // keys are read before the game sees them (capture phase), so F / E never trigger anything else
  addEventListener('keydown', (e) => {
    if (!decision) return;
    const k = e.code.replace(/^Key/, '');
    const o = decision.options.find(x => x.key === k);
    e.preventDefault(); e.stopPropagation();
    if (o) resolve(o.value, false);
  }, true);
  $('decOpts').addEventListener('click', (e) => {
    const b = e.target.closest('.decOpt'); if (!b || !decision) return;
    resolve(decision.options[+b.dataset.i].value, false);
  });
  $('decOpts').addEventListener('pointerdown', (e) => e.stopPropagation());
})();
