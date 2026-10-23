// Weapon definitions and procedural gun models (first-person viewmodel with arms, and the bots' third-person guns).
(function () {
  const VG = window.VG = window.VG || {};

  // spreads are half-angles in degrees; recoil in degrees per shot
  VG.WEAPONS = {
    ar: {
      id: 'ar', name: 'M4A1', icon: '︻╦╤─', auto: true, rpm: 760, dmg: 30, headMult: 2, upperMult: 1, lowerMult: 0.85,
      falloff: [32, 70], minMult: 0.72, mag: 30, reserve: 150, reload: 1.9, reloadEmpty: 2.5,
      hipSpread: 2.6, adsSpread: 0.12, moveSpread: 2.0, recoilP: 0.55, recoilY: 0.3, adsFov: 52, adsTime: 0.16,
      tracerEvery: 2, sound: 'ar', botBurst: [3, 6], botPause: [0.25, 0.55],
    },
    smg: {
      id: 'smg', name: 'MP5', icon: '▄︻┻═', auto: true, rpm: 900, dmg: 24, headMult: 1.8, upperMult: 1, lowerMult: 0.9,
      falloff: [11, 30], minMult: 0.55, mag: 32, reserve: 192, reload: 1.7, reloadEmpty: 2.2,
      hipSpread: 1.6, adsSpread: 0.35, moveSpread: 0.9, recoilP: 0.38, recoilY: 0.34, adsFov: 62, adsTime: 0.11,
      tracerEvery: 2, sound: 'smg', botBurst: [5, 9], botPause: [0.2, 0.45],
    },
    sniper: {
      id: 'sniper', name: 'AX-50', icon: '︻デ═一', auto: false, rpm: 55, bolt: 1.15, dmg: 105, headMult: 3, upperMult: 1, lowerMult: 0.8,
      falloff: [90, 160], minMult: 0.9, mag: 5, reserve: 25, reload: 2.6, reloadEmpty: 3.3,
      hipSpread: 7, adsSpread: 0, moveSpread: 4, recoilP: 3.2, recoilY: 0.6, adsFov: 16, adsTime: 0.28, scope: true,
      tracerEvery: 1, sound: 'sniper', botBurst: [1, 1], botPause: [1.4, 2.3],
    },
  };
  VG.WEAPON_ORDER = ['ar', 'smg', 'sniper'];

  VG.damageAt = function (def, dist, zone) {
    const [a, b] = def.falloff;
    const k = dist <= a ? 1 : dist >= b ? def.minMult : 1 + (def.minMult - 1) * (dist - a) / (b - a);
    const z = zone === 'head' ? def.headMult : zone === 'upper' ? def.upperMult : def.lowerMult;
    return def.dmg * k * z;
  };

  // ---------- model helpers ----------
  const M = {};
  function mats() {
    if (M.metal) return M;
    // anodised aluminium / blued steel with micro-scratches; stippled polymer furniture
    const T = VG.Tex, scratch = T.microNormal('gunmetal', 'scratch'), stipple = T.microNormal('stipple', 'stipple');
    const sv = (k) => new THREE.Vector2(k, k);
    M.metal = new THREE.MeshStandardMaterial({ color: 0x3a3e42, roughness: 0.34, metalness: 0.85, normalMap: scratch, normalScale: sv(0.35), envMapIntensity: 1.2 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.28, metalness: 0.9, normalMap: scratch, normalScale: sv(0.25), envMapIntensity: 1.3 });
    M.poly = new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.75, metalness: 0.05, normalMap: stipple, normalScale: sv(0.5) });
    M.tan = new THREE.MeshStandardMaterial({ color: 0x9a8562, roughness: 0.72, metalness: 0.05, normalMap: stipple, normalScale: sv(0.45) });
    M.green = new THREE.MeshStandardMaterial({ color: 0x48553a, roughness: 0.7, metalness: 0.1, normalMap: stipple, normalScale: sv(0.4) });
    M.port = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.6, metalness: 0.5 });
    M.glass = new THREE.MeshStandardMaterial({ color: 0x8fb4ff, roughness: 0.04, metalness: 1, transparent: true, opacity: 0.22, envMapIntensity: 2.4, depthWrite: false });
    M.scopeGlass = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.95, envMapIntensity: 2 });
    M.dot = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a1a).multiplyScalar(5), depthTest: false, depthWrite: false, toneMapped: false }); // HDR: it blooms
    M.sleeve = new THREE.MeshStandardMaterial({ color: 0x5b5a3c, roughness: 0.95 });
    M.glove = new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 0.85 });
    M.skin = new THREE.MeshStandardMaterial({ color: 0xb0866a, roughness: 0.8 });
    return M;
  }
  // rounded, bevelled box so edges catch specular highlights (cached per size)
  const geoCache = {};
  function bevelBox(w, h, d) {
    const key = w + ',' + h + ',' + d;
    if (geoCache[key]) return geoCache[key];
    const b = Math.min(0.006, Math.min(w, h, d) * 0.2), r = b * 0.9;
    const sw = w - 2 * b, sh = h - 2 * b, s = new THREE.Shape();
    s.moveTo(-sw / 2 + r, -sh / 2); s.lineTo(sw / 2 - r, -sh / 2); s.quadraticCurveTo(sw / 2, -sh / 2, sw / 2, -sh / 2 + r);
    s.lineTo(sw / 2, sh / 2 - r); s.quadraticCurveTo(sw / 2, sh / 2, sw / 2 - r, sh / 2); s.lineTo(-sw / 2 + r, sh / 2);
    s.quadraticCurveTo(-sw / 2, sh / 2, -sw / 2, sh / 2 - r); s.lineTo(-sw / 2, -sh / 2 + r); s.quadraticCurveTo(-sw / 2, -sh / 2, -sw / 2 + r, -sh / 2);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 2 });
    g.center(); g.computeVertexNormals();
    return (geoCache[key] = g);
  }
  function box(g, w, h, d, mat, x, y, z, rx) {
    const m = new THREE.Mesh(bevelBox(w, h, d), mat);
    m.position.set(x, y, z); if (rx) m.rotation.x = rx; g.add(m); return m;
  }
  function cyl(g, r, len, mat, x, y, z, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg || 10), mat);
    m.rotation.x = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m;
  }

  // gun built along -Z (muzzle forward). Origin at the grip. Returns { group, muzzle, mag, sightY }
  function buildGun(id) {
    const m = mats(), g = new THREE.Group();
    let mag, muzzleZ, sightY;
    if (id === 'ar') {
      box(g, 0.055, 0.07, 0.30, m.metal, 0, 0.035, -0.06);       // receiver
      box(g, 0.05, 0.02, 0.26, m.metal, 0, 0.08, -0.07);         // top rail
      for (let k = 0; k < 9; k++) box(g, 0.052, 0.006, 0.012, m.steel, 0, 0.092, 0.04 - k * 0.028); // rail slots
      box(g, 0.004, 0.022, 0.05, m.port, 0.028, 0.045, -0.02);   // ejection port
      box(g, 0.03, 0.012, 0.03, m.metal, 0, 0.072, 0.075);       // charging handle
      box(g, 0.046, 0.05, 0.075, m.metal, 0, -0.01, -0.13);      // magwell
      box(g, 0.062, 0.062, 0.24, m.tan, 0, 0.03, -0.32);         // handguard
      for (let k = 0; k < 4; k++) box(g, 0.064, 0.012, 0.035, m.poly, 0, 0.03, -0.24 - k * 0.055); // grip ribs
      cyl(g, 0.011, 0.24, m.steel, 0, 0.035, -0.52);             // barrel
      cyl(g, 0.017, 0.05, m.steel, 0, 0.035, -0.65);             // flash hider
      box(g, 0.012, 0.04, 0.012, m.metal, 0, 0.07, -0.42);       // front post
      mag = box(g, 0.032, 0.15, 0.065, m.poly, 0, -0.07, -0.13, 0.22);
      box(g, 0.035, 0.1, 0.045, m.poly, 0, -0.04, 0.04, -0.3);   // grip
      box(g, 0.045, 0.07, 0.2, m.tan, 0, 0.02, 0.19);            // stock
      cyl(g, 0.012, 0.16, m.metal, 0, 0.04, 0.12);               // buffer tube
      // red dot sight
      box(g, 0.04, 0.012, 0.08, m.metal, 0, 0.096, -0.07);
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 16), m.metal);
      hood.position.set(0, 0.124, -0.09); g.add(hood);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.019, 20), m.glass);
      lens.position.set(0, 0.124, -0.088); g.add(lens);
      g.userData.hood = hood;
      sightY = 0.124; muzzleZ = -0.68;
    } else if (id === 'smg') {
      box(g, 0.05, 0.075, 0.28, m.metal, 0, 0.035, -0.08);
      box(g, 0.058, 0.055, 0.15, m.poly, 0, 0.02, -0.28);        // handguard
      cyl(g, 0.012, 0.12, m.metal, 0, 0.04, -0.41);
      cyl(g, 0.018, 0.03, m.metal, 0, 0.04, -0.47);
      mag = box(g, 0.026, 0.17, 0.045, m.metal, 0, -0.08, -0.17, 0.35); // curved-look mag
      box(g, 0.035, 0.1, 0.045, m.poly, 0, -0.04, 0.03, -0.3);
      box(g, 0.02, 0.05, 0.18, m.metal, 0, 0.03, 0.16);          // collapsible stock
      box(g, 0.04, 0.05, 0.02, m.poly, 0, 0.03, 0.25);
      // iron sights: rear drum + front hooded post
      box(g, 0.03, 0.035, 0.02, m.metal, 0, 0.085, 0.03);
      box(g, 0.006, 0.02, 0.006, m.metal, 0, 0.098, -0.33);
      box(g, 0.026, 0.004, 0.02, m.metal, 0, 0.112, -0.33);
      sightY = 0.101; muzzleZ = -0.49;
    } else {
      box(g, 0.06, 0.075, 0.38, m.metal, 0, 0.035, -0.08);
      box(g, 0.07, 0.06, 0.3, m.green, 0, 0.015, -0.38);
      cyl(g, 0.014, 0.44, m.metal, 0, 0.04, -0.72);
      box(g, 0.05, 0.035, 0.08, m.metal, 0, 0.04, -0.96);        // muzzle brake
      mag = box(g, 0.05, 0.08, 0.1, m.poly, 0, -0.03, -0.1);
      box(g, 0.035, 0.11, 0.045, m.poly, 0, -0.045, 0.06, -0.3);
      box(g, 0.05, 0.11, 0.26, m.green, 0, 0.0, 0.25);           // stock
      box(g, 0.04, 0.03, 0.1, m.green, 0, 0.07, 0.24);           // cheek rest
      const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), m.metal);
      bolt.position.set(0.05, 0.05, 0.02); g.add(bolt);
      cyl(g, 0.026, 0.3, m.poly, 0, 0.13, -0.08, 14);           // scope tube
      cyl(g, 0.034, 0.07, m.poly, 0, 0.13, -0.24, 14);
      cyl(g, 0.03, 0.05, m.poly, 0, 0.13, 0.08, 14);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 18), m.scopeGlass);
      lens.position.set(0, 0.13, -0.276); lens.rotation.y = Math.PI; g.add(lens);
      const eye = new THREE.Mesh(new THREE.CircleGeometry(0.027, 18), m.scopeGlass);
      eye.position.set(0, 0.13, 0.106); g.add(eye);
      box(g, 0.02, 0.05, 0.02, m.metal, 0, 0.09, -0.12); box(g, 0.02, 0.05, 0.02, m.metal, 0, 0.09, 0.0);
      sightY = 0.13; muzzleZ = -1.0;
    }
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, id === 'sniper' ? 0.04 : 0.035, muzzleZ); g.add(muzzle);
    const port = new THREE.Object3D(); port.position.set(0.03, 0.045, -0.02); g.add(port);
    return { group: g, muzzle, mag, sightY, port, hood: g.userData.hood };
  }

  // first-person rig: gun + gloved hands + sleeves, plus a flash sprite at the muzzle
  VG.buildViewModel = function (id) {
    const m = mats(), gun = buildGun(id), rig = new THREE.Group();
    rig.add(gun.group);
    const handZ = id === 'sniper' ? -0.38 : id === 'smg' ? -0.27 : -0.31;
    // right hand on grip, forearm going back/down-right off screen
    box(rig, 0.06, 0.07, 0.1, m.glove, 0.012, -0.045, 0.04);
    const ra = box(rig, 0.085, 0.085, 0.42, m.sleeve, 0.07, -0.13, 0.25); ra.rotation.set(0.45, 0.35, 0);
    // left hand on handguard
    box(rig, 0.07, 0.05, 0.11, m.glove, -0.01, -0.015, handZ);
    const la = box(rig, 0.085, 0.085, 0.5, m.sleeve, -0.13, -0.12, handZ + 0.22); la.rotation.set(0.35, -0.55, 0);
    rig.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: VG.Tex.flash(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffe2a8 }));
    flash.position.copy(gun.muzzle.position); flash.position.z -= 0.06;
    flash.scale.setScalar(id === 'sniper' ? 0.35 : 0.24); flash.visible = false;
    rig.add(flash);
    // the flash: hot core sprite plus four flash-hider prongs seen from the side
    const prongMat = new THREE.MeshBasicMaterial({ map: VG.Tex.prong(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(0xffd29a).multiplyScalar(3) });
    const prongs = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), prongMat);
      pm.geometry.translate(0.08, 0, 0); pm.rotation.set(0, Math.PI / 2, k * Math.PI / 2 + Math.PI / 4);
      prongs.add(pm);
    }
    prongs.position.copy(gun.muzzle.position); prongs.visible = false; rig.add(prongs);
    flash.material.color.multiplyScalar(3); // HDR so it blooms
    // collimated red dot: lives on the camera axis far ahead, so it stays on the aim point while the sight sways
    let dotFar = null;
    if (id === 'ar') { dotFar = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), mats().dot); dotFar.renderOrder = 10; dotFar.visible = false; }
    return { rig, muzzle: gun.muzzle, port: gun.port, hood: gun.hood, mag: gun.mag, magY: gun.mag.position.y, sightY: gun.sightY, flash, prongs, dotFar };
  };

  // simplified third-person gun for bots (shared geometry via clone)
  const botGunCache = {};
  VG.buildBotGun = function (id) {
    if (!botGunCache[id]) {
      const gun = buildGun(id);
      botGunCache[id] = gun;
    }
    const src = botGunCache[id];
    const g = src.group.clone();
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const muzzle = new THREE.Object3D(); muzzle.position.copy(src.muzzle.position); g.add(muzzle);
    return { group: g, muzzle };
  };
})();
