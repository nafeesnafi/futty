// HUD: radar, compass, ammo, killstreaks, killfeed, hitmarkers, banners, damage indicators, scoreboard.
(function () {
  const VG = window.VG = window.VG || {};
  const H = VG.HUD = {};
  const $ = (id) => document.getElementById(id);
  let el, game, mapImg, radarCtx, compCtx, last = {};
  const PXM = 4; // map image pixels per metre
  const HEAD_SVG = '<svg viewBox="0 0 16 16"><circle cx="8" cy="7" r="5" fill="none" stroke="#ff4b3e" stroke-width="1.6"/><path d="M8 0v4M8 10v6M0 7h4M12 7h4" stroke="#ff4b3e" stroke-width="1.6"/></svg>';

  H.init = function (g) {
    game = g; last = {};
    el = {};
    for (const id of ['hud', 'blood', 'vignette', 'dmgDirs', 'scope', 'breath', 'uavTag', 'sbYou', 'sbLead', 'sbYouLbl', 'sbLeadLbl', 'timer', 'goal',
      'killfeed', 'crosshair', 'hitmarker', 'aimName', 'banner', 'bannerMain', 'bannerSub', 'popups', 'hint', 'ksUav', 'ksAir', 'streakFill', 'streakNum',
      'wpnName', 'ammoNums', 'mag', 'reserve', 'pips', 'wpnSlots', 'healthBar', 'healthFill', 'fps', 'death', 'killer', 'respawnIn', 'board', 'boardBody', 'boardMode', 'boardGoal']) el[id] = $(id);
    el.killfeed.innerHTML = ''; el.popups.innerHTML = ''; el.dmgDirs.innerHTML = '';
    radarCtx = $('radar').getContext('2d'); compCtx = $('compass').getContext('2d');
    el.goal.textContent = `FIRST TO ${g.killGoal}` + (g.mode === 'tdm' ? ' · TEAM DEATHMATCH' : ' · FREE-FOR-ALL');
    el.sbYouLbl.textContent = g.mode === 'tdm' ? 'FRIENDLY' : 'YOU';
    el.sbLeadLbl.textContent = g.mode === 'tdm' ? 'ENEMY' : 'LEADER';
    buildMapImage();
  };

  function buildMapImage() {
    const b = VG.Map.BOUNDS, w = (b.x1 - b.x0) * PXM, h = (b.z1 - b.z0) * PXM;
    mapImg = document.createElement('canvas'); mapImg.width = w; mapImg.height = h;
    const c = mapImg.getContext('2d');
    c.fillStyle = 'rgba(40,52,44,.92)'; c.fillRect(0, 0, w, h);
    const boxes = VG.Phys.boxes.slice().sort((a, b2) => a.y1 - b2.y1);
    for (const bx of boxes) {
      if (bx.y1 < 0.8) continue;
      const shade = bx.y0 > 2 ? 150 : Math.min(200, 95 + bx.y1 * 14);
      c.fillStyle = `rgb(${shade},${shade + 8},${shade})`;
      c.fillRect((bx.x0 - b.x0) * PXM, (bx.z0 - b.z0) * PXM, Math.max(1, (bx.x1 - bx.x0) * PXM), Math.max(1, (bx.z1 - bx.z0) * PXM));
    }
  }

  // ---------- events ----------
  let hmTimer = 0;
  H.hitmarker = function (kind) {
    const h = el.hitmarker;
    h.className = kind === 'kill' ? 'kill' : kind === 'head' ? 'head' : '';
    h.style.transition = 'none'; h.style.opacity = 1; h.style.transform = 'scale(1.35)';
    void h.offsetWidth;
    h.style.transition = 'opacity .28s ease-in .06s, transform .12s ease-out'; h.style.transform = 'scale(1)'; h.style.opacity = 0;
    hmTimer = 0.4;
  };

  function nameSpan(a) {
    const cls = a.isPlayer ? 'me' : (game.mode === 'tdm' ? (a.team === game.player.team ? 'al' : 'en') : 'en');
    return `<span class="${cls}">${a.name}</span>`;
  }
  H.killfeed = function (killer, victim, def, head) {
    const d = document.createElement('div');
    d.className = 'kf';
    d.innerHTML = killer ? `${nameSpan(killer)}<span class="w">${def ? def.icon : '✹'}</span>${head ? HEAD_SVG : ''}${nameSpan(victim)}` : `${nameSpan(victim)}<span class="w">☠</span>`;
    el.killfeed.prepend(d);
    while (el.killfeed.children.length > 6) el.killfeed.lastChild.remove();
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 450); }, 5500);
  };
  H.popup = function (text, pts, medal) {
    const d = document.createElement('div');
    d.className = 'pop' + (medal ? ' medal' : '');
    d.innerHTML = (pts ? `<b>+${pts}</b>` : '') + text;
    el.popups.appendChild(d);
    while (el.popups.children.length > 5) el.popups.firstChild.remove();
    setTimeout(() => d.remove(), 1700);
  };
  H.banner = function (main, sub) {
    el.bannerMain.textContent = main; el.bannerSub.textContent = sub || '';
    el.banner.classList.remove('show'); void el.banner.offsetWidth; el.banner.classList.add('show');
  };
  H.damage = function (fromX, fromZ) {
    const p = game.player;
    const ang = Math.atan2(fromX - p.pos.x, -(fromZ - p.pos.z)); // bearing of attacker, N = 0
    const heading = -p.yaw;
    const rel = ang - heading;
    const d = document.createElement('div');
    d.className = 'dmgDir'; d.style.transform = `rotate(${rel}rad)`;
    d.style.transition = 'opacity 1.4s ease-in .4s';
    el.dmgDirs.appendChild(d);
    requestAnimationFrame(() => { d.style.opacity = 0; });
    setTimeout(() => d.remove(), 1900);
  };
  H.setDeath = function (on, killer, label) {
    el.death.classList.toggle('hidden', !on);
    el.death.querySelector('.by').textContent = label ? '' : 'KILLED BY';
    if (on) el.killer.textContent = label || (killer ? killer.toUpperCase() : 'YOURSELF');
  };
  H.showBoard = function (on) { el.board.classList.toggle('hidden', !on); if (on) H.renderBoard(); };

  H.renderBoard = function () {
    const g = game;
    el.boardMode.textContent = g.mode === 'tdm' ? 'TEAM DEATHMATCH' : 'FREE-FOR-ALL';
    el.boardGoal.textContent = `FIRST TO ${g.killGoal}`;
    const row = (a, i) => {
      const kd = (a.kills / Math.max(1, a.deaths)).toFixed(2);
      const cls = g.mode === 'tdm' && !a.isPlayer ? (a.team === g.player.team ? 'al' : 'en') : '';
      return `<tr class="${a.isPlayer ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td>${i + 1}</td><td class="${cls}">${a.name}</td><td>${a.isPlayer ? VG.WEAPONS[a.cur].name : a.def ? a.def.name : '-'}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${kd}</td><td>${a.score}</td></tr>`;
    };
    const sorted = g.actors.slice().sort((a, b) => b.kills - a.kills || b.score - a.score);
    if (g.mode === 'tdm') {
      let html = '';
      for (const t of [g.player.team, 1 - g.player.team]) {
        html += `<tr class="teamRow"><td colspan="7">${t === g.player.team ? 'FRIENDLY' : 'ENEMY'} · ${g.teamKills[t]}</td></tr>`;
        sorted.filter(a => a.team === t).forEach((a, i) => { html += row(a, i); });
      }
      el.boardBody.innerHTML = html;
    } else el.boardBody.innerHTML = sorted.map(row).join('');
  };

  // ---------- per-frame ----------
  function set(key, val, fn) { if (last[key] !== val) { last[key] = val; fn(val); } }

  H.update = function (dt, now) {
    const g = game, p = g.player, d = VG.WEAPONS[p.cur], a = p.ammo[p.cur];
    // ammo
    set('wpn', p.cur, () => {
      el.wpnName.textContent = d.name;
      el.pips.className = d.mag <= 8 ? 'big' : '';
      [...el.wpnSlots.children].forEach((s, i) => s.classList.toggle('on', VG.WEAPON_ORDER[i] === p.cur));
      last.mag = null;
    });
    set('mag', a.mag, (m) => {
      el.mag.textContent = m;
      el.ammoNums.classList.toggle('low', m <= Math.ceil(d.mag * 0.25));
      let html = ''; for (let i = 0; i < d.mag; i++) html += i < m ? '<i></i>' : '<i class="e"></i>';
      el.pips.innerHTML = html;
    });
    set('res', a.reserve, (r) => { el.reserve.textContent = r; });
    // hint line
    let hint = '';
    if (p.alive) {
      if (p.reload) hint = 'RELOADING…';
      else if (a.mag === 0 && a.reserve === 0) hint = 'NO AMMO · SWITCH WEAPON';
      else if (a.mag <= Math.ceil(d.mag * 0.25)) hint = g.touch ? 'TAP R TO RELOAD' : `PRESS [${g.keyLabel('reload')}] TO RELOAD`;
      if (g.uavReady && !hint) hint = g.touch ? 'UAV READY' : `UAV READY · PRESS [${g.keyLabel('uav')}]`;
      if (g.airReady && !hint) hint = g.touch ? 'AIRSTRIKE READY · AIM AND TAP' : `AIRSTRIKE READY · PRESS [${g.keyLabel('air')}]`;
    }
    set('hint', hint, (h) => { el.hint.textContent = h; });

    // health / damage
    const hurt = p.alive ? 1 - p.health / 100 : 0.8;
    el.vignette.style.opacity = Math.min(1, hurt * 1.25).toFixed(2);
    el.blood.style.opacity = Math.max(0, (hurt - 0.25) * 1.4).toFixed(2);
    el.healthBar.classList.toggle('show', p.health < 100 && p.alive);
    el.healthFill.style.width = p.health + '%';

    // crosshair
    const ads = p.ads > 0.6 || !p.alive;
    const gap = Math.max(4, Math.tan(p.spreadNow * Math.PI / 180) / Math.tan(g.camera.fov * Math.PI / 360) * innerHeight / 2);
    el.crosshair.style.opacity = ads || p.sprint ? 0 : 1;
    const ch = el.crosshair.children;
    ch[0].style.top = (-gap - 9) + 'px'; ch[1].style.top = gap + 'px';
    ch[2].style.left = (-gap - 9) + 'px'; ch[3].style.left = gap + 'px';
    el.crosshair.classList.toggle('enemy', !!g.aimTarget && g.hostile(p, g.aimTarget));
    set('aim', g.aimTarget ? g.aimTarget.name + (g.hostile(p, g.aimTarget) ? '' : '+') : '', (n) => {
      const ally = n.endsWith('+');
      el.aimName.textContent = ally ? n.slice(0, -1) : n;
      el.aimName.style.color = ally ? 'var(--ally)' : 'var(--enemy)';
    });

    // scope
    el.scope.style.opacity = p.scopedNow ? 1 : 0;
    el.breath.textContent = p.breathOut ? 'OUT OF BREATH' : p.holdingBreath ? 'HOLDING BREATH' : (g.touch ? 'HOLD STEADY TO AIM' : `HOLD [${g.keyLabel('sprint')}] TO STEADY`);

    // killstreaks
    const s = p.streak;
    el.streakFill.style.width = Math.min(100, s / 5 * 100) + '%';
    set('streak', s, (v) => { el.streakNum.textContent = `STREAK ${v}`; });
    el.ksUav.className = 'streakRow' + (g.uavReady ? ' ready' : g.uavT > 0 ? ' active' : '');
    el.ksAir.className = 'streakRow' + (g.airReady ? ' ready' : g.airPending ? ' active' : '');
    el.uavTag.classList.toggle('on', g.uavT > 0);

    // score / timer
    let you, lead;
    if (g.mode === 'tdm') { you = g.teamKills[p.team]; lead = g.teamKills[1 - p.team]; }
    else { you = p.kills; lead = Math.max(0, ...g.actors.filter(x => x !== p).map(x => x.kills)); }
    set('you', you, (v) => { el.sbYou.textContent = v; });
    set('lead', lead, (v) => { el.sbLead.textContent = v; });
    const left = Math.max(0, g.timeLeft), mm = Math.floor(left / 60), ss = Math.floor(left % 60);
    set('time', mm + ':' + ss, () => { el.timer.textContent = `${mm}:${String(ss).padStart(2, '0')}`; });

    // death
    if (!p.alive) el.respawnIn.textContent = g.respawnT > 0 ? `RESPAWN IN ${g.respawnT.toFixed(1)}` : (g.net && !g.net.isHost() ? 'RESPAWNING…' : g.touch ? 'TAP TO RESPAWN' : 'CLICK TO RESPAWN');
    if (!el.board.classList.contains('hidden') && (H._bt = (H._bt || 0) + dt) > 0.5) { H._bt = 0; H.renderBoard(); }

    drawRadar(now); drawCompass(now);
  };

  function blipVisible(e, now) {
    const g = game;
    if (!e.alive || e === g.player) return 0;
    if (!g.hostile(g.player, e)) return 2; // ally
    if (now - e.lastFired < 2.2) return 1;
    return 0;
  }

  function drawRadar(now) {
    const c = radarCtx, g = game, p = g.player, R = 100, scale = 2.4 / PXM;
    const b = VG.Map.BOUNDS;
    c.clearRect(0, 0, 200, 200);
    c.save();
    c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(12,16,13,.85)'; c.fillRect(0, 0, 200, 200);
    c.translate(R, R); c.rotate(p.yaw); c.scale(scale, scale);
    c.drawImage(mapImg, -(p.pos.x - b.x0) * PXM, -(p.pos.z - b.z0) * PXM);
    // UAV sweep: snapshots of every enemy, refreshed every 2 s
    const toMap = (x, z) => [(x - p.pos.x) * PXM, (z - p.pos.z) * PXM];
    for (const e of g.actors) {
      let vis = blipVisible(e, now), x = e.pos.x, z = e.pos.z;
      if (!vis && g.uavT > 0 && g.hostile(p, e) && e.alive && g.uavSnap.has(e)) { vis = 3; [x, z] = g.uavSnap.get(e); }
      if (!vis) continue;
      const [mx, my] = toMap(x, z);
      c.fillStyle = vis === 2 ? '#4fb6ff' : '#ff4b3e';
      c.beginPath(); c.arc(mx, my, (vis === 1 ? 2.2 : 1.8) / scale * 1.6, 0, Math.PI * 2); c.fill();
    }
    // airstrike marker
    if (g.airPending) {
      const [mx, my] = toMap(g.airPending.x, g.airPending.z);
      c.strokeStyle = '#ffcc4d'; c.lineWidth = 2 / scale; c.beginPath(); c.arc(mx, my, 7 * PXM, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
    // sweep line when UAV is up
    if (g.uavT > 0) {
      const a = (now * 2.4) % (Math.PI * 2);
      const gr = c.createConicGradient ? c.createConicGradient(a - 0.6, R, R) : null;
      if (gr) {
        gr.addColorStop(0, 'rgba(159,211,86,0)'); gr.addColorStop(0.095, 'rgba(159,211,86,.28)'); gr.addColorStop(0.1, 'rgba(159,211,86,0)');
        c.fillStyle = gr; c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.fill();
      }
    }
    // player arrow + view cone
    c.fillStyle = 'rgba(255,255,255,.08)';
    c.beginPath(); c.moveTo(R, R); c.arc(R, R, R, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); c.fill();
    c.fillStyle = '#ffcc4d';
    c.beginPath(); c.moveTo(R, R - 7); c.lineTo(R + 5, R + 5); c.lineTo(R, R + 2); c.lineTo(R - 5, R + 5); c.closePath(); c.fill();
  }

  function drawCompass(now) {
    const c = compCtx, W = 460, Hh = 38, g = game, p = g.player;
    c.clearRect(0, 0, W, Hh);
    const heading = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const pxPerDeg = W / 180;
    const grd = c.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.15, 'rgba(0,0,0,.45)'); grd.addColorStop(0.85, 'rgba(0,0,0,.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grd; c.fillRect(0, 4, W, 22);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let deg = 0; deg < 360; deg += 15) {
      let rel = deg - heading; rel = ((rel + 540) % 360) - 180;
      if (Math.abs(rel) > 90) continue;
      const x = W / 2 + rel * pxPerDeg, fade = 1 - Math.abs(rel) / 95;
      c.globalAlpha = fade;
      if (labels[deg] !== undefined) {
        c.fillStyle = deg % 90 === 0 ? '#f2f4ee' : 'rgba(242,244,238,.75)';
        c.font = `${deg % 90 === 0 ? 700 : 600} ${deg % 90 === 0 ? 17 : 13}px Rajdhani, sans-serif`;
        c.fillText(labels[deg], x, 15);
      } else {
        c.fillStyle = 'rgba(242,244,238,.6)'; c.fillRect(x - 0.5, 9, 1, 10);
        c.font = '600 10px Rajdhani, sans-serif'; c.fillText(String(deg), x, 30);
      }
    }
    // enemy fire markers
    for (const e of g.actors) {
      if (blipVisible(e, now) !== 1) continue;
      const brg = Math.atan2(e.pos.x - p.pos.x, -(e.pos.z - p.pos.z)) * 180 / Math.PI;
      let rel = brg - heading; rel = ((rel + 540) % 360) - 180;
      if (Math.abs(rel) > 90) continue;
      c.globalAlpha = 1 - (now - e.lastFired) / 2.2;
      c.fillStyle = '#ff4b3e';
      const x = W / 2 + rel * pxPerDeg;
      c.beginPath(); c.moveTo(x, 26); c.lineTo(x - 5, 34); c.lineTo(x + 5, 34); c.fill();
    }
    c.globalAlpha = 1;
    c.fillStyle = '#ffcc4d'; c.fillRect(W / 2 - 1, 2, 2, 6);
    if ((H._f = (H._f || 0) + 1) % 15 === 0 && g.showFps) el.fps.textContent = Math.round(g.fps) + ' FPS';
    if (!g.showFps) el.fps.textContent = '';
  }
})();
