// Bytepet — what you see: movement, physics, pixel animation, bubbles, icons.
const api = window.bytepet;
const SP = window.Sprites;
const $ = (id) => document.getElementById(id);
const petEl = $('pet');
const canvas = $('sprite');
const bubbleEl = $('bubble');
const panelEl = $('panel');
const iconsEl = $('icons');
const fx = $('fx');

// CSS pixels per sprite pixel (sprites are 18x18)
const SCALES = { egg: 3, baby: 3, child: 4, adult: 4, ghost: 4 };
const GRAVITY = 2400;
const IMPORTANT = new Set(['died', 'revived', 'evolved', 'got-sick', 'screen-too-long', 'bedtime', 'missed-deadline']);
// moods that can still dance when music plays (sleeping, in bed, egg and ghost can't)
const AWAKE_MOODS = new Set(['happy', 'okay', 'hungry', 'sad', 'tired', 'crying', 'sick']);

let S = null; // latest snapshot from the main process
const body = { x: -1, y: 0, vx: 0, vy: 0, size: 72, scale: 4, mode: 'idle', dir: 1, targetX: 0, nextDecision: 0 };
let override = null; // temporary face { eyes, mouth, until }
let chewUntil = 0;
let lastParticle = { z: 0, flake: 0, note: 0 };
let ignoring = true;
let hovering = false;
let lastLookKey = '';
let lastIconsKey = '';

// ---------- helpers ----------
const now = () => performance.now();
const floorY = () => window.innerHeight - body.size;
const clampX = (x) => Math.max(0, Math.min(window.innerWidth - body.size, x));
const petMood = () => (S ? S.mood : 'egg');
const isMeditating = () => !!S && !!S.focus && AWAKE_MOODS.has(petMood()) && body.mode !== 'drag' && body.mode !== 'fall';
const isDancing = () => !!S && S.music && !isMeditating() && AWAKE_MOODS.has(petMood()) && body.mode !== 'drag' && body.mode !== 'fall';

function setIgnore(v) {
  if (v !== ignoring) { ignoring = v; api.setIgnoreMouse(v); }
}

function scaleFor(s) {
  if (!s) return SCALES.baby;
  if (s.pet.ghost) return SCALES.ghost;
  return SCALES[s.pet.stage] || SCALES.baby;
}

// ---------- the look: which pixels to draw this frame ----------
const FACES = {
  happy: ['open', 'smile'], okay: ['open', 'flat'], hungry: ['open', 'open'],
  sad: ['sad', 'frown'], tired: ['half', 'flat'], sick: ['sad', 'frown'],
  sleeping: ['closed', 'flat'], sleepy: ['half', 'flat'], crying: ['cry', 'frown'],
};

function currentLook(t) {
  const mood = petMood();
  const p = S ? S.pet : { stage: 'egg' };
  const tick = (ms) => Math.floor(t / ms) % 2;

  if (mood === 'egg') {
    const hatching = S && Date.now() - p.born > 12000;
    const wobble = hatching ? [-1, 0, 1, 0][Math.floor(t / 90) % 4] : (t % 3000 < 400 ? [-1, 1][tick(100)] : 0);
    return { kind: 'egg', hatching, shake: wobble, palette: 'egg' };
  }
  if (mood === 'ghost') return { kind: 'ghost', bob: tick(500), palette: 'ghost' };

  let [eyes, mouth] = FACES[mood] || FACES.okay;
  const look = {
    kind: 'creature', stage: p.stage, form: p.stage === 'adult' ? p.form : null,
    eyes, mouth, feet: 'stand', arms: [], bed: false, bob: 0, shake: 0,
    palette: SP.paletteFor({ kind: 'creature', stage: p.stage, form: p.stage === 'adult' ? p.form : null, sick: mood === 'sick' }),
    accessory: S && S.equipped,
  };
  const sys = (S && S.system) || {};
  if (sys.hot && mood !== 'sleeping') { look.sweat = tick(400) ? 'a' : 'b'; look.fan = tick(220) ? 'up' : 'down'; }

  if (mood === 'sleeping' || mood === 'sleepy') {
    look.bed = true;
    look.bob = tick(mood === 'sleeping' ? 1200 : 700);
    if (mood === 'sleepy' && t % 4000 < 900) look.mouth = 'yawn';
    return look;
  }

  if (body.mode === 'drag') {
    Object.assign(look, { eyes: 'open', mouth: 'open', arms: ['upLeft', 'upRight'] });
    return look;
  }
  if (body.mode === 'fall' && body.y < floorY() - 4) {
    Object.assign(look, { eyes: 'happy', mouth: 'open', arms: ['upLeft', 'upRight'] });
    return look;
  }

  if (isMeditating()) {
    // focus session: sits cross-legged, eyes closed, floating gently
    look.eyes = t % 6000 < 200 ? 'half' : 'closed';
    look.mouth = 'smile';
    look.arms = ['meditateLeft', 'meditateRight'];
    look.feet = 'lotus';
    look.bob = 0;
    if (override && override.until > t) { look.eyes = override.eyes; look.mouth = override.mouth; }
    return look;
  }

  // sick (updates waiting, messy computer or low health): shivers, sweats, looks unwell
  if (mood === 'sick' && body.mode !== 'drag') {
    look.eyes = t % 3000 < 2000 ? 'sad' : 'dizzy';
    look.mouth = 'frown';
    look.sweat = tick(500) ? 'a' : 'b';
    look.shake = t % 2200 < 300 ? [-1, 1][tick(60)] : 0;
    if (!isDancing()) {
      if (override && override.until > t) { look.eyes = override.eyes; look.mouth = override.mouth; }
      return look;
    }
  }

  if (isDancing()) {
    const beat = Math.floor(t / 320) % 4;
    look.eyes = 'happy';
    look.mouth = beat % 2 ? 'open' : 'smile';
    look.arms = beat % 2 ? ['upLeft', 'downRight'] : ['downLeft', 'upRight'];
    look.feet = beat % 2 ? 'stepA' : 'stepB';
    look.bob = beat % 2;
    look.flip = beat >= 2;
    return look;
  }

  // noticed a distraction: keeps glancing over at your screen
  if (S && S.noticing && ['happy', 'okay', 'hungry', 'sad', 'tired'].includes(mood) && body.mode !== 'walk') {
    look.eyes = Math.floor(t / 700) % 2 ? 'lookLeft' : 'lookRight';
    look.mouth = 'flat';
  }
  if (S && S.onBreak && ['happy', 'okay', 'tired', 'hungry', 'sad'].includes(mood)) {
    look.eyes = 'happy';
    look.mouth = Math.floor(t / 900) % 3 === 0 ? 'open' : 'smile';
  }
  if (mood === 'crying') {
    look.tears = tick(350) ? 'a' : 'b';
    look.mouth = tick(1200) ? 'frown' : 'open';
  }
  if (sys.low && ['happy', 'okay', 'hungry'].includes(mood)) { look.eyes = 'half'; look.mouth = t % 5000 < 900 ? 'yawn' : 'flat'; }
  if (sys.hot && !look.fan) look.fan = 'up';

  if (body.mode === 'walk') {
    look.feet = tick(180) ? 'stepA' : 'stepB';
    look.bob = tick(180);
  } else {
    look.bob = tick(650);
  }

  if (override && override.until > t) { look.eyes = override.eyes; look.mouth = override.mouth; }
  if (chewUntil > t) { look.eyes = 'happy'; look.mouth = tick(160) ? 'open' : 'flat'; }
  return look;
}

