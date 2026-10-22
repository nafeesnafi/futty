// Canvas-generated textures (asphalt, concrete, corrugated metal, crates, containers...).
(function () {
  const VG = window.VG = window.VG || {};
  const T = VG.Tex = {};
  const cache = {};

  function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function speckle(g, size, n, alpha, light) {
    for (let i = 0; i < n; i++) {
      const v = light ? 255 : 0;
      g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
      const s = Math.random() < 0.9 ? 1 : 2;
      g.fillRect(Math.random() * size, Math.random() * size, s, s);
    }
  }
  function blotches(g, size, n, color, rmin, rmax) {
    for (let i = 0; i < n; i++) {
      const x = Math.random() * size, y = Math.random() * size, r = rnd(rmin, rmax);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  function make(name, size, draw, repeat) {
    if (cache[name]) return cache[name];
    const c = canvas(size), g = c.getContext('2d');
    draw(g, size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return (cache[name] = t);
  }

  T.asphalt = () => make('asphalt', 512, (g, s) => {
    g.fillStyle = '#4a4a48'; g.fillRect(0, 0, s, s);
    speckle(g, s, 26000, 0.35, false); speckle(g, s, 16000, 0.25, true);
    blotches(g, s, 18, 'rgba(20,20,20,.18)', 30, 90);
    blotches(g, s, 10, 'rgba(120,115,100,.12)', 20, 70);
    g.strokeStyle = 'rgba(25,25,25,.55)'; g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { // cracks
      let x = Math.random() * s, y = Math.random() * s; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += rnd(-18, 18); y += rnd(-18, 18); g.lineTo(x, y); }
      g.stroke();
    }
  });

  T.concrete = () => make('concrete', 512, (g, s) => {
    g.fillStyle = '#9a968c'; g.fillRect(0, 0, s, s);
    blotches(g, s, 40, 'rgba(70,66,58,.16)', 20, 80);
    blotches(g, s, 20, 'rgba(255,255,245,.10)', 20, 60);
    speckle(g, s, 18000, 0.22, false); speckle(g, s, 8000, 0.2, true);
    g.fillStyle = 'rgba(60,56,50,.35)';  // panel seams + tie holes
    g.fillRect(0, 0, s, 3); g.fillRect(0, 0, 3, s); g.fillRect(0, s / 2, s, 2);
    for (const [x, y] of [[64, 64], [192, 64], [320, 64], [448, 64], [64, 320], [192, 320], [320, 320], [448, 320]]) {
      g.beginPath(); g.arc(x, y, 4, 0, 6.3); g.fill();
    }
    for (let i = 0; i < 14; i++) { // drip stains
      const x = Math.random() * s, gr = g.createLinearGradient(0, 0, 0, s * 0.5);
      gr.addColorStop(0, 'rgba(50,45,38,.18)'); gr.addColorStop(1, 'rgba(50,45,38,0)');
      g.fillStyle = gr; g.fillRect(x, 0, rnd(3, 14), s * 0.5);
    }
  });

  T.metal = () => make('metal', 256, (g, s) => {
    const grd = g.createLinearGradient(0, 0, s, 0);
    for (let i = 0; i <= 8; i++) { const v = i % 2 ? 150 : 110; grd.addColorStop(i / 8, `rgb(${v},${v + 4},${v + 2})`); }
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    speckle(g, s, 5000, 0.18, false);
    blotches(g, s, 12, 'rgba(120,70,30,.25)', 10, 40); // rust
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < s; y += 64) g.fillRect(0, y, s, 1);
  });

  T.container = () => make('container', 256, (g, s) => {
    g.fillStyle = '#bbbbbb'; g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      const gr = g.createLinearGradient(x, 0, x + 16, 0);
      gr.addColorStop(0, '#d8d8d8'); gr.addColorStop(0.5, '#8d8d8d'); gr.addColorStop(1, '#d0d0d0');
      g.fillStyle = gr; g.fillRect(x, 0, 16, s);
    }
    blotches(g, s, 16, 'rgba(110,60,20,.3)', 8, 34);
    speckle(g, s, 4000, 0.2, false);
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, s, 6); g.fillRect(0, s - 6, s, 6);
  });

  T.wood = () => make('wood', 256, (g, s) => {
    g.fillStyle = '#9c7446'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) { // planks
      g.fillStyle = `rgb(${rnd(140, 175) | 0},${rnd(100, 125) | 0},${rnd(60, 75) | 0})`; g.fillRect(0, y, s, 30);
      g.strokeStyle = 'rgba(60,35,15,.25)';
      for (let k = 0; k < 6; k++) { g.beginPath(); const yy = y + rnd(2, 28); g.moveTo(0, yy); g.bezierCurveTo(s * .3, yy + rnd(-4, 4), s * .6, yy + rnd(-4, 4), s, yy); g.stroke(); }
      g.fillStyle = 'rgba(40,22,8,.7)'; g.fillRect(0, y + 30, s, 2);
    }
    g.strokeStyle = '#5a3c1e'; g.lineWidth = 18; g.strokeRect(9, 9, s - 18, s - 18); // frame
    g.lineWidth = 14; g.beginPath(); g.moveTo(14, 14); g.lineTo(s - 14, s - 14); g.stroke();
    g.fillStyle = 'rgba(30,20,10,.75)'; g.font = 'bold 22px monospace'; g.fillText('FRAGILE', s / 2 + 8, s / 2 - 30);
    speckle(g, s, 3000, 0.2, false);
  });

  T.plywood = () => make('plywood', 256, (g, s) => {
    g.fillStyle = '#b08a5a'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(90,60,30,.25)';
    for (let k = 0; k < 40; k++) { g.beginPath(); const y = rnd(0, s); g.moveTo(0, y); g.bezierCurveTo(s * .3, y + rnd(-8, 8), s * .7, y + rnd(-8, 8), s, y); g.stroke(); }
    speckle(g, s, 3000, 0.15, false);
  });

  T.brick = () => make('brick', 256, (g, s) => {
    g.fillStyle = '#6a625a'; g.fillRect(0, 0, s, s);
    const bh = 16, bw = 42;
    for (let r = 0; r < s / bh; r++) for (let c = -1; c < s / bw + 1; c++) {
      const x = c * bw + (r % 2 ? bw / 2 : 0);
      g.fillStyle = `rgb(${rnd(120, 150) | 0},${rnd(65, 80) | 0},${rnd(50, 62) | 0})`;
      g.fillRect(x + 1, r * bh + 1, bw - 2, bh - 2);
    }
    speckle(g, s, 6000, 0.25, false);
  });

  T.barrier = () => make('barrier', 256, (g, s) => {
    g.fillStyle = '#b5b0a4'; g.fillRect(0, 0, s, s);
    speckle(g, s, 9000, 0.22, false); blotches(g, s, 14, 'rgba(60,55,45,.2)', 10, 50);
    g.fillStyle = 'rgba(210,160,30,.85)';
    for (let x = -s; x < s * 2; x += 64) { g.beginPath(); g.moveTo(x, s * .1); g.lineTo(x + 32, s * .1); g.lineTo(x + 64, s * .3); g.lineTo(x + 32, s * .3); g.fill(); }
  });

  T.bulletHole = () => make('hole', 64, (g, s) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.18, 'rgba(10,10,10,.95)');
    gr.addColorStop(0.32, 'rgba(40,36,30,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(20,20,20,.5)';
    for (let i = 0; i < 7; i++) { const a = Math.random() * 6.3; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * rnd(12, 26), 32 + Math.sin(a) * rnd(12, 26)); g.stroke(); }
  }, false);

  T.soft = () => make('soft', 64, (g, s) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }, false);

  T.flash = () => make('flash', 128, (g, s) => {
    g.translate(64, 64);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 60);
    gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,200,90,.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = gr;
    for (let i = 0; i < 6; i++) { // star prongs
      g.rotate(Math.PI / 3 + rnd(-.2, .2));
      g.beginPath(); g.moveTo(-9, 0); g.lineTo(0, -rnd(44, 62)); g.lineTo(9, 0); g.fill();
    }
    g.beginPath(); g.arc(0, 0, 26, 0, 6.3); g.fill();
  }, false);

  T.blood = () => make('blood', 64, (g, s) => {
    for (let i = 0; i < 14; i++) {
      const x = 32 + rnd(-14, 14), y = 32 + rnd(-14, 14), r = rnd(4, 14);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(150,10,8,.9)'); gr.addColorStop(1, 'rgba(110,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }
  }, false);

  T.sky = () => make('sky', 512, (g, s) => {
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, '#3d6f9e'); gr.addColorStop(0.42, '#86a9c4'); gr.addColorStop(0.5, '#cfc9b8'); gr.addColorStop(1, '#a89c86');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) { // wispy clouds in the upper half
      const x = Math.random() * s, y = rnd(s * 0.12, s * 0.44), w = rnd(40, 160), h = rnd(6, 18);
      const cg = g.createRadialGradient(x, y, 0, x, y, w);
      cg.addColorStop(0, 'rgba(255,255,255,.28)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.save(); g.translate(x, y); g.scale(1, h / w); g.translate(-x, -y); g.fillStyle = cg; g.fillRect(x - w, y - w, w * 2, w * 2); g.restore();
    }
  });

  T.label = function (text, color) {
    const c = canvas(256); c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 34px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(text, 128, 32);
    g.fillStyle = color; g.fillText(text, 128, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
})();
