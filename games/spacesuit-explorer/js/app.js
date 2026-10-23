// SpaceSuit Explorer: screens, mission flow, dress-up, scoring and saved progress.
(function () {
  const SSE = window.SSE;
  const $ = (id) => document.getElementById(id);
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Saved progress ----------
  const fresh = () => ({ v: 1, points: 0, done: {}, badges: [], avatar: 'ava', read: [] });
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SSE.STORE_KEY));
      if (s && s.v === 1) return Object.assign(fresh(), s);
    } catch (_) { /* storage blocked or corrupt: start fresh */ }
    return fresh();
  }
  let store = load();
  function save() { try { localStorage.setItem(SSE.STORE_KEY, JSON.stringify(store)); } catch (_) { /* private mode */ } }

  const avatar = () => SSE.AVATARS.find((a) => a.id === store.avatar) || SSE.AVATARS[0];
  const isUnlocked = (m) => m.num === 1 || !!store.done[SSE.MISSIONS[m.num - 2].id];

  // ---------- Small UI helpers ----------
  function toast(text, tone) {
    const t = document.createElement('div');
    t.className = 'toast' + (tone ? ' ' + tone : '');
    t.textContent = text;
    const box = $('toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    box.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // Promise-based dialog. buttons: [{ label, value, cls }]
  let modalResolve = null;
  function modal({ icon, title, html, buttons }) {
    const dlg = $('modal');
    if (dlg.open) dlg.close('replaced');
    $('modalIcon').textContent = icon || '';
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = html || '';
    const row = $('modalBtns');
    row.innerHTML = '';
    (buttons || [{ label: 'OK', value: 'ok', cls: 'primary' }]).forEach((b) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'btn ' + (b.cls || '');
      el.textContent = b.label;
      el.addEventListener('click', () => dlg.close(b.value));
      row.appendChild(el);
    });
    return new Promise((resolve) => {
      modalResolve = resolve;
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      const first = row.querySelector('.primary') || row.querySelector('button');
      if (first) first.focus();
    });
  }
  $('modal').addEventListener('close', () => {
    const r = modalResolve; modalResolve = null;
    if (r) r($('modal').returnValue || 'cancel');
  });

  function earn(id) {
    if (store.badges.includes(id)) return false;
    store.badges.push(id);
    save();
    const b = SSE.BADGES.find((x) => x.id === id);
    toast(`${b.icon} Badge earned: ${b.name}!`, 'gold');
    return true;
  }

  function updateHud() { $('hudPoints').textContent = store.points; }

  // ---------- Router ----------
  const SCREENS = ['welcome', 'howto', 'missions', 'mission', 'encyclopedia', 'achievements'];
  let current = 'welcome';
  let run = null;

  function show(name) {
    current = name;
    for (const s of SCREENS) $('scr-' + s).hidden = s !== name;
    window.scrollTo(0, 0);
    $('main').focus({ preventScroll: true });
  }

  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('mission-')) {
      const m = SSE.mission(h.slice(8));
      if (m && isUnlocked(m)) { if (!run || run.mission.id !== m.id || current !== 'mission') startMission(m.id); return; }
      location.replace('#missions');
      return;
    }
    run = null;
    const name = SCREENS.includes(h) && h !== 'mission' ? h : 'welcome';
    RENDER[name]();
    show(name);
  }
  window.addEventListener('hashchange', route);

  async function go(name) {
    if (current === 'mission' && run && run.step !== 'debrief') {
      const r = await modal({ icon: '🛑', title: 'Leave this mission?', html: '<p>Your progress on this mission will not be saved.</p>',
        buttons: [{ label: 'Stay', value: 'stay', cls: 'primary' }, { label: 'Leave mission', value: 'leave' }] });
      if (r !== 'leave') return;
      run = null;
    }
    if (location.hash === '#' + name) route(); else location.hash = name;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) { e.preventDefault(); go(b.dataset.go); }
  });

  // ---------- Screens ----------
  const RENDER = {
    welcome() {
      $('welcomeArt').innerHTML = SSE.drawAstronaut(avatar(), {
        suit: 'eva-suit', helmet: 'eva-helmet', comms: 'comm-cap', gloves: 'eva-gloves', boots: 'eva-boots',
        backpack: 'pls', tether: 'safety-tether', protect: 'safer'
      }, { mood: 'happy', title: `${avatar().name}, a friendly astronaut in a spacewalk suit, waving hello` });
    },
    howto() {},
    missions() {
      $('avatarRow').innerHTML = SSE.AVATARS.map((a) => `
        <button type="button" class="avatar-btn" data-avatar="${a.id}" aria-pressed="${a.id === store.avatar}">
          ${SSE.drawAstronaut(a, { suit: 'station-clothes' }, { mood: 'happy', title: a.name })}<span>${a.name}</span>
        </button>`).join('');
      const doneCount = Object.keys(store.done).length;
      $('missionProgress').innerHTML = `<b>${doneCount}/6</b> missions complete <span class="bar"><i style="width:${doneCount / 6 * 100}%"></i></span>`;
      $('missionGrid').innerHTML = SSE.MISSIONS.map((m) => {
        const open = isUnlocked(m);
        const d = store.done[m.id];
        const stars = d ? '★'.repeat(d.stars) + '☆'.repeat(3 - d.stars) : '';
        return `<article class="mcard${open ? '' : ' locked'}" style="--mc:${m.color}">
          <div class="mart">${SSE.missionArt(m.id)}${m.concept ? '<span class="concept-tag">Future concept</span>' : ''}</div>
          <div class="mbody">
            <p class="kicker">Mission ${m.num} · ${m.place}</p>
            <h3>${m.title}</h3>
            <p>${m.blurb}</p>
            <p class="obj"><b>You'll learn:</b> ${m.objective}</p>
            <div class="mfoot">
              <span class="diff" aria-label="Difficulty ${m.difficulty} of 3">${'●'.repeat(m.difficulty)}${'○'.repeat(3 - m.difficulty)} ${['', 'Easy', 'Medium', 'Hard'][m.difficulty]}</span>
              ${stars ? `<span class="stars-earned" aria-label="${d.stars} stars earned">${stars}</span>` : ''}
            </div>
            ${open
              ? `<button class="btn primary" type="button" data-start="${m.id}">${d ? 'Play again' : 'Start mission'} ▸</button>`
              : `<button class="btn" type="button" disabled>🔒 Finish Mission ${m.num - 1} to unlock</button>`}
          </div>
        </article>`;
      }).join('');
    },
    encyclopedia() { renderEncyclopedia(SSE.TOPICS[0].id); },
    achievements() { renderAchievements(); }
  };

  $('avatarRow').addEventListener('click', (e) => {
    const b = e.target.closest('[data-avatar]');
    if (!b) return;
    store.avatar = b.dataset.avatar; save();
    for (const el of $('avatarRow').querySelectorAll('[data-avatar]')) el.setAttribute('aria-pressed', el === b);
    toast(`${avatar().name} is ready for adventure!`);
  });
  $('missionGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-start]');
    if (b) location.hash = 'mission-' + b.dataset.start;
  });

  // ---------- Mission flow ----------
  const STEPS = ['dress', 'inspect', 'checklist', 'play', 'debrief'];

  function startMission(id) {
    const mission = SSE.mission(id);
    run = { mission, outfit: {}, step: 'dress', points: 0, mistakes: 0, failedChecks: 0, checked: false, selected: null, tab: 'suit', pop: null };
    $('mKicker').textContent = `Mission ${mission.num} · ${mission.place}`;
    $('t-mission').textContent = mission.title;
    $('scr-mission').style.setProperty('--mc', mission.color);
    show('mission');
    goStep('dress');
  }

  function award(pts, label) {
    run.points += pts;
    $('runPoints').textContent = run.points;
    toast(`+${pts} ${label}`, 'good');
  }

  function goStep(step) {
    run.step = step;
    const idx = STEPS.indexOf(step);
    for (const li of $('stepper').children) {
      const i = STEPS.indexOf(li.dataset.step);
      li.className = i < idx ? 'done' : i === idx ? 'now' : '';
      if (i === idx) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    }
    $('runPoints').textContent = run.points;
    STEP_RENDER[step]();
    window.scrollTo(0, 0);
    const h = $('stepBody').querySelector('h3');
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }

  const STEP_RENDER = {
    dress: renderDress,
    inspect: renderInspect,
    checklist: renderChecklist,
    play: renderPlay,
    debrief: renderDebrief
  };

  // ----- Dress -----
  function renderDress() {
    const m = run.mission;
    $('stepBody').innerHTML = `
      ${m.concept ? '<div class="concept-banner" role="note">🔭 <b>Hypothetical future mission.</b> No astronaut has been to Mars yet. Items marked CONCEPT are imagined designs, not real NASA equipment.</div>' : ''}
      <div class="brief"><h3>Step 1: Dress your astronaut</h3><p>${m.brief}</p></div>
      <div class="dress">
        <section class="gear" aria-label="Equipment">
          <div class="tabs" role="tablist" aria-label="Equipment categories" id="tabs"></div>
          <div class="cards" role="tabpanel" id="cards" aria-labelledby="tab-${run.tab}"></div>
          <p class="fine tip">Drag an item onto ${avatar().name}, or tap it and press <b>Put on</b>.</p>
        </section>
        <section class="stage-col" aria-label="Your astronaut">
          <div class="stage" id="stage" tabindex="0" aria-describedby="stageHelp"></div>
          <p class="sr-only" id="stageHelp">Astronaut. Select an item, then press Enter here to put it on.</p>
          <div class="readiness" id="readiness"></div>
          <ul class="equipped" id="equipped" aria-label="Equipped items"></ul>
          <div class="btn-row center">
            <button class="btn" type="button" id="resetOutfit">↺ Take everything off</button>
            <button class="btn primary big" type="button" id="checkSuit">✅ Check My Suit</button>
          </div>
        </section>
        <aside class="info" aria-label="Item details">
          <div id="itemInfo"></div>
          <div id="checkResult" aria-live="polite"></div>
        </aside>
      </div>`;
    $('resetOutfit').addEventListener('click', () => { run.outfit = {}; run.pop = null; refreshDress(); toast('Outfit cleared. Start fresh!'); });
    $('checkSuit').addEventListener('click', checkSuit);
    $('tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { run.tab = b.dataset.tab; renderTabs(); renderCards(); } });
    $('tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = SSE.SLOTS.findIndex((s) => s.id === run.tab);
      const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + SSE.SLOTS.length) % SSE.SLOTS.length;
      run.tab = SSE.SLOTS[n].id; renderTabs(); renderCards();
      $('tab-' + run.tab).focus();
    });
    $('cards').addEventListener('click', (e) => {
      const c = e.target.closest('[data-item]');
      if (!c || c.dataset.dragged) { if (c) delete c.dataset.dragged; return; }
      run.selected = c.dataset.item; renderCards(); renderInfo();
    });
    $('cards').addEventListener('dblclick', (e) => { const c = e.target.closest('[data-item]'); if (c) equip(c.dataset.item); });
    $('stage').addEventListener('click', () => { if (run.selected) equip(run.selected); });
    $('stage').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && run.selected) { e.preventDefault(); equip(run.selected); } });
    $('equipped').addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove]');
      if (b) unequip(b.dataset.remove);
      const s = e.target.closest('[data-show]');
      if (s) { run.tab = SSE.item(s.dataset.show).slot; run.selected = s.dataset.show; renderTabs(); renderCards(); renderInfo(); }
    });
    setupDrag();
    refreshDress();
  }

  function refreshDress() {
    renderTabs(); renderCards(); renderStage(); renderInfo(); renderEquipped();
    if (run.checked) renderProblems(SSE.validate(run.mission.id, run.outfit));
  }

  function renderTabs() {
    $('tabs').innerHTML = SSE.SLOTS.map((s) => `
      <button type="button" role="tab" id="tab-${s.id}" data-tab="${s.id}" aria-selected="${s.id === run.tab}" tabindex="${s.id === run.tab ? 0 : -1}"
        class="tab${run.outfit[s.id] ? ' filled' : ''}${run.problemSlots && run.problemSlots.includes(s.id) ? ' problem' : ''}">
        <span aria-hidden="true">${s.icon}</span> ${s.name}${run.outfit[s.id] ? '<span class="sr-only"> (equipped)</span>' : ''}
      </button>`).join('');
  }

  function renderCards() {
    const items = SSE.ITEMS.filter((i) => i.slot === run.tab);
    const cards = $('cards');
    cards.setAttribute('aria-labelledby', 'tab-' + run.tab);
    cards.innerHTML = items.map((i) => {
      const on = run.outfit[i.slot] === i.id;
      return `<button type="button" class="item-card${on ? ' on' : ''}${run.selected === i.id ? ' sel' : ''}" data-item="${i.id}" aria-pressed="${run.selected === i.id}">
        ${SSE.itemIcon(i.id)}
        <span class="iname">${i.name}</span>
        ${i.concept ? '<span class="ctag">CONCEPT</span>' : ''}
        ${on ? '<span class="wearing">✓ Wearing</span>' : ''}
      </button>`;
    }).join('');
  }

  function renderStage() {
    const v = SSE.validate(run.mission.id, run.outfit);
    const mood = v.ready ? 'happy' : run.checked && v.problems.length ? 'worried' : 'neutral';
    const hl = run.checked ? v.problems.map((p) => p.slot) : [];
    $('stage').innerHTML = SSE.drawAstronaut(avatar(), run.outfit, { mood, highlight: hl, pop: reduceMotion() ? null : run.pop });
    run.pop = null;
    const pct = v.readiness;
    const filled = SSE.SLOTS.filter((s) => run.outfit[s.id]).length;
    $('readiness').innerHTML = `
      <div class="row-between"><span>Mission readiness</span><b>${pct}%</b></div>
      <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Mission readiness">
        <i style="width:${pct}%" class="${pct === 100 ? 'full' : pct >= 60 ? 'mid' : ''}"></i></div>
      <p class="fine">${filled} of ${SSE.SLOTS.length} gear slots filled. ${pct === 100 ? 'Looks ready. Press Check My Suit!' : 'Some slots can stay empty on some missions.'}</p>`;
  }

  function renderEquipped() {
    const list = SSE.SLOTS.filter((s) => run.outfit[s.id]);
    $('equipped').innerHTML = list.length ? list.map((s) => {
      const it = SSE.item(run.outfit[s.id]);
      return `<li class="chip"><button type="button" class="chip-name" data-show="${it.id}">${s.icon} ${it.name}</button><button type="button" class="chip-x" data-remove="${s.id}" aria-label="Take off ${it.name}">✕</button></li>`;
    }).join('') : '<li class="empty">Nothing equipped yet. Start with a suit!</li>';
  }

  function renderInfo() {
    const box = $('itemInfo');
    if (!run.selected) {
      box.innerHTML = `<div class="info-empty"><p class="big-emoji" aria-hidden="true">👆</p><p>Tap any item to see what it does and whether it fits <b>${run.mission.title}</b>.</p></div>`;
      return;
    }
    const it = SSE.item(run.selected);
    const c = SSE.compat(run.mission.id, run.outfit, it.id);
    const on = run.outfit[it.slot] === it.id;
    const other = !on && run.outfit[it.slot] ? SSE.item(run.outfit[it.slot]) : null;
    box.innerHTML = `
      <div class="info-card">
        <div class="info-icon">${SSE.itemIcon(it.id)}</div>
        <h4>${it.name} ${it.concept ? '<span class="ctag">CONCEPT</span>' : ''}</h4>
        <p>${it.purpose}</p>
        <p class="compat ${c.tone}">${c.tone === 'good' ? '✓' : c.tone === 'warn' ? '⚠' : '✗'} ${c.text}</p>
        <details><summary>Learn more</summary><p>${it.more}</p></details>
        <div class="btn-row">
          ${on ? `<button class="btn" type="button" id="infoOff">Take off</button>`
            : `<button class="btn primary" type="button" id="infoOn">${other ? 'Swap for this' : 'Put on'}</button>`}
        </div>
        ${other ? `<p class="fine">This will replace the ${other.name}.</p>` : ''}
      </div>`;
    if (on) $('infoOff').addEventListener('click', () => unequip(it.slot));
    else $('infoOn').addEventListener('click', () => equip(it.id));
  }

  function equip(id) {
    const it = SSE.item(id);
    run.outfit[it.slot] = id;
    run.selected = id;
    run.pop = it.slot === 'protect' && id === 'goggles' ? 'goggles' : it.slot;
    run.tab = it.slot;
    refreshDress();
    toast(`${avatar().name} put on the ${it.name}`);
  }

  function unequip(slot) {
    const it = SSE.item(run.outfit[slot]);
    delete run.outfit[slot];
    refreshDress();
    if (it) toast(`Took off the ${it.name}`);
  }

  // Pointer-based drag and drop (mouse, pen and touch via long-press).
  function setupDrag() {
    const cards = $('cards');
    let drag = null;
    const end = () => {
      if (!drag) return;
      clearTimeout(drag.timer);
      if (drag.ghost) drag.ghost.remove();
      $('stage').classList.remove('drop-hover');
      drag = null;
    };
    const begin = (x, y) => {
      drag.active = true;
      const g = document.createElement('div');
      g.className = 'drag-ghost';
      g.innerHTML = SSE.itemIcon(drag.id);
      document.body.appendChild(g);
      drag.ghost = g;
      move(x, y);
    };
    const overStage = (x, y) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest('#stage')); };
    const move = (x, y) => {
      drag.ghost.style.transform = `translate(${x - 32}px, ${y - 32}px)`;
      $('stage').classList.toggle('drop-hover', overStage(x, y));
    };
    cards.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('[data-item]');
      if (!c || e.button > 0) return;
      drag = { id: c.dataset.item, card: c, x: e.clientX, y: e.clientY, active: false, touch: e.pointerType === 'touch', armed: false };
      if (drag.touch) drag.timer = setTimeout(() => { if (drag) { drag.armed = true; c.classList.add('lift'); begin(drag.x, drag.y); } }, 280);
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
      if (!drag.active) {
        if (drag.touch) { if (dist > 10) end(); return; } // finger moved early: let the list scroll
        if (dist > 6) begin(e.clientX, e.clientY); else return;
      }
      move(e.clientX, e.clientY);
    });
    // Stop the page from scrolling once a touch drag is armed.
    cards.addEventListener('touchmove', (e) => { if (drag && drag.armed) e.preventDefault(); }, { passive: false });
    window.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const d = drag;
      d.card.classList.remove('lift');
      if (d.active) {
        d.card.dataset.dragged = '1';
        setTimeout(() => { delete d.card.dataset.dragged; }, 50);
        if (overStage(e.clientX, e.clientY)) equip(d.id);
      }
      end();
    });
    window.addEventListener('pointercancel', () => { if (drag) drag.card.classList.remove('lift'); end(); });
  }

  const STATUS_TITLE = { missing: 'Missing', wrong: 'Wrong item', extra: 'Not needed', fake: 'Not space gear', incompatible: "Doesn't connect" };

  function renderProblems(v) {
    run.problemSlots = v.problems.map((p) => p.slot);
    const box = $('checkResult');
    if (!box) return;
    if (v.ready) {
      box.innerHTML = '<div class="check ok"><b>All problems fixed!</b> Press <b>Check My Suit</b> again.</div>';
      return;
    }
    box.innerHTML = `<div class="check bad"><h4>🔴 ${v.problems.length} thing${v.problems.length > 1 ? 's' : ''} to fix</h4><ul class="problems">${v.problems.map((p, i) => {
      const s = SSE.SLOTS.find((x) => x.id === p.slot);
      return `<li><b>${s.icon} ${s.name}: ${STATUS_TITLE[p.status]}</b><p>${p.message}</p>
        ${p.hint ? `<button type="button" class="link" data-hint="${i}" aria-expanded="false">💡 Show hint</button><p class="hint" id="hint-${i}" hidden>${p.hint}</p>` : ''}
        <button type="button" class="link" data-goto="${p.slot}">Go to ${s.name} →</button></li>`;
    }).join('')}</ul></div>`;
    box.querySelectorAll('[data-hint]').forEach((b) => b.addEventListener('click', () => {
      const h = $('hint-' + b.dataset.hint); h.hidden = !h.hidden; b.setAttribute('aria-expanded', !h.hidden);
    }));
    box.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
      run.tab = b.dataset.goto; run.selected = run.outfit[run.tab] || null; renderTabs(); renderCards(); renderInfo();
      $('tab-' + run.tab).focus();
    }));
  }

  async function checkSuit() {
    const v = SSE.validate(run.mission.id, run.outfit);
    run.checked = true;
    refreshDress();
    if (v.ready) {
      if (run.failedChecks === 0) { award(50, 'Perfect suit!'); earn('perfect'); }
      else { award(30, 'You fixed your suit!'); earn('fixer'); }
      await modal({ icon: '✅', title: 'Suit check passed!', html: `<p>${avatar().name} is dressed and ready for <b>${run.mission.title}</b>.</p><p>Next: inspect each piece of equipment.</p>`,
        buttons: [{ label: 'Inspect equipment ▸', value: 'go', cls: 'primary' }] });
      goStep('inspect');
    } else {
      run.failedChecks++;
      run.mistakes++;
      const first = v.problems[0];
      await modal({ icon: '🚫', title: 'Mission blocked: not ready yet',
        html: `<p>Mission readiness: <b>${v.readiness}%</b>. ${v.problems.length} item${v.problems.length > 1 ? 's need' : ' needs'} attention. They are circled in red.</p><p class="callout">${first.message}</p><p>Read the list beside your astronaut, fix the outfit and check again. You get points for fixing it!</p>`,
        buttons: [{ label: 'Fix my suit', value: 'ok', cls: 'primary' }] });
      const cr = $('checkResult');
      if (cr) cr.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest' });
    }
  }

  // ----- Inspect -----
  function renderInspect() {
    if (!run.inspect) {
      const list = SSE.SLOTS.map((s) => run.outfit[s.id]).filter(Boolean).map((id) => SSE.item(id)).filter((i) => i.inspect);
      const defects = run.mission.difficulty >= 3 ? 2 : 1;
      const pool = list.map((_, i) => i);
      const bad = new Set();
      while (bad.size < Math.min(defects, list.length)) bad.add(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      run.inspect = list.map((it, i) => ({ id: it.id, bad: bad.has(i), state: 'pending', note: '' }));
    }
    const pending = run.inspect.filter((x) => x.state === 'pending').length;
    $('stepBody').innerHTML = `
      <div class="brief"><h3>Step 2: Inspect your equipment</h3><p>Read each check. Does it look good, or does it need fixing? Some gear might have a problem.</p>
        <p class="fine">${run.inspect.length - pending} of ${run.inspect.length} items inspected</p></div>
      <div class="inspect-grid">${run.inspect.map((x, i) => {
        const it = SSE.item(x.id);
        const reading = x.state === 'fixed' ? it.inspect.fix : x.bad ? it.inspect.bad : it.inspect.ok;
        return `<div class="icard ${x.state}${x.bad && x.state === 'pending' ? ' has-bad' : ''}">
          ${SSE.itemIcon(it.id)}
          <h4>${it.name}</h4>
          <p class="reading ${x.state === 'pending' ? '' : 'done'}">${reading}</p>
          ${x.state === 'pending' ? `<div class="btn-row center">
              <button class="btn ok" type="button" data-ok="${i}">👍 Looks good</button>
              <button class="btn warn" type="button" data-fix="${i}">🔧 Needs fixing</button></div>`
            : `<p class="status">${x.state === 'fixed' ? '🔧 Fixed!' : '✓ Checked'}</p>`}
          ${x.note ? `<p class="note">${x.note}</p>` : ''}
        </div>`;
      }).join('')}</div>
      <div class="btn-row center"><button class="btn primary big" type="button" id="toChecklist" ${pending ? 'disabled' : ''}>Safety checklist ▸</button></div>
      ${pending ? '<p class="fine center">Inspect every item to continue.</p>' : ''}`;
    $('stepBody').querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', () => inspectAnswer(+b.dataset.ok, false)));
    $('stepBody').querySelectorAll('[data-fix]').forEach((b) => b.addEventListener('click', () => inspectAnswer(+b.dataset.fix, true)));
    $('toChecklist').addEventListener('click', () => goStep('checklist'));
  }

  async function inspectAnswer(i, saysFix) {
    const x = run.inspect[i];
    const it = SSE.item(x.id);
    if (x.bad && saysFix) { x.state = 'fixed'; x.note = x.tries ? 'Good catch on your second look!' : ''; award(x.tries ? 10 : 20, 'Problem found and fixed!'); }
    else if (!x.bad && !saysFix) { x.state = 'ok'; award(5, 'Checked'); }
    else if (x.bad && !saysFix) {
      x.tries = (x.tries || 0) + 1; run.mistakes++;
      await modal({ icon: '🔍', title: 'Look again!', html: `<p>The check says: <b>${it.inspect.bad}</b></p><p>Using gear with a problem could stop the mission. Astronauts always fix problems before they start.</p>`,
        buttons: [{ label: 'Inspect again', value: 'ok', cls: 'primary' }] });
    } else {
      x.state = 'ok'; x.note = 'That one was fine. Read the check carefully!';
      toast('That item was fine after all');
    }
    renderInspect();
    const next = $('stepBody').querySelector('[data-ok],[data-fix]') || $('toChecklist');
    if (next) next.focus();
  }

  // ----- Checklist -----
  function renderChecklist() {
    const m = run.mission;
    if (!run.answers) run.answers = m.checklist.map(() => ({ done: false, tries: 0, wrong: [] }));
    const doneN = run.answers.filter((a) => a.done).length;
    $('stepBody').innerHTML = `
      <div class="brief"><h3>Step 3: Safety checklist</h3><p>Answer every question before the mission can start. Wrong answers explain why, so you can try again.</p>
        <div class="meter small" role="progressbar" aria-valuemin="0" aria-valuemax="${m.checklist.length}" aria-valuenow="${doneN}" aria-label="Checklist progress"><i style="width:${doneN / m.checklist.length * 100}%" class="full"></i></div>
        <p class="fine">${doneN} of ${m.checklist.length} done</p></div>
      <ol class="checklist">${m.checklist.map((q, qi) => {
        const a = run.answers[qi];
        return `<li class="q${a.done ? ' done' : ''}"><fieldset><legend>${a.done ? '✅' : '⬜'} ${q.q}</legend>
          <div class="opts">${q.a.map((opt, oi) => `<button type="button" class="opt${a.done && oi === q.ok ? ' right' : ''}${a.wrong.includes(oi) ? ' wrong' : ''}"
            data-q="${qi}" data-o="${oi}" ${a.done || a.wrong.includes(oi) ? 'disabled' : ''}>${opt}</button>`).join('')}</div>
          ${a.done ? `<p class="why ok">👍 ${q.why}</p>` : a.wrong.length ? `<p class="why bad">Not quite. Think about it: ${q.why.split('.')[0]}. Try another answer!</p>` : ''}
        </fieldset></li>`;
      }).join('')}</ol>
      <div class="btn-row center"><button class="btn primary big" type="button" id="toPlay" ${doneN < m.checklist.length ? 'disabled' : ''}>🚀 Begin mission</button></div>`;
    $('stepBody').querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      const qi = +b.dataset.q, oi = +b.dataset.o;
      const a = run.answers[qi];
      if (oi === m.checklist[qi].ok) { a.done = true; award(a.tries ? 8 : 15, a.tries ? 'Corrected!' : 'Correct!'); }
      else { a.tries++; a.wrong.push(oi); run.mistakes++; }
      renderChecklist();
      const again = $('stepBody').querySelector(`[data-q="${qi}"]:not([disabled])`) || $('stepBody').querySelector('.opt:not([disabled])') || $('toPlay');
      if (again) again.focus();
    }));
    $('toPlay').addEventListener('click', () => goStep('play'));
  }

  // ----- Play -----
  function renderPlay() {
    $('stepBody').innerHTML = `<div class="brief"><h3>Step 4: ${run.mission.title}</h3><p>${run.mission.concept ? '<b>Imagined future mission.</b> ' : ''}Follow the mission steps. Safe choices earn points.</p></div><div id="scene" class="scene-wrap"></div>`;
    const myRun = run;
    const ctx = {
      mission: run.mission, avatar: avatar(), outfit: run.outfit, reduceMotion: reduceMotion(),
      award: (p, l) => { if (run === myRun) award(p, l); },
      mistake: () => { if (run === myRun) run.mistakes++; },
      toast,
      pause: (title, html, label) => modal({ icon: '⏸️', title, html: `<p class="paused-tag">Simulation paused</p>${html}`, buttons: [{ label: label || 'Got it, let\'s fix it', value: 'ok', cls: 'primary' }] }),
      ask: modal,
      alive: () => run === myRun && run.step === 'play',
      finish: () => { if (run === myRun) goStep('debrief'); }
    };
    SSE.SCENES[run.mission.id]($('scene'), ctx);
  }

  // ----- Debrief -----
  function renderDebrief() {
    const m = run.mission;
    const stars = run.mistakes <= 1 ? 3 : run.mistakes <= 4 ? 2 : 1;
    award(100, 'Mission complete!');
    const prev = store.done[m.id];
    store.done[m.id] = { stars: Math.max(stars, prev ? prev.stars : 0), best: Math.max(run.points, prev ? prev.best : 0) };
    store.points += run.points;
    const before = store.badges.length;
    earn('first');
    if (m.id === 'spacewalk') earn('spacewalk');
    if (m.id === 'lunar') earn('lunar');
    if (m.id === 'emergency') earn('safety');
    if (m.id === 'mars') earn('future');
    if (SSE.MISSIONS.filter((x) => x.lifeSupport && store.done[x.id]).length >= 3) earn('oxygen');
    if (Object.keys(store.done).length === SSE.MISSIONS.length) earn('commander');
    save(); updateHud();
    const newBadges = store.badges.slice(before).map((id) => SSE.BADGES.find((b) => b.id === id));
    const next = SSE.MISSIONS[m.num];
    $('stepBody').innerHTML = `
      <div class="debrief">
        <div class="db-art">${SSE.drawAstronaut(avatar(), run.outfit, { mood: 'happy', title: `${avatar().name} celebrating` })}</div>
        <div class="db-text">
          <h3>Mission complete! 🎉</h3>
          <p class="big-stars" aria-label="${stars} out of 3 stars">${'★'.repeat(stars)}<span class="dim">${'☆'.repeat(3 - stars)}</span></p>
          <p><b>${run.points}</b> mission points · ${run.mistakes === 0 ? 'no mistakes, amazing!' : `${run.mistakes} learning moment${run.mistakes > 1 ? 's' : ''}`}</p>
          <div class="learned"><h4>What you learned</h4><p>${m.learn}</p></div>
          ${newBadges.length ? `<div class="new-badges"><h4>New badges</h4>${newBadges.map((b) => `<span class="badge on"><span class="bi">${b.icon}</span>${b.name}</span>`).join('')}</div>` : ''}
          <div class="btn-row">
            ${next ? `<button class="btn primary big" type="button" id="nextMission">Next: ${next.title} ▸</button>` : '<button class="btn primary big" type="button" data-go="achievements">🎖️ See my achievements</button>'}
            <button class="btn" type="button" id="replay">Play again</button>
            <button class="btn" type="button" data-go="missions">All missions</button>
          </div>
        </div>
      </div>`;
    if (next) $('nextMission').addEventListener('click', () => { location.hash = 'mission-' + next.id; });
    $('replay').addEventListener('click', () => startMission(m.id));
  }

  // ---------- Encyclopedia ----------
  function renderEncyclopedia(selId) {
    $('readCount').textContent = `You have read ${store.read.length} of ${SSE.TOPICS.length} topics.`;
    $('topicList').innerHTML = SSE.TOPICS.map((t) => `
      <button type="button" role="listitem" class="topic-btn${t.id === selId ? ' sel' : ''}" data-topic="${t.id}" aria-current="${t.id === selId}">
        <span class="ti" aria-hidden="true">${t.icon}</span><span>${t.title}</span>${store.read.includes(t.id) ? '<span class="read" aria-label="read">✓</span>' : ''}
      </button>`).join('');
    const t = SSE.TOPICS.find((x) => x.id === selId);
    $('topicView').innerHTML = `
      <p class="ti big" aria-hidden="true">${t.icon}</p>
      <h3>${t.title}</h3>
      <p class="lead">${t.text}</p>
      <details><summary>Learn more</summary><p>${t.more}</p></details>
      <p class="src">Read more: ${t.src.map((s) => `<a href="${s.u}" target="_blank" rel="noopener noreferrer">${s.t}</a>`).join(' · ')}</p>`;
    if (!store.read.includes(t.id)) {
      store.read.push(t.id); save();
      if (store.read.length >= 5) earn('bookworm');
      $('readCount').textContent = `You have read ${store.read.length} of ${SSE.TOPICS.length} topics.`;
      const btn = $('topicList').querySelector(`[data-topic="${t.id}"]`);
      if (btn) btn.insertAdjacentHTML('beforeend', '<span class="read" aria-label="read">✓</span>');
    }
  }
  $('topicList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-topic]');
    if (!b) return;
    renderEncyclopedia(b.dataset.topic);
    $('topicList').querySelector(`[data-topic="${b.dataset.topic}"]`).focus();
    if (window.innerWidth < 760) $('topicView').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' });
  });

  // ---------- Achievements ----------
  function renderAchievements() {
    const done = Object.keys(store.done).length;
    const stars = Object.values(store.done).reduce((a, d) => a + d.stars, 0);
    $('dash').innerHTML = `
      <div class="stat"><b>${store.points}</b><span>Points</span></div>
      <div class="stat"><b>${done}/6</b><span>Missions</span></div>
      <div class="stat"><b>${stars}/18</b><span>Stars</span></div>
      <div class="stat"><b>${store.badges.length}/${SSE.BADGES.length}</b><span>Badges</span></div>
      <div class="stat wide-stat"><span>Overall progress</span><div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(done / 6 * 100)}" aria-label="Overall progress"><i class="full" style="width:${done / 6 * 100}%"></i></div></div>`;
    $('badgeGrid').innerHTML = SSE.BADGES.map((b) => {
      const on = store.badges.includes(b.id);
      return `<div class="badge-card${on ? ' on' : ''}"><span class="bi" aria-hidden="true">${on ? b.icon : '🔒'}</span><b>${b.name}</b><span>${b.desc}</span><span class="sr-only">${on ? 'Earned' : 'Not earned yet'}</span></div>`;
    }).join('');
    $('missionList').innerHTML = SSE.MISSIONS.map((m) => {
      const d = store.done[m.id];
      const open = isUnlocked(m);
      return `<div class="mp-row${d ? ' done' : ''}"><span class="mp-num" style="--mc:${m.color}">${m.num}</span><span class="mp-title">${m.title}</span>
        <span class="mp-stat">${d ? `<span aria-label="${d.stars} stars">${'★'.repeat(d.stars)}${'☆'.repeat(3 - d.stars)}</span> · best ${d.best} pts` : open ? 'Ready to play' : '🔒 Locked'}</span></div>`;
    }).join('');
  }
  $('resetBtn').addEventListener('click', async () => {
    const r = await modal({ icon: '⚠️', title: 'Reset all progress?', html: '<p>This erases your points, stars, badges and unlocked missions in this browser. This cannot be undone.</p>',
      buttons: [{ label: 'Keep my progress', value: 'keep', cls: 'primary' }, { label: 'Yes, reset everything', value: 'reset', cls: 'danger' }] });
    if (r !== 'reset') return;
    store = fresh(); save(); updateHud(); renderAchievements();
    toast('Progress reset. Ready for a fresh start!');
  });

  // ---------- Boot ----------
  updateHud();
  route();
})();
