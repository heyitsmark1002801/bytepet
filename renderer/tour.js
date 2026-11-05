// Guided tour: the post-setup walkthrough of the Hub/Tasks window. The ordered
// stops, their targets and copy live in src/tour.js (pure + tested); this file is
// the thin DOM glue — it dims the window, cuts a spotlight hole over the element a
// stop points at, floats an explanatory bubble beside it, and drives Back / Next /
// Skip. It also shows the "Would you like a demo?" offer card after first setup.
(function () {
  const T = window.BytepetTour;
  if (!T) return; // src/tour.js failed to load; fail quiet rather than break the Hub

  const api = window.tasksApi;
  const PAD = 8; // breathing room around a highlighted element
  const GAP = 14; // distance from the element to the bubble

  let root = null; // the overlay root we mount into <body>, or null when idle
  let index = 0;
  let resizeBound = false;

  // Switch Hub tabs by clicking the real tab button, reusing the Hub's own
  // showTab wiring. Returns true if the tab exists.
  function goToTab(tab) {
    const btn = document.querySelector(`#tabs [role="tab"][data-tab="${tab}"]`);
    if (btn) { btn.click(); return true; }
    return false;
  }

  function teardown() {
    if (root) { root.remove(); root = null; }
    document.body.classList.remove('tour-open');
  }

  // Build the overlay scaffold once per tour: four dim panels around a clear
  // spotlight, a highlight ring, and the bubble. We reposition these each step
  // rather than rebuilding, so the dim never flickers between stops.
  function mount() {
    teardown();
    document.body.classList.add('tour-open');
    root = document.createElement('div');
    root.id = 'tour';
    root.innerHTML = `
      <div class="tour-dim tour-top"></div>
      <div class="tour-dim tour-bottom"></div>
      <div class="tour-dim tour-left"></div>
      <div class="tour-dim tour-right"></div>
      <div class="tour-ring" hidden></div>
      <div class="tour-bubble" role="dialog" aria-modal="true" aria-labelledby="tour-title">
        <div class="tour-step"></div>
        <h2 id="tour-title" class="tour-h"></h2>
        <p class="tour-body"></p>
        <div class="tour-actions">
          <button type="button" class="tour-skip ghost-btn">Skip tour</button>
          <span class="tour-spacer"></span>
          <button type="button" class="tour-back ghost-btn">Back</button>
          <button type="button" class="tour-next primary">Next</button>
        </div>
      </div>`;
    document.body.appendChild(root);

    root.querySelector('.tour-skip').addEventListener('click', end);
    root.querySelector('.tour-back').addEventListener('click', () => show(index - 1));
    root.querySelector('.tour-next').addEventListener('click', () => {
      if (T.isLast(index)) { end(); return; }
      show(index + 1);
    });
    // Clicking the dim (but not the bubble) advances, like most product tours.
    for (const d of root.querySelectorAll('.tour-dim')) {
      d.addEventListener('click', () => { if (T.isLast(index)) end(); else show(index + 1); });
    }
    document.addEventListener('keydown', onKey);
    if (!resizeBound) { window.addEventListener('resize', reflow); resizeBound = true; }
  }

  function onKey(e) {
    if (!root) return;
    if (e.key === 'Escape') { e.preventDefault(); end(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); if (T.isLast(index)) end(); else show(index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
  }

  // Lay the four dim panels around a clear rectangle, or dim the whole window
  // (rect === null) for a centred card with no spotlight.
  function setSpotlight(rect) {
    const top = root.querySelector('.tour-top');
    const bottom = root.querySelector('.tour-bottom');
    const left = root.querySelector('.tour-left');
    const right = root.querySelector('.tour-right');
    const ring = root.querySelector('.tour-ring');
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (!rect) {
      top.style.cssText = `top:0;left:0;width:${W}px;height:${H}px`;
      bottom.style.cssText = left.style.cssText = right.style.cssText = 'width:0;height:0';
      ring.hidden = true;
      return;
    }
    const x = Math.max(0, rect.left - PAD);
    const y = Math.max(0, rect.top - PAD);
    const w = Math.min(W - x, rect.width + PAD * 2);
    const hgt = Math.min(H - y, rect.height + PAD * 2);
    top.style.cssText = `top:0;left:0;width:${W}px;height:${y}px`;
    bottom.style.cssText = `top:${y + hgt}px;left:0;width:${W}px;height:${Math.max(0, H - y - hgt)}px`;
    left.style.cssText = `top:${y}px;left:0;width:${x}px;height:${hgt}px`;
    right.style.cssText = `top:${y}px;left:${x + w}px;width:${Math.max(0, W - x - w)}px;height:${hgt}px`;
    ring.hidden = false;
    ring.style.cssText = `top:${y}px;left:${x}px;width:${w}px;height:${hgt}px`;
  }

  // Place the bubble on the requested side of the rect, falling back to whatever
  // side actually has room, then clamping fully inside the window.
  function placeBubble(rect, placement) {
    const bubble = root.querySelector('.tour-bubble');
    bubble.classList.remove('centered');
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const margin = 12;

    if (!rect || placement === 'center') {
      bubble.classList.add('centered');
      bubble.style.left = `${Math.round((W - bw) / 2)}px`;
      bubble.style.top = `${Math.round((H - bh) / 2)}px`;
      return;
    }

    const room = {
      bottom: H - (rect.top + rect.height),
      top: rect.top,
      right: W - (rect.left + rect.width),
      left: rect.left,
    };
    const order = [placement, 'bottom', 'top', 'right', 'left'];
    let side = order.find((s) => (s === 'top' || s === 'bottom' ? room[s] >= bh + GAP + margin : room[s] >= bw + GAP + margin));
    if (!side) { // nowhere fits cleanly — centre it
      bubble.classList.add('centered');
      bubble.style.left = `${Math.round((W - bw) / 2)}px`;
      bubble.style.top = `${Math.round((H - bh) / 2)}px`;
      return;
    }

    let left;
    let top;
    if (side === 'bottom' || side === 'top') {
      left = rect.left + rect.width / 2 - bw / 2;
      top = side === 'bottom' ? rect.top + rect.height + GAP : rect.top - bh - GAP;
    } else {
      top = rect.top + rect.height / 2 - bh / 2;
      left = side === 'right' ? rect.left + rect.width + GAP : rect.left - bw - GAP;
    }
    left = Math.max(margin, Math.min(W - bw - margin, left));
    top = Math.max(margin, Math.min(H - bh - margin, top));
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
  }

  // Redraw the current step's spotlight and bubble (also used on window resize).
  function reflow() {
    if (!root) return;
    const step = T.stepAt(index);
    const el = step.target ? document.querySelector(step.target) : null;
    const rect = el ? el.getBoundingClientRect() : null;
    // Ignore an off-screen / zero-size target: treat it as a centred card.
    const usable = rect && rect.width > 0 && rect.height > 0 ? rect : null;
    setSpotlight(usable);
    placeBubble(usable, step.placement);
  }

  // Show the stop at index i: switch tabs, fill the bubble, then position things
  // after the layout settles (a tab switch can reflow the panel).
  function show(i) {
    if (!root) return;
    index = T.clampIndex(i);
    const step = T.stepAt(index);
    goToTab(step.tab);

    root.querySelector('.tour-step').textContent = `Step ${index + 1} of ${T.totalSteps()}`;
    root.querySelector('.tour-h').textContent = step.title;
    root.querySelector('.tour-body').textContent = step.body;
    root.querySelector('.tour-back').disabled = index === 0;
    root.querySelector('.tour-next').textContent = T.isLast(index) ? 'Done 🎉' : 'Next';

    // Scroll the target into view, then measure on the next frame.
    const el = step.target ? document.querySelector(step.target) : null;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'auto' });
    requestAnimationFrame(() => requestAnimationFrame(reflow));
  }

  function start() {
    mount();
    show(0);
  }

  function end() {
    document.removeEventListener('keydown', onKey);
    teardown();
  }

  // ---------- the "Would you like a demo?" offer card ----------
  function offer() {
    if (document.getElementById('tour-offer')) return;
    const card = document.createElement('div');
    card.id = 'tour-offer';
    card.innerHTML = `
      <div class="tour-offer-card" role="dialog" aria-modal="true" aria-labelledby="tour-offer-title">
        <div class="tour-offer-egg">🥚</div>
        <h2 id="tour-offer-title">Would you like a quick demo?</h2>
        <p>Take a 1-minute guided tour and I'll show you around — how to feed your pet, stay focused and watch it grow.</p>
        <div class="tour-offer-actions">
          <button type="button" class="ghost-btn" id="tour-offer-no">No thanks</button>
          <button type="button" class="primary" id="tour-offer-yes">Yes, show me! ✨</button>
        </div>
      </div>`;
    document.body.appendChild(card);
    const close = () => card.remove();
    card.querySelector('#tour-offer-no').addEventListener('click', close);
    card.querySelector('#tour-offer-yes').addEventListener('click', () => { close(); start(); });
    // Clicking the backdrop (outside the card) dismisses the offer.
    card.addEventListener('click', (e) => { if (e.target === card) close(); });
    setTimeout(() => { const y = card.querySelector('#tour-offer-yes'); if (y) y.focus(); }, 50);
  }

  // Main offers the tour right after first-run setup finishes.
  if (api && api.onOfferTour) api.onOfferTour(offer);

  // Let other code / the Settings tab start the tour on demand.
  window.BytepetStartTour = start;
})();
