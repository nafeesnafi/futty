// 3D view: stadium, pitch, players and ball (three.js). Reads a plain "view" object each frame,
// so the same renderer works for the local simulation and for snapshots received online.
var FC = window.FC = window.FC || {};

(() => {
  const PL = 105, PW = 68, HL = PL / 2, HW = PW / 2;   // pitch length/width (m)
  const GOAL_W = 7.32, GOAL_H = 2.44, GOAL_D = 2;
  FC.PITCH = { PL, PW, HL, HW, GOAL_W, GOAL_H, GOAL_D };

  let renderer, scene, camera, sun, ballMesh, ballShadow;
  const players = [];               // 22 player rigs (0-10 home, 11-21 away)
  const camPos = new THREE.Vector3(0, 30, 50), camLook = new THREE.Vector3();
  let markers = [], reticle = null, shake = 0, orbitT = 0;
  const flags = [];                 // supporter flags waved in the stands
  let flagTex = null, clockT = 0;

  // Fans hold flags on poles above the crowd. Positions are in a stand's local frame:
  // x runs along the stand, v runs up the slope (the stand plane is tilted 0.6 rad back from vertical).
  function addFlags(grp, len) {
    if (!FC.FAN_FLAGS || !FC.FAN_FLAGS.length) return;
    if (!flagTex) flagTex = FC.FAN_FLAGS.map(src => { const t = new THREE.TextureLoader().load(src); t.colorSpace = THREE.SRGBColorSpace; return t; });
    const count = Math.round(len / 13), poleMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    for (let i = 0; i < count; i++) {
      const x = -len / 2 + (i + 0.5) * (len / count) + (Math.random() - 0.5) * 4;
      const v = [-15.5, -12.5, -14][i % 3] + (Math.random() - 0.5);   // front rows, so the match camera sees them
      const baseY = 9.5 + Math.cos(-Math.PI / 2 + 0.6) * v, baseZ = -8 + Math.sin(-Math.PI / 2 + 0.6) * v;
      const W = 5.4, H = 3.6;
      const geo = new THREE.PlaneGeometry(W, H, 14, 6);
      const mat = new THREE.MeshLambertMaterial({ map: flagTex[flags.length % flagTex.length], side: THREE.DoubleSide });
      const flag = new THREE.Mesh(geo, mat);
      flag.position.set(x + W / 2, baseY + 3.6, baseZ + 0.8);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.6), poleMat);
      pole.position.set(x, baseY + 2.6, baseZ + 0.8);
      grp.add(flag, pole);
      flags.push({ flag, pole, base: geo.attributes.position.array.slice(), W, y0: flag.position.y, py0: pole.position.y, phase: Math.random() * 6.28, speed: 2.5 + Math.random() * 1.5 });
    }
  }

  function waveFlags(dt) {
    clockT += dt;
    for (const f of flags) {
      const pos = f.flag.geometry.attributes.position, a = pos.array, b = f.base;
      for (let k = 0; k < a.length; k += 3) {
        const along = (b[k] + f.W / 2) / f.W;           // 0 at the pole, 1 at the free edge
        a[k + 2] = Math.sin(b[k] * 1.4 - clockT * f.speed + f.phase) * 0.35 * along;
        a[k + 1] = b[k + 1] - along * along * 0.25;    // free edge droops a little
      }
      pos.needsUpdate = true;
      const lift = Math.max(0, Math.sin(clockT * 1.3 + f.phase)) * 0.6;   // fans raise and lower the flags
      f.flag.position.y = f.y0 + lift; f.pole.position.y = f.py0 + lift;
    }
  }

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }

  // ---------- pitch ----------
  function pitchTexture() {
    const M = 6, W = PL + M * 2, H = PW + M * 2, S = 18;   // S px per metre
    return canvasTex(W * S, H * S, (g) => {
      const X = x => (x + HL + M) * S, Y = z => (z + HW + M) * S;
      g.fillStyle = '#2f7d32'; g.fillRect(0, 0, W * S, H * S);
      const stripes = 18, sw = PL / stripes;
      for (let i = 0; i < stripes; i++) {
        g.fillStyle = i % 2 ? '#2e8b3a' : '#349a40';
        g.fillRect(X(-HL + i * sw), Y(-HW - M), sw * S + 1, H * S);
      }
      // subtle grass noise
      for (let i = 0; i < 40000; i++) {
        g.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`;
        g.fillRect(Math.random() * W * S, Math.random() * H * S, 2, 2);
      }
      g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 0.12 * S; g.fillStyle = '#fff';
      const rect = (x1, z1, x2, z2) => g.strokeRect(X(x1), Y(z1), (x2 - x1) * S, (z2 - z1) * S);
      const circ = (x, z, r, a0 = 0, a1 = Math.PI * 2) => { g.beginPath(); g.arc(X(x), Y(z), r * S, a0, a1); g.stroke(); };
      const dot = (x, z) => { g.beginPath(); g.arc(X(x), Y(z), 0.22 * S, 0, 7); g.fill(); };
      rect(-HL, -HW, HL, HW);
      g.beginPath(); g.moveTo(X(0), Y(-HW)); g.lineTo(X(0), Y(HW)); g.stroke();
      circ(0, 0, 9.15); dot(0, 0);
      for (const s of [-1, 1]) {
        const gx = s * HL;
        rect(Math.min(gx, gx - s * 16.5), -20.16, Math.max(gx, gx - s * 16.5), 20.16);
        rect(Math.min(gx, gx - s * 5.5), -9.16, Math.max(gx, gx - s * 5.5), 9.16);
        dot(gx - s * 11, 0);
        const a = Math.acos(5.5 / 9.15);
        if (s > 0) circ(gx - 11, 0, 9.15, Math.PI - a, Math.PI + a); else circ(gx + 11, 0, 9.15, -a, a);
        for (const t of [-1, 1]) {
          const a0 = Math.atan2(-t, -s);           // corner arc faces into the pitch
          circ(gx, t * HW, 1, a0 - Math.PI / 4, a0 + Math.PI / 4);
        }
      }
    });
  }

  function buildPitch() {
    const tex = pitchTexture();
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const M = 6;
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PL + M * 2, PW + M * 2), new THREE.MeshLambertMaterial({ map: tex }));
    pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true;
    scene.add(pitch);
    // surround (track)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 170), new THREE.MeshLambertMaterial({ color: 0x1f5e2a }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
  }

  function buildGoal(side) {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .4 });
    const post = new THREE.CylinderGeometry(0.06, 0.06, GOAL_H, 10);
    for (const z of [-GOAL_W / 2, GOAL_W / 2]) {
      const p = new THREE.Mesh(post, white); p.position.set(0, GOAL_H / 2, z); p.castShadow = true; g.add(p);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GOAL_W, 10), white);
    bar.rotation.x = Math.PI / 2; bar.position.set(0, GOAL_H, 0); bar.castShadow = true; g.add(bar);
    g.position.x = side * HL;
    if (side < 0) g.rotation.y = Math.PI;
    g.add(buildNet(side));
    scene.add(g);
  }

  // The net is a grid of spring nodes (back, roof, two sides). The ball pushes nearby nodes along
  // its velocity; each node springs back to rest with damping, so shots bulge and ripple the net.
  const nets = [];
  function buildNet(side) {
    const D = GOAL_D, W = GOAL_W, H = GOAL_H, nodes = [], idx = [];
    const roofY = x => H - H * 0.08 * x / D;
    function panel(nu, nv, at) {
      const base = nodes.length;
      for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) {
        const [x, y, z] = at(u / (nu - 1), v / (nv - 1));
        nodes.push({ rx: x, ry: y, rz: z, dx: 0, dy: 0, dz: 0, vx: 0, vy: 0, vz: 0, pin: u === 0 || v === 0 || u === nu - 1 || v === nv - 1 });
        const i = base + v * nu + u;
        if (u > 0) idx.push(i - 1, i);
        if (v > 0) idx.push(i - nu, i);
      }
    }
    const cols = Math.round(W / 0.25) + 1;
    panel(cols, 11, (u, v) => [D, v * roofY(D), -W / 2 + u * W]);              // back
    panel(cols, 9, (u, v) => [v * D, roofY(v * D), -W / 2 + u * W]);           // roof
    for (const sz of [-W / 2, W / 2]) panel(9, 11, (u, v) => [u * D, v * roofY(u * D), sz]);   // sides
    const pos = new Float32Array(nodes.length * 3);
    nodes.forEach((n, i) => { pos[i * 3] = n.rx; pos[i * 3 + 1] = n.ry; pos[i * 3 + 2] = n.rz; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .5 }));
    mesh.frustumCulled = false;
    nets.push({ side, nodes, geo, energy: 0 });
    return mesh;
  }

  function updateNets(ball, dt) {
    for (const net of nets) {
      const s = net.side, lx = (ball.x - s * HL) * s, lz = ball.z * s, ly = ball.y + 0.11;
      const bvx = (ball.vx || 0) * s, bvz = (ball.vz || 0) * s, bvy = ball.vy || 0;
      const near = lx > -0.5 && lx < GOAL_D + 0.6 && Math.abs(lz) < GOAL_W / 2 + 0.6 && ly < GOAL_H + 0.6;
      if (!near && net.energy < 1e-3) continue;
      let energy = 0;
      const pos = net.geo.attributes.position.array;
      net.nodes.forEach((n, i) => {
        if (n.pin) return;
        if (near) {
          const ex = n.rx + n.dx - lx, ey = n.ry + n.dy - ly, ez = n.rz + n.dz - lz, dist = Math.hypot(ex, ey, ez);
          if (dist < 0.8) {
            const f = (1 - dist / 0.8) * 0.9;
            n.vx += bvx * f; n.vy += bvy * f * 0.5; n.vz += bvz * f;
          }
        }
        // spring back to rest, with damping
        n.vx += (-70 * n.dx - 7 * n.vx) * dt; n.vy += (-70 * n.dy - 7 * n.vy) * dt; n.vz += (-70 * n.dz - 7 * n.vz) * dt;
        n.dx = Math.max(-0.9, Math.min(0.9, n.dx + n.vx * dt));
        n.dy = Math.max(-0.9, Math.min(0.9, n.dy + n.vy * dt));
        n.dz = Math.max(-0.9, Math.min(0.9, n.dz + n.vz * dt));
        energy += Math.abs(n.vx) + Math.abs(n.dx) + Math.abs(n.vz) + Math.abs(n.dz);
        pos[i * 3] = n.rx + n.dx; pos[i * 3 + 1] = n.ry + n.dy; pos[i * 3 + 2] = n.rz + n.dz;
      });
      net.energy = energy;
      net.geo.attributes.position.needsUpdate = true;
    }
  }

  // ---------- turf skid marks from slide tackles ----------
  const skids = [];
  function addSkid(x, z, face) {
    let m;
    if (skids.length >= 40) m = skids.shift().mesh;
    else {
      m = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 2.4), new THREE.MeshBasicMaterial({ color: 0x5a4a2a, transparent: true, opacity: 0.55, depthWrite: false }));
      m.rotation.order = 'YXZ'; scene.add(m);
    }
    m.position.set(x - Math.sin(face) * 0.6, 0.015, z - Math.cos(face) * 0.6);
    m.rotation.set(-Math.PI / 2, face, 0);
    skids.push({ mesh: m, life: 45 });
  }
  function fadeSkids(dt) {
    for (const k of skids) { k.life -= dt; k.mesh.material.opacity = Math.max(0.06, Math.min(0.55, k.life / 45 * 0.55)); }
  }

  function buildStadium() {
    // crowd: coloured specks on a dark stand, repeated
    const crowd = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#1b1f2a'; g.fillRect(0, 0, w, h);
      const cols = ['#c0392b', '#f1c40f', '#ecf0f1', '#2980b9', '#8e44ad', '#e67e22', '#16a085', '#bdc3c7', '#34495e'];
      for (let y = 4; y < h; y += 9) for (let x = 3; x < w; x += 7) {
        g.fillStyle = cols[(Math.random() * cols.length) | 0];
        g.globalAlpha = 0.55 + Math.random() * 0.45;
        g.fillRect(x + Math.random() * 2, y + Math.random() * 2, 4, 5);
      }
      g.globalAlpha = 1;
    }, [8, 3]);
    const standMat = new THREE.MeshLambertMaterial({ map: crowd });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a2f3a });
    const sides = [
      { len: 150, pos: [0, 0, -HW - 14], rot: 0 },
      { len: 150, pos: [0, 0, HW + 14], rot: Math.PI },
      { len: 100, pos: [-HL - 14, 0, 0], rot: Math.PI / 2 },
      { len: 100, pos: [HL + 14, 0, 0], rot: -Math.PI / 2 },
    ];
    for (const s of sides) {
      const grp = new THREE.Group();
      const stand = new THREE.Mesh(new THREE.PlaneGeometry(s.len, 34), standMat);
      stand.rotation.x = -Math.PI / 2 + 0.6; stand.position.set(0, 9.5, -8);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(s.len, 0.6, 16), roofMat);
      roof.position.set(0, 23, -14); roof.rotation.x = -0.12;
      const back = new THREE.Mesh(new THREE.BoxGeometry(s.len, 24, 1), roofMat);
      back.position.set(0, 11, -22);
      grp.add(stand, roof, back);
      addFlags(grp, s.len);
      grp.position.set(...s.pos); grp.rotation.y = s.rot;
      scene.add(grp);
    }
    // pitch-side sponsor boards: two messages side by side, tiled along each board
    const drawAds = (g, w, h) => {
      const half = w / 2;
      const ig = g.createLinearGradient(0, 0, half, 0);
      ig.addColorStop(0, '#5b2bc4'); ig.addColorStop(0.5, '#d62976'); ig.addColorStop(1, '#f58529');
      g.fillStyle = ig; g.fillRect(0, 0, half, h);
      g.fillStyle = '#e62117'; g.fillRect(half, 0, half, h);
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const fit = (text, x) => {
        let size = 40;
        do { g.font = `800 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`; size -= 1; } while (g.measureText(text).width > half - 60 && size > 12);
        g.fillText(text, x, h / 2 + 2);
      };
      fit('FOLLOW @NACHOFEES ON INSTAGRAM', half / 2);
      fit('SUBSCRIBE TO MONTASIR MUSTAFA ON YOUTUBE', half + half / 2);
    };
    // keep the lettering in proportion: one 2048x64 tile spans 1.4 m x 45 m of board
    const adMat = len => new THREE.MeshBasicMaterial({ map: canvasTex(2048, 64, drawAds, [Math.max(1, Math.round(len / 45)), 1]) });
    for (const [x, z, w, r] of [[0, -HW - 4, 120, 0], [0, HW + 4, 120, Math.PI], [-HL - 4, 0, 76, Math.PI / 2], [HL + 4, 0, 76, -Math.PI / 2]]) {
      const m = adMat(w);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, 0.2), [m, m, m, m, m, m]);
      b.position.set(x, 0.7, z); b.rotation.y = r; scene.add(b);
    }
    // floodlight towers
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
    for (const [x, z] of [[-HL - 22, -HW - 22], [HL + 22, -HW - 22], [-HL - 22, HW + 22], [HL + 22, HW + 22]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 40), roofMat); pole.position.set(x, 20, z);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 1), lampMat); lamp.position.set(x, 40, z); lamp.lookAt(0, 0, 0);
      scene.add(pole, lamp);
    }
  }

  // ---------- players ----------
  function shirtTex(kit, number, back) {
    return canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = kit.shirt; g.fillRect(0, 0, w, h);
      g.fillStyle = kit.shirt2;
      const p = kit.pattern;
      if (p === 'stripes') for (let x = 10; x < w; x += 32) g.fillRect(x, 0, 14, h);
      if (p === 'hoops') for (let y = 8; y < h; y += 30) g.fillRect(0, y, w, 13);
      if (p === 'halves') g.fillRect(w / 2, 0, w / 2, h);
      if (p === 'band') g.fillRect(w * 0.38, 0, w * 0.24, h);
      if (p === 'sash') { g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.35, 0); g.lineTo(w, h * 0.65); g.lineTo(w, h); g.lineTo(w * 0.65, h); g.lineTo(0, h * 0.35); g.fill(); }
      if (p === 'solid' || p === 'sleeves') { g.fillRect(0, 0, w, 8); }
      if (number != null) {
        g.font = `bold ${back ? 64 : 26}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const light = lum(kit.shirt) > 0.55;
        g.fillStyle = light ? '#111' : '#fff'; g.strokeStyle = light ? '#fff' : '#111'; g.lineWidth = back ? 5 : 3;
        const x = back ? w / 2 : w * 0.7, y = back ? h * 0.52 : h * 0.3;
        g.strokeText(String(number), x, y); g.fillText(String(number), x, y);
      }
    });
  }
  function lum(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; }

  const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a46a3f'];
  const HAIR = ['#1b1b1b', '#3b2a1a', '#6b4423', '#c9a46c', '#1b1b1b', '#2b2b2b'];

  function makePlayer(kit, number, gkKit) {
    const k = gkKit || kit;
    const root = new THREE.Group();
    root.scale.setScalar(1.15);   // slightly larger than life so players read well from the broadcast camera
    const body = new THREE.Group(); root.add(body);
    const side = new THREE.MeshLambertMaterial({ map: shirtTex(k) });
    const front = new THREE.MeshLambertMaterial({ map: shirtTex(k, number, false) });
    const backM = new THREE.MeshLambertMaterial({ map: shirtTex(k, number, true) });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), [side, side, side, side, front, backM]);
    torso.position.y = 1.18; torso.castShadow = true; body.add(torso);
    const skinC = SKIN[(Math.random() * SKIN.length) | 0];
    const skin = new THREE.MeshLambertMaterial({ color: skinC });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin); head.position.y = 1.64; head.castShadow = true;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: HAIR[(Math.random() * HAIR.length) | 0] }));
    hair.position.y = 1.655; hair.rotation.x = -0.25;
    body.add(head, hair);
    const sleeveC = k.pattern === 'sleeves' ? k.shirt2 : k.shirt;
    const sleeve = new THREE.MeshLambertMaterial({ color: sleeveC });
    const arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.31, 1.45, 0);
      const up = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), sleeve); up.position.y = -0.15;
      const low = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), skin); low.position.y = -0.44;
      pivot.add(up, low); body.add(pivot); arms.push(pivot);
    }
    const shortsM = new THREE.MeshLambertMaterial({ color: k.shorts });
    const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 0.27), shortsM); shorts.position.y = 0.8; shorts.castShadow = true; body.add(shorts);
    const sockM = new THREE.MeshLambertMaterial({ color: k.socks });
    const bootM = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.12, 0.8, 0);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.36, 8), skin); thigh.position.y = -0.2;
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.38, 8), sockM); shin.position.y = -0.56;
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.24), bootM); boot.position.set(0, -0.76, 0.05);
      thigh.castShadow = shin.castShadow = true;
      pivot.add(thigh, shin, boot); body.add(pivot); legs.push(pivot);
    }
    if (gkKit) {   // gloves
      for (const a of arms) { const glove = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.13), new THREE.MeshLambertMaterial({ color: 0xf5f5f5 })); glove.position.y = -0.62; a.add(glove); }
    }
    scene.add(root);
    return { root, body, arms, legs, phase: Math.random() * 6, kickT: 0 };
  }

  function makeMarker(color) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.32, 3), new THREE.MeshBasicMaterial({ color }));
    cone.rotation.x = Math.PI; cone.position.y = 2.25;
    g.add(ring, cone); g.visible = false; scene.add(g);
    return g;
  }

  // ---------- ball ----------
  function buildBall() {
    const tex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#fafafa'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1a1a1a';
      for (let i = 0; i < 12; i++) {
        const x = (i % 6) * w / 6 + (i < 6 ? 0 : w / 12), y = i < 6 ? h * 0.3 : h * 0.72;
        g.beginPath();
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * 13, y + Math.sin(a) * 10); }
        g.fill();
      }
    });
    ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), new THREE.MeshStandardMaterial({ map: tex, roughness: .5 }));
    ballMesh.castShadow = true; scene.add(ballMesh);
    ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .35, depthWrite: false }));
    ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow);
  }

  // ---------- public API ----------
  FC.Render = {
    init(container) {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a1230);
      scene.fog = new THREE.Fog(0x0a1230, 120, 260);
      camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.5, 600);
      scene.add(new THREE.HemisphereLight(0xeef3ff, 0x40603a, 1.25));
      scene.add(new THREE.AmbientLight(0xffffff, 0.35));
      sun = new THREE.DirectionalLight(0xffffff, 1.5);
      sun.position.set(-30, 70, 40); sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 45, bottom: -45, near: 10, far: 200 });
      scene.add(sun);
      buildPitch(); buildGoal(1); buildGoal(-1); buildStadium(); buildBall();
      markers = [makeMarker(0x38bdf8), makeMarker(0xff5d5d)];
      reticle = new THREE.Group();
      const rmat = new THREE.MeshBasicMaterial({ color: 0xf0c35a, transparent: true, opacity: 0.95, depthTest: false });
      reticle.add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 32), rmat), new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), rmat));
      reticle.rotation.y = Math.PI / 2; reticle.visible = false; reticle.renderOrder = 10; scene.add(reticle);
      addEventListener('resize', () => {
        renderer.setSize(container.clientWidth, container.clientHeight);
        camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix();
      });
    },

    // kits: [homeKit, awayKit]
    setTeams(kits) {
      for (const p of players) scene.remove(p.root);
      players.length = 0;
      const gk = [{ shirt: '#22c55e', shirt2: '#14532d', pattern: 'solid', shorts: '#14532d', socks: '#22c55e' },
                  { shirt: '#f97316', shirt2: '#7c2d12', pattern: 'solid', shorts: '#7c2d12', socks: '#f97316' }];
      for (let t = 0; t < 2; t++) for (let i = 0; i < 11; i++) players.push(makePlayer(kits[t], FC.NUMBERS[i], i === 0 ? gk[t] : null));
    },

    // view = { ball:{x,y,z,vx,vz}, players:[{x,z,face,spd,kick}], active:[homeIdx|-1, awayIdx|-1], flip }
    // match events that drive effects (also arrive on the guest's screen online)
    onEvent(e, view) {
      if (e.e === 'post') shake = Math.max(shake, 0.6);
      else if (e.e === 'goal') shake = Math.max(shake, 0.3);
      else if (e.e === 'save') shake = Math.max(shake, 0.15);
      else if (e.e === 'slide' && view && view.players[e.by]) { const q = view.players[e.by]; addSkid(q.x, q.z, q.face); }
    },

    draw(view, dt) {
      waveFlags(dt);
      fadeSkids(dt);
      updateNets(view.ball, dt);
      const b = view.ball;
      ballMesh.position.set(b.x, b.y + 0.11, b.z);
      const sp = Math.hypot(b.vx || 0, b.vz || 0);
      if (sp > 0.05) {
        const axis = new THREE.Vector3(b.vz, 0, -b.vx).normalize();
        ballMesh.rotateOnWorldAxis(axis, sp * dt / 0.11);
      }
      ballShadow.position.set(b.x, 0.02, b.z);
      ballShadow.material.opacity = Math.max(0.08, 0.35 - b.y * 0.05);

      view.players.forEach((s, i) => {
        const p = players[i]; if (!p) return;
        p.root.position.set(s.x, 0, s.z);
        p.root.rotation.y = s.face;
        // turning rate drives the lean into corners
        let dFace = s.face - (p.prevFace == null ? s.face : p.prevFace); dFace = Math.atan2(Math.sin(dFace), Math.cos(dFace));
        p.prevFace = s.face;
        const spd = s.spd || 0;
        const leanTarget = Math.max(-0.35, Math.min(0.35, -dFace / Math.max(dt, 1e-3) * spd * 0.012));
        p.lean = (p.lean || 0) + (leanTarget - (p.lean || 0)) * Math.min(1, dt * 8);
        // running cycle
        p.phase += dt * (2.2 + spd * 1.5);
        const amp = Math.min(0.9, spd * 0.12);
        p.legs[0].rotation.x = Math.sin(p.phase) * amp;
        p.legs[1].rotation.x = -Math.sin(p.phase) * amp;
        p.arms[0].rotation.x = -Math.sin(p.phase) * amp * 0.8;
        p.arms[1].rotation.x = Math.sin(p.phase) * amp * 0.8;
        p.arms[0].rotation.z = 0; p.arms[1].rotation.z = 0;
        p.body.position.y = Math.abs(Math.sin(p.phase)) * amp * 0.06;
        p.body.position.z = 0;
        p.body.rotation.x = Math.min(0.25, spd * 0.03);
        p.body.rotation.z = p.lean;
        if (s.kick > 0) { p.legs[1].rotation.x = -1.1 * Math.sin(Math.PI * (1 - s.kick)); }
        if (s.slide > 0) {
          // sliding tackle: on the hip, leading leg out, arm trailing
          const k = Math.min(1, s.slide / 0.25);
          p.body.rotation.x = -1.15 * k; p.body.position.y = -0.45 * k; p.body.position.z = 0.2 * k;
          p.legs[1].rotation.x = -1.5 * k; p.legs[0].rotation.x = -0.6 * k;
          p.arms[0].rotation.z = 0.9 * k; p.arms[1].rotation.x = 0.8 * k;
        } else if (s.dive) {
          // goalkeeper dive: body laid out sideways and lifted, both arms reaching
          const k = Math.min(1, Math.abs(s.dive) / 1.1);
          p.body.rotation.z = s.dive; p.body.position.y = 0.25 + 0.35 * Math.sin(k * Math.PI / 2);
          p.arms[0].rotation.z = -2.7 * k * Math.sign(s.dive) + 0.3; p.arms[1].rotation.z = -2.7 * k * Math.sign(s.dive) - 0.3;
          p.arms[0].rotation.x = 0; p.arms[1].rotation.x = 0;
        } else if (s.jump > 0) {
          // jumping for a header: rise and fall over ~0.55 s with arms up for balance
          const t = 1 - s.jump / 0.55, h = Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
          p.body.position.y = 0.55 * h; p.body.rotation.x = -0.25 * h;
          p.arms[0].rotation.z = 2.2 * h; p.arms[1].rotation.z = -2.2 * h;
          p.legs[0].rotation.x = 0.5 * h; p.legs[1].rotation.x = 0.2 * h;
        } else if (s.shield) {
          // shielding: low stance, leaning back into the defender, arms out
          p.body.rotation.x = -0.2; p.body.position.y = -0.05;
          p.arms[0].rotation.z = 0.9; p.arms[1].rotation.z = -0.9;
        }
      });
      for (let t = 0; t < 2; t++) {
        // blue ring = you, red ring = opponent (the away player online sees the view flipped)
        const m = markers[view.flip ? 1 - t : t], idx = view.active[t];
        m.visible = idx >= 0 && !view.fk;
        if (idx >= 0) { const s = view.players[idx]; m.position.set(s.x, 0, s.z); m.children[1].rotation.y += dt * 3; }
      }

      // free kick / penalty you are taking: camera behind the ball, target over the goal
      reticle.visible = !!view.fk;
      if (view.fk) {
        const k = view.fk, gx = k.gx, dist = Math.hypot(gx - b.x, b.z) || 1;
        const ux = (gx - b.x) / dist, uz = -b.z / dist;
        reticle.position.set(gx, k.aimY, k.aimZ);
        reticle.rotation.y = gx > 0 ? -Math.PI / 2 : Math.PI / 2;
        camPos.lerp(new THREE.Vector3(b.x - ux * 7, 2.6, b.z - uz * 7), Math.min(1, dt * 4));
        camLook.lerp(new THREE.Vector3(gx, 1.3, k.aimZ * 0.4), Math.min(1, dt * 4));
        camera.position.copy(camPos); camera.lookAt(camLook);
        renderer.render(scene, camera);
        return;
      }
      const f = view.flip ? -1 : 1;
      if (view.celebrate) {
        // goal celebration: slow orbit around the scorer
        const c = view.celebrate; orbitT += dt * 0.45;
        const want = new THREE.Vector3(c.x + Math.sin(orbitT) * 9, 3.2, c.z + f * Math.cos(orbitT) * 9);
        camPos.lerp(want, Math.min(1, dt * 2)); camLook.lerp(new THREE.Vector3(c.x, 1.1, c.z), Math.min(1, dt * 3));
      } else {
        orbitT = 0;
        // broadcast camera: leads the ball's movement and pushes in when play reaches the final third
        const zone = Math.max(0, Math.min(1, (Math.abs(b.x) - 28) / 22));
        const dist = (view.replay ? 20 : 30) - 8 * zone, height = (view.replay ? 9 : 15) - 3.5 * zone;
        const lookX = b.x * 0.92 + (b.vx || 0) * 0.25, lookZ = b.z * 0.55 + (b.vz || 0) * 0.1;
        camPos.lerp(new THREE.Vector3(lookX, height, f * dist + b.z * 0.55), Math.min(1, dt * 2.5));
        camLook.lerp(new THREE.Vector3(lookX, 0, lookZ - f * 1), Math.min(1, dt * 3));
      }
      camera.position.copy(camPos);
      if (shake > 0.01) {
        camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake;
        shake *= Math.exp(-dt * 6);
      }
      camera.lookAt(camLook);
      renderer.render(scene, camera);
    },

    _renderer() { return renderer; },   // for profiling

    snapCamera(view) {
      const f = view.flip ? -1 : 1;
      camPos.set(view.ball.x * 0.92, 15, f * 30);
      camLook.set(view.ball.x * 0.92, 0, -f);
    },

    // project a world point to screen pixels (for name tags / debugging)
    project(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const r = renderer.domElement;
      return { x: (v.x + 1) / 2 * r.clientWidth, y: (1 - v.y) / 2 * r.clientHeight, on: v.z < 1 };
    },
  };
})();
