// Waypoint graph sampled from the collision world on a 2 m grid (ground + walkable tops such as
// the balcony and stairs), connected where a bot can walk in a straight line. A* for paths.
(function () {
  const VG = window.VG = window.VG || {};
  const N = VG.Nav = {};
  const P = VG.Phys;
  const S = 2, R = 0.42, H = 1.8;

  N.nodes = [];
  let cells = new Map();
  const key = (ix, iz) => ix * 1000 + iz;

  function clearPath(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    const px = -dz / d * 0.3, pz = dx / d * 0.3;
    const y0 = Math.max(a.y, b.y);
    for (const h of [0.55, 1.4]) for (const o of [-1, 0, 1]) {
      if (!P.los(a.x + px * o, y0 + h, a.z + pz * o, b.x + px * o, y0 + h, b.z + pz * o)) return false;
    }
    return true;
  }
  N.clearPath = clearPath;

  N.build = function (bounds) {
    N.nodes = []; cells = new Map();
    const walk = P.boxes.filter(b => b.walk);
    for (let x = bounds.x0 + 2; x <= bounds.x1 - 2; x += S) {
      for (let z = bounds.z0 + 2; z <= bounds.z1 - 2; z += S) {
        const ys = [0];
        for (const b of walk) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) ys.push(b.y1);
        for (const y of ys) {
          if (!P.fits(x, y + 0.02, z, R, H)) continue;
          const n = { i: N.nodes.length, x, y, z, ix: Math.round(x / S), iz: Math.round(z / S), n: [], cover: false };
          N.nodes.push(n);
          const k = key(n.ix, n.iz);
          let c = cells.get(k); if (!c) cells.set(k, c = []);
          c.push(n);
        }
      }
    }
    // connect 8-neighbours
    for (const a of N.nodes) {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const c = cells.get(key(a.ix + dx, a.iz + dz)); if (!c) continue;
        for (const b of c) {
          if (b.i < a.i) continue;
          if (Math.abs(b.y - a.y) > 0.7) continue;
          if (!clearPath(a, b)) continue;
          a.n.push(b.i); b.n.push(a.i);
        }
      }
    }
    // cover flag: ground node hugging a solid obstacle at least chest high
    for (const a of N.nodes) {
      if (a.n.length < 2) continue;
      const near = P.query(a.x - 1.4, a.z - 1.4, a.x + 1.4, a.z + 1.4);
      for (const b of near) {
        if (!b.cover || b.y1 - a.y < 1.0 || b.y0 > a.y + 0.5) continue;
        const ddx = Math.max(b.x0 - a.x, 0, a.x - b.x1), ddz = Math.max(b.z0 - a.z, 0, a.z - b.z1);
        if (Math.hypot(ddx, ddz) < 1.2) { a.cover = true; break; }
      }
    }
    // drop islands that are not reachable from the biggest component
    const comp = new Int32Array(N.nodes.length).fill(-1);
    let best = -1, bestSize = 0, id = 0;
    for (const s of N.nodes) {
      if (comp[s.i] >= 0) continue;
      let size = 0; const st = [s.i]; comp[s.i] = id;
      while (st.length) { const u = st.pop(); size++; for (const v of N.nodes[u].n) if (comp[v] < 0) { comp[v] = id; st.push(v); } }
      if (size > bestSize) { bestSize = size; best = id; }
      id++;
    }
    for (const a of N.nodes) a.ok = comp[a.i] === best;
    N.good = N.nodes.filter(a => a.ok);
    N.covers = N.good.filter(a => a.cover);
  };

  N.nearest = function (x, y, z) {
    const ix = Math.round(x / S), iz = Math.round(z / S);
    let best = null, bd = 1e9;
    for (let r = 0; r <= 3 && !best; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        const c = cells.get(key(ix + dx, iz + dz)); if (!c) continue;
        for (const n of c) {
          if (!n.ok) continue;
          const d = (n.x - x) ** 2 + (n.z - z) ** 2 + ((n.y - y) * 3) ** 2;
          if (d < bd) { bd = d; best = n; }
        }
      }
    }
    return best;
  };

  N.random = function () { return N.good[(Math.random() * N.good.length) | 0]; };

  // A* with a binary heap. Returns array of nodes (excluding start) or null.
  N.path = function (from, to) {
    if (!from || !to) return null;
    if (from === to) return [to];
    const nodes = N.nodes, n = nodes.length;
    const g = new Float32Array(n).fill(Infinity), came = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const heap = [], hf = [];
    const push = (i, f) => { heap.push(i); hf.push(f); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p; } };
    const pop = () => {
      const top = heap[0], li = heap.pop(), lf = hf.pop();
      if (heap.length) { heap[0] = li; hf[0] = lf; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m; } }
      return top;
    };
    const h = (a) => Math.hypot(a.x - to.x, a.z - to.z, a.y - to.y);
    g[from.i] = 0; push(from.i, h(from));
    let iter = 0;
    while (heap.length && iter++ < 6000) {
      const u = pop();
      if (u === to.i) {
        const out = []; let c = u;
        while (c !== from.i) { out.push(nodes[c]); c = came[c]; }
        return out.reverse();
      }
      if (closed[u]) continue; closed[u] = 1;
      const a = nodes[u];
      for (const v of a.n) {
        if (closed[v]) continue;
        const b = nodes[v], ng = g[u] + Math.hypot(b.x - a.x, b.z - a.z, (b.y - a.y) * 2);
        if (ng < g[v]) { g[v] = ng; came[v] = u; push(v, ng + h(b)); }
      }
    }
    return null;
  };
})();
