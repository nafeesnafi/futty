// Stadium sound: crowd bed, whistle, kicks, goal roar. All synthesised with WebAudio (no files).
var FC = window.FC = window.FC || {};

(() => {
  let ctx = null, master = null, crowdGain = null, noiseBuf = null, muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    // 2s of pink-ish noise reused by every crowd/kick sound
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 6; }
    // crowd bed: filtered noise, gently swelling
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
    crowdGain = ctx.createGain(); crowdGain.gain.value = 0.08;
    src.connect(bp).connect(crowdGain).connect(master); src.start();
    return ctx;
  }

  function noiseBurst(dur, freq, vol, type = 'lowpass') {
    if (!ensure()) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(), t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur);
  }
  function tone(freq, dur, vol, type = 'sine', slide) {
    if (!ensure()) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur);
  }

  FC.Audio = {
    unlock: ensure,
    get muted() { return muted; },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.8; return muted; },
    whistle(long) {
      if (!ensure()) return;
      const blow = (at, dur) => {
        const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
        o.frequency.value = 2600; lfo.frequency.value = 38; lg.gain.value = 120;
        lfo.connect(lg).connect(o.frequency);
        const t = ctx.currentTime + at;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.02); g.gain.setValueAtTime(0.09, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(g).connect(master); o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
      };
      if (long === 'full') { blow(0, 0.35); blow(0.45, 0.35); blow(0.9, 0.9); }
      else if (long) { blow(0, 0.25); blow(0.35, 0.6); }
      else blow(0, 0.22);
    },
    kick(power = 0.5) { noiseBurst(0.08, 900, 0.25 + power * 0.4); tone(110 + power * 60, 0.09, 0.25 + power * 0.2, 'sine', 0.5); },
    post() { tone(880, 0.5, 0.15, 'triangle', 0.98); tone(1320, 0.35, 0.08, 'triangle'); },
    save() { noiseBurst(0.15, 1500, 0.3); this.swell(0.22, 1.2); },
    tackle() { noiseBurst(0.12, 400, 0.35); },
    swell(level, dur) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      crowdGain.gain.cancelScheduledValues(t);
      crowdGain.gain.setValueAtTime(crowdGain.gain.value, t);
      crowdGain.gain.linearRampToValueAtTime(level, t + 0.3);
      crowdGain.gain.linearRampToValueAtTime(0.08, t + dur);
    },
    goal() { this.swell(0.45, 5); noiseBurst(1.5, 2500, 0.25, 'bandpass'); },
    oooh() { this.swell(0.25, 2); },
    stopCrowd() { if (crowdGain && ctx) crowdGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); },
    startCrowd() { if (ensure()) crowdGain.gain.setTargetAtTime(0.08, ctx.currentTime, 0.5); },
  };
})();