function drawPet(t) {
  const look = currentLook(t);
  const flip = look.flip != null ? look.flip : body.dir < 0;
  const key = JSON.stringify(look) + flip + body.scale;
  if (key === lastLookKey) return;
  lastLookKey = key;
  SP.draw(canvas, SP.build(look), body.scale, look.palette, flip);
}

function flashFace(eyes, mouth, ms = 1400) { override = { eyes, mouth, until: now() + ms }; }

// ---------- status icons ----------
function updateIcons() {
  if (!S) return;
  // One "!" means "I need something" — hover the pet to see what. Keeps it simple.
  const want = [];
  const needs = S.needs || [];
  if (needs.length) want.push(['attention', false]);
  if (isDancing()) want.push(['note', true]);
  if (S.onBreak) want.push(['popcorn', true]);
  if ((S.system || {}).low) want.push(['battery', false]);
  const key = want.map((w) => w[0]).join(',');
  if (key === lastIconsKey) return;
  lastIconsKey = key;
  iconsEl.innerHTML = '';
  for (const [name, steady] of want) {
    const img = document.createElement('img');
    img.src = SP.icon(name, 3);
    if (steady) img.className = 'steady';
    iconsEl.appendChild(img);
  }
}

// ---------- speech ----------
const queue = [];
let bubbleUntil = 0;

function sayLine(line, type) {
  if (!line) return;
  if (S && S.quiet && !IMPORTANT.has(type)) return;
  if (queue.length > 3) queue.shift();
  queue.push(line);
}

function updateBubble() {
  const t = now();
  if (t <= bubbleUntil) return;
  if (queue.length) {
    const line = queue.shift();
    bubbleEl.textContent = line;
    bubbleUntil = t + Math.max(2600, line.length * 70);
    bubbleEl.classList.add('show');
    petEl.classList.add('talking');
  } else if (bubbleEl.classList.contains('show')) {
    bubbleEl.classList.remove('show');
    petEl.classList.remove('talking');
  }
}

// keep bubble/panel on screen near the edges
function shiftFor(el, varName) {
  const w = el.offsetWidth || 200;
  const cx = body.x + body.size / 2;
  let shift = 0;
  if (cx - w / 2 < 8) shift = 8 - (cx - w / 2);
  if (cx + w / 2 > window.innerWidth - 8) shift = (window.innerWidth - 8) - (cx + w / 2);
  petEl.style.setProperty(varName, `${shift}px`);
}

// ---------- particles ----------
function particle(content, cls = '', opts = {}) {
  let p;
  if (opts.icon) {
    p = document.createElement('img');
    p.src = SP.icon(content, opts.scale || 3, opts.palette || 'icon');
  } else {
    p = document.createElement('div');
    p.textContent = content;
  }
  p.className = `particle ${cls}`;
  p.style.left = `${body.x + body.size / 2 + (opts.ox || 0)}px`;
  p.style.top = `${body.y + (opts.oy ?? body.size * 0.15)}px`;
  if (opts.dx != null) p.style.setProperty('--dx', `${opts.dx}px`);
  if (opts.dy != null) p.style.setProperty('--dy', `${opts.dy}px`);
  p.addEventListener('animationend', () => p.remove());
  fx.appendChild(p);
}

