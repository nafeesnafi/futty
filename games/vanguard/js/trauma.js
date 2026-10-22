// Shell shock: guilt slowly drains colour from the world, makes recoil heavier and breathing ragged,
// lets fragments of what happened bleed into the soundscape, and makes your hands shake when you aim
// at people who are not fighting. Also owns night vision (green phosphor) for the campaign.
(function () {
  const VG = window.VG, G = VG.Game, A = VG.Audio;
  const $ = (id) => document.getElementById(id);
  const T = VG.Trauma = { nv: false, memories: [] };
  let lastFilter = '', breathT = 0, halT = 30, flick = 0;

  T.reset = function () {
    T.nv = false; halT = 30; flick = 0;
    $('view').style.filter = ''; lastFilter = '';
    $('nvOverlay').classList.remove('on');
    document.body.classList.remove('nv');
  };
  T.remember = function (text) { if (text && !T.memories.includes(text)) T.memories.push(text); };
  T.setNV = function (on) {
    T.nv = on;
    $('nvOverlay').classList.toggle('on', on);
    document.body.classList.toggle('nv', on);
    A.static(0.12, 0.08);
  };
  T.flicker = function (sec) { flick = Math.max(flick, sec); };

  T.update = function (dt, real) {
    const S = VG.Story, p = G.player;
    if (!S || !S.psyche || !p) return;
    const g = S.psyche.guiltLevel / 100;

    // ---- colour: saturation drains into ash and cold sepia ----
    // (the filter string only changes in 2% steps, so the browser isn't re-rasterising a new filter every frame)
    const gq = Math.round(g * 50) / 50;
    // night vision is done with lighting (campaign.js); this filter only drains colour, and only on Medium/High graphics
    let f;
    if (+G.settings.gfx === 0) f = '';
    else f = gq ? `saturate(${(1 - gq * 0.85).toFixed(2)}) sepia(${(gq * 0.5).toFixed(2)}) contrast(${(1 + gq * 0.12).toFixed(2)}) brightness(${(1 - gq * 0.12).toFixed(2)})` : '';
    if (flick > 0) { flick -= real; f += ` brightness(${flick % 0.2 > 0.1 ? 0.55 : 1.1})`; }
    if (f !== lastFilter) { $('view').style.filter = f; lastFilter = f; }

    // ---- heavier recoil ----
    G.recoilMul = 1 + g * 0.7;

    // ---- shaking hands: aiming at civilians or the surrendering, and a constant tremor once guilt runs deep ----
    const t = G.aimTarget;
    let tremor = g > 0.45 ? (g - 0.45) * 0.6 : 0;
    if (t && (t.civ || t.surrender) && t.alive) tremor = 0.45 + g * 1.5;
    p.tremor = (p.tremor || 0) + (tremor - (p.tremor || 0)) * Math.min(1, real * 3);

    // ---- breathing: erratic during firefights ----
    const fighting = G.now - (p.lastShot || -9) < 3 || G.now - (p.lastHit || -9) < 4;
    if (p.alive && fighting && g > 0.2) {
      breathT -= real;
      if (breathT <= 0) { breathT = Math.max(0.55, 1.5 - g * 1.1) * (0.8 + Math.random() * 0.4); A.breath(g > 0.5, 0.06 + g * 0.08); }
    }

    // ---- auditory hallucinations ----
    halT -= real;
    if (halT <= 0) {
      halT = (18 + Math.random() * 30) * (1.25 - g);
      if (g > 0.12 && !S.deciding()) {
        const r = Math.random();
        if (r < 0.35) A.whisper(0.05 + g * 0.08);
        else if (r < 0.6 && T.memories.length && g > 0.3) A.speakWhisper(T.memories[(Math.random() * T.memories.length) | 0], 0.12 + g * 0.15);
        else if (r < 0.8 && S.psyche.civilianCasualties > 0) A.cries(2.5, 0.025 + g * 0.03);
        else A.static(0.4, 0.05);
      }
    }
  };
})();
