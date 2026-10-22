// Visual effects: tracers, muzzle flashes, impact particles, smoke, bullet-hole decals, explosions.
// Everything is pooled so firing never allocates meshes mid-match.
(function () {
  const VG = window.VG = window.VG || {};
  const F = VG.FX = {};
  let scene, tracers = [], sprites = [], decals = [], decalIdx = 0;
  let pts, ptsGeo, pPos, pCol, pVel, pLife, pCount = 700, pNext = 0;
  let flashLight, flashT = 0;
  F.shake = 0;

  const v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  F.init = function (s) {
    scene = s; tracers = []; sprites = []; decals = []; decalIdx = 0;
    // tracers: unit-length boxes along +Z, stretched each frame
    const tg = new THREE.BoxGeometry(0.03, 0.03, 1); tg.translate(0, 0, 0.5);
    const tm = new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tg, tm); m.visible = false; m.frustumCulled = false; scene.add(m);
      tracers.push({ m, on: false, sx: 0, sy: 0, sz: 0, dx: 0, dy: 0, dz: 0, dist: 0, trav: 0 });
    }
    // sprites: smoke, flashes, blood, fire
    for (let i = 0; i < 90; i++) {
      const mat = new THREE.SpriteMaterial({ map: VG.Tex.soft(), transparent: true, depthWrite: false });
      const sp = new THREE.Sprite(mat); sp.visible = false; scene.add(sp);
      sprites.push({ sp, on: false, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, a0: 1, grow: 0 });
    }
    // decals
    const dg = new THREE.PlaneGeometry(0.13, 0.13);
    const dm = new THREE.MeshBasicMaterial({ map: VG.Tex.bulletHole(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let i = 0; i < 120; i++) { const m = new THREE.Mesh(dg, dm); m.visible = false; m.matrixAutoUpdate = false; scene.add(m); decals.push(m); }
    // particles (sparks, chips, blood droplets)
    ptsGeo = new THREE.BufferGeometry();
    pPos = new Float32Array(pCount * 3).fill(-999); pCol = new Float32Array(pCount * 3);
    pVel = new Float32Array(pCount * 3); pLife = new Float32Array(pCount);
    ptsGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    ptsGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    pts = new THREE.Points(ptsGeo, new THREE.PointsMaterial({ size: 0.06, vertexColors: true, sizeAttenuation: true }));
    pts.frustumCulled = false; scene.add(pts);
    // one shared light for muzzle flashes / explosions (kept in the scene so shaders never recompile)
    flashLight = new THREE.PointLight(0xffb060, 0, 14, 2); scene.add(flashLight);
  };

  function sprite(x, y, z, o) {
    for (const s of sprites) {
      if (s.on) continue;
      s.on = true; s.life = 0; s.max = o.life; s.vx = o.vx || 0; s.vy = o.vy || 0; s.vz = o.vz || 0;
      s.s0 = o.size; s.s1 = o.size1 || o.size; s.a0 = o.alpha == null ? 1 : o.alpha;
      const m = s.sp.material;
      m.map = o.map || VG.Tex.soft(); m.color.setHex(o.color || 0xffffff);
      m.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending; m.needsUpdate = true;
      m.rotation = Math.random() * 6.28;
      s.sp.position.set(x, y, z); s.sp.scale.setScalar(o.size); s.sp.visible = true;
      return s;
    }
  }

  function particles(x, y, z, n, color, speed, spread, nx, ny, nz, grav) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const k = pNext; pNext = (pNext + 1) % pCount;
      pPos[k * 3] = x; pPos[k * 3 + 1] = y; pPos[k * 3 + 2] = z;
      const s = speed * (0.4 + Math.random() * 0.8);
      pVel[k * 3] = (nx + (Math.random() - 0.5) * spread) * s;
      pVel[k * 3 + 1] = (ny + (Math.random() - 0.2) * spread) * s;
      pVel[k * 3 + 2] = (nz + (Math.random() - 0.5) * spread) * s;
      const sh = 0.75 + Math.random() * 0.5;
      pCol[k * 3] = c.r * sh; pCol[k * 3 + 1] = c.g * sh; pCol[k * 3 + 2] = c.b * sh;
      pLife[k] = (0.35 + Math.random() * 0.45) * (grav ? 1 : 0.6);
    }
  }

  F.tracer = function (sx, sy, sz, ex, ey, ez) {
    const dx = ex - sx, dy = ey - sy, dz = ez - sz, d = Math.hypot(dx, dy, dz);
    if (d < 2) return;
    for (const t of tracers) {
      if (t.on) continue;
      t.on = true; t.sx = sx; t.sy = sy; t.sz = sz; t.dx = dx / d; t.dy = dy / d; t.dz = dz / d; t.dist = d; t.trav = 0;
      t.m.position.set(sx, sy, sz); t.m.lookAt(ex, ey, ez); t.m.scale.set(1, 1, 0.01); t.m.visible = true;
      return;
    }
  };

  // world-space muzzle flash used for bots (the player's flash lives on the viewmodel)
  F.muzzle = function (x, y, z, light) {
    sprite(x, y, z, { map: VG.Tex.flash(), size: 0.55, size1: 0.3, life: 0.05, add: true, color: 0xffe0a0 });
    sprite(x, y + 0.05, z, { size: 0.3, size1: 0.9, life: 0.5, color: 0x8a8a84, alpha: 0.18, vy: 0.6 });
    if (light) { flashLight.position.set(x, y, z); flashLight.intensity = 25; flashLight.distance = 10; flashT = 0.05; }
  };
  F.playerFlash = function (x, y, z) { flashLight.position.set(x, y, z); flashLight.intensity = 40; flashLight.distance = 12; flashT = 0.05; };

  const MAT_COL = { concrete: 0xb8b0a0, asphalt: 0x777068, wood: 0xa57a45, metal: 0xffd27a, brick: 0xa0583e };
  F.impact = function (x, y, z, nx, ny, nz, mat, decal) {
    const col = MAT_COL[mat] || 0xaaaaaa;
    particles(x, y, z, mat === 'metal' ? 9 : 7, col, mat === 'metal' ? 6 : 3.5, 1.1, nx, ny, nz, true);
    sprite(x + nx * 0.1, y + ny * 0.1, z + nz * 0.1, { size: 0.18, size1: 0.8, life: 0.7, color: mat === 'wood' ? 0x9a8060 : 0xb4ada0, alpha: 0.45, vx: nx * 0.6, vy: ny * 0.6 + 0.3, vz: nz * 0.6 });
    if (mat === 'metal') sprite(x, y, z, { map: VG.Tex.flash(), size: 0.22, life: 0.05, add: true, color: 0xffdd99 });
    if (decal !== false) F.decal(x, y, z, nx, ny, nz);
  };
  F.decal = function (x, y, z, nx, ny, nz) {
    const m = decals[decalIdx]; decalIdx = (decalIdx + 1) % decals.length;
    m.position.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
    v.set(x + nx, y + ny, z + nz);
    if (Math.abs(ny) > 0.9) m.up.set(0, 0, 1); else m.up.copy(up);
    m.lookAt(v); m.rotateZ(Math.random() * 6.28);
    const s = 0.7 + Math.random() * 0.6; m.scale.set(s, s, s);
    m.updateMatrix(); m.visible = true;
  };
  F.blood = function (x, y, z, dx, dy, dz, head) {
    particles(x, y, z, head ? 22 : 12, 0x8a0a06, head ? 4.5 : 3, 1.2, dx, dy + 0.2, dz, true);
    sprite(x, y, z, { map: VG.Tex.blood(), size: head ? 0.5 : 0.35, size1: head ? 1.1 : 0.8, life: 0.35, color: 0xffffff, alpha: 0.95 });
  };
  F.explosion = function (x, y, z) {
    sprite(x, y + 1, z, { map: VG.Tex.flash(), size: 3, size1: 9, life: 0.35, add: true, color: 0xffc070 });
    for (let i = 0; i < 6; i++) sprite(x + (Math.random() - 0.5) * 3, y + 0.5 + Math.random() * 2, z + (Math.random() - 0.5) * 3,
      { size: 2, size1: 7, life: 2.5 + Math.random(), color: 0x3c3a36, alpha: 0.7, vy: 1.8 + Math.random() * 1.5, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2 });
    for (let i = 0; i < 3; i++) sprite(x, y + 1, z, { size: 1.5, size1: 5, life: 0.6, add: true, color: 0xff7a20, alpha: 0.9, vy: 3 });
    particles(x, y + 0.5, z, 70, 0xffa040, 14, 1.6, 0, 1, 0, true);
    particles(x, y + 0.5, z, 50, 0x3a3530, 9, 1.4, 0, 1, 0, true);
    flashLight.position.set(x, y + 3, z); flashLight.intensity = 3000; flashLight.distance = 45; flashT = 0.25;
  };

  F.update = function (dt) {
    for (const t of tracers) {
      if (!t.on) continue;
      t.trav += 420 * dt;
      const head = Math.min(t.trav, t.dist), tail = Math.max(0, t.trav - 7);
      if (tail >= t.dist) { t.on = false; t.m.visible = false; continue; }
      t.m.position.set(t.sx + t.dx * tail, t.sy + t.dy * tail, t.sz + t.dz * tail);
      t.m.scale.z = Math.max(0.01, head - tail);
    }
    for (const s of sprites) {
      if (!s.on) continue;
      s.life += dt;
      const k = s.life / s.max;
      if (k >= 1) { s.on = false; s.sp.visible = false; continue; }
      s.sp.position.x += s.vx * dt; s.sp.position.y += s.vy * dt; s.sp.position.z += s.vz * dt;
      s.sp.scale.setScalar(s.s0 + (s.s1 - s.s0) * k);
      s.sp.material.opacity = s.a0 * (1 - k) * (1 - k * 0.3);
    }
    for (let k = 0; k < pCount; k++) {
      if (pLife[k] <= 0) continue;
      pLife[k] -= dt;
      const i = k * 3;
      if (pLife[k] <= 0) { pPos[i + 1] = -999; continue; }
      pVel[i + 1] -= 14 * dt;
      pPos[i] += pVel[i] * dt; pPos[i + 1] += pVel[i + 1] * dt; pPos[i + 2] += pVel[i + 2] * dt;
      if (pPos[i + 1] < 0.01) { pPos[i + 1] = 0.01; pVel[i + 1] *= -0.3; pVel[i] *= 0.6; pVel[i + 2] *= 0.6; }
    }
    ptsGeo.attributes.position.needsUpdate = true; ptsGeo.attributes.color.needsUpdate = true;
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) flashLight.intensity = 0; else flashLight.intensity *= 0.8; }
    F.shake = Math.max(0, F.shake - dt * 2.5);
  };
})();