function hearts(n = 3) {
  for (let i = 0; i < n; i++) {
    setTimeout(() => particle('heart', '', { icon: true, ox: (Math.random() - 0.5) * body.size * 0.6, dx: (Math.random() - 0.5) * 40 }), i * 120);
  }
}

function burst(icons, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    const r = 60 + Math.random() * 40;
    particle(icons[i % icons.length], 'burst', { icon: true, oy: body.size * 0.5, dx: Math.cos(a) * r, dy: Math.sin(a) * r });
  }
}

// ---------- events from main ----------
api.onEvent((ev) => {
  const t = ev.type;
  if (t === 'ate' || t === 'ate-starving') {
    const size = ev.source && ev.source.startsWith('task-') ? ev.source.slice(5) : null;
    const units = { S: 1, M: 2, L: 3 }[size];
    chewUntil = now() + (units ? 900 + units * 500 : 1100);
    particle(units ? `+${units} FOOD` : '+FOOD', 'label', { dx: 10 });
    if (size === 'L') burst(['star', 'heart'], 10);
  } else if (t === 'petted') {
    flashFace('happy', 'smile');
  } else if (t === 'played') {
    flashFace('happy', 'open', 1600);
    jump(780);
    burst(['star'], 4);
  } else if (t === 'evolved') {
    burst(['star', 'heart'], 12);
    flashFace('happy', 'open', 2500);
  } else if (t === 'died') {
    setGraveX('ghost', body.x + body.size / 2 - GRAVE_W / 2);
    burst(['z'], 6);
  } else if (t === 'revived') {
    crumble('ghost');
    burst(['star', 'heart'], 14);
    flashFace('happy', 'open', 3000);
    setTimeout(() => jump(900), 300);
  } else if (t === 'cured') {
    particle('+MEDICINE', 'label', { dx: -10 });
    burst(['heart'], 6);
    flashFace('happy', 'smile', 2000);
  } else if (t === 'refocused') {
    flashFace('happy', 'smile', 2000);
    hearts(2);
  } else if (t === 'focus-done') {
    particle('+10 XP', 'label', { dx: -10 });
    burst(['star'], 8);
    flashFace('happy', 'open', 2000);
  } else if (t === 'focus-failed' || t === 'missed-deadline') {
    flashFace('sad', 'frown', 3000);
  } else if (t === 'care-mistake') {
    flashFace('sad', 'frown', 3000);
  } else if (t === 'basket') {
    particle('+JOY', 'label', { dx: 10 });
    burst(['star', 'heart'], 8);
    flashFace('happy', 'open', 1800);
  } else if (t === 'good-morning' || t === 'plan-done') {
    flashFace('happy', 'open', 2500);
    burst(['star', 'heart'], 8);
    setTimeout(() => jump(700), 200);
  } else if (t === 'plan-set') {
    flashFace('happy', 'smile', 2000);
    hearts(3);
  } else if (t === 'woke-up') {
    flashFace('open', 'open', 900);
  }
  sayLine(ev.line, t);
});

