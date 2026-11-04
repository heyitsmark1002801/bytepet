// Pixel art for Bytepet: a monochrome LCD look, drawn on a 24x24 grid.
// Edit the string art to change the look:
//   .  empty     o  ink (outline, eyes)     w  body fill
//   s  shade     x  highlight
// (Other letters in older art — r y g b p n N k K — map onto these few LCD tones.)
// Faces, headgear, props and poses are layers stamped on top of the body.

(function () {
  const GRID = 24;

  const INK = '#1f2a1a';
  const FILL = '#cfddaf';
  const SHADE = '#a2b383';
  const PALE = '#e8f0d2';
  const MID = '#6f7f52';
  const tones = (o, w, s, x, mid) => ({
    o, w, s, x, l: w, h: x, p: s, b: o, y: mid, r: o, g: s, k: s, K: w, n: o, N: s, v: mid,
  });
  const PALETTES = {
    lcd: tones(INK, FILL, SHADE, PALE, MID),
    sick: tones(INK, '#bccb95', '#909f70', '#d8e3bd', MID),
    ghost: tones('#56604c', '#eef3e0', '#d3dcc0', '#ffffff', '#8d977f'),
  };
  PALETTES.egg = PALETTES.lcd;
  PALETTES.icon = PALETTES.lcd;

  const BODY = [
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '.........oooooo.........',
    '.......ooxxwwwwoo.......',
    '......oxxxwwwwwwwo......',
    '.....oxxxwwwwwwwwwo.....',
    '....owwwwwwwwwwwwwwo....',
    '....owwwwwwwwwwwwwwo....',
    '...owwwwwwwwwwwwwwwwo...',
    '...owwwwwwwwwwwwwwsso...',
    '...owwwwwwwwwwwwwwsso...',
    '...owwwwwwwwwwwwwwsso...',
    '...owwwwwwwwwwwwwwsso...',
    '...owwwwwwwwwwwwwwsso...',
    '...owwwwwwwwwwwwwwsso...',
    '....osssssssssssssso....',
    '.....oossssssssssoo.....',
    '.......oooooooooo.......',
    '........................',
    '........................',
    '........................',
  ];

  const EGG = [
    '........................',
    '........................',
    '........................',
    '..........oooo..........',
    '.........oxxxwo.........',
    '........oxxxwwwo........',
    '.......oxxxwwwwwo.......',
    '.......owwwsswwwo.......',
    '......owwwsssswwwo......',
    '......owwwwsswwsso......',
    '.....owwwwwwwwwwsso.....',
    '.....owsswwwwwwwsso.....',
    '.....owsswwwwwwwsso.....',
    '....owwwwwwwwwsswsso....',
    '....owwwwwwwwwsswsso....',
    '....owwwwwwwwwwwwsso....',
    '....owwwwsswwwwwwsso....',
    '....owwwwsswwwwwwsso....',
    '.....owwwwwwwwwwsso.....',
    '.....osssssssssssso.....',
    '......oossssssssoo......',
    '........oooooooo........',
    '........................',
    '........................',
  ];

  const GHOST = [
    '........................',
    '........................',
    '........................',
    '........................',
    '.........oooooo.........',
    '.......ooxxwwwwoo.......',
    '......oxxxwwwwwwwo......',
    '.....oxxxwwwwwwwwwo.....',
    '....owwwwwwwwwwwwwwo....',
    '....owwwwwwwwwwwwwwo....',
    '...owwwwwwwwwwwwwwwwo...',
    '...owwwoowwwwwoowwsso...',
    '...owwwoowwwwwoowwsso...',
    '...owwwwwwwwwwwwwwsso...',
    '...owwwwwwwoowwwwwsso...',
    '...owwwwwwwoowwwwwsso...',
    '...owwwwwwwwwwwwwwsso...',
    '...owwwwwwwwwwwwwwsso...',
    '...owwwwwwwwwwwwwwsso...',
    '...owwwwwwwwwwwwwwsso...',
    '...owsswosswosswossso...',
    '...oo..ooo..ooo..oooo...',
    '........................',
    '........................',
  ];

  // little string-art pieces, stamped at [x, y]
  const art = (x, y, rows) => ({ x, y, rows });

  const SPROUT = art(7, 0, [
    'oo......oo',
    'oxo....oxo',
    '.oxo..oxo.',
    '..oooooo..',
    '....oo....',
  ]);

  const BLANKET = [
    [15, 'oooooooooooooooooooooooo'],
    [16, 'oxxxxxxxxxxxxxxxxxxxxxxo'],
    [17, 'owwswwswwswwswwswwswwswo'],
    [18, 'owwwwwwwwwwwwwwwwwwwwwwo'],
    [19, 'owwswwswwswwswwswwswwswo'],
    [20, 'owwwwwwwwwwwwwwwwwwwwwwo'],
    [21, 'oooooooooooooooooooooooo'],
  ];

  // Face parts: { tone: [[x, y], ...] }
  const SAD_BROWS = [[7, 10], [8, 10], [9, 9], [10, 9], [16, 10], [15, 10], [14, 9], [13, 9]];
  const ANGRY_BROWS = [[7, 9], [8, 9], [9, 10], [10, 10], [16, 9], [15, 9], [14, 10], [13, 10]];
  const EYES = {
    open: { o: [[9, 11], [8, 12], [9, 12], [15, 11], [14, 12], [15, 12], [8, 11], [14, 11]], x: [] },
    happy: { o: [[7, 12], [8, 11], [9, 11], [10, 12], [13, 12], [14, 11], [15, 11], [16, 12]] },
    closed: { o: [[7, 11], [8, 12], [9, 12], [10, 11], [13, 11], [14, 12], [15, 12], [16, 11]] },
    sad: { o: [[8, 12], [9, 12], [8, 13], [9, 13], [14, 12], [15, 12], [14, 13], [15, 13], ...SAD_BROWS] },
    half: { o: [[7, 11], [8, 11], [9, 11], [10, 11], [13, 11], [14, 11], [15, 11], [16, 11], [8, 12], [9, 12], [14, 12], [15, 12]] },
    angry: { o: [[8, 11], [9, 11], [8, 12], [9, 12], [14, 11], [15, 11], [14, 12], [15, 12], ...ANGRY_BROWS] },
    dizzy: { o: [[7, 10], [9, 10], [8, 11], [7, 12], [9, 12], [14, 10], [16, 10], [15, 11], [14, 12], [16, 12]] },
    cry: { o: [[8, 10], [9, 11], [8, 12], [15, 10], [14, 11], [15, 12], [7, 9], [8, 9], [9, 8], [10, 8], [16, 9], [15, 9], [14, 8], [13, 8]] },
    lookLeft: { o: [[7, 11], [8, 11], [7, 12], [8, 12], [13, 11], [14, 11], [13, 12], [14, 12]] },
    lookRight: { o: [[9, 11], [10, 11], [9, 12], [10, 12], [15, 11], [16, 11], [15, 12], [16, 12]] },
  };
  const TEARS = {
    a: [[8, 13], [8, 14], [15, 13], [15, 14]],
    b: [[8, 14], [7, 15], [15, 14], [16, 15]],
  };
  const MOUTHS = {
    smile: { o: [[10, 14], [11, 15], [12, 15], [13, 14]] },
    flat: { o: [[11, 15], [12, 15]] },
    frown: { o: [[10, 15], [11, 14], [12, 14], [13, 15]] },
    open: { o: [[11, 14], [12, 14], [10, 15], [13, 15], [11, 16], [12, 16]], s: [[11, 15], [12, 15]] },
    yawn: { o: [[11, 14], [12, 14], [10, 15], [13, 15], [10, 16], [13, 16], [11, 17], [12, 17]], s: [[11, 15], [12, 15], [11, 16], [12, 16]] },
  };
  const CHEEKS = [[6, 13], [7, 13], [16, 13], [17, 13]];
  const FEET = {
    stand: [[8, 21], [9, 21], [14, 21], [15, 21]],
    stepA: [[7, 21], [8, 21], [14, 21], [15, 21]],
    stepB: [[8, 21], [9, 21], [15, 21], [16, 21]],
  };
  const ARMS = {
    meditateLeft: [[2, 16], [1, 16], [1, 15]],
    meditateRight: [[21, 16], [22, 16], [22, 15]],
    upLeft: [[2, 12], [1, 11], [1, 10]],
    upRight: [[21, 12], [22, 11], [22, 10]],
    downLeft: [[2, 14], [1, 15]],
    downRight: [[21, 14], [22, 15]],
  };
  const LOTUS = art(4, 19, ['..oooo....oooo..', '.osssoooooosssso.', 'oooooooooooooooo']);
  const CRACK = [[5, 12], [6, 11], [7, 12], [8, 11], [9, 12], [10, 11], [11, 12], [12, 11], [13, 12], [14, 11], [15, 12], [16, 11], [17, 12], [18, 11]];
  const SWEAT = { a: [[20, 7], [20, 8], [3, 9]], b: [[20, 8], [21, 9], [3, 10]] };
  const FAN = {
    up: art(19, 9, ['.ooo.', 'owwwo', 'owwwo', '.ooo.', '..o..', '..o..']),
    down: art(19, 10, ['.ooo.', 'owwwo', '.ooo.', '..o..', '..o..']),
  };

  // ---------- adult forms (how you work decides which one you get) ----------
  const FORMS = {
    nightowl: {
      head: art(7, 0, [
        '...oooo.......',
        '.oowwswoo.....',
        'owwswwwwsoo...',
        'oooooooooooo..',
        '..........oww.',
        '..........oooo',
        '...........oo.',
      ]),
      extra: [art(0, 0, ['.ooo.', 'oo...', 'o....', 'oo...', '.ooo.']), art(5, 3, ['.o.', 'ooo', '.o.'])],
      eyes: 'half',
    },
    coder: {
      face: art(6, 10, ['ooooo..ooooo', 'o...oooo...o', 'o...o..o...o', 'ooooo..ooooo']),
      extra: [art(0, 14, ['..ooooooo', '..oxxxxxo', '..oxoxoxo', '..oxxxxxo', 'ooooooooo', 'osssssssso'])],
    },
    writer: {
      extra: [
        art(16, 13, ['oooooo', 'owwwwo', 'oossoo', 'owwwwo', 'oossoo', 'owwwwo', 'oooooo']),
        art(19, 7, ['...oo', '..oxo', '.oxo.', 'oxo..', 'oo...']),
      ],
    },
    artist: {
      head: art(5, 2, ['.......o......', '...oooooooo...', '.oosssssssoo..', 'osssssssssssoo', '.oooooooooooo.']),
      extra: [
        art(0, 15, ['.oooo..', 'owwwwoo', 'owowwwo', 'owwwowo', '.ooooo.']),
        art(20, 8, ['..o', '.ox', 'ox.', 'o..']),
      ],
    },
    zen: {
      extra: [
        art(1, 5, ['.o.', 'ooo', '.o.']), art(20, 4, ['.o.', 'ooo', '.o.']),
        art(0, 13, ['.o.', 'ooo', '.o.']), art(21, 14, ['.o.', 'ooo', '.o.']),
        art(4, 20, ['oooooo....oooooo', 'oooooooooooooooo']),
      ],
      eyes: 'closed',
      mouth: 'smile',
      noFeet: true,
    },
    scholar: {
      head: art(4, 1, [
        '.......oo.......',
        '....oooooooo....',
        'oooooooooooooooo',
        '....oooooooo...o',
        '.....oooooo....o',
        '..............ooo',
      ]),
      face: art(6, 10, ['.ooo....ooo.', 'o...oooo...o', 'o...o..o...o', '.ooo....ooo.']),
      extra: [art(4, 18, ['oooooooooooooooo', 'oxxxxxxooxxxxxxo', 'oxsssxxooxxsssxo', 'oooooooooooooooo'])],
    },
    gamer: {
      head: art(4, 3, ['...oooooooooo...', '..o..........o..', '.o............o.']),
      extra: [
        art(2, 9, ['oo', 'oo', 'oo', 'oo']), art(20, 9, ['oo', 'oo', 'oo', 'oo']),
        art(3, 13, ['o', '.o', '..ooo']),
        art(6, 17, ['.oooooooooo.', 'oowowwwwowoo', 'owooowwoowwo', 'oowowwwwwwoo', '.ooo....ooo.']),
      ],
    },
    grumpy: {
      extra: [art(15, 0, ['.ooo.....', 'owwwoooo.', 'owwwwwwwo', '.ooooooo.', '..o.o.o..'])],
      brows: true,
    },
  };
  const FORM_ALIAS = { star: 'zen' }; // older saves

  // Streak rewards
  const ACCESSORIES = {
    bow: { art: art(14, 2, ['oo.oo', 'owowo', 'oo.oo']), head: false },
    cap: { art: art(6, 2, ['...oooooo....', '.oossssssoo..', 'ossssssssssoooo', 'ooooooooooooo..']), head: true },
    shades: { art: art(6, 10, ['oooooooooooo', 'ooooo..ooooo', '.ooo....ooo.']), head: false },
    wizard: { art: art(6, 0, ['......o.....', '.....ooo....', '....ooxoo...', '...oosssoo..', '..oossssoo..', 'oooooooooooo']), head: true },
  };

  // ---------- small icons ----------
  const ICONS = {
    poop: ['...oo....', '..oxso...', '..osso...', '.ooooooo.', '.oxsssso.', 'oossssssoo', 'oxssssssso', 'oooooooooo'],
    grave: [
      '....oooooo....',
      '..ooxxxxxxoo..',
      '.oxxwwwwwwwwo.',
      '.oxwwwwowwwso.',
      'oxwwwwooowwwso',
      'owwwwwwowwwwso',
      'owwwwwwowwwwso',
      'owwwwwwwwwwwso',
      'owwssssssswwso',
      'owwwwwwwwwwwso',
      'owwsssssswwwso',
      'owwwwwwwwwwwso',
      'osssssssssssso',
      'gggggggggggggg',
      '.gkgkggkgggkg.',
    ],
    basket: [
      'oooooooooooooooooooo',
      'orrrrrrrrrrrrrrrrrro',
      'oooooooooooooooooooo',
      '.owswswswswswswswso.',
      '.oswswswswswswswswo.',
      '..owswswswswswswso..',
      '..oswswswswswswswo..',
      '...owswswswswswso...',
      '...oooooooooooooo...',
    ],
    sparkle: ['..o..', '..o..', 'oo.oo', '..o..', '..o..'],
    germ: ['o.o.o', '.ooo.', 'oowoo', '.ooo.', 'o.o.o'],
    fly: ['ww.ww', '.wow.', '..o..'],
    health: ['..ooo..', '..owo..', 'ooowooo', 'owwwwwo', 'ooowooo', '..owo..', '..ooo..'],
    medal: ['o...o', 'oo.oo', '.ooo.', 'owwwo', 'owowo', 'owwwo', '.ooo.'],
    bolt: ['...oo', '..oo.', '.oooo', '..oo.', '.oo..', '.o...'],
    battery: ['oooooooo.', 'oowwwwwoo', 'oowwwwwoo', 'oooooooo.'],
    suitcase: ['...ooo...', '...o.o...', 'ooooooooo', 'ossssssso', 'ossoossso', 'ossssssso', 'ooooooooo'],
    trophy: ['ooooooo', 'owwwwwo', '.owwwo.', '..ooo..', '...o...', '..ooo..', '.ooooo.'],
    popcorn: ['.o.o.o.', 'owowowo', '.ooooo.', 'oswswso', 'oswswso', '.oswso.', '.ooooo.'],
    bell: ['...o...', '..ooo..', '.owwwo.', '.owwwo.', '.owwwo.', 'ooooooo', '...o...'],
    sad: ['.ooooo.', 'owwwwwo', 'owowowo', 'owwwwwo', 'owooowo', '.ooooo.'],
    attention: ['.ooo.', '.ooo.', '.ooo.', '.ooo.', '.....', '.ooo.', '.ooo.'],
    bulb: ['..ooo..', '.owwwo.', 'owwwwwo', 'owwwwwo', '.owwwo.', '..ooo..', '..sss..', '..ooo..'],
    medicine: ['..ooo..', '..owo..', 'ooowooo', 'owwwwwo', 'ooowooo', '..owo..', '..ooo..'],
    note: ['..oooo', '..o..o', '..o..o', '..o..o', 'ooo.oo', 'ooo.oo'],
    heart: ['.oo.oo.', 'ooooooo', 'ooooooo', '.ooooo.', '..ooo..', '...o...'],
    food: ['..ooo..', '.owwwo.', 'owwwwwo', 'owwwwwo', 'ooooooo', '.ooooo.'],
    star: ['...o...', '..ooo..', 'ooooooo', '.ooooo.', '.oo.oo.', 'o.....o'],
    z: ['ooooo', '...o.', '..o..', '.o...', 'ooooo'],
    snow: ['o.o.o', '.ooo.', 'ooooo', '.ooo.', 'o.o.o'],
    umbrella: [
      '.....oooo.....',
      '...oowwwwoo...',
      '..owwswwswwo..',
      '.owwwswwswwwo.',
      'owwwwswwswwwwo',
      'oo.oo.oo.oo.oo',
      '......o.......',
      '......o.......',
      '......o.......',
      '....o.o.......',
      '.....o........',
    ],
  };

  // Colour is only for small indicators, mess and props: the pet itself stays an LCD.
  const tint = (o, w = o, s = o, x = w, extra = {}) => ({ ...tones(o, w, s, x, s), ...extra });
  const ICON_TINTS = {
    attention: tint('#e5484d'),
    food: tint('#a15c07', '#fbbf24', '#f59e0b'),
    bulb: tint('#854d0e', '#fde047', '#a8a29e'), // tired: lights off
    medicine: tint('#dc2626', '#ffffff'), // updates waiting
    sad: tint('#6d28d9', '#ddd6fe'), // distracted
    bell: tint('#b45309', '#fcd34d'),
    battery: tint('#b91c1c', '#fca5a5'),
    bolt: tint('#ca8a04'),
    note: tint('#2563eb'),
    popcorn: tint('#b91c1c', '#fff7ed', '#fde68a'),
    heart: tint('#e11d48'),
    star: tint('#f59e0b'),
    sparkle: tint('#a78bfa'),
    germ: tint('#16a34a', '#bbf7d0'),
    fly: tint('#111827', '#cbd5e1'),
    health: tint('#15803d', '#86efac'),
    medal: tint('#6d28d9', '#c4b5fd'),
    z: tint('#3b82f6'),
    snow: tint('#60a5fa'),
    umbrella: tint('#1e3a8a', '#60a5fa', '#bfdbfe'),
    poop: tint('#4a2c12', '#8b5a2b', '#6b4220', '#b07a45', { x: '#b07a45' }),
    trophy: tint('#a16207', '#fde047'),
    suitcase: tint('#7c4a1e', '#d97706', '#b45309'),
    grave: tint('#3f3f46', '#d4d4d8', '#a1a1aa', '#f4f4f5', { g: '#4ade80', k: '#16a34a' }),
    basket: tint('#5b3413', '#d9a066', '#a8743f', '#e8c08a', { r: '#f97316' }),
  };

  // ---------- drawing ----------
  function stampRows(map, rows, ox = 0, oy = 0) {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (c !== '.' && c !== ' ') map.set(`${x + ox},${y + oy}`, c);
      }
    });
  }
  const stampArt = (map, a, ox = 0, oy = 0) => a && stampRows(map, a.rows, a.x + ox, a.y + oy);
  function stampPoints(map, pts, tone = 'o', ox = 0, oy = 0) {
    for (const [x, y] of pts) map.set(`${x + ox},${y + oy}`, tone);
  }
  function stampParts(map, parts, ox, oy) {
    for (const [tone, pts] of Object.entries(parts || {})) stampPoints(map, pts, tone, ox, oy);
  }

  // look = { kind: 'egg'|'creature'|'ghost', stage, form, eyes, mouth, feet, tears, arms: [names],
  //          bed, hatching, bob (0/1), shake (-1/0/1), accessory, sweat, fan }
  function build(look) {
    const map = new Map();
    const oy = look.bob || 0;
    const ox = look.shake || 0;
    if (look.kind === 'egg') {
      stampRows(map, EGG, ox, oy);
      if (look.hatching) stampPoints(map, CRACK, 'o', ox, oy);
      return map;
    }
    if (look.kind === 'ghost') {
      stampRows(map, GHOST, 0, oy);
      return map;
    }
    const form = FORMS[FORM_ALIAS[look.form] || look.form] || null;
    const acc = ACCESSORIES[look.accessory] || null;
    stampRows(map, BODY, ox, oy);

    // head: streak hat > form headgear > sprout
    if (acc && acc.head) stampArt(map, acc.art, ox, oy);
    else if (form && form.head) stampArt(map, form.head, ox, oy);
    else stampArt(map, SPROUT, ox, oy);

    stampPoints(map, CHEEKS, 's', ox, oy);
    let eyes = look.eyes || 'open';
    if (form && form.eyes && (eyes === 'open' || eyes === 'happy')) eyes = form.eyes;
    stampParts(map, EYES[eyes] || EYES.open, ox, oy);
    if (form && form.brows && (eyes === 'open' || eyes === 'half')) stampPoints(map, ANGRY_BROWS, 'o', ox, oy);
    const mouth = form && form.mouth && look.mouth !== 'open' && look.mouth !== 'yawn' ? form.mouth : look.mouth;
    stampParts(map, MOUTHS[mouth] || MOUTHS.flat, ox, oy);
    if (look.tears) stampPoints(map, TEARS[look.tears] || TEARS.a, 'o', ox, oy);
    if (form && form.face && !(acc && acc.art.y >= 9 && acc.art.y <= 11)) stampArt(map, form.face, ox, oy);
    if (acc && !acc.head) stampArt(map, acc.art, ox, oy);
    if (look.sweat) stampPoints(map, SWEAT[look.sweat] || SWEAT.a, 'o', ox, oy);
    for (const a of look.arms || []) stampPoints(map, ARMS[a], 'o', ox, oy);

    if (look.bed) {
      for (const [y, row] of BLANKET) {
        for (let x = 0; x < row.length; x++) map.set(`${x},${y}`, row[x]);
      }
      for (let y = 22; y < GRID; y++) for (let x = 0; x < GRID; x++) map.delete(`${x},${y}`);
      return map;
    }
    if (form && form.extra) for (const e of form.extra) stampArt(map, e, ox, oy);
    if (look.feet === 'lotus') stampArt(map, LOTUS, ox, oy);
    else if (!(form && form.noFeet)) stampPoints(map, FEET[look.feet] || FEET.stand, 'o', ox, oy);
    if (look.fan) stampArt(map, FAN[look.fan] || FAN.up, ox, oy);
    return map;
  }

  // Draw a pixel map onto a canvas as solid pixels. `scale` = CSS px per pixel.
  function draw(canvas, map, scale, paletteName = 'lcd', flip = false) {
    const pal = PALETTES[paletteName] || PALETTES.lcd;
    const dpr = window.devicePixelRatio || 1;
    const size = GRID * scale;
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    for (const [key, c] of map) {
      const [x, y] = key.split(',').map(Number);
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
      const px = flip ? GRID - 1 - x : x;
      ctx.fillStyle = pal[c] || pal.o;
      ctx.fillRect(px * scale, y * scale, scale, scale);
    }
  }

  const iconCache = {};
  function icon(name, scale = 3, paletteName = 'icon') {
    const key = `${name}:${scale}:${paletteName}`;
    if (iconCache[key]) return iconCache[key];
    const rows = ICONS[name] || ICONS.attention;
    const pal = paletteName === 'icon' && ICON_TINTS[name] ? ICON_TINTS[name] : PALETTES[paletteName] || PALETTES.icon;
    const w = Math.max(...rows.map((r) => r.length));
    const c = document.createElement('canvas');
    c.width = w * scale;
    c.height = rows.length * scale;
    const ctx = c.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '.' || row[x] === ' ') continue;
        ctx.fillStyle = pal[row[x]] || pal.o;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    });
    iconCache[key] = c.toDataURL();
    return iconCache[key];
  }

  function paletteFor({ kind, sick }) {
    if (kind === 'egg') return 'egg';
    if (kind === 'ghost') return 'ghost';
    return sick ? 'sick' : 'lcd';
  }

  const FORM_NAMES = Object.keys(FORMS);
  window.Sprites = { GRID, build, draw, icon, paletteFor, ICONS, PALETTES, FORM_NAMES };
})();
