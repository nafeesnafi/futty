// Procedural sound effects (Web Audio API). Nothing is loaded from disk.
(function () {
  const VG = window.VG = window.VG || {};
  const A = VG.Audio = {};
  let ctx = null, master, dry, wet, noise, muffle, listener = { x: 0, y: 0, z: 0, yaw: 0 };

  A.init = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.15;
    master = ctx.createGain(); master.gain.value = 0.7;
    muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.5;
    master.connect(muffle); muffle.connect(comp); comp.connect(ctx.destination);
    dry = ctx.createGain(); dry.connect(master);
    // short "compound" reverb from a generated impulse
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb.buffer = ir;
    wet = ctx.createGain(); wet.gain.value = 0.32; wet.connect(verb); verb.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  };

  A.setListener = function (x, y, z, yaw) { listener.x = x; listener.y = y; listener.z = z; listener.yaw = yaw; };
  A.now = () => (ctx ? ctx.currentTime : 0);

  // ---------- building blocks ----------
  function out(gain, pan, reverb) {
    // returns the node sounds connect into
    const g = ctx.createGain(); g.gain.value = gain;
    let node = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); node = p;
    }
    node.connect(dry);
    if (reverb) { const s = ctx.createGain(); s.gain.value = reverb; node.connect(s); s.connect(wet); }
    return g;
  }
  function nsrc(t, dur) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return s;
  }
  function filt(type, freq, q) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; return f; }
  function env(t, peak, attack, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }
  function noiseHit(dest, t, type, freq, q, peak, attack, decay) {
    const s = nsrc(t, attack + decay), f = filt(type, freq, q), e = env(t, peak, attack, decay);
    s.connect(f); f.connect(e); e.connect(dest);
    return f;
  }
  function tone(dest, t, wave, f0, f1, peak, attack, decay) {
    const o = ctx.createOscillator(); o.type = wave;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    const e = env(t, peak, attack, decay);
    o.connect(e); e.connect(dest); o.start(t); o.stop(t + attack + decay + 0.05);
  }

  // spatial helper: distance gain, pan and muffling for a world position
  function spatial(x, z) {
    const dx = x - listener.x, dz = z - listener.z;
    const d = Math.hypot(dx, dz);
    // listener faces -Z rotated by yaw; right vector = (cos yaw, -sin yaw)
    const rx = Math.cos(listener.yaw), rz = -Math.sin(listener.yaw);
    const pan = d > 0.5 ? (dx * rx + dz * rz) / d : 0;
    return { d, pan: pan * 0.8 };
  }

  // ---------- weapons ----------
  const SHOTS = {
    ar:     { crack: 2600, crackDec: 0.07, body: 1300, bodyDec: 0.2, thump: 140, gain: 0.9, verb: 0.5 },
    smg:    { crack: 3400, crackDec: 0.05, body: 1700, bodyDec: 0.13, thump: 170, gain: 0.75, verb: 0.4 },
    sniper: { crack: 1800, crackDec: 0.12, body: 900, bodyDec: 0.45, thump: 95, gain: 1.15, verb: 0.9 },
  };
  // own=true for the player's gun (closer, crisper); otherwise pass world pos
  A.shot = function (type, own, x, z) {
    if (!ctx) return;
    const s = SHOTS[type] || SHOTS.ar, t = ctx.currentTime;
    let gain = s.gain, pan = 0, cut = 20000, d = 0;
    if (!own) {
      const sp = spatial(x, z); d = sp.d; pan = sp.pan;
      gain *= 0.85 / (1 + d / 9); cut = Math.max(900, 14000 / (1 + d / 12));
      if (gain < 0.01) return;
    }
    const lp = filt('lowpass', cut); lp.connect(out(gain, pan, s.verb * (own ? 0.6 : 1)));
    noiseHit(lp, t, 'highpass', s.crack, 0.7, 0.9, 0.001, s.crackDec);
    noiseHit(lp, t, 'lowpass', s.body, 0.8, 1.0, 0.002, s.bodyDec);
    tone(lp, t, 'sine', s.thump * 1.6, s.thump * 0.35, own ? 1.1 : 0.7, 0.002, s.bodyDec * 0.8);
    if (own) tone(lp, t + 0.004, 'square', 5200, 3000, 0.05, 0.001, 0.012);
    if (type === 'sniper') noiseHit(lp, t + 0.03 + d / 340, 'bandpass', 500, 0.6, 0.35, 0.02, 0.9); // rolling echo
  };

  A.dryFire = function () {
    if (!ctx) return; const t = ctx.currentTime, o = out(0.5);
    noiseHit(o, t, 'bandpass', 3800, 3, 0.8, 0.001, 0.02);
    tone(o, t, 'square', 1800, 1400, 0.08, 0.001, 0.015);
  };

  function click(t, f, g) {
    const o = out(g || 0.5, 0, 0.1);
    noiseHit(o, t, 'bandpass', f, 2.5, 1, 0.001, 0.025);
    tone(o, t, 'square', f * 0.5, f * 0.4, 0.12, 0.001, 0.02);
  }
  A.magOut = function () { if (!ctx) return; const t = ctx.currentTime; click(t, 2200, 0.45); noiseHit(out(0.25), t + 0.03, 'bandpass', 900, 1, 0.6, 0.01, 0.12); };
  A.magIn = function () { if (!ctx) return; const t = ctx.currentTime; click(t, 1700, 0.6); click(t + 0.07, 2600, 0.5); };
  A.bolt = function () {
    if (!ctx) return; const t = ctx.currentTime, o = out(0.45, 0, 0.1);
    click(t, 1500, 0.5);
    const f = noiseHit(o, t + 0.05, 'bandpass', 900, 4, 0.7, 0.02, 0.14);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.2);
    click(t + 0.22, 2400, 0.6);
  };
  A.switchWpn = function () {
    if (!ctx) return; const t = ctx.currentTime;
    noiseHit(out(0.25), t, 'lowpass', 1400, 0.5, 1, 0.02, 0.12);
    click(t + 0.12, 2000, 0.35);
  };
  A.adsIn = function () { if (!ctx) return; noiseHit(out(0.12), ctx.currentTime, 'bandpass', 1600, 1, 1, 0.01, 0.07); };

  // ---------- feedback ----------
  A.hitmarker = function () {
    if (!ctx) return; const t = ctx.currentTime, o = out(0.55);
    noiseHit(o, t, 'highpass', 4500, 0.7, 1, 0.001, 0.035);
    tone(o, t, 'square', 2900, 2500, 0.15, 0.001, 0.025);
  };
  A.headshot = function () {
    if (!ctx) return; const t = ctx.currentTime, o = out(0.55, 0, 0.25);
    A.hitmarker();
    tone(o, t, 'sine', 1760, 1760, 0.5, 0.002, 0.55);
    tone(o, t, 'sine', 2637, 2637, 0.3, 0.002, 0.4);
    tone(o, t, 'triangle', 3520, 3520, 0.16, 0.002, 0.3);
  };
  A.killConfirm = function () {
    if (!ctx) return; const t = ctx.currentTime, o = out(0.4, 0, 0.2);
    tone(o, t + 0.03, 'sine', 980, 700, 0.5, 0.003, 0.18);
    noiseHit(o, t + 0.03, 'lowpass', 600, 0.5, 0.6, 0.002, 0.09);
  };
  A.hurt = function () {
    if (!ctx) return; const t = ctx.currentTime, o = out(0.5);
    noiseHit(o, t, 'lowpass', 500, 1, 1, 0.002, 0.15);
    tone(o, t, 'sine', 120, 50, 0.8, 0.002, 0.18);
  };
  A.heartbeat = function (vol) {
    if (!ctx) return; const t = ctx.currentTime, o = out(vol);
    tone(o, t, 'sine', 62, 42, 1, 0.01, 0.13);
    tone(o, t + 0.2, 'sine', 55, 38, 0.7, 0.01, 0.16);
  };
  A.footstep = function (sprint, x, z, own) {
    if (!ctx) return; const t = ctx.currentTime;
    let gain = sprint ? 0.32 : 0.2, pan = 0;
    if (!own) { const sp = spatial(x, z); if (sp.d > 18) return; gain *= 1.3 / (1 + sp.d / 3); pan = sp.pan; }
    const o = out(gain, pan);
    noiseHit(o, t, 'bandpass', (sprint ? 700 : 500) * (0.8 + Math.random() * 0.4), 1.2, 1, 0.004, 0.07);
    tone(o, t, 'sine', 95, 60, 0.35, 0.003, 0.06);
  };
  A.land = function (hard) {
    if (!ctx) return; const t = ctx.currentTime, o = out(hard ? 0.5 : 0.3);
    noiseHit(o, t, 'lowpass', 700, 0.8, 1, 0.003, 0.12);
    tone(o, t, 'sine', 110, 45, 0.7, 0.003, 0.12);
  };
  A.slide = function () {
    if (!ctx) return; const t = ctx.currentTime, o = out(0.3);
    const f = noiseHit(o, t, 'bandpass', 1400, 0.8, 0.9, 0.03, 0.6);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.6);
  };
  A.brass = function (x, z) { // casing hitting the floor: two bright metallic tinks
    if (!ctx) return; const sp = spatial(x, z); if (sp.d > 12) return;
    const t = ctx.currentTime, o = out(0.05 / (1 + sp.d / 3), sp.pan), f = 3800 + Math.random() * 1600;
    tone(o, t, 'triangle', f, f * 0.97, 0.6, 0.001, 0.07); tone(o, t + 0.06 + Math.random() * 0.04, 'triangle', f * 1.1, f, 0.35, 0.001, 0.05);
  };
  A.ladder = function () { if (!ctx) return; click(ctx.currentTime, 900, 0.25); };
  A.impact = function (mat, x, z) {
    if (!ctx) return; const sp = spatial(x, z); if (sp.d > 30) return;
    const t = ctx.currentTime, o = out(0.18 / (1 + sp.d / 4), sp.pan);
    if (mat === 'metal') tone(o, t, 'triangle', 2400 + Math.random() * 1500, 1800, 0.5, 0.001, 0.12);
    noiseHit(o, t, 'bandpass', mat === 'wood' ? 900 : 2200, 1.2, 1, 0.001, 0.04);
  };
  A.whiz = function (pan) {
    if (!ctx) return; const t = ctx.currentTime, o = out(0.22, pan);
    const f = noiseHit(o, t, 'bandpass', 5000, 6, 1, 0.01, 0.12);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.13);
  };
  A.ui = function () { if (!ctx) return; tone(out(0.2), ctx.currentTime, 'square', 1200, 1500, 0.1, 0.002, 0.05); };

  // ---------- killstreaks ----------
  A.radio = function () {
    if (!ctx) return; const t = ctx.currentTime, o = out(0.3);
    tone(o, t, 'sine', 1400, 2200, 0.25, 0.005, 0.08);
    tone(o, t + 0.1, 'sine', 2200, 1400, 0.25, 0.005, 0.08);
    noiseHit(o, t, 'bandpass', 2500, 1, 0.15, 0.01, 0.25);
  };
  A.jet = function () {
    if (!ctx) return; const t = ctx.currentTime;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    const f = filt('bandpass', 400, 0.7);
    f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(300, t + 3);
    const s = nsrc(t, 3.3); s.connect(f); f.connect(g);
    if (p) { p.pan.setValueAtTime(-1, t); p.pan.linearRampToValueAtTime(1, t + 3); g.connect(p); p.connect(dry); } else g.connect(dry);
  };
  A.explosion = function (x, z) {
    if (!ctx) return; const sp = spatial(x, z), t = ctx.currentTime;
    const o = out(1.3 / (1 + sp.d / 25), sp.pan, 0.8);
    const f = noiseHit(o, t, 'lowpass', 3000, 0.7, 1, 0.005, 1.8);
    f.frequency.exponentialRampToValueAtTime(160, t + 1.6);
    tone(o, t, 'sine', 70, 28, 1.2, 0.005, 1.4);
    noiseHit(o, t, 'highpass', 1500, 0.5, 0.6, 0.001, 0.1);
  };

  // ---------- announcer (speech synthesis, falls back to silence) ----------
  let voice = null;
  function pickVoice() {
    if (!window.speechSynthesis) return;
    const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
    voice = vs.find(v => /male|daniel|george|david|alex|fred/i.test(v.name)) || vs[0] || null;
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  A.announce = function (text) {
    A.radio();
    if (!window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.rate = 1.05; u.pitch = 0.55; u.volume = 0.9;
      setTimeout(() => speechSynthesis.speak(u), 160);
    } catch (_) { /* speech is optional */ }
  };

  // =====================================================================
  // Campaign sound design: score, weather, radio, breathing, trauma layers
  // =====================================================================
  A.ctx = () => ctx;
  // everything (except sounds routed around it) goes through this low-pass: used for time dilation / underwater
  A.setMuffle = function (freq, time) {
    if (!ctx) return;
    const t = ctx.currentTime;
    muffle.frequency.cancelScheduledValues(t);
    muffle.frequency.setValueAtTime(muffle.frequency.value, t);
    muffle.frequency.exponentialRampToValueAtTime(Math.max(80, freq), t + (time || 0.3));
  };
  // a bus that bypasses the muffle (heartbeat / tinnitus stay sharp while the world goes dull)
  function clearOut(gain) {
    const g = ctx.createGain(); g.gain.value = gain;
    const comp = ctx.destination;
    g.connect(comp);
    return g;
  }

  let amb = null;
  A.startAmbience = function (o) {
    if (!ctx) return;
    A.stopAmbience();
    const t = ctx.currentTime, nodes = [];
    const bus = ctx.createGain(); bus.gain.setValueAtTime(0.0001, t); bus.gain.exponentialRampToValueAtTime(1, t + 3); bus.connect(dry);
    const loopNoise = () => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, Math.random()); nodes.push(s); return s; };
    if (o.rain) { // rain: hiss + patter (on helmets / roofs)
      const s = loopNoise(), hp = filt('highpass', 1800), lp = filt('lowpass', 9000), g = ctx.createGain();
      g.gain.value = 0.11 * o.rain; s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(bus);
      const s2 = loopNoise(), bp = filt('bandpass', 700, 0.6), g2 = ctx.createGain(); g2.gain.value = 0.05 * o.rain;
      s2.connect(bp); bp.connect(g2); g2.connect(bus);
    }
    if (o.drip) { // tunnels: water noise, low and wide
      const s = loopNoise(), lp = filt('lowpass', 500), g = ctx.createGain(); g.gain.value = 0.08;
      s.connect(lp); lp.connect(g); g.connect(bus);
    }
    if (o.drone) { // score: low detuned drone with a slow breathing filter
      const lp = filt('lowpass', 320, 0.8), g = ctx.createGain(); g.gain.value = 0.055;
      for (const f of [o.root || 73.4, (o.root || 73.4) * 1.006, (o.root || 73.4) * 1.5]) {
        const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f; osc.connect(lp); osc.start(t); nodes.push(osc);
      }
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.05; lg.gain.value = 160;
      lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t); nodes.push(lfo);
      lp.connect(g); g.connect(bus); const send = ctx.createGain(); send.gain.value = 0.6; g.connect(send); send.connect(wet);
    }
    amb = { nodes, bus, celloT: 4, o };
  };
  A.stopAmbience = function () {
    if (!amb || !ctx) { amb = null; return; }
    const t = ctx.currentTime, a2 = amb;
    a2.bus.gain.cancelScheduledValues(t); a2.bus.gain.setValueAtTime(a2.bus.gain.value, t); a2.bus.gain.linearRampToValueAtTime(0, t + 1.5);
    setTimeout(() => { for (const n of a2.nodes) { try { n.stop(); } catch (_) { /* already stopped */ } } a2.bus.disconnect(); }, 1700);
    amb = null;
  };
  // slow, sparse cello-like phrases over the drone (called every frame with dt)
  const CELLO = [146.8, 174.6, 130.8, 116.5, 110, 98, 146.8, 138.6];
  let celloIdx = 0;
  A.scoreTick = function (dt, mood) {
    if (!ctx || !amb || !amb.o.drone) return;
    amb.celloT -= dt;
    if (amb.celloT > 0) return;
    amb.celloT = 9 + Math.random() * 8;
    const f = CELLO[celloIdx++ % CELLO.length] * (mood === 'low' ? 0.5 : 1);
    cello(f, 5 + Math.random() * 2);
  };
  function cello(f, dur) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.2; vg.gain.value = f * 0.006; vib.connect(vg); vg.connect(o.frequency);
    const body = filt('lowpass', 900, 1.2), form = filt('peaking', 280, 1); form.gain.value = 6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(body); body.connect(form); form.connect(g); g.connect(dry);
    const s = ctx.createGain(); s.gain.value = 0.9; g.connect(s); s.connect(wet);
    o.start(t); vib.start(t); o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
  }
  A.cello = function (f, dur) { if (ctx) cello(f, dur || 6); };

  A.thunder = function (near) {
    if (!ctx) return; const t = ctx.currentTime + (near ? 0.05 : 0.6 + Math.random() * 1.5);
    const o = out(near ? 0.9 : 0.5, (Math.random() - 0.5) * 0.6, 0.9);
    const f = noiseHit(o, t, 'lowpass', near ? 1400 : 500, 0.7, 1, 0.02, 3.5);
    f.frequency.exponentialRampToValueAtTime(90, t + 3);
    tone(o, t, 'sine', 55, 30, 0.8, 0.05, 2.5);
    if (near) noiseHit(o, t, 'highpass', 2500, 0.5, 0.7, 0.001, 0.15);
  };
  A.static = function (dur, vol) {
    if (!ctx) return; const t = ctx.currentTime; dur = dur || 0.25;
    const o = out(vol || 0.16);
    const f = noiseHit(o, t, 'bandpass', 2400, 0.8, 1, 0.005, dur);
    const am = ctx.createOscillator(), ag = ctx.createGain(); am.type = 'square'; am.frequency.value = 23 + Math.random() * 30; ag.gain.value = 0.5;
    am.connect(ag); ag.connect(f.frequency); am.start(t); am.stop(t + dur + 0.05);
  };
  A.squelch = function () { if (!ctx) return; A.static(0.12, 0.12); tone(out(0.08), ctx.currentTime + 0.1, 'sine', 1900, 1900, 0.4, 0.002, 0.05); };
  A.breath = function (fast, vol) {
    if (!ctx) return; const t = ctx.currentTime, v = vol || 0.12, d = fast ? 0.22 : 0.45;
    const o = clearOut(v);
    const f1 = noiseHit(o, t, 'bandpass', 900, 1.4, 1, d * 0.5, d * 0.6); f1.frequency.linearRampToValueAtTime(1300, t + d);
    const f2 = noiseHit(o, t + d * 1.2, 'bandpass', 650, 1.2, 0.8, d * 0.3, d * 0.9); f2.frequency.linearRampToValueAtTime(450, t + d * 2.2);
  };
  let tinn = null;
  A.tinnitus = function (on) {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (on && !tinn) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(7400, t); o.frequency.exponentialRampToValueAtTime(5600, t + 6);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.6);
      o.connect(g); g.connect(clearOut(1)); o.start(t);
      tinn = { o, g };
    } else if (!on && tinn) {
      const k = tinn; tinn = null;
      k.g.gain.cancelScheduledValues(t); k.g.gain.setValueAtTime(k.g.gain.value, t); k.g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      k.o.stop(t + 1.3);
    }
  };
  A.heartbeatClear = function (vol) {
    if (!ctx) return; const t = ctx.currentTime, o = clearOut(vol || 0.6);
    tone(o, t, 'sine', 62, 42, 1, 0.01, 0.15);
    tone(o, t + 0.22, 'sine', 55, 38, 0.75, 0.01, 0.18);
  };
  // indistinct murmur: band-passed noise chopped into syllables, drifting in from one side
  A.whisper = function (vol) {
    if (!ctx) return; const t = ctx.currentTime, dur = 1.2 + Math.random() * 1.4;
    const o = out(vol || 0.1, (Math.random() - 0.5) * 1.8, 0.9);
    const s = nsrc(t, dur), bp = filt('bandpass', 1100 + Math.random() * 700, 3), g = ctx.createGain();
    g.gain.value = 0;
    for (let k = 0; k < dur * 6; k++) { const tt = t + k / 6 + Math.random() * 0.05; g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.6 + Math.random() * 0.4, tt + 0.04); g.gain.linearRampToValueAtTime(0, tt + 0.12); }
    s.connect(bp); bp.connect(g); g.connect(o);
  };
  // distant, muffled cries through a radio: pitch-gliding voices buried under static (never clear)
  A.cries = function (dur, vol) {
    if (!ctx) return; const t = ctx.currentTime; dur = dur || 4;
    const o = out(vol || 0.1, 0, 0.6), lp = filt('lowpass', 1300), bp = filt('bandpass', 900, 1.5);
    lp.connect(bp); bp.connect(o);
    for (let i = 0; i < 4; i++) {
      const v = ctx.createOscillator(); v.type = 'sawtooth';
      const st = t + Math.random() * dur * 0.6, len = 0.6 + Math.random() * 1.4, f0 = 320 + Math.random() * 260;
      v.frequency.setValueAtTime(f0, st); v.frequency.linearRampToValueAtTime(f0 * (1.2 + Math.random() * 0.3), st + len * 0.3); v.frequency.linearRampToValueAtTime(f0 * 0.7, st + len);
      const g = env(st, 0.25, 0.08, len); v.connect(g); g.connect(lp); v.start(st); v.stop(st + len + 0.1);
    }
    A.static(dur, (vol || 0.1) * 0.9);
  };
  // a baby crying behind a door: soft, distant, filtered
  A.infant = function (dur, vol) {
    if (!ctx) return; const t = ctx.currentTime; dur = dur || 3;
    const o = out(vol || 0.05, 0.3, 0.7), bp = filt('bandpass', 1300, 2), lp = filt('lowpass', 2200);
    bp.connect(lp); lp.connect(o);
    for (let st = t; st < t + dur; st += 0.9 + Math.random() * 0.5) {
      const v = ctx.createOscillator(); v.type = 'sawtooth'; const len = 0.6 + Math.random() * 0.3;
      v.frequency.setValueAtTime(430, st); v.frequency.linearRampToValueAtTime(540, st + len * 0.3); v.frequency.linearRampToValueAtTime(380, st + len);
      const g = env(st, 0.4, 0.06, len); v.connect(g); g.connect(bp); v.start(st); v.stop(st + len + 0.1);
    }
  };
  A.whistle = function () { // incoming shell
    if (!ctx) return; const t = ctx.currentTime;
    tone(out(0.18, 0, 0.4), t, 'sine', 1900, 420, 0.5, 0.2, 1.3);
  };
  A.waterRush = function (dur) {
    if (!ctx) return; const t = ctx.currentTime; dur = dur || 6;
    const o = out(0.9, 0, 0.5), s = nsrc(t, dur), lp = filt('lowpass', 300), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.frequency.exponentialRampToValueAtTime(1800, t + dur * 0.6);
    s.connect(lp); lp.connect(g); g.connect(o);
  };
  A.splash = function () { if (!ctx) return; noiseHit(out(0.12), ctx.currentTime, 'bandpass', 1200 + Math.random() * 600, 0.8, 1, 0.01, 0.18); };
  A.speakWhisper = function (text, vol) {
    if (!window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.rate = 0.72; u.pitch = 0.35; u.volume = vol || 0.28;
      speechSynthesis.speak(u);
    } catch (_) { /* optional */ }
  };
})();