// ---------- state from main ----------
api.onState((s) => {
  const prevSize = body.size;
  S = s;
  body.scale = scaleFor(s);
  body.size = SP.GRID * body.scale;
  if (body.x < 0) {
    body.x = window.innerWidth - body.size - 180;
    body.y = floorY();
  } else if (prevSize !== body.size) {
    body.y -= body.size - prevSize; // grow upward, not into the floor
  }
  petEl.style.width = petEl.style.height = `${body.size}px`;

  const p = s.pet;
  const cls = petEl.classList;
  cls.toggle('is-ghost', !!p.ghost);
  $('revive-tag').hidden = !p.ghost;
  if (p.ghost) {
    $('revive-fill').style.width = `${Math.max(3, Math.round(p.revive))}%`;
    $('revive-text').textContent = `REVIVE ${Math.round(p.revive)}%${s.ghostDaysLeft != null ? ` · ${s.ghostDaysLeft}d left` : ''}`;
  }
  cls.toggle('rainy', !!s.weather && (s.weather.kind === 'rain' || s.weather.kind === 'storm') && !p.ghost && p.stage !== 'egg' && !p.asleep && !p.sleepy);
  cls.toggle('focusing', !!s.focus);
  cls.toggle('asleep', !!p.asleep);
  cls.toggle('sleepy', !!p.sleepy && !p.asleep);
  cls.toggle('away', !!p.vacation || !!s.playing);
  $('away-sign').hidden = !p.vacation;
  $('away-sign').textContent = p.vacation ? `${p.name} is on vacation 🧳` : '';
  updatePoop(s);
  updateGraves(s);
  if (s.focus) {
    const sec = Math.ceil(s.focus.remainingMs / 1000);
    $('focus-badge').textContent = `FOCUS ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }
  $('umbrella').src = SP.icon('umbrella', Math.max(2, body.scale - 1));
  renderPanel(s);
  updateIcons();
});

function setMeter(id, v) {
  const el = $(id);
  el.style.width = `${Math.max(4, Math.round(v))}%`;
  el.classList.toggle('low', v < 25);
}

// What it needs, each with its own pixel icon
const NEED_TEXT = {
  hungry: ['food', 'Hungry: finish a task'],
  sleepy: ['bulb', 'Sleepy: click me for lights off'],
  sick: ['medicine', 'Sick: install your Mac updates'],
  distracted: ['sad', 'Sad: back to work'],
  dirty: ['poop', 'Messy: click the poop to tidy up'],
  flies: ['fly', 'Flies! Clean up before it gets sick'],
};
document.querySelectorAll('#panel img[data-icon]').forEach((img) => { img.src = SP.icon(img.dataset.icon, 2); });
function needLine(icon, text) {
  const row = document.createElement('div');
  const img = document.createElement('img');
  img.src = SP.icon(icon, 2);
  row.append(img, text);
  return row;
}

function renderPanel(s) {
  const p = s.pet;
  $('p-name').textContent = p.name;
  const stage = p.ghost ? 'ghost' : p.stage === 'adult' ? `${p.form} adult` : p.stage;
  $('p-stage').textContent = `· ${stage} · ${p.xp}xp`;
  const units = Math.round(s.foodUnits ?? p.hunger / 20);
  const foodEl = $('food-units');
  if (foodEl.dataset.units !== String(units)) {
    foodEl.dataset.units = String(units);
    foodEl.replaceChildren(...[0, 1, 2, 3, 4].map((i) => {
      const img = document.createElement('img');
      img.src = SP.icon('food', 2);
      if (i >= units) img.className = 'empty';
      return img;
    }));
  }
  setMeter('b-energy', p.energy);
  setMeter('b-happiness', p.happiness);
  setMeter('b-health', p.health);
  setMeter('b-discipline', p.discipline);
  $('b-revive').style.width = `${Math.max(4, p.revive)}%`;
  const hrs = `${Math.floor(p.activeStreak / 60)}h${String(p.activeStreak % 60).padStart(2, '0')}`;
  const w = s.weather ? ` · ${s.weather.temp}°C` : '';
  $('p-foot').textContent = p.ghost
    ? 'Commit or focus to revive me!'
    : `screen ${hrs} · distracted ${p.distractionToday}m · mistakes ${p.careMistakes} · ${p.stats.tasks} tasks${w}`;
  const lines = (s.needs || []).filter((n) => NEED_TEXT[n]).map((n) => needLine(...(n === 'dirty' && p.flies ? NEED_TEXT.flies : NEED_TEXT[n])));
  for (const a of s.alerts || []) lines.push(needLine('bell', a.text));
  $('p-needs').replaceChildren(...lines);
  $('p-hint').textContent = p.sleepy && !p.asleep ? 'click: lights off 💡 · right-click menu'
    : p.asleep ? (p.sleepKind === 'night' ? `sleeping until ${s.wakeHour ?? 7}:00 🌙` : 'napping — wakes up when you\'re back')
      : 'click pat · double-click play · drag toss · right-click menu';
}

// ---------- movement ----------
function jump(power) {
  if (body.mode === 'drag' || petMood() === 'ghost') return;
  body.vy = -power;
  body.vx = (Math.random() - 0.5) * 120;
  body.mode = 'fall';
}

function speedFor(mood) {
  if (S && S.system && S.system.low) return 12;
  if (mood === 'happy') return 60;
  if (mood === 'okay') return 45;
  if (mood === 'sick') return 10;
  return 26;
}

function step(dt, t) {
  if (!S || body.mode === 'drag' || S.pet.vacation || S.playing) return;
  const mood = petMood();
  const floor = floorY();

  if (mood === 'ghost') {
    if (body.mode !== 'float') { body.mode = 'float'; body.targetX = clampX(body.x); }
    const home = graveSpot('ghost');
    if (Math.abs(body.targetX - body.x) < 4 || Math.random() < 0.002) {
      // haunts its own gravestone
      body.targetX = clampX(home.x + 28 - body.size / 2 + (Math.random() - 0.5) * 260);
    }
    body.dir = body.targetX > body.x ? 1 : -1;
    body.x += Math.sign(body.targetX - body.x) * Math.min(25 * dt, Math.abs(body.targetX - body.x));
    const hoverY = floor - 150 + Math.sin(t / 700) * 10; // above its gravestone
    body.y += (hoverY - body.y) * Math.min(1, dt * 2);
    body.x = clampX(body.x);
    return;
  }
  if (body.mode === 'float') body.mode = 'fall';

  if (body.mode === 'fall') {
    const prevCy = body.y + body.size / 2;
    body.vy += GRAVITY * dt;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    checkBasket(prevCy);
    if (body.x < 0) { body.x = 0; body.vx = -body.vx * 0.5; }
    if (body.x > window.innerWidth - body.size) { body.x = window.innerWidth - body.size; body.vx = -body.vx * 0.5; }
    if (body.y < 0) { body.y = 0; body.vy = Math.abs(body.vy) * 0.3; }
    if (body.y >= floor) {
      body.y = floor;
      if (Math.abs(body.vy) > 500) {
        body.vy = -body.vy * 0.35;
        body.vx *= 0.7;
      } else {
        body.vy = 0;
        body.vx *= 0.82;
        if (Math.abs(body.vx) < 25) { body.mode = 'idle'; body.nextDecision = t + 1200; }
      }
    }
    return;
  }

  body.y = floor;
  if (isMeditating()) { body.mode = 'idle'; body.y = floor - 10 - Math.round(4 + 4 * Math.sin(t / 900)); return; }
  if (['egg', 'sleeping', 'sleepy'].includes(mood) || isDancing()) { body.mode = 'idle'; return; }

  if (body.mode === 'idle' && t > body.nextDecision) {
    const range = 700;
    if (Math.random() < 0.6) {
      body.targetX = clampX(body.x + (Math.random() - 0.5) * range);
      body.mode = 'walk';
    }
    body.nextDecision = t + 2500 + Math.random() * 6000;
  }
  if (body.mode === 'walk') {
    const d = body.targetX - body.x;
    if (Math.abs(d) < 3) { body.mode = 'idle'; return; }
    body.dir = d > 0 ? 1 : -1;
    body.x += body.dir * Math.min(speedFor(mood) * dt, Math.abs(d));
  }
  body.x = clampX(body.x);
}

function ambient(t) {
  if (!S) return;
  const mood = petMood();
  if (mood === 'sleeping' && t - lastParticle.z > 1500) {
    lastParticle.z = t;
    particle('z', 'zzz', { icon: true, scale: 3, ox: body.size * 0.25, oy: 0 });
  }
  if (mood === 'sick' && !isMeditating() && !isDancing() && t - lastParticle.flake > 1800) {
    lastParticle.flake = t;
    particle('germ', 'note', { icon: true, scale: 3, ox: (Math.random() - 0.5) * body.size, oy: 0, dx: 8 });
  }
  if (isMeditating() && t - lastParticle.note > 2200) {
    lastParticle.note = t;
    particle('sparkle', 'note', { icon: true, scale: 3, ox: (Math.random() - 0.5) * body.size * 1.2, oy: body.size * 0.3, dx: 0 });
  }
  if (isDancing() && t - lastParticle.note > 650) {
    lastParticle.note = t;
    particle('note', 'note', { icon: true, scale: 3, ox: (Math.random() - 0.5) * body.size, oy: 0, dx: 12 });
  }
  if (S.weather && S.weather.kind === 'snow' && mood !== 'ghost' && t - lastParticle.flake > 450) {
    lastParticle.flake = t;
    particle('snow', 'flake', { icon: true, scale: 2, ox: (Math.random() - 0.5) * body.size * 1.6, oy: -body.size * 0.6, dx: (Math.random() - 0.5) * 30 });
  }
}

function render(t) {
  petEl.style.transform = `translate(${Math.round(body.x)}px, ${Math.round(body.y)}px)`;
  petEl.classList.toggle('airborne', body.mode === 'fall' && body.y < floorY() - 4);
  if (bubbleEl.classList.contains('show')) shiftFor(bubbleEl, '--shift');
  if (hovering) shiftFor(panelEl, '--pshift');
  drawPet(t);
  updateIcons();
}

// ---------- digital mess: poop on the floor ----------
const POOP_SIZE = 24;
const poops = new Map(); // kind -> { el, x, y, info }
function updatePoop(s) {
  const piles = (s.pet && s.pet.poop) || [];
  const hide = !!s.pet.vacation || !!s.playing;
  for (const [kind, p] of poops) {
    if (!piles.some((x) => x.kind === kind)) {
      // flushed!
      particle('star', 'burst', { icon: true, ox: p.x - body.x - body.size / 2, oy: p.y - body.y, dx: 0, dy: -40 });
      p.el.remove();
      if (p.flies) p.flies.forEach((f) => f.remove());
      poops.delete(kind);
    }
  }
  const flies = !!s.pet.flies && !hide;
  piles.forEach((info) => {
    let p = poops.get(info.kind);
    if (!p) {
      const el = document.createElement('img');
      el.className = 'poop';
      el.src = SP.icon('poop', 3);
      el.title = `${info.label}: ${info.count} (limit ${info.limit})`;
      const spot = Math.max(8, Math.min(window.innerWidth - 40, body.x - 36 - poops.size * 34));
      p = { el, x: spot, y: window.innerHeight - POOP_SIZE - 2, vx: 0, vy: 0, mode: 'rest', info };
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      document.body.appendChild(el);
      poops.set(info.kind, p);
    }
    p.info = info;
    p.el.hidden = hide;
    if (flies && !p.flies) {
      // flies follow the poop around (see stepPoops)
      p.flies = [0, 1].map((i) => {
        const f = document.createElement('img');
        f.className = 'fly';
        f.src = SP.icon('fly', 2);
        f.style.left = `${p.x + 6}px`;
        f.style.top = `${p.y - 10}px`;
        f.style.animationDelay = `${-i * 0.7}s`;
        if (i) f.style.animationDirection = 'reverse';
        document.body.appendChild(f);
        return f;
      });
    } else if (!flies && p.flies) {
      p.flies.forEach((f) => f.remove());
      p.flies = null;
    }
  });
}

// ---------- throwing poop around ----------
const poopFloor = () => window.innerHeight - POOP_SIZE - 2;
function placePoop(p) {
  p.el.style.left = `${Math.round(p.x)}px`;
  p.el.style.top = `${Math.round(p.y)}px`;
  if (p.flies) p.flies.forEach((f) => { f.style.left = `${Math.round(p.x + 6)}px`; f.style.top = `${Math.round(p.y - 10)}px`; });
}
function stepPoops(dt) {
  for (const [, p] of poops) {
    if (p.mode !== 'fall') continue;
    p.vy += GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const maxX = window.innerWidth - POOP_SIZE - 4;
    if (p.x < 4) { p.x = 4; p.vx = -p.vx * 0.5; }
    if (p.x > maxX) { p.x = maxX; p.vx = -p.vx * 0.5; }
    if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * 0.3; }
    // splat on the pet!
    if (!p.hitPet && overPet(p.x + POOP_SIZE / 2, p.y + POOP_SIZE / 2) && Math.hypot(p.vx, p.vy) > 500) {
      p.hitPet = true;
      flashFace('dizzy', 'open', 1400);
      sayLine(['HEY! 💩', 'Ew ew ew!', 'Not at me!!'][Math.floor(Math.random() * 3)], 'poop-hit');
    }
    if (p.y >= poopFloor()) {
      p.y = poopFloor();
      if (Math.abs(p.vy) > 400) { p.vy = -p.vy * 0.35; p.vx *= 0.7; } else {
        p.vy = 0;
        p.vx *= 0.8;
        if (Math.abs(p.vx) < 20) { p.mode = 'rest'; p.hitPet = false; }
      }
    }
    placePoop(p);
  }
}
let poopPress = null; // { kind, sx, sy, ox, oy, moved, samples }
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || overPet(e.clientX, e.clientY)) return;
  const kind = overPoop(e.clientX, e.clientY);
  if (!kind) return;
  const p = poops.get(kind);
  if (p.justThrown || p.mode === 'fall') return; // that was a throw, not a click
  poopPress = { kind, sx: e.clientX, sy: e.clientY, ox: e.clientX - p.x, oy: e.clientY - p.y, moved: false, samples: [{ x: e.clientX, y: e.clientY, t: now() }] };
});
window.addEventListener('mousemove', (e) => {
  if (!poopPress) return;
  const p = poops.get(poopPress.kind);
  if (!p) { poopPress = null; return; }
  if (!poopPress.moved && Math.hypot(e.clientX - poopPress.sx, e.clientY - poopPress.sy) > 5) {
    poopPress.moved = true;
    p.mode = 'drag';
    p.el.classList.add('held');
    tipEl.hidden = true;
  }
  if (poopPress.moved) {
    p.x = e.clientX - poopPress.ox;
    p.y = Math.min(poopFloor(), e.clientY - poopPress.oy);
    placePoop(p);
    poopPress.samples.push({ x: e.clientX, y: e.clientY, t: now() });
    if (poopPress.samples.length > 6) poopPress.samples.shift();
  }
});
window.addEventListener('mouseup', () => {
  if (!poopPress) return;
  const pp = poopPress;
  poopPress = null;
  const p = poops.get(pp.kind);
  if (!p || !pp.moved) return; // a plain click: handled by the click handler (open the messy folder)
  p.el.classList.remove('held');
  const a = pp.samples[0];
  const b = pp.samples[pp.samples.length - 1];
  const dt = Math.max(16, b.t - a.t) / 1000;
  p.vx = Math.max(-2500, Math.min(2500, (b.x - a.x) / dt));
  p.vy = Math.max(-2500, Math.min(2500, (b.y - a.y) / dt));
  p.mode = 'fall';
  p.justThrown = true;
  setTimeout(() => { p.justThrown = false; }, 50);
});

// ---------- toasts (top-right) ----------
const toastsEl = $('toasts');
api.onToast((t) => {
  const card = document.createElement('div');
  card.className = `toast ${t.kind || ''}`;
  const icon = document.createElement('div');
  icon.className = 'toast-icon';
  icon.textContent = t.emoji || '🏆';
  const body2 = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'toast-title';
  title.textContent = t.title || '';
  const text = document.createElement('div');
  text.className = 'toast-text';
  text.textContent = t.text || '';
  body2.append(title, text);
  if (t.sub) {
    const sub = document.createElement('div');
    sub.className = 'toast-sub';
    sub.textContent = t.sub;
    body2.append(sub);
  }
  card.append(icon, body2);
  toastsEl.appendChild(card);
  requestAnimationFrame(() => card.classList.add('in'));
  setTimeout(() => card.classList.add('out'), 4800);
  setTimeout(() => card.remove(), 5400);
  if (t.kind === 'achievement' && S && !S.pet.vacation) { flashFace('happy', 'open', 1500); burst(['star'], 6); }
});


// ---------- basket: toss your pet in for a little joy ----------
const basketEl = $('basket');
const BASKET_W = 20 * 5;
let basketPos = null;
let basketTimer = null;
let tossScored = false;
basketEl.src = SP.icon('basket', 5);
// the basket only shows up about once every 10 pick-ups
function basketDue() {
  let n = 0;
  let next = 10;
  try { n = Number(localStorage.getItem('pickups') || 0) + 1; next = Number(localStorage.getItem('basketAt') || 0) || 8 + Math.floor(Math.random() * 5); } catch { /* fine */ }
  const due = n >= next;
  try {
    localStorage.setItem('pickups', String(due ? 0 : n));
    localStorage.setItem('basketAt', String(due ? 8 + Math.floor(Math.random() * 5) : next));
  } catch { /* fine */ }
  return due;
}
function showBasket() {
  clearTimeout(basketTimer);
  if (!basketPos || basketEl.hidden) {
    // on the other side of the screen from the pet, about halfway up
    const leftSide = body.x > window.innerWidth / 2;
    const x = leftSide ? 80 + Math.random() * (window.innerWidth * 0.3) : window.innerWidth * 0.6 + Math.random() * (window.innerWidth * 0.3 - 100);
    const y = window.innerHeight * (0.45 + Math.random() * 0.2);
    basketPos = { x: Math.round(x), y: Math.round(y) };
    basketEl.style.left = `${basketPos.x}px`;
    basketEl.style.top = `${basketPos.y}px`;
  }
  basketEl.hidden = false;
  basketEl.classList.remove('gone');
}
function hideBasketSoon(ms) {
  clearTimeout(basketTimer);
  basketTimer = setTimeout(() => {
    basketEl.classList.add('gone');
    setTimeout(() => { basketEl.hidden = true; basketPos = null; }, 400);
  }, ms);
}
function checkBasket(prevCy) {
  if (!basketPos || basketEl.hidden || tossScored || body.vy <= 0) return;
  const cx = body.x + body.size / 2;
  const cy = body.y + body.size / 2;
  const rim = basketPos.y + 5;
  if (prevCy < rim && cy >= rim && cx > basketPos.x + 12 && cx < basketPos.x + BASKET_W - 12) {
    tossScored = true;
    basketEl.classList.add('score');
    setTimeout(() => basketEl.classList.remove('score'), 600);
    sayLine(['SWISH! 🏀', 'Nothing but net!', 'Basket!'][Math.floor(Math.random() * 3)], 'basket');
    api.action('basket');
    hideBasketSoon(1500);
  }
}

// ---------- gravestones ----------
const GRAVE_W = 14 * 4;
const GRAVE_H = 15 * 4;
const graves = new Map(); // id -> { el, x }
const graveTop = () => window.innerHeight - GRAVE_H - 16;
function loadGraveSpots() { try { return JSON.parse(localStorage.getItem('graveSpots') || '{}'); } catch { return {}; } }
function saveGraveSpots(spots) { try { localStorage.setItem('graveSpots', JSON.stringify(spots)); } catch { /* fine */ } }
function setGraveX(id, x) {
  const spots = loadGraveSpots();
  spots[id] = Math.round(Math.max(8, Math.min(window.innerWidth - GRAVE_W - 8, x)));
  saveGraveSpots(spots);
}
function graveSpot(id) {
  const g = graves.get(id);
  if (g) return g;
  const spots = loadGraveSpots();
  return { x: spots[id] ?? Math.max(8, window.innerWidth - 420) };
}
function updateGraves(s) {
  const want = new Map();
  if (s.pet.ghost) want.set('ghost', `${s.pet.name}`);
  for (const g of s.graves || []) want.set(g.id, g.name);
  const hide = !!s.playing;
  // the ghost moved on: its grave keeps standing, now as a desktop grave
  if (graves.has('ghost') && !want.has('ghost')) {
    const fresh = [...want.keys()].find((id) => !graves.has(id));
    if (fresh) {
      graves.set(fresh, graves.get('ghost'));
      graves.delete('ghost');
      const spots = loadGraveSpots();
      spots[fresh] = spots.ghost ?? graves.get(fresh).x;
      delete spots.ghost;
      saveGraveSpots(spots);
    }
  }
  for (const [id, g] of graves) {
    if (!want.has(id)) { g.el.classList.add('sink'); setTimeout(() => g.el.remove(), 900); graves.delete(id); }
  }
  const spots = loadGraveSpots();
  let i = 0;
  for (const [id, name] of want) {
    let g = graves.get(id);
    if (!g) {
      // a ghost's grave becomes a desktop grave when it moves on: keep it in the same spot
      let x = spots[id];
      if (x == null && id !== 'ghost' && spots.ghost != null) { x = spots.ghost; delete spots.ghost; spots[id] = x; saveGraveSpots(spots); }
      if (x == null && id === 'ghost' && body.x >= 0) x = body.x + body.size / 2 - GRAVE_W / 2;
      if (x == null) x = 40 + i * 90;
      x = Math.max(8, Math.min(window.innerWidth - GRAVE_W - 8, x));
      const el = document.createElement('div');
      el.className = 'grave';
      const img = document.createElement('img');
      img.src = SP.icon('grave', 4);
      const label = document.createElement('span');
      label.textContent = name;
      el.append(img, label);
      el.style.left = `${x}px`;
      el.style.top = `${graveTop()}px`;
      document.body.appendChild(el);
      g = { el, x };
      graves.set(id, g);
    }
    g.el.hidden = hide;
    g.el.title = id === 'ghost' ? `${name}'s grave — click for how to revive` : `${name}'s grave — click to move it to the cemetery`;
    i += 1;
  }
}
function crumble(id) {
  const g = graves.get(id);
  if (!g) return;
  g.el.classList.add('crumble');
  setTimeout(() => g.el.remove(), 900);
  graves.delete(id);
  const spots = loadGraveSpots();
  delete spots[id];
  saveGraveSpots(spots);
}
function overGrave(x, y) {
  for (const [id, g] of graves) {
    if (g.el.hidden) continue;
    const top = graveTop();
    if (x >= g.x - 4 && x <= g.x + GRAVE_W + 4 && y >= top - 4 && y <= top + GRAVE_H + 18) return id;
  }
  return null;
}
api.onReset(() => {
  saveGraveSpots({});
  for (const [, g] of graves) g.el.remove();
  graves.clear();
  for (const [, p] of poops) { p.el.remove(); if (p.flies) p.flies.forEach((f) => f.remove()); }
  poops.clear();
  body.x = -1;
});

let last = now();
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  step(dt, t);
  stepPoops(dt);
  ambient(t);
  updateBubble();
  render(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- mouse: click-through, pat, drag & toss ----------
function overPoop(x, y) {
  for (const [kind, p] of poops) {
    if (x >= p.x - 4 && x <= p.x + POOP_SIZE + 4 && y >= p.y - 4 && y <= p.y + POOP_SIZE + 4) return kind;
  }
  return null;
}

function overPet(x, y) {
  if (S && (S.pet.vacation || S.playing)) return false;
  const pad = 6;
  return x >= body.x - pad && x <= body.x + body.size + pad && y >= body.y - pad && y <= body.y + body.size + pad;
}

let press = null; // { sx, sy, ox, oy, moved, samples }

window.addEventListener('mousemove', (e) => {
  if (poopPress) { setIgnore(false); return; }
  if (press) {
    const dist = Math.hypot(e.clientX - press.sx, e.clientY - press.sy);
    if (!press.moved && dist > 5) {
      press.moved = true;
      if (petMood() !== 'ghost' && petMood() !== 'egg' && basketDue()) showBasket();
      body.mode = 'drag';
      petEl.classList.add('dragging');
    }
    if (press.moved) {
      body.x = e.clientX - press.ox;
      body.y = Math.min(floorY(), e.clientY - press.oy);
      press.samples.push({ x: e.clientX, y: e.clientY, t: now() });
      if (press.samples.length > 6) press.samples.shift();
    }
    return;
  }
  hovering = overPet(e.clientX, e.clientY);
  petEl.classList.toggle('hover', hovering);
  showTip(hovering ? null : overPoop(e.clientX, e.clientY), e);
  setIgnore(!hovering && !overPoop(e.clientX, e.clientY) && !overGrave(e.clientX, e.clientY));
});

// hover a poop: say what it is
const tipEl = $('tip');
const POOP_HELP = {
  desktop: 'Too many files on your Desktop',
  downloads: 'Too many files in Downloads',
  tabs: 'Too many browser tabs open',
  trash: 'Your Trash is full',
};
function showTip(kind, e) {
  if (!kind) { tipEl.hidden = true; return; }
  const p = poops.get(kind);
  if (!p) { tipEl.hidden = true; return; }
  const i = p.info;
  tipEl.replaceChildren();
  const title = document.createElement('b');
  title.textContent = `💩 ${POOP_HELP[kind] || i.label}`;
  const line = document.createElement('div');
  line.textContent = `${i.count} now · limit ${i.limit}`;
  const how = document.createElement('small');
  how.textContent = 'Drag to throw it around. ' + (S && S.pet.flies ? '🪰 Flies! Your pet will get sick soon. ' : '')
    + (kind === 'tabs' ? 'Close some tabs and it disappears.' : 'Click to open it and tidy up. It disappears when you\'re under the limit.');
  tipEl.append(title, line, how);
  tipEl.hidden = false;
  const w = tipEl.offsetWidth;
  tipEl.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, e.clientX - w / 2))}px`;
  tipEl.style.top = `${p.y - tipEl.offsetHeight - 10}px`;
}

// click a poop: show what's messy and open it
window.addEventListener('click', (e) => {
  const grave = overGrave(e.clientX, e.clientY);
  if (grave && !overPet(e.clientX, e.clientY)) { api.graveClick(grave); return; }
  const kind = overPoop(e.clientX, e.clientY);
  if (!kind) return;
  const p = poops.get(kind);
  sayLine(`${p.info.label}: ${p.info.count} (limit ${p.info.limit}). ${kind === 'tabs' ? 'Close some tabs!' : 'Opening it so you can tidy up!'}`, 'mess');
  api.messClick(kind);
});

document.addEventListener('mouseleave', () => {
  tipEl.hidden = true;
  if (press) return;
  hovering = false;
  petEl.classList.remove('hover');
  setIgnore(true);
});

petEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  press = { sx: e.clientX, sy: e.clientY, ox: e.clientX - body.x, oy: e.clientY - body.y, moved: false, samples: [{ x: e.clientX, y: e.clientY, t: now() }] };
});

