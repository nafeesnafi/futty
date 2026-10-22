// Stadium sound, all synthesised with WebAudio (no files):
// - ball strikes: low-end thud + contact click, heavier for power shots
// - woodwork: inharmonic metallic clang; net: soft swish
// - crowd: two filtered-noise layers whose level and brightness follow how dangerous play is,
//   plus gasps (near misses, woodwork), roars, clapping and a chant after goals
// - referee: two-tone pea whistle with a rising pitch envelope and rattle
var FC = window.FC = window.FC || {};

(() => {
  let ctx = null, master = null, noiseBuf = null, muted = false;
  let murmur = null, chatter = null, crowdOn = false, excite = 0;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {}); return ctx; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();   // keeps roars and strikes from clipping
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    // 2 s of pink-ish noise reused by every crowd/impact sound
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 6; }
    murmur = crowdLayer(380, 0.7);
    chatter = crowdLayer(1400, 0.9);
    return ctx;
  }

  // one looping crowd layer: noise -> bandpass -> gain
  function crowdLayer(freq, q) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(master); src.start(0, Math.random() * 2);
    return { f, g, base: freq };
  }

  function noise(dur, freq, vol, type = 'lowpass', at = 0, q = 1) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(), t = ctx.currentTime + at;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    return f;
  }
  function tone(freq, dur, vol, type = 'sine', slideTo, at = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  // crowd "ooh"/gasp: noise through a formant that rises then falls
  function gasp(vol = 0.35, dur = 1.1) {
    const f = noise(dur, 500, vol, 'bandpass', 0, 2.5), t = ctx.currentTime;
    f.frequency.setValueAtTime(450, t); f.frequency.linearRampToValueAtTime(900, t + dur * 0.25); f.frequency.linearRampToValueAtTime(380, t + dur);
  }

  // short burst of crowd excitement on top of the bed
  function swell(level, dur) {
    for (const L of [murmur, chatter]) {
      const g = L.g.gain, t = ctx.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(level * (L === chatter ? 1 : 0.8), t + 0.25);
      g.linearRampToValueAtTime(bedLevel() * (L === chatter ? 0.6 : 1), t + dur);
    }
  }
  const bedLevel = () => crowdOn ? 0.06 + excite * 0.16 : 0.0001;

  // goal: roar, then rhythmic clapping and a chanted four-note tune from many detuned voices
  function chant(start) {
    const notes = [392, 392, 440, 392, 523, 494];     // simple terrace melody
    const beat = 0.32;
    notes.forEach((n, i) => {
      const at = start + i * beat * (i === 5 ? 1.5 : 1), len = beat * (i === 5 ? 2.2 : 0.9);
      for (let v = 0; v < 6; v++) {   // a crowd of voices, slightly out of tune
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime + at;
        o.type = 'sawtooth'; o.frequency.value = n * (1 + (Math.random() - 0.5) * 0.03) / (v % 2 ? 2 : 1);
        f.type = 'bandpass'; f.frequency.value = 700 + v * 90; f.Q.value = 3;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.05); g.gain.setValueAtTime(0.025, t + len - 0.08); g.gain.linearRampToValueAtTime(0, t + len);
        o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + len + 0.05);
      }
    });
    for (let i = 0; i < 12; i++) noise(0.06, 2500, 0.18, 'bandpass', start + 2.6 + i * 0.32, 1.2);   // clap clap clap
  }

  FC.Audio = {
    unlock: ensure,
    get muted() { return muted; },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.8; return muted; },

    // two-tone pea whistle: pitch sweeps up into the note, a fast rattle, a slight fall at the end
    whistle(kind) {
      if (!ensure()) return;
      const blow = (at, dur) => {
        const t = ctx.currentTime + at;
        const g = ctx.createGain(), rattle = ctx.createOscillator(), rg = ctx.createGain();
        rattle.frequency.value = 34; rg.gain.value = 0.35;   // the pea rattling inside
        const am = ctx.createGain(); am.gain.value = 0.65;
        rattle.connect(rg).connect(am.gain);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.025);
        g.gain.setValueAtTime(0.08, t + dur - 0.06); g.gain.linearRampToValueAtTime(0, t + dur);
        for (const [f0, f1] of [[2350, 2750], [2950, 3420]]) {   // two tones a little apart
          const o = ctx.createOscillator(); o.type = 'sine';
          o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.04);
          o.frequency.setValueAtTime(f1, t + dur - 0.08); o.frequency.exponentialRampToValueAtTime(f1 * 0.94, t + dur);
          o.connect(am); o.start(t); o.stop(t + dur + 0.02);
        }
        am.connect(g).connect(master);
        rattle.start(t); rattle.stop(t + dur + 0.02);
        noise(dur, 6000, 0.03, 'highpass', at);    // breath
      };
      if (kind === 'full') { blow(0, 0.3); blow(0.42, 0.3); blow(0.85, 0.95); }
      else if (kind) { blow(0, 0.22); blow(0.32, 0.55); }
      else blow(0, 0.2);
    },

    // ball strike: sub thud (pitch drops fast) + contact click; power adds weight
    kick(power = 0.5) {
      if (!ensure()) return;
      tone(95 + power * 40, 0.12 + power * 0.08, 0.8 + power * 0.8, 'sine', 45);
      noise(0.025, 3500, 0.3 + power * 0.6, 'lowpass');
      if (power > 0.6) tone(170, 0.07, 0.45 * power, 'triangle', 90);
    },
    // woodwork: inharmonic partials with different decays, plus a rattle
    post() {
      if (!ensure()) return;
      [[523, 1.1, 0.12], [1311, 0.8, 0.08], [2093, 0.6, 0.06], [3170, 0.4, 0.04], [4410, 0.25, 0.03]]
        .forEach(([f, d, v]) => tone(f * (0.99 + Math.random() * 0.02), d, v, 'triangle'));
      noise(0.08, 4000, 0.25, 'highpass');
      gasp(0.4, 1.3);
    },
    // soft net swish as the ball hits the back of the net
    net() {
      if (!ensure()) return;
      const f = noise(0.45, 4000, 0.9, 'bandpass', 0, 1.5), t = ctx.currentTime;
      f.frequency.setValueAtTime(4500, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.45);
    },
    save() { if (!ensure()) return; noise(0.12, 1500, 0.3); gasp(0.25, 0.9); swell(0.24, 1.5); },
    nearMiss() { if (ensure()) gasp(0.38, 1.2); },
    tackle() { if (ensure()) noise(0.12, 400, 0.35); },
    goal() {
      if (!ensure()) return;
      this.net();
      swell(0.5, 7);
      noise(2.2, 1800, 0.3, 'bandpass', 0.05, 0.6);   // roar
      chant(1.4);
    },
    oooh() { if (ensure()) gasp(0.3, 1.0); },
    cheer() { if (!ensure()) return; swell(0.4, 2.5); noise(1.2, 1600, 0.2, 'bandpass', 0.05, 0.7); },

    // called every frame with how dangerous play is (0..1); the crowd bed follows it
    update(dt, danger) {
      if (!ctx || !murmur) return;
      excite += ((crowdOn ? danger : 0) - excite) * Math.min(1, dt * 1.5);
      const t = ctx.currentTime;
      murmur.g.gain.setTargetAtTime(bedLevel(), t, 0.4);
      chatter.g.gain.setTargetAtTime(bedLevel() * 0.6, t, 0.4);
      chatter.f.frequency.setTargetAtTime(chatter.base * (1 + excite * 0.6), t, 0.5);
    },
    stopCrowd() { crowdOn = false; if (ctx && murmur) { murmur.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); chatter.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); } },
    startCrowd() { if (ensure()) crowdOn = true; },
  };
})();
