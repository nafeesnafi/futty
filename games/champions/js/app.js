// App shell: menus, team select, match loop, HUD, radar, results.
// Roles: 'demo' (attract mode behind the menu), 'local' (vs bot), 'host' and 'guest' (online, see net.js).
var FC = window.FC = window.FC || {};

(() => {
  const $ = id => document.getElementById(id);
  const STEP = 1 / 60;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  };

  const S = {
    role: 'demo', match: null, cfg: null, myTeam: 0, paused: false, acc: 0,
    view: null, hud: null, kits: null, ended: false, history: [], goalAt: 0, goalScorer: -1,
    pick: { you: store.get('fsg.champions.you', 5), them: store.get('fsg.champions.them', 20), side: 'you' },
    diff: 'normal', halfSeconds: 180,
  };

  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  FC.Input.bindTouch($('touch'));

  // ---------- helpers ----------
  function kitCss(k) {
    const a = k.shirt, b = k.shirt2;
    switch (k.pattern) {
      case 'stripes': return `repeating-linear-gradient(90deg, ${a} 0 22%, ${b} 22% 40%)`;
      case 'hoops': return `repeating-linear-gradient(180deg, ${a} 0 20%, ${b} 20% 38%)`;
      case 'halves': return `linear-gradient(90deg, ${a} 50%, ${b} 50%)`;
      case 'band': return `linear-gradient(90deg, ${a} 38%, ${b} 38% 62%, ${a} 62%)`;
      case 'sash': return `linear-gradient(135deg, ${a} 38%, ${b} 38% 62%, ${a} 62%)`;
      case 'sleeves': return `linear-gradient(90deg, ${b} 18%, ${a} 18% 82%, ${b} 82%)`;
      default: return `linear-gradient(180deg, ${b} 0 10%, ${a} 10%)`;
    }
  }
  FC.kitCss = kitCss;

  const screens = ['scrTitle', 'scrTeams', 'scrOnline', 'scrControls', 'scrPause', 'scrFull', 'scrCup', 'scrTrophy'];
  function show(id) {
    for (const s of screens) $(s).classList.toggle('hidden', s !== id);
    const inMatch = !id && S.role !== 'demo';
    const matchRole = S.role === 'local' || S.role === 'host' || S.role === 'guest';
    $('hud').classList.toggle('hidden', !(matchRole && (!id || id === 'scrPause' || id === 'scrFull')));
    document.body.classList.toggle('playing', inMatch);
    FC.Input.enable(inMatch);
  }
  FC.show = show;

  let bannerT = null;
  function banner(big, small, ms = 2200) {
    $('bnBig').textContent = big; $('bnSmall').textContent = small || '';
    $('banner').classList.add('show');
    clearTimeout(bannerT); bannerT = setTimeout(() => $('banner').classList.remove('show'), ms);
  }
  function hint(text) {
    const h = $('hint');
    if (text) { h.textContent = text; h.classList.add('show'); } else h.classList.remove('show');
  }

  // ---------- record ----------
  function renderRecord() {
    $('cupSub').textContent = FC.Cup && FC.Cup.inProgress() ? 'Resume your cup run' : '16-club knockout';
    const r = store.get('fsg.champions', null);
    $('record').textContent = r ? `Your record: ${r.p} played · ${r.w} W · ${r.d} D · ${r.l} L` : 'No matches played yet';
  }
  function saveResult(my, their) {
    const r = store.get('fsg.champions', { p: 0, w: 0, d: 0, l: 0 });
    r.p++; r[my > their ? 'w' : my < their ? 'l' : 'd']++;
    store.set('fsg.champions', r);
  }

  // ---------- team select ----------
  function sideCard(el, idx, label) {
    const t = FC.TEAMS[idx];
    el.querySelector('.shirt').style.background = kitCss(t.kit);
    el.querySelector('.lbl').textContent = label;
    el.querySelector('.nm').textContent = t.name;
    el.querySelector('.rt').textContent = `${t.country} · Overall ${t.rating}`;
  }
  function renderTeams() {
    sideCard($('sideYou'), S.pick.you, 'You');
    sideCard($('sideThem'), S.pick.them, 'Opponent');
    $('sideYou').classList.toggle('picking', S.pick.side === 'you');
    $('sideThem').classList.toggle('picking', S.pick.side === 'them');
    const q = $('search').value.trim().toLowerCase();
    const grid = $('clubGrid'); grid.innerHTML = '';
    FC.TEAMS.forEach((t, i) => {
      if (q && !(t.name.toLowerCase().includes(q) || t.country.toLowerCase().includes(q) || t.short.toLowerCase().includes(q))) return;
      const b = document.createElement('button');
      b.className = 'club' + (i === S.pick.you ? ' sel-you' : '') + (i === S.pick.them ? ' sel-them' : '');
      b.innerHTML = `<span class="shirt" style="background:${kitCss(t.kit)}"></span><div><div class="cn"></div><div class="cm">${t.country} · ${t.rating}</div></div>`;
      b.querySelector('.cn').textContent = t.name;
      b.addEventListener('click', () => {
        S.pick[S.pick.side] = i;
        if (S.pick.side === 'you' && !S.onlinePick && S.pickMode !== 'cup') S.pick.side = 'them';
        store.set('fsg.champions.you', S.pick.you); store.set('fsg.champions.them', S.pick.them);
        renderTeams();
        if (S.onlinePick) S.onlinePick(i);
      });
      grid.appendChild(b);
    });
  }
  $('sideYou').addEventListener('click', () => { S.pick.side = 'you'; renderTeams(); });
  $('sideThem').addEventListener('click', () => { S.pick.side = 'them'; renderTeams(); });
  $('search').addEventListener('input', renderTeams);
  $('btnRandom').addEventListener('click', () => {
    let r; do r = (Math.random() * FC.TEAMS.length) | 0; while (r === S.pick.you);
    S.pick.them = r; renderTeams();
  });
  for (const [segId, key, num] of [['segDiff', 'diff', false], ['segLen', 'halfSeconds', true]]) {
    for (const b of $(segId).querySelectorAll('button')) b.addEventListener('click', () => {
      for (const x of $(segId).querySelectorAll('button')) x.classList.toggle('on', x === b);
      S[key] = num ? +b.dataset.v : b.dataset.v;
    });
  }

  // team picker reused by the online lobby: only "you" is chosen there
  FC.openTeamPicker = (title, onPick, onBack) => {
    S.onlinePick = onPick; S.pick.side = 'you';
    $('teamsTitle').textContent = title;
    $('sideThem').classList.add('hidden'); document.querySelector('.vs').classList.add('hidden');
    $('botOpts').classList.add('hidden'); $('btnKickoff').textContent = 'Done ▸';
    S.teamsBack = onBack;
    renderTeams(); show('scrTeams');
  };
  // mode: 'match' (vs bot), 'shootout' (you vs opponent, no match length) or 'cup' (just your club)
  function openModePicker(mode = 'match') {
    S.onlinePick = null; S.teamsBack = null; S.pickMode = mode;
    $('teamsTitle').textContent = mode === 'cup' ? 'Champions Cup: choose your club' : mode === 'shootout' ? 'Penalty shootout' : 'Choose your clubs';
    const solo = mode === 'cup';
    $('sideThem').classList.toggle('hidden', solo); document.querySelector('.vs').classList.toggle('hidden', solo);
    $('btnRandom').classList.toggle('hidden', solo);
    $('botOpts').classList.remove('hidden');
    $('segLen').parentElement.classList.toggle('hidden', mode === 'shootout');
    $('btnKickoff').textContent = mode === 'cup' ? 'Start the cup ▸' : mode === 'shootout' ? 'To the spot ▸' : 'Kick Off ▸';
    S.pick.side = 'you';
    renderTeams(); show('scrTeams');
  }
  const openBotPicker = () => openModePicker('match');
  FC.openModePicker = openModePicker;
  FC.pickedTeam = () => S.pick.you;

  $('btnBot').addEventListener('click', () => { FC.Audio.unlock(); openBotPicker(); });
  $('btnControls').addEventListener('click', () => FC.Controls.open('scrTitle'));
  $('btnPauseControls').addEventListener('click', () => FC.Controls.open('scrPause'));
  $('teamsBack').addEventListener('click', () => { if (S.teamsBack) S.teamsBack(); else show('scrTitle'); });
  $('btnKickoff').addEventListener('click', () => {
    if (S.onlinePick) { if (S.teamsBack) S.teamsBack(); return; }
    if (S.pickMode === 'cup') { FC.Cup.start(S.pick.you, S.diff, S.halfSeconds); return; }
    if (S.pickMode === 'shootout') { FC.Shootout.start(S.pick.you, S.pick.them, S.diff); return; }
    startMatch({ role: 'local', home: S.pick.you, away: S.pick.them, difficulty: S.diff, halfSeconds: S.halfSeconds });
  });
  $('btnCup').addEventListener('click', () => { FC.Audio.unlock(); FC.Cup.open(); });
  $('btnShootout').addEventListener('click', () => { FC.Audio.unlock(); openModePicker('shootout'); });
  $('btnOnline').addEventListener('click', () => { FC.Audio.unlock(); if (FC.Net) FC.Net.open(); });
  if (!FC.Net) { $('btnOnline').disabled = true; $('btnOnline').querySelector('small').textContent = 'Coming soon'; }

  // ---------- match control ----------
  function startMatch(cfg) {
    S.cfg = cfg; S.role = cfg.role; S.ended = false; S.paused = false; S.acc = 0; S.history = []; S.goalAt = 0;
    S.myTeam = cfg.role === 'guest' ? 1 : 0;
    S.kits = FC.pickKits(cfg.home, cfg.away);
    FC.Render.setTeams(S.kits);
    const H = FC.TEAMS[cfg.home], A = FC.TEAMS[cfg.away];
    $('sbH').textContent = H.short; $('sbA').textContent = A.short;
    $('sbKitH').style.background = kitCss(S.kits[0]); $('sbKitA').style.background = kitCss(S.kits[1]);
    if (cfg.role === 'guest') { S.match = null; S.view = null; S.hud = null; }
    else {
      const controllers = cfg.role === 'demo' ? [{ type: 'ai', difficulty: 'hard' }, { type: 'ai', difficulty: 'hard' }]
        : cfg.role === 'local' ? [{ type: 'human' }, { type: 'ai', difficulty: cfg.difficulty }]
        : [{ type: 'human' }, { type: 'human' }];
      S.match = new FC.Match({ home: cfg.home, away: cfg.away, halfSeconds: cfg.halfSeconds, controllers, shootout: !!cfg.shootout });
      S.view = S.match.view(); S.hud = S.match.hud();
    }
    if (S.view) FC.Render.snapCamera(Object.assign({}, S.view, { flip: S.myTeam === 1 }));
    $('netStat').classList.toggle('hidden', !(cfg.role === 'host' || cfg.role === 'guest'));
    if (cfg.role !== 'demo') {
      show(null); FC.Audio.startCrowd(); FC.Audio.whistle(true);
      if (cfg.shootout) banner('PENALTIES', `${H.name} vs ${A.name}`, 2600);
      else banner(`${H.short} v ${A.short}`, cfg.role === 'local' ? `${H.name} vs ${A.name} · ${cfg.difficulty}` : `${H.name} vs ${A.name}`, 2600);
      $('soBoard').classList.toggle('hidden', !cfg.shootout);
      $('radar').classList.toggle('hidden', !!cfg.shootout);
    }
  }
  FC.startMatch = startMatch;

  function startDemo() {
    let a = (Math.random() * 36) | 0, b; do b = (Math.random() * 36) | 0; while (b === a);
    startMatch({ role: 'demo', home: a, away: b, halfSeconds: 600 });
  }
  FC.toMenu = () => { hint(''); FC.Audio.stopCrowd(); startDemo(); renderRecord(); show('scrTitle'); };

  function pause(on) {
    if (S.role !== 'local' && S.role !== 'host' && S.role !== 'guest') return;
    if (S.ended) return;
    const online = S.role !== 'local';
    S.paused = on && !online;   // online matches keep running; the menu is just an overlay
    $('scrPause').querySelector('h2').textContent = online ? 'Match menu' : 'Paused';
    $('btnRestart').classList.toggle('hidden', online);
    $('btnQuit').textContent = online ? 'Leave match' : 'Quit to menu';
    if (on) show('scrPause'); else show(null);
  }
  $('btnResume').addEventListener('click', () => pause(false));
  $('btnRestart').addEventListener('click', () => startMatch(S.cfg));
  $('btnQuit').addEventListener('click', () => { if (S.role === 'host' || S.role === 'guest') FC.Net.leave(); FC.toMenu(); });
  $('touchPause').addEventListener('click', () => pause(true));
  $('touchTac').addEventListener('click', () => {
    const cur = S.hud && S.hud.mentality ? S.hud.mentality[S.myTeam] : 1;
    const act = { a: 'mentality', m: (cur + 1) % 3 };
    if (S.role === 'guest') FC.Net.sendAction(act); else if (S.match) S.match.queueAction(S.myTeam, act);
  });
  // pause / mute keys are rebindable (see FC.Input); they work in a match and on the pause screen
  FC.Input.onPause(() => {
    if (!$('scrPause').classList.contains('hidden')) pause(false);
    else if (document.body.classList.contains('playing')) pause(true);
  });
  FC.Input.onMute(() => { const m = FC.Audio.toggleMute(); hint(m ? 'Sound off' : 'Sound on'); setTimeout(() => hint(''), 1200); });
  const K = a => FC.Input.label(a);

  // screen-space stick → pitch direction (camera is on the +z side; flipped for the away player online)
  function toWorld(x, y) { const f = S.myTeam === 1 ? -1 : 1; return { x: x * f, z: -y * f }; }

  FC.Input.onAction(a => {
    const inp = FC.Input.poll(), w = toWorld(inp.x, inp.y);
    const act = { a: a.a, power: a.power, x: w.x, z: w.z, m: a.m };
    if (S.role === 'guest') FC.Net.sendAction(act);
    else if (S.match && !S.paused) S.match.queueAction(S.myTeam, act);
  });

  // ---------- events → sound / banners ----------
  function handleEvents(evs) {
    for (const e of evs) {
      FC.Render.onEvent(e, S.view);
      if (e.e === 'goal' && S.role !== 'demo') { S.goalAt = performance.now() / 1000; S.goalScorer = e.id; }
      switch (e.e) {
        case 'kick': FC.Audio.kick(e.power); break;
        case 'post': FC.Audio.post(); break;
        case 'nearmiss': if (S.role !== 'demo') FC.Audio.nearMiss(); break;
        case 'save': FC.Audio.save(); break;
        case 'tackle': if (e.ok) FC.Audio.tackle(); break;
        case 'whistle': if (S.role !== 'demo') FC.Audio.whistle(e.short ? false : true); break;
        case 'goal': {
          if (S.role === 'demo') break;
          FC.Audio.goal();
          const t = FC.TEAMS[e.team === 0 ? S.cfg.home : S.cfg.away];
          const hud = S.hud;
          const num = e.id >= 0 ? `#${FC.NUMBERS[e.id % 11]}` : 'Own goal';
          banner(e.own ? 'OWN GOAL' : 'GOAL!', `${t.name} · ${num} · ${e.minute}'  ·  ${hud ? hud.score.join(' – ') : ''}`, 3000);
          (S.scorers = S.scorers || []).push(e);
          break;
        }
        case 'half': if (S.role !== 'demo') { FC.Audio.whistle('full'); banner('HALF-TIME', scoreLine(), 2800); } break;
        case 'full': if (S.role === 'demo') { startDemo(); } else { FC.Audio.whistle('full'); endMatch(); } break;
        case 'restart': {
          if (S.role === 'demo') break;
          const names = { throw: 'Throw-in', corner: 'Corner', goalkick: 'Goal kick', freekick: 'Free kick', ifk: 'Indirect free kick', penalty: 'Penalty' };
          const mine = e.team === S.myTeam;
          const t = FC.TEAMS[e.team === 0 ? S.cfg.home : S.cfg.away];
          if (e.type === 'penalty') banner('PENALTY!', t.name, 2200);
          hint(mine ? `Your ${names[e.type].toLowerCase()}: aim and press Pass (${K('pass')})` : `${names[e.type]} to ${t.name}`);
          break;
        }
        case 'foul': if (S.role !== 'demo') FC.Audio.whistle(false); break;
        case 'pen': {
          const t = teamOf(e.team);
          if (e.result === 'goal') { FC.Audio.net(); FC.Audio.cheer(); banner('SCORED', `${t.name} · ${e.goals.join(' – ')}`, 1600); }
          else { FC.Audio.nearMiss(); banner(e.result === 'save' ? 'SAVED!' : 'MISSED', `${t.name} · ${e.goals.join(' – ')}`, 1600); }
          break;
        }
        case 'mentality':
          if (e.team === S.myTeam && S.role !== 'demo') { hint(`Mentality: ${['Defensive', 'Balanced', 'Attacking'][e.m]}`); lastHint = performance.now(); }
          break;
        case 'offside': if (S.role !== 'demo') { FC.Audio.whistle(false); banner('OFFSIDE', `${teamOf(e.team).name} #${FC.NUMBERS[e.id % 11]}`, 1800); } break;
        case 'card': {
          if (S.role === 'demo') break;
          const col = e.color === 'red' ? 'RED CARD' : 'YELLOW CARD';
          banner(col, `${teamOf(e.team).name} #${FC.NUMBERS[e.id % 11]}${e.second ? ' · second yellow' : ''}${e.color === 'red' ? ' · sent off' : ''}`, 2600);
          $('bnBig').style.color = e.color === 'red' ? '#ff4d4d' : '#ffd23f';
          setTimeout(() => ($('bnBig').style.color = ''), 2700);
          break;
        }
      }
    }
  }
  FC.handleEvents = handleEvents;

  function teamOf(t) { return FC.TEAMS[t === 0 ? S.cfg.home : S.cfg.away]; }

  function scoreLine() {
    const h = S.hud; if (!h || !S.cfg) return '';
    return `${FC.TEAMS[S.cfg.home].short} ${h.score[0]} – ${h.score[1]} ${FC.TEAMS[S.cfg.away].short}`;
  }

  function endMatch() {
    if (S.ended) return;
    S.ended = true;
    hint('');
    const h = S.hud, cfg = S.cfg;
    const H = FC.TEAMS[cfg.home], A = FC.TEAMS[cfg.away];
    const so = h.so;
    const my = h.score[S.myTeam], their = h.score[1 - S.myTeam];
    const soMy = so ? so.goals[S.myTeam] : 0, soTheir = so ? so.goals[1 - S.myTeam] : 0;
    if (so) saveResult(soMy, soTheir); else if (!(cfg.cup && my === their)) saveResult(my, their);
    const won = so ? soMy > soTheir : my > their, lost = so ? soMy < soTheir : my < their;
    $('ftLabel').textContent = (so ? 'Penalties' : 'Full time') + (won ? ' · You win' : lost ? ' · You lose' : ' · Draw');
    $('ftH').textContent = H.name; $('ftA').textContent = A.name;
    $('ftScore').textContent = so ? `${so.goals[0]} – ${so.goals[1]}` : `${h.score[0]} – ${h.score[1]}`;
    $('ftScorers').textContent = (S.scorers || []).map(e => `${FC.TEAMS[e.team === 0 ? cfg.home : cfg.away].short} ${e.id >= 0 ? '#' + FC.NUMBERS[e.id % 11] : 'OG'} ${e.minute}'`).join(' · ') || 'No goals';
    const st = h.stats, poss = st.poss[0] + st.poss[1] || 1;
    const rows = [
      [Math.round(st.poss[0] / poss * 100) + '%', 'Possession', Math.round(st.poss[1] / poss * 100) + '%'],
      [st.shots[0], 'Shots', st.shots[1]], [st.onTarget[0], 'On target', st.onTarget[1]],
      [st.passes[0], 'Passes', st.passes[1]], [st.corners[0], 'Corners', st.corners[1]],
      [st.fouls[0], 'Fouls', st.fouls[1]], [st.offsides[0], 'Offsides', st.offsides[1]],
      [st.yellows[0] + ' / ' + st.reds[0], 'Yellow / red', st.yellows[1] + ' / ' + st.reds[1]],
    ];
    $('ftStats').innerHTML = so ? '' : rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
    if (so) $('ftScorers').textContent = so.taken.map((k, t) => `${teamOf(t).short} ${k.map(r => r === 'g' ? '●' : '○').join(' ')}`).join('   ·   ');
    const btns = $('ftBtns'); btns.innerHTML = '';
    const add = (label, fn, primary) => { const b = document.createElement('button'); b.className = 'mbtn' + (primary ? ' primary' : ''); b.textContent = label; b.onclick = fn; btns.appendChild(b); };
    if (cfg.cup) {
      FC.Cup.afterMatch({ my, their, shootout: !!so, soMy, soTheir, carry: cfg.carry }, (l, fn, p) => add(l, () => { S.scorers = []; fn(); }, p));
    } else if (S.role === 'local') {
      add(so ? 'Again' : 'Rematch', () => { S.scorers = []; startMatch(cfg); }, true);
      add('Change clubs', () => { S.scorers = []; FC.toMenu(); openModePicker(so ? 'shootout' : 'match'); });
    } else if (FC.Net) FC.Net.fullTimeButtons(add);
    add('Main menu', () => { S.scorers = []; if (S.role === 'host' || S.role === 'guest') FC.Net.leave(); FC.toMenu(); });
    show('scrFull');
  }
  FC.endMatch = endMatch;
  FC.resetScorers = () => { S.scorers = []; };

  // ---------- guest hooks (net.js feeds snapshots) ----------
  FC.setGuestState = (view, hud) => { S.view = view; S.hud = hud; };
  FC.state = S;

  // ---------- HUD ----------
  const radar = $('radar'), rg = radar.getContext('2d');
  function drawRadar(view) {
    const W = radar.width, H = radar.height, P = FC.PITCH;
    const flip = S.myTeam === 1 ? -1 : 1;
    const X = x => (x * flip / P.PL + 0.5) * (W - 16) + 8, Y = z => (z * flip / P.PW + 0.5) * (H - 16) + 8;
    rg.clearRect(0, 0, W, H);
    rg.strokeStyle = 'rgba(255,255,255,.5)'; rg.lineWidth = 2;
    rg.strokeRect(8, 8, W - 16, H - 16);
    rg.beginPath(); rg.moveTo(W / 2, 8); rg.lineTo(W / 2, H - 8); rg.stroke();
    rg.beginPath(); rg.arc(W / 2, H / 2, 9.15 / P.PL * (W - 16), 0, 7); rg.stroke();
    for (const s of [-1, 1]) rg.strokeRect(s < 0 ? 8 : W - 8 - 16.5 / P.PL * (W - 16), H / 2 - 20.16 / P.PW * (H - 16), 16.5 / P.PL * (W - 16), 40.32 / P.PW * (H - 16));
    view.players.forEach((p, i) => {
      const team = i < 11 ? 0 : 1;
      rg.fillStyle = team === S.myTeam ? '#38bdf8' : '#ff5d5d';
      rg.beginPath(); rg.arc(X(p.x), Y(p.z), 7, 0, 7); rg.fill();
    });
    for (let t = 0; t < 2; t++) {
      const a = view.active[t];
      if (a >= 0) { const p = view.players[a]; rg.strokeStyle = '#fff'; rg.lineWidth = 3; rg.beginPath(); rg.arc(X(p.x), Y(p.z), 12, 0, 7); rg.stroke(); }
    }
    rg.fillStyle = '#fff'; rg.beginPath(); rg.arc(X(view.ball.x), Y(view.ball.z), 5, 0, 7); rg.fill();
  }

  let lastHint = 0;
  function updateHud() {
    const h = S.hud; if (!h) return;
    $('sbScore').textContent = `${h.score[0]} - ${h.score[1]}`;
    const reds = h.reds || [0, 0];
    $('sbRedH').textContent = '▮'.repeat(reds[0]); $('sbRedA').textContent = '▮'.repeat(reds[1]);
    // aiming a free kick / penalty
    const sp = h.setpiece, aiming = sp && sp.interactive && sp.team === S.myTeam && h.phase === 'setpiece';
    if (aiming && performance.now() - lastHint > 300) {
      const curl = sp.curl === 0 ? 'none' : sp.curl > 0 ? 'bends right' : 'bends left';
      hint(`Aim with the stick or ${K('up')}${K('left')}${K('down')}${K('right')} · Curl (${K('switch')}): ${curl} · hold Shoot (${K('shoot')}) for power${sp.type === 'penalty' ? '' : ` · Pass (${K('pass')}) to play it short`}`);
      lastHint = performance.now();
    }
    $('sbClock').textContent = h.so ? 'PENS' : h.phase === 'halftime' ? 'HT' : h.phase === 'fulltime' ? 'FT' : `${h.minute}'`;
    const m = h.mentality ? h.mentality[S.myTeam] : 1, mName = ['DEF', 'BAL', 'ATT'][m];
    $('sbMent').textContent = mName; $('sbMent').className = 'sb-ment ' + mName.toLowerCase(); $('touchTac').textContent = mName;
    const stam = h.stamina ? h.stamina[S.myTeam] : null;
    $('stamina').classList.toggle('hidden-bar', stam == null || !!h.so);
    if (stam != null) $('staminaFill').style.width = Math.round(stam * 100) + '%';
    if (h.so) {
      $('soBoard').innerHTML = [0, 1].map(t => `<span>${teamOf(t).short}</span><span class="dots">${Array.from({ length: Math.max(5, h.so.taken[t].length) }, (_, i) => `<span class="dot ${h.so.taken[t][i] || ''}"></span>`).join('')}</span><span>${h.so.goals[t]}</span>`).join('');
    }
    const keeping = sp && sp.type === 'penalty' && sp.gkHuman && sp.team !== S.myTeam && h.phase === 'setpiece';
    if (keeping && performance.now() - lastHint > 300) { hint('You are in goal: hold left or right as the kick is taken to dive'); lastHint = performance.now(); }
    const charging = FC.Input.charging();
    $('power').classList.toggle('show', charging);
    $('powerFill').style.width = (FC.Input.chargeLevel() * 100) + '%';
    if (h.phase === 'kickoff' && h.setpiece && h.setpiece.team === S.myTeam && performance.now() - lastHint > 400) {
      hint(`Your kick-off: press Pass (${K('pass')}) to start`);
      lastHint = performance.now();
    } else if (h.phase === 'play' && $('hint').classList.contains('show') && performance.now() - lastHint > 2500) {
      hint(''); lastHint = performance.now();
    }
  }

  // ---------- main loop ----------
  FC.Render.init($('stage'));
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (S.role === 'guest') {
      if (FC.Net) {
        const inp = FC.Input.poll(), w = toWorld(inp.x, inp.y);
        FC.Net.guestTick(dt, w.x, w.z, inp.sprint, inp.shield);
      }
    } else if (S.match && !S.paused) {
      if (S.role !== 'demo') {
        const inp = document.body.classList.contains('playing') ? FC.Input.poll() : { x: 0, y: 0, sprint: false };
        const w = toWorld(inp.x, inp.y);
        S.match.setInput(S.myTeam, w.x, w.z, inp.sprint, inp.shield);
      }
      S.acc += dt;
      let n = 0;
      while (S.acc >= STEP && n < 8) { S.match.step(STEP); S.acc -= STEP; n++; }
      if (n === 8) S.acc = 0;
      S.view = S.match.view(); S.hud = S.match.hud();
      const evs = S.match.takeEvents();
      handleEvents(evs);
      if (S.role === 'host' && FC.Net) FC.Net.hostTick(dt, S.view, S.hud, evs);
    }
    if (S.view) {
      const sp = S.hud && S.hud.setpiece;
      const facing = sp && sp.type === 'penalty' && sp.gkHuman && sp.team !== S.myTeam;   // you're the keeper
      const fk = sp && (sp.interactive && sp.team === S.myTeam || facing) && S.hud.phase === 'setpiece' && S.role !== 'demo'
        ? { gx: (sp.team === 0 ? 1 : -1) * FC.PITCH.HL, aimZ: facing ? 0 : sp.aim.z, aimY: facing ? -5 : sp.aim.y } : null;
      // goal: ~2 s orbit around the scorer, then a slow-motion replay of the build-up
      const nowS = performance.now() / 1000;
      let shown = S.view, extra = {};
      if (S.goalAt && S.hud && S.hud.phase !== 'goal' && nowS - S.goalAt > 1) S.goalAt = 0;
      const age = S.goalAt ? nowS - S.goalAt : -1;
      if (age >= 0 && age < 2) {
        const q = S.goalScorer >= 0 ? S.view.players[S.goalScorer] : S.view.ball;
        extra.celebrate = { x: q.x, z: q.z };
      } else if (age >= 2 && S.history.length) {
        const t = S.goalAt - 2.6 + (age - 2) * 0.55;
        let i = S.history.findIndex(h => h.t >= t); if (i < 0) i = S.history.length - 1;
        shown = S.history[i].view; extra.replay = true;
      } else if (!S.goalAt) {
        S.history.push({ t: nowS, view: S.view });
        while (S.history.length && S.history[0].t < nowS - 4) S.history.shift();
      }
      $('replayTag').classList.toggle('show', !!extra.replay);
      // crowd noise follows danger: how close the ball is to either goal while play is live
      if (S.role !== 'demo') {
        const bb = S.view.ball, HLp = FC.PITCH.HL;
        const near = Math.min(Math.hypot(bb.x - HLp, bb.z), Math.hypot(bb.x + HLp, bb.z));
        const live = S.hud && (S.hud.phase === 'play' || S.hud.phase === 'setpiece');
        FC.Audio.update(dt, live ? Math.max(0, Math.min(1, 1 - (near - 8) / 30)) : 0);
      }
      FC.Render.draw(Object.assign({}, shown, extra, { flip: S.myTeam === 1, fk, active: S.role === 'demo' || extra.replay ? [-1, -1] : shown.active }), dt);
      if (S.role !== 'demo') { updateHud(); drawRadar(S.view); }
    }
    requestAnimationFrame(frame);
  }
  if (window.FC_TEST_HOOK) window.FC_TEST_HOOK(S);
  startDemo(); renderRecord(); show('scrTitle');
  requestAnimationFrame(frame);
})();
