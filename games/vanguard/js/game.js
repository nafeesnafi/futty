// Main loop and match flow: renderer, input, bullets & damage, scoring, killstreaks, spawns, menus.
(function () {
  const VG = window.VG;
  const P = VG.Phys, A = VG.Audio, FX = VG.FX, HUD = VG.HUD;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
  };
  const AIRSTRIKE = { id: 'air', name: 'Airstrike', icon: '✈' };
  const v1 = new THREE.Vector3();

  const G = VG.Game = {
    settings: Object.assign({ mode: 'ffa', bots: 6, diff: 1, sens: 1, fov: 80, gfx: 1 }, store.get('fsg.vanguard.settings', {})),
    running: false, paused: false, ended: false, built: false, showFps: false, fps: 60,
    killGoal: 30, timeScale: 1, now: 0,
  };

  // ---------- renderer & scenes ----------
  const canvas = $('view');
  let renderer;
  function setupRenderer() {
    const gfx = +G.settings.gfx;
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: gfx > 0, powerPreference: 'high-performance' });
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, [1, 1.25, 2][gfx]));
    document.body.classList.toggle('lowfx', gfx === 0);
    renderer.setSize(innerWidth, innerHeight);
    const sh = gfx > 0;
    if (renderer.shadowMap.enabled !== sh) {
      renderer.shadowMap.enabled = sh;
      if (G.scene) G.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    }
    if (G.sun) {
      const size = gfx === 2 ? 4096 : 2048;
      if (G.sun.shadow.mapSize.x !== size) { G.sun.shadow.mapSize.set(size, size); if (G.sun.shadow.map) { G.sun.shadow.map.dispose(); G.sun.shadow.map = null; } }
    }
  }

  // camera + viewmodel scene are shared by every mode; levels swap G.scene
  function buildCore() {
    if (G.camera) return;
    G.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 900);
    // viewmodel scene, rendered on top after clearing depth so guns never clip into walls
    G.vmScene = new THREE.Scene();
    G.vmCamera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.01, 10);
    G.vmScene.add(new THREE.HemisphereLight(0xe0ecff, 0x6a5c4c, 2.2));
    const key = new THREE.DirectionalLight(0xfff0d6, 2.2); key.position.set(0.6, 1, 0.4); G.vmScene.add(key);
    G.vmRoot = new THREE.Group(); G.vmScene.add(G.vmRoot);
  }
  G.buildCore = buildCore;
  G.setupRenderer = () => setupRenderer();
  G.store = store;
  function buildWorld() {
    buildCore();
    const scene = G.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xb8b6a8, 60, 260);
    scene.background = new THREE.Color(0xb8b6a8);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.MeshBasicMaterial({ map: VG.Tex.sky(), side: THREE.BackSide, fog: false, depthWrite: false }));
    scene.add(sky);
    scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x7a6a55, 1.6));
    scene.add(new THREE.AmbientLight(0xfff6e8, 0.55));
    const sun = G.sun = new THREE.DirectionalLight(0xfff0d6, 2.8);
    sun.position.set(38, 75, 22); sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    const sc = sun.shadow.camera; sc.left = -64; sc.right = 64; sc.top = 64; sc.bottom = -64; sc.near = 10; sc.far = 190;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
    scene.add(sun); scene.add(sun.target);
    scene.add(G.camera);

    const info = VG.Map.build(scene, +G.settings.gfx);
    G.spawns = info.spawns;
    VG.Nav.build(info.bounds);
    FX.init(scene);
    G.built = 'compound';
  }

  // ---------- input ----------
  const input = G.input = { down: {}, pressed: {}, mouse: [false, false, false], wheel: 0, stick: null };
  // phones / tablets: no pointer lock, touch overlay (touch.js) drives the same input object
  G.touch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && !matchMedia('(pointer: fine)').matches);
  if (G.touch) { G.noLock = true; if (store.get('fsg.vanguard.settings', null) === null) G.settings.gfx = 0; }

  // ---------- key bindings ----------
  // The game logic reads the default codes (KeyW, Mouse0...). A rebound key is translated to the default code
  // of its action, and a default key whose action moved elsewhere is ignored.
  const ACTIONS = [
    ['forward', 'Move forward', 'KeyW'], ['back', 'Move back', 'KeyS'], ['left', 'Move left', 'KeyA'], ['right', 'Move right', 'KeyD'],
    ['sprint', 'Sprint · hold breath', 'ShiftLeft'], ['crouch', 'Crouch / slide (toggle)', 'KeyC'], ['crouchHold', 'Crouch (hold)', 'ControlLeft'],
    ['jump', 'Jump · climb', 'Space'], ['fire', 'Fire', 'Mouse0'], ['ads', 'Aim down sights', 'Mouse2'], ['reload', 'Reload', 'KeyR'],
    ['w1', 'Assault rifle', 'Digit1'], ['w2', 'SMG', 'Digit2'], ['w3', 'Sniper rifle', 'Digit3'],
    ['uav', 'UAV', 'Digit4'], ['air', 'Airstrike', 'Digit5'], ['board', 'Scoreboard (hold)', 'Tab'], ['fps', 'FPS counter', 'KeyF'],
    ['talk', 'Push to talk (online)', 'KeyV'],
    ['light', 'Flashlight (campaign)', 'KeyL'], ['nv', 'Night vision (campaign)', 'KeyN'], ['use', 'Examine (campaign)', 'KeyE'],
  ];
  const DEF = {}; for (const [a, , c] of ACTIONS) DEF[a] = c;
  const DEFAULT_CODES = new Set(Object.values(DEF));
  G.binds = Object.assign({}, DEF, store.get('fsg.vanguard.keys', {}));
  let codeToCanon = new Map();
  function rebuildBinds() {
    codeToCanon = new Map();
    for (const a in G.binds) codeToCanon.set(G.binds[a], DEF[a]);
    store.set('fsg.vanguard.keys', G.binds);
  }
  rebuildBinds();
  const canonOf = (code) => (codeToCanon.has(code) ? codeToCanon.get(code) : DEFAULT_CODES.has(code) ? null : code);
  G.keyName = function (code) {
    if (!code) return '—';
    const m = { Mouse0: 'Left mouse', Mouse1: 'Middle mouse', Mouse2: 'Right mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift',
      ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Space: 'Space', Tab: 'Tab', CapsLock: 'Caps', Backquote: '`',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Backspace: 'Backspace' };
    if (m[code]) return m[code];
    return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
  };
  G.keyLabel = (action) => G.keyName(G.binds[action]).toUpperCase();
  function press(c, down) {
    if (!c) return;
    if (c.startsWith('Mouse')) { input.mouse[+c[5]] = down; return; }
    if (down) {
      if (!input.down[c]) input.pressed[c] = true;
      input.down[c] = true;
      if (c === 'Tab') HUD.showBoard(true);
      if (c === 'KeyF') G.showFps = !G.showFps;
    } else {
      input.down[c] = false;
      if (c === 'Tab' && G.running) HUD.showBoard(false);
    }
  }
  let capture = null; // action waiting for a new key on the controls screen
  function bindTo(action, code) {
    if (typeof action === 'object') action = action.action;
    const prev = G.binds[action];
    for (const a in G.binds) if (a !== action && G.binds[a] === code) G.binds[a] = prev; // swap on conflict
    G.binds[action] = code; capture = null; rebuildBinds(); renderKeys();
    if (VG.Voice) VG.Voice.render();
  }
  addEventListener('keydown', (e) => {
    if (capture) { e.preventDefault(); if (e.code === 'Escape') { capture = null; renderKeys(); } else bindTo(capture, e.code); return; }
    if (!G.running) return;
    const c = canonOf(e.code);
    if (['Tab', 'Space', 'ControlLeft', 'KeyW'].includes(c) || e.code === 'Tab' || e.code === 'Space' || e.ctrlKey || e.altKey) e.preventDefault();
    press(c, true);
  });
  addEventListener('keyup', (e) => { press(canonOf(e.code), false); });
  addEventListener('blur', () => { input.down = {}; input.mouse = [false, false, false]; });
  addEventListener('mousedown', (e) => {
    if (capture && capture.armed) { e.preventDefault(); bindTo(capture.action, 'Mouse' + e.button); }
  }, true);
  canvas.addEventListener('mousedown', (e) => {
    if (!G.running || G.ended) return;
    A.init();
    if (!locked() && !G.noLock) { requestLock(); return; }
    press(canonOf('Mouse' + e.button), true);
    if (G.player && !G.player.alive && G.respawnT <= 0) G.respawnPlayer();
  });
  addEventListener('mouseup', (e) => { press(canonOf('Mouse' + e.button), false); });
  canvas.addEventListener('auxclick', (e) => e.preventDefault());

  function renderKeys() {
    const body = $('keysBody'); if (!body) return;
    body.innerHTML = ACTIONS.map(([a, label]) => {
      const waiting = capture && capture.action === a;
      return `<tr><td>${label}</td><td><button class="keyBtn${waiting ? ' wait' : ''}" data-a="${a}">${waiting ? 'Press a key or button…' : G.keyName(G.binds[a])}</button></td></tr>`;
    }).join('');
    // help table on the main menu mirrors the bindings
    const k = G.keyLabel;
    $('helpRows').innerHTML = [
      ['Move / sprint', `${k('forward')} ${k('left')} ${k('back')} ${k('right')} / ${k('sprint')}`],
      ['Crouch (slide while sprinting)', `${k('crouch')} toggle, or hold ${k('crouchHold')}`],
      ['Jump · climb ladders', `${k('jump')} · ${k('forward')} at a ladder`],
      ['Fire / aim down sights', `${k('fire')} / ${k('ads')}`], ['Reload', k('reload')],
      ['Weapons', `${k('w1')} ${k('w2')} ${k('w3')} or mouse wheel`], ['Killstreaks (UAV / airstrike)', `${k('uav')} / ${k('air')}`],
      ['Hold breath (scoped)', k('sprint')], ['Push to talk (online)', k('talk')], ['Scoreboard · FPS counter', `${k('board')} · ${k('fps')}`], ['Pause', 'ESC'],
    ].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  }
  G.renderKeys = renderKeys;
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.keyBtn'); if (!b) return;
    capture = { action: b.dataset.a, armed: false };
    renderKeys();
    setTimeout(() => { if (capture) capture.armed = true; }, 200); // don't bind the click that opened it
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('wheel', (e) => { if (G.running) input.wheel += Math.sign(e.deltaY); }, { passive: true });
  addEventListener('mousemove', (e) => {
    if (!G.running || G.paused || G.ended || G.touch || !(locked() || G.noLock)) return;
    // guard against the occasional huge jump some browsers report right after locking
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    G.player.look(e.movementX, e.movementY);
  });
  const locked = () => document.pointerLockElement === canvas;
  function requestLock() {
    try {
      const r = canvas.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => { try { canvas.requestPointerLock(); } catch (_) { G.noLock = true; } });
    } catch (_) { try { canvas.requestPointerLock(); } catch (__) { G.noLock = true; } }
  }
  document.addEventListener('pointerlockchange', () => {
    if (!G.running || G.ended) return;
    if (locked()) setPaused(false);
    else if (!G.noLock) setPaused(true);
  });
  document.addEventListener('pointerlockerror', () => {
    // online matches start from a network message (no click), so ask for a click instead of giving up on the lock
    if (G.online && !G.touch) { setPaused(true); return; }
    G.noLock = true; setPaused(false);
  });
  G.setPaused = (p) => setPaused(p);
  G.requestLock = () => requestLock();
  function setPaused(p) {
    G.paused = p;
    $('pause').classList.toggle('hidden', !p);
    input.down = {}; input.mouse = [false, false, false]; input.stick = null;
    if (G.onPauseChange) G.onPauseChange(p);
  }

  // ---------- teams / helpers ----------
  G.hostile = (a, b) => {
    if (a === b) return false;
    // campaign: civilians can be hit by the player (that is the point) but are never targets for the AI
    if (G.mode === 'campaign') return a.team !== b.team && !a.civ && (a.isPlayer || !b.civ);
    return G.mode !== 'tdm' || a.team !== b.team;
  };

  G.noise = function (src, radius, gunshot) {
    if (gunshot) src.lastFired = G.now;
    for (const b of G.bots) {
      if (!b.alive || !G.hostile(b, src)) continue;
      const d = b.pos.distanceTo(src.pos);
      if (d < radius) b.hear(src, G.now);
    }
  };

  // ---------- bullets ----------
  G.fireBullet = function (shooter, o, dir, def, tracerFrom, dmgMult, noTracer) {
    const maxD = 260;
    let mult = dmgMult || 1;
    let bestA = null, bestT = maxD, zone = null;
    for (const a of G.actors) {
      if (a === shooter || !a.alive || !G.hostile(shooter, a)) continue;
      const r = P.rayActor(o.x, o.y, o.z, dir.x, dir.y, dir.z, a, bestT);
      if (r) { bestA = a; bestT = r.t; zone = r.zone; }
    }
    const hits = P.raycastAll(o.x, o.y, o.z, dir.x, dir.y, dir.z, maxD);
    let endT = maxD, pens = 0;
    const near = (x, z) => Math.hypot(x - G.camera.position.x, z - G.camera.position.z) < 45;
    for (const h of hits) {
      if (h.t >= bestT) break;
      const x = o.x + dir.x * h.t, y = o.y + dir.y * h.t, z = o.z + dir.z * h.t;
      if (h.box && h.box.pen && pens < 1 && h.tExit - h.t < 1.6) {
        // punch through thin wood: mark entry and exit, lose some damage
        if (near(x, z)) {
          FX.impact(x, y, z, h.n[0], h.n[1], h.n[2], 'wood');
          const t2 = h.tExit; FX.decal(o.x + dir.x * t2, o.y + dir.y * t2, o.z + dir.z * t2, dir.x, dir.y, dir.z);
        }
        mult *= 0.6; pens++; continue;
      }
      endT = h.t; bestA = null;
      if (near(x, z)) { FX.impact(x, y, z, h.n[0], h.n[1], h.n[2], h.mat); if (Math.random() < 0.4) A.impact(h.mat, x, z); }
      break;
    }
    if (bestA) {
      endT = bestT;
      const hx = o.x + dir.x * endT, hy = o.y + dir.y * endT, hz = o.z + dir.z * endT;
      const dmg = VG.damageAt(def, endT, zone) * mult;
      if (shooter.isPlayer) shooter.hits++;
      FX.blood(hx, hy, hz, dir.x, dir.y, dir.z, zone === 'head');
      G.damage(bestA, dmg, shooter, def, zone === 'head', dir, endT);
    }
    const ex = o.x + dir.x * endT, ey = o.y + dir.y * endT, ez = o.z + dir.z * endT;
    if (tracerFrom && !noTracer) FX.tracer(tracerFrom.x, tracerFrom.y, tracerFrom.z, ex, ey, ez);
    // online: everyone else draws the tracer and hears the shot (bots' shots come from the host)
    if (G.net && (shooter.isPlayer || (G.net.isHost() && !(shooter instanceof VG.Remote)))) {
      const f = tracerFrom || o;
      G.net.shot(shooter.id, [f.x, f.y, f.z], [ex, ey, ez], def.id);
    }
    if (!shooter.isPlayer && bestA !== G.player) G.bulletPast([o.x, o.y, o.z], [ex, ey, ez]);
  };

  // supersonic crack when a bullet flies past your head
  G.bulletPast = function (f, e) {
    const p = G.player;
    if (!p || !p.alive) return;
    const dx = e[0] - f[0], dy = e[1] - f[1], dz = e[2] - f[2], len = Math.hypot(dx, dy, dz);
    if (len < 1) return;
    const d = { x: dx / len, y: dy / len, z: dz / len };
    v1.set(p.pos.x - f[0], p.pos.y + p.eye - f[1], p.pos.z - f[2]);
    const t = v1.x * d.x + v1.y * d.y + v1.z * d.z;
    if (t <= 0 || t >= len) return;
    v1.x -= d.x * t; v1.y -= d.y * t; v1.z -= d.z * t;
    if (v1.length() < 1.6) {
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      A.whiz(Math.max(-1, Math.min(1, -(v1.x * rx + v1.z * rz))));
    }
  };

  // ---------- damage, kills, scoring ----------
  G.damage = function (victim, amount, attacker, def, head, dir, dist) {
    if (!victim.alive || G.ended) return;
    if (victim.invuln || (victim.isPlayer && G.cinematic)) return; // story: scripted moments can't be interrupted
    if (G.net && !G.net.isHost()) {
      // guest: report our own hits; the host owns everyone's health
      if (attacker && attacker.isPlayer && victim !== attacker) {
        G.net.hit(victim.id, amount, head, def.id, dir.x, dir.z, dist);
        HUD.hitmarker(head ? 'head' : 'hit');
        if (head) A.headshot(); else A.hitmarker();
      }
      return;
    }
    victim.health -= amount; victim.lastHit = G.now;
    if (victim.immortal && victim.health < 30) victim.health = 30; // story squadmates only die when the story says so
    if (G.net && victim.human) G.net.dmgTo(victim.id, amount, attacker && attacker.id);
    const lethal = victim.health <= 0;
    if (attacker && attacker.isPlayer && victim !== attacker) {
      HUD.hitmarker(lethal ? 'kill' : head ? 'head' : 'hit');
      if (head) A.headshot(); else A.hitmarker();
    }
    if (victim.isPlayer) {
      A.hurt();
      if (attacker && attacker !== victim) HUD.damage(attacker.pos.x, attacker.pos.z);
      FX.shake = Math.max(FX.shake, 0.25);
    }
    if (lethal) G.kill(victim, attacker, def, head, dir, dist);
    else if (!victim.isPlayer) victim.damaged(attacker, G.now);
  };

  // guest: the host told us we were hit
  G.localHurt = function (amount, attacker) {
    const p = G.player; if (!p.alive) return;
    p.health = Math.max(1, p.health - amount); p.lastHit = G.now;
    A.hurt(); FX.shake = Math.max(FX.shake, 0.25);
    if (attacker) HUD.damage(attacker.pos.x, attacker.pos.z);
  };

  G.kill = function (victim, attacker, def, head, dir, dist) {
    G.applyKill(victim, attacker, def, head, dir, dist);
    if (G.net) G.net.kill(victim.id, attacker ? attacker.id : null, def ? def.id : 'ar', head, dir, dist);
    checkWin();
  };
  G.applyKill = function (victim, attacker, def, head, dir, dist) {
    if (!victim.alive && victim.health === 0) return;
    victim.health = 0; victim.alive = false; victim.deaths++;
    victim.streak = 0;
    const p = G.player;
    if (victim.isPlayer) playerDied(attacker);
    else victim.die(dir ? { x: dir.x, z: dir.z } : null);
    const credited = attacker && attacker !== victim;
    if (credited) {
      attacker.kills++; attacker.streak++;
      attacker.score += 100 + (head ? 25 : 0);
      if (G.mode === 'tdm') G.teamKills[attacker.team]++;
      if (attacker.isPlayer) playerKill(victim, def, head, dist);
      if (victim.isPlayer) p.nemesis = attacker;
    } else if (G.mode === 'tdm') { /* suicides don't change team score */ }
    if (credited && attacker.isPlayer && G.net && !G.net.isHost()) { HUD.hitmarker('kill'); }
    G.firstBlood = G.firstBlood || credited;
    if (G.mode === 'campaign') { if (VG.Campaign) VG.Campaign.onKill(victim, attacker, head); return; }
    HUD.killfeed(credited ? attacker : null, victim, def, head);
  };
  G.AIRSTRIKE = AIRSTRIKE;

  function playerKill(victim, def, head, dist) {
    const p = G.player, now = G.now;
    if (G.mode === 'campaign') { // no points, medals or killstreaks in the story
      A.killConfirm();
      for (const id of VG.WEAPON_ORDER) { const d = VG.WEAPONS[id]; p.ammo[id].reserve = Math.min(d.reserve, p.ammo[id].reserve + Math.ceil(d.mag / 2)); }
      return;
    }
    p.bestStreak = Math.max(p.bestStreak, p.streak);
    if (head) p.headshots++;
    A.killConfirm();
    HUD.popup('ENEMY ELIMINATED', 100);
    if (head) { HUD.popup('HEADSHOT', 25); }
    // scavenger: one magazine back per kill
    for (const id of VG.WEAPON_ORDER) { const d = VG.WEAPONS[id]; p.ammo[id].reserve = Math.min(d.reserve * 1.5, p.ammo[id].reserve + d.mag); }
    // medals
    p.multi = now - (p.lastKill || -99) < 4.5 ? (p.multi || 1) + 1 : 1;
    p.lastKill = now;
    const medal = (name, pts, say) => { p.score += pts; HUD.popup(name, pts, true); if (say) A.announce(say); };
    if (!G.firstBlood) medal('FIRST BLOOD', 50);
    if (dist > 40 && def && def.id !== 'air') medal('LONGSHOT', 50);
    if (victim === p.nemesis) { medal('REVENGE', 50); p.nemesis = null; }
    if (p.multi === 2) { medal('DOUBLE KILL', 50); HUD.banner('DOUBLE KILL', '+50'); A.announce('Double kill'); }
    else if (p.multi === 3) { medal('TRIPLE KILL', 75); HUD.banner('TRIPLE KILL', '+75'); A.announce('Triple kill'); }
    else if (p.multi >= 4) { medal('FURY KILL', 100); HUD.banner('FURY KILL', '+100'); A.announce('Fury kill'); }
    else if (head) HUD.banner('HEADSHOT', '+25');
    // killstreaks
    if (p.streak === 3 && !G.uavEarned) { G.uavEarned = true; G.uavReady = true; HUD.banner('UAV READY', G.touch ? 'TAP UAV' : `PRESS [${G.keyLabel('uav')}]`); A.announce('U A V ready'); }
    if (p.streak === 5 && !G.airEarned) { G.airEarned = true; G.airReady = true; HUD.banner('AIRSTRIKE READY', G.touch ? 'TAP AIRSTRIKE' : `PRESS [${G.keyLabel('air')}]`); A.announce('Airstrike ready'); }
  }

  function playerDied(killer) {
    const p = G.player;
    p.alive = false; G.respawnT = 3;
    G.uavEarned = false; G.airEarned = false; // streak rewards reset on death (earned-but-unused ones stay)
    G.deathCam = { killer: killer && killer !== p ? killer : null, t: 0, y: G.camera.position.y };
    HUD.setDeath(true, killer && killer !== p ? killer.name : null);
    p.reload = null; p.ads = 0;
    G.vmRoot.visible = false;
  }

  G.respawnPlayer = function (sx, sz, syaw) {
    const p = G.player;
    if (sx === undefined && G.net && !G.net.isHost()) return; // guests wait for the host to place them
    if (sx === undefined && G.mode === 'campaign' && VG.Campaign) { // back to the last checkpoint
      const c = VG.Campaign.checkpoint();
      p.reset(); p.pos.set(c.x, c.y || 0, c.z); p.yaw = c.yaw; p.pitch = 0;
      HUD.setDeath(false); G.deathCam = null; VG.Campaign.onRespawn();
      return;
    }
    const [x, z, yaw] = sx === undefined ? pickSpawn(p) : [sx, sz, syaw];
    p.reset(); p.pos.set(x, 0, z); p.yaw = yaw; p.pitch = 0;
    HUD.setDeath(false); G.deathCam = null;
  };
  // host: a player left mid-match, a bot takes over their soldier (same id, so everyone keeps their puppet)
  G.replaceWithBot = function (id) {
    const old = G.byId.get(id); if (!old || old.isPlayer) return;
    const b = new VG.Bot(G, old.name, old.team, G.actors.indexOf(old));
    b.id = id; b.kills = old.kills; b.deaths = old.deaths; b.score = old.score;
    G.scene.remove(old.model);
    G.remotes = G.remotes.filter(r => r !== old); G.bots.push(b);
    G.actors[G.actors.indexOf(old)] = b; G.byId.set(id, b);
    G.respawn(b);
  };
  G.respawn = function (bot) {
    if (G.mode === 'campaign') return; // the dead stay dead
    const [x, z, yaw] = pickSpawn(bot);
    bot.spawn(x, z, yaw);
  };

  G.pickSpawn = (a) => pickSpawn(a);
  function pickSpawn(actor) {
    let best = null, bs = -1e9;
    for (const [x, z] of G.spawns) {
      let minD = 70, seen = false, crowd = false;
      for (const e of G.actors) {
        if (!e.alive || e === actor) continue;
        const d = Math.hypot(e.pos.x - x, e.pos.z - z);
        if (d < 2.5) crowd = true;
        if (!G.hostile(actor, e)) continue;
        minD = Math.min(minD, d);
        if (d < 60 && P.los(e.pos.x, e.pos.y + 1.6, e.pos.z, x, 1.5, z)) seen = true;
      }
      const s = minD - (seen ? 45 : 0) - (crowd ? 100 : 0) + Math.random() * 8;
      if (s > bs) { bs = s; best = [x, z]; }
    }
    const [x, z] = best;
    return [x, z, Math.atan2(x, z)]; // face the middle of the map
  }

  function checkWin() {
    if (G.ended || G.mode === 'campaign') return;
    if (G.mode === 'tdm') {
      if (G.teamKills[0] >= G.killGoal || G.teamKills[1] >= G.killGoal) endMatch();
    } else if (G.actors.some(a => a.kills >= G.killGoal)) endMatch();
  }

  // ---------- killstreaks ----------
  function useUav() {
    if (!G.uavReady) return;
    G.uavReady = false; G.uavT = 30; G.uavSweep = 0;
    HUD.banner('UAV ONLINE', 'ENEMIES REVEALED ON RADAR'); A.announce('U A V online');
  }
  function useAirstrike() {
    if (!G.airReady || !G.player.alive) return;
    const c = G.camera.position, d = v1.set(0, 0, -1).applyQuaternion(G.camera.quaternion);
    const h = P.raycast(c.x, c.y, c.z, d.x, d.y, d.z, 220);
    const t = h ? h.t : 60;
    const x = c.x + d.x * t, z = c.z + d.z * t;
    const hl = Math.hypot(d.x, d.z) || 1;
    G.airReady = false;
    if (G.net && !G.net.isHost()) { G.net.air(x, z, d.x / hl, d.z / hl); G.airMark = { x, z, t: 4 }; }
    else G.startAirstrike(G.player, x, z, d.x / hl, d.z / hl);
    HUD.banner('AIRSTRIKE INBOUND', 'MARKED ON RADAR'); A.announce('Airstrike inbound');
  }
  G.startAirstrike = function (owner, x, z, dx, dz) {
    G.airs.push({ owner, x, z, dx, dz, t: 3.2, jet: false, bombs: [] });
  };
  function updateAirstrike(dt) {
    if (G.airMark) { G.airMark.t -= dt; if (G.airMark.t <= 0) G.airMark = null; }
    G.airPending = G.airs.find(a => a.owner === G.player) || G.airMark;
    for (const a of G.airs.slice()) stepAirstrike(a, dt);
  }
  function stepAirstrike(a, dt) {
    a.t -= dt;
    if (!a.jet && a.t < 1.8) { a.jet = true; A.jet(); if (G.net) G.net.jet(); }
    if (a.t <= 0 && !a.bombs.length && !a.done) {
      a.done = true;
      for (let i = 0; i < 5; i++) a.bombs.push({ t: i * 0.14, off: (i - 2) * 5 });
    }
    for (const b of a.bombs) {
      if (b.fired) continue;
      b.t -= dt;
      if (b.t <= 0) { b.fired = true; explode(a.x + a.dx * b.off + (Math.random() - 0.5) * 2, a.z + a.dz * b.off + (Math.random() - 0.5) * 2, a.owner); }
    }
    if (a.done && a.bombs.every(b => b.fired)) G.airs.splice(G.airs.indexOf(a), 1);
  }
  G.explosionFx = function (x, y, z) {
    FX.explosion(x, y, z); A.explosion(x, z);
    const p = G.player, pd = Math.hypot(p.pos.x - x, p.pos.z - z);
    FX.shake = Math.max(FX.shake, Math.max(0, 1.2 - pd / 40));
  };
  function explode(x, z, owner) {
    let y = 0;
    const h = P.raycast(x, 30, z, 0, -1, 0, 40); if (h) y = 30 - h.t;
    G.explosionFx(x, y, z);
    if (G.net) G.net.boom(x, y, z);
    const p = owner;
    for (const e of G.actors) {
      if (!e.alive || !G.hostile(p, e)) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.y - y, e.pos.z - z);
      if (d > 9) continue;
      let dmg = 260 * (1 - d / 9) + 30;
      if (!P.los(x, y + 1, z, e.pos.x, e.pos.y + 1, e.pos.z)) dmg *= 0.35;
      const dir = { x: e.pos.x - x, y: 0.5, z: e.pos.z - z };
      G.damage(e, dmg, p, AIRSTRIKE, false, dir, d);
    }
  }

  // ---------- match flow ----------
  // online = { roster: [{id, name, team, kind, idx}], me, goal, diff, role } from net.js, or undefined offline
  G.startMatch = (o) => startMatch(o);
  function startMatch(online) {
    const s = G.settings;
    if (!online && VG.Net && VG.Net.role) VG.Net.leave();
    if (!online) G.net = null;
    G.online = online || null;
    G.mode = online ? 'tdm' : s.mode; G.diff = online ? +online.diff : +s.diff;
    G.killGoal = online ? online.goal : 30;
    $('loading').classList.remove('hidden');
    // let the loading screen paint before the (synchronous) world build
    setTimeout(() => {
      if (G.built !== 'compound') buildWorld();
      G.resetModeState();
      setupRenderer();
      if (G.actors) for (const b of G.actors) if (b.model) G.scene.remove(b.model);
      if (!G.player) G.player = new VG.Player(G);
      const p = G.player;
      p.kills = p.deaths = p.score = p.headshots = p.shots = p.hits = p.bestStreak = 0; p.nemesis = null; p.cur = 'ar';
      p.team = 0; p.id = 'me'; p.name = 'You';
      G.bots = []; G.remotes = [];
      if (online) {
        const mine = online.roster.find(r => r.id === online.me);
        p.id = mine.id; p.team = mine.team; p.name = mine.name;
        for (const r of online.roster) {
          if (r.id === online.me) continue;
          if (online.role === 'host' && r.kind === 'bot') { const b = new VG.Bot(G, r.name, r.team, r.idx); b.id = r.id; G.bots.push(b); }
          else G.remotes.push(new VG.Remote(G, r.name, r.team, r.idx, r.id, r.kind === 'human'));
        }
      } else {
        const n = +s.bots;
        const allies = G.mode === 'tdm' ? Math.floor((n + 1) / 2) - 1 : 0;
        const names = VG.CALLSIGNS.slice().sort(() => Math.random() - 0.5);
        for (let i = 0; i < n; i++) {
          const team = G.mode === 'tdm' ? (i < allies ? 0 : 1) : i + 1;
          const b = new VG.Bot(G, names[i], team, i); b.id = 'b' + i;
          G.bots.push(b);
        }
      }
      G.actors = [p, ...G.bots, ...G.remotes];
      G.byId = new Map(G.actors.map(a => [a.id, a]));
      G.airs = []; G.airMark = null;
      for (const a of G.actors) { a.alive = false; a.health = 0; }
      G.teamKills = [0, 0]; G.timeLeft = 600; G.now = 0; G.timeScale = 1;
      G.uavReady = G.airReady = G.uavEarned = G.airEarned = false; G.uavT = 0; G.uavSnap = new Map(); G.airPending = null;
      G.firstBlood = false; G.ended = false; G.deathCam = null; G.respawnT = 0;
      HUD.init(G);
      HUD.setDeath(false); HUD.showBoard(false);
      if (online && online.role === 'guest') {
        // wait for the host to place us; look over the map meanwhile
        p.alive = false; G.respawnT = 0;
        G.camera.position.set(0, 34, 62); G.camera.lookAt(0, 0, 0);
        HUD.setDeath(true, null, 'DEPLOYING');
      } else {
        G.respawnPlayer();
        for (const b of G.bots) G.respawn(b);
      }
      $('loading').classList.add('hidden'); $('menu').classList.add('hidden'); $('end').classList.add('hidden');
      $('hud').classList.remove('hidden');
      G.running = true;
      setPaused(false);
      if (!G.touch) requestLock();
      if (G.onMatchStart) G.onMatchStart();
      HUD.banner(online ? `ONLINE ${online.roster.length / 2}V${online.roster.length / 2}` : G.mode === 'tdm' ? 'TEAM DEATHMATCH' : 'FREE-FOR-ALL', `FIRST TO ${G.killGoal} KILLS`);
      A.announce(G.mode === 'tdm' ? 'Team deathmatch. Engage.' : 'Free for all. Engage.');
      if (G.net) G.net.ready();
    }, 30);
  }

  G.endMatch = () => endMatch();
  function endMatch() {
    if (G.ended) return;
    if (G.net && G.net.isHost()) G.net.end();
    G.ended = true; G.endT = 0; G.timeScale = 0.25;
    const p = G.player;
    let win;
    if (G.mode === 'tdm') win = G.teamKills[p.team] > G.teamKills[1 - p.team];
    else { const top = Math.max(...G.actors.map(a => a.kills)); win = p.kills === top && G.actors.filter(a => a.kills === top).length === 1; }
    G.win = win;
    HUD.banner(win ? 'VICTORY' : 'DEFEAT', 'MATCH OVER');
    A.announce(win ? 'Mission accomplished' : 'Mission failed');
    const rec = store.get('fsg.vanguard', { matches: 0, wins: 0, kills: 0, bestKills: 0 });
    rec.matches++; if (win) rec.wins++; rec.kills += p.kills; rec.bestKills = Math.max(rec.bestKills, p.kills);
    store.set('fsg.vanguard', rec);
  }

  function showEnd() {
    const p = G.player;
    G.running = false;
    if (document.exitPointerLock) document.exitPointerLock();
    $('hud').classList.add('hidden');
    $('end').classList.remove('hidden');
    const t = $('endTitle'); t.textContent = G.win ? 'VICTORY' : 'DEFEAT'; t.className = 'logo ' + (G.win ? 'win' : 'lose');
    const sorted = G.actors.slice().sort((a, b) => b.kills - a.kills);
    $('endSub').textContent = G.mode === 'tdm'
      ? `FRIENDLY ${G.teamKills[p.team]} · ENEMY ${G.teamKills[1 - p.team]}`
      : `YOU PLACED #${sorted.indexOf(p) + 1} OF ${sorted.length} · WINNER: ${sorted[0].name.toUpperCase()}`;
    const acc = p.shots ? Math.round(p.hits / p.shots * 100) : 0;
    const stats = [['KILLS', p.kills], ['DEATHS', p.deaths], ['K/D', (p.kills / Math.max(1, p.deaths)).toFixed(2)],
      ['SCORE', p.score], ['ACCURACY', acc + '%'], ['HEADSHOTS', p.headshots], ['BEST STREAK', p.bestStreak]];
    $('endStats').innerHTML = stats.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
    $('againBtn').textContent = G.online ? 'BACK TO LOBBY' : 'PLAY AGAIN';
    $('menuBtn').textContent = G.online ? 'LEAVE ONLINE' : 'MAIN MENU';
  }

  G.quitToMenu = (fromNet) => quitToMenu(fromNet);
  // undo everything the campaign changes on the shared engine
  G.resetModeState = function () {
    G.keepBodies = false; G.speedMul = 1; G.recoilMul = 1; G.cinematic = false; G.freezeAI = false; G.camHook = null;
    document.body.classList.remove('campaign');
    if (VG.Trauma) VG.Trauma.reset();
    if (G.player) G.player.tremor = 0;
  };
  function quitToMenu(fromNet) {
    if (G.mode === 'campaign' && VG.Campaign) VG.Campaign.stop();
    if (!fromNet && VG.Net && VG.Net.role) VG.Net.leave();
    G.net = null; G.online = null;
    G.running = false; G.paused = false;
    if (document.exitPointerLock) document.exitPointerLock();
    ['hud', 'pause', 'end'].forEach(id => $(id).classList.add('hidden'));
    $('menu').classList.remove('hidden');
    showRecord();
  }

  // ---------- frame ----------
  let lastT = performance.now(), aimFrame = 0, heartT = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    const real = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    if (real > 0) G.fps += (1 / real - G.fps) * 0.05;
    if (!G.running || !renderer) { input.pressed = {}; return; }
    if (!G.paused || G.net) {
      if (G.ended) { G.endT += real; G.timeScale = G.endT < 2.4 ? 0.25 : 1; if (G.endT > 3.2) { showEnd(); return; } }
      if (G.mode === 'campaign') G.timeLeft = 1e9;
      const dt = real * G.timeScale;
      G.now += dt;
      if (!G.ended) G.timeLeft -= dt;
      if (G.timeLeft <= 0 && !G.ended && !(G.net && !G.net.isHost())) endMatch();
      step(dt, real);
    }
    renderer.autoClear = true;
    renderer.render(G.scene, G.camera);
    if (G.player.alive && G.vmRoot.visible) {
      renderer.autoClear = false; renderer.clearDepth();
      renderer.render(G.vmScene, G.vmCamera);
    }
    input.pressed = {}; input.wheel = 0;
  }

  function step(dt, real) {
    const p = G.player, now = G.now;
    if (input.pressed.Digit4) useUav();
    if (input.pressed.Digit5) useAirstrike();
    if (p.alive) p.update(dt, G.ended || G.paused || G.cinematic ? { down: {}, pressed: {}, mouse: [false, false, false], wheel: 0 } : input, now);
    else deathCam(dt);
    for (const b of G.bots) { if (G.freezeAI && b.alive) b.animate(0, now); else b.update(dt, now); }
    for (const r of G.remotes) r.update(dt, now);
    if (G.net) G.net.update(real);
    // regenerating health: 4 s without damage, then rapid recovery (the host does it for everyone online)
    if (!(G.net && !G.net.isHost())) for (const a of G.actors) if (a.alive && a.health < 100 && now - a.lastHit > 4) a.health = Math.min(100, a.health + 55 * dt);
    if (p.alive && p.health < 45) { heartT -= real; if (heartT <= 0) { heartT = 0.4 + p.health / 60; A.heartbeat(0.5 * (1 - p.health / 45) + 0.15); } }
    // UAV
    if (G.uavT > 0) {
      G.uavT -= dt; G.uavSweep -= dt;
      if (G.uavSweep <= 0) { G.uavSweep = 2; G.uavSnap = new Map(G.actors.filter(a => a.alive).map(a => [a, [a.pos.x, a.pos.z]])); }
    }
    updateAirstrike(dt);
    // what the crosshair is over (name + red crosshair)
    if (++aimFrame % 3 === 0) {
      G.aimTarget = null;
      if (p.alive) {
        const c = G.camera.position, d = v1.set(0, 0, -1).applyQuaternion(G.camera.quaternion);
        let bt = 90;
        for (const a of G.actors) {
          if (!a.alive || a === p) continue;
          const r = P.rayActor(c.x, c.y, c.z, d.x, d.y, d.z, a, bt);
          if (r) { bt = r.t; G.aimTarget = a; }
        }
        if (G.aimTarget) { const h = P.raycast(c.x, c.y, c.z, d.x, d.y, d.z, bt); if (h) G.aimTarget = null; }
      }
    }
    if (!p.alive) { G.respawnT -= real; if (G.respawnT < -2.5) G.respawnPlayer(); }
    FX.update(dt);
    A.setListener(G.camera.position.x, G.camera.position.y, G.camera.position.z, p.yaw);
    if (G.mode === 'campaign' && VG.Campaign) VG.Campaign.update(dt, real);
    if (G.camHook) G.camHook(dt, real);
    HUD.update(dt, now);
  }

  function deathCam(dt) {
    const dc = G.deathCam; if (!dc) return;
    dc.t += dt;
    const cam = G.camera;
    cam.position.y += (G.player.pos.y + 0.4 - cam.position.y) * Math.min(1, dt * 4);
    if (dc.killer) {
      const k = dc.killer.pos;
      const m = new THREE.Matrix4().lookAt(cam.position, v1.set(k.x, k.y + 1.4, k.z), cam.up);
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      cam.quaternion.slerp(q, Math.min(1, dt * 3));
    } else cam.rotation.z += dt * 0.3;
    if (cam.fov !== VG.vfov(G.settings.fov)) { cam.fov = VG.vfov(G.settings.fov); cam.updateProjectionMatrix(); }
  }

  // test hook: fast-forward the simulation without rendering
  G.step = (dt, real) => step(dt, real);
  // async variant for tests: lets promise-based story scripts advance between steps
  G._simAsync = async (secs) => { for (let i = 0; i < secs * 30 && G.running; i++) { G.now += 1 / 30; step(1 / 30, 1 / 30); input.pressed = {}; await new Promise(r => setTimeout(r, 0)); } };
  G._sim = (secs) => { for (let i = 0; i < secs * 60 && G.running; i++) { G.now += 1 / 60; if (!G.ended) G.timeLeft -= 1 / 60; step(1 / 60, 1 / 60); input.pressed = {}; } };

  addEventListener('resize', () => {
    if (!renderer) return;
    renderer.setSize(innerWidth, innerHeight);
    G.camera.aspect = G.vmCamera.aspect = innerWidth / innerHeight;
    G.camera.updateProjectionMatrix(); G.vmCamera.updateProjectionMatrix();
  });

  // ---------- menu ----------
  function bindOpt(id, key, outId) {
    const e = $(id);
    e.value = G.settings[key];
    const sync = () => {
      G.settings[key] = e.type === 'range' || key !== 'mode' ? (isNaN(+e.value) ? e.value : +e.value) : e.value;
      if (outId) $(outId).textContent = (+e.value).toFixed(key === 'sens' ? 1 : 0);
      store.set('fsg.vanguard.settings', G.settings);
    };
    e.addEventListener('input', sync); e.addEventListener('change', sync); sync();
  }
  bindOpt('optMode', 'mode'); bindOpt('optBots', 'bots'); bindOpt('optDiff', 'diff');
  bindOpt('optSens', 'sens', 'sensOut'); bindOpt('optFov', 'fov', 'fovOut'); bindOpt('optGfx', 'gfx');

  function showRecord() {
    const r = store.get('fsg.vanguard', null);
    $('record').textContent = r ? `Matches ${r.matches} · Wins ${r.wins} · Total kills ${r.kills} · Best ${r.bestKills} kills` : '';
  }
  showRecord();

  renderKeys();
  $('keysBtn').addEventListener('click', () => {
    A.init(); A.ui();
    if (G.touch && VG.TouchLayout) { VG.TouchLayout.open(); return; }
    $('menu').classList.add('hidden'); $('keys').classList.remove('hidden'); renderKeys();
  });
  $('keysBack').addEventListener('click', () => { A.ui(); capture = null; $('keys').classList.add('hidden'); $('menu').classList.remove('hidden'); });
  $('keysReset').addEventListener('click', () => { A.ui(); G.binds = Object.assign({}, DEF); capture = null; rebuildBinds(); renderKeys(); });
  $('playBtn').addEventListener('click', () => { A.init(); A.ui(); startMatch(); });
  $('resumeBtn').addEventListener('click', () => { A.ui(); requestLock(); if (G.noLock) setPaused(false); });
  $('quitBtn').addEventListener('click', () => { A.ui(); quitToMenu(); });
  $('againBtn').addEventListener('click', () => {
    A.ui();
    if (G.online && VG.Net && VG.Net.role) { quitToMenu(true); $('menu').classList.add('hidden'); VG.Net.toLobby(); }
    else startMatch();
  });
  $('menuBtn').addEventListener('click', () => { A.ui(); quitToMenu(); });

  requestAnimationFrame(frame);
})();
