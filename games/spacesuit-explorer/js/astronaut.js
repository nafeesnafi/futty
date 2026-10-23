// Layered SVG astronaut and equipment icons.
(function () {
  const SSE = window.SSE = window.SSE || {};

  const SUIT_LOOK = {
    'eva-suit': { main: '#f4f6fb', shade: '#cfd6e4', trim: '#d8343a', w: 26 },
    'lunar-suit': { main: '#f1f3f7', shade: '#c9d0de', trim: '#2e6bff', w: 26, accent: '#ff7a1a' },
    'launch-suit': { main: '#ff7a1a', shade: '#d9600c', trim: '#2f3542', w: 22 },
    'mars-suit': { main: '#f3e7dc', shade: '#d7c3b1', trim: '#d9482b', w: 26 },
    'station-clothes': { main: '#5b3fd1', shade: '#4630a8', trim: '#ffffff', w: 18, pants: '#6f6650' }
  };
  const BASE = { main: '#9fb3d9', shade: '#7f93bb', trim: '#9fb3d9', w: 16 };

  // Arm and leg centre lines (left/right mirrored around x=100).
  const ARM_L = 'M70 104 Q50 132 48 180', ARM_R = 'M130 104 Q150 132 152 180';
  const LEG_L = 'M88 176 Q84 222 80 266', LEG_R = 'M112 176 Q116 222 120 266';

  const REGIONS = {
    suit: [100, 140, 52], helmet: [100, 60, 42], comms: [100, 42, 26], gloves: [[48, 188, 15], [152, 188, 15]],
    boots: [[79, 276, 18], [121, 276, 18]], backpack: [100, 132, 30], tether: [172, 168, 18],
    tool: [164, 204, 18], protect: [100, 206, 20]
  };

  function limb(d, color, w) { return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`; }

  function hair(av) {
    const h = av.hair;
    switch (av.hairStyle) {
      case 'bun': return `<circle cx="100" cy="28" r="11" fill="${h}"/><path d="M70 60 Q70 30 100 30 Q130 30 130 60 Q122 42 100 42 Q78 42 70 60Z" fill="${h}"/>`;
      case 'long': return `<path d="M68 92 Q64 34 100 30 Q136 34 132 92 L124 92 Q126 48 100 44 Q74 48 76 92Z" fill="${h}"/>`;
      case 'curly': return `<g fill="${h}"><circle cx="76" cy="46" r="10"/><circle cx="88" cy="36" r="11"/><circle cx="102" cy="33" r="11"/><circle cx="116" cy="37" r="11"/><circle cx="126" cy="48" r="9"/></g>`;
      default: return `<path d="M70 58 Q70 30 100 30 Q130 30 130 58 Q124 44 100 43 Q80 43 70 58Z" fill="${h}"/>`;
    }
  }

  function face(av, mood) {
    const mouth = mood === 'happy' ? '<path d="M90 72 Q100 82 110 72" fill="none" stroke="#3a2418" stroke-width="2.6" stroke-linecap="round"/>'
      : mood === 'worried' ? '<path d="M91 76 Q100 70 109 76" fill="none" stroke="#3a2418" stroke-width="2.6" stroke-linecap="round"/>'
        : '<path d="M92 74 Q100 78 108 74" fill="none" stroke="#3a2418" stroke-width="2.6" stroke-linecap="round"/>';
    return `<rect x="92" y="84" width="16" height="14" fill="${av.skin}"/>
      <circle cx="100" cy="62" r="29" fill="${av.skin}"/>
      ${hair(av)}
      <circle cx="90" cy="61" r="3.4" fill="#2a1a12"/><circle cx="110" cy="61" r="3.4" fill="#2a1a12"/>
      <circle cx="91" cy="60" r="1" fill="#fff"/><circle cx="111" cy="60" r="1" fill="#fff"/>
      <circle cx="84" cy="70" r="4" fill="#ff8a8a" opacity=".35"/><circle cx="116" cy="70" r="4" fill="#ff8a8a" opacity=".35"/>
      ${mouth}`;
  }

  function body(suitId) {
    const L = SUIT_LOOK[suitId] || BASE;
    const pants = L.pants || L.main;
    const pressure = suitId && suitId !== 'station-clothes';
    let s = '';
    // Legs
    s += limb(LEG_L, L.shade, L.w + 4) + limb(LEG_R, L.shade, L.w + 4);
    s += limb(LEG_L, pants, L.w) + limb(LEG_R, pants, L.w);
    // Torso
    s += `<path d="M66 100 Q100 90 134 100 L130 182 Q100 190 70 182Z" fill="${L.main}" stroke="${L.shade}" stroke-width="3"/>`;
    // Arms
    s += limb(ARM_L, L.shade, L.w + 3) + limb(ARM_R, L.shade, L.w + 3);
    s += limb(ARM_L, L.main, L.w - 1) + limb(ARM_R, L.main, L.w - 1);
    if (pressure) {
      // Joint rings and trim stripes
      s += `<g fill="none" stroke="${L.shade}" stroke-width="2.5"><path d="M42 146 h16"/><path d="M142 146 h16"/><path d="M72 222 h22"/><path d="M106 222 h22"/></g>`;
      s += `<path d="M66 100 Q100 90 134 100 L134 108 Q100 98 66 108Z" fill="${L.trim}"/>`;
      s += `<g fill="${L.trim}"><rect x="${80 - L.w / 2 + 2}" y="236" width="${L.w - 4}" height="5" rx="2"/><rect x="${120 - L.w / 2 + 2}" y="236" width="${L.w - 4}" height="5" rx="2"/></g>`;
      if (suitId === 'eva-suit') s += '<rect x="84" y="118" width="32" height="20" rx="4" fill="#bfc8d8" stroke="#8792a8"/><g fill="#41d07a"><circle cx="92" cy="128" r="2.5"/></g><g fill="#ffcc4d"><circle cx="100" cy="128" r="2.5"/></g><g fill="#2fd3c4"><circle cx="108" cy="128" r="2.5"/></g>';
      if (suitId === 'lunar-suit') s += `<rect x="84" y="118" width="32" height="18" rx="4" fill="${L.accent}"/><text x="100" y="131" font-size="9" text-anchor="middle" fill="#fff" font-weight="800">MOON</text>`;
      if (suitId === 'launch-suit') s += '<path d="M100 98 V182" stroke="#2f3542" stroke-width="3" stroke-dasharray="4 3"/><rect x="74" y="140" width="12" height="9" rx="2" fill="#2f3542"/>';
      if (suitId === 'mars-suit') s += `<rect x="82" y="116" width="36" height="20" rx="6" fill="${L.trim}"/><text x="100" y="130" font-size="8" text-anchor="middle" fill="#fff" font-weight="800">CONCEPT</text>`;
    } else if (suitId === 'station-clothes') {
      s += '<path d="M90 98 L100 112 L110 98" fill="none" stroke="#fff" stroke-width="3"/><rect x="74" y="200" width="12" height="14" rx="2" fill="#5d5543"/><rect x="114" y="200" width="12" height="14" rx="2" fill="#5d5543"/>';
      s += '<circle cx="118" cy="118" r="6" fill="#ffcc4d"/>';
    }
    return s;
  }

  function hands(av, gloves) {
    const G = { 'eva-gloves': ['#f4f6fb', '#8792a8'], 'launch-gloves': ['#2f3542', '#111'], 'mars-gloves': ['#c4562d', '#7d3118'], mittens: ['#e94b6c', '#b02b4a'] }[gloves];
    if (!G) return `<circle cx="48" cy="186" r="8" fill="${av.skin}"/><circle cx="152" cy="186" r="8" fill="${av.skin}"/>`;
    if (gloves === 'mittens') return `<g fill="${G[0]}" stroke="${G[1]}" stroke-width="2"><ellipse cx="48" cy="190" rx="11" ry="13"/><ellipse cx="152" cy="190" rx="11" ry="13"/></g><g fill="#fff"><rect x="38" y="176" width="20" height="5" rx="2"/><rect x="142" y="176" width="20" height="5" rx="2"/></g>`;
    return `<g fill="${G[0]}" stroke="${G[1]}" stroke-width="2"><rect x="37" y="176" width="22" height="9" rx="3"/><rect x="141" y="176" width="22" height="9" rx="3"/><rect x="39" y="183" width="18" height="17" rx="7"/><rect x="143" y="183" width="18" height="17" rx="7"/></g>`
      + (gloves === 'eva-gloves' ? '<g fill="#ffcc4d"><rect x="41" y="196" width="14" height="4" rx="2"/><rect x="145" y="196" width="14" height="4" rx="2"/></g>' : '');
  }

  function feet(boots) {
    const B = { 'eva-boots': ['#e6eaf2', '#8792a8'], 'moon-boots': ['#dfe3ea', '#55606e'], 'launch-boots': ['#2f3542', '#111'], 'mars-boots': ['#8a4a2a', '#4e2814'], 'rain-boots': ['#ffd23f', '#c79a00'], 'station-socks': ['#ffffff', '#9aa6c0'] }[boots];
    if (!B) return '<g fill="#e8eef9" stroke="#9aa6c0" stroke-width="2"><ellipse cx="79" cy="272" rx="11" ry="7"/><ellipse cx="121" cy="272" rx="11" ry="7"/></g>';
    if (boots === 'station-socks') return `<g fill="${B[0]}" stroke="${B[1]}" stroke-width="2"><ellipse cx="78" cy="272" rx="12" ry="7"/><ellipse cx="122" cy="272" rx="12" ry="7"/></g><g fill="#7c5cff"><rect x="70" y="266" width="16" height="3"/><rect x="114" y="266" width="16" height="3"/></g>`;
    let s = `<g fill="${B[0]}" stroke="${B[1]}" stroke-width="2.5"><path d="M64 258 h30 v14 q0 10 -10 10 h-24 q-6 0 -6 -6 q0 -8 10 -8Z"/><path d="M136 258 h-30 v14 q0 10 10 10 h24 q6 0 6 -6 q0 -8 -10 -8Z"/></g>`;
    s += `<g fill="${B[1]}"><rect x="52" y="279" width="42" height="5" rx="2"/><rect x="106" y="279" width="42" height="5" rx="2"/></g>`;
    if (boots === 'rain-boots') s += '<g fill="#ffd23f" stroke="#c79a00" stroke-width="2"><rect x="68" y="234" width="24" height="28" rx="3"/><rect x="108" y="234" width="24" height="28" rx="3"/></g>';
    return s;
  }

  function backpack(id, protect) {
    let s = '';
    if (id === 'pls') {
      s += '<rect x="56" y="88" width="88" height="100" rx="12" fill="#e9edf5" stroke="#a7b1c4" stroke-width="3"/><rect x="62" y="84" width="76" height="10" rx="4" fill="#cfd6e4"/>';
    } else if (id === 'scuba') {
      s += '<rect x="122" y="70" width="22" height="104" rx="11" fill="#ffcc00" stroke="#b38f00" stroke-width="3"/><rect x="128" y="62" width="10" height="10" fill="#666"/>';
    }
    if (protect === 'safer') {
      s += '<rect x="58" y="184" width="84" height="18" rx="6" fill="#c9d1e0" stroke="#8792a8" stroke-width="2.5"/><g fill="#8792a8"><rect x="52" y="188" width="8" height="10" rx="2"/><rect x="140" y="188" width="8" height="10" rx="2"/></g>';
    }
    return s;
  }

  function hose(id) {
    if (id !== 'suit-hose') return '';
    return '<path d="M76 160 Q44 210 26 236" fill="none" stroke="#3a7bd5" stroke-width="7" stroke-linecap="round"/><path d="M76 160 Q44 210 26 236" fill="none" stroke="#9cc3ff" stroke-width="2" stroke-dasharray="4 5"/><rect x="70" y="152" width="14" height="14" rx="3" fill="#2f3542"/>';
  }

  function comms(id) {
    if (id === 'comm-cap') return '<path d="M70 62 Q70 30 100 30 Q130 30 130 62 L126 62 Q124 38 100 38 Q76 38 74 62Z" fill="#6b4a2f"/><path d="M76 36 Q100 26 124 36" stroke="#fff" stroke-width="5" fill="none"/><g fill="#2e2e2e"><rect x="64" y="56" width="10" height="16" rx="4"/><rect x="126" y="56" width="10" height="16" rx="4"/></g><path d="M70 72 Q74 82 86 80" stroke="#2e2e2e" stroke-width="2.5" fill="none"/>';
    if (id === 'headset') return '<path d="M70 60 Q70 30 100 30 Q130 30 130 60" fill="none" stroke="#2e2e2e" stroke-width="4"/><g fill="#7c5cff"><rect x="64" y="54" width="10" height="16" rx="4"/><rect x="126" y="54" width="10" height="16" rx="4"/></g><path d="M70 70 Q72 82 88 80" stroke="#2e2e2e" stroke-width="2.5" fill="none"/><circle cx="89" cy="80" r="2.5" fill="#2e2e2e"/>';
    return '';
  }

  function helmet(id) {
    switch (id) {
      case 'eva-helmet': return '<circle cx="100" cy="60" r="40" fill="#cfe9ff" fill-opacity=".22" stroke="#e9edf5" stroke-width="5"/><path d="M64 52 Q100 14 136 52 Q118 40 100 40 Q82 40 64 52Z" fill="#f2b632" opacity=".75"/><g fill="#fff8c2" stroke="#a7b1c4"><rect x="56" y="38" width="10" height="12" rx="3"/><rect x="134" y="38" width="10" height="12" rx="3"/></g><path d="M80 34 Q90 28 98 28" stroke="#fff" stroke-width="3" fill="none" opacity=".8"/>';
      case 'lunar-helmet': return '<circle cx="100" cy="60" r="40" fill="#cfe9ff" fill-opacity=".2" stroke="#e9edf5" stroke-width="5"/><path d="M66 50 Q100 18 134 50 Q118 42 100 42 Q82 42 66 50Z" fill="#c6a15b" opacity=".6"/><g fill="#fff36b" stroke="#2e6bff" stroke-width="2"><circle cx="66" cy="34" r="6"/><circle cx="134" cy="34" r="6"/></g><path d="M80 34 Q90 28 98 28" stroke="#fff" stroke-width="3" fill="none" opacity=".8"/>';
      case 'launch-helmet': return '<path d="M60 64 Q60 18 100 18 Q140 18 140 64 L140 96 L60 96Z" fill="#f5f7fb" stroke="#2f3542" stroke-width="3"/><path d="M70 44 Q100 30 130 44 L130 86 Q100 96 70 86Z" fill="#cfe9ff" fill-opacity=".35" stroke="#2f3542" stroke-width="2"/><rect x="60" y="62" width="8" height="18" fill="#2f3542"/><rect x="132" y="62" width="8" height="18" fill="#2f3542"/>';
      case 'mars-helmet': return '<ellipse cx="100" cy="60" rx="44" ry="41" fill="#ffe0c7" fill-opacity=".18" stroke="#f3e7dc" stroke-width="5"/><path d="M58 70 Q100 104 142 70" stroke="#d9482b" stroke-width="5" fill="none"/><path d="M80 32 Q92 26 104 26" stroke="#fff" stroke-width="3" fill="none" opacity=".8"/>';
      case 'bike-helmet': return '<path d="M66 50 Q66 18 100 18 Q134 18 134 50 Z" fill="#2fd3c4" stroke="#178f84" stroke-width="3"/><g fill="#178f84"><rect x="84" y="24" width="6" height="18" rx="3"/><rect x="98" y="22" width="6" height="20" rx="3"/><rect x="112" y="24" width="6" height="18" rx="3"/></g><path d="M70 50 L80 82 M130 50 L120 82" stroke="#333" stroke-width="2"/>';
      default: return '';
    }
  }

  function front(outfit) {
    let s = '';
    if (outfit.protect === 'seat-harness') s += '<g stroke="#2f3542" stroke-width="7" stroke-linecap="round"><path d="M76 98 L96 160"/><path d="M124 98 L104 160"/><path d="M72 168 Q100 176 128 168"/></g><circle cx="100" cy="164" r="8" fill="#c0c6d2" stroke="#2f3542" stroke-width="2"/>';
    if (outfit.protect === 'dust-kit') s += '<rect x="128" y="160" width="20" height="24" rx="4" fill="#9aa6c0" stroke="#55606e" stroke-width="2"/><rect x="134" y="146" width="8" height="18" rx="2" fill="#8a5a33"/><path d="M130 184 l16 0" stroke="#55606e" stroke-width="3"/>';
    if (outfit.protect === 'mars-shield') s += '<g fill="#d9482b" opacity=".85"><path d="M64 98 Q58 112 62 126 L76 116 L80 98Z"/><path d="M136 98 Q142 112 138 126 L124 116 L120 98Z"/></g><rect x="70" y="172" width="60" height="8" rx="3" fill="#d9482b" opacity=".85"/>';
    if (outfit.tool === 'cuff-checklist') s += '<rect x="34" y="150" width="22" height="16" rx="2" fill="#fff" stroke="#55606e" stroke-width="2" transform="rotate(-10 45 158)"/><path d="M38 156 h14 M38 160 h10" stroke="#7c5cff" stroke-width="2" transform="rotate(-10 45 158)"/>';
    return s;
  }

  function tool(id) {
    switch (id) {
      case 'power-tool': return '<g transform="translate(150 186)"><rect x="0" y="-8" width="30" height="14" rx="4" fill="#3a3f4b"/><rect x="6" y="4" width="10" height="20" rx="3" fill="#ffcc4d"/><rect x="28" y="-4" width="12" height="5" fill="#c0c6d2"/></g>';
      case 'sample-kit': return '<g transform="translate(150 182)"><path d="M4 0 L30 30" stroke="#c0c6d2" stroke-width="4" stroke-linecap="round"/><path d="M10 0 L34 26" stroke="#c0c6d2" stroke-width="4" stroke-linecap="round"/><rect x="20" y="26" width="18" height="14" rx="3" fill="#fff" stroke="#8792a8" stroke-width="2"/></g>';
      case 'science-kit': return '<g transform="translate(146 176)"><rect x="0" y="0" width="28" height="22" rx="4" fill="#2f3542"/><rect x="3" y="3" width="22" height="16" rx="2" fill="#2fd3c4"/><path d="M6 14 l5 -5 l4 3 l6 -6" stroke="#fff" stroke-width="2" fill="none"/></g>';
      case 'mars-drill': return '<g transform="translate(150 182)"><rect x="0" y="-6" width="24" height="16" rx="4" fill="#d9482b"/><path d="M24 2 L44 2" stroke="#c0c6d2" stroke-width="5"/><path d="M28 0 l4 4 l4 -4 l4 4" stroke="#8792a8" stroke-width="2" fill="none"/><circle cx="8" cy="2" r="3" fill="#41d07a"/></g>';
      default: return '';
    }
  }

  function tether(id) {
    if (id !== 'safety-tether') return '';
    return '<path d="M128 170 Q168 150 170 186 Q172 214 190 214" fill="none" stroke="#ffcc4d" stroke-width="3.5" stroke-dasharray="1 0"/><path d="M186 206 q10 0 10 10 q0 8 -8 8" fill="none" stroke="#8792a8" stroke-width="4"/><circle cx="128" cy="170" r="5" fill="#8792a8"/>';
  }

  function goggles(on) {
    if (!on) return '';
    return '<g><rect x="78" y="52" width="20" height="16" rx="6" fill="#bfefff" fill-opacity=".7" stroke="#2f3542" stroke-width="2.5"/><rect x="102" y="52" width="20" height="16" rx="6" fill="#bfefff" fill-opacity=".7" stroke="#2f3542" stroke-width="2.5"/><path d="M98 60 h4 M72 58 h6 M122 58 h6" stroke="#2f3542" stroke-width="2.5"/></g>';
  }

  // outfit: { slot: itemId }. opts: { mood, highlight: [slotIds], pop: slotId, title }
  SSE.drawAstronaut = function (avatar, outfit, opts) {
    opts = opts || {};
    const hl = opts.highlight || [];
    const g = (slot, inner) => inner ? `<g class="layer layer-${slot}${opts.pop === slot ? ' pop' : ''}">${inner}</g>` : '';
    let marks = '';
    for (const slot of hl) {
      const r = REGIONS[slot];
      const list = Array.isArray(r[0]) ? r : [r];
      for (const [x, y, rad] of list) marks += `<circle class="problem-ring" cx="${x}" cy="${y}" r="${rad}"/>`;
    }
    const label = opts.title || `${avatar.name} the astronaut`;
    return `<svg class="astro-svg" viewBox="0 0 200 300" role="img" aria-label="${label}">
      <ellipse cx="100" cy="290" rx="62" ry="7" fill="#000" opacity=".25"/>
      ${g('backpack', backpack(outfit.backpack, outfit.protect))}
      ${g('suit', body(outfit.suit))}
      ${g('backpack-front', hose(outfit.backpack))}
      ${g('boots', feet(outfit.boots))}
      ${g('gloves', hands(avatar, outfit.gloves))}
      ${g('protect', front(outfit))}
      ${g('tool', tool(outfit.tool))}
      ${g('tether', tether(outfit.tether))}
      <g class="layer-head">${face(avatar, opts.mood)}</g>
      ${g('comms', comms(outfit.comms))}
      ${g('goggles', goggles(outfit.protect === 'goggles'))}
      ${g('helmet', helmet(outfit.helmet))}
      ${marks}
    </svg>`;
  };

  // Small card icons (64x64).
  SSE.itemIcon = function (id) {
    const item = SSE.item(id);
    let inner = '';
    const S = SUIT_LOOK[id];
    if (item.slot === 'suit') {
      inner = `<path d="M18 16 Q32 11 46 16 L44 44 Q32 47 20 44Z" fill="${S.main}" stroke="${S.shade}" stroke-width="2"/>
        <path d="M18 16 L8 38" stroke="${S.main}" stroke-width="8" stroke-linecap="round"/><path d="M46 16 L56 38" stroke="${S.main}" stroke-width="8" stroke-linecap="round"/>
        <path d="M25 44 L24 58 M39 44 L40 58" stroke="${S.pants || S.main}" stroke-width="9" stroke-linecap="round"/>
        <rect x="18" y="16" width="28" height="4" fill="${S.trim}"/>`;
    } else {
      const big = (svgStr, tx, ty, sc) => `<g transform="translate(${tx} ${ty}) scale(${sc})">${svgStr}</g>`;
      const avatar = { skin: '#f2c9a0', hair: '#5a3418', hairStyle: 'short' };
      switch (item.slot) {
        case 'helmet': inner = big(helmet(id), -36, -10, .68); break;
        case 'comms': inner = big(`<circle cx="100" cy="62" r="29" fill="#f2c9a0"/>${comms(id)}`, -45, -10, .75); break;
        case 'gloves': inner = big(hands(avatar, id), -5, -150, .9) + big(hands(avatar, id), -105, -150, .9); break;
        case 'boots': inner = big(feet(id), -46, -222, .8); break;
        case 'backpack':
          if (id === 'pls') inner = '<rect x="14" y="8" width="36" height="48" rx="7" fill="#e9edf5" stroke="#a7b1c4" stroke-width="3"/><rect x="20" y="16" width="24" height="10" rx="2" fill="#2fd3c4"/><circle cx="32" cy="40" r="6" fill="#7c5cff"/>';
          else if (id === 'scuba') inner = '<rect x="22" y="12" width="20" height="46" rx="10" fill="#ffcc00" stroke="#b38f00" stroke-width="3"/><rect x="28" y="4" width="8" height="9" fill="#666"/>';
          else inner = '<path d="M10 52 Q20 10 52 14" fill="none" stroke="#3a7bd5" stroke-width="8" stroke-linecap="round"/><rect x="46" y="6" width="14" height="14" rx="3" fill="#2f3542"/>';
          break;
        case 'tether': inner = '<path d="M8 50 Q20 10 36 30 Q50 48 54 18" fill="none" stroke="#ffcc4d" stroke-width="4"/><path d="M48 14 q8 -6 12 2 q2 8 -6 10" fill="none" stroke="#8792a8" stroke-width="4"/>'; break;
        case 'tool':
          if (id === 'cuff-checklist') inner = '<rect x="14" y="12" width="36" height="40" rx="3" fill="#fff" stroke="#55606e" stroke-width="2.5"/><path d="M20 22 h24 M20 30 h20 M20 38 h24 M20 46 h14" stroke="#7c5cff" stroke-width="3"/>';
          else inner = big(tool(id), -136, -170, 1);
          break;
        case 'protect':
          if (id === 'safer') inner = '<rect x="8" y="22" width="48" height="20" rx="6" fill="#c9d1e0" stroke="#8792a8" stroke-width="2.5"/><g fill="#8792a8"><rect x="2" y="26" width="8" height="12" rx="2"/><rect x="54" y="26" width="8" height="12" rx="2"/></g><path d="M2 44 l-2 8 M62 44 l2 8" stroke="#ff9e3d" stroke-width="3"/>';
          else if (id === 'goggles') inner = big(goggles(true), -64, -26, .9);
          else if (id === 'seat-harness') inner = '<g stroke="#2f3542" stroke-width="6" stroke-linecap="round"><path d="M16 6 L30 40"/><path d="M48 6 L34 40"/><path d="M10 48 Q32 56 54 48"/></g><circle cx="32" cy="44" r="7" fill="#c0c6d2" stroke="#2f3542" stroke-width="2"/>';
          else if (id === 'dust-kit') inner = '<rect x="18" y="26" width="28" height="30" rx="5" fill="#9aa6c0" stroke="#55606e" stroke-width="2.5"/><rect x="27" y="6" width="10" height="24" rx="2" fill="#8a5a33"/><path d="M20 56 h24" stroke="#55606e" stroke-width="3"/>';
          else inner = '<path d="M10 14 Q4 32 10 48 L28 36 L30 14Z" fill="#d9482b"/><path d="M54 14 Q60 32 54 48 L36 36 L34 14Z" fill="#d9482b"/>';
          break;
      }
    }
    return `<svg viewBox="0 0 64 64" aria-hidden="true" class="item-icon">${inner}</svg>`;
  };
})();
