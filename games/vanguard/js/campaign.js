// OPERATION: ASHES OF VERDAN — single-player story campaign.
// Three chapters, each a small hand-built level plus a top-to-bottom async script. Choices feed the
// Psyche & Guilt matrix (VG.Story.psyche), which changes later dialogue, who is still alive, the
// world's colour (VG.Trauma) and which of the three endings you reach.
(function () {
  const VG = window.VG, G = VG.Game, P = VG.Phys, N = VG.Nav, A = VG.Audio, FX = VG.FX, S = VG.Story, T = VG.Trauma;
  const $ = (id) => document.getElementById(id);
  const C = VG.Campaign = {};
  const SAVE = 'fsg.vanguard.campaign';
  const PI = Math.PI;

  let run = 0, cp = { x: 0, y: 0, z: 0, yaw: 0 }, conds = [], tasks = [], level = null, flags = {};
  let squad = [], idx = 0, flashlight = null, waterY = null, splashT = 0, ghosts = [], ghostT = 8;
  const v1 = new THREE.Vector3();

  // ---------- small script helpers ----------
  C.checkpoint = () => cp;
  const setCP = (x, y, z, yaw) => { cp = { x, y, z, yaw }; };
  const until = (fn) => new Promise((res) => conds.push({ fn, res }));
  const task = (fn) => new Promise((res) => tasks.push({ fn, res }));
  const wait = (s) => S.wait(s);
  const p = () => G.player;
  const inZone = (x0, z0, x1, z1, y0, y1) => { const q = G.player.pos; return q.x > x0 && q.x < x1 && q.z > z0 && q.z < z1 && q.y >= (y0 ?? -5) && q.y < (y1 ?? 99); };
  const allDead = (list) => list.every(b => !b.alive);
  const orTime = (promise, sec) => Promise.race([promise, wait(sec)]); // never softlock on a stuck enemy
  const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
  const say = (lines) => S.say(lines.map(([who, text, radio]) => ({ who, text, radio: !!radio })));
  function guard(token) { if (token !== run) throw new Error('campaign stopped'); }

  // ---------- level construction ----------
  const kit = () => VG.Map.kit;
  const box = (x0, y0, z0, x1, y1, z1, key, o) => kit().B(x0, z0, x1, z1, y0, y1, key, o);
  // wall along X at z with openings [{c, w, b (sill), top}]
  function wallX(z, x0, x1, y0, h, t, key, holes, o) {
    let x = x0;
    for (const d of (holes || []).slice().sort((a, b) => a.c - b.c)) {
      const a = d.c - d.w / 2, e = d.c + d.w / 2, bot = d.b || 0, top = d.top || 2.3;
      if (a > x) box(x, y0, z - t / 2, a, y0 + h, z + t / 2, key, o);
      if (bot > 0) box(a, y0, z - t / 2, e, y0 + bot, z + t / 2, key, o);
      if (top < h) box(a, y0 + top, z - t / 2, e, y0 + h, z + t / 2, key, o);
      x = e;
    }
    if (x < x1) box(x, y0, z - t / 2, x1, y0 + h, z + t / 2, key, o);
  }
  function wallZ(x, z0, z1, y0, h, t, key, holes, o) {
    let z = z0;
    for (const d of (holes || []).slice().sort((a, b) => a.c - b.c)) {
      const a = d.c - d.w / 2, e = d.c + d.w / 2, bot = d.b || 0, top = d.top || 2.3;
      if (a > z) box(x - t / 2, y0, z, x + t / 2, y0 + h, a, key, o);
      if (bot > 0) box(x - t / 2, y0, a, x + t / 2, y0 + bot, e, key, o);
      if (top < h) box(x - t / 2, y0 + top, a, x + t / 2, y0 + h, e, key, o);
      z = e;
    }
    if (z < z1) box(x - t / 2, y0, z, x + t / 2, y0 + h, z1, key, o);
  }
  // straight flight rising toward +z
  function stairs(x0, x1, z0, yBase, rise, n, key) {
    for (let i = 0; i < n; i++) box(x0, yBase, z0 + i * 0.5, x1, yBase + (i + 1) * rise, z0 + (i + 1) * 0.5, key, { walk: true, tex: 1.5 });
  }

  function newLevel(cfg) {
    G.buildCore();
    if (!G.player) G.player = new VG.Player(G);
    const scene = G.scene = new THREE.Scene();
    scene.background = new THREE.Color(cfg.bg);
    scene.fog = new THREE.Fog(cfg.bg, cfg.fog[0], cfg.fog[1]);
    const hemi = new THREE.HemisphereLight(cfg.sky, cfg.ground, cfg.hemi);
    scene.add(hemi);
    const moon = new THREE.DirectionalLight(cfg.moonColor || 0xa8bcd8, cfg.moon);
    moon.position.set(-30, 60, -25);
    if (cfg.shadows) {
      moon.castShadow = true;
      const sc = moon.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 5; sc.far = 160;
      moon.shadow.mapSize.set(2048, 2048); moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.04;
      moon.target.position.set(cfg.center[0], 0, cfg.center[1]); moon.position.set(cfg.center[0] - 30, 60, cfg.center[1] - 25);
    }
    scene.add(moon, moon.target);
    G.sun = cfg.shadows ? moon : null;
    scene.add(G.camera);
    FX.init(scene);
    VG.Map.begin(scene, +G.settings.gfx);
    // the flashlight rides on the camera
    if (flashlight) { G.camera.remove(flashlight); G.camera.remove(flashlight.target); }
    flashlight = new THREE.SpotLight(0xfff0d8, 0, 34, 0.42, 0.6, 1.3);
    flashlight.position.set(0.15, -0.12, 0); flashlight.target.position.set(0.05, -0.2, -6);
    G.camera.add(flashlight); G.camera.add(flashlight.target);
    if (cfg.groundKey !== false) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ map: VG.Tex.asphalt(), color: cfg.groundColor || 0x777777, roughness: 0.9 }));
      g.material.map = g.material.map.clone(); g.material.map.needsUpdate = true; g.material.map.repeat.set(50, 50);
      g.rotation.x = -PI / 2; g.receiveShadow = true; scene.add(g);
    }
    level = { scene, hemi, hemiBase: cfg.hemi, skyCol: hemi.color.clone(), groundCol: hemi.groundColor.clone(), fogCol: scene.fog.color.clone(), nvOn: false, moon, moonBase: cfg.moon, lightningT: cfg.lightning ? 6 : -1, rain: null, roofs: cfg.roofs || [], light: cfg.flashOn !== false };
    if (cfg.rain) level.rain = makeRain(scene, cfg.rain);
    waterY = null;
    return scene;
  }
  function finishLevel(bounds) {
    VG.Map.end();
    N.build(bounds);
    G.built = 'campaign';
    G.setupRenderer();
  }

  function makeRain(scene, amount) {
    const n = Math.round(1400 * amount), pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 40, y = Math.random() * 20, z = (Math.random() - 0.5) * 40; pos.set([x, y, z, x + 0.03, y - 0.5, z], i * 6); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fb0c0, transparent: true, opacity: 0.35 }));
    lines.frustumCulled = false; scene.add(lines);
    return { lines, pos, n, off: new Float32Array(n * 3).map(() => 0) };
  }
  function updateRain(dt) {
    const r = level && level.rain; if (!r) return;
    const c = G.camera.position, pos = r.pos;
    for (let i = 0; i < r.n; i++) {
      const k = i * 6;
      let y = pos[k + 1] - 22 * dt;
      let x = pos[k], z = pos[k + 2];
      if (y < c.y - 6 || Math.abs(x - c.x) > 20 || Math.abs(z - c.z) > 20) { x = c.x + (Math.random() - 0.5) * 40; z = c.z + (Math.random() - 0.5) * 40; y = c.y + 8 + Math.random() * 8; }
      let hide = false;
      for (const rf of level.roofs) if (x > rf[0] && x < rf[2] && z > rf[1] && z < rf[3]) { hide = true; break; }
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      pos[k + 3] = x + 0.03; pos[k + 4] = hide ? y : y - 0.55; pos[k + 5] = z;
    }
    r.lines.geometry.attributes.position.needsUpdate = true;
  }

  // ---------- characters ----------
  function setWpn(b, id) { b.wpn = id; b.def = VG.WEAPONS[id]; b.mag = b.def.mag; for (const k in b.guns) b.guns[k].group.visible = k === id; }
  function style(b, kind) {
    const m = b.mats;
    if (kind === 'insurgent') {
      m.pants.color.setHex([0x2b2f36, 0x3a3127, 0x2f3b2c][idx % 3]); m.vest.color.setHex([0x4a4036, 0x3b3f44, 0x55493a][idx % 3]);
      m.band.color.setHex(0x222222); m.band.emissive.setHex(0); b.helmet.visible = false;
    } else if (kind === 'civ') {
      m.pants.color.setHex([0x3d3a52, 0x5a4a3a, 0x40362e, 0x2e3a4a][idx % 4]); m.vest.color.setHex([0x7a3a3a, 0x8a7a5a, 0x5a6a7a, 0x6b4f6b][idx % 4]);
      m.band.color.copy(m.vest.color); m.band.emissive.setHex(0); b.helmet.visible = false;
    } else if (kind === 'squad') { m.band.color.setHex(0x55663a); m.band.emissive.setHex(0); }
  }
  function nameTag(b, text) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: VG.Tex.label(text, '#b8d98a'), depthTest: false, transparent: true, opacity: 0.8 }));
    sp.scale.set(0.8, 0.2, 1); sp.position.y = 2.1; sp.renderOrder = 5; b.model.add(sp); b.tag = sp;
  }
  function mkBot(name, team, x, y, z, yaw, wpn) {
    const b = new VG.Bot(G, name, team, idx++);
    b.id = name + idx; b.spawn(x, z, yaw); b.pos.y = y;
    setWpn(b, wpn || 'ar');
    G.bots.push(b); G.actors.push(b); G.byId.set(b.id, b);
    return b;
  }
  function insurgent(x, y, z, yaw, wpn) {
    const b = mkBot('Insurgent', 1, x, y, z, yaw, wpn || (Math.random() < 0.5 ? 'ar' : 'smg'));
    b.hold = true; b.holdYaw = yaw; style(b, 'insurgent');
    return b;
  }
  function squaddie(name, x, y, z, yaw, fx, fz) {
    const b = mkBot(name, 0, x, y, z, yaw, name === 'Kovač' ? 'smg' : 'ar');
    b.follow = G.player; b.fx = fx; b.fz = fz; b.immortal = true; b.dmgMul = 0.6;
    style(b, 'squad'); nameTag(b, name.toUpperCase()); squad.push(b);
    return b;
  }
  // a person moved by the script (civilians, the figure in the dark, Sorel)
  function figure(name, x, y, z, yaw, opts) {
    const f = new VG.Remote(G, name, 2, idx++, 'f' + idx, false);
    f.civ = true; f.scripted = true; f.spawnAt(x, y, z, yaw);
    for (const k in f.guns) f.guns[k].group.visible = false;
    style(f, 'civ');
    if (opts && opts.crouch) { f.tH = 1.2; f.surrender = true; }
    G.remotes.push(f); G.actors.push(f); G.byId.set(f.id, f);
    return f;
  }
  // walk a script-driven figure (or a frozen bot) along points
  function moveAlong(e, pts, speed) {
    let i = 0;
    return task((dt) => {
      if (i >= pts.length) return true;
      const [x, z] = pts[i], tgt = e.tgt || e.pos;
      const dx = x - tgt.x, dz = z - tgt.z, d = Math.hypot(dx, dz), step = speed * dt;
      if (d <= step) { tgt.x = x; tgt.z = z; i++; } else { tgt.x += dx / d * step; tgt.z += dz / d * step; }
      const yaw = Math.atan2(-dx, -dz);
      if (e.tgt) e.tYaw = yaw; else { e.aimYaw = e.yaw = yaw; e.vel.set(dx / (d || 1) * speed, 0, dz / (d || 1) * speed); }
      if (!e.tgt && i >= pts.length) e.vel.set(0, 0, 0);
      return i >= pts.length;
    });
  }
  function killScripted(e, from) {
    const dir = from ? { x: e.pos.x - from.x, z: e.pos.z - from.z } : null;
    e.health = 0; e.alive = false; e.die(dir);
    const h = e.pos.y + 1.3; FX.blood(e.pos.x, h, e.pos.z, dir ? dir.x * 0.2 : 0, 0, dir ? dir.z * 0.2 : 0, false);
  }
  function muzzleAt(e, sound) {
    const x = e.pos.x - Math.sin(e.yaw || e.aimYaw) * 0.6, z = e.pos.z - Math.cos(e.yaw || e.aimYaw) * 0.6, y = e.pos.y + 1.35;
    FX.muzzle(x, y, z, true); A.shot(sound || 'ar', false, x, z);
  }
  // camera assist: ease the player's view toward a point
  function lookAt(target, rate, hideGun) {
    G.camHook = (dt, real) => {
      const pl = p(), c = G.camera.position;
      const ty = Math.atan2(-(target.x - c.x), -(target.z - c.z));
      const tp = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
      let d = ty - pl.yaw; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI;
      const k = Math.min(1, real * (rate || 3));
      pl.yaw += d * k; pl.pitch += (tp - pl.pitch) * k;
      G.camera.rotation.set(pl.pitch, pl.yaw, 0, 'YXZ');
      if (hideGun) G.vmRoot.visible = false;
    };
  }
  C.onKill = function (victim, attacker) {
    if (!victim.civ || !attacker || !attacker.isPlayer || victim.scriptedKill) return;
    // shooting people who were not fighting is never free
    S.psyche.civilianCasualties++; S.guilt(14); S.trust(-10);
    T.remember('Hold fire. Hold your fire.');
    S.say([{ who: 'KOVAČ', text: 'Civilian! Hold fire, Miller. Hold your fire!' }]);
  };
  C.onRespawn = function () {
    for (const b of squad) if (b.alive) { b.pos.set(cp.x + (b.fx || 0) * 0.5, cp.y, cp.z + (b.fz || 0) * 0.5); b.path = null; b.state = 'patrol'; }
  };

  // ---------- campaign flow ----------
  const CHAPTERS = [chapter1, chapter2, chapter3];
  C.open = function () {
    const sv = G.store.get(SAVE, null);
    $('campContinue').classList.toggle('hidden', !sv || !sv.chapter);
    if (sv && sv.chapter) $('campContinue').textContent = `CONTINUE · CHAPTER ${['I', 'II', 'III'][sv.chapter]}`;
    $('menu').classList.add('hidden'); $('campWarn').classList.remove('hidden');
  };
  C.begin = function (fromSave) {
    const sv = fromSave ? G.store.get(SAVE, null) : null;
    S.reset();
    if (sv && sv.psyche) { Object.assign(S.psyche, sv.psyche); flags = sv.flags || {}; T.memories = sv.memories || []; }
    else { flags = {}; T.memories = []; }
    startChapter(sv ? sv.chapter : 0);
  };
  function save(next) { G.store.set(SAVE, { chapter: next, psyche: S.psyche, flags, memories: T.memories }); }

  function startChapter(n) {
    const token = ++run;
    $('campWarn').classList.add('hidden'); $('menu').classList.add('hidden'); $('end').classList.add('hidden');
    $('campEnd').classList.add('hidden');
    $('loading').classList.remove('hidden');
    setTimeout(() => {
      G.resetModeState();
      Object.assign(G, {
        mode: 'campaign', online: null, net: null, diff: +G.settings.diff, bots: [], remotes: [], airs: [], uavSnap: new Map(),
        uavT: 0, airPending: null, airMark: null, ended: false, timeScale: 1, keepBodies: true, respawnT: 0, deathCam: null,
        firstBlood: true, teamKills: [0, 0], killGoal: 0, timeLeft: 1e9, uavReady: false, airReady: false, now: 0,
      });
      conds = []; tasks = []; squad = []; ghosts = []; idx = 0;
      G.actors = []; G.byId = new Map();
      document.body.classList.add('campaign');
      CHAPTERS[n].build();
      const pl = G.player;
      pl.team = 0; pl.name = 'Miller'; pl.id = 'me'; pl.cur = 'ar';
      pl.kills = pl.deaths = pl.score = pl.shots = pl.hits = 0;
      G.actors.unshift(pl); G.byId.set('me', pl);
      VG.HUD.init(G); VG.HUD.setDeath(false); VG.HUD.showBoard(false);
      pl.reset(); pl.pos.set(cp.x, cp.y, cp.z); pl.yaw = cp.yaw; pl.pitch = 0;
      CHAPTERS[n].setup();
      $('loading').classList.add('hidden'); $('hud').classList.remove('hidden');
      G.running = true; G.setPaused(false);
      if (!G.touch) G.requestLock();
      if (G.onMatchStart) G.onMatchStart();
      CHAPTERS[n].script(token).catch((e) => { if (e.message !== 'campaign stopped') console.error(e); });
    }, 40);
  }
  async function chapterDone(token, n, lines) {
    guard(token);
    S.objective(''); G.cinematic = true; G.freezeAI = true; S.letterbox(true);
    await wait(1);
    $('fade').classList.add('on'); await wait(1.6); guard(token);
    A.stopAmbience();
    await S.card(lines, 3.5); guard(token);
    if (n + 1 < CHAPTERS.length) { save(n + 1); $('fade').classList.remove('on'); startChapter(n + 1); }
  }

  C.stop = function () {
    run++; conds = []; tasks = [];
    A.stopAmbience(); A.tinnitus(false); A.setMuffle(20000, 0.2);
    S.clearDialogue(); S.letterbox(false); S.objective('');
    $('decision').classList.add('hidden'); $('tunnel').classList.remove('on');
    $('card').classList.add('hidden'); $('fade').classList.remove('on'); $('campEnd').classList.add('hidden'); $('water').classList.remove('on');
    G.timeScale = 1; G.camHook = null; G.cinematic = false; G.freezeAI = false;
    if (flashlight) { G.camera.remove(flashlight); G.camera.remove(flashlight.target); flashlight = null; }
    T.reset();
  };

  // ---------- per-frame ----------
  C.update = function (dt, real) {
    S.update(real);
    for (let i = conds.length - 1; i >= 0; i--) if (conds[i].fn()) { const c = conds[i]; conds.splice(i, 1); c.res(); }
    for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i].fn(dt)) { const t2 = tasks[i]; tasks.splice(i, 1); t2.res(); }
    T.update(dt, real);
    A.scoreTick(real, flags.mood);
    updateRain(dt);
    const inp = G.input, pl = p();
    // flashlight & night vision
    if (inp.pressed.KeyL && !G.cinematic) { level.light = !level.light; A.dryFire(); }
    if (inp.pressed.KeyN && !G.cinematic) T.setNV(!T.nv);
    if (flashlight) flashlight.intensity = level.light && pl.alive && !level.noLight ? 240 : 0;
    // night vision: green phosphor via the lights themselves (no post-processing, cheap on phones)
    if (level.nvOn !== T.nv) {
      level.nvOn = T.nv;
      if (T.nv) { level.hemi.color.setHex(0x9dffaa); level.hemi.groundColor.setHex(0x2a6a34); level.scene.fog.color.setHex(0x06140a); }
      else { level.hemi.color.copy(level.skyCol); level.hemi.groundColor.copy(level.groundCol); level.scene.fog.color.copy(level.fogCol); }
    }
    level.hemi.intensity = level.hemiBase * (T.nv ? 6 : 1);
    for (const b of squad) if (b.tag) b.tag.visible = b.alive && b.pos.distanceTo(pl.pos) > 5;
    // lightning
    if (level.lightningT >= 0) {
      level.lightningT -= real;
      if (level.lightningT <= 0) {
        level.lightningT = 7 + Math.random() * 14;
        const near = Math.random() < 0.4;
        level.flash = 0.35; A.thunder(near);
      }
      if (level.flash > 0) {
        level.flash -= real;
        const k = level.flash > 0.25 ? 1 : level.flash > 0.18 ? 0 : level.flash > 0.1 ? 0.7 : 0;
        level.moon.intensity = level.moonBase + k * 5;
      } else level.moon.intensity = level.moonBase;
    }
    // squadmates who lose the path (stairs, other floors) catch up out of sight
    for (const b of squad) {
      if (!b.alive || !b.follow || G.freezeAI) continue;
      const far = Math.abs(b.pos.y - pl.pos.y) > 1.5 || b.pos.distanceTo(pl.pos) > 16;
      b.lostT = far ? (b.lostT || 0) + real : 0;
      if (b.lostT > 2.5) {
        const n = N.nearest(pl.pos.x - Math.sin(pl.yaw) * -2.5 + (b.fx || 0) * 0.4, pl.pos.y, pl.pos.z - Math.cos(pl.yaw) * -2.5 + (b.fz || 0) * 0.4);
        if (n && Math.abs(n.y - pl.pos.y) < 1) { b.pos.set(n.x, n.y, n.z); b.path = null; b.lostT = 0; }
      }
    }
    // water
    if (waterY !== null) {
      const wet = pl.pos.y < waterY + 0.1;
      G.speedMul = wet ? 0.72 : 1;
      const hs = Math.hypot(pl.vel.x, pl.vel.z);
      if (wet && hs > 1) { splashT -= real * hs; if (splashT <= 0) { splashT = 2.2; A.splash(); } }
    }
    if (level.extra) level.extra(dt, real);
  };

  // =====================================================================
  // CHAPTER I — RULES OF ENGAGEMENT (Block 17, a dark tenement, thunderstorm)
  // =====================================================================
  const F = [0, 3.2, 6.4]; // floor heights
  const ch1 = {};
  function chapter1() {} // placeholder for table order (functions below attach build/setup/script)
  chapter1.build = function () {
    newLevel({ bg: 0x05070a, fog: [8, 50], sky: 0x3a4a62, ground: 0x14120f, hemi: 0.34, moon: 0.4, lightning: true, rain: 1, roofs: [[0, 0, 24, 14]], center: [12, 4] });
    const W = 'plaster', H = 3.2, t = 0.3;
    // yard
    box(-6.3, 0, -14, -6, 3, 0, 'brick'); box(30, 0, -14, 30.3, 3, 0, 'brick'); box(-6.3, 0, -14.3, 30.3, 3, -14, 'brick');
    box(4.5, 0, -8, 6.3, 1.4, -3.8, 'burnt', { tex: 2 }); box(4.7, 1.4, -7, 6.1, 2, -5, 'burnt');
    kit().crate(18, -6); kit().crate(18.4, -4.8, 1); kit().barrel(21, -9); kit().barrel(-3, -4);
    for (let f = 0; f < 3; f++) {
      const y = F[f];
      // outer walls with windows (and the front door on the ground floor)
      wallX(0, -0.15, 24.15, y, H, t, 'brick', f === 0 ? [{ c: 4, w: 1.4, b: 1.0, top: 2.2 }, { c: 12, w: 1.6 }, { c: 20, w: 1.4, b: 1.0, top: 2.2 }] : [{ c: 4, w: 1.4, b: 1.0, top: 2.2 }, { c: 12, w: 1.4, b: 1.0, top: 2.2 }, { c: 20, w: 1.4, b: 1.0, top: 2.2 }]);
      wallX(14, -0.15, 24.15, y, H, t, 'brick', [{ c: 3, w: 1.2, b: 1.0, top: 2.2 }, { c: 9, w: 1.2, b: 1.0, top: 2.2 }, { c: 15, w: 1.2, b: 1.0, top: 2.2 }]);
      wallZ(0, 0.15, 13.85, y, H, t, 'brick', [{ c: 3, w: 1.2, b: 1.0, top: 2.2 }]);
      wallZ(24, 0.15, 13.85, y, H, t, 'brick', [{ c: 3, w: 1.2, b: 1.0, top: 2.2 }]);
      // corridor walls (z 5 and z 9) with doors on even metres so squadmates can path through
      wallX(5, 0.15, 23.85, y, 3.0, 0.2, W, [{ c: 4, w: 1.4 }, { c: 12, w: 1.4 }, { c: 20, w: 1.4 }]);
      const north = f === 0 ? [{ c: 4, w: 1.4 }, { c: 10, w: 1.4 }, { c: 14, w: 1.4 }, { c: 20, w: 1.4 }, { c: 22.6, w: 2.4 }]
        : f === 1 ? [{ c: 1.4, w: 2.4 }, { c: 10, w: 1.4 }, { c: 14, w: 1.4 }, { c: 20, w: 1.4 }]
          : [{ c: 4, w: 1.4 }, { c: 10, w: 1.4 }, { c: 14, w: 1.4 }, { c: 20, w: 1.4 }];
      const nx0 = f === 2 ? 2.6 : 0.15, nx1 = f === 1 ? 21.4 : 23.85;
      wallX(9, nx0, nx1, y, 3.0, 0.2, W, north.filter(d => d.c > nx0 && d.c < nx1));
      // room dividers
      for (const x of [8, 16]) wallZ(x, 0.15, 4.9, y, 3.0, 0.2, W);
      for (const x of [6, 12, 18]) wallZ(x, 9.1, 13.85, y, 3.0, 0.2, W);
      // floor slab (top at the next floor's height) with stair holes
      if (f > 0) {
        if (f === 1) { box(-0.15, y - 0.2, -0.15, 21.4, y, 14.15, 'floor', { walk: true, noAO: true }); box(21.4, y - 0.2, -0.15, 24.15, y, 9.0, 'floor', { walk: true, noAO: true }); }
        else { box(2.6, y - 0.2, -0.15, 24.15, y, 14.15, 'floor', { walk: true, noAO: true }); box(-0.15, y - 0.2, -0.15, 2.6, y, 9.0, 'floor', { walk: true, noAO: true }); }
      }
    }
    box(-0.15, 9.4, -0.15, 24.15, 9.6, 14.15, 'roof', { noAO: true });
    kit().visBox(0.15, 0, 0.15, 23.85, 0.02, 13.85, 'floor', { noAO: true });
    // stairs: A (ground -> 1st) east end, B (1st -> 2nd) west end; railings around the holes
    stairs(21.4, 23.85, 9.1, 0, 3.2 / 9, 9, 'concrete');
    stairs(0.15, 2.6, 9.1, 3.2, 3.2 / 9, 9, 'concrete');
    box(21.2, 3.2, 9.0, 21.4, 4.2, 12.8, 'rail', { cover: false }); box(21.4, 3.2, 8.9, 23.85, 4.2, 9.1, 'rail', { cover: false });
    box(2.6, 6.4, 9.0, 2.8, 7.4, 12.8, 'rail', { cover: false }); box(0.15, 6.4, 8.9, 2.6, 7.4, 9.1, 'rail', { cover: false });
    // furniture
    const furn = (x0, z0, x1, z1, y, h, key) => box(x0, y, z0, x1, y + h, z1, key || 'plywood', { pen: true, tex: 1 });
    furn(1, 1, 3, 2.2, 0, 0.5, 'cloth'); furn(9, 1, 11, 2, 0, 0.8); furn(17, 3.5, 19, 4.6, 0, 0.9, 'cloth');
    furn(7, 12.6, 9.5, 13.6, 0, 0.5, 'cloth'); furn(13, 10, 14, 11, 0, 0.75);
    furn(9, 1, 11.5, 2.2, 3.2, 0.5, 'cloth'); furn(18, 1, 19, 2, 3.2, 0.9); furn(6.5, 12.4, 11, 13.6, 3.2, 0.35, 'cloth'); // mattresses: the family room
    furn(19, 12.8, 21, 13.7, 3.2, 0.5, 'cloth');
    // the nursery (2nd floor, south-middle room): crib and dresser under the window
    furn(9, 3.4, 10.4, 4.3, 6.4, 0.9); furn(11.3, 0.2, 12.7, 0.7, 6.4, 0.9);
    furn(14.5, 3.6, 15.6, 4.6, 6.4, 0.5, 'cloth'); furn(13, 10.2, 15, 12, 6.4, 0.5, 'cloth');
    furn(20, 1, 22, 2.2, 6.4, 0.8); furn(3, 12.6, 5.5, 13.6, 6.4, 0.5, 'cloth');
    finishLevel({ x0: -6, z0: -14, x1: 30, z1: 16 });
    // candle in the family room
    const candle = new THREE.PointLight(0xffa040, 2.2, 7, 2); candle.position.set(9, 3.7, 12); level.scene.add(candle);
    level.extra = (dt, real) => { candle.intensity = 2 + Math.sin(G.now * 13) * 0.25 + Math.random() * 0.2; };
    setCP(12, 0, -8, PI);
  };
  chapter1.setup = function () {
    squaddie('Rourke', 10.5, 0, -10, PI, -1.5, 1.2);
    squaddie('Davis', 13.5, 0, -10.5, PI, 1.5, 1.4);
    squaddie('Kovač', 12, 0, -11.5, PI, 0, 2.4);
    ch1.e0 = [insurgent(4, 0, 2.5, PI), insurgent(9, 0, 12, 0)];
    ch1.e1 = [insurgent(20, 3.2, 2.5, PI), insurgent(11, 3.2, 3, PI), insurgent(5, 3.2, 7, -PI / 2)];
    ch1.e2 = [insurgent(20, 6.4, 3, PI), insurgent(8.5, 6.4, 12, 0)];
    ch1.family = [figure('Old man', 7.5, 3.2, 11.5, 0, { crouch: true }), figure('Woman', 9, 3.2, 12.6, PI / 4, { crouch: true }), figure('Boy', 10.4, 3.2, 12.2, -PI / 6, { crouch: true })];
    level.light = false;
    A.startAmbience({ rain: 1, drone: true, root: 73.4 });
  };
  chapter1.script = async function (tk) {
    const pl = p();
    S.letterbox(true); G.cinematic = true;
    await S.card([['small', 'OPERATION: ASHES OF VERDAN'], ['big', 'I. RULES OF ENGAGEMENT'], ['small', 'Block 17, Sector 4 · 02:14 · Day 31 of the siege']], 2.2); guard(tk);
    await say([
      ['OVERLORD', 'Hammer Two-One, OVERLORD Actual. Sorel was sighted in Block 17 two hours ago. Clear it floor by floor.', true],
      ['ROURKE', 'Building\'s still full of families, Colonel.', true],
      ['OVERLORD', 'Then be quick. Rules of engagement are unchanged: hostile act, hostile intent. Use your judgement, Sergeant.', true],
      ['DAVIS', 'Sarge... my mom made you promise, remember? At the airfield. You bring me home.'],
      ['MILLER', 'I remember, Davis. Stay on my six.'],
      ['KOVAČ', 'Power\'s out across the whole block. Night vision on. Lights if you have to.'],
    ]); guard(tk);
    S.letterbox(false); G.cinematic = false;
    S.objective(`Clear Block 17 · [${G.touch ? 'NV' : G.keyLabel('nv')}] night vision · [${G.touch ? 'LIGHT' : G.keyLabel('light')}] flashlight`);
    await until(() => inZone(0, 0, 24, 14, -1, 2)); guard(tk);
    setCP(12, 0, 3, PI);
    S.objective('Clear the ground floor');
    await until(() => allDead(ch1.e0) || pl.pos.y > 2.5); guard(tk);
    S.objective('Take the stairs at the east end');
    await until(() => pl.pos.y > 3); guard(tk);
    setCP(20, 3.2, 12.5, PI / 2);
    S.objective('Clear the first floor');
    // the family
    await until(() => inZone(7, 6, 13, 9.5, 3, 5) || inZone(6, 9, 12, 14, 3, 5) || pl.pos.y > 6); guard(tk);
    if (pl.pos.y < 6) await say([
      ['DAVIS', 'Contact, north room— no. No, wait. Hands! Hands! They\'re civilians.'],
      ['KOVAČ', 'Stay down. Stay down, we won\'t hurt you. Nobody\'s going to hurt you.'],
      ['OLD MAN', 'Please. Please. We have nothing left. No more.'],
      ['ROURKE', 'Keep moving. They\'re safer the faster we\'re gone.'],
    ]); guard(tk);
    S.objective('Find the stairs at the west end of the first floor');
    await until(() => pl.pos.y > 6.2); guard(tk);
    setCP(3.5, 6.4, 12.5, -PI / 2);
    S.objective('Clear the second floor');
    // a baby crying somewhere on this floor
    let cry = true;
    (async () => { while (cry && tk === run) { A.infant(2.4, 0.03 + Math.max(0, 0.06 - p().pos.distanceTo(new THREE.Vector3(10, 6.4, 3)) * 0.004)); await wait(4.2); } })();
    await orTime(until(() => allDead(ch1.e2.filter(b => b.pos.y > 5.5))), 150); guard(tk);
    await until(() => inZone(5, 5, 17, 9, 6, 8)); guard(tk);

    // ---------- the nursery ----------
    const davis = squad.find(s => s.name === 'Davis');
    G.freezeAI = true; G.cinematic = true;
    const fig = figure('Figure', 15, 6.4, 12, PI);
    fig.mats.vest.color.setHex(0x2a2a30); fig.mats.pants.color.setHex(0x1e1e22); fig.scriptedKill = true; fig.surrender = false;
    lookAt(new THREE.Vector3(14, 7.4, 9), 5);
    S.line('ROURKE', 'Movement. East bedroom.');
    await moveAlong(fig, [[14, 9.6], [14, 7], [12.4, 6.0], [12.2, 4.4], [12, 1.0]], 4.6); guard(tk);
    fig.tH = 1.35; fig.tYaw = 0; // crouched at the drawer, back to the door
    // Miller and Davis follow it to the nursery door
    davis.follow = null;
    moveAlong(davis, [[12.6, 6.4], [10.9, 4.4]], 4.2);
    const from = pl.pos.clone(); let tw = 0;
    lookAt(new THREE.Vector3(12, 7.3, 1.0), 4);
    await task((dt) => { tw += dt; const k = Math.min(1, tw / 1.1), e = k * k * (3 - 2 * k); pl.pos.set(from.x + (12.2 - from.x) * e, 6.4, from.z + (6.2 - from.z) * e); pl.vel.set(0, 0, 0); return k >= 1; }); guard(tk);
    lookAt(new THREE.Vector3(12, 7.3, 1.0), 6);
    level.flash = 0.35; A.thunder(true); // lightning: a silhouette against the window, nothing more
    const d = await S.decide({
      prompt: 'A figure in the dark. Reaching into a drawer. Fast.',
      time: 3.5, timeoutValue: 'froze',
      options: [{ key: 'F', label: 'FIRE', value: 'fire' }, { key: 'E', label: 'HOLD — VERIFY TARGET', value: 'hold' }],
    }); guard(tk);
    cry = false;
    S.psyche.choices.ch1 = d.value;
    S.letterbox(true);
    if (d.value === 'fire') {
      // two rounds, then the light
      for (let i = 0; i < 2; i++) { A.shot('ar', true); FX.playerFlash(G.camera.position.x, G.camera.position.y, G.camera.position.z); await wait(0.12); }
      killScripted(fig, { x: fig.pos.x - 1, z: fig.pos.z + 0.3 }); // falls sideways onto the floor
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.17, 10), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.4 }));
      bottle.position.set(11.5, 6.47, 1.9); bottle.rotation.z = PI / 2; bottle.rotation.y = 0.6; level.scene.add(bottle);
      await wait(1.2); guard(tk);
      T.setNV(false); level.light = true;
      lookAt(new THREE.Vector3(12.3, 6.6, 1.6), 2, true);
      A.infant(6, 0.12);
      await say([
        ['DAVIS', 'Target down. Target... Sarge.'],
        ['DAVIS', 'She\'s not armed. Sarge, she\'s not armed.'],
        ['KOVAČ', 'It\'s a bottle. It\'s formula. She was getting formula.'],
        ['DAVIS', 'There\'s a baby in here. There\'s a baby in here, Sarge.'],
        ['KOVAČ', 'I\'ve got him. I\'ve got him. Somebody just... get out of my way.'],
        ['ROURKE', 'Hostile intent. That\'s what we write. Hostile intent, in the dark, at close range. You hear me, Sean? That\'s what happened.'],
      ]); guard(tk);
      S.psyche.civilianCasualties++; S.guilt(35); S.trust(-15);
      T.remember('It\'s just formula.'); T.remember('There\'s a baby in here.');
      flags.motherKilled = true;
      await chapterDone(tk, 0, [['small', 'Block 17 was reported clear at 03:02.'], ['small', 'One enemy combatant was killed on the second floor.'], ['small', 'Her name was Irena Halas. She was twenty-four.']]);
    } else {
      // hesitation: the figure was armed
      fig.tYaw = yawTo(fig.pos, davis.pos); fig.tH = 1.8; fig.guns.smg.group.visible = true;
      await wait(0.35); guard(tk);
      lookAt(new THREE.Vector3(davis.pos.x, 7.2, davis.pos.z), 4);
      for (let i = 0; i < 3; i++) { muzzleAt(fig, 'smg'); await wait(0.09); }
      killScripted(davis, fig.pos); davis.scriptedKill = true;
      await wait(0.3);
      for (let i = 0; i < 2; i++) { const r = squad.find(s => s.name === 'Rourke'); muzzleAt(r, 'ar'); await wait(0.13); }
      killScripted(fig, davis.pos);
      T.setNV(false); level.light = true;
      await wait(1); guard(tk);
      lookAt(new THREE.Vector3(davis.pos.x, davis.pos.y + 0.4, davis.pos.z), 2, true);
      await say([
        ['DAVIS', 'Sarge? Sarge, I can\'t... I can\'t feel my legs.'],
        ['KOVAČ', 'Pressure! Get pressure on it! Davis, look at me. Look at me!'],
        ['DAVIS', 'I want my mom. I want my mom. You said... you said you\'d bring me home.'],
      ]); guard(tk);
      for (let i = 0; i < 4; i++) { A.heartbeatClear(0.5 - i * 0.1); await wait(0.9 + i * 0.4); }
      await say([
        ['KOVAČ', 'He\'s gone. Sean. He\'s gone.'],
        d.timedOut ? ['ROURKE', 'You froze. You just... stood there.'] : ['ROURKE', 'You waited. You did it by the book.'],
        ['ROURKE', 'And he\'s still dead.'],
      ]); guard(tk);
      S.guilt(d.timedOut ? 30 : 25); S.trust(d.timedOut ? -18 : -10); S.psyche.brokenVows++;
      T.remember('I want my mom.'); T.remember('You said you\'d bring me home.');
      flags.davisDead = true;
      squad.splice(squad.indexOf(davis), 1);
      await chapterDone(tk, 0, [['small', 'Block 17 was reported clear at 03:02.'], ['small', 'Private Thomas Davis, 19, was killed in action.'], ['small', 'The letter to his mother said it was quick.']]);
    }
  };

  // =====================================================================
  // CHAPTER II — COLLATERAL PROTOCOL (St. Agnes Hospital Square, sniper tower)
  // =====================================================================
  const ch2 = {};
  function chapter2() {}
  chapter2.build = function () {
    newLevel({ bg: 0x3a3f46, fog: [22, 110], sky: 0x8a96a4, ground: 0x4a443c, hemi: 1.5, moon: 1.3, moonColor: 0xc8ccd4, lightning: true, rain: 0.9, shadows: +G.settings.gfx > 0, center: [0, 32] });
    const R = 'rubble';
    // ruined facades around the square
    box(-32, 0, -8, -30, 9, 72, 'burnt', { tex: 4 }); box(-30, 0, 70, 32, 8, 72, 'concrete', { tex: 4 });
    box(-30, 0, -8, 32, 4, -6, 'rubble', { tex: 4 }); box(30, 0, -8, 32, 6, 26, 'burnt', { tex: 4 });
    for (const [x, z, h] of [[-26, 10, 7], [-27, 30, 10], [-26, 50, 6], [-24, 64, 8]]) box(x - 3, 0, z - 4, x + 3, h, z + 4, 'concrete', { tex: 4 });
    // hospital (east), basement entrance on its west face
    box(14, 0, 26, 30, 10, 56, 'tile', { tex: 4 });
    for (let k = 0; k < 6; k++) kit().visBox(13.9, 3 + (k % 2) * 3.4, 28 + k * 4.4, 14, 4.6 + (k % 2) * 3.4, 30 + k * 4.4, 'dark', { noAO: true });
    box(14, 0, 56, 30, 4, 62, 'tile', { tex: 4 }); // north wing (the tower stands on it)
    kit().visBox(13.9, 0, 51, 14, 2.4, 53.4, 'dark', { noAO: true }); // basement doorway
    box(12.4, 0, 49.6, 13.2, 1, 51, 'cloth', { tex: 1 }); box(12.4, 0, 53.4, 13.2, 1, 54.8, 'cloth', { tex: 1 });
    // cover: wrecks, rubble, sandbags, the bus
    const car = (x, z, along) => along ? box(x - 0.9, 0, z - 2.1, x + 0.9, 1.4, z + 2.1, 'burnt', { tex: 2 }) : box(x - 2.1, 0, z - 0.9, x + 2.1, 1.4, z + 0.9, 'burnt', { tex: 2 });
    car(-6, 10, true); car(8, 20, false); car(-12, 33, false); car(9, 44, true);
    box(3.5, 0, 8.4, 6.5, 1.2, 10.2, R); box(-3, 0, 12.6, 1, 1.1, 13.4, 'cloth'); box(-9.5, 0, 20, -6.5, 1.1, 21, 'barrier');
    box(0.5, 0, 22.5, 3.5, 1.3, 24, R); box(-4, 0, 27, -1.4, 3, 37, 'burnt', { tex: 2 }); // the bus
    box(4, 0, 30, 6, 1.1, 31, 'cloth'); box(-10, 0, 43, -7, 1.3, 45, R); box(2, 0, 49, 5, 1.2, 50.5, R); box(-5, 0, 55, -2, 1.3, 57, R);
    box(-16, 0, 14, -13, 2, 18, R); box(-18, 0, 38, -15, 1.6, 42, R); box(6, 0, 58, 10, 1.4, 60, R);
    finishLevel({ x0: -30, z0: -6, x1: 30, z1: 70 });
    // the sniper tower: separate meshes + colliders so it can come down
    const tower = new THREE.Group(), tMat = VG.Map.kit.mats().concrete, cols = [];
    const tb = (x0, y0, z0, x1, y1, z1) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), tMat);
      m.position.set((x0 + x1) / 2 - 22, (y0 + y1) / 2, (z0 + z1) / 2 - 62); m.castShadow = m.receiveShadow = true; tower.add(m);
      cols.push(P.add({ x0, y0, z0, x1, y1, z1, mat: 'concrete', pen: false, walk: false, cover: true }));
    };
    tb(15, 4, 56.5, 16, 14, 57.5); tb(20, 4, 56.5, 21, 14, 57.5); tb(15, 4, 60.5, 16, 14, 61.5); tb(20, 4, 60.5, 21, 14, 61.5);
    tb(15, 9, 56.5, 21, 9.3, 61.5); tb(14.8, 13.7, 56.3, 21.2, 14, 61.7);
    tb(14.8, 14, 61.4, 21.2, 15.1, 61.7); tb(20.9, 14, 56.3, 21.2, 15.1, 61.7); tb(14.8, 14, 56.3, 16.5, 15, 56.6);
    tower.position.set(22, 0, 62); level.scene.add(tower);
    ch2.tower = tower; ch2.towerCols = cols;
    // glint
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: VG.Tex.flash(), color: 0xfff6d0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glint.scale.setScalar(0.9); glint.visible = false; level.scene.add(glint); ch2.glint = glint;
    // fire light (after a strike)
    ch2.fire = new THREE.PointLight(0xff7a2a, 0, 26, 1.6); ch2.fire.position.set(16, 3, 54); level.scene.add(ch2.fire);
    level.extra = (dt) => {
      const s = ch2.sniper;
      if (s && s.alive && s.target === G.player && s.visible) {
        glint.visible = true; glint.position.set(s.pos.x - Math.sin(s.aimYaw) * 0.5, s.pos.y + 1.55, s.pos.z - Math.cos(s.aimYaw) * 0.5);
        glint.material.opacity = 0.5 + Math.sin(G.now * 20) * 0.5;
      } else glint.visible = false;
      if (ch2.fire.intensity > 0) ch2.fire.intensity = 16 + Math.random() * 6;
    };
    setCP(0, 0, 1, PI);
  };
  chapter2.setup = function () {
    squaddie('Rourke', -1.5, 0, -1, PI, -1.6, 1.2);
    if (!flags.davisDead) { const d = squaddie('Davis', 1.5, 0, -1.5, PI, 1.6, 1.4); d.quiet = true; }
    squaddie('Kovač', 0, 0, -3, PI, 0, 2.4);
    ch2.riflemen = [insurgent(6, 0, 40, PI), insurgent(-10, 0, 46, PI), insurgent(3.5, 0, 52, PI), insurgent(-4, 0, 58, PI)];
    const s = ch2.sniper = mkBot('Sniper', 1, 18, 14, 59, PI * 0.82, 'sniper');
    s.hold = true; s.holdYaw = PI * 0.82; s.aimMul = 0.28; s.dmgMul = 1.05; s.invuln = true; s.deaf = true; style(s, 'insurgent');
    ch2.civs = [figure('Woman', 14.6, 0, 51.5, -PI / 2, {}), figure('Old man', 14.7, 0, 53, -PI / 2, {}), figure('Girl', 14.4, 0, 52.2, -PI / 2, { crouch: true })];
    for (const c of ch2.civs) c.tH = c.tH < 1.5 ? 1.0 : 1.6;
    level.light = false;
    A.startAmbience({ rain: 0.9, drone: true, root: 65.4 });
  };
  chapter2.script = async function (tk) {
    const pl = p();
    S.letterbox(true); G.cinematic = true;
    await S.card([['small', 'OPERATION: ASHES OF VERDAN'], ['big', 'II. COLLATERAL PROTOCOL'], ['small', 'St. Agnes Hospital Square · 17:40 · Day 33']], 2.2); guard(tk);
    const lines = [
      ['KOVAČ', 'Locals say forty people are sheltering in the hospital basement. Kids, mostly.'],
      ['ROURKE', 'Tower on the north wing has a shooter. Stay off the open ground.'],
    ];
    if (flags.davisDead) lines.push(['ROURKE', 'Davis would have hated this rain.']);
    else lines.push(['KOVAČ', 'Davis. You good?'], ['ROURKE', 'Leave him. He hasn\'t said a word since Block 17.']);
    if (flags.motherKilled) lines.push(['KOVAČ', 'The baby\'s with the Red Cross. In case anyone was wondering.']);
    await say(lines); guard(tk);
    S.letterbox(false); G.cinematic = false;
    S.objective('Advance to the burnt-out bus · use cover');
    await until(() => inZone(-8, 25, 3, 39)); guard(tk);
    setCP(-5.2, 0, 32, PI);
    // pinned
    S.objective('');
    for (let i = 0; i < 2; i++) { A.shot('sniper', false, 18, 59); FX.impact(-2.6, 2.6 + i * 0.3, 37.05, 0, 0, 1, 'metal'); await wait(0.9); }
    await say([
      ['ROURKE', 'We\'re pinned! He\'s got the whole square!'],
      ['OVERLORD', 'Hammer Two-One, OVERLORD. Mortar section has a fire mission ready on that tower. White phosphorus, then high explosive. Your call, Sergeant.', true],
      ['KOVAČ', 'Sean. The basement is under that tower. The basement is right under it.'],
      ['OVERLORD', 'Clock is running, Two-One.', true],
    ]); guard(tk);
    G.cinematic = true; G.freezeAI = true;
    lookAt(new THREE.Vector3(18, 12, 59), 2.5);
    const d = await S.decide({
      prompt: 'OVERLORD is waiting for your authorization.',
      time: 5, timeoutValue: 'silent',
      options: [{ key: 'F', label: 'CALL THE STRIKE', value: 'strike' }, { key: 'E', label: 'REFUSE — WE GO ON FOOT', value: 'refuse' }],
    }); guard(tk);
    S.psyche.choices.ch2 = d.value;
    if (d.value !== 'refuse') {
      S.letterbox(true);
      if (d.value === 'silent') await say([['OVERLORD', 'No response, Two-One. Executing at my discretion.', true]]);
      else await say([['MILLER', '...Do it.'], ['OVERLORD', 'Shot, over.', true]]);
      guard(tk);
      for (let i = 0; i < 3; i++) { A.whistle(); await wait(0.7); }
      await wait(0.6); guard(tk);
      // impacts climb the tower, then it falls onto the north wing
      for (const [y, dz] of [[14, 0], [9, 1], [4, -1], [12, 2]]) { const x = 18 + Math.random(), z = 59 + dz; FX.explosion(x, y, z); A.explosion(x, z); FX.shake = 0.6; await wait(0.35); }
      const s = ch2.sniper; s.invuln = false; s.health = 0; s.alive = false; s.die({ x: 1, z: 0 }); s.model.visible = false;
      for (const c of ch2.towerCols) P.remove(c);
      let tt = 0;
      task((dt) => { tt += dt; const k = Math.min(1, tt / 2.4); ch2.tower.rotation.z = -k * k * 1.3; ch2.tower.position.y = -k * k * 3; return k >= 1; });
      await wait(1.6); guard(tk);
      FX.explosion(15, 1, 52); A.explosion(15, 52); FX.shake = 1;
      box(13, 0, 50, 15.5, 2.2, 55, 'rubble'); // the doorway is gone (collider only: smoke and fire cover it)
      const rubble = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 5.2), VG.Map.kit.mats().rubble); rubble.position.set(14.2, 1.1, 52.5); level.scene.add(rubble);
      for (const c of ch2.civs) { c.alive = false; c.model.visible = false; }
      ch2.fire.intensity = 18;
      await wait(1.5); guard(tk);
      A.cries(7, 0.07);
      lookAt(new THREE.Vector3(14, 1.5, 52.5), 1.5, true);
      await say([
        ['KOVAČ', 'Oh God. Oh God, they\'re still... can you hear that? On the net. Can you hear that?', true],
        ['ROURKE', 'Turn it off. Kovač. Turn the radio off.'],
        ['KOVAČ', 'There were kids in there, Miller. There were kids in there.'],
      ]); guard(tk);
      S.psyche.civilianCasualties += 23; S.guilt(d.value === 'silent' ? 42 : 40); S.trust(-20);
      if (d.value === 'silent') S.psyche.brokenVows++;
      T.remember('There were kids in there.'); T.remember('Can you hear that?');
      flags.strike = true;
      S.letterbox(false); G.cinematic = false; G.freezeAI = false; G.camHook = null;
      S.objective('Clear the square');
      await orTime(until(() => allDead(ch2.riflemen)), 120); guard(tk);
      S.objective('Move to the hospital');
      await until(() => inZone(8, 44, 14, 60)); guard(tk);
      await say([['ROURKE', 'We don\'t stop. If we stop, we don\'t get back up.']]); guard(tk);
      await chapterDone(tk, 1, [['small', 'The tower at St. Agnes fell at 17:52.'], ['small', 'Twenty-three bodies were recovered from the basement.'], ['small', 'The report listed them as enemy combatants.']]);
    } else {
      S.letterbox(true);
      await say([
        ['MILLER', 'Negative, OVERLORD. There are civilians under that tower. We go on foot.', true],
        ['OVERLORD', 'Your call, Sergeant. Your responsibility.', true],
        ['ROURKE', 'Alright. Alright. I\'ll draw him. You move on my mark.'],
      ]); guard(tk);
      S.letterbox(false); G.cinematic = false; G.freezeAI = false; G.camHook = null;
      S.objective('Cross the open ground to the hospital wall');
      await until(() => pl.pos.z > 39.5 || inZone(6, 26, 14, 60)); guard(tk);
      // hit in the open
      G.cinematic = true; G.freezeAI = true; S.objective('');
      A.shot('sniper', false, 18, 59); A.hurt(); FX.shake = 0.8; pl.health = 18; pl.lastHit = G.now; A.tinnitus(true); A.setMuffle(500, 0.2);
      FX.blood(pl.pos.x, pl.pos.y + 1.2, pl.pos.z, 0, 0, -1, false);
      const rourke = squad.find(s => s.name === 'Rourke');
      const ground = { x: pl.pos.x, z: pl.pos.z };
      G.camHook = (dt, real) => { // on your back in the rain, looking up
        const c = G.camera; c.position.set(pl.pos.x, pl.pos.y + 0.35, pl.pos.z);
        c.rotation.set(0.9, pl.yaw + Math.sin(G.now * 0.7) * 0.08, 0.3, 'YXZ'); G.vmRoot.visible = false;
      };
      rourke.follow = null;
      await moveAlong(rourke, [[ground.x - 0.8, ground.z - 0.6]], 6); guard(tk);
      await S.line('ROURKE', 'I\'ve got you. I\'ve got you, Sean. Stay with me.'); guard(tk);
      // drag toward the rubble
      let tt = 0; const from = { x: pl.pos.x, z: pl.pos.z }, to = { x: -8.5, z: 41.5 };
      await task((dt) => {
        tt += dt; const k = Math.min(1, tt / 3.2);
        pl.pos.x = from.x + (to.x - from.x) * k; pl.pos.z = from.z + (to.z - from.z) * k;
        rourke.pos.set(pl.pos.x - 0.7, 0, pl.pos.z - 0.5); rourke.aimYaw = rourke.yaw = yawTo(rourke.pos, from); rourke.vel.set(1, 0, 0);
        return k >= 0.8;
      }); guard(tk);
      A.shot('sniper', false, 18, 59); killScripted(rourke, { x: 18, z: 59 }); rourke.scriptedKill = true;
      squad.splice(squad.indexOf(rourke), 1);
      await wait(1.2); guard(tk);
      await say([
        ['ROURKE', 'Told you... stay off the open ground.'],
        ['ROURKE', 'Get up, Sean. Finish it. Don\'t let it be for nothing.'],
      ]); guard(tk);
      await wait(1.5);
      await say([['KOVAČ', 'Rourke? ROURKE!'], ['KOVAČ', 'He\'s reloading. Top of the tower. Take the shot, Miller. Take the shot!']]); guard(tk);
      A.tinnitus(false); A.setMuffle(20000, 1);
      pl.health = 45; G.camHook = null; G.cinematic = false; G.freezeAI = false;
      ch2.sniper.invuln = false; ch2.sniper.aimMul = 0.6;
      S.objective('Kill the sniper in the tower');
      await until(() => !ch2.sniper.alive); guard(tk);
      S.objective('Go to the hospital basement');
      await until(() => inZone(8, 46, 14, 58)); guard(tk);
      G.freezeAI = true; G.cinematic = true; S.letterbox(true);
      for (const c of ch2.civs) { c.tH = 1.75; c.surrender = false; }
      moveAlong(ch2.civs[0], [[12.4, 51.5]], 1.2); moveAlong(ch2.civs[1], [[12.6, 53.4]], 1);
      lookAt(new THREE.Vector3(13, 1.6, 52.4), 2);
      await say([
        ['WOMAN', 'You. You brought this here. You brought this to our street.'],
        ['OLD MAN', 'Your war. Your war, not ours. Look at us.'],
        ['WOMAN', 'Murderers. All of you. All of you.'],
        ['KOVAČ', 'Come on, Sean. Come on. Don\'t look at them. Come on.'],
      ]); guard(tk);
      S.guilt(20); S.trust(-5);
      T.remember('Get up, Sean. Finish it.'); T.remember('Your war, not ours.');
      flags.rourkeDead = true;
      await chapterDone(tk, 1, [['small', 'Corporal Elias Rourke was killed in action at 17:58.'], ['small', 'Forty-one people walked out of the basement of St. Agnes.'], ['small', 'None of them knew his name.']]);
    }
  };

  // =====================================================================
  // CHAPTER III — THE COST OF SURVIVAL (drainage tunnels under the dam)
  // =====================================================================
  const ch3 = {};
  function chapter3() {}
  chapter3.build = function () {
    newLevel({ bg: 0x020303, fog: [5, 38], sky: 0x2e4038, ground: 0x0e0e0e, hemi: 0.3, moon: 0, center: [0, -60], groundKey: false });
    const Wk = 'sewer';
    // floor + main tunnel (z 0 .. -60), 4 m wide
    box(-16, -0.5, -128, 16, 0, 4, 'rubble', { noAO: true, tex: 3 });
    box(-2.2, 0, -60, -2, 3.4, 2, Wk); box(2, 0, -56, 2.2, 3.4, 2, Wk); box(-2.2, 3.4, -62, 2.2, 3.8, 2, Wk, { noAO: true });
    box(-2.2, 0, 2, 2.2, 3.4, 2.4, Wk);
    // junction (side tunnels are dead ends)
    box(-14, 0, -64.2, -2.2, 3.4, -64, Wk); box(-14, 0, -56.2, -2, 3.4, -56, Wk); box(-14.2, 0, -64.2, -14, 3.4, -56, Wk);
    box(2.2, 0, -56.2, 14, 3.4, -56, Wk); box(2.2, 0, -64.2, 14, 3.4, -64, Wk); box(14, 0, -64.2, 14.2, 3.4, -56, Wk);
    box(2, 0, -60, 2.2, 3.4, -56.2, Wk);
    box(-14.2, 3.4, -64.2, 14.2, 3.8, -56, Wk, { noAO: true });
    // tunnel on to the pump hall (z -64 .. -90)
    box(-2.2, 0, -90, -2, 3.4, -64, Wk); box(2, 0, -90, 2.2, 3.4, -64, Wk); box(-2.2, 3.4, -90, 2.2, 3.8, -64, Wk, { noAO: true });
    // pump hall (z -90 .. -110), tall, with machinery
    box(-10.2, 0, -110, -10, 7, -90, Wk); box(10, 0, -110, 10.2, 7, -90, Wk);
    box(-10.2, 0, -90.2, -2.2, 7, -90, Wk); box(2.2, 0, -90.2, 10.2, 7, -90, Wk); box(-2.2, 3.4, -90.2, 2.2, 7, -90, Wk);
    box(-10.2, 7, -110.2, 10.2, 7.3, -90, Wk, { noAO: true });
    box(-10.2, 0, -110.2, -1.2, 7, -110, Wk); box(1.2, 0, -110.2, 10.2, 7, -110, Wk); box(-1.2, 2.4, -110.2, 1.2, 7, -110, Wk);
    for (const [x, z] of [[-6, -95], [6, -96], [-5.5, -104], [5.5, -104]]) box(x - 1.4, 0, z - 1.6, x + 1.4, 2.6, z + 1.6, 'metal', { tex: 2 });
    box(-1.5, 0, -100.5, 1.5, 1.2, -99.5, 'metal');
    // control room (z -110 .. -124)
    box(-6.2, 0, -124, -6, 3.6, -110, Wk); box(6, 0, -124, 6.2, 3.6, -110, Wk); box(-6.2, 0, -124.2, 6.2, 3.6, -124, Wk);
    box(-6.2, 3.6, -124.2, 6.2, 3.9, -110, Wk, { noAO: true });
    box(-3, 0, -123.9, 3, 1.2, -122.9, 'metal'); kit().visBox(-2.6, 1.2, -123.8, 2.6, 1.9, -123.2, 'dark', { noAO: true });
    // red emergency lamps
    for (let z = -6; z > -122; z -= 14) kit().visBox(-0.3, 3.25, z - 0.15, 0.3, 3.4, z + 0.15, 'redlamp', { noAO: true });
    finishLevel({ x0: -16, z0: -126, x1: 16, z1: 2 });
    const sc = level.scene;
    for (const [z, c, i] of [[-30, 0xff3020, 6], [-100, 0xff5030, 14], [-118, 0xffa060, 5]]) { const l = new THREE.PointLight(c, i, 22, 1.6); l.position.set(0, 3, z); sc.add(l); }
    // water
    const water = new THREE.Mesh(new THREE.PlaneGeometry(40, 140), new THREE.MeshStandardMaterial({ color: 0x15201c, roughness: 0.15, metalness: 0.5, transparent: true, opacity: 0.88 }));
    water.rotation.x = -PI / 2; water.position.set(0, 0.32, -62); sc.add(water); waterY = 0.32;
    // ghosts: the dead at the edge of your vision
    const gMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 2; i++) {
      const gh = new VG.Remote(G, 'ghost', 3, 90 + i, 'ghost' + i, false);
      gh.model.traverse(o => { if (o.isMesh) { o.material = gMat; o.castShadow = false; } else if (o.isSprite) o.visible = false; });
      for (const k in gh.guns) gh.guns[k].group.visible = false;
      gh.model.visible = false; ghosts.push({ gh, t: 0 });
    }
    level.extra = (dt, real) => {
      if (!ch3.ghostsOn) return;
      const pl = p(), fw = { x: -Math.sin(pl.yaw), z: -Math.cos(pl.yaw) };
      ghostT -= real;
      for (const g of ghosts) {
        if (!g.gh.model.visible) continue;
        g.t -= real;
        const dx = g.gh.model.position.x - pl.pos.x, dz = g.gh.model.position.z - pl.pos.z, d = Math.hypot(dx, dz) || 1;
        const dot = (dx * fw.x + dz * fw.z) / d;
        if (dot > 0.93 || g.t <= 0) { g.gh.model.visible = false; A.static(0.08, 0.04); } // gone the moment you look at them
      }
      if (ghostT <= 0) {
        const g = S.psyche.guiltLevel / 100;
        ghostT = (9 - g * 5) * (0.7 + Math.random() * 0.6);
        const free = ghosts.find(x => !x.gh.model.visible); if (!free) return;
        // in the periphery: 55-80 degrees off where you are looking
        const side = Math.random() < 0.5 ? -1 : 1, ang = pl.yaw + side * (55 + Math.random() * 25) * PI / 180, r = 4 + Math.random() * 4;
        const x = pl.pos.x - Math.sin(ang) * r, z = pl.pos.z - Math.cos(ang) * r;
        if (!P.fits(x, 0, z, 0.3, 1.7)) return;
        const m = free.gh.model; m.visible = true; m.position.set(x, 0, z); m.rotation.set(0, Math.atan2(pl.pos.x - x, pl.pos.z - z) + PI, 0);
        m.scale.y = Math.random() < 0.4 ? 0.7 : 1; free.t = 2 + Math.random() * 2;
        if (T.memories.length && Math.random() < 0.5) A.speakWhisper(T.memories[(Math.random() * T.memories.length) | 0], 0.18 + g * 0.2);
        else A.whisper(0.08 + g * 0.08);
      }
    };
    setCP(0, 0, -2, 0);
  };
  chapter3.setup = function () {
    if (!flags.rourkeDead) squaddie('Rourke', -1, 0, 0.5, 0, -1, 1.4);
    if (!flags.davisDead) squaddie('Davis', 1, 0, 0.8, 0, 1, 1.6);
    squaddie('Kovač', 0, 0, 1.2, 0, 0, 2.6);
    ch3.e1 = [insurgent(0.8, 0, -36, 0), insurgent(-1, 0, -50, 0, 'smg')];
    ch3.e2 = [insurgent(-6, 0, -99, 0), insurgent(6, 0, -100, 0), insurgent(0, 0, -106, 0, 'smg')];
    ch3.sorel = figure('Sorel', 0, 0, -121.6, 0, { crouch: true });
    ch3.sorel.mats.vest.color.setHex(0x3a3f45); ch3.sorel.scriptedKill = true; ch3.sorel.surrender = true;
    level.light = true; flags.mood = 'low';
    A.startAmbience({ drip: true, drone: true, root: 55 });
  };
  chapter3.script = async function (tk) {
    const pl = p(), ps = S.psyche;
    S.letterbox(true); G.cinematic = true;
    await S.card([['small', 'OPERATION: ASHES OF VERDAN'], ['big', 'III. THE COST OF SURVIVAL'], ['small', 'Verdan dam, drainage tunnels · 04:31 · Day 34']], 2.2); guard(tk);
    const lines = [['OVERLORD', 'Two-One, OVERLORD Actual. Sorel is wounded and cornered under the dam. Bring him to me.', true],
      ['OVERLORD', 'Correction. Do not bring him to me. Confirm the target is down, Sergeant. That is all I need.', true]];
    if (ps.squadTrust < 40) lines.push(['KOVAČ', 'Whatever you\'re going to do down there, Sean... I don\'t want to see it.']);
    else lines.push(['KOVAČ', 'Stay close. Whatever happens, we walk out of here together.']);
    await say(lines); guard(tk);
    S.letterbox(false); G.cinematic = false;
    S.objective('Find Sorel');
    await until(() => pl.pos.z < -56); guard(tk);
    setCP(0, 0, -58, 0);
    ch3.ghostsOn = true;
    await until(() => pl.pos.z < -67); guard(tk);
    // the way back is gone
    box(-2.2, 0, -57, 2.2, 3.4, -56.6, 'sewer');
    const seal = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.4, 0.4), VG.Map.kit.mats().sewer); seal.position.set(0, 1.7, -56.8); level.scene.add(seal);
    T.flicker(1.2); A.static(0.6, 0.12);
    await say([['KOVAČ', 'Sean... wasn\'t there a tunnel behind us? We came in that way. We came in that way.']]); guard(tk);
    setCP(0, 0, -70, 0);
    await until(() => pl.pos.z < -89); guard(tk);
    setCP(0, 0, -91, 0);
    S.objective('Clear the pump hall');
    await orTime(until(() => allDead(ch3.e2)), 100); guard(tk);
    await until(() => pl.pos.z < -100); guard(tk);
    const holdLine = ps.squadTrust < 35 ? ['KOVAČ', 'We\'ll hold the hall. Don\'t... just do what you\'re going to do.'] : ['KOVAČ', 'This one\'s yours, Sean. We\'ll hold the hall.'];
    await say([holdLine]); guard(tk);
    for (const s of squad) { s.follow = null; s.hold = true; s.holdYaw = PI; }
    S.objective('Go to the control room');
    await until(() => pl.pos.z < -113); guard(tk);
    ch3.ghostsOn = false;
    for (const g of ghosts) g.gh.model.visible = false;
    setCP(0, 0, -113, 0);

    // ---------- the reckoning ----------
    G.cinematic = true; G.freezeAI = true; S.letterbox(true); S.objective('');
    const head = new THREE.Vector3(0, 0.95, -121.6);
    lookAt(head, 2);
    await say([
      ['SOREL', 'Sergeant Miller. They sent you. Of course they sent you.'],
      ['SOREL', 'Do you know why Hale wants me dead and not in a cell? Kaserna. The ninth of March. Two hundred and six people in a school gymnasium.'],
      ['SOREL', 'Your colonel gave that order. I have the file. I sent copies out. They found the copies.'],
      ['SOREL', 'This is wired to the dam. If they bury it, I open the water on the Narrows. Then the whole world comes to look at what is left of Verdan. They will have to.'],
      ['MILLER', 'There are thirty thousand people in the Narrows.'],
      ['SOREL', 'There were two hundred and six in Kaserna. Nobody counted them either.'],
      ['OVERLORD', 'Two-One. Is the target down? Confirm the target is down. Do not take the drive. Do not open it.', true],
      ['SOREL', 'Choose, Sergeant. You have been choosing all week.'],
    ]); guard(tk);
    const broken = ps.guiltLevel >= 60 || (ps.brokenVows >= 1 && ps.guiltLevel >= 45);
    const opts = [{ key: 'F', label: 'EXECUTE HIM', value: 'soldier' }, { key: 'E', label: 'LOWER YOUR WEAPON — REACH FOR THE DETONATOR', value: 'martyr' }];
    if (broken) opts.push({ key: 'Q', label: 'LET IT END', value: 'monster' });
    const d = await S.decide({ prompt: 'Sorel holds the detonator. OVERLORD is waiting.', time: 6, timeoutValue: broken ? 'monster' : 'martyr', options: opts }); guard(tk);
    ps.choices.ch3 = d.value;
    G.store.set(SAVE, null);
    if (d.value === 'soldier') await endingSoldier(tk, head);
    else if (d.value === 'martyr') await endingMartyr(tk, head);
    else await endingMonster(tk, head);
  };

  // ---------- endings ----------
  async function endingSoldier(tk, head) {
    A.shot('ar', true); FX.playerFlash(G.camera.position.x, G.camera.position.y, G.camera.position.z);
    killScripted(ch3.sorel, p().pos);
    await wait(2); guard(tk);
    await say([
      ['OVERLORD', 'Good work, Two-One. Recover the drive and destroy it. That is an order.', true],
    ]); guard(tk);
    await wait(1.2); A.splash(); await wait(1.5); guard(tk);
    const ps = S.psyche, lines = [['big', 'THE SOLDIER'],
      ['small', 'Staff Sergeant Sean Miller was awarded the Silver Star for actions in Verdan.']];
    lines.push(flags.davisDead ? ['small', 'He gave the folded flag to Thomas Davis\'s mother himself. She asked if her son had been brave. He said yes.'] : ['small', 'Thomas Davis came home. They have not spoken since.']);
    if (flags.rourkeDead) lines.push(['small', 'Some mornings he still sets out two cups of coffee, and does not know why.']);
    if (ps.civilianCasualties > 0) lines.push(['small', 'He does not go to crowded places. He does not hold his nephew. He does not talk about Verdan.']);
    lines.push(['small', 'His wife left in the second year. She said she was married to a man who never came back.'], ['small', 'The Kaserna file was never found.']);
    await epilogue(tk, lines, 'soldier');
  }
  async function endingMartyr(tk, head) {
    await say([['MILLER', 'Give it to me. Nobody else has to die down here. Give it to me.'],
      ['SOREL', 'No. No, it is a timer. It was always a timer. I am sorry. I am so sorry.']]); guard(tk);
    for (let i = 0; i < 8; i++) { A.ui(); await wait(0.5 - i * 0.05); }
    A.explosion(0, -140); FX.shake = 1.5; A.waterRush(8);
    await wait(1.2); guard(tk);
    $('water').classList.add('on'); A.setMuffle(220, 2.5);
    G.camHook = (dt) => { const c = G.camera; c.position.y = Math.max(0.2, c.position.y - dt * 0.6); c.rotation.z += dt * 0.15; G.vmRoot.visible = false; };
    for (let i = 0; i < 6; i++) { A.heartbeatClear(0.6 - i * 0.08); await wait(1 + i * 0.35); }
    guard(tk);
    const lines = [['big', 'THE MARTYR'], ['small', 'The Verdan dam failed at 04:52.'],
      ['small', 'The water reached the Narrows nine minutes later. The official count was four hundred and twelve.'],
      ['small', 'Staff Sergeant Sean Miller\'s body was recovered from the drainage tunnels eleven days later.'],
      ['small', 'Command reported that the dam was destroyed by insurgent sabotage. That part was true.'],
      ['small', 'The Kaserna file was never found.']];
    await epilogue(tk, lines, 'martyr');
  }
  async function endingMonster(tk, head) {
    // he lays the rifle down in the water and sits; the light goes out
    G.camHook = (dt) => { const c = G.camera; c.position.y += (0.9 - c.position.y) * Math.min(1, dt * 0.8); c.rotation.x += (-0.25 - c.rotation.x) * Math.min(1, dt); G.vmRoot.visible = false; };
    A.splash(); await wait(1.5); guard(tk);
    for (let i = 0; i < 5; i++) { level.noLight = i % 2 === 0; await wait(0.15 + Math.random() * 0.3); }
    level.noLight = true;
    await wait(1); guard(tk);
    await S.line('SOREL', '...Sergeant?'); guard(tk);
    await wait(2); guard(tk);
    const ps = S.psyche, log = ['Audio log. Miller, S. I don\'t know what day it is.'];
    if (flags.motherKilled) log.push('There was a woman reaching into a drawer. I can still see her hands.');
    if (flags.davisDead) log.push('There was a boy who wanted his mother. I promised her. I promised her.');
    if (flags.strike) log.push('There were children under a tower. I said two words. Two words.');
    if (flags.rourkeDead) log.push('Rourke told me to get up. I got up. I don\'t know what for.');
    log.push('They gave us rules so we would not have to be people in here. It didn\'t work. It never works.',
      'I keep asking what any of it was supposed to mean. What it means to be human, if this is what humans do.',
      'I\'m going to sit here a while. I\'m so tired. End log.');
    await S.say(log.map(t2 => ({ who: 'AUDIO LOG', text: t2, radio: true, dur: 2.6 }))); guard(tk);
    await epilogue(tk, [['big', 'THE MONSTER'],
      ['small', 'Staff Sergeant Sean Miller was listed as missing in action.'],
      ['small', 'He was never found.'],
      ['small', 'A detonator was recovered from the water beside the dam console. It had not been armed.'],
      ['small', 'Of the tape, only the last minute was ever played. It was entered into evidence and sealed.']], 'monster');
  }
  async function epilogue(tk, lines, kind) {
    S.letterbox(false);
    $('fade').classList.add('on'); await wait(2); guard(tk);
    A.stopAmbience(); A.setMuffle(20000, 1);
    $('water').classList.remove('on');
    await S.card(lines, 4); guard(tk);
    const ps = S.psyche;
    $('ceTitle').textContent = { soldier: 'THE SOLDIER', martyr: 'THE MARTYR', monster: 'THE MONSTER' }[kind];
    $('ceStats').innerHTML = [
      ['GUILT', ps.guiltLevel], ['CIVILIANS KILLED', ps.civilianCasualties], ['SQUAD TRUST', ps.squadTrust], ['BROKEN VOWS', ps.brokenVows],
      ['DAVIS', flags.davisDead ? 'K.I.A.' : 'CAME HOME'], ['ROURKE', flags.rourkeDead ? 'K.I.A.' : 'CAME HOME'],
    ].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
    $('campEnd').classList.remove('hidden');
    G.running = false;
    if (document.exitPointerLock) document.exitPointerLock();
    $('hud').classList.add('hidden');
    A.cello(98, 9);
  }

  // ---------- menu wiring ----------
  $('campBtn').addEventListener('click', () => { A.init(); A.ui(); C.open(); });
  $('campBegin').addEventListener('click', () => { A.init(); A.ui(); G.store.set(SAVE, null); C.begin(false); });
  $('campContinue').addEventListener('click', () => { A.init(); A.ui(); C.begin(true); });
  $('campBack').addEventListener('click', () => { A.ui(); $('campWarn').classList.add('hidden'); $('menu').classList.remove('hidden'); });
  $('ceMenu').addEventListener('click', () => { A.ui(); C.stop(); G.quitToMenu(); G.mode = null; });
  // test hook: jump straight to a chapter with a given psyche
  C._jump = (n, psyche, f) => { S.reset(); if (psyche) Object.assign(S.psyche, psyche); flags = f || {}; T.memories = []; startChapter(n); };
  C._flags = () => flags;
})();
