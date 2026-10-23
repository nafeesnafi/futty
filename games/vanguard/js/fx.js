// Visual effects: tracer ribbons, muzzle flashes, sparks, dust and debris, brass casings, blood, decals, explosions.
// Everything is pooled so firing never allocates meshes mid-match.
(function () {
  const VG = window.VG = window.VG || {};
  const F = VG.FX = {};
  let scene, q = 1, tracers = [], sprites = [], decals = [], decalIdx = 0, splats = [], splatIdx = 0;
  let pts, ptsGeo, pPos, pCol, pVel, pLife, pFloor, pCount = 700, pNext = 0, pLive = 0;
  let spk, spkGeo, sPos, sCol, sVel, sLife, sMax, sFloor, sBase, sCount = 220, sNext = 0, sLive = 0;
  let bodies = [], brassNext = 0, chunkNext = 0, BRASS = 40, CHUNKS = 36, chunkMats = {};
  let flashLight, flashT = 0;
  F.shake = 0;

  const v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tc = new THREE.Color();

  // two crossed quads along +Z (tail at z=0, head at z=1) so a tracer reads as a ribbon from any angle
  function ribbonGeo(w) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      -w, 0, 0, w, 0, 0, -w, 0, 1, w, 0, 1,
      0, -w, 0, 0, w, 0, 0, -w, 1, 0, w, 1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0], 2));
    g.setIndex([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]);
    return g;
  }

  F.init = function (s) {
    scene = s; tracers = []; sprites = []; decals = []; decalIdx = 0; splats = []; splatIdx = 0; bodies = [];
    q = VG.Game ? +VG.Game.settings.gfx : 1;
    // tracers: tapered additive ribbons, HDR bright when the bloom pass is running
    const tg = ribbonGeo(0.035);
    const tm = new THREE.MeshBasicMaterial({ map: VG.Tex.streak(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    if (q > 0) tm.color.setRGB(5, 3.4, 1.6); else tm.color.setHex(0xffd890);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tg, tm); m.visible = false; m.frustumCulled = false; scene.add(m);
      tracers.push({ m, on: false, sx: 0, sy: 0, sz: 0, dx: 0, dy: 0, dz: 0, dist: 0, trav: 0 });
    }
    // sprites: smoke, flashes, dust, blood mist, fire
    for (let i = 0; i < 110; i++) {
      const mat = new THREE.SpriteMaterial({ map: VG.Tex.soft(), transparent: true, depthWrite: false });
      const sp = new THREE.Sprite(mat); sp.visible = false; scene.add(sp);
      sprites.push({ sp, on: false, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, a0: 1, drag: 0 });
    }
    // bullet holes and blood splatter
    const dg = new THREE.PlaneGeometry(0.13, 0.13);
    const dm = new THREE.MeshBasicMaterial({ map: VG.Tex.bulletHole(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let i = 0; i < 120; i++) { const m = new THREE.Mesh(dg, dm); m.visible = false; m.matrixAutoUpdate = false; scene.add(m); decals.push(m); }
    const sg = new THREE.PlaneGeometry(1, 1);
    const sm = new THREE.MeshBasicMaterial({ map: VG.Tex.splat(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    for (let i = 0; i < 48; i++) { const m = new THREE.Mesh(sg, sm); m.visible = false; m.matrixAutoUpdate = false; scene.add(m); splats.push(m); }
    // point particles: chips, splinters, blood droplets
    ptsGeo = new THREE.BufferGeometry();
    pPos = new Float32Array(pCount * 3).fill(-999); pCol = new Float32Array(pCount * 3);
    pVel = new Float32Array(pCount * 3); pLife = new Float32Array(pCount); pFloor = new Float32Array(pCount);
    ptsGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    ptsGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    pts = new THREE.Points(ptsGeo, new THREE.PointsMaterial({ size: 0.045, map: VG.Tex.soft(), alphaTest: 0.35, vertexColors: true, sizeAttenuation: true }));
    pts.frustumCulled = false; scene.add(pts); pLive = 0;
    // sparks: velocity-stretched additive line segments
    spkGeo = new THREE.BufferGeometry();
    sPos = new Float32Array(sCount * 6).fill(-999); sCol = new Float32Array(sCount * 6);
    sVel = new Float32Array(sCount * 3); sLife = new Float32Array(sCount); sMax = new Float32Array(sCount);
    sFloor = new Float32Array(sCount); sBase = new Float32Array(sCount * 3);
    spkGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    spkGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
    spk = new THREE.LineSegments(spkGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    spk.frustumCulled = false; scene.add(spk); sLive = 0;
    // rigid little bodies: brass casings and debris chunks (gravity, bounce, tumble)
    const bg = new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 7); bg.rotateZ(Math.PI / 2);
    const bm = new THREE.MeshStandardMaterial({ color: 0xc8963c, metalness: 0.9, roughness: 0.28 });
    for (let i = 0; i < BRASS; i++) bodies.push(body(bg, bm, true));
    const cg = new THREE.DodecahedronGeometry(0.022, 0);
    chunkMats = {
      concrete: new THREE.MeshStandardMaterial({ color: 0x9c968a, roughness: 0.95 }),
      brick: new THREE.MeshStandardMaterial({ color: 0x8e4e38, roughness: 0.9 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x8a6438, roughness: 0.85 }),
      asphalt: new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.95 })
    };
    for (let i = 0; i < CHUNKS; i++) bodies.push(body(cg, chunkMats.concrete, false));
    brassNext = chunkNext = 0;
    // one shared light for muzzle flashes / explosions (kept in the scene so shaders never recompile)
    flashLight = new THREE.PointLight(0xffb060, 0, 14, 2); scene.add(flashLight);
  };

  function body(g, m, brass) {
    const mesh = new THREE.Mesh(g, m); mesh.visible = false; mesh.castShadow = false; scene.add(mesh);
    return { m: mesh, on: false, brass, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, floor: 0, life: 0, rest: false, tinked: false, s: 1 };
  }

  // floor height under a point: one ray straight down through the AABB world (ground plane is y=0)
  function floorAt(x, y, z) {
    const h = VG.Phys && VG.Phys.raycast(x, y + 0.05, z, 0, -1, 0, 40);
    return h ? y + 0.05 - h.t : 0;
  }

  function sprite(x, y, z, o) {
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      if (s.on) continue;
      s.on = true; s.life = 0; s.max = o.life; s.vx = o.vx || 0; s.vy = o.vy || 0; s.vz = o.vz || 0; s.drag = o.drag || 0;
      s.s0 = o.size; s.s1 = o.size1 || o.size; s.a0 = o.alpha == null ? 1 : o.alpha;
      const m = s.sp.material;
      m.map = o.map || VG.Tex.soft(); m.color.setHex(o.color || 0xffffff);
      if (o.hdr && q > 0) m.color.multiplyScalar(o.hdr);
      m.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending; // blend state only, no shader rebuild
      m.rotation = Math.random() * 6.28;
      s.sp.position.set(x, y, z); s.sp.scale.setScalar(o.size); s.sp.visible = true;
      return s;
    }
  }

  function particles(x, y, z, n, color, speed, spread, nx, ny, nz, grav, floor) {
    tc.setHex(color);
    const fl = floor == null ? 0.01 : floor + 0.01;
    for (let i = 0; i < n; i++) {
      const k = pNext; pNext = (pNext + 1) % pCount;
      pPos[k * 3] = x; pPos[k * 3 + 1] = y; pPos[k * 3 + 2] = z;
      const s = speed * (0.4 + Math.random() * 0.8);
      pVel[k * 3] = (nx + (Math.random() - 0.5) * spread) * s;
      pVel[k * 3 + 1] = (ny + (Math.random() - 0.2) * spread) * s;
      pVel[k * 3 + 2] = (nz + (Math.random() - 0.5) * spread) * s;
      const sh = 0.75 + Math.random() * 0.5;
      pCol[k * 3] = tc.r * sh; pCol[k * 3 + 1] = tc.g * sh; pCol[k * 3 + 2] = tc.b * sh;
      pLife[k] = (0.35 + Math.random() * 0.45) * (grav ? 1 : 0.6); pFloor[k] = fl;
    }
    pLive = Math.min(pCount, pLive + n);
  }

  // hot metal sparks: fast, stretched along their velocity, cooling from white-yellow to orange
  function sparks(x, y, z, n, nx, ny, nz, speed, floor) {
    if (q === 0) n = Math.ceil(n * 0.5);
    for (let i = 0; i < n; i++) {
      const k = sNext; sNext = (sNext + 1) % sCount;
      const s = speed * (0.35 + Math.random() * 0.9);
      sVel[k * 3] = (nx + (Math.random() - 0.5) * 1.6) * s;
      sVel[k * 3 + 1] = (ny + (Math.random() - 0.25) * 1.6) * s;
      sVel[k * 3 + 2] = (nz + (Math.random() - 0.5) * 1.6) * s;
      sPos[k * 6] = x; sPos[k * 6 + 1] = y; sPos[k * 6 + 2] = z;
      sMax[k] = sLife[k] = 0.18 + Math.random() * 0.45; sFloor[k] = floor + 0.01;
      const hot = q > 0 ? 3.2 : 1;
      sBase[k * 3] = hot; sBase[k * 3 + 1] = hot * (0.62 + Math.random() * 0.25); sBase[k * 3 + 2] = hot * 0.22;
    }
    sLive = Math.min(sCount, sLive + n);
  }

  function chunks(x, y, z, n, nx, ny, nz, mat, floor) {
    if (q === 0) return;
    const m = chunkMats[mat] || chunkMats.concrete;
    for (let i = 0; i < n; i++) {
      const b = bodies[BRASS + chunkNext]; chunkNext = (chunkNext + 1) % CHUNKS;
      const s = 2.2 + Math.random() * 2.5;
      launch(b, x + nx * 0.04, y + ny * 0.04, z + nz * 0.04,
        (nx + (Math.random() - 0.5) * 1.4) * s, (ny + 0.35 + Math.random() * 0.6) * s, (nz + (Math.random() - 0.5) * 1.4) * s,
        0.5 + Math.random() * 1.1, floor);
      b.m.material = m; b.life = 1.6 + Math.random() * 1.2;
    }
  }

  function launch(b, x, y, z, vx, vy, vz, scale, floor) {
    b.on = true; b.rest = false; b.tinked = false; b.vx = vx; b.vy = vy; b.vz = vz;
    b.wx = (Math.random() - 0.5) * 40; b.wy = (Math.random() - 0.5) * 30; b.wz = (Math.random() - 0.5) * 40;
    b.floor = floor; b.s = scale;
    b.m.position.set(x, y, z); b.m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    b.m.scale.setScalar(scale); b.m.visible = true;
  }

  // ejected casing from the player's ejection port
  F.brass = function (x, y, z, vx, vy, vz, scale) {
    const b = bodies[brassNext]; brassNext = (brassNext + 1) % BRASS;
    launch(b, x, y, z, vx, vy, vz, scale || 1, floorAt(x, y, z));
    b.wx = (Math.random() - 0.5) * 12; b.wy = 18 + Math.random() * 14; b.wz = (Math.random() - 0.5) * 8;
    b.life = 5;
  };

  F.tracer = function (sx, sy, sz, ex, ey, ez) {
    const dx = ex - sx, dy = ey - sy, dz = ez - sz, d = Math.hypot(dx, dy, dz);
    if (d < 2) return;
    for (let i = 0; i < tracers.length; i++) {
      const t = tracers[i];
      if (t.on) continue;
      t.on = true; t.sx = sx; t.sy = sy; t.sz = sz; t.dx = dx / d; t.dy = dy / d; t.dz = dz / d; t.dist = d; t.trav = 0;
      t.m.position.set(sx, sy, sz); t.m.lookAt(ex, ey, ez); t.m.scale.set(1, 1, 0.01); t.m.rotation.z = Math.random() * 1.5; t.m.visible = true;
      return;
    }
  };

  // world-space muzzle flash used for bots and remote players (the player's flash lives on the viewmodel):
  // incandescent core, wider star, lingering smoke, and optionally the dynamic light
  F.muzzle = function (x, y, z, light) {
    sprite(x, y, z, { map: VG.Tex.flash(), size: 0.32, size1: 0.2, life: 0.04, add: true, color: 0xfff4d8, hdr: 3 });
    sprite(x, y, z, { map: VG.Tex.flash(), size: 0.7, size1: 0.45, life: 0.055, add: true, color: 0xffb050, hdr: 1.6, alpha: 0.8 });
    sprite(x, y + 0.05, z, { size: 0.3, size1: 1, life: 0.6, color: 0x8a8a84, alpha: 0.18, vy: 0.6, drag: 1.5 });
    if (light) { flashLight.position.set(x, y, z); flashLight.intensity = 25; flashLight.distance = 10; flashT = 0.05; }
  };
  F.playerFlash = function (x, y, z) { flashLight.position.set(x, y, z); flashLight.intensity = 40; flashLight.distance = 12; flashT = 0.05; };
  // expanding grey puff left at the player's muzzle
  F.muzzleSmoke = function (x, y, z) {
    sprite(x, y, z, { size: 0.09, size1: 0.55, life: 0.55 + Math.random() * 0.3, color: 0x9a9890, alpha: 0.16, vy: 0.35, vx: (Math.random() - 0.5) * 0.2, vz: (Math.random() - 0.5) * 0.2, drag: 2 });
  };

  const MAT_COL = { concrete: 0xb8b0a0, asphalt: 0x777068, wood: 0xa57a45, metal: 0xffd27a, brick: 0xa0583e };
  F.impact = function (x, y, z, nx, ny, nz, mat, decal) {
    const col = MAT_COL[mat] || 0xaaaaaa;
    const floor = ny > 0.7 ? y : floorAt(x + nx * 0.05, y, z + nz * 0.05);
    if (mat === 'metal') {
      sparks(x, y, z, 10 + (Math.random() * 8 | 0), nx, ny, nz, 7, floor);
      sprite(x, y, z, { map: VG.Tex.flash(), size: 0.26, size1: 0.12, life: 0.05, add: true, color: 0xffdd99, hdr: 2.5 });
      particles(x, y, z, 4, 0x7a7670, 2.5, 1.1, nx, ny, nz, true, floor);
      sprite(x + nx * 0.08, y + ny * 0.08, z + nz * 0.08, { size: 0.12, size1: 0.45, life: 0.45, color: 0x8c8a86, alpha: 0.3, vx: nx * 0.5, vy: ny * 0.5 + 0.2, vz: nz * 0.5, drag: 3 });
    } else {
      const wood = mat === 'wood', dust = wood ? 0x9a8060 : mat === 'brick' ? 0xa47a68 : 0xb4ada0;
      particles(x, y, z, wood ? 9 : 7, col, wood ? 4 : 3.5, 1.1, nx, ny, nz, true, floor);
      // fast directional burst, then a slow hanging haze
      sprite(x + nx * 0.06, y + ny * 0.06, z + nz * 0.06, { size: 0.12, size1: 0.6, life: 0.35, color: dust, alpha: 0.55, vx: nx * 2.5, vy: ny * 2.5 + 0.2, vz: nz * 2.5, drag: 6 });
      if (q > 0) sprite(x + nx * 0.15, y + ny * 0.15, z + nz * 0.15, { size: 0.3, size1: 1.1, life: 1.4, color: dust, alpha: 0.25, vx: nx * 0.4, vy: 0.12, vz: nz * 0.4, drag: 1.2 });
      chunks(x, y, z, Math.random() < 0.5 ? 1 : 2, nx, ny, nz, wood ? 'wood' : mat, floor);
    }
    if (decal !== false) F.decal(x, y, z, nx, ny, nz);
  };

  function place(m, x, y, z, nx, ny, nz, s, off) {
    m.position.set(x + nx * off, y + ny * off, z + nz * off);
    v.set(x + nx, y + ny, z + nz);
    if (Math.abs(ny) > 0.9) m.up.set(0, 0, 1); else m.up.copy(up);
    m.lookAt(v); m.rotateZ(Math.random() * 6.28);
    m.scale.set(s, s, s); m.updateMatrix(); m.visible = true;
  }
  F.decal = function (x, y, z, nx, ny, nz) {
    const m = decals[decalIdx]; decalIdx = (decalIdx + 1) % decals.length;
    place(m, x, y, z, nx, ny, nz, 0.7 + Math.random() * 0.6, 0.012);
  };
  function splat(x, y, z, nx, ny, nz, s) {
    const m = splats[splatIdx]; splatIdx = (splatIdx + 1) % splats.length;
    place(m, x, y, z, nx, ny, nz, s, 0.015);
  }

  // blood: fine mist, heavier droplets, and splatter on whatever is behind or below the victim
  F.blood = function (x, y, z, dx, dy, dz, head) {
    particles(x, y, z, head ? 22 : 12, 0x7a0805, head ? 4.5 : 3, 1.2, dx, dy + 0.2, dz, true, floorAt(x, y, z));
    sprite(x, y, z, { map: VG.Tex.blood(), size: head ? 0.4 : 0.28, size1: head ? 0.9 : 0.65, life: 0.3, color: 0xffffff, alpha: 0.95 });
    sprite(x + dx * 0.15, y + dy * 0.15, z + dz * 0.15, { size: 0.2, size1: head ? 1.2 : 0.8, life: 0.6, color: 0x6a0a08, alpha: 0.4, vx: dx * 1.5, vy: 0.1, vz: dz * 1.5, drag: 4 });
    const P = VG.Phys; if (!P) return;
    const dl = Math.hypot(dx, dy, dz);
    if (dl > 0.5) {
      const ux = dx / dl, uy = dy / dl, uz = dz / dl;
      const h = P.raycast(x + ux * 0.35, y + uy * 0.35, z + uz * 0.35, ux, uy, uz, 2.4);
      if (h && h.box) {
        const t = h.t + 0.35;
        splat(x + ux * t, y + uy * t, z + uz * t, h.nx, h.ny, h.nz, (head ? 0.9 : 0.6) * (1.25 - t / 4) * (0.8 + Math.random() * 0.4));
      }
    }
    if (Math.random() < (head ? 0.9 : 0.55)) {
      const fy = floorAt(x, y, z);
      if (y - fy < 2.4) splat(x + dx * 0.4 + (Math.random() - 0.5) * 0.3, fy, z + dz * 0.4 + (Math.random() - 0.5) * 0.3, 0, 1, 0, 0.3 + Math.random() * 0.3);
    }
  };

  F.explosion = function (x, y, z) {
    sprite(x, y + 1, z, { map: VG.Tex.flash(), size: 3, size1: 9, life: 0.35, add: true, color: 0xffc070, hdr: 2 });
    for (let i = 0; i < 6; i++) sprite(x + (Math.random() - 0.5) * 3, y + 0.5 + Math.random() * 2, z + (Math.random() - 0.5) * 3,
      { size: 2, size1: 7, life: 2.5 + Math.random(), color: 0x3c3a36, alpha: 0.7, vy: 1.8 + Math.random() * 1.5, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2 });
    for (let i = 0; i < 3; i++) sprite(x, y + 1, z, { size: 1.5, size1: 5, life: 0.6, add: true, color: 0xff7a20, alpha: 0.9, vy: 3, hdr: 1.5 });
    particles(x, y + 0.5, z, 50, 0x3a3530, 9, 1.4, 0, 1, 0, true, y);
    sparks(x, y + 0.5, z, 50, 0, 1, 0, 14, y);
    chunks(x, y + 0.3, z, 8, 0, 1, 0, 'concrete', y);
    flashLight.position.set(x, y + 3, z); flashLight.intensity = 3000; flashLight.distance = 45; flashT = 0.25;
  };

  F.update = function (dt) {
    for (let i = 0; i < tracers.length; i++) {
      const t = tracers[i];
      if (!t.on) continue;
      t.trav += 420 * dt;
      const head = Math.min(t.trav, t.dist), tail = Math.max(0, t.trav - 7);
      if (tail >= t.dist) { t.on = false; t.m.visible = false; continue; }
      t.m.position.set(t.sx + t.dx * tail, t.sy + t.dy * tail, t.sz + t.dz * tail);
      t.m.scale.z = Math.max(0.01, head - tail);
    }
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      if (!s.on) continue;
      s.life += dt;
      const k = s.life / s.max;
      if (k >= 1) { s.on = false; s.sp.visible = false; continue; }
      if (s.drag) { const f = Math.max(0, 1 - s.drag * dt); s.vx *= f; s.vy *= f; s.vz *= f; }
      s.sp.position.x += s.vx * dt; s.sp.position.y += s.vy * dt; s.sp.position.z += s.vz * dt;
      s.sp.scale.setScalar(s.s0 + (s.s1 - s.s0) * (1 - (1 - k) * (1 - k)));
      s.sp.material.opacity = s.a0 * (1 - k) * (1 - k * 0.3);
    }
    if (pLive > 0) {
      let live = 0;
      for (let k = 0; k < pCount; k++) {
        if (pLife[k] <= 0) continue;
        pLife[k] -= dt;
        const i = k * 3;
        if (pLife[k] <= 0) { pPos[i + 1] = -999; continue; }
        live++;
        pVel[i + 1] -= 14 * dt;
        pPos[i] += pVel[i] * dt; pPos[i + 1] += pVel[i + 1] * dt; pPos[i + 2] += pVel[i + 2] * dt;
        if (pPos[i + 1] < pFloor[k]) { pPos[i + 1] = pFloor[k]; pVel[i + 1] *= -0.3; pVel[i] *= 0.6; pVel[i + 2] *= 0.6; }
      }
      pLive = live;
      ptsGeo.attributes.position.needsUpdate = true; ptsGeo.attributes.color.needsUpdate = true;
    }
    if (sLive > 0) {
      let live = 0;
      const drag = Math.max(0, 1 - 2.2 * dt);
      for (let k = 0; k < sCount; k++) {
        if (sLife[k] <= 0) continue;
        sLife[k] -= dt;
        const i = k * 3, j = k * 6;
        if (sLife[k] <= 0) { sPos[j + 1] = sPos[j + 4] = -999; continue; }
        live++;
        sVel[i] *= drag; sVel[i + 1] = sVel[i + 1] * drag - 9.8 * dt; sVel[i + 2] *= drag;
        let x = sPos[j] + sVel[i] * dt, y = sPos[j + 1] + sVel[i + 1] * dt, z = sPos[j + 2] + sVel[i + 2] * dt;
        if (y < sFloor[k]) { y = sFloor[k]; sVel[i + 1] *= -0.35; sVel[i] *= 0.55; sVel[i + 2] *= 0.55; }
        sPos[j] = x; sPos[j + 1] = y; sPos[j + 2] = z;
        sPos[j + 3] = x - sVel[i] * 0.022; sPos[j + 4] = y - sVel[i + 1] * 0.022; sPos[j + 5] = z - sVel[i + 2] * 0.022;
        const a = sLife[k] / sMax[k], cool = a * a;
        sCol[j] = sBase[i] * a; sCol[j + 1] = sBase[i + 1] * cool; sCol[j + 2] = sBase[i + 2] * cool * a;
        sCol[j + 3] = sCol[j] * 0.15; sCol[j + 4] = sCol[j + 1] * 0.1; sCol[j + 5] = 0;
      }
      sLive = live;
      spkGeo.attributes.position.needsUpdate = true; spkGeo.attributes.color.needsUpdate = true;
    }
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!b.on) continue;
      b.life -= dt;
      const m = b.m;
      if (b.life <= 0) { b.on = false; m.visible = false; continue; }
      if (b.life < 0.4) m.scale.setScalar(b.s * b.life / 0.4);
      if (b.rest) continue;
      b.vy -= 9.8 * dt;
      m.position.x += b.vx * dt; m.position.y += b.vy * dt; m.position.z += b.vz * dt;
      m.rotation.x += b.wx * dt; m.rotation.y += b.wy * dt; m.rotation.z += b.wz * dt;
      const fl = b.floor + (b.brass ? 0.006 : 0.012) * b.s;
      if (m.position.y < fl) {
        m.position.y = fl;
        if (b.brass && !b.tinked) { b.tinked = true; if (VG.Audio && VG.Audio.brass) VG.Audio.brass(m.position.x, m.position.z); }
        if (Math.abs(b.vy) < 0.6) {
          b.rest = true;
          if (b.brass) { m.rotation.x = 0; m.rotation.z = 0; } // casing settles on its side
        } else {
          b.vy *= -0.38; b.vx *= 0.5; b.vz *= 0.5; b.wx *= 0.5; b.wy *= 0.6; b.wz *= 0.5;
        }
      }
    }
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) flashLight.intensity = 0; else flashLight.intensity *= 0.8; }
    F.shake = Math.max(0, F.shake - dt * 2.5);
  };
})();
