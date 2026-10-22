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
  let markers = [];

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
    // net: grid lines on back, roof and sides
    const pts = [], D = GOAL_D, step = 0.25;
    const back = (y, z) => [D, y * 0.92, z];
    for (let z = -GOAL_W / 2; z <= GOAL_W / 2 + 1e-6; z += step) { pts.push(...[0, GOAL_H, z], ...back(GOAL_H, z), ...back(GOAL_H, z), ...back(0, z)); }
    for (let y = 0; y <= GOAL_H + 1e-6; y += step) { pts.push(...back(y, -GOAL_W / 2), ...back(y, GOAL_W / 2)); }
    for (let x = 0; x <= D + 1e-6; x += step) { pts.push(x, GOAL_H - (GOAL_H * 0.08) * x / D, -GOAL_W / 2, x, GOAL_H - (GOAL_H * 0.08) * x / D, GOAL_W / 2); }
    for (const z of [-GOAL_W / 2, GOAL_W / 2]) {
      for (let y = 0; y <= GOAL_H + 1e-6; y += step) pts.push(0, y, z, D, y * 0.92, z);
      for (let x = 0; x <= D + 1e-6; x += step) pts.push(x, 0, z, x, GOAL_H - (GOAL_H * 0.08) * x / D, z);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .45 })));
    g.position.x = side * HL;
    if (side < 0) g.rotation.y = Math.PI;
    scene.add(g);
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
      grp.position.set(...s.pos); grp.rotation.y = s.rot;
      scene.add(grp);
    }
    // advertising boards
    const ads = canvasTex(1024, 64, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, '#0b1d4d'); grd.addColorStop(1, '#13307a');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; g.font = 'bold 40px system-ui, sans-serif'; g.textBaseline = 'middle';
      g.fillText('FUTT SEPIA GAMES', 30, h / 2 + 2); g.fillStyle = '#e9c46a'; g.fillText('★ CHAMPIONS NIGHT', 540, h / 2 + 2);
    }, [6, 1]);
    const adMat = new THREE.MeshBasicMaterial({ map: ads });
    for (const [x, z, w, r] of [[0, -HW - 4, 120, 0], [0, HW + 4, 120, Math.PI], [-HL - 4, 0, 76, Math.PI / 2], [HL + 4, 0, 76, -Math.PI / 2]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 0.2), [adMat, adMat, adMat, adMat, adMat, adMat]);
      b.position.set(x, 0.45, z); b.rotation.y = r; scene.add(b);
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
    draw(view, dt) {
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
        // running animation
        const spd = s.spd || 0;
        p.phase += dt * (2.2 + spd * 1.5);
        const amp = Math.min(0.9, spd * 0.12);
        p.legs[0].rotation.x = Math.sin(p.phase) * amp;
        p.legs[1].rotation.x = -Math.sin(p.phase) * amp;
        p.arms[0].rotation.x = -Math.sin(p.phase) * amp * 0.8;
        p.arms[1].rotation.x = Math.sin(p.phase) * amp * 0.8;
        p.body.position.y = Math.abs(Math.sin(p.phase)) * amp * 0.06;
        p.body.rotation.x = Math.min(0.25, spd * 0.03);
        if (s.kick > 0) { p.legs[1].rotation.x = -1.1 * Math.sin(Math.PI * (1 - s.kick)); }
        if (s.dive) { p.body.rotation.z = s.dive; p.body.position.y = 0.2; } else p.body.rotation.z = 0;
      });
      for (let t = 0; t < 2; t++) {
        const idx = view.active[t];
        markers[t].visible = idx >= 0;
        if (idx >= 0) { const s = view.players[idx]; markers[t].position.set(s.x, 0, s.z); markers[t].children[1].rotation.y += dt * 3; }
      }

      // broadcast camera following the ball; flipped for the away player online
      const f = view.flip ? -1 : 1;
      const lookX = b.x * 0.92, lookZ = b.z * 0.55;
      const want = new THREE.Vector3(lookX, 15, f * 30 + b.z * 0.55);
      camPos.lerp(want, Math.min(1, dt * 2.5));
      camLook.lerp(new THREE.Vector3(lookX, 0, lookZ - f * 1), Math.min(1, dt * 3));
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      renderer.render(scene, camera);
    },

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
