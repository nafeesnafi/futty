// Deathmatch bots: soldier models plus a state machine (patrol -> investigate -> engage -> take cover).
(function () {
  const VG = window.VG = window.VG || {};
  const P = VG.Phys, N = VG.Nav, A = VG.Audio;
  const D2R = Math.PI / 180;
  const v1 = new THREE.Vector3();

  VG.CALLSIGNS = ['Ghost', 'Soap', 'Price', 'Viper', 'Reaper', 'Gaz', 'Roach', 'Nikolai', 'Havoc', 'Shadow', 'Kilo', 'Rook'];

  // difficulty tables: Recruit, Regular, Veteran
  const DIFF = {
    reaction: [0.7, 0.45, 0.26], aimErr: [4.2, 2.6, 1.5], turn: [4, 6.5, 10], dmg: [0.5, 0.72, 0.92], head: [0.04, 0.1, 0.2],
  };
  const CAMO = [[0x5b5a3c, 0x6b6a48], [0x4a4f3e, 0x3d4232], [0x6e6450, 0x8a7c5e], [0x3f4448, 0x2f3438], [0x5c4b3a, 0x786451], [0x46503c, 0x58614a]];

  function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  const rnd = (a, b) => a + Math.random() * (b - a);

  class Bot {
    constructor(game, name, team, idx) {
      this.game = game; this.name = name; this.team = team; this.isPlayer = false;
      this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
      this.radius = 0.35; this.height = 1.8; this.onGround = false; this.stepUp = 0;
      this.kills = 0; this.deaths = 0; this.score = 0; this.streak = 0;
      this.alive = false; this.health = 100; this.lastHit = -99; this.lastFired = -99;
      this.buildModel(idx);
    }

    buildModel(idx) {
      const g = this.game, [pants, vest] = CAMO[idx % CAMO.length];
      const mPants = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.95 });
      const mVest = new THREE.MeshStandardMaterial({ color: vest, roughness: 0.9 });
      const mSkin = new THREE.MeshStandardMaterial({ color: [0xc69c7d, 0x8d5f43, 0xe0b899, 0x6b4630][idx % 4], roughness: 0.8 });
      const mDark = new THREE.MeshStandardMaterial({ color: 0x1f2020, roughness: 0.8 });
      const teamCol = g.mode === 'tdm' ? (this.team === 0 ? 0x2f8fe0 : 0xd8352a) : 0x9a2a20;
      const mBand = new THREE.MeshStandardMaterial({ color: teamCol, roughness: 0.6, emissive: teamCol, emissiveIntensity: 0.25 });
      const box = (parent, w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
      const root = new THREE.Group();
      // legs (pivot at hip)
      this.legs = [-0.11, 0.11].map(x => {
        const piv = new THREE.Group(); piv.position.set(x, 0.92, 0); root.add(piv);
        box(piv, 0.18, 0.84, 0.2, mPants, 0, -0.42, 0);
        box(piv, 0.2, 0.12, 0.28, mDark, 0, -0.86, -0.04); // boot
        return piv;
      });
      const upper = new THREE.Group(); upper.position.y = 0.92; root.add(upper); this.upper = upper;
      box(upper, 0.44, 0.6, 0.26, mPants, 0, 0.3, 0);
      box(upper, 0.48, 0.44, 0.34, mVest, 0, 0.34, 0);
      box(upper, 0.16, 0.12, 0.06, mDark, -0.1, 0.26, -0.19); box(upper, 0.16, 0.12, 0.06, mDark, 0.1, 0.26, -0.19); // pouches
      box(upper, 0.3, 0.32, 0.12, mDark, 0, 0.36, 0.22); // backpack
      const head = new THREE.Group(); head.position.y = 0.72; upper.add(head);
      box(head, 0.22, 0.24, 0.24, mSkin, 0, 0, 0);
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mVest);
      helmet.position.y = 0.04; helmet.castShadow = true; head.add(helmet);
      this.helmet = helmet; this.mats = { pants: mPants, vest: mVest, skin: mSkin, band: mBand };
      box(head, 0.2, 0.05, 0.03, mDark, 0, 0.03, -0.125); // goggles strap
      // arms holding the rifle forward
      const ra = box(upper, 0.12, 0.12, 0.42, mVest, 0.2, 0.4, -0.18); ra.rotation.x = 0.25;
      const la = box(upper, 0.12, 0.12, 0.5, mVest, -0.16, 0.42, -0.3); la.rotation.set(0.15, 0.5, 0);
      box(upper, 0.13, 0.06, 0.13, mBand, 0.2, 0.48, -0.02); // team armband
      box(upper, 0.13, 0.06, 0.13, mBand, -0.22, 0.48, -0.02);
      this.guns = {};
      for (const id of VG.WEAPON_ORDER) {
        const gm = VG.buildBotGun(id);
        gm.group.position.set(0.09, 0.42, -0.32); upper.add(gm.group); gm.group.visible = false;
        this.guns[id] = gm;
      }
      // ally name tag (TDM)
      if (g.mode === 'tdm' && this.team === g.player.team) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: VG.Tex.label(this.name, '#5cc2ff'), depthTest: false, transparent: true }));
        sp.scale.set(1.2, 0.3, 1); sp.position.y = 2.15; sp.renderOrder = 5; root.add(sp);
      }
      root.visible = false;
      g.scene.add(root);
      this.model = root;
    }

    spawn(x, z, yaw) {
      this.pos.set(x, 0, z); this.vel.set(0, 0, 0);
      this.health = 100; this.alive = true; this.lastHit = -99; this.streak = 0;
      this.yaw = this.aimYaw = yaw; this.aimPitch = 0; this.height = 1.8;
      const r = Math.random();
      this.wpn = r < 0.45 ? 'ar' : r < 0.8 ? 'smg' : 'sniper';
      for (const id in this.guns) this.guns[id].group.visible = id === this.wpn;
      this.def = VG.WEAPONS[this.wpn]; this.mag = this.def.mag; this.reloadT = 0;
      this.state = 'patrol'; this.target = null; this.path = null; this.pi = 0; this.goal = null;
      this.lastSeen = -99; this.lastKnown = null; this.reactT = 0; this.nextShot = 0; this.burst = 0;
      this.nextThink = 0; this.strafe = 0; this.strafeT = 0; this.coverNode = null; this.coverT = 0;
      this.stuckT = 0; this.skipT = 0; this.lastProgress = this.pos.clone(); this.walk = 0; this.stepT = 0; this.lookT = 0; this.repathT = 0;
      this.crouched = false; this.dieT = 0;
      this.model.visible = true; this.model.rotation.set(0, yaw, 0); this.model.scale.set(1, 1, 1);
    }

    die(dir) {
      this.alive = false; this.dieT = 0; this.vel.set(0, 0, 0);
      this.fallDir = dir; this.respawnT = 3;
    }

    // ---------- perception ----------
    think(now) {
      const g = this.game, eye = this.pos.y + 1.6;
      const cand = g.actors;
      let best = null, bestScore = 1e9;
      const fx = -Math.sin(this.aimYaw), fz = -Math.cos(this.aimYaw);
      for (const e of cand) {
        if (e === this || !e.alive || !g.hostile(this, e)) continue;
        const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d > 80) continue;
        const cosA = (dx * fx + dz * fz) / (d || 1);
        const inFov = cosA > Math.cos(55 * D2R) || d < 4 || (e === this.target && now - this.lastSeen < 2);
        if (!inFov) continue;
        if (!P.los(this.pos.x, eye, this.pos.z, e.pos.x, e.pos.y + e.height * 0.82, e.pos.z)) continue;
        // crouched / distant targets are harder to notice
        const s = d * (e === this.target ? 0.6 : 1) * (e.height < 1.5 && d > 25 ? 1.6 : 1);
        if (s < bestScore) { bestScore = s; best = e; }
      }
      if (best) {
        if (best !== this.target || now - this.lastSeen > 1.5) this.reactT = now + DIFF.reaction[g.diff] * rnd(0.8, 1.3);
        this.target = best; this.lastSeen = now; this.lastKnown = best.pos.clone(); this.visible = true;
        if (this.state !== 'cover') { this.state = 'engage'; this.path = null; }
      } else this.visible = false;
    }

    hear(src, now) {
      if (this.follow || this.deaf) return;
      if (this.state === 'engage' && this.visible) return;
      if (this.state === 'cover') return;
      if (this.lastKnown && this.lastKnown.distanceToSquared(src.pos) < 36 && now - this.repathT < 1.5) return;
      this.lastKnown = src.pos.clone(); this.target = src;
      this.state = 'investigate'; this.path = null; this.repathT = now;
      this.aimYaw = this.yaw; // turn toward the sound as the path starts
    }

    damaged(attacker, now) {
      if (attacker && attacker !== this.target && !this.visible) {
        this.target = attacker; this.lastKnown = attacker.pos.clone();
        if (this.state !== 'cover') { this.state = 'investigate'; this.path = null; }
        // snap attention toward the shooter
        this.aimYaw = Math.atan2(-(attacker.pos.x - this.pos.x), -(attacker.pos.z - this.pos.z));
      }
      if (this.health < 35 && this.state !== 'cover' && !this.hold) this.seekCover(now);
    }

    seekCover(now) {
      const threat = this.lastKnown || (this.target && this.target.pos);
      if (!threat) return;
      let best = null, bd = 1e9;
      for (const n of N.covers) {
        const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
        if (d > 24 || d < 1.5) continue;
        const td = Math.hypot(n.x - threat.x, n.z - threat.z);
        if (td < 6) continue;
        // hidden from the threat's eyes at standing chest height?
        if (P.los(threat.x, threat.y + 1.6, threat.z, n.x, n.y + 1.1, n.z)) continue;
        const s = d - td * 0.3;
        if (s < bd) { bd = s; best = n; }
      }
      if (!best) return;
      this.state = 'cover'; this.coverNode = best; this.coverT = 0;
      this.path = N.path(N.nearest(this.pos.x, this.pos.y, this.pos.z), best); this.pi = 0;
    }

    // ---------- movement ----------
    goTo(node) { this.goal = node; this.path = N.path(N.nearest(this.pos.x, this.pos.y, this.pos.z), node); this.pi = 0; }

    followPath(dt, speed, now) {
      if (!this.path || this.pi >= this.path.length) return false;
      let n = this.path[this.pi];
      // string pulling: skip a waypoint when the next one is directly walkable
      if (this.pi + 1 < this.path.length && now > this.skipT) {
        this.skipT = now + 0.25;
        const m = this.path[this.pi + 1];
        if (Math.abs(m.y - this.pos.y) < 0.4 && N.clearPath({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, m)) { this.pi++; n = m; }
      }
      const dx = n.x - this.pos.x, dz = n.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.6) { this.pi++; return this.pi < this.path.length; }
      this.desire(dx / d * speed, dz / d * speed, dt);
      return true;
    }
    desire(vx, vz, dt) {
      const k = Math.min(1, dt * 9);
      this.vel.x += (vx - this.vel.x) * k; this.vel.z += (vz - this.vel.z) * k;
    }

    turnTo(yaw, pitch, dt, rate) {
      const dy = wrap(yaw - this.aimYaw), max = rate * dt;
      this.aimYaw = wrap(this.aimYaw + Math.max(-max, Math.min(max, dy)));
      this.aimPitch += (pitch - this.aimPitch) * Math.min(1, dt * rate);
    }

    update(dt, now) {
      const g = this.game;
      if (!this.alive) { this.updateDeath(dt); return; }
      if (now >= this.nextThink) { this.nextThink = now + rnd(0.15, 0.25); this.think(now); }

      const diff = g.diff, rate = DIFF.turn[diff];
      let speed = 0, lookYaw = null, lookPitch = 0;
      this.crouched = false;
      if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.mag = this.def.mag; }

      if (this.target && !this.target.alive) { this.target = null; this.visible = false; if (this.state === 'engage') this.state = 'patrol'; }

      switch (this.state) {
        case 'patrol': {
          if (this.hold) { // campaign: hold a position and scan the room
            this.desire(0, 0, dt);
            lookYaw = this.holdYaw + Math.sin(now * 0.4 + this.pos.x) * 0.7;
            break;
          }
          if (this.follow) { // campaign squadmate: stay near the leader
            const f = this.follow, d = Math.hypot(f.pos.x - this.pos.x, f.pos.z - this.pos.z);
            if (d > 3.5 && now > this.repathT + 0.8) {
              this.repathT = now;
              const n = N.nearest(f.pos.x + (this.fx || 0), f.pos.y, f.pos.z + (this.fz || 0)); if (n) this.goTo(n);
            }
            if (d > 2.6 && this.path && this.pi < this.path.length) { speed = d > 9 ? 5.8 : 3.6; this.followPath(dt, speed, now); }
            else { this.desire(0, 0, dt); if (f.yaw !== undefined) lookYaw = f.yaw; }
            break;
          }
          if (!this.path || this.pi >= this.path.length) {
            // wander: random reachable node, biased toward the map interior
            let n = N.random();
            for (let i = 0; i < 4 && Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < 15; i++) n = N.random();
            this.goTo(n);
          }
          speed = 3.8; this.followPath(dt, speed, now);
          break;
        }
        case 'investigate': {
          if (!this.path && this.lastKnown) {
            const n = N.nearest(this.lastKnown.x, this.lastKnown.y, this.lastKnown.z);
            if (n) this.goTo(n);
          }
          speed = 4.6;
          if (!this.followPath(dt, speed, now)) {
            this.lookT += dt; speed = 0;
            lookYaw = this.aimYaw + dt * 1.6; // scan around
            if (this.lookT > 2) { this.lookT = 0; this.state = 'patrol'; this.path = null; }
          } else if (this.lastKnown) {
            lookYaw = Math.atan2(-(this.lastKnown.x - this.pos.x), -(this.lastKnown.z - this.pos.z));
          }
          break;
        }
        case 'engage': {
          const t = this.target;
          if (!t || !this.visible) {
            if (now - this.lastSeen > 1.1) { this.state = 'investigate'; this.path = null; }
            else if (this.lastKnown) lookYaw = Math.atan2(-(this.lastKnown.x - this.pos.x), -(this.lastKnown.z - this.pos.z));
            break;
          }
          const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz);
          // strafe left / right, or push in with an SMG at long range
          this.strafeT -= dt;
          if (this.strafeT <= 0) { this.strafeT = rnd(0.5, 1.4); this.strafe = [-1, 0, 1][(Math.random() * 3) | 0]; }
          const px = -dz / d, pz = dx / d;
          let mx = px * this.strafe * 2.4, mz = pz * this.strafe * 2.4;
          if (this.wpn === 'smg' && d > 14) { mx += dx / d * 3; mz += dz / d * 3; }
          if (this.wpn === 'sniper') { mx *= 0.3; mz *= 0.3; this.crouched = d > 20; }
          // don't strafe off ledges
          if (this.pos.y > 1 && !this.groundAhead(mx, mz)) { mx = 0; mz = 0; }
          this.desire(mx, mz, dt);
          speed = Math.hypot(mx, mz);
          const aimY = t.pos.y + (this.aimHead ? t.height - 0.17 : t.height * 0.62);
          lookYaw = Math.atan2(-dx, -dz);
          lookPitch = Math.atan2(aimY - (this.pos.y + 1.6), d);
          this.tryFire(now, t, d, lookYaw, lookPitch);
          break;
        }
        case 'cover': {
          this.coverT += dt;
          if (this.followPath(dt, 6.2, now)) {
            speed = 6.2;
          } else {
            speed = 0; this.crouched = true; this.desire(0, 0, dt);
            if (this.visible && this.target) { // exposed anyway: fight back
              const dx = this.target.pos.x - this.pos.x, dz = this.target.pos.z - this.pos.z;
              lookYaw = Math.atan2(-dx, -dz);
              this.tryFire(now, this.target, Math.hypot(dx, dz), lookYaw, 0);
            }
          }
          if (this.health >= 90 || this.coverT > 8) { this.state = this.visible ? 'engage' : 'investigate'; this.path = null; }
          break;
        }
      }

      if (this.state !== 'engage' && !(this.state === 'cover' && speed === 0) && lookYaw === null) {
        const hs = Math.hypot(this.vel.x, this.vel.z);
        if (hs > 0.5) lookYaw = Math.atan2(-this.vel.x, -this.vel.z);
      }
      if (lookYaw !== null) this.turnTo(lookYaw, lookPitch, dt, this.state === 'engage' ? rate : rate * 0.6);
      if (this.state !== 'engage' && this.state !== 'cover' && (!this.path || this.pi >= (this.path ? this.path.length : 0)) && this.state !== 'investigate') this.desire(0, 0, dt);

      // physics
      this.vel.y -= P.GRAVITY * dt;
      const th = this.crouched ? 1.25 : 1.8;
      if (th > this.height && !P.fits(this.pos.x, this.pos.y, this.pos.z, this.radius, th)) { /* stay low */ }
      else this.height += (th - this.height) * Math.min(1, dt * 10);
      P.move(this, dt);
      if (this.blocked && this.onGround && Math.random() < 0.02) this.vel.y = 5.2; // hop over small stuff

      // stuck detection
      this.stuckT += dt;
      if (this.stuckT > 1.2) {
        const moved = this.pos.distanceTo(this.lastProgress);
        if (moved < 0.4 && this.path && this.pi < this.path.length) { this.path = null; if (this.state === 'cover') this.state = 'patrol'; }
        this.lastProgress.copy(this.pos); this.stuckT = 0; this.skipT = 0;
      }

      // body faces aim direction
      this.yaw = this.aimYaw;
      this.animate(dt, now);
    }

    groundAhead(mx, mz) {
      const s = Math.hypot(mx, mz); if (s < 0.01) return true;
      const x = this.pos.x + mx / s * 0.8, z = this.pos.z + mz / s * 0.8;
      const h = P.raycast(x, this.pos.y + 0.3, z, 0, -1, 0, 1);
      return !!h;
    }

    tryFire(now, t, d, yaw, pitch) {
      const g = this.game, def = this.def;
      if (now < this.reactT || this.reloadT > 0 || now < this.nextShot) return;
      if (Math.abs(wrap(yaw - this.aimYaw)) > 8 * D2R) return;
      if (def.id === 'sniper' && d < 6 && Math.random() < 0.5) return; // snipers are clumsy up close
      if (this.mag <= 0) { this.reloadT = def.reload * rnd(0.9, 1.1); this.burst = 0; return; }
      if (this.burst <= 0) this.burst = Math.round(rnd(def.botBurst[0], def.botBurst[1]));
      this.aimHead = Math.random() < DIFF.head[g.diff];
      // aim error grows with target speed, own movement and distance for SMGs
      const ts = Math.hypot(t.vel.x, t.vel.z), ms = Math.hypot(this.vel.x, this.vel.z);
      let err = DIFF.aimErr[g.diff] + ts * 0.3 + ms * 0.4;
      if (def.id === 'sniper') err *= 0.5;
      if (def.id === 'smg' && d > 20) err *= 1.4;
      err *= D2R * (this.aimMul || 1);
      const aimY = t.pos.y + (this.aimHead ? t.height - 0.17 : t.height * 0.6);
      const ox = this.pos.x, oy = this.pos.y + this.height - 0.2, oz = this.pos.z;
      v1.set(t.pos.x - ox, aimY - oy, t.pos.z - oz).normalize();
      const ex = (Math.random() - 0.5) * 2 * err, ey = (Math.random() - 0.5) * 2 * err;
      const dir = new THREE.Vector3(v1.x + ex * v1.z, v1.y + ey, v1.z - ex * v1.x).normalize();
      const mz = new THREE.Vector3(); this.guns[this.wpn].muzzle.getWorldPosition(mz);
      g.fireBullet(this, new THREE.Vector3(ox, oy, oz), dir, def, mz, DIFF.dmg[g.diff] * (this.dmgMul || 1));
      VG.FX.muzzle(mz.x, mz.y, mz.z, Math.random() < 0.5);
      A.shot(def.sound, false, ox, oz);
      this.mag--; this.burst--; this.lastFired = now;
      this.nextShot = now + (this.burst > 0 ? 60 / def.rpm : rnd(def.botPause[0], def.botPause[1]));
      if (def.id === 'sniper') this.nextShot = now + rnd(def.botPause[0], def.botPause[1]);
      g.noise(this, 70, true);
    }

    animate(dt, now) {
      const m = this.model, hs = Math.hypot(this.vel.x, this.vel.z);
      m.position.set(this.pos.x, this.pos.y - Math.max(0, this.stepUp), this.pos.z);
      this.stepUp *= Math.pow(0.001, dt);
      m.rotation.y = this.yaw;
      this.walk += hs * dt * 2.6;
      const sw = Math.sin(this.walk) * Math.min(1, hs / 3) * 0.6;
      this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
      this.upper.rotation.x = -this.aimPitch * 0.7;
      const bs = this.baseScale || 1; m.scale.x = m.scale.z = bs; // children are drawn smaller
      m.scale.y += ((this.crouched ? 0.7 : 1) * bs - m.scale.y) * Math.min(1, dt * 10);
      // footsteps you can hear
      if (hs > 1.5 && this.onGround) {
        this.stepT -= dt * hs;
        if (this.stepT <= 0) { this.stepT = 1.7; A.footstep(hs > 5, this.pos.x, this.pos.z, false); }
      }
    }

    updateDeath(dt) {
      if (!this.model.visible) {
        this.respawnT -= dt;
        if (this.respawnT <= 0) this.game.respawn(this);
        return;
      }
      this.dieT += dt; this.respawnT -= dt;
      const k = Math.min(1, this.dieT / 0.45), e = k * k;
      const m = this.model;
      // topple away from the shot
      const d = this.fallDir || { x: 0, z: 1 };
      const local = Math.atan2(d.x, d.z) - this.yaw;
      m.rotation.set(Math.cos(local) * e * 1.5, this.yaw, -Math.sin(local) * e * 1.5, 'YXZ');
      m.position.y = this.pos.y + 0.05 - e * 0.05;
      if (this.dieT > 2.2 && !this.game.keepBodies) { m.visible = false; this.respawnT = Math.max(this.respawnT, 0.6); }
    }
  }
  VG.Bot = Bot;

  // A soldier driven by the network (another player, or a bot simulated by the host).
  // Smoothly follows the newest reported position; on the host it also runs the respawn timer for players.
  class Remote extends Bot {
    constructor(game, name, team, idx, id, human) {
      super(game, name, team, idx);
      this.id = id; this.human = human; this.ready = false;
      this.tgt = new THREE.Vector3(); this.tYaw = 0; this.tPitch = 0; this.tH = 1.8;
      this.aimYaw = this.yaw = 0; this.aimPitch = 0;
      this.setWpn('ar');
    }
    setWpn(id) {
      if (!id || this.wpn === id) return;
      this.wpn = id; this.def = VG.WEAPONS[id];
      for (const k in this.guns) this.guns[k].group.visible = k === id;
    }
    setState(x, y, z, yaw, pitch, h, w) {
      this.tgt.set(x, y, z); this.tYaw = yaw; this.tPitch = pitch; this.tH = h;
      this.setWpn(VG.WEAPON_ORDER[w]);
    }
    spawnAt(x, y, z, yaw) {
      this.pos.set(x, y, z); this.tgt.set(x, y, z); this.vel.set(0, 0, 0);
      this.yaw = this.aimYaw = this.tYaw = yaw;
      this.alive = true; this.health = 100; this.lastHit = -99; this.dieT = 0; this.streak = 0;
      this.model.visible = true; this.model.rotation.set(0, yaw, 0); this.model.scale.set(1, 1, 1);
    }
    update(dt, now) {
      if (!this.alive) {
        this.updateDeath(dt);
        // host: bring the player back after the respawn delay once their game is loaded
        if (this.human && this.game.net && this.game.net.isHost() && this.ready) {
          this.respawnT -= dt;
          if (this.respawnT <= 0) {
            const [x, z, yaw] = this.game.pickSpawn(this);
            this.spawnAt(x, 0, z, yaw);
            this.game.net.spawn(this.id, x, z, yaw);
          }
        }
        return;
      }
      if (dt <= 0) return;
      const px = this.pos.x, pz = this.pos.z;
      if (this.pos.distanceToSquared(this.tgt) > 36) this.pos.copy(this.tgt);
      else this.pos.lerp(this.tgt, Math.min(1, dt * 14));
      this.vel.set((this.pos.x - px) / dt, 0, (this.pos.z - pz) / dt);
      this.aimYaw = wrap(this.aimYaw + wrap(this.tYaw - this.aimYaw) * Math.min(1, dt * 14));
      this.aimPitch += (this.tPitch - this.aimPitch) * Math.min(1, dt * 14);
      this.yaw = this.aimYaw;
      this.height += (this.tH - this.height) * Math.min(1, dt * 12);
      this.crouched = this.tH < 1.5 * (this.baseScale || 1);
      this.animate(dt, now);
    }
    updateDeath(dt) {
      if (!this.model.visible) return;
      this.dieT += dt;
      const k = Math.min(1, this.dieT / 0.45), e = k * k, m = this.model;
      const d = this.fallDir || { x: 0, z: 1 };
      const local = Math.atan2(d.x, d.z) - this.yaw;
      m.rotation.set(Math.cos(local) * e * 1.5, this.yaw, -Math.sin(local) * e * 1.5, 'YXZ');
      if (this.dieT > 2.2 && !this.game.keepBodies) m.visible = false;
    }
    die(dir) { this.alive = false; this.dieT = 0; this.vel.set(0, 0, 0); this.fallDir = dir; this.respawnT = 3.5; }
    think() {} hear() {} damaged() {}
  }
  VG.Remote = Remote;
})();