window.addEventListener('mouseup', (e) => {
  if (!press) return;
  const p = press;
  press = null;
  petEl.classList.remove('dragging');
  if (!p.moved) {
    if (petMood() === 'ghost') {
      const r = Math.round(S.pet.revive);
      sayLine(r > 0 ? `I'm ${r}% back... keep working! 👻` : 'Ooooo... finish tasks or focus to bring me back! 👻', 'ghost');
      return;
    }
    if (petMood() === 'sleepy') { api.action('lights'); return; } // click = lights off
    api.action('pet');
    if (petMood() !== 'sleeping') hearts(3);
    return;
  }
  const a = p.samples[0];
  const b = p.samples[p.samples.length - 1];
  const dt = Math.max(16, b.t - a.t) / 1000;
  body.vx = Math.max(-2500, Math.min(2500, (b.x - a.x) / dt));
  body.vy = Math.max(-2500, Math.min(2500, (b.y - a.y) / dt));
  body.mode = petMood() === 'ghost' ? 'float' : 'fall';
  tossScored = false;
  hideBasketSoon(4500);
  if (Math.hypot(body.vx, body.vy) > 1500 && petMood() !== 'ghost') {
    sayLine(['WHEEEE!', 'WHOA!!', 'I CAN FLY!'][Math.floor(Math.random() * 3)], 'toss');
    flashFace('dizzy', 'open', 1500);
  }
  hovering = overPet(e.clientX, e.clientY);
  setIgnore(!hovering);
});

// double-click: play (a happy little jump). An egg just hops.
petEl.addEventListener('dblclick', () => {
  if (petMood() === 'egg') { jump(520); return; }
  api.action('play');
});
petEl.addEventListener('contextmenu', (e) => { e.preventDefault(); api.contextMenu(); });

window.addEventListener('resize', () => {
  body.x = clampX(body.x);
  if (body.mode !== 'fall' && body.mode !== 'float') body.y = floorY();
});

api.ready();
