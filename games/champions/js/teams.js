// Club list: the 36 clubs of the 2025/26 Champions League league phase.
// Kits are simplified colour patterns (no crests); ratings are rough overall strengths (70-90).
var FC = window.FC = window.FC || {};

(() => {
  // pattern: solid | stripes | hoops | halves | sash | band | sleeves
  const K = (shirt, shirt2, pattern, shorts, socks) => ({ shirt, shirt2, pattern, shorts, socks: socks || shorts });

  FC.TEAMS = [
    { name: 'Real Madrid',         short: 'RMA', country: 'ESP', rating: 88, kit: K('#f5f5f5', '#d4af37', 'solid',   '#f5f5f5'),            alt: K('#1b1f3b', '#d4af37', 'solid', '#1b1f3b') },
    { name: 'Barcelona',           short: 'BAR', country: 'ESP', rating: 87, kit: K('#a50044', '#004d98', 'stripes', '#004d98'),            alt: K('#f2d21b', '#a50044', 'solid', '#f2d21b') },
    { name: 'Atlético Madrid',     short: 'ATM', country: 'ESP', rating: 84, kit: K('#cb3524', '#f5f5f5', 'stripes', '#1c2c5b'),            alt: K('#1c2c5b', '#cb3524', 'solid', '#1c2c5b') },
    { name: 'Athletic Club',       short: 'ATH', country: 'ESP', rating: 80, kit: K('#ee2523', '#f5f5f5', 'stripes', '#111111'),            alt: K('#2b2b2b', '#ee2523', 'solid', '#2b2b2b') },
    { name: 'Villarreal',          short: 'VIL', country: 'ESP', rating: 80, kit: K('#ffe667', '#005187', 'solid',   '#ffe667'),            alt: K('#005187', '#ffe667', 'solid', '#005187') },
    { name: 'Arsenal',             short: 'ARS', country: 'ENG', rating: 87, kit: K('#ef0107', '#f5f5f5', 'sleeves', '#f5f5f5', '#ef0107'), alt: K('#0d2a4f', '#ef0107', 'solid', '#0d2a4f') },
    { name: 'Liverpool',           short: 'LIV', country: 'ENG', rating: 87, kit: K('#c8102e', '#f6eb61', 'solid',   '#c8102e'),            alt: K('#f2f2f2', '#c8102e', 'solid', '#f2f2f2') },
    { name: 'Manchester City',     short: 'MCI', country: 'ENG', rating: 87, kit: K('#6cabdd', '#1c2c5b', 'solid',   '#f5f5f5', '#6cabdd'), alt: K('#1c2c5b', '#6cabdd', 'solid', '#1c2c5b') },
    { name: 'Chelsea',             short: 'CHE', country: 'ENG', rating: 84, kit: K('#034694', '#f5f5f5', 'solid',   '#034694', '#f5f5f5'), alt: K('#f2f2f2', '#034694', 'solid', '#f2f2f2') },
    { name: 'Tottenham Hotspur',   short: 'TOT', country: 'ENG', rating: 81, kit: K('#f5f5f5', '#132257', 'solid',   '#132257', '#f5f5f5'), alt: K('#132257', '#f5f5f5', 'solid', '#132257') },
    { name: 'Newcastle United',    short: 'NEW', country: 'ENG', rating: 82, kit: K('#111111', '#f5f5f5', 'stripes', '#111111'),            alt: K('#6cc5c8', '#111111', 'solid', '#6cc5c8') },
    { name: 'Bayern München',      short: 'BAY', country: 'GER', rating: 87, kit: K('#dc052d', '#f5f5f5', 'solid',   '#dc052d'),            alt: K('#f2f2f2', '#dc052d', 'solid', '#f2f2f2') },
    { name: 'Borussia Dortmund',   short: 'BVB', country: 'GER', rating: 83, kit: K('#fde100', '#111111', 'solid',   '#111111', '#fde100'), alt: K('#111111', '#fde100', 'solid', '#111111') },
    { name: 'Bayer Leverkusen',    short: 'B04', country: 'GER', rating: 82, kit: K('#e32221', '#111111', 'band',    '#111111'),            alt: K('#f2f2f2', '#e32221', 'solid', '#f2f2f2') },
    { name: 'Eintracht Frankfurt', short: 'SGE', country: 'GER', rating: 79, kit: K('#1a1a1a', '#e1000f', 'band',    '#1a1a1a'),            alt: K('#f2f2f2', '#e1000f', 'solid', '#f2f2f2') },
    { name: 'Inter',               short: 'INT', country: 'ITA', rating: 86, kit: K('#0068a8', '#111111', 'stripes', '#111111'),            alt: K('#f2f2f2', '#0068a8', 'solid', '#f2f2f2') },
    { name: 'Napoli',              short: 'NAP', country: 'ITA', rating: 84, kit: K('#12a0d7', '#f5f5f5', 'solid',   '#f5f5f5', '#12a0d7'), alt: K('#f2f2f2', '#12a0d7', 'solid', '#12a0d7') },
    { name: 'Juventus',            short: 'JUV', country: 'ITA', rating: 83, kit: K('#111111', '#f5f5f5', 'stripes', '#f5f5f5', '#111111'), alt: K('#e9c46a', '#111111', 'solid', '#111111') },
    { name: 'Atalanta',            short: 'ATA', country: 'ITA', rating: 81, kit: K('#1e71b8', '#111111', 'stripes', '#111111'),            alt: K('#f2f2f2', '#1e71b8', 'solid', '#f2f2f2') },
    { name: 'Paris Saint-Germain', short: 'PSG', country: 'FRA', rating: 88, kit: K('#004170', '#da291c', 'band',    '#004170'),            alt: K('#f2f2f2', '#004170', 'band', '#f2f2f2') },
    { name: 'Marseille',           short: 'OM',  country: 'FRA', rating: 79, kit: K('#f5f5f5', '#2faee0', 'solid',   '#f5f5f5'),            alt: K('#2faee0', '#f5f5f5', 'solid', '#2faee0') },
    { name: 'Monaco',              short: 'ASM', country: 'FRA', rating: 79, kit: K('#e51b22', '#f5f5f5', 'sash',    '#f5f5f5'),            alt: K('#111111', '#e51b22', 'solid', '#111111') },
    { name: 'PSV',                 short: 'PSV', country: 'NED', rating: 79, kit: K('#ed1c24', '#f5f5f5', 'stripes', '#111111'),            alt: K('#111111', '#ed1c24', 'solid', '#111111') },
    { name: 'Ajax',                short: 'AJA', country: 'NED', rating: 78, kit: K('#f5f5f5', '#d2122e', 'band',    '#f5f5f5'),            alt: K('#1d2b4c', '#d2122e', 'solid', '#1d2b4c') },
    { name: 'Benfica',             short: 'SLB', country: 'POR', rating: 81, kit: K('#e30613', '#f5f5f5', 'solid',   '#f5f5f5', '#e30613'), alt: K('#111111', '#e30613', 'solid', '#111111') },
    { name: 'Sporting CP',         short: 'SCP', country: 'POR', rating: 80, kit: K('#008057', '#f5f5f5', 'hoops',   '#111111', '#008057'), alt: K('#111111', '#008057', 'solid', '#111111') },
    { name: 'Club Brugge',         short: 'BRU', country: 'BEL', rating: 77, kit: K('#0067b3', '#111111', 'stripes', '#111111'),            alt: K('#f2f2f2', '#0067b3', 'solid', '#f2f2f2') },
    { name: 'Union Saint-Gilloise',short: 'USG', country: 'BEL', rating: 75, kit: K('#ffd400', '#003a8c', 'halves',  '#003a8c'),            alt: K('#003a8c', '#ffd400', 'solid', '#003a8c') },
    { name: 'Galatasaray',         short: 'GAL', country: 'TUR', rating: 80, kit: K('#a90432', '#fdb912', 'halves',  '#a90432'),            alt: K('#f2f2f2', '#a90432', 'solid', '#f2f2f2') },
    { name: 'Olympiacos',          short: 'OLY', country: 'GRE', rating: 77, kit: K('#e2001a', '#f5f5f5', 'stripes', '#f5f5f5', '#e2001a'), alt: K('#111111', '#e2001a', 'solid', '#111111') },
    { name: 'Slavia Praha',        short: 'SLA', country: 'CZE', rating: 75, kit: K('#e2001a', '#f5f5f5', 'halves',  '#f5f5f5'),            alt: K('#111111', '#e2001a', 'solid', '#111111') },
    { name: 'Bodø/Glimt',          short: 'BOD', country: 'NOR', rating: 75, kit: K('#ffe500', '#111111', 'solid',   '#ffe500'),            alt: K('#111111', '#ffe500', 'solid', '#111111') },
    { name: 'FC København',        short: 'FCK', country: 'DEN', rating: 75, kit: K('#f5f5f5', '#001e62', 'solid',   '#001e62', '#f5f5f5'), alt: K('#001e62', '#f5f5f5', 'solid', '#001e62') },
    { name: 'Kairat Almaty',       short: 'KAI', country: 'KAZ', rating: 70, kit: K('#ffcc00', '#111111', 'solid',   '#111111', '#ffcc00'), alt: K('#f2f2f2', '#ffcc00', 'solid', '#f2f2f2') },
    { name: 'Pafos',               short: 'PAF', country: 'CYP', rating: 72, kit: K('#1d4e9a', '#f5f5f5', 'solid',   '#f5f5f5', '#1d4e9a'), alt: K('#f2f2f2', '#1d4e9a', 'solid', '#f2f2f2') },
    { name: 'Qarabağ',             short: 'QAR', country: 'AZE', rating: 74, kit: K('#111111', '#f5f5f5', 'stripes', '#111111'),            alt: K('#f2f2f2', '#111111', 'solid', '#f2f2f2') },
  ];

  // Squad numbers used for every club (GK, back four, midfield three, front three).
  FC.NUMBERS = [1, 2, 4, 5, 3, 8, 6, 10, 7, 9, 11];

  // Pick the away kit when the two home shirts would be hard to tell apart.
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function dist(a, b) { const x = hexToRgb(a), y = hexToRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }
  FC.pickKits = (homeIdx, awayIdx) => {
    const h = FC.TEAMS[homeIdx].kit;
    const t = FC.TEAMS[awayIdx];
    const options = [
      ...(homeIdx === awayIdx ? [] : [t.kit]), t.alt,
      { shirt: '#f2f2f2', shirt2: '#e9c46a', pattern: 'solid', shorts: '#f2f2f2', socks: '#f2f2f2' },
      { shirt: '#1f1f1f', shirt2: '#e9c46a', pattern: 'solid', shorts: '#1f1f1f', socks: '#1f1f1f' },
    ];
    return [h, options.find(k => dist(h.shirt, k.shirt) >= 120) || options[options.length - 1]];
  };
})();
