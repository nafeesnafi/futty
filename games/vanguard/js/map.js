// "Compound": a 3-lane deathmatch map built from boxes.
// Left flank = warehouse (close quarters), centre = container courtyard, right flank = long alley + sniper balcony.
// North is -Z. Static geometry is merged per material so the whole level costs only a handful of draw calls.
(function () {
  const VG = window.VG = window.VG || {};
  const M = VG.Map = {};
  const P = VG.Phys;

  M.BOUNDS = { x0: -46, x1: 46, z0: -56, z1: 56 };

  let batches, mats, scene;

  // ---------- geometry batching ----------
  const FACES = [
    [[1, 0, 0], [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]]],
    [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
    [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]],
    [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
    [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
    [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]],
  ];
  function batch(key) { return batches[key] || (batches[key] = { pos: [], nor: [], uv: [], col: [] }); }

  // world-space box with planar UVs (texScale metres per texture repeat) and a cheap height-based AO tint
  function visBox(x0, y0, z0, x1, y1, z1, key, opt) {
    const b = batch(key), s = (opt && opt.tex) || 3, ao = !(opt && opt.noAO);
    const X = [x0, x1], Y = [y0, y1], Z = [z0, z1];
    for (let f = 0; f < 6; f++) {
      const [n, cs] = FACES[f];
      if (n[1] === -1 && y0 <= 0.001) continue; // never visible
      const v = cs.map(c => [X[c[0]], Y[c[1]], Z[c[2]]]);
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const p = v[i];
        b.pos.push(p[0], p[1], p[2]); b.nor.push(n[0], n[1], n[2]);
        if (n[1] !== 0) b.uv.push(p[0] / s, p[2] / s);
        else if (n[0] !== 0) b.uv.push(p[2] / s, p[1] / s);
        else b.uv.push(p[0] / s, p[1] / s);
        let c = 1;
        if (ao) {
          if (n[1] === 0) c = 0.62 + 0.38 * Math.min(1, (p[1] - y0 + (y0 > 0.05 ? 1.2 : 0)) / 2.4);
          else if (n[1] < 0) c = 0.55;
        }
        b.col.push(c, c, c);
      }
    }
  }
  function flush() {
    for (const key in batches) {
      const b = batches[key];
      if (!b.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mats[key]);
      m.castShadow = key !== 'lamp' && key !== 'skyline';
      m.receiveShadow = key !== 'skyline';
      m.matrixAutoUpdate = false;
      scene.add(m);
    }
  }

  // collider + visual
  function B(x0, z0, x1, z1, y0, y1, key, opt) {
    opt = opt || {};
    if (!opt.noCollide) P.add({ x0, y0, z0, x1, y1, z1, mat: opt.mat || matOf(key), pen: !!opt.pen, walk: !!opt.walk, cover: opt.cover !== false });
    if (!opt.invisible) visBox(x0, y0, z0, x1, y1, z1, key, opt);
  }
  function matOf(key) {
    if (key.startsWith('cont') || key === 'metal' || key === 'dark' || key === 'rail') return 'metal';
    if (key === 'wood' || key === 'plywood') return 'wood';
    return 'concrete';
  }

  // wall running along Z at x (thickness t), with doorways [{c, w}] (door opening height 2.7)
  function wallZ(x, z0, z1, t, h, key, doors, opt) {
    let z = z0;
    for (const d of (doors || []).slice().sort((a, b) => a.c - b.c)) {
      const a = d.c - d.w / 2, e = d.c + d.w / 2;
      if (a > z) B(x - t / 2, z, x + t / 2, a, 0, h, key, opt);
      B(x - t / 2, a, x + t / 2, e, 2.7, h, key, opt); // lintel
      z = e;
    }
    if (z < z1) B(x - t / 2, z, x + t / 2, z1, 0, h, key, opt);
  }
  function wallX(z, x0, x1, t, h, key, doors, opt) {
    let x = x0;
    for (const d of (doors || []).slice().sort((a, b) => a.c - b.c)) {
      const a = d.c - d.w / 2, e = d.c + d.w / 2;
      if (a > x) B(x, z - t / 2, a, z + t / 2, 0, h, key, opt);
      B(a, z - t / 2, e, z + t / 2, 2.7, h, key, opt);
      x = e;
    }
    if (x < x1) B(x, z - t / 2, x1, z + t / 2, 0, h, key, opt);
  }

  const CONT_COLORS = ['contRed', 'contBlue', 'contGreen', 'contOrange'];
  let contIdx = 0;
  function container(cx, cz, alongX, len, y0, key) {
    const w = 2.44, h = 2.6, hl = len / 2, hw = w / 2;
    key = key || CONT_COLORS[contIdx++ % CONT_COLORS.length];
    y0 = y0 || 0;
    if (alongX) B(cx - hl, cz - hw, cx + hl, cz + hw, y0, y0 + h, key, { tex: 2.6 });
    else B(cx - hw, cz - hl, cx + hw, cz + hl, y0, y0 + h, key, { tex: 2.6 });
    // dark corner castings / end frames (visual only)
    const ex = alongX ? hl : hw, ez = alongX ? hw : hl, f = 0.08;
    if (alongX) {
      visBox(cx - ex - f, y0, cz - ez - f, cx - ex + 0.12, y0 + h + 0.02, cz + ez + f, 'dark');
      visBox(cx + ex - 0.12, y0, cz - ez - f, cx + ex + f, y0 + h + 0.02, cz + ez + f, 'dark');
    } else {
      visBox(cx - ex - f, y0, cz - ez - f, cx + ex + f, y0 + h + 0.02, cz - ez + 0.12, 'dark');
      visBox(cx - ex - f, y0, cz + ez - 0.12, cx + ex + f, y0 + h + 0.02, cz + ez + f, 'dark');
    }
  }
  function crate(cx, cz, s, y0) {
    s = s || 1.2; y0 = y0 || 0;
    B(cx - s / 2, cz - s / 2, cx + s / 2, cz + s / 2, y0, y0 + s, 'wood', { pen: true, tex: s, noAO: y0 > 0 });
  }
  function barrier(cx, cz, alongX, len) {
    const hl = len / 2;
    if (alongX) {
      B(cx - hl, cz - 0.32, cx + hl, cz + 0.32, 0, 0.35, 'barrier', { tex: 3 });
      B(cx - hl, cz - 0.16, cx + hl, cz + 0.16, 0.35, 1.1, 'barrier', { tex: 3 });
    } else {
      B(cx - 0.32, cz - hl, cx + 0.32, cz + hl, 0, 0.35, 'barrier', { tex: 3 });
      B(cx - 0.16, cz - hl, cx + 0.16, cz + hl, 0.35, 1.1, 'barrier', { tex: 3 });
    }
  }
  const barrels = [];
  function barrel(cx, cz) {
    barrels.push([cx, cz]);
    P.add({ x0: cx - 0.3, y0: 0, z0: cz - 0.3, x1: cx + 0.3, y1: 0.9, z1: cz + 0.3, mat: 'metal', pen: false, cover: false });
  }
  function ladder(x0, z0, x1, z1, top, alongZ) {
    P.ladders.push({ x0, z0, x1, z1, y0: 0, y1: top + 0.35 });
    const cx = (x0 + x1) / 2;
    if (alongZ) { // rails at z0/z1 on face x
      visBox(cx - 0.04, 0, z0, cx + 0.04, top + 1.1, z0 + 0.08, 'rail', { noAO: true });
      visBox(cx - 0.04, 0, z1 - 0.08, cx + 0.04, top + 1.1, z1, 'rail', { noAO: true });
      for (let y = 0.3; y < top + 0.9; y += 0.32) visBox(cx - 0.03, y, z0, cx + 0.03, y + 0.05, z1, 'rail', { noAO: true });
    }
  }

  // ---------- materials ----------
  function makeMats(gfx) {
    const T = VG.Tex;
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.9, metalness: 0 }, o));
    mats = {
      concrete: std({ map: T.concrete() }),
      brick: std({ map: T.brick() }),
      metal: std({ map: T.metal(), roughness: 0.65, metalness: 0.1, color: 0xc4cac8 }),
      wood: std({ map: T.wood(), roughness: 0.85 }),
      plywood: std({ map: T.plywood() }),
      barrier: std({ map: T.barrier() }),
      contRed: std({ map: T.container(), color: 0xa8402e, roughness: 0.7, metalness: 0.2 }),
      contBlue: std({ map: T.container(), color: 0x2f5c8a, roughness: 0.7, metalness: 0.2 }),
      contGreen: std({ map: T.container(), color: 0x4c6b3a, roughness: 0.7, metalness: 0.2 }),
      contOrange: std({ map: T.container(), color: 0xc4772b, roughness: 0.7, metalness: 0.2 }),
      dark: std({ color: 0x6a6e70, roughness: 0.7, metalness: 0.2 }),
      rail: std({ color: 0x5a5f5e, roughness: 0.5, metalness: 0.6 }),
      roof: std({ map: T.metal(), color: 0xd0d4d2, roughness: 0.8, metalness: 0, emissive: 0x2a2a28 }),
      floor: std({ map: T.concrete(), color: 0xbab3a3 }),
      lamp: new THREE.MeshBasicMaterial({ color: 0xfff1c8 }),
      // campaign surfaces
      plaster: std({ map: T.concrete(), color: 0xa89a80 }),
      wallpaper: std({ map: T.plywood(), color: 0x7d6d5a }),
      tile: std({ map: T.concrete(), color: 0xd8dcd6 }),
      sewer: std({ map: T.brick(), color: 0x6c7a62 }),
      rubble: std({ map: T.concrete(), color: 0x6e665c }),
      burnt: std({ map: T.metal(), color: 0x3a3634, roughness: 0.9 }),
      cloth: std({ color: 0x8a7a68, roughness: 1 }),
      redlamp: new THREE.MeshBasicMaterial({ color: 0xff5a3a }),
      skyline: new THREE.MeshLambertMaterial({ color: 0x9aa6ad }),
    };
    if (gfx === 0) for (const k in mats) if (mats[k].map) mats[k].map.anisotropy = 1;
  }

  // ---------- level kit (also used by the campaign to build its own levels) ----------
  M.begin = function (sceneRef, gfx) {
    scene = sceneRef; batches = {}; contIdx = 0; barrels.length = 0;
    P.reset();
    makeMats(gfx);
  };
  M.end = function () { flush(); buildBarrels(); };
  M.kit = { B, wallX, wallZ, container, crate, barrier, barrel, ladder, visBox, mats: () => mats };

  function buildBarrels() {
    if (!barrels.length) return;
    const bg = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14);
    bg.translate(0, 0.45, 0);
    const bm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1, map: VG.Tex.metal() });
    const inst = new THREE.InstancedMesh(bg, bm, barrels.length);
    const mtx = new THREE.Matrix4();
    barrels.forEach(([x, z], i) => {
      mtx.makeRotationY(Math.random() * 6); mtx.setPosition(x, 0, z); inst.setMatrixAt(i, mtx);
      inst.setColorAt(i, new THREE.Color([0x7a2a1f, 0x2f4f6a, 0x5b6b2e, 0x8a6a1f][i % 4]));
    });
    inst.castShadow = inst.receiveShadow = true;
    scene.add(inst);
  }

  // ---------- the level ----------
  M.build = function (sceneRef, gfx) {
    M.begin(sceneRef, gfx);
    const Bd = M.BOUNDS;

    // ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: VG.Tex.asphalt(), roughness: 0.95 }));
    ground.material.map = ground.material.map.clone(); ground.material.map.needsUpdate = true;
    ground.material.map.repeat.set(70, 70);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);
    // painted lines in the courtyard (visual only)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xd9c35a, transparent: true, opacity: 0.55, depthWrite: false });
    for (const [x, z, w, d] of [[-21, 0, 0.15, 50], [17, 0, 0.15, 50], [-2, -34, 30, 0.15], [-2, 34, 30, 0.15]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, z); scene.add(m);
    }
    // warehouse floor slab (slightly raised, visual)
    visBox(-45, 0, -30, -24.4, 0.02, 30, 'floor', { tex: 4, noAO: true });

    // perimeter
    B(Bd.x0, Bd.z0, Bd.x0 + 1, Bd.z1, 0, 6, 'metal', { tex: 4 });
    B(Bd.x1 - 1, Bd.z0, Bd.x1, Bd.z1, 0, 6, 'metal', { tex: 4 });
    B(Bd.x0, Bd.z0, Bd.x1, Bd.z0 + 1, 0, 6, 'metal', { tex: 4 });
    B(Bd.x0, Bd.z1 - 1, Bd.x1, Bd.z1, 0, 6, 'metal', { tex: 4 });

    // ===== LEFT FLANK: warehouse =====
    wallZ(-24.2, -30.4, 30.4, 0.4, 5, 'brick', [{ c: -16, w: 2.4 }, { c: 0, w: 2.4 }, { c: 16, w: 2.4 }]);
    wallX(-30.2, -45, -24.4, 0.4, 5, 'brick', [{ c: -40, w: 3 }, { c: -30, w: 3 }]);
    wallX(30.2, -45, -24.4, 0.4, 5, 'brick', [{ c: -40, w: 3 }, { c: -30, w: 3 }]);
    wallX(-10, -45, -24.4, 0.4, 5, 'concrete', [{ c: -40, w: 2.4 }, { c: -28, w: 2.4 }]);
    wallX(10, -45, -24.4, 0.4, 5, 'concrete', [{ c: -34, w: 2.4 }, { c: -26.4, w: 2.4 }]);
    // corridors in the north and south rooms
    B(-35.2, -30, -34.8, -24, 0, 5, 'concrete'); B(-35.2, -20, -34.8, -10.2, 0, 5, 'concrete');
    B(-35.2, 10.2, -34.8, 20, 0, 5, 'concrete'); B(-35.2, 24, -34.8, 30, 0, 5, 'concrete');
    // roof with skylight gaps (sun shafts)
    for (const [z0, z1] of [[-30.4, -22], [-20, -8], [-6, 6], [8, 20], [22, 30.4]]) B(-45, z0, -24, z1, 5, 5.3, 'roof', { tex: 4, noAO: true });
    for (const z of [-26, -14, 0, 14, 26]) for (const x of [-40, -30]) visBox(x - 0.6, 4.9, z - 0.15, x + 0.6, 5, z + 0.15, 'lamp', { noAO: true });
    // shelving + crates inside
    B(-43, -6, -42.2, 2, 0, 2.6, 'metal', { tex: 2 });
    B(-31.4, -4, -30.6, 4, 0, 2.6, 'metal', { tex: 2 });
    crate(-37, -1); crate(-37, 0.3); crate(-37, -0.4, 1.0, 1.2);
    crate(-27, 6); crate(-27, 4.7);
    crate(-40, -20); crate(-41.3, -20); crate(-40.6, -20, 1, 1.2);
    crate(-30, -26); crate(-28, -14, 1.4);
    crate(-41, 24); crate(-29, 20); crate(-27.8, 20, 1, 0);
    crate(-38, 14.5, 1.4); crate(-31, 27);
    barrel(-44, -28); barrel(-43.3, -27.2); barrel(-25.5, -8.8); barrel(-44, 28.5); barrel(-25.2, 12);

    // ===== CENTRE: courtyard =====
    container(-14, -20, false, 6);
    container(6, -12, true, 12);
    container(-4, 0, false, 12);
    container(-4, -2, false, 6, 2.6, 'contOrange');
    container(9, 8, true, 6);
    container(-12, 18, true, 12);
    container(12, 22, false, 6);
    barrier(-18, -4, false, 3); barrier(12, 0, false, 3); barrier(-8, -30, true, 3); barrier(4, 30, true, 3);
    barrier(14, -24, true, 3); barrier(-18, 28, false, 3); barrier(2, 12, true, 3); barrier(-12, 6, true, 3);
    crate(2, -22); crate(3.25, -22); crate(2.6, -22, 1, 1.2);
    crate(-9, 10); crate(-9, 10, 1, 1.2);
    crate(16, 6); crate(-20, -14); crate(6, -4, 1);
    barrel(-8, -14); barrel(-7.3, -14.6); barrel(16, 14); barrel(0, 24); barrel(-20, 12); barrel(4, -30.8);

    // ===== RIGHT FLANK: building block + alley + balcony =====
    B(20, -26, 24, -2, 0, 7, 'concrete', { tex: 4 });
    B(20, 2, 24, 26, 0, 7, 'concrete', { tex: 4 });
    // window ledges / trims for detail
    for (const z0 of [-24, -16, -8, 4, 12, 20]) {
      visBox(24, 3.6, z0, 24.12, 3.72, z0 + 3, 'dark', { noAO: true });
      if (z0 !== -16) visBox(19.88, 3.6, z0, 20, 3.72, z0 + 3, 'dark', { noAO: true }); // -16: photo billboard there
    }
    // balcony (sniper nest) along the east wall
    B(39, -14, 45, 14, 3.3, 3.6, 'metal', { walk: true, tex: 2, noAO: true });
    for (const z of [-13.6, -4.6, 4.6, 13.2]) B(39, z, 39.4, z + 0.4, 0, 3.3, 'dark');
    B(39, -12, 39.25, 14, 3.6, 4.6, 'plywood', { pen: true, tex: 2, noAO: true });   // railing (wood: penetrable)
    B(39.25, -14.25, 45, -14, 3.6, 4.6, 'plywood', { pen: true, tex: 2, noAO: true });
    ladder(38.3, -14, 39, -12, 3.6, true);
    // stairs from the south end of the alley up to the balcony
    for (let i = 0; i < 12; i++) B(41, 25 - i, 45, 26 - i, 0, (i + 1) * 0.3, 'concrete', { walk: true, tex: 2 });
    B(40.8, 14, 41, 26, 0, 1, 'rail', { noAO: true, cover: false });
    // alley cover
    B(29, -31, 31, -29.8, 0, 1.6, 'metal', { tex: 2 });          // dumpster
    crate(34, -6); crate(35.25, -6); crate(34.6, -6, 1, 1.2);
    barrier(28, 8, false, 3); barrier(34, -34, true, 3);
    B(29.8, 27, 32.2, 33, 0, 2.8, 'contGreen', { tex: 2.6 });    // truck box
    B(29.9, 33, 32.1, 34.6, 0, 2.2, 'dark');                     // cab
    container(30, 16, true, 6);
    container(27, -18, false, 6);
    barrel(36, -20); barrel(36.7, -20.6); barrel(26, 30);

    // ===== END ZONES =====
    container(-32, -44, true, 12); container(22, -46, false, 6);
    barrier(0, -40, true, 3); barrier(-12, -48, false, 3); barrier(36, -42, true, 3);
    crate(8, -50); crate(9.25, -50); crate(-42, -50); crate(-4, -44, 1);
    barrel(14, -36); barrel(-20, -36); barrel(30, -50);
    container(32, 44, true, 12); container(-22, 46, false, 6);
    barrier(0, 40, true, 3); barrier(12, 48, false, 3); barrier(-36, 42, true, 3);
    crate(-8, 50); crate(-9.25, 50); crate(42, 50); crate(4, 44, 1);
    barrel(-14, 36); barrel(20, 36); barrel(-30, 50);

    // ===== skyline outside the walls (no collision) =====
    const rng = mulberry(7);
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2, r = 105 + rng() * 60;
      const x = Math.cos(a) * r * 0.9, z = Math.sin(a) * r, w = 8 + rng() * 14, d = 8 + rng() * 14, h = 10 + rng() * 34;
      visBox(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, 'skyline', { noAO: true });
    }

    flush();

    // ===== photo billboards and posters =====
    if (VG.POSTERS) {
      const loader = new THREE.TextureLoader(), texCache = {};
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2c, roughness: 0.6, metalness: 0.4 });
      const poster = (key, x, y, z, w, rotY) => {
        const P0 = VG.POSTERS[key]; if (!P0) return;
        let tex = texCache[key];
        if (!tex) { tex = texCache[key] = loader.load(P0.src); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; }
        const h = w * P0.h / P0.w, g = new THREE.Group();
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
          map: tex, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.22 }));
        pic.position.z = 0.04;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.24, h + 0.24, 0.06), frameMat);
        frame.castShadow = frame.receiveShadow = true;
        g.add(frame, pic); g.position.set(x, y, z); g.rotation.y = rotY;
        scene.add(g);
      };
      poster('portrait', 19.94, 3.6, -14, 4.2, -Math.PI / 2);   // courtyard billboard on the building block
      poster('jersey', 0, 3.3, -54.94, 8, 0);                   // north wall, facing the north spawn area
      poster('jersey', -10, 3.3, 54.94, 8, Math.PI);            // south wall
      poster('portrait', 44.94, 3.2, -32, 3.6, -Math.PI / 2);   // alley wall, seen from the sniper balcony
      poster('portrait', -43.2, 2.9, -29.97, 2.4, 0);           // inside the warehouse
      poster('jersey', -24.0 + 0.04, 3.4, 23, 3.6, Math.PI / 2); // warehouse outer wall, facing the courtyard
    }

    buildBarrels();

    return {
      spawns: [
        [-40, -52], [-20, -52], [0, -52], [20, -52], [40, -50],
        [-40, 52], [-20, 52], [0, 52], [20, 52], [40, 52],
        [-40, -2], [-30, -20], [-30, 22], [34, 0], [30, -40], [-10, -38], [8, 38], [12, -4], [-16, 10],
      ].filter(([x, z]) => P.fits(x, 0, z, 0.4, 1.8)),
      bounds: Bd,
    };
  };

  function mulberry(a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
})();
