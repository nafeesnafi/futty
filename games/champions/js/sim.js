// Match simulation: ball physics, possession, passing/shooting/tackling, team AI, goalkeepers,
// restarts (kick-off, throw-in, corner, goal kick) and the match clock.
// Pure logic (no rendering) so it can run on the host, in tests, or headless.
var FC = window.FC = window.FC || {};

(() => {
  const PL = 105, PW = 68, HL = PL / 2, HW = PW / 2, GOAL_W = 7.32, GOAL_H = 2.44, BALL_R = 0.11;
  const G = 9.81;

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
        input: { x: 0, z: 0, sprint: false }, actions: [], active: -1,
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
          });
        }
      }
      this.ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: -1, lastTouch: -1, lastTeam: 0, noPick: -1, noPickT: 0, receiver: -1, shot: null, protectT: 0 };
      this.score = [0, 0];
      this.clock = 0;            // real seconds elapsed in the current half
      this.half = 1;
      this.phase = 'kickoff';    // kickoff | play | setpiece | goal | halftime | fulltime
      this.phaseT = 0;
      this.setpiece = null;
      this.events = [];
      this.stats = { shots: [0, 0], onTarget: [0, 0], poss: [0, 0], passes: [0, 0], corners: [0, 0] };
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
    setInput(team, x, z, sprint) { const c = this.ctrl[team]; c.input.x = x; c.input.z = z; c.input.sprint = !!sprint; }
    queueAction(team, a) { this.ctrl[team].actions.push(a); }
    setController(team, type, difficulty) {
      const c = this.ctrl[team]; c.type = type; c.diff = DIFFICULTY[difficulty || 'normal']; c.actions = [];
      if (type === 'ai') c.active = -1; else this.pickActive(team);
    }

    // ---------- restarts ----------
    placeFormation(kickTeam) {
      for (const p of this.players) {
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
      Object.assign(this.ball, { x, y: 0, z, vx: 0, vy: 0, vz: 0, owner: -1, receiver: -1, shot: null, noPick: -1 });
    }

    startSetpiece(type, team, x, z) {
      this.resetBall(x, z);
      const d = this.dir(team);
      let taker;
      if (type === 'goalkick') taker = this.players[team * 11];
      else taker = this.nearest(team, x, z, true);
      // stand behind the ball, facing the field
      const tx = type === 'throw' ? x : (type === 'corner' ? x - Math.sign(x) * 0.6 : x - d * 0.6);
      const tz = type === 'throw' ? z + Math.sign(z) * 0.5 : (type === 'corner' ? z + Math.sign(z) * 0.4 : z);
      taker.x = tx; taker.z = tz; taker.vx = taker.vz = 0;
      taker.face = Math.atan2(d * 10 - (type === 'corner' ? x * 0.2 : 0), -z);
      // opponents must give room
      for (const p of this.players) if (p.team !== team && hyp(p.x - x, p.z - z) < 9) {
        const a = Math.atan2(p.z - z, p.x - x); p.x = x + Math.cos(a) * 9.2; p.z = z + Math.sin(a) * 9.2;
        p.x = clamp(p.x, -HL + 0.5, HL - 0.5); p.z = clamp(p.z, -HW + 0.5, HW - 0.5);
      }
      this.phase = 'setpiece';
      this.setpiece = { type, team, taker: taker.id, t: 0 };
      if (type === 'corner') this.stats.corners[team]++;
      this.pickActive(team, taker.id);
      this.emit('whistle', { short: true });
      this.emit('restart', { type, team });
    }

    // ---------- helpers ----------
    nearest(team, x, z, excludeGk, exclude = -1) {
      let best = null, bd = 1e9;
      for (let i = 0; i < 11; i++) {
        const p = this.players[team * 11 + i];
        if ((excludeGk && i === 0) || p.id === exclude) continue;
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
    kickBall(p, vx, vy, vz, receiver = -1) {
      const b = this.ball;
      b.owner = -1; b.vx = vx; b.vy = vy; b.vz = vz;
      b.y = Math.max(b.y, 0.01);
      b.lastTouch = p.id; b.lastTeam = p.team;
      b.noPick = p.id; b.noPickT = 0.35;
      b.receiver = receiver; b.shot = null;
      p.kickT = 1;
      const sp = hyp(vx, vy, vz);
      this.emit('kick', { power: clamp(sp / 30, 0, 1) });
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

    // kick into space in a direction (when no good receiver)
    passInto(p, dx, dz, through) {
      const n = hyp(dx, dz) || 1, sp = through ? 18 : 14;
      this.kickBall(p, dx / n * sp, through ? 3 : 0, dz / n * sp, -1);
    }

    shoot(p, power, aimZ, errMul) {
      const b = this.ball, d = this.dir(p.team);
      const gx = d * (HL + 0.5);
      // aim near a post unless told otherwise
      let tz = aimZ != null ? clamp(aimZ, -GOAL_W / 2 + 0.35, GOAL_W / 2 - 0.35)
                            : (b.z > 0 ? -1 : 1) * rand(2.0, 3.5);
      const dist = hyp(gx - b.x, tz - b.z);
      power = clamp(power, 0.05, 1);
      const speed = 15 + power * 16;
      const quality = this.rf(p);
      let err = (errMul || 0.05) * (1.4 - quality) * 3 + Math.max(0, power - 0.82) * 0.22 + dist / 700;
      const ang = Math.atan2(tz - b.z, gx - b.x) + rand(-err, err);
      const ty = clamp(0.25 + power * 1.5 + rand(-0.4, 0.4) + Math.max(0, power - 0.88) * rand(0, 5), 0.15, 4);
      const T = dist / speed;
      const vy = (ty - b.y) / T + 0.5 * G * T;
      this.kickBall(p, Math.cos(ang) * speed, vy, Math.sin(ang) * speed, -1);
      this.ball.shot = { team: p.team, by: p.id, saved: false, counted: false };
      this.stats.shots[p.team]++;
      // predict on target
      const tt = (gx - b.x) / (Math.cos(ang) * speed);
      const zc = b.z + Math.sin(ang) * speed * tt, yc = b.y + vy * tt - 0.5 * G * tt * tt;
      if (Math.abs(zc) < GOAL_W / 2 && yc < GOAL_H && yc > -0.5) this.stats.onTarget[p.team]++;
      this.emit('shot', { by: p.id });
    }

    // choose a pass target; dir = preferred direction (unit) or null for AI "best option"
    bestPass(p, dx, dz, ai) {
      const d = this.dir(p.team);
      let best = null, bs = -1e9;
      for (let i = 1; i < 11; i++) {
        const q = this.players[p.team * 11 + i];
        if (q === p) continue;
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
      p.kickT = slide ? 1 : 0.6;
      if (dist > reach) { if (slide) p.stunT = 0.9; return false; }
      const c = this.ctrl[p.team];
      const base = c.type === 'human' && c.active === p.id ? HUMAN.tackle : c.diff.tackle;
      const chance = clamp(base + (p.rating - o.rating) * 0.015 + (slide ? 0.1 : 0) - dist * 0.08, 0.1, 0.9);
      if (Math.random() < chance) {
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
      p.stunT = slide ? 1.0 : 0.5;
      this.emit('tackle', { by: p.id, ok: false });
      return false;
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
        this.ballPhysics(dt);
        this.movePlayers(dt, true);
        if (this.phaseT > 3) this.afterBreak();
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

      this.handleActions();

      if (this.phase === 'kickoff' || this.phase === 'setpiece') {
        const sp = this.setpiece;
        sp.t += dt;
        const taker = this.players[sp.taker];
        const c = this.ctrl[sp.team];
        const humanTaker = c.type === 'human' && c.active === taker.id;
        // AI or idle human (after 8s) takes it
        if ((!humanTaker && sp.t > (sp.type === 'kickoff' ? 1.2 : 1.4)) || sp.t > 8) this.aiRestart(taker, sp);
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
      this.checkPickup();
      this.goalkeepers(dt);
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
          if (a.a === 'switch') {
            if (this.ball.owner >= 0 && this.players[this.ball.owner].team === t) continue;
            const cur = c.active;
            const b = this.ball;
            // nearest to the ball other than the current player
            let best = null, bd = 1e9;
            for (let i = 1; i < 11; i++) {
              const p = this.players[t * 11 + i];
              if (p.id === cur) continue;
              const d = hyp(p.x - b.x - b.vx * 0.3, p.z - b.z - b.vz * 0.3);
              if (d < bd) { bd = d; best = p; }
            }
            if (best) c.active = best.id;
            continue;
          }
          if (c.active < 0) continue;
          const p = this.players[c.active];
          const inSetpiece = (this.phase === 'kickoff' || this.phase === 'setpiece') && this.setpiece.team === t && this.setpiece.taker === p.id;
          const hasBall = this.ball.owner === p.id || inSetpiece;
          let dx = a.x, dz = a.z;
          if (!dx && !dz) { dx = Math.sin(p.face); dz = Math.cos(p.face); }
          // kick-off with no direction held: play it back to a team-mate
          if (inSetpiece && this.phase === 'kickoff' && hyp(a.x, a.z) < 0.2) { dx = -this.dir(t); dz = 0.3; }
          if (hasBall) {
            if (inSetpiece) this.beginPlayFromSetpiece();
            if (a.a === 'shoot') {
              // steer toward a post by holding a sideways direction; otherwise aim far post
              const aim = Math.abs(a.z) > 0.3 ? Math.sign(a.z) * 2.8 : null;
              this.shoot(p, a.power != null ? a.power : 0.6, aim, HUMAN.shotErr);
            } else {
              const through = a.a === 'through';
              const best = this.bestPass(p, dx, dz, false);
              if (best) { this.passTo(p, best.q, through, HUMAN.passErr); c.active = best.q.id; }
              else this.passInto(p, dx, dz, through);
            }
          } else if (this.phase === 'play') {
            // defending: pass key = tackle, shoot key = slide tackle
            if (a.a === 'pass' || a.a === 'through') this.tryTackle(p, false);
            else if (a.a === 'shoot') this.tryTackle(p, true);
          }
        }
      }
    }

    beginPlayFromSetpiece() { this.phase = 'play'; this.phaseT = 0; }

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
      const best = this.bestPass(taker, 0, 0, true);
      if (best) this.passTo(taker, best.q, false, diff.passErr);
      else this.passInto(taker, d, -Math.sign(taker.z) * 0.5, false);
    }

    // ---------- ball ----------
    ballPhysics(dt) {
      const b = this.ball;
      if (b.protectT > 0) b.protectT -= dt;
      if (b.noPickT > 0) { b.noPickT -= dt; if (b.noPickT <= 0) b.noPick = -1; }
      if (b.owner >= 0) {
        const p = this.players[b.owner];
        const sp = hyp(p.vx, p.vz);
        const reach = 0.55 + (sp > 6.5 ? 0.35 : 0);
        const tx = p.x + Math.sin(p.face) * reach, tz = p.z + Math.cos(p.face) * reach;
        const k = Math.min(1, dt * 14);
        b.vx = (tx - b.x) / Math.max(dt, 1e-3) * k; b.vz = (tz - b.z) / Math.max(dt, 1e-3) * k;
        b.x += (tx - b.x) * k; b.z += (tz - b.z) * k; b.y = 0; b.vy = 0;
        return;
      }
      const prevX = b.x;
      b.vy -= G * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y <= 0) {
        b.y = 0;
        if (b.vy < -1.2) { b.vy = -b.vy * 0.5; b.vx *= 0.9; b.vz *= 0.9; } else b.vy = 0;
      }
      if (b.y === 0 && b.vy === 0) {
        const s = hyp(b.vx, b.vz);
        const ns = Math.max(0, s - (0.6 + s * 0.45) * dt);
        if (s > 0) { b.vx *= ns / s; b.vz *= ns / s; }
      } else { b.vx *= 1 - 0.08 * dt; b.vz *= 1 - 0.08 * dt; }
      this.goalFrame(prevX);
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
      if (b.owner >= 0 || b.y > 1.9) return;
      let best = null, bd = 1e9;
      for (const p of this.players) {
        if (p.id === b.noPick || p.stunT > 0) continue;
        if (p.idx === 0) continue;  // keepers handled separately
        const d = hyp(p.x - b.x, p.z - b.z);
        const reach = p.id === b.receiver ? 1.15 : 0.95;
        if (d < reach && d < bd) { bd = d; best = p; }
      }
      if (!best) return;
      const sp = hyp(b.vx, b.vz);
      // shots get blocked (deflected), and very hard balls can't always be controlled
      const block = b.shot && b.shot.team !== best.team && sp > 12;
      if (block) this.emit('block', { by: best.id });
      if (block || (sp > 21 && best.id !== b.receiver && Math.random() < 0.6)) {
        const a = rand(0, Math.PI * 2);
        b.vx = b.vx * 0.3 + Math.cos(a) * 3; b.vz = b.vz * 0.3 + Math.sin(a) * 3; b.vy = Math.abs(b.vy) * 0.3 + 1;
        b.lastTouch = best.id; b.lastTeam = best.team; b.noPick = best.id; b.noPickT = 0.25; b.shot = null;
        this.emit('kick', { power: 0.3 });
        return;
      }
      // first-time finish for AI attackers near goal (volleys / headers from crosses)
      const c = this.ctrl[best.team];
      const d = this.dir(best.team);
      const distGoal = hyp(d * HL - b.x, b.z);
      const humanActive = c.type === 'human' && (c.active === best.id || b.receiver === best.id);
      if (!humanActive && distGoal < 15 && b.y > 0.4 && Math.random() < 0.7) {
        best.face = Math.atan2(d * HL - best.x, -best.z);
        this.shoot(best, rand(0.5, 0.8), null, c.diff.shotErr * 1.3);
        return;
      }
      this.onPossession(best);
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
          const chance = clamp(1.0 - (sp - 18) * 0.03 - Math.max(0, reachH - 0.8) * 0.2 + (gk.rating - 80) * 0.01 + (diff.gk || 0), 0.15, 0.96);
          if (Math.random() < chance) {
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
        if (!b.shot && inBox && reachH < 1.3 && b.y < 2.3 && b.noPick !== gk.id) {
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
        const list = this.players.slice(t * 11 + 1, t * 11 + 11).filter(p => !(c.type === 'human' && c.active === p.id));
        const fx = b.x + b.vx * 0.35, fz = b.z + b.vz * 0.35;
        list.sort((p, q) => hyp(p.x - fx, p.z - fz) - hyp(q.x - fx, q.z - fz));
        chasers[t] = list.slice(0, 2).map(p => p.id);
      }

      for (const p of this.players) {
        if (p.kickT > 0) p.kickT = Math.max(0, p.kickT - dt * 3.3);
        if (p.tackleCd > 0) p.tackleCd -= dt;
        if (p.stunT > 0) p.stunT -= dt;
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
            const ax = b.x + b.vx * 0.25 - p.x, az = b.z + b.vz * 0.25 - p.z, n = hyp(ax, az);
            if (n > 0.4) { mx = ax / n; mz = az / n; }
          }
        } else if (p.idx === 0) {
          ({ tx, tz, sprint } = this.gkTarget(p));
        } else {
          ({ tx, tz, sprint } = this.aiTarget(p, pt, chasers, dt));
        }

        let speed = (sprint ? 7.8 : 5.6) * this.rf(p) * (c.type === 'ai' ? c.diff.speed : 1);
        if (b.owner === p.id) speed *= 0.9;
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
          if (dist < 1.5) {
            const rate = c.type === 'ai' ? c.diff.press : 0.8;
            if (Math.random() < dt * 2.5 * rate) this.tryTackle(p, false);
            else p.tackleCd = 0.15;
          }
        }
        // AI ball carrier decisions
        if (!manual && !celebrate && b.owner === p.id && this.phase === 'play' && p.idx !== 0) this.aiOnBall(p, dt);
      }
      // keep players from overlapping
      for (let i = 0; i < 22; i++) for (let j = i + 1; j < 22; j++) {
        const a = this.players[i], q = this.players[j];
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

      // planned runs (e.g. attacking a corner)
      if (p.plan) { p.plan.t -= dt; if (p.plan.t <= 0) p.plan = null; else return { tx: p.plan.x, tz: p.plan.z, sprint: true }; }

      // receiver of a pass: meet the ball
      if (b.receiver === p.id && b.owner < 0) {
        const t = 0.35;
        return { tx: b.x + b.vx * t, tz: b.z + b.vz * t, sprint: true };
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

      p.decideT -= dt;
      if (p.decideT > 0) return;
      p.decideT = Math.max(0.3, diff.react * 1.6) * rand(0.7, 1.3);

      const angleOk = Math.abs(p.z) < 18;
      const blocked = near && nd < 2.2 && (near.x - p.x) * d > 0;
      if (distGoal < 28 && angleOk && (!blocked || distGoal < 16 || Math.random() < 0.35) && (distGoal < 22 || Math.random() < 0.5)) {
        this.shoot(p, clamp(0.45 + distGoal / 50 + rand(-0.1, 0.15), 0.4, 0.9), null, diff.shotErr);
        return;
      }
      const pressured = nd < 2.6;
      const best = this.bestPass(p, 0, 0, true);
      if (best) {
        const gain = (best.q.x - p.x) * d;
        if ((pressured && best.score > -0.5) || (gain > 12 && best.score > 1.5 && Math.random() < (nd > 6 ? 0.15 : 0.4)) || (distGoal > 45 && Math.random() < 0.05 && best.score > 0.5)) {
          const through = best.q.role === 'fwd' && gain > 5 && Math.random() < 0.45;
          this.passTo(p, best.q, through, diff.passErr);
          return;
        }
      }
      if (pressured && nd < 2 && Math.random() < 0.3 && hyp(p.x - (-d * HL), p.z) < 30) {
        // under pressure near our own goal: clear it upfield
        this.passInto(p, d, rand(-0.6, 0.6), true);
      }
    }

    // ---------- snapshot for rendering / network ----------
    view() {
      const b = this.ball;
      return {
        ball: { x: b.x, y: b.y, z: b.z, vx: b.vx, vz: b.vz },
        players: this.players.map(p => ({ x: p.x, z: p.z, face: p.face, spd: hyp(p.vx, p.vz), kick: p.kickT, dive: p.dive })),
        active: [this.ctrl[0].type === 'human' ? this.ctrl[0].active : -1, this.ctrl[1].type === 'human' ? this.ctrl[1].active : -1],
        owner: b.owner,
      };
    }

    hud() {
      return {
        score: this.score.slice(), minute: this.minute, half: this.half, phase: this.phase,
        setpiece: this.setpiece && (this.phase === 'setpiece' || this.phase === 'kickoff') ? { type: this.setpiece.type, team: this.setpiece.team } : null,
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
