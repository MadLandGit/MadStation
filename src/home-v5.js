// Mad Station — Home v5. Every app is an equal, draggable tile. Self-contained; keeps the app's hooks.
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const svg = (p) => `<svg viewBox="0 0 24 24">${p}</svg>`;
  const GRIP = '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  const TILES = [
    { id: 'ai-hub', name: 'AI Hub', h: 1, tag: 'Accounts · Providers · Sessions', desc: 'Every AI account, provider and session in one calm place.', extra: 'hub',
      icon: '<circle cx="12" cy="12" r="2.6"/><circle cx="6" cy="7" r="1.4"/><circle cx="18" cy="6" r="1.4"/><circle cx="18" cy="18" r="1.4"/><path d="M9.8 10.3 7.2 8.1M14.4 9.9l2.4-2.4M14.2 14.3l2.7 2.2"/>' },
    { id: 'instruction-forge', name: 'Prompt Studio', h: 2, tag: 'Refine · Clarify · Structure', desc: 'Write sharper prompts before they reach your Hub.',
      icon: '<path d="M5 6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4 3v-5.2a2 2 0 0 1-1-1.8v-5z"/><path d="M8 8.5h7M8 11.5h5"/>' },
    { id: 'ai-lab', name: 'AI Playground', h: 4, tag: 'Arena · API · Local AI', desc: 'Pit models head-to-head and find the best one for the job.',
      icon: '<path d="M9 3h6M10 3v5l-4.6 9.1A2 2 0 0 0 7.2 20h9.6a2 2 0 0 0 1.8-2.9L14 8V3"/><path d="M8 14h8"/>' },
    { id: 'video-hub', name: 'Video Hub', h: 3, tag: 'AI Video · Daily Credits', desc: 'Video generators and their account sessions in one isolated workspace.',
      icon: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m10 9 5 3-5 3z"/>' },
    { id: 'image-hub', name: 'Image Hub', h: 5, tag: 'AI Images · Edit · Upscale', desc: 'Image generators, editors and upscalers in one visual workspace.',
      icon: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>' },
    { id: 'clipboard', name: 'Notes & Tasks', h: 6, tag: 'Notes · Checklists', desc: 'Capture ideas and to-dos without leaving the station.',
      icon: '<rect x="4" y="5" width="13" height="15" rx="2"/><path d="M8 9h6M8 12h5M8 15h4"/><circle cx="18" cy="16" r="4"/><path d="m16.4 16 1.1 1.1 2.2-2.3"/>' },
    { id: 'system', name: 'System', h: 5, wide: true, extra: 'sys', icon: '' },
  ];
  const K_ORDER = 'mad-home-v5-order', K_HIDDEN = 'mad-home-v5-hidden';
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const grid = $('#homeApps');
  const reduce = () => document.body.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  let launcher = null, suppressClick = false;

  /* host hooks (names the old Home used) */
  window.MadHomeApps = { setLauncher(fn) { if (typeof fn === 'function') launcher = fn; } };
  window.MadHome = { inApp: !!window.MadStationMemoryMonitor || window.parent !== window, setStats(s) { count($('#launcherAccountCount'), s.accounts); count($('#launcherProviderCount'), s.providers); } };
  function count(el, to) { if (!el) return; const from = +el.textContent || 0, t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 700); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  function toast(t) { const n = $('#homeToast'); n.textContent = t; n.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => n.classList.remove('show'), 1700); }
  const launch = (id) => { const a = TILES.find((x) => x.id === id); if (!a || a.extra === 'sys') return; if (launcher) launcher(id); else toast(`Opening ${a.name}…`); };

  /* render */
  function tileHtml(a) {
    if (a.extra === 'sys') return `<span class="grip">${GRIP}</span><div class="sys-title-row"><div class="t"><i class="dot"></i>Live system</div><button class="sys-refresh-btn" type="button" data-memory-refresh title="Refresh process monitor" aria-label="Refresh process monitor"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"></path><path d="M20 4v5h-5"></path></svg></button></div><div class="meters">
      <div class="m"><div><span>App memory</span><b id="ramTotal">Measuring…</b></div><i id="barRam"></i></div>
      <div class="m cpu"><div><span>CPU</span><b id="cpuPct">–</b></div><i id="barCpu"></i></div></div>`;
    const stats = a.extra === 'hub' ? '<span class="stats"><span><b id="launcherAccountCount">0</b> accounts</span><span><b id="launcherProviderCount">0</b> providers</span></span>' : '';
    return `<span class="grip">${GRIP}</span><span class="ico">${svg(a.icon)}</span><strong>${a.name}</strong><span class="d">${a.desc}</span>${stats}<span class="tag">${a.tag}</span>`;
  }
  const els = {};
  TILES.forEach((a) => {
    const el = document.createElement('div');
    el.className = 'tile' + (a.wide ? ' wide' : ''); el.dataset.id = a.id; el.dataset.h = a.h;
    el.dataset.name = (a.name + ' ' + (a.tag || '')).toLowerCase();
    el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', a.extra === 'sys' ? 'System monitor' : 'Open ' + a.name + '. Alt plus arrow keys to move.');
    el.innerHTML = tileHtml(a); els[a.id] = el;
  });
  function applyOrder() {
    const saved = load(K_ORDER), hidden = new Set(load(K_HIDDEN));
    const ids = [...saved.filter((i) => els[i]), ...TILES.map((t) => t.id).filter((i) => !saved.includes(i))];
    ids.forEach((id, n) => { els[id].hidden = hidden.has(id); els[id].style.setProperty('--i', n); grid.appendChild(els[id]); });
  }
  applyOrder();
  const order = () => [...grid.children].map((c) => c.dataset.id);

  /* FLIP: smooth reflow whenever the order changes */
  function flip(change) {
    const kids = [...grid.children].filter((c) => !c.hidden), first = new Map(kids.map((c) => [c, c.getBoundingClientRect()]));
    change(); if (reduce()) return;
    kids.forEach((c) => { const f = first.get(c), l = c.getBoundingClientRect(), dx = f.left - l.left, dy = f.top - l.top;
      if (dx || dy) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' }); });
  }

  /* drag to rearrange (mouse/pen: instant after 6px; touch: press and hold) */
  let d = null;
  function startDrag() {
    if (!d || d.on) return; d.on = true;
    const r = d.t.getBoundingClientRect(); d.ox = d.x - r.left; d.oy = d.y - r.top;
    d.ghost = d.t.cloneNode(true); d.ghost.classList.add('ghost'); d.ghost.removeAttribute('id');
    d.ghost.style.width = r.width + 'px'; d.ghost.style.height = r.height + 'px'; document.body.appendChild(d.ghost);
    d.t.classList.add('lifted'); document.body.classList.add('dragging'); if (navigator.vibrate) navigator.vibrate(10); place();
  }
  function place() { d.ghost.style.transform = `translate(${d.x - d.ox}px,${d.y - d.oy}px) scale(1.03) rotate(1.2deg)`; }
  grid.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-memory-refresh]')) return;
    const t = e.target.closest('.tile'); if (!t || (e.button && e.button !== 0)) return;
    d = { t, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, type: e.pointerType, on: false };
    if (e.pointerType === 'touch') d.timer = setTimeout(startDrag, 300);
  });
  document.addEventListener('pointermove', (e) => {
    if (!d) return; d.x = e.clientX; d.y = e.clientY;
    if (!d.on) { const far = Math.hypot(d.x - d.sx, d.y - d.sy); if (d.type === 'touch') { if (far > 9) { clearTimeout(d.timer); d = null; } } else if (far > 6) startDrag(); return; }
    place();
    const home = $('#launcherScreen'), hr = home.getBoundingClientRect();
    if (d.y < hr.top + 90) home.scrollTop -= 14; else if (d.y > hr.bottom - 60) home.scrollTop += 14;
    d.ghost.style.pointerEvents = 'none';
    const over = document.elementFromPoint(d.x, d.y), target = over && over.closest && over.closest('.tile');
    if (target && target !== d.t && target.parentNode === grid) {
      const r = target.getBoundingClientRect(), after = d.x > r.left + r.width / 2, ref = after ? target.nextElementSibling : target;
      if (ref !== d.t && ref !== d.t.nextElementSibling) flip(() => grid.insertBefore(d.t, ref));
    }
  }, { passive: true });
  document.addEventListener('touchmove', (e) => { if (d && d.on) e.preventDefault(); }, { passive: false });
  function endDrag() {
    if (!d) return; clearTimeout(d.timer); const cur = d; d = null; if (!cur.on) return;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    const r = cur.t.getBoundingClientRect();
    cur.ghost.style.transition = reduce() ? 'none' : 'transform .22s cubic-bezier(.2,.8,.2,1),box-shadow .22s'; cur.ghost.style.boxShadow = 'none';
    cur.ghost.style.transform = `translate(${r.left}px,${r.top}px)`;
    setTimeout(() => { cur.ghost.remove(); cur.t.classList.remove('lifted'); document.body.classList.remove('dragging'); save(K_ORDER, order()); }, reduce() ? 0 : 230);
  }
  document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', endDrag);

  /* click + keyboard (Enter opens, Alt+arrows moves) */
  grid.addEventListener('click', (e) => { const t = e.target.closest('.tile'); if (t && !suppressClick) launch(t.dataset.id); });
  grid.addEventListener('keydown', (e) => {
    const t = e.target.closest('.tile'); if (!t) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launch(t.dataset.id); return; }
    if (!e.altKey || !/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return; e.preventDefault();
    const vis = [...grid.children].filter((c) => !c.hidden), i = vis.indexOf(t), j = i + (/Left|Up/.test(e.key) ? -1 : 1);
    if (j < 0 || j >= vis.length) return;
    flip(() => grid.insertBefore(t, j < i ? vis[j] : vis[j].nextElementSibling)); t.focus(); save(K_ORDER, order());
    toast(`${TILES.find((x) => x.id === t.dataset.id).name} → position ${j + 1}`);
  });

  /* spotlight following the cursor */
  grid.addEventListener('pointermove', (e) => { const t = e.target.closest('.tile'); if (!t) return; const r = t.getBoundingClientRect(); t.style.setProperty('--cx', e.clientX - r.left + 'px'); t.style.setProperty('--cy', e.clientY - r.top + 'px'); }, { passive: true });

  /* search: dim non-matches, Enter opens the first match */
  const input = $('#homeSearch');
  function filter() {
    const q = input.value.trim().toLowerCase(); let first = null, shown = 0;
    [...grid.children].forEach((t) => { t.classList.remove('hit'); const m = !q || t.dataset.name.includes(q); t.classList.toggle('dim', !m); if (!t.hidden && m && q) { shown++; first = first || t; } });
    if (first) first.classList.add('hit'); $('#noMatch').hidden = !(q && !shown);
  }
  input.addEventListener('input', filter);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const h = grid.querySelector('.hit'); if (h) { launch(h.dataset.id); input.value = ''; filter(); } }
    if (e.key === 'Escape') { input.value = ''; filter(); input.blur(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); } });

  /* customize menu: show/hide tiles, reset order */
  const menu = $('#homeMenu'), cbtn = $('#homeCustomizeBtn');
  function buildMenu() {
    const hidden = new Set(load(K_HIDDEN));
    menu.innerHTML = '<h2>Show on Home</h2>' + TILES.map((a) => `<label><input type="checkbox" data-id="${a.id}" ${hidden.has(a.id) ? '' : 'checked'}/> ${a.name}</label>`).join('') + '<button class="reset" type="button" id="resetLayout">Reset layout</button>';
  }
  const toggleMenu = (open) => { menu.hidden = !open; cbtn.setAttribute('aria-expanded', String(open)); if (open) buildMenu(); };
  cbtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(menu.hidden); });
  menu.addEventListener('click', (e) => e.stopPropagation());
  menu.addEventListener('change', (e) => { const id = e.target.dataset.id; if (!id) return; const h = new Set(load(K_HIDDEN)); e.target.checked ? h.delete(id) : h.add(id); save(K_HIDDEN, [...h]); els[id].hidden = !e.target.checked; });
  menu.addEventListener('click', (e) => { if (e.target.id === 'resetLayout') { save(K_ORDER, []); save(K_HIDDEN, []); flip(applyOrder); buildMenu(); toast('Layout reset'); } });
  document.addEventListener('click', () => toggleMenu(false)); document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleMenu(false); });
  $('#themeBtn').addEventListener('click', () => { if (typeof window.MadHome?.toggleTheme === 'function') { window.MadHome.toggleTheme(); return; } const b = document.body; b.dataset.theme = b.dataset.theme === 'light' ? 'dark' : 'light'; });

  /* greeting */
  function greet() {
    const n = new Date(), h = n.getHours(); $('#homeGreeting').textContent = (h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + '.';
    $('#homeDate').textContent = n.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + ' · ' + n.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  greet(); setInterval(greet, 30000);

  /* live system: real model from the app, demo numbers in a plain browser */
  function setSys(ram, cpu, total) {
    const b = $('#barRam'), c = $('#barCpu'); if (!b) return;
    b.style.setProperty('--w', Math.min(100, ram) + '%'); c.style.setProperty('--w', Math.min(100, cpu) + '%');
    $('#ramTotal').textContent = total + ' · ' + Math.round(ram) + '%'; $('#cpuPct').textContent = Math.round(cpu) + '%';
  }
  document.addEventListener('mad:memory-model', (e) => { const m = e.detail || {}; setSys(+m.appPercent || 0, +m.systemCpuPercent || 0, m.totalLabel || '—'); });
  if (!window.MadHome.inApp) {
    window.MadHome.setStats({ accounts: 12, providers: 9 });
    let ram = 9; const tick = () => { ram = Math.max(5, Math.min(40, ram + (Math.random() - .5) * 3)); setSys(ram, 14 + Math.random() * 30, (ram * 0.16).toFixed(2) + ' GB'); };
    tick(); setInterval(tick, 2500);
  }
})();
