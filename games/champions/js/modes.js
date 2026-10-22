// Game modes beyond a single match: the 16-club "Champions Cup" knockout and penalty-shootout quick play.
// The cup is saved in localStorage so it can be resumed; other ties are simulated from club ratings.
var FC = window.FC = window.FC || {};

(() => {
  const $ = id => document.getElementById(id);
  const KEY = 'fsg.champions.cup';
  const ROUNDS = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const T = i => FC.TEAMS[i];

  let cup = store.get(KEY, null);

  // ---------- simulated ties: goals ~ Poisson, stronger clubs score more ----------
  function poisson(l) { let k = 0, p = Math.exp(-l), s = p, u = Math.random(); while (u > s && k < 9) { k++; p *= l / k; s += p; } return k; }
  function simulateTie(tie) {
    const ra = T(tie.a).rating, rb = T(tie.b).rating;
    tie.ga = poisson(1.35 * Math.exp((ra - rb) / 16)); tie.gb = poisson(1.35 * Math.exp((rb - ra) / 16));
    if (tie.ga === tie.gb) {   // penalties
      tie.pa = 3 + poisson(1.2); do tie.pb = 3 + poisson(1.2); while (tie.pb === tie.pa);
    }
    tie.winner = tie.ga > tie.gb || (tie.ga === tie.gb && tie.pa > tie.pb) ? tie.a : tie.b;
  }

  function newCup(you, difficulty, halfSeconds) {
    const others = FC.TEAMS.map((_, i) => i).filter(i => i !== you).sort(() => Math.random() - 0.5).slice(0, 15);
    const teams = [you, ...others].sort(() => Math.random() - 0.5);
    const r16 = []; for (let i = 0; i < 16; i += 2) r16.push({ a: teams[i], b: teams[i + 1] });
    cup = { you, difficulty, halfSeconds, rounds: [r16], round: 0, out: false, champion: null };
    store.set(KEY, cup);
  }

  const myTie = () => cup.rounds[cup.round].find(t => t.a === cup.you || t.b === cup.you);

  // finish the current round (simulating every tie still unplayed) and draw the next one
  function completeRound() {
    for (const t of cup.rounds[cup.round]) if (t.winner == null) simulateTie(t);
    const winners = cup.rounds[cup.round].map(t => t.winner);
    if (winners.length === 1) { cup.champion = winners[0]; store.set(KEY, cup); return; }
    const next = []; for (let i = 0; i < winners.length; i += 2) next.push({ a: winners[i], b: winners[i + 1] });
    cup.rounds.push(next); cup.round++;
    store.set(KEY, cup);
  }

  // ---------- bracket screen ----------
  function tieHtml(t) {
    const mine = t.a === cup.you || t.b === cup.you;
    const side = (i, g, pens) => `<div class="bt ${t.winner === i ? 'win' : t.winner != null ? 'lose' : ''}">
        <span class="shirt" style="background:${FC.kitCss(T(i).kit)}"></span><span class="bn">${esc(T(i).short)}</span>
        <span class="bs">${g == null ? '' : g}${pens != null ? `<small>(${pens})</small>` : ''}</span></div>`;
    return `<div class="tie${mine ? ' mine' : ''}">${side(t.a, t.ga, t.pa)}${side(t.b, t.gb, t.pb)}</div>`;
  }

  function showBracket() {
    const w = $('cupWrap');
    let status, actions = '';
    if (cup.champion != null) {
      status = cup.champion === cup.you ? 'You won the Champions Cup!' : `${esc(T(cup.champion).name)} won the cup.`;
      if (cup.champion === cup.you) actions += '<button class="btn primary" id="cupTrophy">Lift the trophy ▸</button>';
      actions += '<button class="btn" id="cupNew">New cup</button>';
    } else if (cup.out) {
      status = `You were knocked out in the ${ROUNDS[cup.outRound].toLowerCase()}.`;
      actions += '<button class="btn primary" id="cupSim">See who wins ▸</button><button class="btn" id="cupNew">New cup</button>';
    } else {
      const t = myTie(), opp = t.a === cup.you ? t.b : t.a;
      status = `${ROUNDS[cup.round]}: ${esc(T(cup.you).name)} vs ${esc(T(opp).name)}`;
      actions += `<button class="btn primary" id="cupPlay">Play ${ROUNDS[cup.round].toLowerCase()} ▸</button><button class="btn" id="cupNew">Start over</button>`;
    }
    w.innerHTML = `
      <div class="topbar"><h2>Champions Cup</h2><button class="btn" id="cupBack">Menu</button></div>
      <p class="note" style="font-size:16px;color:var(--silver)">${status}</p>
      <div class="bracket">${ROUNDS.map((r, i) => `<div class="round"><div class="optlbl">${r}</div>${(cup.rounds[i] || []).map(tieHtml).join('') || '<div class="tie tbd">To be decided</div>'.repeat(Math.max(1, 8 >> i))}</div>`).join('')}</div>
      <div class="actions" style="justify-content:flex-start">${actions}</div>`;
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('cupBack', () => FC.show('scrTitle'));
    on('cupPlay', playNext);
    on('cupNew', () => { store.del(KEY); cup = null; FC.openModePicker('cup'); });
    on('cupSim', () => { while (cup.champion == null) completeRound(); showBracket(); });
    on('cupTrophy', () => trophy(cup.you));
    FC.show('scrCup');
  }

  function playNext() {
    const t = myTie(), opp = t.a === cup.you ? t.b : t.a;
    FC.startMatch({ role: 'local', home: cup.you, away: opp, difficulty: cup.difficulty, halfSeconds: cup.halfSeconds, cup: true });
  }

  // ---------- trophy celebration ----------
  let confettiRaf = 0;
  function trophy(team) {
    FC.Audio.startCrowd(); FC.Audio.goal();
    $('trophyTeam').textContent = T(team).name;
    $('trophyKit').style.background = FC.kitCss(T(team).kit);
    FC.show('scrTrophy');
    const c = $('confetti'), g = c.getContext('2d');
    const fit = () => { c.width = c.clientWidth; c.height = c.clientHeight; }; fit();
    const cols = [T(team).kit.shirt, T(team).kit.shirt2, '#f0c35a', '#ffffff'];
    const bits = Array.from({ length: 160 }, () => ({ x: Math.random() * c.width, y: -Math.random() * c.height, v: 60 + Math.random() * 120, s: 4 + Math.random() * 6, r: Math.random() * 6, w: Math.random() * 4 - 2, col: cols[(Math.random() * cols.length) | 0] }));
    let last = performance.now();
    cancelAnimationFrame(confettiRaf);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    (function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      g.clearRect(0, 0, c.width, c.height);
      for (const b of bits) {
        if (!reduce) { b.y += b.v * dt; b.x += Math.sin(b.r) * 20 * dt; b.r += b.w * dt; if (b.y > c.height + 10) { b.y = -10; b.x = Math.random() * c.width; } }
        g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.col; g.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); g.restore();
      }
      if (!$('scrTrophy').classList.contains('hidden')) confettiRaf = requestAnimationFrame(tick);
    })(last);
    const wins = store.get('fsg.champions.cups', 0) + (cup && cup.trophyCounted ? 0 : 1);
    if (cup && !cup.trophyCounted) { cup.trophyCounted = true; store.set(KEY, cup); store.set('fsg.champions.cups', wins); }
    $('trophyNote').textContent = wins > 1 ? `That's ${wins} Champions Cups in this browser.` : 'Your first Champions Cup!';
  }
  $('trophyDone').addEventListener('click', () => { FC.Audio.stopCrowd(); showBracket(); });

  // ---------- hooks used by app.js ----------
  FC.Cup = {
    open() { if (cup) showBracket(); else FC.openModePicker('cup'); },
    inProgress: () => !!cup && cup.champion == null && !cup.out,
    start(you, difficulty, halfSeconds) { newCup(you, difficulty, halfSeconds); showBracket(); },
    // called at full time of a cup match; adds the right buttons to the full-time card
    afterMatch(res, add) {
      const t = myTie();
      if (!res.shootout && res.my === res.their) {
        add('Go to penalties ▸', () => FC.startMatch({ role: 'local', home: cup.you, away: t.a === cup.you ? t.b : t.a, difficulty: cup.difficulty, shootout: true, cup: true, carry: res }), true);
        return;
      }
      const youA = t.a === cup.you, base = res.carry || res;
      t.ga = youA ? base.my : base.their; t.gb = youA ? base.their : base.my;
      if (res.shootout) { t.pa = youA ? res.soMy : res.soTheir; t.pb = youA ? res.soTheir : res.soMy; }
      const won = res.shootout ? res.soMy > res.soTheir : res.my > res.their;
      t.winner = won ? cup.you : (youA ? t.b : t.a);
      if (!won) { cup.out = true; cup.outRound = cup.round; }
      completeRound();
      if (won && cup.champion === cup.you) add('Lift the trophy ▸', () => trophy(cup.you), true);
      else add(won ? 'Continue in the cup ▸' : 'See the bracket ▸', showBracket, true);
    },
  };
  FC.Shootout = {
    start(you, them, difficulty) { FC.startMatch({ role: 'local', home: you, away: them, difficulty, shootout: true }); },
  };
})();
