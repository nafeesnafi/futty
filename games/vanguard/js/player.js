// The local player: FPS movement (walk / sprint / crouch / slide / jump / ladders), camera feel
// (head-bob, sway, recoil, FOV) and weapon handling (ADS, fire, reload, switch, scope breathing).
(function () {
  const VG = window.VG = window.VG || {};
  const P = VG.Phys, A = VG.Audio;
  const D2R = Math.PI / 180;
  const HIP = new THREE.Vector3(0.17, -0.2, -0.5);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);

  // CoD-style FOV setting is horizontal on a 4:3 frame; three.js wants vertical
  VG.vfov = (h) => 2 * Math.atan(Math.tan(h * D2R / 2) * 0.75) / D2R;

  class Player {
    constructor(game) {
      this.game = game;
      this.isPlayer = true; this.name = 'You'; this.team = 0;
      this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
      this.radius = 0.35; this.height = 1.8; this.onGround = false; this.stepUp = 0;
      this.kills = 0; this.deaths = 0; this.score = 0; this.headshots = 0; this.shots = 0; this.hits = 0; this.bestStreak = 0;
      this.vms = {};
      for (const id of VG.WEAPON_ORDER) {
        const vm = VG.buildViewModel(id); vm.rig.visible = false; game.vmRoot.add(vm.rig); this.vms[id] = vm;
      }
      this.reset();
    }

    reset() {
      this.health = 100; this.alive = true; this.lastHit = -99; this.streak = 0;
      this.vel.set(0, 0, 0); this.height = 1.8; this.eye = 1.68; this.stepUp = 0;
      this.ammo = {};
      for (const id of VG.WEAPON_ORDER) { const d = VG.WEAPONS[id]; this.ammo[id] = { mag: d.mag, reserve: d.reserve }; }
      this.cur = this.cur || 'ar'; this.nextWpn = null; this.switchT = 0;
      for (const id in this.vms) this.vms[id].rig.visible = id === this.cur;
      this.ads = 0; this.adsHeld = false; this.sprint = false; this.crouch = false; this.slideT = 0; this.sliding = false;
      this.reload = null; this.nextFire = 0; this.boltT = 0; this.sprintOut = 0; this.triggerLatch = false;
      this.recP = 0; this.recY = 0; this.recTP = 0; this.recTY = 0; this.lastShot = -9;
      this.bob = 0; this.bobAmp = 0; this.lastGround = 0; this.jumpCd = 0; this.landDip = 0;
      this.swayX = 0; this.swayY = 0; this.lookDX = 0; this.lookDY = 0; this.kick = 0;
      this.breath = 4; this.breathOut = false; this.scopeT = 0; this.wasScoped = false;
      this.fovCur = this.game.settings.fov; this.climbing = false; this.ladderSnd = 0;
      this.spreadNow = 2;
    }

    get def() { return VG.WEAPONS[this.cur]; }

    look(dx, dy) {
      if (!this.alive) return;
      const s = this.game.settings.sens * 0.0021 * (this.fovCur / this.game.settings.fov);
      this.yaw -= dx * s;
      this.pitch = Math.max(-89 * D2R, Math.min(89 * D2R, this.pitch - dy * s));
      this.lookDX += dx; this.lookDY += dy;
    }

    switchTo(id) {
      if (!this.alive || id === this.cur || this.nextWpn) return;
      this.nextWpn = id; this.switchT = 0.42; this.reload = null; A.switchWpn();
    }
    cycle(dir) {
      const o = VG.WEAPON_ORDER, i = o.indexOf(this.nextWpn || this.cur);
      this.switchTo(o[(i + dir + o.length) % o.length]);
    }

    startReload() {
      const a = this.ammo[this.cur], d = this.def;
      if (this.reload || this.nextWpn || a.mag >= d.mag || a.reserve <= 0) return;
      const empty = a.mag === 0;
      this.reload = { t: 0, dur: empty ? d.reloadEmpty : d.reload, empty, out: false, in: false, bolt: false, done: false };
    }

    update(dt, inp, now) {
      if (!this.alive) return;
      const g = this.game, d = this.def, a = this.ammo[this.cur];
      // ---------- input ----------
      let fwd = (inp.down.KeyW ? 1 : 0) - (inp.down.KeyS ? 1 : 0);
      let str = (inp.down.KeyD ? 1 : 0) - (inp.down.KeyA ? 1 : 0);
      let stickMag = 1;
      if (inp.stick) { // analog thumbstick (touch)
        fwd = -inp.stick.y; str = inp.stick.x; stickMag = Math.min(1, Math.hypot(fwd, str));
        if (Math.abs(fwd) < 0.25 && Math.abs(str) > 0.25) fwd = 0;
      }
      if (inp.pressed.Digit1) this.switchTo('ar');
      if (inp.pressed.Digit2) this.switchTo('smg');
      if (inp.pressed.Digit3) this.switchTo('sniper');
      if (inp.wheel) this.cycle(inp.wheel > 0 ? 1 : -1);
      if (inp.pressed.KeyR) this.startReload();

      const ladder = P.ladderAt(this.pos.x, this.pos.y, this.pos.z, this.radius + 0.05);
      const hs = Math.hypot(this.vel.x, this.vel.z);
      // crouch / slide
      const crouchTap = inp.pressed.KeyC || inp.pressed.ControlLeft || inp.pressed.ControlRight;
      if (crouchTap) {
        if (this.sprint && this.onGround && hs > 5) this.startSlide();
        else if (inp.pressed.KeyC) this.crouch = !this.crouch;
      }
      const ctrlHeld = inp.down.ControlLeft || inp.down.ControlRight;
      // sprint
      this.adsHeld = inp.mouse[2];
      const wantSprint = inp.down.ShiftLeft && fwd > 0 && !this.adsHeld && !this.sliding;
      if (wantSprint && !this.sprint && (this.crouch) && P.fits(this.pos.x, this.pos.y, this.pos.z, this.radius, 1.8)) this.crouch = false;
      this.sprint = wantSprint && !this.crouch && !ctrlHeld && (this.onGround || this.sprint);
      const crouched = this.crouch || ctrlHeld || this.sliding;

      // ---------- horizontal movement ----------
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      let wx = -sy * fwd + cy * str, wz = -cy * fwd - sy * str;
      const wl = Math.hypot(wx, wz); if (wl > 0) { wx *= stickMag / wl; wz *= stickMag / wl; }
      if (this.sliding) {
        this.slideT -= dt;
        const sp = Math.max(0, hs - 6.5 * dt);
        if (hs > 0.01) { this.vel.x *= sp / hs; this.vel.z *= sp / hs; }
        if (this.slideT <= 0 || sp < 2.6 || !this.onGround && this.slideT < 0.6) { this.sliding = false; this.crouch = true; }
      } else {
        let speed = this.sprint ? 7.0 : 4.6;
        if (crouched) speed = 2.4;
        if (this.ads > 0.3) speed = Math.min(speed, d.id === 'sniper' ? 1.9 : 2.8);
        const k = this.onGround ? 13 : 2.2;
        this.vel.x += (wx * speed - this.vel.x) * Math.min(1, k * dt);
        this.vel.z += (wz * speed - this.vel.z) * Math.min(1, k * dt);
      }
      // ---------- vertical: jump, ladder, gravity ----------
      this.jumpCd -= dt;
      if (this.onGround) this.lastGround = now;
      this.climbing = false;
      if (ladder && Math.abs(fwd) > 0.3) {
        this.climbing = true; this.sliding = false;
        this.vel.y = fwd > 0 ? 3.4 : -3.4;
        this.vel.x *= 0.5; this.vel.z *= 0.5;
        this.ladderSnd -= dt; if (this.ladderSnd <= 0) { A.ladder(); this.ladderSnd = 0.28; }
      } else {
        if (inp.pressed.Space && this.jumpCd <= 0 && (this.onGround || now - this.lastGround < 0.12)) {
          if (this.crouch && !this.sliding) { if (P.fits(this.pos.x, this.pos.y, this.pos.z, this.radius, 1.8)) this.crouch = false; }
          else { this.vel.y = 5.4; this.jumpCd = 0.42; this.onGround = false; this.lastGround = -9; this.sliding = false; }
        }
        this.vel.y -= P.GRAVITY * dt;
      }
      const fall = this.vel.y, wasGround = this.onGround;
      P.move(this, dt);
      if (!wasGround && this.onGround && fall < -5) { A.land(fall < -9); this.landDip = Math.min(0.12, -fall * 0.012); }
      // height (crouch / slide), only stand up if there is room
      const th = this.sliding ? 1.0 : crouched ? 1.2 : 1.8;
      if (th > this.height && !P.fits(this.pos.x, this.pos.y, this.pos.z, this.radius, th)) { this.crouch = true; }
      else this.height += (th - this.height) * Math.min(1, dt * 12);
      this.eye = this.height - 0.12;
      this.stepUp *= Math.pow(0.0001, dt); // smooth camera over steps
      this.landDip *= Math.pow(0.002, dt);

      // ---------- head bob + footsteps ----------
      const nhs = Math.hypot(this.vel.x, this.vel.z);
      const moving = this.onGround && !this.sliding && nhs > 0.5;
      const amp = moving ? (this.sprint ? 0.06 : crouched ? 0.022 : 0.035) * (1 - this.ads * 0.75) : 0;
      this.bobAmp += (amp - this.bobAmp) * Math.min(1, dt * 8);
      if (moving) {
        const stride = this.sprint ? 1.05 : 0.8;
        const before = Math.floor((this.bob + Math.PI / 4) / Math.PI);
        this.bob += nhs * dt / stride * Math.PI;
        if (Math.floor((this.bob + Math.PI / 4) / Math.PI) !== before && !crouched) A.footstep(this.sprint, 0, 0, true);
        if (!crouched) this.game.noise(this, this.sprint ? 14 : 7, false);
      }

      // ---------- ADS ----------
      const canAds = this.adsHeld && !this.sprint && !this.reload && !this.nextWpn && !this.climbing;
      const adsTarget = canAds ? 1 : 0;
      if (adsTarget && this.ads === 0) A.adsIn();
      this.ads = Math.max(0, Math.min(1, this.ads + (adsTarget ? 1 : -1) * dt / d.adsTime));
      const adsE = ease(this.ads);
      const scoped = d.scope && this.ads > 0.85;

      // scope breathing / hold breath
      this.scopeT += dt;
      let swP = 0, swY = 0;
      if (scoped) {
        const holding = inp.down.ShiftLeft && !this.breathOut && this.breath > 0;
        if (holding) { this.breath -= dt; if (this.breath <= 0) this.breathOut = true; }
        else { this.breath = Math.min(4, this.breath + dt * 1.2); if (this.breathOut && this.breath > 2.5) this.breathOut = false; }
        const k = holding ? 0.08 : this.breathOut ? 2.2 : 1;
        const t = this.scopeT;
        swP = (Math.sin(t * 1.1) * 0.0035 + Math.sin(t * 2.3) * 0.0015) * k;
        swY = (Math.cos(t * 0.8) * 0.0045 + Math.sin(t * 1.9) * 0.0015) * k;
      } else { this.breath = Math.min(4, this.breath + dt); }
      this.scopedNow = scoped; this.holdingBreath = scoped && inp.down.ShiftLeft && !this.breathOut;

      // ---------- weapon switching ----------
      if (this.nextWpn) {
        const before = this.switchT;
        this.switchT -= dt;
        if (before > 0.22 && this.switchT <= 0.22) {
          this.vms[this.cur].rig.visible = false; this.cur = this.nextWpn; this.vms[this.cur].rig.visible = true;
          this.boltT = 0;
        }
        if (this.switchT <= 0) { this.nextWpn = null; this.switchT = 0; }
      }

      // ---------- reload ----------
      if (this.reload) {
        const r = this.reload; r.t += dt; const k = r.t / r.dur;
        if (!r.out && k > 0.22) { r.out = true; A.magOut(); }
        if (!r.in && k > 0.58) { r.in = true; A.magIn(); }
        if (!r.done && k > 0.7) {
          r.done = true; const need = d.mag - a.mag, take = Math.min(need, a.reserve); a.mag += take; a.reserve -= take;
        }
        if (r.empty && !r.bolt && k > 0.82) { r.bolt = true; A.bolt(); }
        if (k >= 1) this.reload = null;
      }

      // ---------- firing ----------
      this.boltT -= dt;
      if (this.boltT > 0 && this.boltT < d.bolt - 0.35 && !this.boltPlayed) { this.boltPlayed = true; A.bolt(); }
      const trig = inp.mouse[0];
      if (!trig) this.triggerLatch = false;
      if (trig && this.sprint) { this.sprint = false; this.sprintOut = 0.12; }
      this.sprintOut -= dt;
      const ready = !this.reload && !this.nextWpn && this.boltT <= 0 && this.sprintOut <= 0 && !this.climbing && now >= this.nextFire;
      if (trig && ready && (d.auto || !this.triggerLatch)) {
        if (a.mag <= 0) {
          if (!this.triggerLatch) A.dryFire();
          this.triggerLatch = true;
          if (a.reserve > 0) this.startReload();
        } else {
          this.fire(now, scoped, crouched, nhs);
          this.triggerLatch = true;
        }
      }
      if (a.mag === 0 && a.reserve > 0 && !this.reload && !this.nextWpn && !trig) this.startReload();

      // ---------- recoil recovery ----------
      this.recP += (this.recTP - this.recP) * Math.min(1, dt * 26);
      this.recY += (this.recTY - this.recY) * Math.min(1, dt * 26);
      if (now - this.lastShot > Math.max(0.1, 60 / d.rpm * 1.6)) {
        const r = Math.min(1, dt * 6); this.recTP -= this.recTP * r; this.recTY -= this.recTY * r;
      }
      this.kick *= Math.pow(0.0005, dt);

      // ---------- spread (for crosshair) ----------
      const moveF = Math.min(1, nhs / 4.6);
      let sp = lerp(d.hipSpread + d.moveSpread * moveF + (this.onGround ? 0 : 3), d.adsSpread + d.moveSpread * moveF * 0.15, adsE);
      if (crouched && this.onGround) sp *= 0.75;
      if (this.sprint) sp += 2;
      sp += Math.min(2.5, this.recTP / D2R * 0.35) * (1 - adsE);
      this.spreadNow = sp;

      // ---------- FOV ----------
      const base = g.settings.fov + (this.sprint ? 10 : 0) + (this.sliding ? 6 : 0);
      const fovT = lerp(base, d.adsFov * g.settings.fov / 80, adsE);
      this.fovCur += (fovT - this.fovCur) * Math.min(1, dt * (this.ads > 0 && this.ads < 1 ? 30 : 10));
      g.camera.fov = VG.vfov(this.fovCur);
      g.camera.updateProjectionMatrix();

      // ---------- camera ----------
      const bobY = Math.sin(this.bob * 2) * this.bobAmp * 0.5, bobX = Math.sin(this.bob) * this.bobAmp * 0.6;
      const breath = Math.sin(now * 1.6) * 0.004 * (1 - adsE);
      const cam = g.camera;
      const rx = cy * bobX, rz = -sy * bobX;
      cam.position.set(this.pos.x + rx, this.pos.y + this.eye - this.stepUp - this.landDip + bobY + breath, this.pos.z + rz);
      const shake = VG.FX.shake;
      const roll = -str * 0.012 * (1 - adsE) + (this.sliding ? 0.06 : 0);
      this.roll = (this.roll || 0) + (roll - (this.roll || 0)) * Math.min(1, dt * 8);
      cam.rotation.set(this.pitch + this.recP + swP + (Math.random() - 0.5) * shake * 0.04,
        this.yaw + this.recY + swY + (Math.random() - 0.5) * shake * 0.04, this.roll, 'YXZ');

      // ---------- viewmodel ----------
      this.updateViewModel(dt, now, adsE, scoped, crouched);
      this.lookDX = 0; this.lookDY = 0;
    }

    startSlide() {
      this.sliding = true; this.slideT = 0.95; this.sprint = false;
      const hs = Math.hypot(this.vel.x, this.vel.z) || 1, boost = Math.max(hs, 9) / hs;
      this.vel.x *= boost; this.vel.z *= boost;
      A.slide();
    }

    fire(now, scoped, crouched, hs) {
      const d = this.def, a = this.ammo[this.cur], g = this.game;
      a.mag--; this.shots++;
      this.nextFire = now + 60 / d.rpm; this.lastShot = now;
      if (d.bolt) { this.boltT = d.bolt; this.boltPlayed = false; }
      // direction with spread cone
      const cam = g.camera;
      const dir = tmp.set(0, 0, -1).applyQuaternion(cam.quaternion);
      let spr = this.spreadNow * D2R;
      if (scoped) spr = 0;
      if (spr > 0) {
        const r = Math.sqrt(Math.random()) * Math.tan(spr), th = Math.random() * Math.PI * 2;
        const right = tmp2.set(1, 0, 0).applyQuaternion(cam.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
        dir.addScaledVector(right, Math.cos(th) * r).addScaledVector(up, Math.sin(th) * r).normalize();
      }
      // muzzle in world space: viewmodel muzzle is expressed in camera space
      const vm = this.vms[this.cur];
      const mw = new THREE.Vector3();
      vm.muzzle.getWorldPosition(mw); // vm camera sits at the origin with identity rotation
      if (scoped) mw.set(0, -0.15, -0.5);
      cam.localToWorld(mw);
      const showTracer = this.shots % d.tracerEvery === 0 && !scoped;
      g.fireBullet(this, cam.position.clone(), dir.clone(), d, mw, 1, !showTracer);
      // feedback
      A.shot(d.sound, true);
      VG.FX.playerFlash(mw.x, mw.y, mw.z);
      if (!scoped) { vm.flash.visible = true; vm.flash.material.rotation = Math.random() * 6.28; this.flashT = 0.04; }
      const adsK = this.ads > 0.5 ? 0.7 : 1, crK = crouched ? 0.85 : 1;
      this.recTP += d.recoilP * D2R * adsK * crK * (0.85 + Math.random() * 0.3);
      this.recTY += (Math.random() - 0.42) * 2 * d.recoilY * D2R * adsK;
      this.kick = Math.min(1, this.kick + (d.id === 'sniper' ? 1 : 0.35));
      if (d.id === 'sniper') VG.FX.shake = Math.max(VG.FX.shake, 0.3);
      g.noise(this, 70, true);
    }

    updateViewModel(dt, now, adsE, scoped, crouched) {
      const g = this.game, vm = this.vms[this.cur], rig = vm.rig, root = g.vmRoot;
      // inertia sway: lags behind mouse movement
      const tx = Math.max(-1, Math.min(1, -this.lookDX * 0.02)), ty = Math.max(-1, Math.min(1, this.lookDY * 0.02));
      this.swayX += (tx - this.swayX) * Math.min(1, dt * 7);
      this.swayY += (ty - this.swayY) * Math.min(1, dt * 7);
      const swK = 1 - adsE * 0.85;
      // positions
      const adsPos = tmp.set(0, -vm.sightY, this.def.id === 'smg' ? -0.36 : -0.4);
      const p = tmp2.copy(HIP).lerp(adsPos, adsE);
      const bobX = Math.sin(this.bob) * this.bobAmp * 0.35, bobY = -Math.abs(Math.cos(this.bob)) * this.bobAmp * 0.35;
      const idle = Math.sin(now * 1.5) * 0.0025 * swK;
      p.x += bobX + this.swayX * 0.02 * swK;
      p.y += bobY + idle - this.swayY * 0.015 * swK - this.landDip * 0.3;
      p.z += this.kick * (this.def.id === 'sniper' ? 0.09 : 0.035);
      let rx = this.kick * (this.def.id === 'sniper' ? 0.12 : 0.05) + this.swayY * 0.05 * swK, ry = this.swayX * 0.08 * swK, rz = this.swayX * 0.1 * swK;
      // sprint carry pose
      this.sprintPose = (this.sprintPose || 0) + ((this.sprint ? 1 : 0) - (this.sprintPose || 0)) * Math.min(1, dt * 9);
      const sp = ease(this.sprintPose);
      p.x += -0.04 * sp; p.y += -0.05 * sp; p.z += 0.03 * sp;
      rx += -0.3 * sp; ry += 0.45 * sp; rz += 0.2 * sp;
      p.y += Math.sin(this.bob * 2) * 0.012 * sp; p.x += Math.sin(this.bob) * 0.02 * sp;
      // slide tilt
      if (this.sliding) { rz += 0.25; p.x -= 0.03; }
      // reload dip: weapon drops off screen and comes back
      let dip = 0;
      if (this.reload) {
        const k = this.reload.t / this.reload.dur;
        dip = k < 0.2 ? ease(k / 0.2) : k > 0.78 ? ease(1 - (k - 0.78) / 0.22) : 1;
        vm.mag.position.y = vm.magY - (k > 0.22 && k < 0.58 ? 0.25 : 0);
      } else vm.mag.position.y = vm.magY;
      // switch: lower then raise
      if (this.nextWpn) { const t = this.switchT; dip = Math.max(dip, t > 0.22 ? ease(1 - (t - 0.22) / 0.2) : ease(t / 0.22)); }
      p.y -= dip * 0.32; p.z += dip * 0.05; rx -= dip * 0.7; rz += dip * 0.3;
      rig.position.copy(p); rig.rotation.set(rx, ry, rz);
      root.visible = !scoped && this.alive;
      if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) vm.flash.visible = false; }
      g.vmCamera.fov = 58 - adsE * 8;
      g.vmCamera.updateProjectionMatrix();
    }
  }
  VG.Player = Player;
})();
