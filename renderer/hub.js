// Hub tabs: Pet, Achievements, Games, Memories, Settings (Tasks lives in tasks.js)
(function () {
  const api = window.tasksApi;
  const SP = window.Sprites;
  const $ = (id) => document.getElementById(id);
  const IS_WIN = /Windows/i.test(navigator.userAgent);
  // On Windows there are no per-tab URLs, so strict focus minimises the
  // distracting window instead of closing and saving individual tabs.
  const STRICT_TEXT = IS_WIN
    ? '🔒 Strict: hide distracting apps and minimise distracting windows while focusing'
    : '🔒 Strict: hide distracting apps and close distracting tabs while focusing';
  let hub = null;
  let lastKey = '';
  let settingsFilled = false;

  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of kids) if (c != null) e.append(c);
    return e;
  };
  const fill = (el, ...kids) => el.replaceChildren(...kids.filter((k) => k != null && k !== false));
  const fmtDate = (ms) => new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

  // ---------- tabs ----------
  function showTab(name) {
    const tabs = [...document.querySelectorAll('#tabs [role="tab"]')];
    if (name === 'setup') { api.setupAgain(); name = 'tasks'; }
    if (!tabs.some((t) => t.dataset.tab === name)) name = 'tasks';
    for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === name));
    for (const p of document.querySelectorAll('main[data-panel]')) p.hidden = p.dataset.panel !== name;
    if (name === 'settings' && hub) fillSettings(true);
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('#tabs [role="tab"]').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
  api.onTab(showTab);
  if (location.hash) showTab(location.hash.slice(1));

  // ---------- pet tab ----------
  // ---------- your pet, animated ----------
  const MOOD_FACE = {
    happy: ['open', 'smile'], okay: ['open', 'flat'], hungry: ['open', 'open'], sad: ['sad', 'frown'], tired: ['half', 'flat'],
    sick: ['sad', 'frown'], sleeping: ['closed', 'flat'], sleepy: ['half', 'yawn'], crying: ['cry', 'frown'], away: ['closed', 'smile'],
  };
  let previewKey = '';
  function previewFrame(t) {
    if (hub && !$('pet-preview').closest('main').hidden) {
      const kind = hub.stage === 'egg' ? 'egg' : hub.ghost ? 'ghost' : 'creature';
      const [eyes, mouth] = MOOD_FACE[hub.mood] || MOOD_FACE.okay;
      const blink = t % 4000 < 150;
      const look = {
        kind, stage: hub.stage, form: hub.stage === 'adult' ? hub.form : null, accessory: hub.equipped,
        eyes: blink && eyes === 'open' ? 'closed' : eyes, mouth, bob: Math.floor(t / 600) % 2,
        bed: hub.mood === 'sleeping' || hub.mood === 'sleepy',
        tears: hub.mood === 'crying' ? (Math.floor(t / 350) % 2 ? 'a' : 'b') : null,
        sweat: hub.mood === 'sick' ? (Math.floor(t / 500) % 2 ? 'a' : 'b') : null,
      };
      const key = JSON.stringify(look);
      if (key !== previewKey) {
        previewKey = key;
        SP.draw($('pet-preview'), SP.build(look), 4, kind === 'creature' && hub.mood === 'sick' ? 'sick' : SP.paletteFor(look));
      }
    }
    requestAnimationFrame(previewFrame);
  }
  requestAnimationFrame(previewFrame);

  // What it needs right now, each with the one thing to do about it
  function needRows() {
    const rows = [];
    const n = hub.needs || [];
    const row = (icon, text, label, fn, cls = '') => h('div', { class: `need ${cls}` },
      h('span', { class: 'need-icon' }, icon), h('span', { class: 'need-text' }, text),
      label ? h('button', { class: 'small-btn', onclick: fn }, label) : null);
    if (n.includes('hungry')) rows.push(row('🍙', 'Hungry — finish a task to feed it', 'My tasks', () => showTab('tasks'), 'warn'));
    if (n.includes('sick')) rows.push(row('💊', `Sick — ${hub.updates || 'some'} update${hub.updates === 1 ? '' : 's'} waiting. Installing them is the medicine.`, 'Install', () => api.medicine(), 'bad'));
    for (const p of hub.poop) rows.push(row(hub.flies ? '🪰' : '💩', `${p.label}: ${p.count} (limit ${p.limit})${hub.flies ? ' — flies! clean up before it gets sick' : ''}`, p.kind === 'tabs' ? null : 'Tidy up', () => api.openMess(p.kind), hub.flies ? 'bad' : 'warn'));
    if (n.includes('distracted')) rows.push(row('😢', `Sad from ${hub.distractionSource || 'distractions'} — go back to work`, null, null, 'bad'));
    if (hub.meters.health < 40 && !n.includes('sick')) rows.push(row('💚', `Weak (health ${hub.meters.health}) — keep it fed, clean and away from distractions to heal`, null, null, 'bad'));
    if (n.includes('sleepy') && !hub.asleep) rows.push(row('💡', 'Sleepy — turn the lights off', 'Lights off', () => api.lightsOff(), 'warn'));
    for (const a of hub.alerts || []) rows.push(row('🔔', a));
    if (hub.asleep) rows.push(row(hub.sleepKind === 'night' ? '🌙' : '💤', hub.sleepKind === 'night' ? `Asleep until ${hub.wakeHour}:00` : 'Napping — wakes up when you\'re back'));
    if (!rows.length && !hub.ghost) rows.push(row('✨', `${hub.name} is happy. Nothing needed right now.`, null, null, 'good'));
    return rows;
  }
  const METERS = [['food', '🍙 Food', 5], ['joy', '💗 Joy', 100], ['health', '💚 Health', 100], ['energy', '⚡ Energy', 100], ['discipline', '🎖️ Discipline', 100]];

  function silhouette(look) {
    const map = SP.build(look);
    for (const k of map.keys()) map.set(k, 's');
    return map;
  }

  function renderPet() {
    if (!hub.ghost && hub.stage !== 'egg') {
      fill($('pet-needs'), ...needRows());
      fill($('pet-meters'), ...METERS.map(([k, label, max]) => {
        const v = hub.meters[k];
        const pct = Math.round((v / max) * 100);
        return h('div', { class: `pm ${k} ${pct < 25 ? 'low' : ''}` },
          h('span', { class: 'pm-label' }, label),
          h('div', { class: 'pm-bar' }, h('i', { style: `width:${Math.max(3, pct)}%` })),
          h('span', { class: 'pm-val' }, k === 'food' ? `${Math.round(v * 10) / 10}/5` : String(v)));
      }));
    } else {
      fill($('pet-needs'));
      fill($('pet-meters'), hub.stage === 'egg' ? h('p', { class: 'help' }, '🥚 Hatching soon!') : null);
    }
    const stage = hub.ghost ? 'ghost 👻' : hub.stage === 'adult' ? (hub.formName || hub.form) : hub.stage;
    $('pet-title').textContent = hub.name;
    $('pet-sub').textContent = `Gen ${hub.generation} · ${stage} · born ${fmtDate(hub.born)}`;
    fill($('pet-alert'), hub.sleepy && !hub.asleep && !hub.ghost
      ? h('div', { class: 'ghost-card sleepy-card' }, h('span', {}, `💡 ${hub.name} is sleepy and wants the lights off.`),
        h('button', { class: 'primary', onclick: () => api.lightsOff() }, '💡 Lights off'))
      : hub.asleep ? h('p', { class: 'help' }, hub.sleepKind === 'night' ? `🌙 ${hub.name} is asleep until ${hub.wakeHour}:00.` : `💤 ${hub.name} is napping. It wakes up when you're back.`)
        : null,
    hub.ghost ? h('div', { class: 'ghost-card' },
      h('div', { class: 'now-head' }, `👻 ${hub.name} is a ghost${hub.ghostDaysLeft != null ? ` · ${hub.ghostDaysLeft} day${hub.ghostDaysLeft === 1 ? '' : 's'} left` : ''}`),
      h('div', { class: 'bar revive' }, h('i', { style: `width:${Math.round(hub.revive || 0)}%` })),
      h('p', { class: 'help' }, `Revive ${Math.round(hub.revive || 0)}% — finish tasks (S +20%, M +35%, L +60%) or a focus session (+20%).`),
      h('div', { class: 'row-left' },
        h('button', { class: 'primary', onclick: () => showTab('tasks') }, '✅ My tasks'),
        h('button', { onclick: () => api.startFocus(25) }, '🎯 Focus 25 min'),
        h('button', { class: 'ghost-btn', onclick: () => api.letRest() }, 'Let them rest…'))) : null);
    $('pet-age').textContent = hub.age;
    $('pet-streak').textContent = hub.streak;
    $('pet-best').textContent = hub.bestStreak > hub.streak ? `(${hub.bestStreak})` : '';
    $('pet-mistakes').textContent = hub.careMistakes;

    // growing up: which form it's heading for
    const leaning = hub.petdex.find((f) => f.id === hub.leaning);
    fill($('growing'),
      hub.ghost ? h('p', { class: 'help' }, `Revive ${hub.name} to keep growing.`)
        : hub.stage === 'adult' ? h('p', { class: 'leaning' }, `${hub.name} grew into a `, h('b', {}, hub.formName), '.')
          : hub.stage === 'egg' ? h('p', { class: 'help' }, 'Still an egg. Hatching soon!')
            : h('p', { class: 'leaning' }, `Growing into a `, h('b', {}, leaning ? leaning.name : '?'),
              leaning ? h('small', {}, ` — ${leaning.desc.toLowerCase()}`) : null));

    // petdex
    const found = hub.petdex.filter((f) => f.found).length;
    $('dex-count').textContent = `${found}/${hub.petdex.length}`;
    fill($('petdex'), ...hub.petdex.map((f) => {
      const c = h('canvas', {});
      const look = { kind: 'creature', stage: 'adult', form: f.id, eyes: 'open', mouth: f.id === 'grumpy' ? 'flat' : 'smile' };
      SP.draw(c, f.found ? SP.build(look) : silhouette(look), 3, 'lcd');
      return h('div', { class: `dex ${f.found ? 'got' : 'locked'}` }, c,
        h('div', { class: 'dex-name' }, f.found ? f.name : '???'),
        h('div', { class: 'dex-desc' }, f.desc));
    }));

    $('items').replaceChildren(
      h('button', { class: `item ${!hub.equipped ? 'on' : ''}`, onclick: () => api.equip(null) }, h('span', { class: 'item-name' }, 'Nothing'), h('small', {}, 'Just me')),
      ...hub.unlocks.map((u) => {
        const b = h('button', { class: `item ${hub.equipped === u.id ? 'on' : ''} ${u.unlocked ? '' : 'locked'}` },
          h('span', { class: 'item-name' }, u.unlocked ? u.name : `🔒 ${u.name}`),
          h('small', {}, u.unlocked ? (hub.equipped === u.id ? 'Wearing' : 'Put on') : `${u.streak}-day streak`));
        if (u.unlocked) b.addEventListener('click', () => api.equip(u.id));
        else b.disabled = true;
        return b;
      }),
    );

    $('vacation-btn').textContent = hub.vacation ? '🏠 Come back home' : '🧳 Vacation';
    $('retire-btn').hidden = !hub.canRetire;
  }
  $('vacation-btn').addEventListener('click', () => api.vacation(!hub.vacation));
  $('retire-btn').addEventListener('click', () => {
    if (window.confirm(`Retire ${hub.name}? They'll rest in the cemetery with their lifetime stats, and a new egg will hatch.`)) api.retire();
  });

  // ---------- achievements ----------
  function renderAchievements() {
    const got = hub.achievements.filter((a) => a.at).length;
    const total = hub.achievements.length;
    $('ach-count').textContent = `${got}/${total}`;
    $('ach-summary').textContent = `${got} of ${total} unlocked`;
    $('ach-bar').style.width = `${(got / total) * 100}%`;
    const sorted = hub.achievements.slice().sort((a, b) => (b.at ? 1 : 0) - (a.at ? 1 : 0));
    $('ach-grid').replaceChildren(...sorted.map((a) => h('div', { class: `ach ${a.at ? 'got' : 'locked'}`, title: a.desc },
      h('div', { class: 'ach-emoji' }, a.at ? a.emoji : '🔒'),
      h('div', { class: 'ach-name' }, a.name),
      h('div', { class: 'ach-desc' }, a.desc),
      a.at ? h('div', { class: 'ach-date' }, fmtDate(a.at)) : null)));
  }

  // ---------- games ----------
  function renderGames() {
    $('game-list').replaceChildren(...hub.games.map((g) => h('div', { class: 'game' },
      h('div', { class: 'game-emoji' }, g.emoji),
      h('div', { class: 'game-main' },
        h('div', { class: 'game-name' }, g.name),
        h('div', { class: 'game-desc' }, g.desc),
        hub.highScores[g.id] ? h('div', { class: 'game-best' }, `Best: ${hub.highScores[g.id]}`) : null),
      h('button', { class: 'primary', onclick: () => api.play(g.id) }, 'Play'))));
  }

  // ---------- memories: postcards & graveyard ----------
  const SKY = {
    beach: '#8ed1ff', city: '#ffb59a', mountains: '#a9d8ff', snow: '#1d2a5a', desert: '#ffd59a', forest: '#bfe8c0',
    temple: '#ffc9d6', tower: '#bcd7ff', pyramids: '#ffe1a8', canals: '#ffd0b0', tropical: '#7fe0ff', home: '#cfe3ff',
  };
  function drawScene(c, scene) {
    const S = 4;
    const w = 60;
    const hgt = 36;
    c.width = w * S;
    c.height = hgt * S;
    const x = c.getContext('2d');
    const px = (col, cx, cy, cw = 1, ch = 1) => { x.fillStyle = col; x.fillRect(cx * S, cy * S, cw * S, ch * S); };
    px(SKY[scene] || '#8ed1ff', 0, 0, w, hgt);
    if (scene === 'snow') {
      for (let i = 0; i < 40; i++) px(i % 3 ? '#7cf2c0' : '#c79cff', (i * 7) % w, 3 + (i % 4), 3, 1); // aurora
      px('#ffffff', 0, 26, w, 10);
      for (let i = 0; i < 25; i++) px('#fff', (i * 13) % w, (i * 7) % 24, 1, 1);
    } else {
      px('#ffe066', 46, 4, 6, 6); // sun
    }
    if (scene === 'beach') { px('#3a8fd8', 0, 22, w, 6); px('#ffe3a3', 0, 28, w, 8); px('#6b4b2a', 10, 14, 1, 14); px('#4caf50', 7, 12, 7, 3); }
    if (scene === 'city') { [[4, 12], [11, 18], [17, 8], [25, 15], [32, 10], [40, 16], [47, 12], [54, 19]].forEach(([bx, top]) => { px('#5b4b8a', bx, top, 6, 36 - top); for (let y = top + 2; y < 32; y += 4) px('#ffe066', bx + 2, y, 2, 2); }); }
    if (scene === 'mountains') { for (let i = 0; i < 30; i++) { px('#6c7a91', 10 + i, 30 - Math.min(i, 30 - i), 1, Math.min(i, 30 - i) + 6); px('#8a97ad', 30 + i, 30 - Math.min(i, 30 - i) * 0.8, 1, 36); } px('#fff', 24, 16, 2, 2); px('#3d8b52', 0, 30, w, 6); }
    if (scene === 'desert') { px('#f0b85a', 0, 26, w, 10); for (let i = 0; i < 16; i++) px('#e09a3a', 10 + i, 26 - Math.min(i, 16 - i), 1, 10); px('#3a7d44', 44, 18, 2, 10); px('#3a7d44', 42, 21, 2, 2); }
    if (scene === 'forest') { px('#3d8b52', 0, 28, w, 8); for (let t = 0; t < 7; t++) { const tx = 3 + t * 8; px('#6b4b2a', tx + 2, 22, 2, 8); for (let r = 0; r < 4; r++) px('#2f7a45', tx + 1 - r + 1, 12 + r * 3, 4 + r * 2 - 2, 3); } }
    if (scene === 'tower') {
      px('#7cc47a', 0, 31, w, 5);
      [[28, 6, 4], [27, 12, 6], [26, 18, 8], [24, 24, 12], [22, 28, 16]].forEach(([tx, ty, tw]) => px('#7a6a58', tx, ty, tw, 2));
      px('#7a6a58', 29, 2, 2, 28); px('#7a6a58', 23, 28, 2, 4); px('#7a6a58', 35, 28, 2, 4);
      px('#7a6a58', 26, 20, 1, 8); px('#7a6a58', 33, 20, 1, 8);
    }
    if (scene === 'pyramids') {
      px('#f0c070', 0, 28, w, 8);
      for (let i = 0; i < 14; i++) { px(i % 2 ? '#d9a24a' : '#e8b25a', 14 + i, 28 - i, 28 - i * 2, 1); }
      for (let i = 0; i < 8; i++) px('#e8b25a', 40 + i, 28 - i, 16 - i * 2, 1);
    }
    if (scene === 'canals') {
      px('#5aa0d8', 0, 28, w, 8);
      [[2, 12, '#e07a5f'], [12, 9, '#f2cc8f'], [22, 13, '#81b29a'], [32, 10, '#e07a5f'], [42, 12, '#f2cc8f'], [52, 9, '#81b29a']].forEach(([bx, top, col]) => {
        px(col, bx, top, 8, 28 - top); px('#3d405b', bx + 2, top + 4, 2, 3); px('#3d405b', bx + 5, top + 4, 2, 3);
      });
      px('#3d2b1f', 18, 30, 16, 2); px('#3d2b1f', 32, 27, 1, 3);
    }
    if (scene === 'tropical') {
      px('#2bb3c0', 0, 22, w, 7); px('#ffe9b0', 0, 29, w, 7);
      [[40, 10], [50, 13]].forEach(([tx, ty]) => { px('#8a5a2b', tx, ty, 2, 29 - ty); px('#2f9e44', tx - 5, ty - 2, 12, 2); px('#2f9e44', tx - 3, ty - 4, 8, 2); });
    }
    if (scene === 'home') {
      px('#7cc47a', 0, 30, w, 6);
      px('#f4e3c3', 22, 16, 20, 14); px('#c0504d', 20, 14, 24, 3); px('#c0504d', 24, 11, 16, 3); px('#c0504d', 28, 8, 8, 3);
      px('#6b4b2a', 30, 22, 5, 8); px('#8ed1ff', 24, 19, 4, 4); px('#8ed1ff', 37, 19, 4, 4);
    }
    if (scene === 'temple') { px('#7cc47a', 0, 30, w, 6); px('#d64545', 18, 14, 24, 2); px('#d64545', 22, 16, 2, 14); px('#d64545', 36, 16, 2, 14); px('#d64545', 20, 19, 20, 1); px('#ff9fc0', 4, 8, 6, 4); px('#ff9fc0', 50, 10, 6, 4); }
    // the pet, waving
    const pet = document.createElement('canvas');
    SP.draw(pet, SP.build({ kind: 'creature', stage: 'baby', eyes: 'happy', mouth: 'open', arms: ['upRight'] }), 2, 'lcd');
    x.drawImage(pet, 3 * S, 13 * S, 64, 64);
  }

  function renderMemories() {
    $('postcards').replaceChildren(...(hub.postcards.length ? hub.postcards.map((p) => {
      const c = h('canvas', { class: 'scene' });
      drawScene(c, p.scene);
      return h('div', { class: 'postcard' }, c,
        h('div', { class: 'pc-body' },
          h('div', { class: 'pc-place' }, p.staycation ? `${p.flag || '🏠'} Staycation at ${p.place}` : `${p.flag || '🌍'} Greetings from ${p.place}!`),
          h('div', { class: 'pc-note' }, `"${p.note}"`),
          h('div', { class: 'pc-date' }, `${fmtDate(p.date)} · ${p.days} day${p.days === 1 ? '' : 's'} away`)));
    }) : [h('p', { class: 'empty' }, 'No postcards yet. Go on vacation for a day or more and your pet brings one back from wherever you went.')]));

    $('graveyard').replaceChildren(...(hub.graveyard.length ? hub.graveyard.map((g) => h('div', { class: 'stone' },
      h('div', { class: 'stone-top' }, 'R.I.P.'),
      h('div', { class: 'stone-name' }, g.name),
      h('div', { class: 'stone-dates' }, `${fmtDate(g.born)} – ${fmtDate(g.died)}`),
      h('div', { class: 'stone-cause' }, g.cause === 'retired' ? `Retired happily as a ${g.form || g.stage}` : g.cause === 'rested' ? 'Laid to rest' : 'Faded away as a ghost'),
      h('div', { class: 'stone-stats' },
        `${g.age} yrs · ${g.stats.tasks} tasks · ${g.stats.focusSessions} focus · ${g.stats.breaks} breaks · ${g.careMistakes} mistakes`)))
      : [h('p', { class: 'empty' }, 'Empty, for now. Pets that retire or pass on rest here.')]));
  }

  // ---------- focus ----------
  const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
  function meter(label, value, max, warn) {
    const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
    return h('div', { class: 'meter-row' },
      h('div', { class: 'meter-label' }, label),
      h('div', { class: `bar ${warn ? 'warn' : ''}` }, h('i', { style: `width:${pct}%` })));
  }
  function renderFocus(f) {
    if (!f) return;
    const n = f.now;
    let state;
    if (!f.isMac) state = h('div', { class: 'now-line' }, 'Detection only works on a Mac.');
    else if (!n) state = h('div', { class: 'now-line' }, f.selfInFront ? 'Switch to another app for a few seconds, then come back here.' : 'Looking…');
    else {
      const what = [n.app, n.site].filter(Boolean).join(' · ') || 'Nothing in front';
      const dot = n.frontDistracting ? '🟥' : n.learning ? '📚' : '🟩';
      const verdict = n.frontDistracting ? `Distraction (${n.reason})` : n.learning ? 'Learning — doesn\'t count' : 'Not a distraction';
      const bg = n.background || [];
      state = h('div', {},
        h('div', { class: 'now-line big-line' }, `${dot} ${what}`),
        n.title ? h('div', { class: 'now-title' }, `“${n.title}”`) : null,
        h('div', { class: 'now-line' }, verdict, h('small', {}, ` · ${f.selfInFront ? 'last app before you opened this window' : `checked ${n.ago}s ago`}`)),
        n.frontDistracting ? h('div', { class: 'row-left' },
          h('button', { class: 'small-btn', onclick: () => api.neverDistracting(n.site || n.app) }, `${n.site || n.app} isn't a distraction for me`)) : null,
        bg.length ? h('div', { class: 'bg-list' },
          h('div', { class: 'now-head' }, `🟥 Still open (${bg.length}) — quit ${bg.length === 1 ? 'it' : 'them'} (⌘Q) or close the tab to cheer your pet up`),
          ...bg.map((b) => h('div', { class: 'bg-row' },
            h('span', {}, `${b.source}`, h('small', {}, ` · ${b.reason}`)),
            h('button', { class: 'small-btn', onclick: () => api.neverDistracting(b.source) }, 'not a distraction')))) : null);
    }
    fill($('f-now'), h('div', { class: 'now-head' }, 'Right now'), state,
      !f.counting && f.why ? h('div', { class: 'paused' }, `⏸ Not counting: ${f.why}`) : null);

    fill($('f-meters'),
      f.inRow >= f.after
        ? meter(`Distracted ${f.inRow} min in a row — ${hub ? hub.name : 'your pet'} is sad`, 1, 1, true)
        : meter(`Distracted ${f.inRow} of ${f.after} min in a row before ${hub ? hub.name : 'your pet'} gets sad`, f.inRow, f.after, false),
      meter(`Discipline ${f.discipline}/100`, f.discipline, 100, f.discipline < 30),
      f.sad ? h('p', { class: 'sad-note' }, '😢 Your pet is sad. Switch to a work app to cheer it up, or take a break.') : null);

    const saved = f.savedTabs || [];
    fill($('f-strict'),
      f.inFocus
        ? h('div', { class: 'focus-running' }, `🧘 Focusing${f.focusLeft ? ` · ${f.focusLeft} left` : ''}`, h('small', {}, f.strict ? ' · 🔒 strict' : ''))
        : h('div', { class: 'row-left' },
          h('button', { class: 'primary big', onclick: () => api.startFocus(25) }, '🧘 Focus 25 min'),
          h('button', { onclick: () => api.startFocus(50) }, '50 min')),
      h('label', { class: 'toggle' }, (() => {
        const box = h('input', { type: 'checkbox' });
        box.checked = f.strict;
        box.addEventListener('change', () => api.setStrict(box.checked));
        return box;
      })(), h('span', {}, STRICT_TEXT)),
      saved.length ? h('div', { class: 'saved' },
        h('div', { class: 'now-head' }, `🔖 Saved for later (${saved.length})`),
        ...saved.slice(0, 10).map((t) => h('div', { class: 'bg-row' },
          h('span', { class: 'saved-title' }, t.title || t.url),
          h('button', { class: 'small-btn', onclick: () => api.openTab(t.url) }, 'Open'))),
        h('div', { class: 'row-left' },
          h('button', { onclick: () => api.reopenTabs() }, `Reopen all ${saved.length}`),
          h('button', { class: 'ghost-btn', onclick: () => api.clearTabs() }, 'Clear list'))) : null);

    $('f-break').replaceChildren(...(f.breakLeft
      ? [h('span', { class: 'on-break' }, `🍿 On a break — ${f.breakLeft} min left`), h('button', { onclick: () => api.endBreak() }, 'End break')]
      : [15, 30, 60].map((m) => h('button', { onclick: () => api.takeBreak(m) }, `${m} min`))));

    const t = f.today;
    const maxSrc = Math.max(1, ...t.sources.map((x) => x[1]));
    $('f-today').replaceChildren(
      h('div', { class: 'today-split' },
        h('div', {}, h('b', {}, fmtMin(t.work)), h('span', {}, 'in work apps')),
        h('div', {}, h('b', {}, fmtMin(t.distracted)), h('span', {}, 'distracted'))),
      ...(t.sources.length ? t.sources.map(([src, m]) => h('div', { class: 'src-row' },
        h('span', { class: 'src-name' }, src),
        h('div', { class: 'bar dis' }, h('i', { style: `width:${Math.round((m / maxSrc) * 100)}%` })),
        h('span', { class: 'src-min' }, fmtMin(m)))) : [h('p', { class: 'empty' }, 'No distractions today. 🌟')]));

    const maxDay = Math.max(30, ...f.week.map((d) => d.work + d.distracted));
    $('f-week').replaceChildren(...f.week.map((d) => h('div', { class: 'day', title: `${d.label}: ${fmtMin(d.work)} work, ${fmtMin(d.distracted)} distracted` },
      h('div', { class: 'stack' },
        h('i', { class: 'dis', style: `height:${(d.distracted / maxDay) * 100}%` }),
        h('i', { class: 'work', style: `height:${(d.work / maxDay) * 100}%` })),
      h('span', {}, d.label))));

    const det = [];
    for (const b of f.browsers) {
      det.push(h('div', { class: 'now-row' }, `${b.status === 'ok' ? '✅' : b.status === 'denied' ? '⚠️' : '•'} ${b.name}: ${
        b.status === 'ok' ? 'reading tabs' : b.status === 'denied' ? 'not allowed — System Settings → Privacy & Security → Automation → Terminal → turn it on' : 'no window open'}`));
    }
    if (f.frontDebug && !f.frontDebug.name) det.push(h('div', { class: 'now-row' }, `⚠️ Can't tell which app is in front (${f.frontDebug.via}${f.frontDebug.error ? `: ${f.frontDebug.error}` : ''}). Please send this line to Claude.`));
    if (f.accessibilityOk === false) det.push(h('div', { class: 'now-row' }, '⚠️ Window titles (Firefox): turn on Terminal in System Settings → Privacy & Security → Accessibility'));
    if (!det.length) det.push(h('div', { class: 'now-row' }, 'Open YouTube in your browser to test. macOS will ask once to allow it.'));
    det.push(h('p', { class: 'help' }, 'Bytepet checks every 15 seconds. A minute counts as distracted when at least half of its checks were. Only the app in front counts, and in a browser only the active tab.'));
    $('f-detect').replaceChildren(...det);
  }

  // ---------- setup lives in its own window now ----------
  $('s-setup').addEventListener('click', () => api.setupAgain());
  $('s-tour').addEventListener('click', () => { if (window.BytepetStartTour) window.BytepetStartTour(); });
  $('s-test-notify').addEventListener('click', async () => {
    const r = await api.testNotify();
    $('s-notify-status').textContent = !r.supported ? 'Notifications aren\'t supported here.'
      : !r.enabled ? 'Notifications are off (menu bar → Notifications).'
        : 'Sent! Nothing? System Settings → Notifications → Bytepet → Allow.';
  });
  $('s-reset-progress').addEventListener('click', () => api.reset('progress'));
  $('s-reset-all').addEventListener('click', () => api.reset('everything'));
  $('s-debug').addEventListener('click', async () => {
    await api.copyDebug();
    $('s-debug-status').textContent = 'Copied ✓ — paste it into your bug report';
    setTimeout(() => { $('s-debug-status').textContent = ''; }, 4000);
  });
  $('s-log').addEventListener('click', () => api.openLog());

  // ---------- settings ----------
  function fillSettings(force) {
    if (settingsFilled && !force) return;
    const s = hub.settings;
    $('s-name').value = s.name;
    $('s-apps').value = s.distractionApps.join('\n');
    $('s-sites').value = s.distractionSites.join('\n');
    $('s-keywords').value = s.distractionKeywords.join('\n');
    $('s-after').value = s.distractedAfterMinutes;
    $('s-allow').value = s.distractionAllowanceMinutes;
    $('s-work').value = s.workApps.join('\n');
    $('s-screen').value = s.screenLimitMinutes;
    $('s-mess').checked = s.checkMess;
    $('s-m-desktop').value = s.messLimits.desktop;
    $('s-m-downloads').value = s.messLimits.downloads;
    $('s-m-tabs').value = s.messLimits.tabs;
    $('s-m-trash').value = s.messLimits.trash;
    $('s-location').checked = s.locationLookup;
    $('s-never').value = (s.neverDistracting || []).join('\n');
    $('s-learning').value = (s.learningKeywords || []).join('\n');
    $('s-cat-game').checked = s.countCategories.game !== false;
    $('s-cat-ent').checked = s.countCategories.entertainment !== false;
    $('s-cat-social').checked = s.countCategories.social !== false;
    $('s-watch').value = s.watchIdleMinutes;
    $('s-bg').checked = s.countBackground;
    const sch = s.distractionSchedule;
    document.querySelectorAll('input[name="s-mode"]').forEach((r) => { r.checked = r.value === sch.mode; });
    $('s-days').replaceChildren(...['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => {
      const box = h('input', { type: 'checkbox', value: String(i) });
      box.checked = sch.days.includes(i);
      return h('label', { class: 'toggle' }, box, d);
    }));
    $('s-start').value = sch.start;
    $('s-end').value = sch.end;
    $('s-pc-hours').value = s.postcardAfterHours;
    $('s-strict').checked = s.strictFocus;
    if (IS_WIN) {
      const span = $('s-strict').closest('label').querySelector('span');
      if (span) span.innerHTML = '<b>Strict focus:</b> during focus sessions, hide distracting apps and minimise distracting windows';
    }
    $('s-notify').checked = s.notifications;
    $('s-toasts').checked = s.toasts;
    $('s-sounds').checked = s.sounds !== false;
    $('s-checkin').checked = s.morningCheckin;
    $('s-bed').value = s.bedtimeHour;
    $('s-wake').value = s.wakeHour;
    $('s-quiet-pet').checked = s.quietPet;
    $('s-q-start').value = s.quietStart;
    $('s-q-end').value = s.quietEnd;
    $('s-q-max').value = s.maxNotificationsPerDay;
    $('s-login').checked = s.openAtLogin;
    $('s-login').disabled = !s.packaged;
    $('s-login-help').textContent = s.packaged ? '' : 'Works once you build and use Bytepet.app (see README → "Build the app").';
    const pf = s.perf || {};
    $('s-perf').textContent = `Speed check: each look around takes ~${pf.avgMs || 0} ms, Bytepet uses ${pf.cpu || 0}% CPU.${pf.slowed ? ' Checking less often to save battery.' : ''}`;
    settingsFilled = true;
  }
  $('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api.saveSettings({
      name: $('s-name').value,
      distractionApps: $('s-apps').value,
      distractionSites: $('s-sites').value,
      distractionKeywords: $('s-keywords').value,
      distractedAfterMinutes: $('s-after').value,
      distractionAllowanceMinutes: $('s-allow').value,
      workApps: $('s-work').value,
      screenLimitMinutes: $('s-screen').value,
      checkMess: $('s-mess').checked,
      locationLookup: $('s-location').checked,
      neverDistracting: $('s-never').value,
      learningKeywords: $('s-learning').value,
      countCategories: { game: $('s-cat-game').checked, entertainment: $('s-cat-ent').checked, social: $('s-cat-social').checked },
      watchIdleMinutes: $('s-watch').value,
      countBackground: $('s-bg').checked,
      distractionSchedule: {
        mode: (document.querySelector('input[name="s-mode"]:checked') || {}).value || 'always',
        days: [...document.querySelectorAll('#s-days input:checked')].map((b) => Number(b.value)),
        start: $('s-start').value,
        end: $('s-end').value,
      },
      postcardAfterHours: $('s-pc-hours').value,
      strictFocus: $('s-strict').checked,
      notifications: $('s-notify').checked,
      toasts: $('s-toasts').checked,
      sounds: $('s-sounds').checked,
      morningCheckin: $('s-checkin').checked,
      bedtimeHour: $('s-bed').value,
      wakeHour: $('s-wake').value,
      quietPet: $('s-quiet-pet').checked,
      quietStart: $('s-q-start').value,
      quietEnd: $('s-q-end').value,
      maxNotificationsPerDay: $('s-q-max').value,
      ...(hub.settings.packaged ? { openAtLogin: $('s-login').checked } : {}),
      messLimits: { desktop: $('s-m-desktop').value, downloads: $('s-m-downloads').value, tabs: $('s-m-tabs').value, trash: $('s-m-trash').value },
    });
    $('s-status').textContent = 'Saved ✓';
    setTimeout(() => { $('s-status').textContent = ''; }, 3000);
    const v = await api.get();
    hub = v.hub;
    fillSettings(true);
  });

  // ---------- update ----------
  let lastFocusKey = '';
  function render(view) {
    if (!view || !view.hub) return;
    const fk = JSON.stringify(view.focusTab);
    if (fk !== lastFocusKey) { lastFocusKey = fk; hub = view.hub; renderFocus(view.focusTab); }
    hub = view.hub;
    const key = JSON.stringify(hub);
    if (key === lastKey) return;
    lastKey = key;
    renderPet();
    renderAchievements();
    renderGames();
    renderMemories();
    fillSettings(false);
  }
  api.onUpdate(render);
  api.get().then(render);
})();
