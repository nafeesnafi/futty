// Collision world made of axis-aligned boxes, ray casts and the shared FPS character controller.
(function () {
  const VG = window.VG = window.VG || {};
  const P = VG.Phys = {};
  const CELL = 4;
  let grid = new Map(), stamp = 0;

  P.boxes = [];
  P.ladders = [];
  P.GRAVITY = 17;

  P.reset = function () { P.boxes = []; P.ladders = []; grid = new Map(); };

  // b = { x0,y0,z0,x1,y1,z1, mat, pen (bullets pass), walk (bots walk on top) }
  P.add = function (b) {
    b.id = P.boxes.length; b._s = 0;
    P.boxes.push(b);
    const cx0 = Math.floor(b.x0 / CELL), cx1 = Math.floor(b.x1 / CELL);
    const cz0 = Math.floor(b.z0 / CELL), cz1 = Math.floor(b.z1 / CELL);
    for (let i = cx0; i <= cx1; i++) for (let k = cz0; k <= cz1; k++) {
      const key = i * 1000 + k;
      let c = grid.get(key); if (!c) grid.set(key, c = []);
      c.push(b);
    }
    return b;
  };

  const qOut = [];
  P.query = function (x0, z0, x1, z1) {
    stamp++; qOut.length = 0;
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let i = cx0; i <= cx1; i++) for (let k = cz0; k <= cz1; k++) {
      const c = grid.get(i * 1000 + k); if (!c) continue;
      for (let j = 0; j < c.length; j++) { const b = c[j]; if (b._s !== stamp) { b._s = stamp; qOut.push(b); } }
    }
    return qOut;
  };

  // ---------- rays ----------
  // slab test; returns entry distance or -1. Sets P.tExit and P.nAxis/P.nSign for the entered face.
  function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
    let tmin = 0, tmax = maxT, axis = -1, sign = 0, t1, t2, s, inv;
    if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) return -1; }
    else {
      inv = 1 / dx; t1 = (b.x0 - ox) * inv; t2 = (b.x1 - ox) * inv; s = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) return -1; }
    else {
      inv = 1 / dy; t1 = (b.y0 - oy) * inv; t2 = (b.y1 - oy) * inv; s = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) return -1; }
    else {
      inv = 1 / dz; t1 = (b.z0 - oz) * inv; t2 = (b.z1 - oz) * inv; s = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    P.tExit = tmax; P.nAxis = axis; P.nSign = sign;
    return tmin;
  }
  P.rayBox = rayBox;

  function candidates(ox, oz, dx, dz, dist) {
    if (dist > 24) return P.boxes;
    const ex = ox + dx * dist, ez = oz + dz * dist;
    return P.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez));
  }

  // nearest hit: { t, box (null = ground), nx, ny, nz }
  const hit = { t: 0, box: null, nx: 0, ny: 0, nz: 0, mat: '' };
  P.raycast = function (ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist, bb = null, ax = -1, sg = 0;
    const list = candidates(ox, oz, dx, dz, maxDist);
    for (let i = 0; i < list.length; i++) {
      const t = rayBox(ox, oy, oz, dx, dy, dz, list[i], best);
      if (t >= 0 && t < best) { best = t; bb = list[i]; ax = P.nAxis; sg = P.nSign; }
    }
    let ground = false;
    if (dy < -1e-6) { const tg = -oy / dy; if (tg >= 0 && tg < best) { best = tg; ground = true; } }
    if (!ground && !bb) return null;
    hit.t = best; hit.box = ground ? null : bb; hit.mat = ground ? 'asphalt' : bb.mat;
    hit.nx = hit.ny = hit.nz = 0;
    if (ground || ax === -1) hit.ny = 1; else if (ax === 0) hit.nx = sg; else if (ax === 1) hit.ny = sg; else hit.nz = sg;
    return hit;
  };

  // every surface along a ray, sorted. Used by bullets for penetration.
  P.raycastAll = function (ox, oy, oz, dx, dy, dz, maxDist) {
    const res = [];
    const list = candidates(ox, oz, dx, dz, maxDist);
    for (let i = 0; i < list.length; i++) {
      const t = rayBox(ox, oy, oz, dx, dy, dz, list[i], maxDist);
      if (t >= 0) {
        const n = [0, 0, 0];
        if (P.nAxis === -1) n[1] = 1; else n[P.nAxis] = P.nSign;
        res.push({ t, tExit: P.tExit, box: list[i], mat: list[i].mat, n });
      }
    }
    if (dy < -1e-6) { const tg = -oy / dy; if (tg >= 0 && tg < maxDist) res.push({ t: tg, tExit: tg, box: null, mat: 'asphalt', n: [0, 1, 0] }); }
    res.sort((a, b) => a.t - b.t);
    return res;
  };

  P.los = function (ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return true;
    const h = P.raycast(ax, ay, az, dx / d, dy / d, dz / d, d);
    return !h || h.t >= d - 0.05;
  };

  // ---------- character controller ----------
  // e: { pos: Vector3 (feet), vel: Vector3, radius, height, onGround, stepUp, blocked }
  function overlaps(b, x, y, z, r, h) {
    return x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && y + h > b.y0 + 1e-4 && y < b.y1 - 1e-4;
  }
  P.fits = function (x, y, z, r, h) {
    const list = P.query(x - r, z - r, x + r, z + r);
    for (let i = 0; i < list.length; i++) if (overlaps(list[i], x, y, z, r, h)) return false;
    return true;
  };

  const STEP = 0.52;
  function resolveH(e, axis, d, canStep) {
    const r = e.radius, p = e.pos;
    const list = P.query(p.x - r - 0.1, p.z - r - 0.1, p.x + r + 0.1, p.z + r + 0.1);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!overlaps(b, p.x, p.y, p.z, r, e.height)) continue;
      const rise = b.y1 - p.y;
      if (canStep && rise > 0 && rise <= STEP && P.fits(p.x, b.y1 + 0.001, p.z, r, e.height)) {
        e.stepUp += rise; p.y = b.y1 + 0.001; continue;
      }
      if (axis === 0) { p.x = d > 0 ? b.x0 - r - 1e-3 : b.x1 + r + 1e-3; e.vel.x = 0; }
      else { p.z = d > 0 ? b.z0 - r - 1e-3 : b.z1 + r + 1e-3; e.vel.z = 0; }
      e.blocked = true;
    }
  }

  P.move = function (e, dt) {
    const p = e.pos, r = e.radius, wasGround = e.onGround;
    e.blocked = false;
    // sub-step so fast movers never tunnel through thin walls
    const steps = Math.max(1, Math.ceil(Math.hypot(e.vel.x, e.vel.z) * dt / 0.25));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      const dx = e.vel.x * h; if (dx) { p.x += dx; resolveH(e, 0, dx, wasGround || e.climbing); }
      const dz = e.vel.z * h; if (dz) { p.z += dz; resolveH(e, 2, dz, wasGround || e.climbing); }
    }
    e.onGround = false;
    p.y += e.vel.y * dt;
    const list = P.query(p.x - r, p.z - r, p.x + r, p.z + r);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!overlaps(b, p.x, p.y, p.z, r, e.height)) continue;
      if (e.vel.y > 0 && p.y + e.height - b.y0 < 0.6) { p.y = b.y0 - e.height - 1e-3; e.vel.y = 0; }
      else { p.y = b.y1; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; }
    }
    if (p.y <= 0) { p.y = 0; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; }
    // ground snap: stick to stairs/ledges when walking down instead of floating off
    if (!e.onGround && wasGround && e.vel.y <= 0 && !e.climbing) {
      let top = p.y <= 0.45 ? 0 : -1;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (p.x + r > b.x0 && p.x - r < b.x1 && p.z + r > b.z0 && p.z - r < b.z1 && b.y1 <= p.y + 0.01 && b.y1 >= p.y - 0.45 && b.y1 > top) top = b.y1;
      }
      if (top >= 0) { e.stepUp -= (p.y - top); p.y = top; e.vel.y = 0; e.onGround = true; }
    }
    // ceiling stays the job of the caller (crouch checks P.fits before standing up)
  };

  P.ladderAt = function (x, y, z, r) {
    for (const l of P.ladders) {
      if (x + r > l.x0 && x - r < l.x1 && z + r > l.z0 && z - r < l.z1 && y < l.y1 && y >= l.y0 - 0.1) return l;
    }
    return null;
  };

  // ---------- hitboxes ----------
  // returns { t, zone: 'head'|'upper'|'lower' } or null. actor: pos (feet), height
  P.rayActor = function (ox, oy, oz, dx, dy, dz, a, maxT) {
    const p = a.pos, h = a.height;
    // head sphere
    const hx = p.x, hy = p.y + h - 0.17, hz = p.z, hr = 0.2;
    const lx = ox - hx, ly = oy - hy, lz = oz - hz;
    const bq = lx * dx + ly * dy + lz * dz, cq = lx * lx + ly * ly + lz * lz - hr * hr;
    const disc = bq * bq - cq;
    let best = -1, zone = null;
    if (disc >= 0) { const t = -bq - Math.sqrt(disc); if (t > 0 && t < maxT) { best = t; zone = 'head'; } }
    // torso + legs box
    const w = 0.3;
    const box = { x0: p.x - w, x1: p.x + w, y0: p.y, y1: p.y + h - 0.34, z0: p.z - w, z1: p.z + w };
    const t = rayBox(ox, oy, oz, dx, dy, dz, box, maxT);
    if (t >= 0 && (best < 0 || t < best)) {
      best = t; const yy = oy + dy * t - p.y;
      zone = yy > h * 0.52 ? 'upper' : 'lower';
    }
    return best < 0 ? null : { t: best, zone };
  };
})();
