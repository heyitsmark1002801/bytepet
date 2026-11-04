// Bytepet mini-games, played right on top of your desktop.
// brick: Brick Breaker · catch: Snack Catch · guess: Left or Right · memory: Memory Beeps · stretch: Stretch Break
const api = window.gameApi;
const SP = window.Sprites;
const $ = (id) => document.getElementById(id);
const GAME = new URLSearchParams(location.search).get('game') || 'brick';
const canvas = $('stage');
const ctx = canvas.getContext('2d');
let W = 0;
let H = 0;
let info = { stage: 'baby', form: null, equipped: null, highScores: {} };
let stopLoop = null;
let reported = false;

// ---------- shared helpers ----------
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { quit(); return; }
  keys.add(e.key);
});
window.addEventListener('keyup', (e) => keys.delete(e.key));
let mouseX = null;
window.addEventListener('mousemove', (e) => { mouseX = e.clientX; });

const petCache = new Map();
function petImage(look, scale) {
  const full = { kind: 'creature', stage: info.stage, form: info.form, accessory: info.equipped, eyes: 'open', mouth: 'smile', ...look };
  const key = JSON.stringify(full) + scale;
  if (!petCache.has(key)) {
    const c = document.createElement('canvas');
    SP.draw(c, SP.build(full), scale, SP.paletteFor(full), !!full.flip);
    petCache.set(key, c);
  }
  return petCache.get(key);
}
function drawPet(look, x, y, scale) {
  const size = SP.GRID * scale;
  ctx.drawImage(petImage(look, scale), x, y, size, size);
}

// small pixel sprites drawn straight onto the canvas
function drawPixels(rows, colors, x, y, s) {
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const col = colors[row[c]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x + c * s, y + r * s, s, s);
    }
  });
}
const INK = '#2d2440';
const CANDY = ['#ff8fab', '#ffd23f', '#9be8c9', '#8ec9ff', '#b4a4ff', '#ffb37a'];

function hud({ score, lives, best }) {
  $('g-score').textContent = score != null ? `Score ${score}` : '';
  $('g-lives').textContent = lives != null ? '♥'.repeat(Math.max(0, lives)) : '';
  $('g-best').textContent = best ? `Best ${best}` : '';
}

function finish({ score, won, title, text }) {
  if (stopLoop) stopLoop();
  if (!reported) { reported = true; api.result({ game: GAME, score, won }); }
  const best = Math.max(score, info.highScores[GAME] || 0);
  info.highScores[GAME] = best;
  $('o-title').textContent = title || (won ? 'You win!' : 'Game over');
  $('o-text').textContent = text || `Score: ${score} · Best: ${best}`;
  $('overlay').hidden = false;
  $('again').focus();
}

function quit() { api.close(); }
$('quit').addEventListener('click', quit);
$('exit').addEventListener('click', quit);
$('again').addEventListener('click', () => {
  $('overlay').hidden = true;
  reported = false;
  start();
});

function loop(stepFn) {
  let last = performance.now();
  let alive = true;
  const frame = (t) => {
    if (!alive) return;
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    stepFn(dt, t);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  stopLoop = () => { alive = false; };
}

// a little sound (square-wave beep)
let audio = null;
function beep(freq, ms = 160) {
  try {
    audio = audio || new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.value = 0.05;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + ms / 1000);
  } catch { /* no sound */ }
}

