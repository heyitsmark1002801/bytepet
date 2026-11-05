// First-run setup (and "Run setup again"): one question per screen.
(function () {
  const api = window.tasksApi;
  const SP = window.Sprites;
  const $ = (id) => document.getElementById(id);
  const first = new URLSearchParams(location.search).get('first') === '1';

  const STEPS = ['hello', 'name', 'distractions', 'work', 'permissions', 'rhythm', 'ready'];
  let at = 0;
  let s = null; // current settings from the app
  const chosen = { apps: new Set(), sites: new Set(), work: new Set() };
  const options = { apps: [], sites: [], work: [] };

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
  const petName = () => $('name').value.trim() || 'Byte';

  // ---------- the egg ----------
  function drawEgg(id, t = 0) {
    const c = $(id);
    if (!c || !SP) return;
    const wobble = t % 2600 < 500 ? [-1, 0, 1, 0][Math.floor(t / 110) % 4] : 0;
    SP.draw(c, SP.build({ kind: 'egg', shake: wobble }), 5, 'egg');
  }
  (function animate(t) {
    const step = STEPS[at];
    if (step === 'hello') drawEgg('egg-hello', t);
    if (step === 'name') drawEgg('egg-name', t);
    if (step === 'ready') drawEgg('egg-ready', t * 1.6);
    requestAnimationFrame(animate);
  })(0);

  // ---------- checklists ----------
  function renderList(kind, el) {
    el.replaceChildren(...options[kind].map((name) => {
      const box = h('input', { type: 'checkbox' });
      box.checked = chosen[kind].has(name);
      box.addEventListener('change', () => { if (box.checked) chosen[kind].add(name); else chosen[kind].delete(name); });
      return h('label', { title: name }, box, name);
    }));
  }
  function renderLists() {
    renderList('apps', $('apps'));
    renderList('sites', $('sites'));
    renderList('work', $('work'));
  }
  function addOwn(form, kindFor) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      let v = input.value.trim();
      if (!v) return;
      const kind = kindFor(v);
      if (kind === 'sites') v = v.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
      if (!options[kind].includes(v)) options[kind].push(v);
      chosen[kind].add(v);
      input.value = '';
      renderLists();
    });
  }
  addOwn($('add-distraction'), (v) => (/\.[a-z]{2,}(\/|$)/i.test(v) ? 'sites' : 'apps'));
  addOwn($('add-work'), () => 'work');

  // ---------- permissions ----------
  function renderPerms(list) {
    $('perms').replaceChildren(...list.map((c) => h('div', { class: 'perm' },
      h('span', { class: 'mark' }, c.ok === true ? '✅' : c.ok === false ? '⚠️' : '○'),
      h('div', { class: 'text' }, h('b', {}, c.label), h('small', {}, c.why)),
      h('button', { type: 'button', onclick: async () => renderPerms(await api.setupTest(c.id)) }, 'Test'),
      c.ok === true ? null : h('button', { type: 'button', onclick: () => api.setupFix(c.fix) }, 'Fix'))));
  }

  // ---------- times ----------
  const hourLabel = (hr) => new Date(2000, 0, 1, hr).toLocaleTimeString([], { hour: 'numeric' });
  function fillHours(sel, value) {
    sel.replaceChildren(...Array.from({ length: 24 }, (_, hr) => h('option', { value: String(hr) }, hourLabel(hr))));
    sel.value = String(value);
  }

  // ---------- moving between steps ----------
  function show(i) {
    at = Math.max(0, Math.min(STEPS.length - 1, i));
    const step = STEPS[at];
    document.querySelectorAll('.step').forEach((el) => { el.hidden = el.dataset.step !== step; });
    $('dots').replaceChildren(...STEPS.map((_, j) => h('i', { class: j === at ? 'on' : j < at ? 'done' : '' })));
    $('back').style.visibility = at === 0 ? 'hidden' : 'visible';
    const next = $('next');
    next.disabled = false;
    next.textContent = at === 0 ? (first ? "Let's start" : 'Start') : step === 'ready' ? (first ? 'Place my egg 🥚' : 'Save') : 'Next';
    if (step === 'name') { setTimeout(() => $('name').focus(), 50); }
    if (step === 'permissions') api.setupChecks().then(renderPerms);
    if (step === 'ready') {
      $('ready-title').textContent = first ? `Ready, ${petName()}?` : 'All set';
      $('ready-text').textContent = first
        ? `${petName()} will appear at the bottom-right of your screen and hatch in a few seconds. Click it to say hi.`
        : 'Your changes will be saved.';
    }
    document.querySelector('main').scrollTop = 0;
  }
  $('back').addEventListener('click', () => show(at - 1));
  $('next').addEventListener('click', async () => {
    if (STEPS[at] !== 'ready') { show(at + 1); return; }
    $('next').disabled = true;
    await api.setupDone({
      name: petName(),
      distractionApps: [...chosen.apps],
      distractionSites: [...chosen.sites],
      workApps: [...chosen.work],
      bedtimeHour: $('bed').value,
      wakeHour: $('wake').value,
      morningCheckin: $('t-checkin').checked,
      countBackground: $('t-bg').checked,
      strictFocus: $('t-strict').checked,
      notifications: $('t-notify').checked,
      sounds: $('t-sounds').checked,
    });
  });
  $('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') show(at + 1); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'INPUT') $('next').click();
  });

  // ---------- start ----------
  api.get().then((v) => {
    s = v.hub.settings;
    $('hello-title').textContent = first ? 'Hi there!' : 'Setup';
    $('name').value = first ? '' : s.name || '';
    const merge = (a, b) => [...new Set([...(a || []), ...(b || [])])];
    options.apps = merge(s.suggest.apps, s.distractionApps);
    options.sites = merge(s.suggest.sites, s.distractionSites);
    options.work = merge(s.suggest.work, s.workApps);
    chosen.apps = new Set(s.distractionApps);
    chosen.sites = new Set(s.distractionSites);
    chosen.work = new Set(s.workApps);
    renderLists();
    fillHours($('bed'), s.bedtimeHour);
    fillHours($('wake'), s.wakeHour);
    $('t-checkin').checked = s.morningCheckin;
    $('t-bg').checked = s.countBackground;
    $('t-strict').checked = s.strictFocus;
    // Windows minimises the distracting window instead of closing/saving tabs.
    if (/Windows/i.test(navigator.userAgent)) {
      const small = $('t-strict').closest('label').querySelector('small');
      if (small) small.textContent = 'During focus sessions, hide distracting apps and minimise distracting windows';
    }
    $('t-notify').checked = s.notifications;
    $('t-sounds').checked = s.sounds !== false;
    show(Number(new URLSearchParams(location.search).get('step')) || 0);
  });
})();
