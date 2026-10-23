// Post-processing for Medium/High graphics, written against core three.js (the vendored r160 build has no
// EffectComposer). Pipeline per frame:
//   world  -> rtScene (HDR, depth texture, MSAA on High)
//   gun    -> rtVM    (HDR, transparent, own depth) so SSAO only sees the world
//   depth  -> rtAO    (half res, depth-plane SSAO)
//   scene  -> bright pass -> 2x separable blur (quarter res) = bloom
//   final  -> composite + AO + bloom, ADS peripheral blur, ACES, grading (campaign guilt), vignette,
//             chromatic aberration, film grain, sRGB  -> screen
// Low graphics never touches this file: the game renders straight to the canvas as before.
(function () {
  const VG = window.VG = window.VG || {};
  const PP = VG.Post = { active: false };
  let renderer = null, rtScene, rtVM, rtAO, rtBright, rtBlurA, rtBlurB, quad, cam, mats = {}, quality = 0;
  const size = new THREE.Vector2();

  const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const COMMON = `
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  `;

  // Alchemy-style AO: view-space positions from depth, normals from screen derivatives, occlusion = how much
  // nearby geometry rises above the surface's hemisphere. Flat ground stays clean; corners and contacts darken.
  const SSAO = COMMON + `
    uniform sampler2D tDepth; uniform vec2 res, projXY; uniform float cNear, cFar, focal, radius, strength;
    float lin(float d) { return cNear * cFar / (cFar - d * (cFar - cNear)); }
    vec3 vpos(vec2 uv) { float z = lin(texture2D(tDepth, uv).x); return vec3((uv * 2.0 - 1.0) * z / projXY, -z); }
    void main() {
      vec3 P = vpos(vUv);
      if (-P.z > 140.0) { gl_FragColor = vec4(1.0); return; }
      vec3 N = normalize(cross(dFdx(P), dFdy(P)));
      if (dot(N, P) > 0.0) N = -N;
      vec2 px = 1.0 / res;
      float rpx = clamp(radius * focal / -P.z, 4.0, 90.0);
      float ang = hash(gl_FragCoord.xy) * 6.2831, jit = hash(gl_FragCoord.yx + 7.0);
      float occ = 0.0, r2 = radius * radius;
      for (int i = 0; i < SAMPLES; i++) {
        float fi = float(i);
        float a = ang + fi * 2.39996;
        vec2 o = vec2(cos(a), sin(a)) * rpx * (0.15 + 0.85 * fract(fi * 0.618 + jit));
        vec3 v = vpos(vUv + o * px) - P;
        float vv = dot(v, v);
        occ += max(0.0, dot(v, N) - 0.03 - 0.004 * -P.z) / (vv + 0.08) * (1.0 - smoothstep(r2, r2 * 4.0, vv));
      }
      gl_FragColor = vec4(vec3(clamp(1.0 - strength * 0.75 * occ / float(SAMPLES), 0.0, 1.0)), 1.0);
    }`;

  const BRIGHT = COMMON + `
    uniform sampler2D tScene, tVM; uniform float threshold, exposure;
    void main() {
      vec4 v = texture2D(tVM, vUv);
      vec3 c = (texture2D(tScene, vUv).rgb * (1.0 - v.a) + v.rgb) * exposure;
      float l = max(c.r, max(c.g, c.b));
      gl_FragColor = vec4(c * max(l - threshold, 0.0) / max(l, 1e-4), 1.0);
    }`;

  const BLUR = COMMON + `
    uniform sampler2D tIn; uniform vec2 dir;
    void main() {
      vec3 c = texture2D(tIn, vUv).rgb * 0.227;
      c += (texture2D(tIn, vUv + dir * 1.385).rgb + texture2D(tIn, vUv - dir * 1.385).rgb) * 0.316;
      c += (texture2D(tIn, vUv + dir * 3.231).rgb + texture2D(tIn, vUv - dir * 3.231).rgb) * 0.070;
      gl_FragColor = vec4(c, 1.0);
    }`;

  const FINAL = COMMON + `
    uniform sampler2D tScene, tVM, tAO, tBloom; uniform vec2 res, aoTexel;
    uniform float useAO, bloomStr, exposure, time, ads, sat, sepia, contrast, bright, vig, ca, grain, aspect, debugAO;
    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float aoAt(vec2 uv) {
      if (useAO < 0.5) return 1.0;
      vec2 t = aoTexel;
      return 0.25 * (texture2D(tAO, uv + vec2(t.x, t.y)).r + texture2D(tAO, uv + vec2(-t.x, t.y)).r +
                     texture2D(tAO, uv + vec2(t.x, -t.y)).r + texture2D(tAO, uv + vec2(-t.x, -t.y)).r);
    }
    vec3 comp(vec2 uv, float ao) { vec4 v = texture2D(tVM, uv); return texture2D(tScene, uv).rgb * ao * (1.0 - v.a) + v.rgb; }
    void main() {
      vec2 uv = vUv, d = uv - 0.5;
      float ao = aoAt(uv);
      vec3 col = comp(uv, ao);
      // chromatic aberration toward the edges of the lens
      if (ca > 0.0) {
        vec2 off = d * dot(d, d) * ca;
        col.r = comp(uv + off, ao).r;
        col.b = comp(uv - off, ao).b;
      }
      // aiming down sights: the periphery smears radially, the optic stays sharp
      if (ads > 0.01) {
        vec3 b = vec3(0.0);
        for (int i = 1; i <= 5; i++) b += comp(0.5 + d * (1.0 - float(i) * 0.014), ao);
        col = mix(col, b / 5.0, smoothstep(0.22, 0.62, length(d * vec2(aspect, 1.0))) * ads * 0.7);
      }
      col += texture2D(tBloom, uv).rgb * bloomStr;
      col = aces(col * exposure);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat);
      col = mix(col, vec3(l) * vec3(1.07, 0.95, 0.78), sepia);
      col = (col - 0.5) * contrast + 0.5;
      col *= bright;
      col *= 1.0 - vig * smoothstep(0.35, 0.95, length(d * vec2(aspect, 1.0)));
      col = clamp(col, 0.0, 1.0);
      col += (hash(uv * res + fract(time) * 91.7) - 0.5) * grain;
      if (debugAO > 0.5) col = vec3(ao);
      gl_FragColor = vec4(toSRGB(clamp(col, 0.0, 1.0)), 1.0);
    }`;

  function mat(frag, uniforms, defines) {
    return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines: defines || {}, depthTest: false, depthWrite: false, toneMapped: false });
  }
  function rt(w, h, o) {
    return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), Object.assign({ type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }, o || {}));
  }

  // quality: 1 = Medium (bloom + lens, light SSAO, 2x MSAA), 2 = High (full SSAO, 4x MSAA)
  PP.init = function (r, q) {
    renderer = r;
    if (quality === q && rtScene) { PP.active = q > 0; return; }
    PP.dispose();
    quality = q; PP.active = q > 0;
    if (!PP.active) return;
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    const samples = q === 2 ? 4 : 2;
    rtScene = rt(1, 1, { depthBuffer: true, depthTexture: new THREE.DepthTexture(1, 1, THREE.FloatType), samples });
    rtVM = rt(1, 1, { depthBuffer: true, samples });
    rtAO = rt(1, 1, { type: THREE.UnsignedByteType });
    rtBright = rt(1, 1); rtBlurA = rt(1, 1); rtBlurB = rt(1, 1);
    mats.ssao = mat(SSAO, { tDepth: { value: null }, res: { value: new THREE.Vector2() }, projXY: { value: new THREE.Vector2(1, 1) }, cNear: { value: 0.05 }, cFar: { value: 900 }, focal: { value: 500 }, radius: { value: 0.7 }, strength: { value: q === 2 ? 1.6 : 1.3 } }, { SAMPLES: q === 2 ? 12 : 7 });
    mats.bright = mat(BRIGHT, { tScene: { value: null }, tVM: { value: null }, threshold: { value: 0.9 }, exposure: { value: 1.15 } });
    mats.blur = mat(BLUR, { tIn: { value: null }, dir: { value: new THREE.Vector2() } });
    mats.final = mat(FINAL, {
      tScene: { value: null }, tVM: { value: null }, tAO: { value: null }, tBloom: { value: null }, res: { value: new THREE.Vector2() }, aoTexel: { value: new THREE.Vector2() },
      useAO: { value: 1 }, debugAO: { value: 0 }, bloomStr: { value: 0.5 }, exposure: { value: 1.15 }, time: { value: 0 }, ads: { value: 0 }, aspect: { value: 1.7 },
      sat: { value: 1.04 }, sepia: { value: 0 }, contrast: { value: 1.06 }, bright: { value: 1 }, vig: { value: 0.38 }, ca: { value: 0.012 }, grain: { value: 0.035 },
    });
    PP.u = mats.final.uniforms;
    PP.resize();
  };
  PP.dispose = function () {
    for (const t of [rtScene, rtVM, rtAO, rtBright, rtBlurA, rtBlurB]) if (t) { if (t.depthTexture) t.depthTexture.dispose(); t.dispose(); }
    for (const k in mats) mats[k].dispose();
    rtScene = rtVM = null; mats = {}; PP.active = false; quality = -1;
  };
  PP.resize = function () {
    if (!PP.active) return;
    renderer.getDrawingBufferSize(size);
    const w = size.x, h = size.y;
    rtScene.setSize(w, h); rtVM.setSize(w, h);
    rtAO.setSize(w >> 1, h >> 1); rtBright.setSize(w >> 1, h >> 1); rtBlurA.setSize(w >> 2, h >> 2); rtBlurB.setSize(w >> 2, h >> 2);
    mats.ssao.uniforms.res.value.set(w, h);
    mats.final.uniforms.res.value.set(w, h);
    mats.final.uniforms.aoTexel.value.set(1 / (w >> 1), 1 / (h >> 1));
    mats.final.uniforms.aspect.value = w / h;
  };

  function pass(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(quad, cam);
  }

  // drop-in replacement for the two renderer.render calls in the frame loop
  const clearCol = new THREE.Color(), emptyScene = new THREE.Scene();
  PP.render = function (scene, camera, vmScene, vmCamera, showVM, opts) {
    renderer.getDrawingBufferSize(size);
    if (size.x !== rtScene.width || size.y !== rtScene.height) PP.resize();
    const u = mats.final.uniforms;
    renderer.autoClear = true;
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);
    // viewmodel into its own transparent target
    renderer.setRenderTarget(rtVM);
    const cc = renderer.getClearColor(clearCol), ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
    // a multisampled target only resolves into its texture on render(), so an empty scene is drawn
    // when the gun is hidden (scoped); otherwise the last gun frame would stay on screen
    renderer.render(showVM ? vmScene : emptyScene, vmCamera);
    renderer.setClearColor(cc, ca);
    // SSAO
    const useAO = opts.ao !== false;
    u.useAO.value = useAO ? 1 : 0;
    if (useAO) {
      const s = mats.ssao.uniforms;
      s.tDepth.value = rtScene.depthTexture; s.cNear.value = camera.near; s.cFar.value = camera.far;
      s.focal.value = size.y / (2 * Math.tan(camera.fov * Math.PI / 360));
      s.projXY.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
      pass(mats.ssao, rtAO);
    }
    // bloom
    mats.bright.uniforms.tScene.value = rtScene.texture; mats.bright.uniforms.tVM.value = rtVM.texture;
    mats.bright.uniforms.exposure.value = u.exposure.value;
    pass(mats.bright, rtBright);
    const bl = mats.blur.uniforms;
    bl.tIn.value = rtBright.texture; bl.dir.value.set(1 / rtBlurA.width, 0); pass(mats.blur, rtBlurA);
    bl.tIn.value = rtBlurA.texture; bl.dir.value.set(0, 1 / rtBlurA.height); pass(mats.blur, rtBlurB);
    bl.tIn.value = rtBlurB.texture; bl.dir.value.set(2 / rtBlurA.width, 0); pass(mats.blur, rtBlurA);
    bl.tIn.value = rtBlurA.texture; bl.dir.value.set(0, 2 / rtBlurA.height); pass(mats.blur, rtBlurB);
    // final
    u.tScene.value = rtScene.texture; u.tVM.value = rtVM.texture; u.tAO.value = rtAO.texture; u.tBloom.value = rtBlurB.texture;
    u.time.value = performance.now() / 1000;
    u.ads.value = opts.ads || 0;
    pass(mats.final, null);
  };

  // ---------- image-based lighting: a procedural sky baked into a PMREM environment map ----------
  const envCache = {};
  // o: { zenith, horizon, ground, sun: [x, y, z], sunColor, sunPower }
  PP.makeEnv = function (r, o, key) {
    if (envCache[key]) return envCache[key];
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        zen: { value: new THREE.Color(o.zenith) }, hor: { value: new THREE.Color(o.horizon) }, gnd: { value: new THREE.Color(o.ground) },
        sunDir: { value: new THREE.Vector3().fromArray(o.sun || [0.4, 0.6, 0.3]).normalize() }, sunCol: { value: new THREE.Color(o.sunColor || 0xffffff) }, sunPow: { value: o.sunPower || 0 },
      },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 zen, hor, gnd, sunDir, sunCol; uniform float sunPow; varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 c = y > 0.0 ? mix(hor, zen, pow(y, 0.6)) : mix(hor, gnd, pow(-y, 0.4));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          c += sunCol * (pow(s, 600.0) * sunPow + pow(s, 8.0) * sunPow * 0.02);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    const sc = new THREE.Scene(); sc.add(sky);
    const pm = new THREE.PMREMGenerator(r);
    const tex = pm.fromScene(sc, 0, 0.1, 100).texture;
    pm.dispose(); sky.geometry.dispose(); sky.material.dispose();
    return (envCache[key] = tex);
  };
})();