// ---------- 1. Brick Breaker ----------
function brickBreaker() {
  canvas.hidden = false;
  $('panel').hidden = true;
  const PET_SCALE = 3;
  const paddle = { w: 130, h: 12, x: W / 2 - 65, y: H - 70 };
  const ball = { x: 0, y: 0, vx: 0, vy: 0, r: 7, stuck: true, speed: 430 };
  const bricks = [];
  const bw = 70;
  const bh = 24;
  const gap = 8;
  const cols = Math.max(6, Math.min(14, Math.floor((W - 80) / (bw + gap))));
  const rows = 6;
  const left = (W - cols * (bw + gap) + gap) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      bricks.push({ x: left + c * (bw + gap), y: 90 + r * (bh + gap), alive: true, color: CANDY[r % CANDY.length] });
    }
  }
  let score = 0;
  let lives = 3;
  let happyUntil = 0;
  hud({ score, lives, best: info.highScores.brick });

  const launch = () => {
    if (!ball.stuck) return;
    ball.stuck = false;
    const a = (-Math.PI / 2) + (Math.random() - 0.5) * 0.8;
    ball.vx = Math.cos(a) * ball.speed;
    ball.vy = Math.sin(a) * ball.speed;
  };
  const onClick = () => launch();
  window.addEventListener('mousedown', onClick);

  loop((dt, t) => {
    // paddle: mouse or arrow keys
    if (keys.has('ArrowLeft')) paddle.x -= 700 * dt;
    if (keys.has('ArrowRight')) paddle.x += 700 * dt;
    if (keys.has(' ')) launch();
    if (mouseX != null && !keys.has('ArrowLeft') && !keys.has('ArrowRight')) paddle.x = mouseX - paddle.w / 2;
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

    if (ball.stuck) {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r - 2;
    } else {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); beep(330, 40); }
      if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); beep(330, 40); }
      if (ball.y < 70 + ball.r) { ball.y = 70 + ball.r; ball.vy = Math.abs(ball.vy); beep(330, 40); }
      // paddle bounce: where it hits decides the angle
      if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y + ball.r <= paddle.y + paddle.h + 10
        && ball.x >= paddle.x - ball.r && ball.x <= paddle.x + paddle.w + ball.r) {
        const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        const angle = -Math.PI / 2 + hit * 1.05;
        ball.speed = Math.min(780, ball.speed + 6);
        ball.vx = Math.cos(angle) * ball.speed;
        ball.vy = Math.sin(angle) * ball.speed;
        ball.y = paddle.y - ball.r;
        beep(520, 50);
      }
      // bricks
      for (const b of bricks) {
        if (!b.alive) continue;
        if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + bw && ball.y + ball.r > b.y && ball.y - ball.r < b.y + bh) {
          b.alive = false;
          score += 10;
          happyUntil = t + 400;
          const overlapX = Math.min(ball.x + ball.r - b.x, b.x + bw - (ball.x - ball.r));
          const overlapY = Math.min(ball.y + ball.r - b.y, b.y + bh - (ball.y - ball.r));
          if (overlapX < overlapY) ball.vx = -ball.vx; else ball.vy = -ball.vy;
          beep(660 + Math.random() * 200, 60);
          hud({ score, lives, best: info.highScores.brick });
          break;
        }
      }
      if (ball.y > H + 20) {
        lives -= 1;
        beep(140, 300);
        hud({ score, lives, best: info.highScores.brick });
        ball.stuck = true;
        ball.speed = 430;
        if (lives <= 0) {
          window.removeEventListener('mousedown', onClick);
          finish({ score, won: false });
          return;
        }
      }
      if (bricks.every((b) => !b.alive)) {
        window.removeEventListener('mousedown', onClick);
        finish({ score: score + lives * 50, won: true, title: 'Brick Buster!', text: `Every brick smashed! Score ${score + lives * 50}` });
        return;
      }
    }

    // draw
    ctx.clearRect(0, 0, W, H);
    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = INK;
      ctx.fillRect(b.x - 3, b.y - 3, bw + 6, bh + 6);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.fillRect(b.x, b.y, bw, 5);
    }
    // ball
    ctx.fillStyle = '#fff';
    ctx.fillRect(ball.x - ball.r - 2, ball.y - ball.r - 2, ball.r * 2 + 4, ball.r * 2 + 4);
    ctx.fillStyle = INK;
    ctx.fillRect(ball.x - ball.r, ball.y - ball.r, ball.r * 2, ball.r * 2);
    // paddle: your pet surfing a platform
    ctx.fillStyle = '#fff';
    ctx.fillRect(paddle.x - 3, paddle.y - 3, paddle.w + 6, paddle.h + 6);
    ctx.fillStyle = INK;
    ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(paddle.x + 4, paddle.y + 3, paddle.w - 8, 4);
    const petSize = SP.GRID * PET_SCALE;
    const joy = t < happyUntil;
    drawPet({ eyes: joy ? 'happy' : 'open', mouth: joy ? 'open' : 'smile', arms: joy ? ['upLeft', 'upRight'] : [] },
      paddle.x + paddle.w / 2 - petSize / 2, paddle.y - petSize + 4, PET_SCALE);
    if (ball.stuck) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Click or press Space to launch · move with the mouse or ← →', W / 2, H - 20);
    }
  });
}

