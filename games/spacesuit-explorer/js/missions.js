// Mission card art and the six playable mission scenes.
(function () {
  const SSE = window.SSE = window.SSE || {};

  const STARS = '<g fill="#fff">' + [[20, 20], [60, 50], [110, 14], [150, 40], [210, 22], [260, 56], [300, 18], [40, 90], [280, 96], [180, 70], [90, 120], [240, 130]]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1 : 1.6}" opacity="${0.5 + (i % 4) / 8}"/>`).join('') + '</g>';

  const MINI = (x, y, s, visor) => `<g transform="translate(${x} ${y}) scale(${s || 1})"><rect x="-9" y="-2" width="18" height="22" rx="6" fill="#f4f6fb" stroke="#a7b1c4"/><circle cx="0" cy="-8" r="10" fill="#f4f6fb" stroke="#a7b1c4"/><path d="M-7 -10 Q0 -17 7 -10 Q0 -5 -7 -10Z" fill="${visor || '#f2b632'}"/></g>`;

  SSE.missionArt = function (id) {
    const art = {
      spacewalk: `<rect width="320" height="150" fill="#0b1240"/>${STARS}<circle cx="160" cy="420" r="300" fill="#2f6fd6"/><circle cx="160" cy="420" r="300" fill="none" stroke="#7fd3ff" stroke-width="6" opacity=".4"/>
        <rect x="40" y="62" width="240" height="12" fill="#9aa6c0"/><g fill="#3155b8" stroke="#7fa2ff"><rect x="60" y="20" width="40" height="40"/><rect x="60" y="78" width="40" height="40"/><rect x="220" y="20" width="40" height="40"/><rect x="220" y="78" width="40" height="40"/></g>
        <rect x="140" y="52" width="40" height="32" rx="6" fill="#e9edf5"/>${MINI(200, 100, 1.2)}<path d="M180 68 Q196 76 198 92" stroke="#ffcc4d" stroke-width="2" fill="none"/>`,
      lunar: `<rect width="320" height="150" fill="#05071a"/>${STARS}<circle cx="270" cy="34" r="16" fill="#2f6fd6"/><path d="M0 104 Q80 88 160 100 T320 96 V150 H0Z" fill="#a8b0bf"/>
        <g fill="#8a92a3"><ellipse cx="70" cy="122" rx="22" ry="6"/><ellipse cx="230" cy="130" rx="30" ry="7"/></g><g fill="#6d7486"><circle cx="190" cy="110" r="5"/><circle cx="120" cy="134" r="4"/></g>
        <path d="M40 104 V60" stroke="#ddd" stroke-width="2"/><rect x="40" y="60" width="26" height="16" fill="#e2593b"/>${MINI(150, 86, 1.2)}`,
      launch: `<rect width="320" height="150" fill="#1a2a6c"/><rect y="110" width="320" height="40" fill="#3a3f4b"/>${STARS}
        <path d="M160 18 Q176 36 176 60 V110 H144 V60 Q144 36 160 18Z" fill="#f4f6fb"/><path d="M160 18 Q170 28 172 40 H148 Q150 28 160 18Z" fill="#ff7a1a"/>
        <path d="M144 96 L130 112 H144Z M176 96 L190 112 H176Z" fill="#d8343a"/><path d="M148 112 Q160 146 172 112" fill="#ffcc4d"/><path d="M152 112 Q160 134 168 112" fill="#ff7a1a"/>
        <g fill="#ccd" opacity=".5"><circle cx="120" cy="124" r="14"/><circle cx="200" cy="126" r="16"/><circle cx="104" cy="134" r="10"/></g>`,
      orbit: `<rect width="320" height="150" fill="#dfe7f5"/><rect x="0" y="0" width="320" height="22" fill="#b9c6dd"/><rect x="0" y="128" width="320" height="22" fill="#b9c6dd"/>
        <g fill="#9fb0cc"><rect x="20" y="30" width="60" height="44" rx="4"/><rect x="240" y="30" width="60" height="44" rx="4"/></g><rect x="252" y="40" width="36" height="24" rx="3" fill="#2fd3c4"/>
        <rect x="34" y="84" width="34" height="34" rx="4" fill="#8a5a33"/><path d="M51 84 V60 M51 70 Q40 62 36 70 M51 66 Q62 58 66 66" stroke="#41d07a" stroke-width="4" fill="none"/>
        <g transform="translate(160 76) rotate(-18)"><circle r="14" fill="#f2c9a0"/><rect x="-14" y="12" width="28" height="30" rx="8" fill="#5b3fd1"/><path d="M-14 20 L-30 8 M14 20 L30 6" stroke="#5b3fd1" stroke-width="8" stroke-linecap="round"/></g>
        <g fill="#7c5cff"><circle cx="210" cy="104" r="5"/><circle cx="120" cy="40" r="4"/></g>`,
      mars: `<rect width="320" height="150" fill="#e8a27a"/><circle cx="60" cy="36" r="12" fill="#fff4d6" opacity=".8"/><path d="M0 98 Q90 80 170 96 T320 90 V150 H0Z" fill="#c2552f"/>
        <path d="M200 92 L240 56 L280 92Z" fill="#a8432a"/><g fill="#8f3a22"><circle cx="90" cy="120" r="6"/><circle cx="250" cy="126" r="5"/></g>
        <rect x="190" y="104" width="60" height="18" rx="5" fill="#f3e7dc"/><g fill="#3a3f4b"><circle cx="200" cy="124" r="6"/><circle cx="240" cy="124" r="6"/></g>${MINI(130, 96, 1.2, '#d9482b')}`,
      emergency: `<rect width="320" height="150" fill="#14193d"/><rect x="24" y="22" width="272" height="106" rx="12" fill="#1f2757" stroke="#3a4690"/>
        <g font-family="system-ui,sans-serif" font-size="11" font-weight="700"><rect x="40" y="36" width="110" height="34" rx="6" fill="#2a3470"/><text x="50" y="57" fill="#41d07a">O₂  OK</text>
        <rect x="170" y="36" width="110" height="34" rx="6" fill="#5a3d0a" stroke="#ffcc4d"/><text x="180" y="57" fill="#ffcc4d">⚠ CHECK</text>
        <rect x="40" y="80" width="110" height="34" rx="6" fill="#2a3470"/><text x="50" y="101" fill="#41d07a">RADIO OK</text>
        <rect x="170" y="80" width="110" height="34" rx="6" fill="#2a3470"/><text x="180" y="101" fill="#41d07a">TEMP OK</text></g>`
    };
    return `<svg viewBox="0 0 320 150" aria-hidden="true">${art[id]}</svg>`;
  };

  // ---------- Shared scene frame ----------
  function frame(root, ctx, steps) {
    root.innerHTML = `<div class="scene">
      <div class="scene-stage" id="sceneStage"></div>
      <div class="scene-side">
        <h4>Mission steps</h4>
        <ol class="msteps" id="msteps"></ol>
        <div class="scene-msg" id="sceneMsg" aria-live="polite"></div>
        <div class="scene-actions" id="sceneActions"></div>
      </div></div>`;
    const el = (id) => root.querySelector('#' + id);
    const f = {
      stage: el('sceneStage'),
      step(idx) {
        f.idx = idx;
        el('msteps').innerHTML = steps.map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}">${i < idx ? '✅' : i === idx ? '👉' : '⬜'} ${s}</li>`).join('');
      },
      msg(html, tone) { const m = el('sceneMsg'); m.className = 'scene-msg' + (tone ? ' ' + tone : ''); m.innerHTML = html; },
      // actions: [{ label, cls, on }]
      actions(list) {
        const box = el('sceneActions');
        box.innerHTML = '';
        list.forEach((a) => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'btn ' + (a.cls || ''); b.innerHTML = a.label;
          if (a.disabled) b.disabled = true;
          b.addEventListener('click', a.on);
          box.appendChild(b);
        });
        const first = box.querySelector('button:not([disabled])');
        if (first && f.focusActions) first.focus();
        f.focusActions = true;
      },
      later(fn, ms) { setTimeout(() => { if (ctx.alive()) fn(); }, ctx.reduceMotion ? Math.min(ms, 150) : ms); }
    };
    f.focusActions = false;
    return f;
  }

  // Makes SVG shapes with data-hit clickable and keyboard reachable.
  function hits(stage, onHit) {
    stage.querySelectorAll('[data-hit]').forEach((g) => {
      g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
      g.addEventListener('click', () => onHit(g.dataset.hit));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHit(g.dataset.hit); } });
    });
  }

  SSE.SCENES = {};

  // ---------- 1. Spacewalk ----------
  SSE.SCENES.spacewalk = function (root, ctx) {
    const f = frame(root, ctx, ['Radio check with Mission Control', 'Clip your safety tether', 'Move along the handrails', 'Repair the solar panel', 'Return to the airlock']);
    const RAILS = [100, 160, 220, 280];
    const st = { pos: -1, clipped: false, bolts: [0, 0, 0], phase: 'loosen', swapped: false, fixed: false };

    function draw() {
      const ax = st.pos < 0 ? 52 : RAILS[st.pos];
      const anchor = st.pos < 0 ? 52 : RAILS[st.pos] - 8;
      const cells = [];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
        const broken = r === 1 && c === 0;
        const fill = broken ? (st.fixed ? '#3cc6ff' : st.swapped ? '#3155b8' : '#5b3a2e') : st.fixed ? '#3cc6ff' : '#3155b8';
        cells.push(`<rect x="${322 + c * 34}" y="${36 + r * 40}" width="30" height="36" fill="${fill}" stroke="#7fa2ff"/>`);
      }
      const crack = !st.swapped ? '<path d="M326 80 L338 92 L332 100 L348 112" stroke="#ffb27a" stroke-width="2" fill="none"/>' : '';
      const bolts = [[322, 74], [352, 74], [337, 114]].map(([x, y], i) => `<g data-hit="bolt${i}" aria-label="Bolt ${i + 1}" class="hit${st.pos === 3 && !st.fixed ? ' glow' : ''}"><circle cx="${x}" cy="${y}" r="7" fill="${st.bolts[i] ? '#41d07a' : '#c0c6d2'}" stroke="#333"/><path d="M${x - 4} ${y} h8" stroke="#333" stroke-width="2"/></g>`).join('');
      f.stage.innerHTML = `<svg viewBox="0 0 400 240" role="img" aria-label="Outside the space station: airlock on the left, handrails along the truss, a solar panel on the right.">
        <rect width="400" height="240" fill="#050a24"/>${STARS}<g transform="translate(200 0)">${STARS}</g>
        <circle cx="200" cy="560" r="360" fill="#2f6fd6"/><circle cx="200" cy="560" r="360" fill="none" stroke="#7fd3ff" stroke-width="8" opacity=".35"/>
        <rect x="20" y="96" width="300" height="18" fill="#9aa6c0"/><path d="M20 96 ${[...Array(15)].map((_, i) => `L${30 + i * 20} ${i % 2 ? 96 : 114}`).join(' ')}" stroke="#6f7a92" fill="none"/>
        <rect x="16" y="60" width="54" height="64" rx="10" fill="#e9edf5" stroke="#8792a8" stroke-width="2"/><circle cx="43" cy="92" r="16" fill="${st.pos === -1 ? '#1d2550' : '#8792a8'}" stroke="#55606e" stroke-width="3"/>
        <path d="M312 104 h12" stroke="#9aa6c0" stroke-width="6"/>${cells.join('')}${crack}
        ${RAILS.map((x, i) => `<g data-hit="rail${i}" aria-label="Handrail ${i + 1}" class="hit${st.clipped && st.pos === i - 1 ? ' glow' : ''}"><rect x="${x - 16}" y="84" width="32" height="8" rx="4" fill="#ffcc4d" stroke="#b38f00"/><text x="${x}" y="80" fill="#fff" font-size="10" text-anchor="middle">${i + 1}</text></g>`).join('')}
        ${st.clipped ? `<path d="M${anchor} 88 Q${ax - 4} 120 ${ax} ${st.pos < 0 ? 130 : 136}" stroke="#ffcc4d" stroke-width="2.5" fill="none"/>` : ''}
        ${bolts}
        <g class="mover" style="transform: translate(${st.pos < 0 ? 46 : ax}px, ${st.pos < 0 ? 140 : 150}px)">${MINI(0, 0, 1.4)}</g>
      </svg>`;
      hits(f.stage, onHit);
    }

    function onHit(h) {
      if (h.startsWith('rail')) return grabRail(+h.slice(4));
      if (h.startsWith('bolt')) return bolt(+h.slice(4));
    }

    function radio() {
      f.step(0); draw();
      f.msg('Before going outside, make sure Mission Control can hear you.');
      f.actions([{ label: '🎧 Say: "Houston, radio check"', cls: 'primary', on: () => {
        ctx.award(10, 'Radio check'); tether();
      } }]);
    }

    function tether() {
      f.step(1);
      f.msg('Houston: <b>"Loud and clear! You are go for the spacewalk."</b> Now get ready to leave the airlock.', 'good');
      f.actions([
        { label: '🔗 Clip tether to the handrail', cls: 'primary', on: () => { st.clipped = true; ctx.award(10, 'Tether clipped'); draw(); move(); } },
        { label: '🚀 Float outside now', on: async () => {
          ctx.mistake();
          await ctx.pause('Wait! Your tether isn\'t clipped', '<p>Outside the station you float. Without a tether you could drift away from the station.</p><p>Astronauts always clip on <b>before</b> they leave the airlock.</p>', 'Clip my tether first');
        } }
      ]);
    }

    function move() {
      f.step(2); draw();
      f.msg('Tap the glowing handrail to move one rail at a time. Your tether moves with you, so you stay attached.');
      f.actions([
        { label: `✋ Grab handrail ${st.pos + 2}`, cls: 'primary', on: () => grabRail(st.pos + 1) },
        { label: '💨 Let go and drift over quickly', on: async () => {
          ctx.mistake();
          await ctx.pause('Never let go!', '<p>Pushing off and drifting is not safe: you could miss the station and float away.</p><p>Spacewalkers move hand over hand, holding on and staying tethered.</p>', 'Hold on tight');
        } }
      ]);
    }

    function grabRail(i) {
      if (f.idx !== 2) return;
      if (i !== st.pos + 1) { f.msg(`One rail at a time! Grab handrail <b>${st.pos + 2}</b> next.`, 'warn'); return; }
      st.pos = i; ctx.award(5, 'Handrail');
      if (st.pos === RAILS.length - 1) { draw(); repair(); } else move();
    }

    function repair() {
      f.step(3); draw();
      const left = st.bolts.filter((b) => (st.phase === 'loosen' ? !b : b)).length;
      if (st.phase === 'loosen') f.msg(`Use your power tool to <b>loosen</b> the 3 bolts holding the broken part. ${3 - left}/3 done.`);
      else if (st.phase === 'swap') f.msg('Bolts loose! Slide out the broken part and put in the new one.');
      else f.msg(`New part in place. Now <b>tighten</b> the 3 bolts. ${3 - left}/3 done.`);
      if (st.phase === 'swap') {
        f.actions([{ label: '🔄 Swap in the new part', cls: 'primary', on: () => { st.swapped = true; st.phase = 'tighten'; st.bolts = [1, 1, 1]; ctx.award(15, 'Part swapped'); repair(); } }]);
      } else {
        f.actions([{ label: `🔧 ${st.phase === 'loosen' ? 'Loosen' : 'Tighten'} next bolt`, cls: 'primary', on: () => bolt(st.bolts.findIndex((b) => (st.phase === 'loosen' ? !b : b))) }]);
      }
    }

    function bolt(i) {
      if (f.idx !== 3 || i < 0) return;
      if (st.phase === 'loosen' && !st.bolts[i]) { st.bolts[i] = 1; ctx.award(3, 'Bolt loose'); if (st.bolts.every(Boolean)) st.phase = 'swap'; repair(); }
      else if (st.phase === 'tighten' && st.bolts[i]) {
        st.bolts[i] = 0; ctx.award(3, 'Bolt tight');
        if (st.bolts.every((b) => !b)) { st.fixed = true; ctx.award(20, 'Solar panel fixed!'); draw(); back(); } else repair();
      }
    }

    function back() {
      f.step(4);
      f.msg('⚡ The solar panel is making power again! Head back to the airlock, staying clipped on.', 'good');
      f.actions([{ label: '🏠 Return to the airlock', cls: 'primary', on: () => {
        st.pos = -1; draw(); f.actions([]);
        f.later(() => {
          f.msg('You\'re safely back inside the airlock. Great spacewalk!', 'good');
          f.actions([{ label: '✔ Close the hatch & finish', cls: 'primary', on: () => ctx.finish() }]);
        }, 700);
      } }]);
    }

    radio();
  };

  // ---------- 2. Lunar Explorer ----------
  SSE.SCENES.lunar = function (root, ctx) {
    const f = frame(root, ctx, ['Plan a safe route', 'Collect 3 rock samples', 'Return to the lander', 'Brush off Moon dust', 'Climb aboard']);
    const MAP = ['..A#.B.', '.#.#s..', 'L....#.', '.s##...', '.....Cs'];
    const COST = 3, SHADOW = 7, RESERVE = 12;
    const st = { r: 2, c: 0, o2: 100, got: {}, warned: false, walks: 1, brushed: false };
    const cell = (r, c) => (MAP[r] && MAP[r][c]) || '#';
    const costOf = (r, c) => (cell(r, c) === 's' ? SHADOW : COST);

    // Cheapest life-support cost from (r,c) back to the lander.
    function costHome(r0, c0) {
      const dist = MAP.map((row) => [...row].map(() => Infinity));
      dist[r0][c0] = 0;
      const q = [[0, r0, c0]];
      while (q.length) {
        q.sort((a, b) => a[0] - b[0]);
        const [d, r, c] = q.shift();
        if (cell(r, c) === 'L') return d;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = c + dc;
          if (cell(nr, nc) === '#') continue;
          const nd = d + costOf(nr, nc);
          if (nd < dist[nr][nc]) { dist[nr][nc] = nd; q.push([nd, nr, nc]); }
        }
      }
      return Infinity;
    }

    const samples = () => Object.keys(st.got).length;

    function draw() {
      const home = costHome(st.r, st.c);
      const low = st.o2 - home < RESERVE + 6;
      const cells = [];
      MAP.forEach((row, r) => [...row].forEach((ch, c) => {
        const here = r === st.r && c === st.c;
        const adj = Math.abs(r - st.r) + Math.abs(c - st.c) === 1;
        const kind = { '.': 'ground', '#': 'crater', s: 'shadow', L: 'lander', A: 'rock', B: 'rock', C: 'rock' }[ch];
        const got = st.got[ch];
        const label = { ground: 'Moon ground', crater: 'Crater, too steep', shadow: 'Cold shadow, uses more life support', lander: 'Your lander', rock: got ? 'Sample collected' : 'Rock sample' }[kind];
        const emoji = here ? '🧑‍🚀' : { ground: '', crater: '🕳️', shadow: '', lander: '🚀', rock: got ? '✅' : '🪨' }[kind];
        cells.push(`<button type="button" class="mcell ${kind}${here ? ' here' : ''}${adj && kind !== 'crater' ? ' adj' : ''}" data-r="${r}" data-c="${c}" aria-label="Row ${r + 1}, column ${c + 1}: ${label}${here ? ' (you are here)' : ''}">${emoji}</button>`);
      }));
      f.stage.innerHTML = `
        <div class="moon-map">
          <div class="moon-hud">
            <div><span>Life support</span><div class="meter${low ? ' low' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${st.o2}" aria-label="Life support"><i style="width:${st.o2}%" class="${st.o2 > 50 ? 'full' : 'mid'}"></i></div><b>${st.o2}%</b></div>
            <div><span>Samples</span><b>${samples()}/3</b></div>
            <div><span>Trip home needs</span><b>${home}%</b></div>
          </div>
          <div class="mgrid" style="--cols:${MAP[0].length}">${cells.join('')}</div>
          <p class="legend"><span>🪨 sample</span><span>🕳️ crater (go around)</span><span class="lg-shadow">shadow: very cold, costs ${SHADOW}%</span><span>ground costs ${COST}%</span></p>
        </div>`;
      f.stage.querySelectorAll('.mcell').forEach((b) => b.addEventListener('click', () => step(+b.dataset.r, +b.dataset.c)));
    }

    function focusHere() { const h = f.stage.querySelector('.mcell.here'); if (h) h.focus(); }

    async function step(r, c) {
      if (f.idx > 2) return;
      if (r === st.r && c === st.c) return;
      if (Math.abs(r - st.r) + Math.abs(c - st.c) !== 1) { f.msg('Walk one square at a time, to a square next to you.', 'warn'); return; }
      if (cell(r, c) === '#') { f.msg('🕳️ That crater is too steep and rocky. Plan a route around it!', 'warn'); return; }
      const before = costHome(st.r, st.c);
      const after = costHome(r, c);
      if (st.warned && after > before) {
        ctx.mistake();
        await ctx.pause('Turn-around warning ignored', `<p>Your life support reached the <b>turn-around point</b>, but you walked further away from the lander.</p><p>Explorers always keep a safety reserve so they can get home. Head back toward the lander now.</p>`, 'Head back');
        focusHere();
        return;
      }
      st.r = r; st.c = c; st.o2 -= costOf(r, c);
      if (f.idx === 0) f.step(1);
      const ch = cell(r, c);
      if (cell(r, c) === 's') f.msg('🥶 Brrr! Crater shadows are much colder than any freezer. Your suit keeps you warm, but uses more life support.');
      else f.msg(st.warned ? 'Keep heading back to the lander.' : 'Good step. Watch your life support!');
      if (st.o2 < costHome(r, c)) return recall();
      draw();
      if ('ABC'.includes(ch) && !st.got[ch]) offerCollect(ch);
      else if (ch === 'L') atLander();
      else defaultActions();
      if (!st.warned && st.o2 - costHome(r, c) < RESERVE && ch !== 'L') {
        st.warned = true;
        await ctx.pause('Turn-around point reached', `<p>Your life support is getting close to what you need for the walk home, plus a safety reserve.</p><p>Head back to the lander now${samples() < 3 ? '. You can refill and go out again to finish collecting' : ''}.</p>`, 'Head back to the lander');
        draw();
      }
      focusHere();
    }

    function defaultActions() {
      f.actions([{ label: 'ℹ️ Route tips', on: () => f.msg('Tip: go <b>around</b> craters, avoid cold shadows when you can, and keep enough life support for the walk home.') }]);
    }

    function offerCollect(ch) {
      f.msg('🪨 An interesting rock! Use your sample kit.', 'good');
      f.actions([{ label: '🧺 Collect sample with tongs', cls: 'primary', on: () => {
        st.got[ch] = true; ctx.award(15, 'Sample collected');
        draw();
        if (samples() === 3) { f.step(2); f.msg('All 3 samples collected! Now walk back to the lander 🚀.', 'good'); }
        else f.msg(`Sample bagged and labeled. ${3 - samples()} to go!`, 'good');
        defaultActions(); focusHere();
      } }]);
    }

    function atLander() {
      if (samples() < 3) {
        f.msg(`Back at the lander with ${samples()}/3 samples. Refill your life support and head out again.`);
        f.actions([{ label: '🔋 Refill life support & go out again', cls: 'primary', on: () => { st.o2 = 100; st.warned = false; st.walks++; draw(); f.msg('Life support full. Plan a shorter route this time!'); defaultActions(); focusHere(); } }]);
        return;
      }
      f.step(3);
      if (st.walks === 1) ctx.award(30, 'Done in one moonwalk!');
      f.msg('You made it back with all 3 samples! Your suit is covered in grey Moon dust…');
      f.actions([
        { label: '🧹 Brush off the dust', cls: 'primary', on: () => { st.brushed = true; ctx.award(15, 'Dust brushed off'); board(); } },
        { label: '🚪 Climb straight in', on: async () => {
          ctx.mistake();
          await ctx.pause('Stop! Too much dust', '<p>Moon dust is sharp like tiny bits of glass and sticks to everything. Inside, it could scratch seals and get into machines.</p><p>Brush it off with your dust brush before you go in.</p>', 'Brush it off');
        } }
      ]);
    }

    function board() {
      f.step(4);
      f.msg('Sparkly clean! Hand up your samples and climb aboard.', 'good');
      f.actions([{ label: '🚀 Climb aboard & finish', cls: 'primary', on: () => ctx.finish() }]);
    }

    async function recall() {
      ctx.mistake();
      draw();
      await ctx.pause('Mission Control: "Come home now"', '<p>Your life support is too low to keep exploring. In a real mission, Mission Control would call the crew back long before this.</p><p>Let\'s replan: start again from the lander with full life support and a shorter route.</p>', 'Replan my route');
      st.r = 2; st.c = 0; st.o2 = 100; st.warned = false; st.walks++;
      f.step(samples() === 3 ? 2 : samples() ? 1 : 0);
      draw(); defaultActions();
    }

    root.addEventListener('keydown', (e) => {
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      if (!d || !e.target.closest('.mgrid')) return;
      e.preventDefault();
      step(st.r + d[0], st.c + d[1]);
    });

    f.step(0); draw(); defaultActions();
    f.msg('Plan your route! Tap a square next to you to walk. Collect the 3 🪨 rocks and come back to the 🚀 lander. Arrow keys work too.');
  };

  // ---------- 3. Launch & Return ----------
  SSE.SCENES.launch = function (root, ctx) {
    const f = frame(root, ctx, ['Plug in the suit\'s air hose', 'Suit leak check', 'Buckle your harness', 'Close your visor', 'Launch!', 'Prepare for return', 'Splashdown']);
    const st = { hose: false, leak: false, buckles: [0, 0, 0, 0, 0], visor: false, phase: 'pad', gauge: 0 };

    function draw() {
      const sky = st.phase === 'pad' ? '#3a6fd8' : st.phase === 'orbit' ? '#050a24' : st.phase === 'return' ? '#2a1838' : '#5fb4ff';
      const B = [[146, 132], [174, 132], [160, 158], [140, 176], [180, 176]];
      f.stage.innerHTML = `<svg viewBox="0 0 400 240" role="img" aria-label="Inside the capsule: your seat, harness buckles, air hose port and window.">
        <rect width="400" height="240" fill="#2b3245"/>
        <circle cx="320" cy="70" r="44" fill="${sky}" stroke="#8792a8" stroke-width="8"/>${st.phase === 'orbit' ? '<circle cx="306" cy="98" r="30" fill="#2f6fd6"/>' : ''}${st.phase === 'return' ? '<circle cx="320" cy="70" r="30" fill="#ff7a1a" opacity=".6"/>' : ''}
        ${st.phase === 'splash' ? '<path d="M276 84 Q320 60 364 84 V110 H276Z" fill="#1e7bd6"/>' : ''}
        <rect x="20" y="20" width="110" height="70" rx="8" fill="#14193d" stroke="#55606e" stroke-width="3"/><g font-family="system-ui,sans-serif" font-size="10" fill="#41d07a"><text x="30" y="40">CABIN AIR  OK</text><text x="30" y="56">HOSE  ${st.hose ? 'CONNECTED' : '---'}</text><text x="30" y="72">SUIT  ${st.leak ? 'SEALED' : st.gauge ? 'TESTING' : '---'}</text></g>
        <rect x="110" y="96" width="100" height="120" rx="20" fill="#3a3f4b"/>
        <g transform="translate(160 150)"><rect x="-22" y="-26" width="44" height="54" rx="10" fill="#ff7a1a"/><circle cx="0" cy="-42" r="18" fill="#f5f7fb" stroke="#2f3542" stroke-width="2"/><path d="M-12 -46 Q0 -54 12 -46 V-34 Q0 -28 -12 -34Z" fill="${st.visor ? '#9fd0ff' : '#f2c9a0'}" stroke="#2f3542"/></g>
        <g stroke="#2f3542" stroke-width="6" stroke-linecap="round" opacity="${st.buckles.some(Boolean) ? 1 : .25}"><path d="M144 112 L156 160"/><path d="M176 112 L164 160"/><path d="M136 178 Q160 186 184 178"/></g>
        ${B.map(([x, y], i) => `<g data-hit="b${i}" aria-label="Buckle ${i + 1}" class="hit${f.idx === 2 && !st.buckles[i] ? ' glow' : ''}"><circle cx="${x}" cy="${y}" r="7" fill="${st.buckles[i] ? '#41d07a' : '#c0c6d2'}" stroke="#222"/></g>`).join('')}
        <g data-hit="hose" aria-label="Air hose port" class="hit${f.idx === 0 ? ' glow' : ''}"><rect x="60" y="150" width="24" height="24" rx="5" fill="#2f3542" stroke="#8792a8" stroke-width="2"/>${st.hose ? '<path d="M84 162 Q110 168 140 158" stroke="#3a7bd5" stroke-width="6" fill="none"/>' : ''}</g>
        <g transform="translate(250 150)"><circle r="30" fill="#14193d" stroke="#8792a8" stroke-width="4"/><path d="M-22 10 A24 24 0 0 1 22 10" stroke="#55606e" stroke-width="4" fill="none"/>
          <line x1="0" y1="0" x2="${-20 + st.gauge * 0.4}" y2="${-14 + Math.abs(st.gauge - 50) * 0.1}" stroke="#ffcc4d" stroke-width="3" class="needle"/><text y="22" text-anchor="middle" font-size="9" fill="#fff">SUIT PRESSURE</text></g>
        ${st.phase === 'splash' ? '<g transform="translate(320 26)"><path d="M-26 0 Q0 -24 26 0Z" fill="#ff7a1a"/><path d="M-26 0 L-6 22 M26 0 L6 22" stroke="#fff"/></g>' : ''}
      </svg>`;
      hits(f.stage, (h) => {
        if (h === 'hose' && f.idx === 0) plugHose();
        else if (h[0] === 'b' && f.idx === 2) buckle(+h.slice(1));
      });
    }

    function missing() {
      const m = [];
      if (!st.hose) m.push('plug in your air hose');
      if (!st.leak) m.push('do the suit leak check');
      if (st.buckles.some((b) => !b)) m.push('buckle all 5 harness buckles');
      if (!st.visor) m.push('close your visor');
      return m;
    }

    const countdownBtn = { label: '⏱️ Start countdown', on: async () => {
      const m = missing();
      if (m.length) {
        ctx.mistake();
        await ctx.pause('Countdown on hold', `<p>Launch control can't start the countdown yet. You still need to:</p><ul>${m.map((x) => `<li>${x}</li>`).join('')}</ul><p>Every check matters before a launch.</p>`, 'Back to my checks');
        return;
      }
      launch();
    } };

    function plugHose() { st.hose = true; ctx.award(10, 'Hose connected'); leakCheck(); }

    function hoseStep() {
      f.step(0); draw();
      f.msg('Your launch suit has no backpack. Plug its air hose into the spacecraft for air and cooling.');
      f.actions([{ label: '🔌 Plug in the air hose', cls: 'primary', on: plugHose }, countdownBtn]);
    }

    function leakCheck() {
      f.step(1); draw();
      f.msg('Now test the suit: fill it with air and watch the pressure needle.');
      f.actions([{ label: '🎈 Pressurize suit', cls: 'primary', on: () => {
        st.gauge = 100; draw(); f.actions([]); f.msg('Filling the suit with air… watch the needle.');
        f.later(async () => {
          const r = await ctx.ask({ icon: '🎈', title: 'Leak check', html: '<p>The needle went up to full and <b>stays steady</b>. What does that mean?</p>',
            buttons: [{ label: 'The suit is leaking', value: 'leak' }, { label: 'The suit is sealed, no leaks', value: 'ok', cls: 'primary' }] });
          if (!ctx.alive()) return;
          if (r === 'ok') { st.leak = true; ctx.award(15, 'Leak check passed'); harness(); }
          else {
            ctx.mistake();
            await ctx.pause('Look again at the needle', '<p>If the suit were leaking, the needle would slowly <b>drop</b>. A steady needle means the suit holds its air.</p>', 'Try again');
            st.gauge = 0; leakCheck();
          }
        }, 900);
      } }, countdownBtn]);
    }

    function buckle(i) {
      if (st.buckles[i]) return;
      st.buckles[i] = 1; ctx.award(2, 'Click!');
      if (st.buckles.every(Boolean)) visor(); else harness();
    }

    function harness() {
      f.step(2); draw();
      const n = st.buckles.filter(Boolean).length;
      f.msg(`Buckle all 5 harness buckles so you stay snug in your seat. ${n}/5 clicked.`);
      f.actions([{ label: '🔒 Click next buckle', cls: 'primary', on: () => buckle(st.buckles.findIndex((b) => !b)) }, countdownBtn]);
    }

    function visor() {
      f.step(3); draw();
      f.msg('Harness snug! Last check: close your helmet visor for launch.');
      f.actions([{ label: '🪖 Close visor', cls: 'primary', on: () => { st.visor = true; ctx.award(10, 'Visor closed'); f.step(4); draw(); f.msg('All checks done. You are GO for launch!', 'good'); f.actions([{ ...countdownBtn, cls: 'primary big' }]); } }, countdownBtn]);
    }

    function launch() {
      f.step(4); f.actions([]);
      ctx.award(20, 'Go for launch!');
      let n = 3;
      const tick = () => {
        if (n > 0) { f.msg(`<span class="count">${n}…</span>`); n--; f.later(tick, 700); return; }
        f.msg('🚀 <b>Liftoff!</b> The rocket rumbles and pushes you into your seat…', 'good');
        f.stage.classList.add('shake');
        f.later(() => {
          f.stage.classList.remove('shake'); st.phase = 'orbit'; draw();
          f.msg('You are in orbit! Look at Earth out the window 🌍. Once the ride is calm you can open your visor.', 'good');
          f.actions([{ label: '🪖 Open visor & enjoy the view', cls: 'primary', on: () => { st.visor = false; draw(); comeHome(); } }]);
        }, 1600);
      };
      tick();
    }

    async function comeHome() {
      f.step(5);
      f.msg('Mission done! Time to come home.');
      const r = await ctx.ask({ icon: '🌍', title: 'Preparing for return', html: '<p>Before heading back into Earth\'s atmosphere, what do you do?</p>',
        buttons: [{ label: 'Unbuckle and float around', value: 'float' }, { label: 'Close visor and check my harness', value: 'ok', cls: 'primary' }, { label: 'Take off my suit and pack it', value: 'off' }] });
      if (!ctx.alive()) return;
      if (r !== 'ok') {
        ctx.mistake();
        await ctx.pause('Not yet!', '<p>Coming home is one of the busiest, bumpiest parts of the flight. Your suit, closed visor and snug harness keep you safe until landing.</p>', 'Try again');
        return comeHome();
      }
      st.visor = true; ctx.award(20, 'Ready for return'); st.phase = 'return'; draw();
      f.msg('🔥 The capsule glows as it slows down in the air. The heat shield protects you!');
      f.actions([]);
      f.later(() => {
        st.phase = 'splash'; draw(); f.step(6);
        f.msg('🪂 Parachutes open… <b>Splashdown!</b> Welcome home!', 'good');
        f.actions([{ label: '✔ Finish mission', cls: 'primary', on: () => ctx.finish() }]);
      }, 1800);
    }

    hoseStep();
  };

  // ---------- 4. Life in Orbit ----------
  SSE.SCENES.orbit = function (root, ctx) {
    const TASKS = [
      { id: 'filter', name: 'Clean the air filter', icon: '🌬️' },
      { id: 'plant', name: 'Water the plant experiment', icon: '🌱' },
      { id: 'exercise', name: 'Daily exercise', icon: '🏃' },
      { id: 'call', name: 'Answer Mission Control', icon: '📞' }
    ];
    const f = frame(root, ctx, TASKS.map((t) => t.name));
    const done = {};
    let dust = [1, 1, 1, 1];

    function hub() {
      const n = Object.keys(done).length;
      f.step(n);
      f.stage.innerHTML = `<div class="tasks">${TASKS.map((t) => `<button type="button" class="task${done[t.id] ? ' done' : ''}" data-task="${t.id}" ${done[t.id] ? 'disabled' : ''}>
        <span class="ti" aria-hidden="true">${t.icon}</span><b>${t.name}</b><span>${done[t.id] ? '✅ Done' : 'Tap to start'}</span></button>`).join('')}</div>`;
      f.stage.querySelectorAll('[data-task]').forEach((b) => b.addEventListener('click', () => TASK[b.dataset.task]()));
      // Steps show completion in any order.
      f.stage.parentElement.querySelectorAll('.msteps li').forEach((li, i) => {
        const d = done[TASKS[i].id];
        li.className = d ? 'done' : '';
        li.textContent = `${d ? '✅' : '⬜'} ${TASKS[i].name}`;
      });
      if (n === TASKS.length) {
        f.msg('All of today\'s jobs are done! You worked in comfy station clothes and only added goggles when the job needed them.', 'good');
        f.actions([{ label: '✔ Finish the day', cls: 'primary', on: () => ctx.finish() }]);
      } else {
        f.msg('Pick any task. You can do them in any order.');
        f.actions([]);
      }
    }

    function complete(id, pts, label) { done[id] = true; ctx.award(pts, label); hub(); }

    const TASK = {
      filter() {
        const draw = () => {
          f.stage.innerHTML = `<svg viewBox="0 0 400 240" role="img" aria-label="An air filter with floating dust clumps">
            <rect width="400" height="240" fill="#dfe7f5"/><rect x="120" y="50" width="160" height="140" rx="10" fill="#b9c6dd" stroke="#8792a8" stroke-width="3"/>
            ${[...Array(7)].map((_, i) => `<path d="M136 ${70 + i * 17} h128" stroke="#8792a8" stroke-width="3"/>`).join('')}
            ${dust.map((d, i) => d ? `<g data-hit="d${i}" aria-label="Dust clump ${i + 1}" class="hit float"><circle cx="${[90, 300, 160, 250][i]}" cy="${[80, 70, 190, 170][i]}" r="16" fill="#9a8f80"/><circle cx="${[96, 306, 166, 256][i]}" cy="${[74, 64, 184, 164][i]}" r="8" fill="#b3a998"/></g>` : '').join('')}
            <text x="200" y="228" text-anchor="middle" font-size="12" fill="#55606e">Dust floats in microgravity: your goggles protect your eyes 🥽</text></svg>`;
          hits(f.stage, (h) => vac(+h.slice(1)));
        };
        const vac = (i) => {
          if (!dust[i]) return;
          dust[i] = 0; ctx.award(3, 'Vacuumed');
          if (dust.every((d) => !d)) { f.msg('Filter clean. Fresh air for the crew!', 'good'); f.later(() => complete('filter', 10, 'Filter clean'), 500); draw(); }
          else { draw(); f.actions([{ label: '🧹 Vacuum next clump', cls: 'primary', on: () => vac(dust.findIndex(Boolean)) }]); }
        };
        dust = [1, 1, 1, 1];
        draw();
        f.msg('Floating dust clumps! Tap each one to vacuum it up.');
        f.actions([{ label: '🧹 Vacuum next clump', cls: 'primary', on: () => vac(dust.findIndex(Boolean)) }]);
      },
      async plant() {
        const r = await ctx.ask({ icon: '🌱', title: 'Watering in space', html: '<p>Your lettuce experiment is thirsty. How do you water it?</p>',
          buttons: [{ label: 'Pour a whole cup over it', value: 'cup' }, { label: 'A small squeeze from the water pouch', value: 'ok', cls: 'primary' }, { label: 'Skip it today', value: 'skip' }] });
        if (!ctx.alive()) return;
        if (r === 'ok') { f.msg('The water clings to the roots like a little bubble. Your plant is happy! 🥬', 'good'); return complete('plant', 15, 'Plant watered'); }
        if (r === 'cup') {
          ctx.mistake();
          await ctx.pause('Wobbly water blobs!', '<p>In microgravity, water doesn\'t pour. It floats away in wobbly blobs that could get into equipment.</p><p>Astronauts use small, careful squeezes instead.</p>', 'Try again');
        } else f.msg('The plant still needs water to grow. Try again!', 'warn');
      },
      async exercise() {
        const r = await ctx.ask({ icon: '🏃', title: 'Exercise time', html: '<p>Astronauts exercise about 2 hours a day to keep bones and muscles strong. How do you use the treadmill?</p>',
          buttons: [{ label: 'Just start running', value: 'run' }, { label: 'Clip into the harness, then run', value: 'ok', cls: 'primary' }] });
        if (!ctx.alive()) return;
        if (r === 'ok') { f.msg('The harness and bungee cords hold you down so your feet stay on the treadmill. 💪', 'good'); return complete('exercise', 15, 'Workout done'); }
        ctx.mistake();
        await ctx.pause('Whoops, you\'d float away!', '<p>Without gravity, your first step would push you up off the treadmill.</p><p>A harness with bungee cords pulls you down so you can run.</p>', 'Try again');
      },
      async call() {
        const r = await ctx.ask({ icon: '📞', title: 'Mission Control calling', html: '<p>"A camera on the <b>outside</b> of the station needs a look." What do you say?</p>',
          buttons: [{ label: 'I\'ll float out the hatch right now in my station clothes', value: 'out' }, { label: 'Let\'s plan a spacewalk with EVA suits', value: 'ok', cls: 'primary' }] });
        if (!ctx.alive()) return;
        if (r === 'ok') { f.msg('Mission Control: "Great thinking! We\'ll schedule a spacewalk." Outside needs an EVA suit, life support and tethers.', 'good'); return complete('call', 15, 'Smart choice'); }
        ctx.mistake();
        await ctx.pause('Stop! Not in station clothes', '<p>Station clothes are only for inside, where there is air. Outside there is no air at all.</p><p>Going outside needs a planned spacewalk with an EVA suit, life support and tethers.</p>', 'Try again');
      }
    };

    hub();
  };

  // ---------- 5. Mars Research (hypothetical) ----------
  SSE.SCENES.mars = function (root, ctx) {
    const f = frame(root, ctx, ['Design your concept gear', 'Scan the rocks', 'Drill the best clue', 'Handle the dust storm']);
    const QS = [
      { t: 'How will you get around?', o: [['🚙 A pressurized rover with a cabin', 'You can drive far, then take off your helmet inside to rest. NASA has tested ideas like this.'], ['🚶 Walk everywhere', 'Walking is great for short trips, but Mars is huge! Explorers will probably use rovers for long trips.'], ['🛴 A jet scooter', 'Fun idea! Mars has thin air, so engineers would need to think hard about how it flies.']] },
      { t: 'Where will extra oxygen come from?', o: [['🏭 Make it from Mars air', 'A real experiment called MOXIE on NASA\'s Perseverance rover made small amounts of oxygen from Mars\'s carbon dioxide air!'], ['🛢️ Bring giant tanks from Earth', 'That works, but tanks are heavy to launch. Making some oxygen on Mars could help.'], ['🔋 Refill at the habitat', 'A home base where suits recharge is a smart idea.']] },
      { t: 'How will you keep dust out of your home?', o: [['🚪 Climb in through the back of the suit, leaving it outside', 'This idea is called a "suitport". The dusty suit stays outside!'], ['💨 An air-shower room', 'Blowing dust off in a special room is one idea engineers have imagined.'], ['🧹 Brush off every time', 'Brushing helps, just like on the Moon.']] }
    ];
    const SITES = [
      { name: 'Red sand dune', scan: 'Just sand and dust. Not many clues here.', best: false },
      { name: 'Layered rock cliff', scan: 'Layers like a stack of pancakes! Layers like these can form in water long ago.', best: true },
      { name: 'Dark boulder', scan: 'Volcanic rock. Interesting, but no water clues.', best: false }
    ];
    const scanned = {};
    let qi = 0;

    function design() {
      f.step(0);
      const q = QS[qi];
      f.stage.innerHTML = `<div class="concept-box"><p class="concept-tag">💭 Imagine the future: there are no wrong ideas here!</p><h4>${q.t}</h4>
        <div class="opts">${q.o.map((o, i) => `<button type="button" class="opt" data-o="${i}">${o[0]}</button>`).join('')}</div><p class="fine">Choice ${qi + 1} of ${QS.length}</p></div>`;
      f.stage.querySelectorAll('[data-o]').forEach((b) => b.addEventListener('click', () => {
        f.msg(`💡 ${q.o[+b.dataset.o][1]}`, 'good'); ctx.award(5, 'Engineer idea');
        qi++;
        if (qi < QS.length) design(); else explore();
      }));
      f.actions([]);
      const first = f.stage.querySelector('.opt'); if (first) first.focus();
    }

    function drawSites() {
      f.stage.innerHTML = `<div class="mars-sites">${SITES.map((s, i) => `<div class="site${scanned[i] ? ' scanned' : ''}">
        <svg viewBox="0 0 120 70" aria-hidden="true"><rect width="120" height="70" fill="#e8a27a"/>${i === 0 ? '<path d="M0 60 Q40 20 80 50 T120 40 V70 H0Z" fill="#d6763f"/>' : i === 1 ? '<g fill="#a8432a"><rect x="20" y="20" width="80" height="10"/><rect x="16" y="30" width="88" height="10" fill="#c2552f"/><rect x="12" y="40" width="96" height="10"/><rect x="8" y="50" width="104" height="20" fill="#c2552f"/></g>' : '<ellipse cx="60" cy="50" rx="34" ry="20" fill="#4a3b36"/>'}</svg>
        <b>${s.name}</b><p>${scanned[i] ? s.scan : 'Not scanned yet'}</p>
        ${scanned[i] ? `<button type="button" class="btn ${f.idx === 2 ? 'primary' : ''}" data-drill="${i}" ${f.idx === 2 ? '' : 'disabled'}>⛏️ Drill here</button>` : `<button type="button" class="btn" data-scan="${i}">📡 Scan</button>`}
      </div>`).join('')}</div>`;
      f.stage.querySelectorAll('[data-scan]').forEach((b) => b.addEventListener('click', () => {
        scanned[b.dataset.scan] = true; ctx.award(5, 'Scanned');
        if (Object.keys(scanned).length === SITES.length) { f.step(2); f.msg('All scanned! Which rock is the best clue about water long ago? Drill there.'); }
        drawSites();
        const nb = f.stage.querySelector('[data-scan],[data-drill]:not([disabled])'); if (nb) nb.focus();
      }));
      f.stage.querySelectorAll('[data-drill]').forEach((b) => b.addEventListener('click', () => drill(+b.dataset.drill)));
    }

    function explore() {
      f.step(1);
      f.msg('Your concept gear is ready! Scan all three sites with your scanner.');
      drawSites(); f.actions([]);
      const nb = f.stage.querySelector('[data-scan]'); if (nb) nb.focus();
    }

    function drill(i) {
      if (!SITES[i].best) { f.msg(`Hmm, the ${SITES[i].name.toLowerCase()} doesn't show water clues. Read the scans again!`, 'warn'); return; }
      ctx.award(25, 'Great science!');
      f.msg('⛏️ Your core sample shows tiny layers. Scientists on Earth would love to study it!', 'good');
      f.stage.querySelectorAll('[data-drill]').forEach((b) => { b.disabled = true; });
      f.later(storm, 900);
    }

    function storm() {
      f.step(3);
      f.stage.insertAdjacentHTML('afterbegin', '<div class="alert" role="alert">🌪️ Mission Control: a big dust storm is heading your way!</div>');
      f.msg('A dust storm is coming. What do you do?', 'warn');
      f.actions([
        { label: '🏠 Pack up and return to the habitat', cls: 'primary', on: () => {
          ctx.award(20, 'Safe choice');
          f.msg('You made it back to the habitat before the storm. Safe and sound, with your sample!', 'good');
          f.actions([{ label: '✔ Finish mission', cls: 'primary', on: () => ctx.finish() }]);
        } },
        { label: '⛏️ Keep drilling, it\'s only dust', on: async () => {
          ctx.mistake();
          await ctx.pause('Storm warning ignored', '<p>Dust storms on Mars can cover huge areas and make it hard to see the way home. In our imagined mission, they could also clog suits and rovers.</p><p>When Mission Control warns you, heading back early is the safe choice.</p>', 'Choose again');
        } }
      ]);
    }

    f.msg('<b>Imagined future mission.</b> Nobody has been to Mars yet. Design your concept gear first!');
    design();
  };

  // ---------- 6. Emergency Training ----------
  SSE.SCENES.emergency = function (root, ctx) {
    const f = frame(root, ctx, ['Practice task: tighten bolts', 'Warning 1', 'Warning 2', 'Warning 3', 'Finish the practice task']);
    const GAUGES = [
      { id: 'o2', name: 'Oxygen', ok: '92%', bad: 'LOW 18%' },
      { id: 'radio', name: 'Radio', ok: 'Clear', bad: 'NO SIGNAL' },
      { id: 'press', name: 'Suit pressure', ok: 'Steady', bad: 'DROPPING' },
      { id: 'temp', name: 'Temperature', ok: 'Comfy', bad: 'Comfy' }
    ];
    const PAGES = { o2: 'Low oxygen', radio: 'Lost radio', press: 'Suit pressure dropping', temp: 'Too warm' };
    const WARN = [
      { g: 'o2', q: 'The oxygen reading is low. What does the checklist say to do?',
        good: 'Switch to backup oxygen, tell Mission Control, and go back to the airlock with my buddy',
        bad: [['Take a deep breath and keep working', 'Low oxygen is never something to ignore. Switch to backup and head back.'], ['Open my visor to get some air', 'There is no air outside the suit! Keep the helmet closed and switch to backup oxygen.']] },
      { g: 'radio', q: 'Your radio has no signal. What does the checklist say to do?',
        good: 'Signal my buddy with hand signals and follow the lost-radio plan back to the airlock',
        bad: [['Keep working alone in silence', 'Without radio, nobody can warn you about problems. Stick with your buddy and follow the plan.'], ['Unclip my tether to go find someone', 'Never unclip your tether! Your buddy can come to you.']] },
      { g: 'press', q: 'Suit pressure is dropping. It might be a small leak. What does the checklist say?',
        good: 'Tell Mission Control and my buddy, follow the checklist steps and return to the airlock right away',
        bad: [['Ignore it, suits are tough', 'A possible leak must always be checked. Head back to the airlock.'], ['Patch it with tape from my pocket', 'Don\'t guess! Follow the checklist and get back to the airlock quickly.']] }
    ];
    const st = { work: 0, w: -1, phase: 'work' };

    function draw() {
      const alarm = st.w >= 0 && st.phase !== 'work' ? WARN[st.w].g : null;
      f.stage.innerHTML = `
        <p class="sim-tag">🧪 TRAINING SIMULATOR: practice only, nothing here is real</p>
        <div class="gauges" role="group" aria-label="Suit gauges">${GAUGES.map((g) => {
          const bad = alarm === g.id;
          return `<button type="button" class="gauge${bad ? ' alarm' : ''}" data-g="${g.id}" ${st.phase === 'identify' ? '' : 'disabled'}>
            <span>${g.name}</span><b>${bad ? '⚠ ' + g.bad : g.ok}</b></button>`;
        }).join('')}</div>
        <div class="work-bar"><span>Practice task: tighten 6 bolts</span><div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="6" aria-valuenow="${st.work}" aria-label="Practice task progress"><i class="full" style="width:${st.work / 6 * 100}%"></i></div></div>
        ${st.phase === 'checklist' ? `<div class="cuff"><h4>📖 Cuff checklist: pick the right page</h4><div class="opts">${Object.entries(PAGES).map(([k, v]) => `<button type="button" class="opt" data-page="${k}">${v}</button>`).join('')}</div></div>` : ''}`;
      f.stage.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => identify(b.dataset.g)));
      f.stage.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => page(b.dataset.page)));
    }

    function working() {
      st.phase = 'work';
      f.step(st.w < 0 ? 0 : Math.min(st.w + 2, 4));
      draw();
      f.msg(st.work >= 6 ? '' : 'Tighten the bolts. Watch your gauges!');
      f.actions([{ label: '🔧 Tighten a bolt', cls: 'primary', on: () => {
        st.work++; ctx.award(2, 'Bolt');
        const trigger = { 1: 0, 3: 1, 5: 2 }[st.work];
        if (trigger !== undefined && st.w < trigger) return warning(trigger);
        if (st.work >= 6) {
          draw(); f.step(5);
          f.msg('Practice complete! You handled every warning: stop, identify, check the checklist, respond.', 'good');
          f.actions([{ label: '✔ End simulation', cls: 'primary', on: () => ctx.finish() }]);
          return;
        }
        working();
      } }]);
    }

    function warning(i) {
      st.w = i; st.phase = 'stop';
      f.step(i + 1); draw();
      f.msg('🚨 <b>Beep beep!</b> A warning light just turned on!', 'warn');
      f.actions([
        { label: '✋ STOP and tell Mission Control', cls: 'primary', on: () => { ctx.award(10, 'Stopped safely'); st.phase = 'identify'; draw(); f.msg('Good stop. Now find the warning: which gauge is flashing?'); f.actions([]); const g = f.stage.querySelector('.gauge'); if (g) g.focus(); } },
        { label: '🔧 Keep working, I\'m almost done', on: async () => {
          ctx.mistake();
          await ctx.pause('Warning ignored', '<p>A warning light means something needs attention <b>right now</b>. The job can wait!</p><p>The first step is always to <b>stop</b> and tell Mission Control.</p>', 'Stop now');
        } }
      ]);
    }

    function identify(g) {
      if (st.phase !== 'identify') return;
      if (g !== WARN[st.w].g) { ctx.mistake(); f.msg(`The ${GAUGES.find((x) => x.id === g).name.toLowerCase()} gauge looks normal. Look for the one flashing ⚠.`, 'warn'); return; }
      ctx.award(10, 'Warning found'); st.phase = 'checklist'; draw();
      f.msg('Found it! Now open your cuff checklist to the right page.');
      const p = f.stage.querySelector('[data-page]'); if (p) p.focus();
    }

    function page(p) {
      if (p !== WARN[st.w].g) { ctx.mistake(); f.msg(`The "${PAGES[p]}" page is for a different warning. Which gauge was flashing?`, 'warn'); return; }
      ctx.award(10, 'Right page');
      st.phase = 'respond'; draw();
      respond();
    }

    async function respond() {
      const w = WARN[st.w];
      const opts = [{ label: w.good, value: 'ok', cls: 'primary' }, ...w.bad.map((b, i) => ({ label: b[0], value: 'b' + i }))];
      // Shuffle so the right answer isn't always first.
      for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
      const r = await ctx.ask({ icon: '📖', title: PAGES[w.g], html: `<p>${w.q}</p>`, buttons: opts.map((o) => ({ ...o, cls: '' })) });
      if (!ctx.alive()) return;
      if (r === 'ok') {
        ctx.award(15, 'Correct response');
        f.msg('✅ Correct! In the simulator, the warning is now cleared. Back to practice.', 'good');
        working();
        return;
      }
      ctx.mistake();
      const bad = r.startsWith('b') ? w.bad[+r.slice(1)][1] : 'Use the checklist steps.';
      await ctx.pause('Let\'s think again', `<p>${bad}</p>`, 'Choose again');
      respond();
    }

    f.msg('Welcome to the simulator! Start the practice task. When a warning appears: <b>stop, identify, checklist, respond</b>.');
    working();
  };
})();
