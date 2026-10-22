// Match simulation: ball physics, possession, passing/shooting/tackling, team AI, goalkeepers,
// restarts (kick-off, throw-in, corner, goal kick) and the match clock.
// Pure logic (no rendering) so it can run on the host, in tests, or headless.
var FC = window.FC = window.FC || {};

(() => {
  const PL = 105, PW = 68, HL = PL / 2, HW = PW / 2, GOAL_W = 7.32, GOAL_H = 2.44, BALL_R = 0.11;
  const G = 9.81;
  const MAGNUS = 0.012;      // lift per (rad/s x m/s): ~2 m of curl on a 25 m finesse shot
  const SPIN_DECAY = 0.5;    // spin loss per second in flight
  const GOAL_BREAK = 6.5;    // seconds between a goal and the restart (celebration + replay)

  // 4-3-3 in the team's own frame: x from -1 (own goal) to 1 (opponent goal), z from -1 to 1.
  const FORMATION = [
    { x: -0.96, z: 0, role: 'gk' },
    { x: -0.60, z: -0.62, role: 'def' }, { x: -0.70, z: -0.22, role: 'def' }, { x: -0.70, z: 0.22, role: 'def' }, { x: -0.60, z: 0.62, role: 'def' },
    { x: -0.38, z: -0.36, role: 'mid' }, { x: -0.48, z: 0, role: 'mid' }, { x: -0.38, z: 0.36, role: 'mid' },
    { x: -0.12, z: -0.62, role: 'fwd' }, { x: -0.06, z: 0, role: 'fwd' }, { x: -0.12, z: 0.62, role: 'fwd' },
  ];

  const DIFFICULTY = {
    easy:   { react: 0.55, passErr: 0.10, shotErr: 0.10, tackle: 0.35, speed: 0.90, gk: -0.15, press: 0.7 },
    normal: { react: 0.30, passErr: 0.06, shotErr: 0.06, tackle: 0.50, speed: 0.97, gk: 0.00, press: 1.0 },
    hard:   { react: 0.15, passErr: 0.03, shotErr: 0.035, tackle: 0.65, speed: 1.03, gk: 0.08, press: 1.2 },
  };
  const HUMAN = { passErr: 0.03, shotErr: 0.04, tackle: 0.6 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const hyp = Math.hypot;

  // controllers: [{ type: 'human'|'ai', difficulty }, ...]  (human input arrives via setInput / queueAction)
  FC.Match = class Match {
    constructor({ home, away, halfSeconds = 180, controllers }) {
      this.teams = [FC.TEAMS[home], FC.TEAMS[away]];
      this.halfSeconds = halfSeconds;
      this.ctrl = controllers.map(c => ({
        type: c.type, diff: DIFFICULTY[c.difficulty || 'normal'],
        input: { x: 0, z: 0, sprint: false, shield: false }, actions: [], active: -1,
      }));
      this.players = [];
      for (let t = 0; t < 2; t++) {
        const r = this.teams[t].rating;
        for (let i = 0; i < 11; i++) {
          const f = FORMATION[i];
          this.players.push({
            id: t * 11 + i, team: t, idx: i, role: f.role, base: f,
            rating: r + (f.role === 'fwd' ? 1 : 0),
            x: 0, z: 0, vx: 0, vz: 0, face: 0, kickT: 0, stunT: 0, tackleCd: 0, dive: 0, decideT: 0, plan: null,
            touchCd: 0, jumpT: 0, headBuf: 0, headAct: null, headDir: null, pending: null, shield: false, shieldT: 0, knock: false,
            off: false, yellow: 0, wallSpot: null, wallT: 0, slideT: 0,
          });
        }
      }
      this.ball = {
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0, knuckle: 0, kT: 0, kax: 0, kay: 0, glued: false,
        owner: -1, lastTouch: -1, lastTeam: 0, noPick: -1, noPickT: 0, receiver: -1, shot: null, protectT: 0,
        offside: null, indirect: -1, penalty: false,
      };
      this.score = [0, 0];
      this.clock = 0;            // real seconds elapsed in the current half
      this.half = 1;
      this.phase = 'kickoff';    // kickoff | play | setpiece | goal | halftime | fulltime
      this.phaseT = 0;
      this.setpiece = null;
      this.events = [];
      this.stats = { shots: [0, 0], onTarget: [0, 0], poss: [0, 0], passes: [0, 0], corners: [0, 0], fouls: [0, 0], yellows: [0, 0], reds: [0, 0], offsides: [0, 0] };
      this.offLine = [0, 0];     // each team's offside line (team frame), refreshed every step
      this.restartKick = null;   // type of restart being taken (no offside from throw-ins, corners, goal kicks)
      this.firstKick = Math.random() < 0.5 ? 0 : 1;
      this.lastScorer = null;
      this.startKickoff(this.firstKick);
    }

    dir(t) { return t === 0 ? 1 : -1; }   // home attacks +x
    rf(p) { return 0.92 + clamp((p.rating - 70) / 20, 0, 1) * 0.12; }  // rating factor 0.92..1.04
    emit(e, data) { this.events.push(Object.assign({ e }, data)); }
    takeEvents() { const e = this.events; this.events = []; return e; }

    get minute() {
      const m = Math.floor(this.clock / this.halfSeconds * 45) + (this.half === 2 ? 45 : 0);
      return Math.min(m, this.half === 1 ? 45 : 90);
    }

    // ---------- external control ----------
    setInput(team, x, z, sprint, shield) { const c = this.ctrl[team]; c.input.x = x; c.input.z = z; c.input.sprint = !!sprint; c.input.shield = !!shield; }
    queueAction(team, a) { this.ctrl[team].actions.push(a); }
    setController(team, type, difficulty) {
      const c = this.ctrl[team]; c.type = type; c.diff = DIFFICULTY[difficulty || 'normal']; c.actions = [];
      if (type === 'ai') c.active = -1; else this.pickActive(team);
    }

    // ---------- restarts ----------
    benchSpot(p) { return { x: (p.team ? 6 : -6) + p.idx * 0.6, z: HW + 4.5 }; }

    placeFormation(kickTeam) {
      for (const p of this.players) {
        if (p.off) { const s = this.benchSpot(p); p.x = s.x; p.z = s.z; p.vx = p.vz = 0; continue; }
        const d = this.dir(p.team);
        let x = p.base.x * HL * 0.92, z = p.base.z * HW * 0.8;
        x = Math.min(x, -1.5);
        p.x = x * d; p.z = z * d; p.vx = p.vz = 0; p.face = d > 0 ? Math.PI / 2 : -Math.PI / 2;
        p.stunT = 0; p.dive = 0; p.plan = null;
        if (p.team !== kickTeam && hyp(p.x, p.z) < 9.6) { const a = Math.atan2(p.z, p.x); p.x = Math.cos(a) * 9.6; p.z = Math.sin(a) * 9.6; }
      }
      const d = this.dir(kickTeam);
      const taker = this.players[kickTeam * 11 + 9], mate = this.players[kickTeam * 11 + 7];
      taker.x = -0.4 * d; taker.z = 0.3; mate.x = -1.5 * d; mate.z = -4;
      return taker;
    }

    startKickoff(team) {
      const taker = this.placeFormation(team);
      this.resetBall(0, 0);
      this.phase = 'kickoff';
      this.setpiece = { type: 'kickoff', team, taker: taker.id, t: 0 };
      for (let t = 0; t < 2; t++) this.pickActive(t, t === team ? taker.id : -1);
      this.emit('whistle');
    }

    resetBall(x, z) {
      Object.assign(this.ball, { x, y: 0, z, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0, knuckle: 0, glued: false, owner: -1, receiver: -1, shot: null, noPick: -1, offside: null, indirect: -1, penalty: false });
      for (const p of this.players) { p.pending = null; p.headBuf = 0; p.shield = false; p.wallSpot = null; p.wallT = 0; }
    }

    startSetpiece(type, team, x, z) {
      this.resetBall(x, z);
      const d = this.dir(team), gx = d * HL;
      const distGoal = hyp(gx - x, z);
      let taker;
      if (type === 'goalkick') taker = this.players[team * 11];
      else if (type === 'penalty' || (type === 'freekick' && distGoal < 32)) {
        // the striker (or the next forward) steps up for penalties and shooting free kicks
        taker = [9, 10, 8, 7].map(i => this.players[team * 11 + i]).find(q => !q.off) || this.nearest(team, x, z, true);
      } else taker = this.nearest(team, x, z, true);
      // stand behind the ball, facing the field / goal
      const tx = type === 'throw' ? x : (type === 'corner' ? x - Math.sign(x) * 0.6 : x - d * 0.7);
      const tz = type === 'throw' ? z + Math.sign(z) * 0.5 : (type === 'corner' ? z + Math.sign(z) * 0.4 : z);
      taker.x = tx; taker.z = tz; taker.vx = taker.vz = 0;
      taker.face = type === 'penalty' || type === 'freekick' ? Math.atan2(gx - x, -z) : Math.atan2(d * 10 - (type === 'corner' ? x * 0.2 : 0), -z);
      if (type === 'penalty') {
        // everyone but the taker and the keeper waits outside the box
        for (const p of this.players) {
          if (p === taker || p.off) continue;
          if (p.idx === 0 && p.team !== team) { p.x = gx - d * 0.3; p.z = 0; p.face = Math.atan2(-d, 0); continue; }
          if (d * (p.x - gx) > -18.5) { p.x = gx - d * rand(19, 23); p.z = clamp(p.z, -20, 20); }
        }
      } else {
        // opponents must give 9.15 m
        for (const p of this.players) if (p.team !== team && !p.off && hyp(p.x - x, p.z - z) < 9.15) {
          const a = Math.atan2(p.z - z, p.x - x); p.x = x + Math.cos(a) * 9.4; p.z = z + Math.sin(a) * 9.4;
          p.x = clamp(p.x, -HL + 0.5, HL - 0.5); p.z = clamp(p.z, -HW + 0.5, HW - 0.5);
        }
      }
      // defensive wall for free kicks within shooting range
      if (type === 'freekick' && distGoal < 32) {
        const ux = (gx - x) / distGoal, uz = (0 - z) / distGoal, n = distGoal < 20 ? 4 : 3;
        const wx = x + ux * 9.15, wz = z + uz * 9.15;
        const defs = this.players.filter(p => p.team !== team && p.idx !== 0 && !p.off)
          .sort((a, b) => hyp(a.x - wx, a.z - wz) - hyp(b.x - wx, b.z - wz)).slice(0, n);
        defs.forEach((p, i) => {
          const off = (i - (n - 1) / 2) * 0.65;
          p.wallSpot = { x: wx - uz * off, z: wz + ux * off };
          p.x = p.wallSpot.x; p.z = p.wallSpot.z; p.vx = p.vz = 0; p.face = Math.atan2(-ux, -uz);
        });
      }
      this.phase = 'setpiece';
      const human = this.ctrl[team].type === 'human';
      const interactive = human && (type === 'penalty' || (type === 'freekick' && distGoal < 35));
      this.setpiece = { type, team, taker: taker.id, t: 0, interactive, aim: { z: 0, y: type === 'penalty' ? 0.8 : 1.6 }, curl: 0 };
      if (type === 'corner') this.stats.corners[team]++;
      this.pickActive(team, taker.id);
      this.emit('whistle', { short: true });
      this.emit('restart', { type, team });
    }

    // free kick / penalty: move the target over the goal mouth (input already in pitch coordinates)
    aimSetpiece(dt) {
      const sp = this.setpiece, c = this.ctrl[sp.team], d = this.dir(sp.team);
      sp.aim.z = clamp(sp.aim.z + c.input.x * dt * 3.5, -GOAL_W / 2 + 0.25, GOAL_W / 2 - 0.25);
      sp.aim.y = clamp(sp.aim.y - c.input.z * d * dt * 2, 0.2, GOAL_H - 0.15);
    }

    shootSetpiece(p, power) {
      const sp = this.setpiece, d = this.dir(p.team);
      const pen = sp.type === 'penalty';
      this.beginPlayFromSetpiece();
      // curl is chosen in screen terms (bends right / left as the taker sees the goal)
      this.shoot(p, power, sp.aim.z, HUMAN.shotErr * (pen ? 0.6 : 0.8),
        { curl: sp.curl ? 1 : 0, bendZ: sp.curl * d, ty: sp.aim.y });
      if (pen) this.ball.penalty = true;
    }

    // ---------- helpers ----------
    nearest(team, x, z, excludeGk, exclude = -1) {
      let best = null, bd = 1e9;
      for (let i = 0; i < 11; i++) {
        const p = this.players[team * 11 + i];
        if ((excludeGk && i === 0) || p.id === exclude || p.off) continue;
        const d = hyp(p.x - x, p.z - z);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }

    pickActive(team, id = -1) {
      const c = this.ctrl[team];
      if (c.type === 'ai') { c.active = -1; return; }
      if (id >= 0 && this.players[id].idx !== 0) { c.active = id; return; }
      const b = this.ball;
      const p = this.nearest(team, b.x, b.z, true);
      c.active = p.id;
    }

    possessionTeam() { return this.ball.owner >= 0 ? this.players[this.ball.owner].team : -1; }

    // ---------- kicking ----------
    kickBall(p, vx, vy, vz, receiver = -1, spin) {
      const b = this.ball;
      b.owner = -1; b.vx = vx; b.vy = vy; b.vz = vz; b.glued = false;
      b.sx = spin ? spin.x || 0 : 0; b.sy = spin ? spin.y || 0 : 0; b.sz = spin ? spin.z || 0 : 0;
      b.knuckle = spin && spin.knuckle || 0; b.kT = 0; b.penalty = false;
      p.pending = null;
      b.y = Math.max(b.y, 0.01);
      b.lastTouch = p.id; b.lastTeam = p.team;
      b.noPick = p.id; b.noPickT = 0.35;
      b.receiver = receiver; b.shot = null;
      p.kickT = 1;
      const sp = hyp(vx, vy, vz);
      this.emit('kick', { power: clamp(sp / 30, 0, 1) });
      const rk = this.restartKick; this.restartKick = null;
      b.offside = (rk === 'throw' || rk === 'corner' || rk === 'goalkick') ? null : this.offsideSnapshot(p);
      if (b.indirect >= 0 && b.indirect !== p.id) b.indirect = -1;   // someone else touched an indirect free kick
    }

    // second-to-last defender (or the ball if further forward), in the attacking team's frame
    offsideLine(team) {
      const d = this.dir(team), xs = [];
      for (let j = 0; j < 11; j++) { const o = this.players[(1 - team) * 11 + j]; if (!o.off) xs.push(o.x * d); }
      xs.sort((a, b) => b - a);
      return Math.max(xs[1] != null ? xs[1] : 0, this.ball.x * d, 0);
    }
    offsideSnapshot(p) {
      const d = this.dir(p.team), line = this.offsideLine(p.team), ids = [];
      for (let i = 1; i < 11; i++) {
        const q = this.players[p.team * 11 + i];
        if (q !== p && !q.off && q.x * d > line + 0.3) ids.push(q.id);
      }
      return ids.length ? { team: p.team, ids } : null;
    }
    // returns true (and stops play) if p is offside by playing the ball now
    offsideCheck(p) {
      const o = this.ball.offside;
      if (!o) return false;
      if (o.team !== p.team) { this.ball.offside = null; return false; }   // a defender played it: offside reset
      if (!o.ids.includes(p.id)) return false;
      this.stats.offsides[p.team]++;
      this.emit('offside', { id: p.id, team: p.team });
      this.startSetpiece('ifk', 1 - p.team, clamp(p.x, -HL + 1, HL - 1), clamp(p.z, -HW + 1, HW - 1));
      return true;
    }

    passTo(p, q, through, errMul) {
      const b = this.ball, d = this.dir(p.team);
      let tx = q.x, tz = q.z;
      let dist = hyp(tx - b.x, tz - b.z);
      // lead the receiver
      const t0 = dist / 16;
      tx += q.vx * t0 * 0.8; tz += q.vz * t0 * 0.8;
      if (through) { tx += d * 7; tz += Math.sign(q.vz) * 1.5; }
      tx = clamp(tx, -HL + 1, HL - 1); tz = clamp(tz, -HW + 1, HW - 1);
      dist = hyp(tx - b.x, tz - b.z);
      const err = (errMul || 0.05) * (1.3 - this.rf(p) + 0.3) * (through ? 1.4 : 1);
      const ang = Math.atan2(tz - b.z, tx - b.x) + rand(-err, err);
      const lofted = dist > 30 || (through && dist > 22);
      let speed, vy = 0;
      if (lofted) {
        // lob: pick flight time from distance and solve for launch speed
        const T = clamp(dist / 17, 1.1, 2.4);
        speed = dist / T * 0.92; vy = G * T / 2 * 0.9;
      } else speed = clamp(10 + dist * 0.7, 12, 27);
      if (through && !lofted) speed = clamp(speed * 1.1, 11, 25);
      if (q.team === p.team) q.plan = null;
      this.kickBall(p, Math.cos(ang) * speed, vy, Math.sin(ang) * speed, q.id);
      this.stats.passes[p.team]++;
      this.emit('pass', { from: p.id, to: q.id });
    }

    // Lofted ball. From a wide spot in the final third it's a whipped cross into the box (with spin
    // bending it toward goal and an attacker making a run onto it); elsewhere a lob to a team-mate.
    lobPass(p, dx, dz, errMul) {
      const b = this.ball, d = this.dir(p.team), gx = d * HL;
      const cross = Math.abs(b.z) > 11 && d * b.x > HL - 36;
      let tx, tz, q = null;
      if (cross) {
        const runners = this.players.filter(m => m.team === p.team && m !== p && !m.off && m.idx >= 5 && d * m.x > HL - 30);
        runners.sort((m, n) => hyp(m.x - (gx - d * 9), m.z) - hyp(n.x - (gx - d * 9), n.z));
        q = runners[0] || null;
        tx = gx - d * rand(6, 11); tz = -Math.sign(b.z) * rand(-1, 4);
        if (q) q.plan = { x: tx, z: tz, t: 2.4 };
      } else {
        const best = this.bestPass(p, dx, dz, false);
        if (best) { q = best.q; tx = q.x + q.vx * 0.8; tz = q.z + q.vz * 0.8; }
        else { const n = hyp(dx, dz) || 1; tx = b.x + dx / n * 22; tz = b.z + dz / n * 22; }
      }
      tx = clamp(tx, -HL + 1, HL - 1); tz = clamp(tz, -HW + 1, HW - 1);
      const dist = hyp(tx - b.x, tz - b.z) || 1;
      const T = cross ? clamp(dist / 21, 0.8, 1.5) : clamp(dist / 15, 0.9, 2.3), speed = dist / T;
      const arriveY = cross ? 1.7 : 0.6;
      let ax = tx, az = tz, spin = null;
      if (cross) {
        // whip: spin bends it toward the goal line; aim outside so it curls back onto the target
        const ux = (tx - b.x) / dist, uz = (tz - b.z) / dist, nz = -ux, mag = 8;
        const sy = mag * Math.sign(nz * (-Math.sign(b.z) || 1));
        const disp = 0.5 * MAGNUS * mag * speed * T * T * 0.86;
        ax = tx - uz * disp * Math.sign(sy); az = tz + ux * disp * Math.sign(sy);
        spin = { y: sy };
      }
      const err = (errMul || 0.05) * (1.4 - this.rf(p));
      const ang = Math.atan2(az - b.z, ax - b.x) + rand(-err, err);
      const vy = (arriveY - b.y) / T + 0.5 * G * T;
      this.kickBall(p, Math.cos(ang) * speed, vy, Math.sin(ang) * speed, q ? q.id : -1, spin);
      this.stats.passes[p.team]++;
      this.emit('pass', { from: p.id, to: q ? q.id : -1, lob: true, cross });
    }

    // Fake shot: the shooting motion is cut short; nearby defenders (and the keeper) bite.
    fakeShot(p) {
      const d = this.dir(p.team);
      p.kickT = 0.45; p.touchCd = 0.3;
      for (let j = 0; j < 11; j++) {
        const o = this.players[(1 - p.team) * 11 + j];
        if (o.off) continue;
        const dist = hyp(o.x - p.x, o.z - p.z);
        if (j === 0 && dist < 25) { if (Math.random() < 0.5) o.dive = (Math.random() < 0.5 ? -1 : 1) * 1.1; continue; }
        if (dist < 4.5 && Math.random() < 0.75) { o.stunT = 0.6; o.vx *= 0.3; o.vz *= 0.3; }
      }
      // body swerve: a burst sideways away from the closest defender
      const o = this.nearestOpp(p), side = o && (o.z - p.z) * d > 0 ? -1 : 1;
      p.vx += -Math.cos(p.face) * side * 3; p.vz += Math.sin(p.face) * side * 3;
      this.emit('fake', { by: p.id });
    }

    // kick into space in a direction (when no good receiver)
    passInto(p, dx, dz, through) {
      const n = hyp(dx, dz) || 1, sp = through ? 18 : 14;
      this.kickBall(p, dx / n * sp, through ? 3 : 0, dz / n * sp, -1);
    }

    // opts: { curl: -1..1 (finesse: bends into the corner), header: true }
    shoot(p, power, aimZ, errMul, opts = {}) {
      const b = this.ball, d = this.dir(p.team);
      const gx = d * (HL + 0.5);
      // aim near a post unless told otherwise
      let tz = aimZ != null ? clamp(aimZ, -GOAL_W / 2 + 0.35, GOAL_W / 2 - 0.35)
                            : (b.z > 0 ? -1 : 1) * rand(2.0, 3.5);
      const dist = hyp(gx - b.x, tz - b.z);
      power = clamp(power, 0.05, 1);
      const curl = clamp(opts.curl || 0, -1, 1);
      let speed = opts.header ? 10 + power * 7 : 15 + power * 16;
      if (curl) speed *= 0.88;
      const quality = this.rf(p);
      let err = (errMul || 0.05) * (1.4 - quality) * 4.5 + Math.max(0, power - 0.82) * 0.22 + dist / 500;
      if (curl) err *= 0.8;
      if (opts.header) err *= 1.3;
      let ty = opts.ty != null ? opts.ty : opts.header ? rand(0.15, 1.1)
        : clamp(0.25 + power * 1.5 + rand(-0.4, 0.4) + Math.max(0, power - 0.88) * rand(0, 5), 0.15, 4);
      const T = dist / speed;
      // finesse: aim outside the target and let Magnus lift bend it back in toward the middle of the goal
      let ax = gx, az = tz, spin = null;
      if (curl) {
        const ux = (gx - b.x) / dist, uz = (tz - b.z) / dist, nz = -ux;           // n = (uz, -ux)
        const mag = 10 + Math.abs(curl) * 8;
        const towardCentre = opts.bendZ || -Math.sign(tz) || 1;
        const sy = mag * Math.sign(nz * towardCentre);
        const disp = 0.5 * MAGNUS * Math.abs(sy) * speed * T * T * 0.86;   // 0.86: spin decay + drag shorten the real bend
        ax = gx - uz * disp * Math.sign(sy); az = tz + ux * disp * Math.sign(sy);
        spin = { y: sy };
      } else if (!opts.header && power > 0.9) spin = { knuckle: 3 };             // full-power strikes wobble
      const ang = Math.atan2(az - b.z, ax - b.x) + rand(-err, err);
      const vy = (ty - b.y) / T + 0.5 * G * T;
      this.kickBall(p, Math.cos(ang) * speed, vy, Math.sin(ang) * speed, -1, spin);
      this.ball.shot = { team: p.team, by: p.id, saved: false, counted: false };
      this.stats.shots[p.team]++;
      // predict on target (ignoring curl, which by design ends near the aim point)
      const tt = (gx - b.x) / (Math.cos(ang) * speed);
      const zc = curl ? tz + (ang - Math.atan2(az - b.z, ax - b.x)) * dist : b.z + Math.sin(ang) * speed * tt;
      const yc = b.y + vy * tt - 0.5 * G * tt * tt;
      if (Math.abs(zc) < GOAL_W / 2 && yc < GOAL_H && yc > -0.5) this.stats.onTarget[p.team]++;
      this.emit('shot', { by: p.id, header: !!opts.header, curl: !!curl });
    }

    // choose a pass target; dir = preferred direction (unit) or null for AI "best option"
    bestPass(p, dx, dz, ai) {
      const d = this.dir(p.team);
      let best = null, bs = -1e9;
      for (let i = 1; i < 11; i++) {
        const q = this.players[p.team * 11 + i];
        if (q === p || q.off) continue;
        const vx = q.x - p.x, vz = q.z - p.z, dist = hyp(vx, vz);
        if (dist < 4 || dist > 48) continue;
        let score;
        if (!ai) {
          const cos = (vx * dx + vz * dz) / dist;
          if (cos < 0.45) continue;
          score = cos * 3 - dist / 35;
        } else {
          const progress = (q.x - p.x) * d;
          score = progress / 10 - dist / 60;
          if (q.idx === 0) score -= 3;
        }
        // openness of receiver and passing lane
        let lane = 0, open = 20;
        for (let j = 0; j < 11; j++) {
          const o = this.players[(1 - p.team) * 11 + j];
          if (o.off) continue;
          open = Math.min(open, hyp(o.x - q.x, o.z - q.z));
          const t = clamp(((o.x - p.x) * vx + (o.z - p.z) * vz) / (dist * dist), 0, 1);
          const lx = p.x + vx * t - o.x, lz = p.z + vz * t - o.z;
          if (t > 0.08 && t < 0.95 && hyp(lx, lz) < 1.8) lane++;
        }
        score += Math.min(open, 8) / (ai ? 4 : 10) - lane * (ai ? 1.6 : 0.7);
        if (score > bs) { bs = score; best = q; }
      }
      return best ? { q: best, score: bs } : null;
    }

    tryTackle(p, slide) {
      const b = this.ball;
      if (b.owner < 0 || p.tackleCd > 0 || p.stunT > 0) return false;
      const o = this.players[b.owner];
      if (o.team === p.team || b.protectT > 0) return false;
      const reach = slide ? 2.6 : 1.7;
      const dist = hyp(b.x - p.x, b.z - p.z);
      p.tackleCd = slide ? 1.2 : 0.6;
      p.kickT = slide ? 0 : 0.6;
      if (slide) { p.slideT = 0.7; this.emit('slide', { by: p.id }); }
      if (dist > reach) { if (slide) p.stunT = 0.9; return false; }
      const c = this.ctrl[p.team];
      // tackling from behind: the tackler is behind the carrier's facing direction
      const behind = (p.x - o.x) * Math.sin(o.face) + (p.z - o.z) * Math.cos(o.face) < -0.3 * hyp(p.x - o.x, p.z - o.z);
      const base = c.type === 'human' && c.active === p.id ? HUMAN.tackle : c.diff.tackle;
      const chance = clamp(base + (p.rating - o.rating) * 0.015 + (slide ? 0.1 : 0) - dist * 0.08 - (o.shield ? 0.25 : 0), 0.05, 0.9);
      if (Math.random() < chance) {
        // won the ball, but a slide from behind usually goes through the man first
        if (slide && behind && Math.random() < 0.4) { this.foul(p, o, 'behind'); return false; }
        b.owner = -1; b.lastTouch = p.id; b.lastTeam = p.team;
        if (Math.random() < 0.55 && !slide) { b.owner = p.id; b.protectT = 0.6; this.onPossession(p); }
        else {
          const a = p.face + rand(-0.5, 0.5);
          b.vx = Math.sin(a) * rand(4, 8); b.vz = Math.cos(a) * rand(4, 8); b.vy = 0;
          b.noPick = o.id; b.noPickT = 0.4;
        }
        o.stunT = 0.45;
        this.emit('tackle', { by: p.id, ok: true });
        return true;
      }
      // missed the ball: slides catch the man, standing tackles sometimes trip him
      if (slide || Math.random() < 0.3) { this.foul(p, o, slide ? (behind ? 'reckless' : 'slide') : 'trip'); return false; }
      p.stunT = slide ? 1.0 : 0.5;
      this.emit('tackle', { by: p.id, ok: false });
      return false;
    }

    foul(p, o, kind) {
      const r = Math.random();
      let card = null;
      if (kind === 'reckless') card = r < 0.3 ? 'red' : 'yellow';
      else if (kind === 'behind') card = r < 0.5 ? 'yellow' : null;
      else if (kind === 'slide') card = r < 0.35 ? 'yellow' : null;
      else card = r < 0.08 ? 'yellow' : null;
      let second = false;
      if (card === 'yellow') { p.yellow++; this.stats.yellows[p.team]++; if (p.yellow >= 2) { card = 'red'; second = true; } }
      if (card === 'red') { p.off = true; this.stats.reds[p.team]++; }
      this.stats.fouls[p.team]++;
      o.stunT = 0.6; p.stunT = 0.8;
      this.emit('foul', { by: p.id, on: o.id, kind });
      if (card) this.emit('card', { id: p.id, team: p.team, color: card, second });
      if (p.off && this.ctrl[p.team].active === p.id) this.pickActive(p.team);
      // penalty if the foul was in the fouler's own box
      const d = this.dir(p.team), lineX = -d * HL;
      const inBox = d * (o.x - lineX) < 16.5 && Math.abs(o.z) < 20.16;
      if (inBox) this.startSetpiece('penalty', o.team, this.dir(o.team) * (HL - 11), 0);
      else this.startSetpiece('freekick', o.team, clamp(o.x, -HL + 1, HL - 1), clamp(o.z, -HW + 1, HW - 1));
    }

    onPossession(p) {
      const b = this.ball;
      b.owner = p.id; b.lastTouch = p.id; b.lastTeam = p.team; b.receiver = -1; b.shot = null;
      b.vx = b.vy = b.vz = 0; b.y = 0;
      p.plan = null; p.decideT = this.ctrl[p.team].type === 'ai' ? rand(0.1, 0.3) : 0;
      const c = this.ctrl[p.team];
      if (c.type === 'human' && p.idx !== 0) c.active = p.id;
      // opponent human: switch to someone near the ball if far away
      const oc = this.ctrl[1 - p.team];
      if (oc.type === 'human' && oc.active >= 0) {
        const a = this.players[oc.active];
        if (hyp(a.x - b.x, a.z - b.z) > 14) this.pickActive(1 - p.team);
      }
      this.emit('possess', { id: p.id });
    }

    // ---------- main step ----------
    step(dt) {
      if (this.phase === 'fulltime') return;
      this.phaseT += dt;
      if (this.phase === 'goal') {
        // celebration then replay (~6.5 s); any button from a human skips the replay
        for (const c of this.ctrl) if (c.actions.length) { if (this.phaseT > 1.2) this.phaseT = GOAL_BREAK; c.actions.length = 0; }
        this.ballPhysics(dt);
        this.movePlayers(dt, true);
        if (this.phaseT >= GOAL_BREAK) this.afterBreak();
        return;
      }
      if (this.phase === 'halftime') {
        if (this.phaseT > 3) { this.half = 2; this.clock = 0; this.phaseT = 0; this.startKickoff(1 - this.firstKick); }
        return;
      }

      this.clock += dt;
      if (this.clock >= this.halfSeconds && this.phase === 'play') {
        if (this.half === 1) { this.phase = 'halftime'; this.phaseT = 0; this.emit('half'); return; }
        this.phase = 'fulltime'; this.emit('full'); return;
      }

      const b = this.ball;
      const pt = this.possessionTeam();
      this.stats.poss[pt >= 0 ? pt : b.lastTeam] += dt;

      this.offLine[0] = this.offsideLine(0); this.offLine[1] = this.offsideLine(1);
      this.handleActions();

      if (this.phase === 'kickoff' || this.phase === 'setpiece') {
        const sp = this.setpiece;
        sp.t += dt;
        const taker = this.players[sp.taker];
        const c = this.ctrl[sp.team];
        const humanTaker = c.type === 'human' && c.active === taker.id;
        if (sp.interactive) this.aimSetpiece(dt);
        // AI or idle human takes it
        if ((!humanTaker && sp.t > (sp.type === 'kickoff' ? 1.2 : sp.type === 'penalty' ? 2 : 1.4)) || sp.t > (sp.interactive ? 15 : 8)) this.aiRestart(taker, sp);
        this.movePlayers(dt, false);
        if (this.phase === 'kickoff' || this.phase === 'setpiece') {
          // keep the taker on the ball
          if (sp.type !== 'kickoff') { taker.vx = taker.vz = 0; }
          else { taker.x = -0.4 * this.dir(sp.team); taker.z = 0.3; taker.vx = taker.vz = 0; }
        }
        return;
      }

      this.ballPhysics(dt);
      this.movePlayers(dt, false);
      this.runPending(dt);
      this.goalkeepers(dt);
      this.checkPickup();
      this.checkOut();
    }

    afterBreak() {
      const conceded = this.lastGoalTeam != null ? 1 - this.lastGoalTeam : 0;
      this.phaseT = 0;
      if (this.clock >= this.halfSeconds) {
        if (this.half === 1) { this.phase = 'halftime'; this.emit('half'); return; }
        this.phase = 'fulltime'; this.emit('full'); return;
      }
      this.startKickoff(conceded);
    }

    handleActions() {
      for (let t = 0; t < 2; t++) {
        const c = this.ctrl[t];
        if (c.type !== 'human') { c.actions.length = 0; continue; }
        while (c.actions.length) {
          const a = c.actions.shift();
          const sp = this.setpiece;
          if ((this.phase === 'setpiece') && sp && sp.interactive && sp.team === t) {
            if (a.a === 'switch') { sp.curl = sp.curl === 0 ? 1 : sp.curl === 1 ? -1 : 0; continue; }
            if (a.a === 'shoot') { this.shootSetpiece(this.players[sp.taker], a.power != null ? a.power : 0.6); continue; }
          }
          if (a.a === 'switch') {
            if (this.ball.owner >= 0 && this.players[this.ball.owner].team === t) continue;
            const cur = c.active;
            const b = this.ball;
            // nearest to the ball other than the current player
            let best = null, bd = 1e9;
            for (let i = 1; i < 11; i++) {
              const p = this.players[t * 11 + i];
              if (p.id === cur || p.off) continue;
              const d = hyp(p.x - b.x - b.vx * 0.3, p.z - b.z - b.vz * 0.3);
              if (d < bd) { bd = d; best = p; }
            }
            if (best) c.active = best.id;
            continue;
          }
          if (c.active < 0) continue;
          this.doAction(t, this.players[c.active], a);
        }
      }
    }

    doAction(t, p, a) {
      const c = this.ctrl[t], b = this.ball;
      const inSetpiece = (this.phase === 'kickoff' || this.phase === 'setpiece') && this.setpiece.team === t && this.setpiece.taker === p.id;
      let dx = a.x, dz = a.z;
      if (!dx && !dz) { dx = Math.sin(p.face); dz = Math.cos(p.face); }
      // kick-off with no direction held: play it back to a team-mate
      if (inSetpiece && this.phase === 'kickoff' && hyp(a.x, a.z) < 0.2) { dx = -this.dir(t); dz = 0.3; }
      const near = hyp(b.x - p.x, b.z - p.z);
      if (b.owner === p.id && !inSetpiece && near > 1.4) { p.pending = { a, t: 0.6 }; return; }   // run onto the touch, then play it
      if (b.owner === p.id && !inSetpiece) {
        if (a.a === 'knock') { p.knock = true; p.touchCd = 0; return; }                 // double-tap sprint
        if (a.a === 'fake') { this.fakeShot(p); return; }
      }
      if (a.a === 'knock' || a.a === 'fake') return;
      if (b.owner === p.id || inSetpiece) {
        if (inSetpiece) this.beginPlayFromSetpiece();
        p.pending = null;
        if (a.a === 'lob') { this.lobPass(p, dx, dz, HUMAN.passErr); const r = this.ball.receiver; if (r >= 0) c.active = r; return; }
        if (a.a === 'shoot') {
          // hold a sideways direction to aim at a post and curl it into the corner (finesse)
          const lateral = Math.abs(a.z) > 0.3;
          const aim = lateral ? Math.sign(a.z) * 2.8 : null;
          this.shoot(p, a.power != null ? a.power : 0.6, aim, HUMAN.shotErr, { curl: lateral ? Math.min(1, Math.abs(a.z)) : 0 });
        } else {
          const through = a.a === 'through';
          const best = this.bestPass(p, dx, dz, false);
          if (best) { this.passTo(p, best.q, through, HUMAN.passErr); c.active = best.q.id; }
          else this.passInto(p, dx, dz, through);
        }
        return;
      }
      if (this.phase !== 'play') return;
      // ball in the air or on its way to you: queue a header / volley / first-time pass
      if (b.owner < 0 && near < 4.5 && (b.y > 0.3 || b.vy > 0.5 || b.receiver === p.id)) {
        p.headBuf = 0.45; p.headAct = a.a; p.headDir = { x: dx, z: dz }; p.headPower = a.power;
        return;
      }
      // defending: pass key = tackle, shoot key = slide tackle
      if (a.a === 'lob') return;
      if (a.a === 'pass' || a.a === 'through') this.tryTackle(p, false);
      else if (a.a === 'shoot') this.tryTackle(p, true);
    }

    // actions pressed while the ball was a step ahead are played once the carrier reaches it
    runPending(dt) {
      for (let t = 0; t < 2; t++) {
        const c = this.ctrl[t];
        if (c.type !== 'human' || c.active < 0) continue;
        const p = this.players[c.active];
        if (!p.pending) continue;
        p.pending.t -= dt;
        const b = this.ball;
        if (b.owner !== p.id || p.pending.t <= 0) { p.pending = null; continue; }
        if (hyp(b.x - p.x, b.z - p.z) <= 1.4) { const a = p.pending.a; p.pending = null; this.doAction(t, p, a); }
      }
    }

    beginPlayFromSetpiece() {
      const sp = this.setpiece;
      this.phase = 'play'; this.phaseT = 0;
      if (sp) {
        this.restartKick = sp.type;
        if (sp.type === 'ifk') this.ball.indirect = sp.taker;
        for (const p of this.players) if (p.wallSpot) p.wallT = 1.2;   // the wall holds its line as the kick is struck
      }
    }

    aiRestart(taker, sp) {
      this.beginPlayFromSetpiece();
      const diff = this.ctrl[taker.team].diff;
      const d = this.dir(taker.team);
      if (sp.type === 'kickoff') {
        const mate = this.players[taker.team * 11 + 7];
        this.passTo(taker, mate, false, 0.01);
        return;
      }
      if (sp.type === 'corner') {
        // cross to an attacker in the box
        const cands = this.players.filter(p => p.team === taker.team && p.idx >= 5 && p !== taker);
        cands.sort((a, b) => hyp(a.x - d * (HL - 9), a.z) - hyp(b.x - d * (HL - 9), b.z));
        const q = cands[0];
        const tx = d * (HL - rand(6, 11)), tz = rand(-5, 5);
        const dist = hyp(tx - this.ball.x, tz - this.ball.z), T = clamp(dist / 20, 1.0, 1.7);
        q.plan = { x: tx, z: tz, t: 2.5 };
        this.kickBall(taker, (tx - this.ball.x) / T, G * T / 2 - 0.4, (tz - this.ball.z) / T, q.id);
        return;
      }
      const gx = d * HL, distGoal = hyp(gx - this.ball.x, this.ball.z);
      if (sp.type === 'penalty') {
        const side = Math.random() < 0.15 ? 0 : (Math.random() < 0.5 ? -1 : 1);
        this.shoot(taker, rand(0.7, 0.9), side * rand(2.2, 3.2), diff.shotErr * 0.6, { ty: rand(0.3, 1.6) });
        this.ball.penalty = true;
        return;
      }
      if (sp.type === 'freekick' && distGoal < 28 && Math.abs(this.ball.z) < 22 && Math.random() < 0.7) {
        // curl it over the wall toward a corner
        const side = Math.random() < 0.5 ? -1 : 1;
        this.shoot(taker, rand(0.45, 0.7), side * rand(2.0, 3.1), diff.shotErr, { curl: 1, ty: rand(1.5, 2.2) });
        return;
      }
      const best = this.bestPass(taker, 0, 0, true);
      if (best) this.passTo(taker, best.q, false, diff.passErr);
      else this.passInto(taker, d, -Math.sign(taker.z) * 0.5, false);
    }

    // ---------- ball ----------
    ballPhysics(dt) {
      const b = this.ball;
      if (b.protectT > 0) b.protectT -= dt;
      if (b.noPickT > 0) { b.noPickT -= dt; if (b.noPickT <= 0) b.noPick = -1; }
      if (b.owner >= 0) { this.dribble(dt); if (b.glued) return; }
      const prevX = b.x;
      const airborne = b.y > 0.01 || b.vy > 0;
      if (airborne) {
        // Magnus lift: a = k (w x v)
        b.vx += MAGNUS * (b.sy * b.vz - b.sz * b.vy) * dt;
        b.vy += MAGNUS * (b.sz * b.vx - b.sx * b.vz) * dt;
        b.vz += MAGNUS * (b.sx * b.vy - b.sy * b.vx) * dt;
        // knuckleball: an unspun power shot wobbles as the air flow around it changes
        if (b.knuckle > 0) {
          b.kT -= dt;
          if (b.kT <= 0) { b.kT = 0.12; b.kax = rand(-1, 1) * b.knuckle; b.kay = rand(-1, 1) * b.knuckle * 0.6; }
          const s = hyp(b.vx, b.vz) || 1;
          b.vx += -b.vz / s * b.kax * dt; b.vz += b.vx / s * b.kax * dt; b.vy += b.kay * dt;
        }
        const f = Math.exp(-SPIN_DECAY * dt); b.sx *= f; b.sy *= f; b.sz *= f;
      }
      b.vy -= G * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y <= 0) {
        b.y = 0;
        if (b.vy < -1.2) { b.vy = -b.vy * 0.5; b.vx *= 0.9; b.vz *= 0.9; b.sy *= 0.6; b.sx *= 0.4; b.sz *= 0.4; b.knuckle = 0; } else b.vy = 0;
      }
      if (b.y === 0 && b.vy === 0) {
        const s = hyp(b.vx, b.vz);
        const ns = Math.max(0, s - (0.6 + s * 0.45) * dt);
        if (s > 0) { b.vx *= ns / s; b.vz *= ns / s; }
        b.sx = b.sy = b.sz = 0; b.knuckle = 0;
      } else { b.vx *= 1 - 0.08 * dt; b.vz *= 1 - 0.08 * dt; }
      this.goalFrame(prevX);
    }

    // The carrier no longer has the ball glued to his boot: he taps it ahead and runs onto it.
    // Close control (slow) keeps it at the feet; shielding keeps the body between ball and defender.
    dribble(dt) {
      const b = this.ball, p = this.players[b.owner];
      const spd = hyp(p.vx, p.vz);
      const rx = b.x - p.x, rz = b.z - p.z, dist = hyp(rx, rz);
      if (dist > 3.4 || b.y > 1.0) { this.loseBall(); return; }
      if (p.touchCd > 0) p.touchCd -= dt;
      let dx, dz;
      if (spd > 0.5) { dx = p.vx / spd; dz = p.vz / spd; } else { dx = Math.sin(p.face); dz = Math.cos(p.face); }
      if (p.shield) {
        const o = this.nearestOpp(p);
        let ux = dx, uz = dz;
        if (o) { const n = hyp(p.x - o.x, p.z - o.z) || 1; ux = (p.x - o.x) / n; uz = (p.z - o.z) / n; }
        this.glue(p.x + ux * 0.55, p.z + uz * 0.55, p, dt);
        return;
      }
      // close control when slow, or when a defender is near and the carrier isn't sprinting
      const opp = this.nearestOpp(p), oppD = opp ? hyp(opp.x - p.x, opp.z - p.z) : 99;
      if (!p.knock && (spd < 2.6 || (oppD < 3 && spd < 6.4))) { this.glue(p.x + Math.sin(p.face) * 0.5, p.z + Math.cos(p.face) * 0.5, p, dt); return; }
      b.glued = false;
      const ahead = rx * dx + rz * dz, side = Math.abs(rx * dz - rz * dx);
      if (p.touchCd <= 0 && (ahead < 0.65 || side > 0.7)) {
        const sprinting = spd > 6.4;
        const push = p.knock ? 8.5 : sprinting ? 2.8 : 1.3;   // sprint touches are heavier; a knock-on goes ~5 m
        if (ahead < 0.35 || side > 0.7) { b.x = p.x + dx * 0.45; b.z = p.z + dz * 0.45; }
        b.vx = dx * (spd + push); b.vz = dz * (spd + push); b.vy = 0; b.y = 0;
        p.touchCd = p.knock ? 0.6 : sprinting ? 0.35 : 0.25;
        p.kickT = Math.max(p.kickT, p.knock ? 0.8 : 0.3);
        if (p.knock) { p.knock = false; this.emit('kick', { power: 0.35 }); }
      }
    }

    glue(tx, tz, p, dt) {
      const b = this.ball, k = Math.min(1, dt * 12);
      b.glued = true;
      b.x += (tx - b.x) * k; b.z += (tz - b.z) * k; b.y = 0; b.vy = 0;
      b.vx = p.vx; b.vz = p.vz; b.sx = b.sy = b.sz = 0;
    }

    loseBall() {
      const b = this.ball;
      b.owner = -1; b.glued = false; b.receiver = -1;
      for (const p of this.players) p.pending = null;
    }

    // where a loose ball will be when it comes down to height h (for lobs and crosses), else a short lead
    meetPoint(h = 1.4, lead = 0.3) {
      const b = this.ball;
      if (b.y > h || b.vy > 1) {
        const disc = b.vy * b.vy + 2 * G * (b.y - h);
        if (disc > 0) { const t = (b.vy + Math.sqrt(disc)) / G; return { x: b.x + b.vx * t, z: b.z + b.vz * t }; }
      }
      return { x: b.x + b.vx * lead, z: b.z + b.vz * lead };
    }

    nearestOpp(p) {
      let best = null, bd = 1e9;
      for (let j = 0; j < 11; j++) {
        const o = this.players[(1 - p.team) * 11 + j];
        if (o.off) continue;
        const d = hyp(o.x - p.x, o.z - p.z);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    }

    // posts, crossbar and net
    goalFrame(prevX) {
      const b = this.ball;
      for (const s of [-1, 1]) {
        const gx = s * HL;
        // posts (vertical cylinders)
        if (b.y < GOAL_H + BALL_R) for (const pz of [-GOAL_W / 2, GOAL_W / 2]) {
          const dx = b.x - gx, dz = b.z - pz, d = hyp(dx, dz);
          if (d < 0.06 + BALL_R && d > 0) {
            const nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz;
            if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vz -= 1.7 * vn * nz; this.emit('post'); }
            b.x = gx + nx * (0.07 + BALL_R); b.z = pz + nz * (0.07 + BALL_R);
          }
        }
        // crossbar (horizontal cylinder along z)
        if (Math.abs(b.z) < GOAL_W / 2) {
          const dx = b.x - gx, dy = b.y - GOAL_H, d = hyp(dx, dy);
          if (d < 0.06 + BALL_R && d > 0) {
            const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
            if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny; this.emit('post'); }
            b.x = gx + nx * (0.07 + BALL_R); b.y = GOAL_H + ny * (0.07 + BALL_R);
          }
        }
        // inside the net: soak up speed at the back, sides and roof
        if (s * b.x > HL && Math.abs(b.z) < GOAL_W / 2 + 0.3 && b.y < GOAL_H + 0.2 && s * prevX >= HL - 0.5) {
          if (s * b.x > HL + 1.85) { b.x = s * (HL + 1.85); b.vx *= -0.15; b.vz *= 0.5; }
          if (Math.abs(b.z) > GOAL_W / 2 - BALL_R) { b.z = Math.sign(b.z) * (GOAL_W / 2 - BALL_R); b.vz *= -0.2; }
          if (b.y > GOAL_H - BALL_R) { b.y = GOAL_H - BALL_R; b.vy = -Math.abs(b.vy) * 0.2; }
        }
      }
    }

    checkPickup() {
      const b = this.ball;
      if (b.owner >= 0) { this.checkSteal(); return; }
      if (b.shot && b.y < 2.05) for (const p of this.players) {
        if (p.wallT > 0 && p.team !== b.shot.team && hyp(p.x - b.x, p.z - b.z) < 0.5) { p.jumpT = 0.5; this.emit('block', { by: p.id, wall: true }); this.deflect(p); return; }
      }
      if (b.y > 2.6) return;
      if (b.y >= 0.95) { this.aerialDuel(); return; }
      let best = null, bd = 1e9;
      for (const p of this.players) {
        if (p.id === b.noPick || p.stunT > 0 || p.off) continue;
        if (p.idx === 0) continue;  // keepers handled separately
        const d = hyp(p.x - b.x, p.z - b.z);
        const reach = p.id === b.receiver ? 1.15 : 0.95;
        if (d < reach && d < bd) { bd = d; best = p; }
      }
      if (!best) return;
      if (this.offsideCheck(best)) return;
      const sp = hyp(b.vx, b.vz);
      // shots get blocked (deflected), and very hard balls can't always be controlled
      const block = b.shot && b.shot.team !== best.team && sp > 12;
      if (block) this.emit('block', { by: best.id });
      if (block || (sp > 21 && best.id !== b.receiver && Math.random() < 0.6)) {
        this.deflect(best);
        return;
      }
      const c = this.ctrl[best.team];
      const d = this.dir(best.team);
      const distGoal = hyp(d * HL - b.x, b.z);
      const humanActive = c.type === 'human' && c.active === best.id;
      // a human who pressed shoot/pass as the ball arrived plays it first time (volley / one-touch pass)
      if (humanActive && best.headBuf > 0) { this.firstTime(best, b.y > 0.35 ? 'volley' : 'first'); return; }
      // first-time finish for AI attackers near goal (volleys from crosses)
      if (!(c.type === 'human' && (humanActive || b.receiver === best.id)) && distGoal < 15 && b.y > 0.4 && Math.random() < 0.7) {
        best.face = Math.atan2(d * HL - best.x, -best.z);
        this.shoot(best, rand(0.5, 0.8), null, c.diff.shotErr * 1.3);
        return;
      }
      this.onPossession(best);
    }

    deflect(p) {
      const b = this.ball, a = rand(0, Math.PI * 2);
      b.vx = b.vx * 0.3 + Math.cos(a) * 3; b.vz = b.vz * 0.3 + Math.sin(a) * 3; b.vy = Math.abs(b.vy) * 0.3 + 1;
      b.sx = b.sy = b.sz = 0; b.knuckle = 0;
      b.lastTouch = p.id; b.lastTeam = p.team; b.noPick = p.id; b.noPickT = 0.25; b.shot = null;
      this.emit('kick', { power: 0.3 });
    }

    // Between dribble touches the ball is briefly loose: a defender who gets to it first nicks it.
    checkSteal() {
      const b = this.ball, o = this.players[b.owner];
      if (b.glued || b.protectT > 0 || b.y > 0.8 || this.phase !== 'play' || o.shield) return;
      const od = hyp(o.x - b.x, o.z - b.z);
      if (od < 0.85) return;
      for (let j = 1; j < 11; j++) {
        const p = this.players[(1 - o.team) * 11 + j];
        if (p.stunT > 0 || p.off) continue;
        const d = hyp(p.x - b.x, p.z - b.z);
        if (d < 0.75 && d < od && Math.random() < 0.25) {
          b.lastTouch = p.id; b.lastTeam = p.team;
          if (Math.random() < 0.5) { b.owner = -1; this.onPossession(p); b.protectT = 0.5; }
          else { this.loseBall(); const a = p.face + rand(-0.6, 0.6); b.vx = Math.sin(a) * rand(3, 6); b.vz = Math.cos(a) * rand(3, 6); b.noPick = o.id; b.noPickT = 0.3; }
          this.emit('tackle', { by: p.id, ok: true, nick: true });
          return;
        }
      }
    }

    // High ball (head height): nearby players jump for it; the best-placed one wins.
    aerialDuel() {
      const b = this.ball;
      const cands = [];
      for (const p of this.players) {
        if (p.idx === 0 || p.id === b.noPick || p.stunT > 0 || p.off) continue;
        const d = hyp(p.x - b.x, p.z - b.z);
        if (d < 1.1) {
          const c = this.ctrl[p.team];
          const pressed = c.type === 'human' && c.active === p.id && p.headBuf > 0;
          cands.push({ p, score: p.rating + rand(0, 18) - d * 12 + (pressed ? 14 : 0) + (p.id === b.receiver ? 6 : 0) });
        }
      }
      if (!cands.length) return;
      cands.sort((x, y) => y.score - x.score);
      const p = cands[0].p;
      if (this.offsideCheck(p)) return;
      if (b.y >= 1.65 && cands.length > 1) for (const c of cands) c.p.jumpT = 0.55;
      if (cands.length > 1) this.emit('duel', { winner: p.id });
      const c = this.ctrl[p.team], d = this.dir(p.team);
      const humanActive = c.type === 'human' && c.active === p.id;
      if (humanActive && p.headBuf > 0) { this.firstTime(p, 'header'); return; }
      // an uncontested ball is brought down (chest/thigh); so is a gentle one at chest height
      const opp = this.nearestOpp(p), contested = opp && hyp(opp.x - b.x, opp.z - b.z) < 2;
      if ((!contested && b.y < 2.3) || (b.y < 1.65 && (humanActive || hyp(b.vx, b.vz) < 9))) { p.jumpT = 0; this.onPossession(p); return; }
      const distGoal = hyp(d * HL - b.x, b.z);
      if (distGoal < 17 && Math.abs(b.z) < 12) {
        p.face = Math.atan2(d * HL - p.x, -p.z);
        this.shoot(p, rand(0.4, 0.9), null, c.diff.shotErr, { header: true });
        return;
      }
      if (d * (b.x - (-d * HL)) < 35) {   // defending: clear it with the head
        this.kickBall(p, d * rand(13, 17), rand(2.5, 4), rand(-5, 5), -1);
        this.emit('header', { by: p.id });
        return;
      }
      const best = this.bestPass(p, 0, 0, true);
      if (best) this.headedPass(p, best.q); else this.kickBall(p, d * 8, 3, rand(-3, 3), -1);
    }

    headedPass(p, q) {
      const b = this.ball, dist = hyp(q.x - b.x, q.z - b.z), T = clamp(dist / 12, 0.5, 1.4);
      this.kickBall(p, (q.x - b.x) / T, (0.5 - b.y) / T + 0.5 * G * T, (q.z - b.z) / T, q.id);
      this.emit('header', { by: p.id });
    }

    // Human first-time play: header, volley or one-touch pass in the held direction.
    firstTime(p, kind) {
      const b = this.ball, d = this.dir(p.team);
      const act = p.headAct, dir = p.headDir || { x: d, z: 0 };
      p.headBuf = 0; p.jumpT = kind === 'header' ? 0.55 : 0;
      const distGoal = hyp(d * HL - b.x, b.z);
      if (act === 'shoot' && distGoal < 30) {
        const aim = Math.abs(dir.z) > 0.3 ? Math.sign(dir.z) * 2.8 : null;
        this.shoot(p, p.headPower != null ? p.headPower : 0.7, aim, HUMAN.shotErr * 1.3, { header: kind === 'header' });
        return;
      }
      if (act === 'lob' && kind !== 'header') { this.lobPass(p, dir.x, dir.z, HUMAN.passErr * 1.5); return; }
      const best = this.bestPass(p, dir.x, dir.z, false);
      if (best) {
        if (kind === 'header') this.headedPass(p, best.q); else this.passTo(p, best.q, act === 'through', HUMAN.passErr * 1.5);
        this.ctrl[p.team].active = best.q.id;
      } else this.passInto(p, dir.x, dir.z, act === 'through');
    }

    goalkeepers(dt) {
      const b = this.ball;
      for (let t = 0; t < 2; t++) {
        const gk = this.players[t * 11];
        const d = this.dir(t), lineX = -d * HL;
        const diff = this.ctrl[1 - t].type === 'human' ? this.ctrl[t].diff : this.ctrl[t].diff;
        if (gk.dive) gk.dive *= Math.pow(0.1, dt);
        if (Math.abs(gk.dive) < 0.02) gk.dive = 0;
        if (b.owner === gk.id) {
          gk.holdT = (gk.holdT || 0) + dt;
          if (gk.holdT > 1.3) {
            gk.holdT = 0;
            const best = this.bestPass(gk, 0, 0, true);
            if (best) this.passTo(gk, best.q, false, 0.03);
            else this.passInto(gk, d, rand(-0.5, 0.5), true);
          }
          continue;
        }
        if (b.owner >= 0) continue;
        const reachH = hyp(b.x - gk.x, b.z - gk.z);
        const inBox = d * (b.x - lineX) < 16.5 && Math.abs(b.z) < 20.16;
        // shot handling
        if (b.shot && b.shot.team !== t && !b.shot.saved && reachH < 1.3 + (gk.dive ? 1.0 : 0) && b.y < 2.6) {
          b.shot.saved = true;
          const sp = hyp(b.vx, b.vz);
          const chance = clamp(0.93 - (sp - 18) * 0.035 - Math.max(0, reachH - 0.8) * 0.25 + (gk.rating - 80) * 0.01 + (diff.gk || 0), 0.15, 0.96);
          if (Math.random() < chance) {
            b.offside = null;
            b.penalty = false;
            if (sp < 19 && b.y < 2) { this.onPossession(gk); gk.holdT = 0; }
            else {
              b.vx = -b.vx * 0.3 + d * 3; b.vz = b.vz * 0.3 + rand(-5, 5); b.vy = rand(1, 4);
              b.lastTouch = gk.id; b.lastTeam = t; b.noPick = gk.id; b.noPickT = 0.5; b.shot = null;
            }
            this.emit('save', { team: t });
          }
          continue;
        }
        // loose ball in the box near the keeper: claim it
        if (!b.shot && inBox && reachH < 1.3 && b.y < 2.6 && b.noPick !== gk.id) {
          this.onPossession(gk); gk.holdT = 0;
        }
      }
    }

    checkOut() {
      const b = this.ball;
      if (Math.abs(b.z) > HW + BALL_R) {
        const team = 1 - b.lastTeam;
        this.emit('out');
        this.startSetpiece('throw', team, clamp(b.x, -HL + 1, HL - 1), Math.sign(b.z) * (HW - 0.05));
        return;
      }
      if (Math.abs(b.x) > HL + BALL_R) {
        const s = Math.sign(b.x);
        const scoringTeam = s > 0 ? 0 : 1;
        if (Math.abs(b.z) < GOAL_W / 2 && b.y < GOAL_H && b.indirect >= 0 && b.lastTouch === b.indirect) {
          this.emit('out');   // straight in from an indirect free kick: goal kick
          this.startSetpiece('goalkick', 1 - scoringTeam, s * (HL - 5.5), 0);
          return;
        }
        if (Math.abs(b.z) < GOAL_W / 2 && b.y < GOAL_H) {
          if (this.phase !== 'play') return;
          this.score[scoringTeam]++;
          this.lastGoalTeam = scoringTeam;
          const scorer = b.lastTeam === scoringTeam ? b.lastTouch : -1;
          this.lastScorer = { team: scoringTeam, id: scorer, own: b.lastTeam !== scoringTeam, minute: this.minute };
          this.phase = 'goal'; this.phaseT = 0;
          this.emit('goal', this.lastScorer);
          return;
        }
        const defending = 1 - scoringTeam;
        this.emit('out');
        if (b.lastTeam === defending) this.startSetpiece('corner', scoringTeam, s * (HL - 0.3), Math.sign(b.z || 1) * (HW - 0.3));
        else this.startSetpiece('goalkick', defending, s * (HL - 5.5), Math.sign(b.z || 1) * 4);
      }
    }

    // ---------- players ----------
    movePlayers(dt, celebrate) {
      const b = this.ball;
      const pt = this.possessionTeam();
      // who presses: nearest outfield player of each team to the ball (excluding the human-controlled one)
      const chasers = [[], []];
      for (let t = 0; t < 2; t++) {
        const c = this.ctrl[t];
        const list = this.players.slice(t * 11 + 1, t * 11 + 11).filter(p => !p.off && !(c.type === 'human' && c.active === p.id));
        const fx = b.x + b.vx * 0.35, fz = b.z + b.vz * 0.35;
        list.sort((p, q) => hyp(p.x - fx, p.z - fz) - hyp(q.x - fx, q.z - fz));
        chasers[t] = list.slice(0, 2).map(p => p.id);
      }

      for (const p of this.players) {
        if (p.off) {   // sent off: walk to the touchline and stay there
          const s = this.benchSpot(p), ex = s.x - p.x, ez = s.z - p.z, n = hyp(ex, ez);
          const sp = n > 0.3 ? Math.min(3, n) : 0;
          p.vx = n ? ex / n * sp : 0; p.vz = n ? ez / n * sp : 0; p.x += p.vx * dt; p.z += p.vz * dt;
          if (sp) p.face = Math.atan2(p.vx, p.vz);
          continue;
        }
        if (p.wallT > 0) { p.wallT -= dt; if (p.wallT <= 0) p.wallSpot = null; }
        if (p.kickT > 0) p.kickT = Math.max(0, p.kickT - dt * 3.3);
        if (p.tackleCd > 0) p.tackleCd -= dt;
        if (p.stunT > 0) p.stunT -= dt;
        if (p.headBuf > 0) p.headBuf -= dt;
        if (p.jumpT > 0) p.jumpT = Math.max(0, p.jumpT - dt);
        if (p.slideT > 0) { p.slideT = Math.max(0, p.slideT - dt); p.vx *= 1 - dt * 2; p.vz *= 1 - dt * 2; }
        if (p.shieldT > 0) p.shieldT -= dt;
        const c = this.ctrl[p.team];
        const d = this.dir(p.team);
        let tx = p.x, tz = p.z, sprint = false, mx = 0, mz = 0, manual = false;
        const isActive = c.type === 'human' && c.active === p.id;

        if (celebrate) {
          // scorers' team runs to the corner flag, others walk back
          if (this.lastScorer && p.team === this.lastScorer.team) { tx = d * HL * 0.8; tz = Math.sign(p.z || 1) * HW * 0.8; }
          else { tx = p.x * 0.98; tz = p.z; }
        } else if (isActive && !(this.phase !== 'play' && this.setpiece && this.setpiece.taker === p.id)) {
          manual = true;
          mx = c.input.x; mz = c.input.z; sprint = c.input.sprint;
          // assist: run onto passes aimed at you when you aren't steering
          if (!mx && !mz && b.receiver === p.id && b.owner < 0) {
            const m = this.meetPoint(1.4, 0.25), ax = m.x - p.x, az = m.z - p.z, n = hyp(ax, az);
            if (n > 0.4) { mx = ax / n; mz = az / n; }
          }
        } else if (p.idx === 0) {
          ({ tx, tz, sprint } = this.gkTarget(p));
        } else {
          ({ tx, tz, sprint } = this.aiTarget(p, pt, chasers, dt));
        }

        p.shield = b.owner === p.id && (isActive ? c.input.shield : p.shieldT > 0);
        p.pressing = !isActive && c.type === 'human' && c.input.shield && b.owner >= 0 && this.players[b.owner].team !== p.team && chasers[p.team][0] === p.id;
        let speed = (sprint ? 7.8 : 5.6) * this.rf(p) * (c.type === 'ai' ? c.diff.speed : 1);
        if (b.owner === p.id) speed *= p.shield ? 0.45 : 0.9;
        if (p.stunT > 0) speed *= 0.35;
        if (this.phase === 'kickoff' || this.phase === 'setpiece') { if (p.id === this.setpiece.taker) speed = 0; }

        let dvx, dvz;
        if (manual) {
          const n = hyp(mx, mz);
          if (n > 1) { mx /= n; mz /= n; }
          dvx = mx * speed; dvz = mz * speed;
        } else {
          const ex = tx - p.x, ez = tz - p.z, dist = hyp(ex, ez);
          const s = dist > 0.3 ? Math.min(speed, dist * 2.2) : 0;
          dvx = dist > 0 ? ex / dist * s : 0; dvz = dist > 0 ? ez / dist * s : 0;
        }
        const acc = Math.min(1, dt * (p.stunT > 0 ? 3 : 9));
        p.vx += (dvx - p.vx) * acc; p.vz += (dvz - p.vz) * acc;
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.x = clamp(p.x, -HL - 3, HL + 3); p.z = clamp(p.z, -HW - 3, HW + 3);
        const sp = hyp(p.vx, p.vz);
        if (sp > 0.6) p.face = turnTo(p.face, Math.atan2(p.vx, p.vz), dt * 10);
        else if (b.owner !== p.id) p.face = turnTo(p.face, Math.atan2(b.x - p.x, b.z - p.z), dt * 5);

        // AI defenders tackle automatically
        if (!manual && !celebrate && this.phase === 'play' && b.owner >= 0 && this.players[b.owner].team !== p.team && p.tackleCd <= 0) {
          const dist = hyp(b.x - p.x, b.z - p.z);
          const rate = c.type === 'ai' ? c.diff.press : (c.input.shield ? 1.6 : 0.8);
          if (dist < 1.5) {
            if (Math.random() < dt * 2.5 * rate) this.tryTackle(p, false);
            else p.tackleCd = 0.15;
          } else if (dist < 2.4 && hyp(this.players[b.owner].vx, this.players[b.owner].vz) > 5 && Math.random() < dt * 0.5 * rate) {
            // a carrier is getting away: lunge in with a slide (mostly avoiding going through him from behind)
            const o = this.players[b.owner];
            const behind = (p.x - o.x) * Math.sin(o.face) + (p.z - o.z) * Math.cos(o.face) < 0;
            if (!behind || Math.random() < 0.25) this.tryTackle(p, true); else p.tackleCd = 0.4;
          }
        }
        // AI ball carrier decisions
        if (!manual && !celebrate && b.owner === p.id && this.phase === 'play' && p.idx !== 0) this.aiOnBall(p, dt);
      }
      // keep players from overlapping
      for (let i = 0; i < 22; i++) for (let j = i + 1; j < 22; j++) {
        const a = this.players[i], q = this.players[j];
        if (a.off || q.off) continue;
        const dx = q.x - a.x, dz = q.z - a.z, d = hyp(dx, dz);
        if (d < 0.8 && d > 1e-4) { const push = (0.8 - d) / 2, nx = dx / d, nz = dz / d; a.x -= nx * push; a.z -= nz * push; q.x += nx * push; q.z += nz * push; }
      }
    }

    gkTarget(gk) {
      const b = this.ball, d = this.dir(gk.team), lineX = -d * HL;
      let tx = lineX + d * 1.2, tz = clamp(b.z * 0.2, -2.6, 2.6), sprint = false;
      // come off the line a little when the ball is near
      const bd = hyp(b.x - lineX, b.z);
      if (bd < 30) { tx = lineX + d * clamp(1.2 + (30 - bd) * 0.12, 1.2, 4.5); tz = clamp(b.z * 0.35, -3, 3); }
      // penalty: commit to a side as the kick is struck
      if (b.penalty && b.shot && b.shot.team !== gk.team) {
        if (gk.penGuess == null) gk.penGuess = Math.random() < 0.12 ? 0 : (Math.random() < 0.5 ? -1 : 1);
        if (gk.penGuess) gk.dive = gk.penGuess * d * -1.1;
        return { tx: lineX + d * 0.3, tz: gk.penGuess * 2.4, sprint: true };
      }
      gk.penGuess = null;
      // react to a shot: move to where it will cross the line
      if (b.shot && b.shot.team !== gk.team && b.owner < 0 && b.vx * d < -2) {
        const t = (gk.x - b.x) / (b.vx || 1e-3);
        if (t > 0 && t < 2) {
          const zc = clamp(b.z + b.vz * t, -GOAL_W / 2 - 0.5, GOAL_W / 2 + 0.5);
          tz = zc; tx = gk.x; sprint = true;
          if (Math.abs(zc - gk.z) > 0.9 && t < 0.6) gk.dive = Math.sign(zc - gk.z) * d * -1.1;
        }
      }
      // loose ball in the box: rush it
      const inBox = d * (b.x - lineX) < 16.5 && Math.abs(b.z) < 20.16;
      if (b.owner < 0 && !b.shot && inBox && b.lastTeam !== gk.team) {
        const near = this.nearest(1 - gk.team, b.x, b.z, false);
        if (hyp(near.x - b.x, near.z - b.z) > hyp(gk.x - b.x, gk.z - b.z) - 1) { tx = b.x; tz = b.z; sprint = true; }
      }
      return { tx, tz, sprint };
    }

    aiTarget(p, pt, chasers, dt) {
      const b = this.ball, d = this.dir(p.team), c = this.ctrl[p.team];
      const f = p.base;
      const bx = b.x * d, bz = b.z * d;      // ball in team frame
      const attacking = pt === p.team || (pt < 0 && b.lastTeam === p.team && b.receiver >= 0);
      const setp = (this.phase === 'kickoff' || this.phase === 'setpiece') ? this.setpiece : null;

      if (p.wallSpot) return { tx: p.wallSpot.x, tz: p.wallSpot.z, sprint: false };
      // planned runs (e.g. attacking a corner)
      if (p.plan) { p.plan.t -= dt; if (p.plan.t <= 0) p.plan = null; else return { tx: p.plan.x, tz: p.plan.z, sprint: true }; }

      // receiver of a pass: meet the ball
      if (b.receiver === p.id && b.owner < 0) {
        const m = this.meetPoint(1.4, 0.35);
        return { tx: m.x, tz: m.z, sprint: true };
      }
      // chase loose balls / press the carrier
      if (!setp) {
        const ci = chasers[p.team].indexOf(p.id);
        if (b.owner < 0 && ci === 0) {
          // only chase an opponent's pass if we can get there first
          const r = b.receiver >= 0 ? this.players[b.receiver] : null;
          const mine = hyp(p.x - b.x, p.z - b.z);
          if (!r || r.team === p.team || mine < hyp(r.x - b.x, r.z - b.z) * 0.75)
            return { tx: b.x + b.vx * 0.3, tz: b.z + b.vz * 0.3, sprint: true };
        }
        if (b.owner >= 0 && this.players[b.owner].team !== p.team) {
          if (ci === 0) {
            const o = this.players[b.owner];
            if (c.type === 'human' && c.input.shield) return { tx: b.x, tz: b.z, sprint: true };   // second-man press
            // goal-side approach: sprint to close down, then jockey
            const gx = -d * HL, dist = hyp(o.x - p.x, o.z - p.z);
            if (dist < 4) return { tx: b.x, tz: b.z, sprint: true };
            return { tx: o.x + (gx - o.x) * 0.04, tz: o.z + (0 - o.z) * 0.04, sprint: dist > 7 };
          }
          if (ci === 1) {
            const gx = -d * HL;
            return { tx: b.x + (gx - b.x) * 0.3, tz: b.z * 0.75, sprint: false };
          }
        }
      }
      // formation shape shifted with the ball
      let x = f.x * HL * 0.92 + bx * 0.5 + (attacking ? 9 : -3);
      let z = f.z * HW * (attacking ? 0.92 : 0.7) + bz * (attacking ? 0.2 : 0.35);
      if (f.role === 'def') x = Math.min(x, attacking ? bx - 4 : bx - 6);
      if (f.role === 'fwd' && attacking) x = clamp(Math.max(x + 5, bx + 10), -HL, HL - 13);
      if (f.role === 'mid' && attacking) x = Math.min(x, bx + 10);
      if (setp && setp.type === 'corner' && setp.team === p.team && f.role !== 'def') {
        x = HL - rand(6, 14); z = f.z * 12;
      }
      // forwards play on the last defender's shoulder; everyone stays onside, though forwards
      // sometimes mistime the run by a step or two
      if (attacking && !setp) {
        const line = this.offLine[p.team] - 0.6, slip = Math.max(0, Math.sin(this.clock * 0.45 + p.id * 1.7)) * (f.role === 'fwd' ? 2.2 : 0.4);
        if (f.role === 'fwd' && bx > -15) x = Math.max(x, line - 1.5);
        x = Math.min(x, line + slip);
      }
      if (setp && setp.type === 'penalty') {
        const pd = this.dir(setp.team), px = (pd * HL) * d;     // penalty goal in this team's frame
        if (Math.abs(x - px) < 19) x = px - Math.sign(px) * 19.5;
      }
      x = clamp(x, -HL + 4, HL - 4); z = clamp(z, -HW + 2, HW - 2);
      // small personal variation so lines don't look robotic
      x += Math.sin(p.id * 7.3 + this.clock * 0.3) * 1.2; z += Math.cos(p.id * 3.1 + this.clock * 0.25) * 1.2;
      return { tx: x * d, tz: z * d, sprint: hyp(x * d - p.x, z * d - p.z) > 12 };
    }

    aiOnBall(p, dt) {
      const c = this.ctrl[p.team], d = this.dir(p.team), b = this.ball;
      const diff = c.type === 'ai' ? c.diff : DIFFICULTY.normal;
      const gx = d * HL;
      const distGoal = hyp(gx - p.x, p.z);
      // dribble direction: toward goal, away from the nearest opponent
      let near = null, nd = 1e9;
      for (let j = 0; j < 11; j++) {
        const o = this.players[(1 - p.team) * 11 + j];
        if (o.off) continue;
        const dd = hyp(o.x - p.x, o.z - p.z);
        if (dd < nd) { nd = dd; near = o; }
      }
      let mx = gx - p.x, mz = (Math.abs(p.z) > 12 && distGoal > 30 ? p.z * 0.6 : 0) - p.z;
      const mn = hyp(mx, mz); mx /= mn; mz /= mn;
      if (near && nd < 5) {
        const ax = p.x - near.x, az = p.z - near.z, an = hyp(ax, az) || 1;
        const w = (5 - nd) / 5 * 0.9;
        mx = mx * (1 - w) + ax / an * w; mz = mz * (1 - w) + az / an * w;
      }
      const n = hyp(mx, mz) || 1;
      const run = (nd > 6 ? 7.2 : 6.2) * this.rf(p) * diff.speed;
      p.vx += (mx / n * run - p.vx) * Math.min(1, dt * 6);
      p.vz += (mz / n * run - p.vz) * Math.min(1, dt * 6);

      if (p.shieldT > 0) { p.vx *= 0.5; p.vz *= 0.5; }
      p.decideT -= dt;
      if (p.decideT > 0) return;
      if (hyp(b.x - p.x, b.z - p.z) > 1.4) { p.decideT = 0.05; return; }
      p.decideT = Math.max(0.3, diff.react * 1.6) * rand(0.7, 1.3);

      const angleOk = Math.abs(p.z) < 18;
      const blocked = near && nd < 2.2 && (near.x - p.x) * d > 0;
      const shootP = distGoal < 14 ? 0.8 : distGoal < 20 ? 0.35 : distGoal < 27 ? 0.12 : 0;
      if (angleOk && Math.random() < shootP * (blocked ? 0.4 : 1)) {
        this.shoot(p, clamp(0.45 + distGoal / 50 + rand(-0.1, 0.15), 0.4, 0.9), null, diff.shotErr, { curl: distGoal > 16 && Math.random() < 0.35 ? rand(0.4, 1) : 0 });
        return;
      }
      const pressured = nd < 2.6;
      if (Math.abs(p.z) > 14 && d * p.x > HL - 30 && Math.random() < 0.3) { this.lobPass(p, d, 0, diff.passErr); return; }
      const best = this.bestPass(p, 0, 0, true);
      if (best) {
        const gain = (best.q.x - p.x) * d;
        if ((pressured && best.score > -0.5) || (gain > 12 && best.score > 1.5 && Math.random() < (nd > 6 ? 0.15 : 0.4)) || (distGoal > 45 && Math.random() < 0.05 && best.score > 0.5)) {
          const through = best.q.role === 'fwd' && gain > 5 && Math.random() < 0.45;
          this.passTo(p, best.q, through, diff.passErr);
          return;
        }
      }
      if (pressured && nd < 1.8 && Math.random() < 0.3) p.shieldT = 0.8;
      if (pressured && nd < 2 && Math.random() < 0.3 && hyp(p.x - (-d * HL), p.z) < 30) {
        // under pressure near our own goal: clear it upfield
        this.passInto(p, d, rand(-0.6, 0.6), true);
      }
    }

    // ---------- snapshot for rendering / network ----------
    view() {
      const b = this.ball;
      return {
        ball: { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz },
        players: this.players.map(p => ({ x: p.x, z: p.z, face: p.face, spd: hyp(p.vx, p.vz), kick: p.kickT, dive: p.dive, jump: p.jumpT, shield: p.shield ? 1 : 0, slide: p.slideT })),
        active: [this.ctrl[0].type === 'human' ? this.ctrl[0].active : -1, this.ctrl[1].type === 'human' ? this.ctrl[1].active : -1],
        owner: b.owner,
      };
    }

    hud() {
      const pressing = this.players.filter(p => p.pressing).map(p => p.id);
      return {
        score: this.score.slice(), minute: this.minute, half: this.half, phase: this.phase, pressing,
        setpiece: this.setpiece && (this.phase === 'setpiece' || this.phase === 'kickoff') ? {
          type: this.setpiece.type, team: this.setpiece.team, interactive: this.setpiece.interactive,
          aim: this.setpiece.aim, curl: this.setpiece.curl, bx: this.ball.x, bz: this.ball.z,
        } : null,
        reds: this.stats.reds.slice(),
        lastScorer: this.lastScorer, stats: this.stats,
      };
    }
  };

  function turnTo(a, b, k) {
    let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d));
    return a + d * Math.min(1, k);
  }

  FC.DIFFICULTY = DIFFICULTY;
})();
