// Mad Station — Home v7 "Pro". Parallax stack, tilt tiles, live charts, activity feed. Self-contained; keeps the app's hooks.
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const svg = (p) => `<svg viewBox="0 0 24 24">${p}</svg>`;
  const ARROW = '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const APPS = [
    { id: 'ai-hub', name: 'AI Hub', h: 1, tag: 'Accounts · Providers · Sessions', icon: '<circle cx="12" cy="12" r="2.6"/><circle cx="6" cy="7" r="1.4"/><circle cx="18" cy="6" r="1.4"/><circle cx="18" cy="18" r="1.4"/><path d="M9.8 10.3 7.2 8.1M14.4 9.9l2.4-2.4M14.2 14.3l2.7 2.2"/>' },
    { id: 'instruction-forge', name: 'Prompt Studio', h: 2, tag: 'Refine · Clarify · Structure', icon: '<path d="M5 6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4 3v-5.2a2 2 0 0 1-1-1.8v-5z"/><path d="M8 8.5h7M8 11.5h5"/>' },
    { id: 'ai-lab', name: 'AI Playground', h: 4, tag: 'Arena · API · Local AI', icon: '<path d="M9 3h6M10 3v5l-4.6 9.1A2 2 0 0 0 7.2 20h9.6a2 2 0 0 0 1.8-2.9L14 8V3"/><path d="M8 14h8"/>' },
    { id: 'video-hub', name: 'Video Hub', h: 3, tag: 'AI Video · Daily Credits', icon: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m10 9 5 3-5 3z"/>' },
    { id: 'image-hub', name: 'Image Hub', h: 5, tag: 'AI Images · Edit · Upscale', icon: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>' },
    { id: 'clipboard', name: 'Notes & Tasks', h: 6, tag: 'Notes · Checklists', icon: '<rect x="4" y="5" width="13" height="15" rx="2"/><path d="M8 9h6M8 12h5M8 15h4"/><circle cx="18" cy="16" r="4"/><path d="m16.4 16 1.1 1.1 2.2-2.3"/>' },
  ];
  const VIS = {
    'ai-hub': '<svg class="nn" viewBox="0 0 200 58"><g class="lnk"><path class="ln" d="M22 10 100 20M22 10 100 40M22 29 100 20M22 29 100 40M22 48 100 20M22 48 100 40M100 20 178 29M100 40 178 29"/></g><circle class="nd" cx="22" cy="10" r="4.5"/><circle class="nd" cx="22" cy="29" r="4.5"/><circle class="nd" cx="22" cy="48" r="4.5"/><circle class="nd" cx="100" cy="20" r="5"/><circle class="nd" cx="100" cy="40" r="5"/><circle class="core" cx="178" cy="29" r="7"/></svg>',
    'instruction-forge': '<div class="pr"><b></b><b></b><b></b><i></i></div>',
    'ai-lab': '<div class="ar"><span></span><span></span><span></span></div>',
    'video-hub': '<div class="vd"><b></b><b></b><b></b><b></b><b></b><b></b><b></b><b></b><i></i></div>',
    'image-hub': '<div class="im">' + '<b></b>'.repeat(56) + '</div>',
    'clipboard': '<div class="nt"><div><em></em><s></s></div><div><em></em><s></s></div><div><em></em><s></s></div></div>',
  };
  const K_ORDER = 'mad-home-v7-order', K_HIDDEN = 'mad-home-v7-hidden';
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const byId = (id) => APPS.find((a) => a.id === id);
  const home = $('#launcherScreen'), grid = $('#homeApps');
  const reduce = () => document.body.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  let launcher = null, suppressClick = false;

  /* ---------- host hooks (same names the old Home used) ---------- */
  window.MadHomeApps = { setLauncher(fn) { if (typeof fn === 'function') launcher = fn; } };
  const framed = window.parent !== window;
  window.MadHome = { inApp: framed || !!window.MadStationMemoryMonitor, setStats({ accounts, providers } = {}) {
    const a = document.querySelector('[data-stat="accounts"]'); const p = document.querySelector('[data-stat="providers"]');
    if (a && accounts != null) a.textContent = String(Math.max(0, Number(accounts) || 0));
    if (p && providers != null) p.textContent = String(Math.max(0, Number(providers) || 0));
  }, memoryAction() {}, toggleTheme() {} };
  function toast(t) { const n = $('#homeToast'); n.textContent = t; n.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => n.classList.remove('show'), 1700); }
  function launch(id) {
    const a = byId(id); if (!a) return;
    if (launcher) launcher(id); else toast(`Opening ${a.name}…`);
  }

  /* ---------- tiles ---------- */
  const tiles = {};
  APPS.forEach((a) => {
    const el = document.createElement('div');
    el.className = 'tile'; el.dataset.id = a.id; el.dataset.h = a.h; el.dataset.name = (a.name + ' ' + a.tag).toLowerCase();
    el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', `${a.name}. Enter to open, Alt plus arrow keys to move.`);
    el.innerHTML = `<div class="t-top"><span class="ico">${svg(a.icon)}</span><span class="key"></span></div><strong>${a.name}</strong><span class="tag">${a.tag}</span>${a.id === 'ai-hub' ? '<span class="tag ai-hub-stats"><b data-stat="accounts">0</b> accounts · <b data-stat="providers">0</b> providers</span>' : ''}<div class="vis">${VIS[a.id] || ''}</div><div class="t-foot"><span><i></i>Ready</span>${ARROW}</div>`;
    tiles[a.id] = el;
  });
  const numbers = () => [...grid.children].filter((c) => !c.hidden).forEach((c, i) => { c.querySelector('.key').textContent = i + 1; });
  function applyOrder() {
    const saved = load(K_ORDER), hidden = new Set(load(K_HIDDEN));
    [...saved.filter((i) => tiles[i]), ...APPS.map((a) => a.id).filter((i) => !saved.includes(i))].forEach((id, n) => { tiles[id].hidden = hidden.has(id); tiles[id].style.setProperty('--i', n); grid.appendChild(tiles[id]); });
    numbers();
  }
  const order = () => [...grid.children].map((c) => c.dataset.id);
  function flip(change) {
    const kids = [...grid.children].filter((c) => !c.hidden), first = new Map(kids.map((c) => [c, c.getBoundingClientRect()]));
    change(); if (reduce()) return;
    kids.forEach((c) => { const f = first.get(c), l = c.getBoundingClientRect(), dx = f.left - l.left, dy = f.top - l.top;
      if (dx || dy) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' }); });
  }

  /* ---------- 3D tilt + inner parallax ---------- */
  grid.addEventListener('pointermove', (e) => {
    if (document.body.classList.contains('dragging')) return;
    const t = e.target.closest('.tile'); if (!t) return;
    const r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    t.style.setProperty('--gx', x * 100 + '%'); t.style.setProperty('--gy', y * 100 + '%');
    if (reduce()) return;
    t.style.setProperty('--ry', (x - .5) * 6 + 'deg'); t.style.setProperty('--rx', (.5 - y) * 6 + 'deg');
    t.style.setProperty('--dx', (x - .5) * 1); t.style.setProperty('--dy', (y - .5) * 1);
  }, { passive: true });
  grid.addEventListener('pointerout', (e) => { const t = e.target.closest('.tile'); if (t && !t.contains(e.relatedTarget)) ['--rx', '--ry'].forEach((p) => t.style.setProperty(p, '0deg')), ['--dx', '--dy'].forEach((p) => t.style.setProperty(p, 0)); });

  const side = $('.side');
  side.addEventListener('pointermove', (e) => { const c = e.target.closest('.card'); if (!c || reduce()) return; const r = c.getBoundingClientRect(); c.style.setProperty('--ry', ((e.clientX - r.left) / r.width - .5) * 8 + 'deg'); c.style.setProperty('--rx', (.5 - (e.clientY - r.top) / r.height) * 8 + 'deg'); }, { passive: true });
  side.addEventListener('pointerout', (e) => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); } });

  /* ---------- drag to rearrange ---------- */
  let d = null;
  const place = () => { d.ghost.style.transform = `translate(${d.x - d.ox}px,${d.y - d.oy}px) scale(1.04) rotate(1.4deg)`; };
  function startDrag() {
    if (!d || d.on) return; d.on = true;
    const r = d.t.getBoundingClientRect(); d.ox = d.x - r.left; d.oy = d.y - r.top;
    d.ghost = d.t.cloneNode(true); d.ghost.classList.add('ghost'); d.ghost.style.width = r.width + 'px'; d.ghost.style.height = r.height + 'px'; document.body.appendChild(d.ghost);
    d.t.classList.add('lifted'); document.body.classList.add('dragging'); if (navigator.vibrate) navigator.vibrate(10); place();
  }
  grid.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.tile'); if (!t || (e.button && e.button !== 0)) return;
    d = { t, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, type: e.pointerType, on: false };
    if (e.pointerType === 'touch') d.timer = setTimeout(startDrag, 300);
  });
  document.addEventListener('pointermove', (e) => {
    if (!d) return; d.x = e.clientX; d.y = e.clientY;
    if (!d.on) { const far = Math.hypot(d.x - d.sx, d.y - d.sy); if (d.type === 'touch') { if (far > 9) { clearTimeout(d.timer); d = null; } } else if (far > 6) startDrag(); return; }
    place();
    const hr = home.getBoundingClientRect(); if (d.y < hr.top + 100) home.scrollTop -= 14; else if (d.y > hr.bottom - 60) home.scrollTop += 14;
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
    const r = cur.t.getBoundingClientRect(); cur.ghost.style.transition = reduce() ? 'none' : 'transform .24s cubic-bezier(.2,.8,.2,1),box-shadow .24s'; cur.ghost.style.boxShadow = 'none'; cur.ghost.style.transform = `translate(${r.left}px,${r.top}px)`;
    setTimeout(() => { cur.ghost.remove(); cur.t.classList.remove('lifted'); document.body.classList.remove('dragging'); numbers(); save(K_ORDER, order()); }, reduce() ? 0 : 240);
  }
  document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', endDrag);
  grid.addEventListener('click', (e) => { const t = e.target.closest('.tile'); if (t && !suppressClick) launch(t.dataset.id); });
  grid.addEventListener('keydown', (e) => {
    const t = e.target.closest('.tile'); if (!t) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launch(t.dataset.id); return; }
    if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return; e.preventDefault();
    const vis = [...grid.children].filter((c) => !c.hidden), i = vis.indexOf(t), j = i + (/Left|Up/.test(e.key) ? -1 : 1);
    if (j < 0 || j >= vis.length) return;
    if (!e.altKey) { vis[j].focus(); return; }
    flip(() => grid.insertBefore(t, j < i ? vis[j] : vis[j].nextElementSibling)); t.focus(); numbers(); save(K_ORDER, order()); toast(`${byId(t.dataset.id).name} → position ${j + 1}`);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { const wasMenu = !menu.hidden; toggleMenu(false); if (wasMenu) cbtn.focus(); return; }
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (/^[1-9]$/.test(e.key)) { const v = [...grid.children].filter((c) => !c.hidden)[+e.key - 1]; if (v) launch(v.dataset.id); }
  });

  /* ---------- customize menu ---------- */
  const menu = $('#homeMenu'), cbtn = $('#homeCustomizeBtn');
  const resetLayout = () => { save(K_ORDER, []); save(K_HIDDEN, []); flip(applyOrder); toast('Layout reset'); };
  const buildMenu = () => { const h = new Set(load(K_HIDDEN)); menu.innerHTML = '<h2>Show on Home</h2>' + APPS.map((a) => `<label><input type="checkbox" data-id="${a.id}" ${h.has(a.id) ? '' : 'checked'}/> ${a.name}</label>`).join('') + '<button class="reset" type="button" id="resetLayout">Reset layout</button>'; };
  function toggleMenu(open) { menu.hidden = !open; cbtn.setAttribute('aria-expanded', String(open)); if (open) buildMenu(); }
  cbtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(menu.hidden); });
  menu.addEventListener('click', (e) => { e.stopPropagation(); if (e.target.id === 'resetLayout') { resetLayout(); buildMenu(); } });
  menu.addEventListener('change', (e) => { const id = e.target.dataset.id; if (!id) return; const h = new Set(load(K_HIDDEN)); e.target.checked ? h.delete(id) : h.add(id); save(K_HIDDEN, [...h]); tiles[id].hidden = !e.target.checked; numbers(); });
  document.addEventListener('click', () => toggleMenu(false));
  const K_THEME = 'mad-home-v7-theme';
  if (!window.MadHome.inApp) {
    try { const th = localStorage.getItem(K_THEME); if (th === 'light' || th === 'dark') document.body.dataset.theme = th; } catch (e) {}
  }

  /* ---------- clock ---------- */
  const p2 = (n) => String(n).padStart(2, '0');
  function tick() { const n = new Date(); $('#clock').textContent = p2(n.getHours()) + ':' + p2(n.getMinutes()); }
  tick(); setInterval(tick, 15000);

  /* ---------- live system: real model from the app, demo numbers in a plain browser ---------- */
  const hist = { ram: [], cpu: [] };
  function spark(key, v) {
    const a = hist[key]; a.push(Math.max(0, Math.min(100, v))); if (a.length > 40) a.shift();
    const max = Math.max(20, ...a), pts = a.map((y, i) => [(i / 39) * 120 + (120 - ((a.length - 1) / 39) * 120), 38 - (y / max) * 34]);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    $(`#${key}Line`).setAttribute('d', line); $(`#${key}Area`).setAttribute('d', `${line} L120 40 L${pts[0][0].toFixed(1)} 40 Z`);
  }
  function setSys(m) {
    const ram = +m.appPercent || 0, cpu = +m.systemCpuPercent || 0;
    $('#ramBig').textContent = Math.round(ram) + '%'; $('#cpuBig').textContent = Math.round(cpu) + '%';
    $('#chipRam').textContent = Math.round(ram) + '%'; $('#chipCpu').textContent = Math.round(cpu) + '%';
    $('#ramSub').textContent = (m.totalLabel || '—') + ' used by Mad Station'; if (m.processCountLabel) $('#procs').textContent = m.processCountLabel + ' processes';
    spark('ram', ram * 2.2); spark('cpu', cpu);
  }
  document.addEventListener('mad:memory-model', (e) => setSys(e.detail || {}));
  if (!window.MadHome.inApp) {
    let ram = 9; const step = () => { ram = Math.max(5, Math.min(40, ram + (Math.random() - .5) * 3)); setSys({ appPercent: ram, systemCpuPercent: 14 + Math.random() * 30, totalLabel: (ram * 0.16).toFixed(2) + ' GB', processCountLabel: '6' }); };
    for (let i = 0; i < 30; i++) step(); setInterval(step, 2000);
  }

  /* ---------- parallax: mouse + scroll drive the depth layers and the particle field ---------- */
  const layers = $$('.layers>i');
  let mx = 0, my = 0, cx = 0, cy = 0;
  window.addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; }, { passive: true });
  const cv = $('#fx'), ctx = cv.getContext('2d'); let W = 0, H = 0, dots = [];
  function size() { const dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); dots = Array.from({ length: Math.round(Math.min(90, W * H / 16000)) }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25, z: .25 + Math.random() * .75 })); }
  size(); let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(size, 150); });
  let fxVal = '150,178,255', fxColorDirty = true;
  function fxRgb() {
    if (fxColorDirty) {
      const value = getComputedStyle(document.body).getPropertyValue('--fxc').trim().replace(/\s+/g, ',');
      if (value) fxVal = value;
      fxColorDirty = false;
    }
    return fxVal;
  }
  let motionFrame = 0;
  function frame() {
    motionFrame = 0;
    if (document.hidden || reduce()) { ctx.clearRect(0, 0, W, H); return; }
    cx += (mx - cx) * .06; cy += (my - cy) * .06; const sy = home.scrollTop;
    layers.forEach((l) => { const k = +l.dataset.d; l.style.setProperty('--tx', (-cx * k).toFixed(1) + 'px'); l.style.setProperty('--ty', (-cy * k - sy * k / 120).toFixed(1) + 'px'); });
    ctx.clearRect(0, 0, W, H); const rgb = fxRgb();
    dots.forEach((p) => { p.x += p.vx; p.y += p.vy; if (p.x < 0) p.x = W; if (p.x > W) p.x = 0; if (p.y < 0) p.y = H; if (p.y > H) p.y = 0; p.dx = p.x - cx * 90 * p.z * p.z; p.dy = p.y - cy * 90 * p.z * p.z - sy * .1 * p.z; });
    const linkRadius = 110, linkRadiusSq = linkRadius * linkRadius;
    for (let i = 0; i < dots.length; i++) { const p = dots[i]; ctx.fillStyle = `rgba(${rgb},${.18 + p.z * p.z * .6})`; ctx.beginPath(); ctx.arc(p.dx, p.dy, .6 + p.z * p.z * 2.4, 0, 6.283); ctx.fill();
      for (let j = i + 1; j < dots.length; j++) {
        const q = dots[j], dx = p.dx - q.dx, dy = p.dy - q.dy, distanceSq = dx * dx + dy * dy;
        if (distanceSq < linkRadiusSq) {
          const distance = Math.sqrt(distanceSq);
          ctx.strokeStyle = `rgba(${rgb},${(1 - distance / linkRadius) * .16})`; ctx.beginPath(); ctx.moveTo(p.dx, p.dy); ctx.lineTo(q.dx, q.dy); ctx.stroke();
        }
      }
    }
    motionFrame = requestAnimationFrame(frame);
  }
  function startMotion() { if (!motionFrame && !reduce() && !document.hidden) motionFrame = requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', startMotion);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', startMotion);
  if (typeof MutationObserver === 'function') {
    const invalidateFxColor = () => { fxColorDirty = true; startMotion(); };
    const styleObserver = new MutationObserver(invalidateFxColor);
    styleObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    styleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
  }
  if (window.MadHome) window.MadHome.refreshMotion = startMotion;
  startMotion();

  applyOrder();
})();