// ---------- 2. Snack Catch ----------
const FOOD = ['..ooo..', '.oxxxo.', 'oxxxxxo', 'oxxxxxo', 'ooooooo', '.ooooo.'];
const HEART = ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
const STAR = ['...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '.yy.yy.', 'y.....y'];
const BUG = ['o.....o', '.o...o.', '..ggg..', '.gogog.', 'ggggggg', '.gogog.', 'o.g.g.o'];
const ITEM_COLORS = { o: INK, x: '#fffaf0', r: '#ef5a6f', y: '#ffd23f', g: '#6ab04c' };

function snackCatch() {
  canvas.hidden = false;
  $('panel').hidden = true;
  const PET_SCALE = 3;
  const size = SP.GRID * PET_SCALE;
  const pet = { x: W / 2 - size / 2, y: H - size - 10 };
  const items = [];
  let score = 0;
  let lives = 3;
  let spawn = 0;
  let elapsed = 0;
  let face = { until: 0, eyes: 'open', mouth: 'smile' };
  hud({ score, lives, best: info.highScores.catch });

  loop((dt, t) => {
    elapsed += dt;
    if (keys.has('ArrowLeft')) pet.x -= 650 * dt;
    if (keys.has('ArrowRight')) pet.x += 650 * dt;
    if (mouseX != null && !keys.has('ArrowLeft') && !keys.has('ArrowRight')) pet.x += (mouseX - size / 2 - pet.x) * Math.min(1, dt * 14);
    pet.x = Math.max(0, Math.min(W - size, pet.x));

    // spawn faster over time; bugs get more common
    spawn -= dt;
    if (spawn <= 0) {
      spawn = Math.max(0.35, 1.1 - elapsed * 0.012);
      const bug = Math.random() < Math.min(0.4, 0.18 + elapsed * 0.004);
      items.push({
        x: 40 + Math.random() * (W - 80), y: 60,
        vy: 160 + Math.random() * 80 + elapsed * 3,
        kind: bug ? 'bug' : ['food', 'heart', 'star'][Math.floor(Math.random() * 3)],
      });
    }

    for (const it of items) {
      it.y += it.vy * dt;
      const cx = it.x + 14;
      const cy = it.y + 14;
      if (cy > pet.y + 10 && cy < pet.y + size && cx > pet.x + 6 && cx < pet.x + size - 6) {
        it.done = true;
        if (it.kind === 'bug') {
          lives -= 1;
          face = { until: t + 700, eyes: 'dizzy', mouth: 'open' };
          beep(140, 250);
        } else {
          score += it.kind === 'star' ? 3 : 1;
          face = { until: t + 350, eyes: 'happy', mouth: 'open' };
          beep(600 + score * 4, 60);
        }
        hud({ score, lives, best: info.highScores.catch });
      } else if (it.y > H) it.done = true;
    }
    for (let i = items.length - 1; i >= 0; i--) if (items[i].done) items.splice(i, 1);
    if (lives <= 0) { finish({ score, won: score >= 30 }); return; }

    ctx.clearRect(0, 0, W, H);
    for (const it of items) {
      const rows = { food: FOOD, heart: HEART, star: STAR, bug: BUG }[it.kind];
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(it.x - 3, it.y - 3, 7 * 4 + 6, rows.length * 4 + 6);
      drawPixels(rows, ITEM_COLORS, it.x, it.y, 4);
    }
    const f = t < face.until ? face : { eyes: 'open', mouth: 'open' };
    drawPet({ eyes: f.eyes, mouth: f.mouth, arms: ['upLeft', 'upRight'] }, pet.x, pet.y, PET_SCALE);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Menlo, monospace';
    ctx.textAlign = 'center';
    if (elapsed < 4) ctx.fillText('Catch snacks (★ = 3 points). Avoid the green bugs!', W / 2, H - size - 30);
  });
}

// ---------- 3. Left or Right ----------
function leftOrRight() {
  canvas.hidden = true;
  const panel = $('panel');
  panel.hidden = false;
  const ROUNDS = 5;
  let round = 0;
  let score = 0;
  const results = [];
  let busy = false;
  hud({ score, best: info.highScores.guess });

  const pet = document.createElement('canvas');
  pet.className = 'guess-pet';
  const draw = (look) => SP.draw(pet, SP.build({ kind: 'creature', stage: info.stage, form: info.form, accessory: info.equipped, eyes: 'open', mouth: 'smile', ...look }), 7, SP.paletteFor({ kind: 'creature', stage: info.stage, form: info.form }));
  draw({});

  const resultEl = Object.assign(document.createElement('p'), { className: 'result', textContent: 'Which way will I look?' });
  const dots = Object.assign(document.createElement('div'), { className: 'dots' });
  const renderDots = () => dots.replaceChildren(...Array.from({ length: ROUNDS }, (_, i) => {
    const d = document.createElement('div');
    d.className = `dot ${results[i] === true ? 'ok' : results[i] === false ? 'no' : ''}`;
    return d;
  }));
  renderDots();
  const leftBtn = Object.assign(document.createElement('button'), { className: 'big', textContent: '◀ Left' });
  const rightBtn = Object.assign(document.createElement('button'), { className: 'big', textContent: 'Right ▶' });
  const row = Object.assign(document.createElement('div'), { className: 'row' });
  row.append(leftBtn, rightBtn);
  const card = Object.assign(document.createElement('div'), { className: 'card' });
  const h = Object.assign(document.createElement('h2'), { textContent: 'Left or Right?' });
  card.append(h, pet, row, resultEl, dots);
  panel.replaceChildren(card);

  const guess = (dir) => {
    if (busy || round >= ROUNDS) return;
    busy = true;
    const look = Math.random() < 0.5 ? 'left' : 'right';
    const eyes = look === 'left' ? 'lookLeft' : 'lookRight';
    const arms = look === 'left' ? ['upLeft'] : ['upRight'];
    draw({ eyes, arms, mouth: 'flat' });
    const ok = dir === look;
    results.push(ok);
    if (ok) score += 1;
    round += 1;
    renderDots();
    hud({ score, best: info.highScores.guess });
    setTimeout(() => {
      draw({ eyes: ok ? 'happy' : eyes, arms, mouth: ok ? 'open' : 'frown' });
      resultEl.textContent = ok ? 'Yes! You read my mind!' : `Nope, I looked ${look}!`;
      beep(ok ? 700 : 180, ok ? 120 : 260);
    }, 350);
    setTimeout(() => {
      busy = false;
      if (round >= ROUNDS) {
        finish({ score, won: score >= 3, title: score >= 3 ? 'You win!' : 'I win!', text: `${score} out of ${ROUNDS} right.` });
      } else {
        draw({});
        resultEl.textContent = 'Which way will I look?';
      }
    }, 1300);
  };
  leftBtn.onclick = () => guess('left');
  rightBtn.onclick = () => guess('right');
  const onKey = (e) => {
    if (!$('overlay').hidden) return;
    if (e.key === 'ArrowLeft') guess('left');
    if (e.key === 'ArrowRight') guess('right');
  };
  window.addEventListener('keydown', onKey);
  stopLoop = () => window.removeEventListener('keydown', onKey);
  leftBtn.focus();
}

// ---------- 4. Memory Beeps ----------
function memoryBeeps() {
  canvas.hidden = true;
  const panel = $('panel');
  panel.hidden = false;
  const PADS = [
    { color: '#ef5a6f', freq: 330, key: '1' },
    { color: '#ffd23f', freq: 415, key: '2' },
    { color: '#5fbf9c', freq: 494, key: '3' },
    { color: '#8ec9ff', freq: 587, key: '4' },
  ];
  const seq = [];
  let pos = 0;
  let listening = false;
  let score = 0;
  hud({ score, best: info.highScores.memory });

  const card = Object.assign(document.createElement('div'), { className: 'card' });
  const h = Object.assign(document.createElement('h2'), { textContent: 'Memory Beeps' });
  const msg = Object.assign(document.createElement('p'), { textContent: 'Watch, then repeat the pattern (click, or keys 1–4).' });
  const grid = Object.assign(document.createElement('div'), { className: 'pads' });
  const buttons = PADS.map((p, i) => {
    const b = document.createElement('button');
    b.className = 'pad';
    b.style.background = p.color;
    b.textContent = p.key;
    b.setAttribute('aria-label', `Pad ${p.key}`);
    b.onclick = () => press(i);
    grid.append(b);
    return b;
  });
  card.append(h, msg, grid);
  panel.replaceChildren(card);

  const flash = (i, ms = 380) => new Promise((res) => {
    buttons[i].classList.add('lit');
    beep(PADS[i].freq, ms - 60);
    setTimeout(() => { buttons[i].classList.remove('lit'); setTimeout(res, 120); }, ms);
  });

  async function playSeq() {
    listening = false;
    buttons.forEach((b) => { b.disabled = true; });
    msg.textContent = `Round ${seq.length}: watch…`;
    await new Promise((r) => setTimeout(r, 600));
    const speed = Math.max(220, 420 - seq.length * 18);
    for (const i of seq) await flash(i, speed);
    pos = 0;
    listening = true;
    buttons.forEach((b) => { b.disabled = false; });
    msg.textContent = 'Your turn!';
  }
  function next() {
    seq.push(Math.floor(Math.random() * 4));
    playSeq();
  }
  async function press(i) {
    if (!listening) return;
    await flash(i, 200);
    if (i !== seq[pos]) {
      listening = false;
      beep(120, 400);
      finish({ score, won: score >= 8, text: `You remembered ${score} in a row. Best: ${Math.max(score, info.highScores.memory || 0)}` });
      return;
    }
    pos += 1;
    if (pos >= seq.length) {
      score = seq.length;
      hud({ score, best: info.highScores.memory });
      msg.textContent = 'Nice!';
      setTimeout(next, 500);
    }
  }
  const onKey = (e) => {
    const i = PADS.findIndex((p) => p.key === e.key);
    if (i >= 0 && $('overlay').hidden) press(i);
  };
  window.addEventListener('keydown', onKey);
  stopLoop = () => window.removeEventListener('keydown', onKey);
  next();
}

// ---------- 5. Stretch Break ----------
const MOVES = [
  { name: 'Reach up high', how: 'Stretch both arms to the ceiling. Breathe in.', look: { arms: ['upLeft', 'upRight'], eyes: 'closed', mouth: 'smile' } },
  { name: 'Lean left', how: 'Right arm over your head, lean gently to the left.', look: { arms: ['upRight', 'downLeft'], eyes: 'happy', mouth: 'flat' }, shake: -1 },
  { name: 'Lean right', how: 'Left arm over your head, lean gently to the right.', look: { arms: ['upLeft', 'downRight'], eyes: 'happy', mouth: 'flat' }, shake: 1 },
  { name: 'Shoulder rolls', how: 'Roll your shoulders backwards slowly. Five times.', look: { arms: ['downLeft', 'downRight'], eyes: 'closed', mouth: 'flat' }, bob: true },
  { name: 'Look left & right', how: 'Turn your head slowly to each side. Rest your eyes on something far away.', look: { eyes: 'open', mouth: 'smile' }, turn: true },
  { name: 'Wrist stretch', how: 'Arm out, palm up, gently pull your fingers back. Then switch.', look: { arms: ['upLeft'], eyes: 'open', mouth: 'flat' } },
  { name: 'Stand up & shake', how: 'Stand up and shake out your arms and legs!', look: { arms: ['upLeft', 'upRight'], eyes: 'happy', mouth: 'open' }, dance: true },
  { name: 'Deep breath', how: 'In for 4… hold for 4… out for 4. Ahh.', look: { eyes: 'closed', mouth: 'smile' }, bob: true },
];
const MOVE_SECONDS = 15;

function stretchBreak() {
  canvas.hidden = true;
  const panel = $('panel');
  panel.hidden = false;
  let i = 0;
  let elapsed = 0;
  hud({});
  const card = Object.assign(document.createElement('div'), { className: 'card' });
  const h = Object.assign(document.createElement('h2'), { textContent: 'Stretch Break' });
  const pet = Object.assign(document.createElement('canvas'), { className: 'stretch-pet' });
  const move = Object.assign(document.createElement('p'), { className: 'move' });
  const how = Object.assign(document.createElement('p'), { className: 'how' });
  const timer = Object.assign(document.createElement('div'), { className: 'timer' });
  const bar = document.createElement('i');
  timer.append(bar);
  const count = Object.assign(document.createElement('div'), { className: 'step-count' });
  const skip = Object.assign(document.createElement('button'), { textContent: 'Next move ▶' });
  const row = Object.assign(document.createElement('div'), { className: 'row' });
  row.append(skip);
  card.append(h, pet, move, how, timer, row, count);
  panel.replaceChildren(card);

  const show = () => {
    move.textContent = MOVES[i].name;
    how.textContent = MOVES[i].how;
    count.textContent = `Move ${i + 1} of ${MOVES.length}`;
    elapsed = 0;
    beep(520, 120);
  };
  const advance = () => {
    i += 1;
    if (i >= MOVES.length) {
      finish({ score: MOVES.length, won: true, title: 'All stretched!', text: 'Your body thanks you. +10 energy for your pet.' });
      return;
    }
    show();
  };
  skip.onclick = advance;
  show();

  loop((dt, t) => {
    elapsed += dt;
    bar.style.width = `${Math.min(100, (elapsed / MOVE_SECONDS) * 100)}%`;
    const m = MOVES[i];
    if (!m) return;
    const beat = Math.floor(t / 400) % 2;
    const look = { kind: 'creature', stage: info.stage, form: info.form, accessory: info.equipped, ...m.look };
    if (m.shake) look.shake = m.shake;
    if (m.bob) look.bob = beat;
    if (m.dance) { look.arms = beat ? ['upLeft', 'downRight'] : ['downLeft', 'upRight']; look.feet = beat ? 'stepA' : 'stepB'; }
    const flip = m.turn ? Math.floor(t / 1500) % 2 === 1 : false;
    SP.draw(pet, SP.build(look), 7, SP.paletteFor(look), flip);
    if (elapsed >= MOVE_SECONDS) advance();
  });
}

// ---------- start ----------
const STARTERS = { brick: brickBreaker, catch: snackCatch, guess: leftOrRight, memory: memoryBeeps, stretch: stretchBreak };
const TITLES = { brick: 'Brick Breaker', catch: 'Snack Catch', guess: 'Left or Right', memory: 'Memory Beeps', stretch: 'Stretch Break' };
function start() {
  if (stopLoop) stopLoop();
  ctx.clearRect(0, 0, W, H);
  $('g-title').textContent = TITLES[GAME] || 'Game';
  (STARTERS[GAME] || brickBreaker)();
}

api.info().then((i) => {
  info = { ...info, ...i, highScores: { ...(i && i.highScores) } };
  start();
});
