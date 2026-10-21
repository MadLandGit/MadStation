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
  const K_ORDER = 'mad-home-v8-order', K_HIDDEN = 'mad-home-v8-hidden', K_MAIN = 'mad-home-v8-main';
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const byId = (id) => APPS.find((a) => a.id === id);
  const home = $('#launcherScreen'), grid = $('#homeApps');
  const reduce = () => document.body.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  let launcher = null, suppressClick = false;

  /* ---------- host hooks (same names the old Home used) ---------- */
  window.MadHomeApps = { setLauncher(fn) { if (typeof fn === 'function') launcher = fn; } };
  let liveStats = { accounts: 0, providers: 0 };
  window.MadHome = {
    inApp: window.parent !== window || !!window.MadStationMemoryMonitor,
    setStats({ accounts, providers } = {}) {
      if (Number.isFinite(Number(accounts))) liveStats.accounts = Math.max(0, Math.floor(Number(accounts)));
      if (Number.isFinite(Number(providers))) liveStats.providers = Math.max(0, Math.floor(Number(providers)));
      const node = $('#mainStats');
      if (node) {
        node.textContent = `${liveStats.accounts} accounts · ${liveStats.providers} providers`;
        node.hidden = false;
      }
    },
    toggleTheme() {
      const b = document.body;
      b.dataset.theme = b.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('mad-home-v8-theme', b.dataset.theme); } catch (e) {}
    },
    refreshMotion() {},
  };
  function toast(t) { const n = $('#homeToast'); n.textContent = t; n.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => n.classList.remove('show'), 1700); }
  function launch(id) {
    const a = byId(id); if (!a) return;
    if (launcher) launcher(id); else toast(`Opening ${a.name}…`);
  }

  /* ---------- tiles + main app ---------- */
  const tiles = {}, mcard = $('#mainCard');
  let main = 'ai-hub'; try { const m = localStorage.getItem(K_MAIN); if (byId(m)) main = m; } catch (e) {}
  const STAR_P = '<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>';
  const isShown = (id) => id === main || !tiles[id].hidden;
  APPS.forEach((a) => {
    const el = document.createElement('div');
    el.className = 'tile'; el.dataset.id = a.id; el.dataset.h = a.h; el.dataset.name = (a.name + ' ' + a.tag).toLowerCase();
    el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', `${a.name}. Enter to open, Alt plus arrow keys to move.`);
    el.innerHTML = `<span class="ico">${svg(a.icon)}</span><span class="t-txt"><strong>${a.name}</strong><span class="tag">${a.tag}</span></span><button class="star" type="button" aria-label="Make ${a.name} the main app" title="Make main app">${svg(STAR_P)}</button><span class="key"></span>`;
    tiles[a.id] = el;
  });
  function renderMain(pop) {
    const a = byId(main); mcard.dataset.h = a.h; mcard.dataset.id = a.id;
    mcard.setAttribute('aria-label', `Main app: ${a.name}. Enter to open.`);
    document.body.style.setProperty('--mh', `var(--c${a.h})`);
    const nm = [...a.name].map((c, i) => `<span class="m-letter" data-letter="${i}">${c === ' ' ? '&nbsp;' : c}</span>`).join(''), fc = a.tag.split(' · ').map((t, i) => `<span class="fc" data-feature="${i}">${t}</span>`).join('');
    mcard.innerHTML = `<i class="blob b1"></i><i class="blob b2"></i><i class="sweep"></i><div class="m-bar"><span class="badge">${svg(STAR_P)}Main app</span><span class="m-st"><i class="dot"></i>Ready</span><span class="key">1</span></div>
      <div class="m-body"><div class="m-orb"><i class="pd base"></i><i class="pd"></i><i class="pd p2"></i><i class="orbit"></i><i class="halo"></i><span class="ico big">${svg(a.icon)}</span></div>
      <div class="m-txt"><strong class="m-name" aria-label="${a.name}">${nm}</strong><div class="fcs">${fc}${a.id === 'ai-hub' ? '<span class="fc stat-fc" id="mainStats"></span>' : ''}</div><div class="m-actions"><button class="open" type="button">Open ${a.name}${ARROW}</button></div></div></div>
      <div class="vis big">${VIS[a.id] || ''}</div>`;
    mcard.querySelectorAll('.m-name .m-letter').forEach((span, i) => span.style.setProperty('--i', i));
    mcard.querySelectorAll('.fcs .fc').forEach((span, i) => { span.style.setProperty('--k', 10 + i * 8); span.style.animationDelay = `${-i * 1.1}s`; });
    window.MadHome?.setStats?.(liveStats);
    buildSats(); mcard.classList.remove('swap'); if (pop) { void mcard.offsetWidth; mcard.classList.add('swap'); }
    if (pop && !reduce()) mcard.animate([{ opacity: .4, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  const numbers = () => [...grid.children].filter((c) => !c.hidden).forEach((c, i) => { c.querySelector('.key').textContent = i + 2; });
  function applyOrder() {
    const saved = load(K_ORDER), hidden = new Set(load(K_HIDDEN));
    [...saved.filter((i) => tiles[i]), ...APPS.map((a) => a.id).filter((i) => !saved.includes(i))].forEach((id, n) => { tiles[id].hidden = id === main || hidden.has(id); tiles[id].style.setProperty('--i', n); grid.appendChild(tiles[id]); });
    numbers();
  }
  const order = () => [...grid.children].map((c) => c.dataset.id);
  function setMain(id) {
    if (id === main || !byId(id)) return;
    const old = main, ord = order(), i = ord.indexOf(id), j = ord.indexOf(old);
    main = id; try { localStorage.setItem(K_MAIN, id); } catch (e) {}
    [ord[i], ord[j]] = [ord[j], ord[i]]; save(K_ORDER, ord);
    flip(applyOrder); renderMain(true);
    if (!reduce()) tiles[old].animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
    toast(`${byId(id).name} is now your main app`);
  }
  mcard.addEventListener('click', () => launch(main));
  mcard.addEventListener('keydown', (e) => { if (e.target === mcard && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); launch(main); } });
  function flip(change) {
    const kids = [...grid.children].filter((c) => !c.hidden), first = new Map(kids.map((c) => [c, c.getBoundingClientRect()]));
    change(); if (reduce()) return;
    kids.forEach((c) => { const f = first.get(c), l = c.getBoundingClientRect(), S = phy.get(c); if (S && l.width) { S.x += f.left - l.left; S.y += f.top - l.top; } });
  }

  /* ---------- 3D tilt + inner parallax ---------- */
  function tilt(el, e, deg) {
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--gx', x * 100 + '%'); el.style.setProperty('--gy', y * 100 + '%'); if (reduce()) return;
    el.style.setProperty('--ry', (x - .5) * deg + 'deg'); el.style.setProperty('--rx', (.5 - y) * deg + 'deg'); el.style.setProperty('--dx', (x - .5) * 2); el.style.setProperty('--dy', (y - .5) * 2);
  }
  const untilt = (el) => { ['--rx', '--ry'].forEach((p) => el.style.setProperty(p, '0deg')); ['--dx', '--dy'].forEach((p) => el.style.setProperty(p, 0)); };
  grid.addEventListener('pointermove', (e) => { if (document.body.classList.contains('dragging')) return; const t = e.target.closest('.tile'); if (t) tilt(t, e, 10); }, { passive: true });
  grid.addEventListener('pointerout', (e) => { const t = e.target.closest('.tile'); if (t && !t.contains(e.relatedTarget)) untilt(t); });
  mcard.addEventListener('pointermove', (e) => tilt(mcard, e, 14), { passive: true });
  mcard.addEventListener('pointerleave', () => untilt(mcard));

  /* ---------- gravity physics: tiles are springs pulled toward the pointer or the dragged tile ---------- */
  const phy = new Map(); let gp = null, sats = [];
  const bod = (el) => { let S = phy.get(el); if (!S) phy.set(el, S = { x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0, tx: 0, ty: 0, tr: 0 }); return S; };
  grid.addEventListener('pointermove', (e) => { gp = { x: e.clientX, y: e.clientY, s: 1 }; }, { passive: true });
  grid.addEventListener('pointerleave', () => { gp = null; });
  function physics() {
    const drag = d && d.on, calm = document.body.classList.contains('reduce-motion');
    if (drag) { gp = { x: d.x, y: d.y, s: 1.9 }; d.vx *= .88; place(); }
    [...grid.children].forEach((el) => {
      if (el.hidden) return; const S = bod(el); S.tx = S.ty = S.tr = 0;
      if (gp && !calm && !el.classList.contains('lifted')) {
        const r = el.getBoundingClientRect(), dx = gp.x - (r.left - S.x + r.width / 2), dy = gp.y - (r.top - S.y + r.height / 2), dist = Math.hypot(dx, dy) || 1, range = 300 * gp.s;
        const f = dist < range ? Math.pow(1 - dist / range, 2) * gp.s * Math.min(1, dist / 40) : 0;
        S.tx = dx / dist * f * 22; S.ty = dy / dist * f * 18; S.tr = dx / dist * f * 4;
      }
      S.vx = (S.vx + (S.tx - S.x) * .12) * .82; S.vy = (S.vy + (S.ty - S.y) * .12) * .82; S.vr = (S.vr + (S.tr - S.r) * .12) * .82;
      S.x += S.vx; S.y += S.vy; S.r += S.vr;
      el.style.translate = `${S.x.toFixed(2)}px ${S.y.toFixed(2)}px`; el.style.rotate = `${S.r.toFixed(2)}deg`;
    });
  }
  let oa = 0, oc = { spd: .012, dir: 1, R: 122, e: .38, t: -.3 };
  function buildSats() {
    const orb = mcard.querySelector('.m-orb'), h = byId(main).h;
    oc = { spd: .008 + h * .003, dir: h % 2 ? 1 : -1, R: 112 + (h % 3) * 10, e: .26 + (h % 3) * .09, t: (h - 3.5) * .28 };
    sats = []; for (let c = 0; c < 2; c++) for (let k = 0; k < 5; k++) { const el = document.createElement('span'); el.className = 'sat'; orb.appendChild(el); sats.push({ el, c, k }); }
    orbit(0);
  }
  function orbit(sp = oc.spd) {
    oa += sp * oc.dir;
    sats.forEach((s) => { const a = oa + s.c * Math.PI - s.k * .1 * oc.dir, x = Math.cos(a) * oc.R, y = Math.sin(a) * oc.R * oc.e, z = (Math.sin(a) + 1) / 2, ct = Math.cos(oc.t), st = Math.sin(oc.t), f = 1 - s.k * .16;
      s.el.style.transform = `translate3d(${(x * ct - y * st).toFixed(1)}px,${(x * st + y * ct).toFixed(1)}px,0) scale(${((.6 + z * .6) * f).toFixed(2)})`; s.el.style.zIndex = z > .5 ? 5 : 1; s.el.style.opacity = ((.45 + z * .55) * f).toFixed(2); });
  }

  /* ---------- drag to rearrange ---------- */
  let d = null;
  const overMain = () => { if (!d) return false; const r = mcard.getBoundingClientRect(); return d.x >= r.left && d.x <= r.right && d.y >= r.top && d.y <= r.bottom; };
  const place = () => { d.ghost.style.transform = `translate(${d.x - d.ox}px,${d.y - d.oy}px) scale(1.05) rotate(${Math.max(-14, Math.min(14, d.vx * .8))}deg)`; };
  function startDrag() {
    if (!d || d.on) return; d.on = true;
    const r = d.t.getBoundingClientRect(); d.ox = d.x - r.left; d.oy = d.y - r.top;
    d.ghost = d.t.cloneNode(true); d.ghost.classList.add('ghost'); d.ghost.style.translate = ''; d.ghost.style.rotate = ''; d.ghost.style.width = r.width + 'px'; d.ghost.style.height = r.height + 'px'; document.body.appendChild(d.ghost);
    d.t.classList.add('lifted'); document.body.classList.add('dragging'); if (navigator.vibrate) navigator.vibrate(10); place();
  }
  grid.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.tile'); if (!t || e.target.closest('.star') || (e.button && e.button !== 0)) return;
    d = { t, vx: 0, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, type: e.pointerType, on: false };
    if (e.pointerType === 'touch') d.timer = setTimeout(startDrag, 300);
  });
  document.addEventListener('pointermove', (e) => {
    if (!d) return; d.vx = (e.clientX - d.x) * .5 + d.vx * .5; d.x = e.clientX; d.y = e.clientY;
    if (!d.on) { const far = Math.hypot(d.x - d.sx, d.y - d.sy); if (d.type === 'touch') { if (far > 9) { clearTimeout(d.timer); d = null; } } else if (far > 6) startDrag(); return; }
    place();
    mcard.classList.toggle('drop', overMain());
    const hr = home.getBoundingClientRect(); if (d.y < hr.top + 100) home.scrollTop -= 14; else if (d.y > hr.bottom - 60) home.scrollTop += 14;
    const over = document.elementFromPoint(d.x, d.y), target = over && over.closest && over.closest('.tile');
    if (target && target !== d.t && target.parentNode === grid) {
      const r = target.getBoundingClientRect(), after = d.x > r.left + r.width / 2, ref = after ? target.nextElementSibling : target;
      if (ref !== d.t && ref !== d.t.nextElementSibling) flip(() => grid.insertBefore(d.t, ref));
    }
  }, { passive: true });
  document.addEventListener('touchmove', (e) => { if (d && d.on) e.preventDefault(); }, { passive: false });
  function endDrag() {
    if (!d) return; clearTimeout(d.timer); const cur = d, toMain = cur.on && overMain(); d = null; mcard.classList.remove('drop'); if (!cur.on) return;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    const cleanup = () => { cur.ghost.remove(); cur.t.classList.remove('lifted'); document.body.classList.remove('dragging'); };
    if (toMain) { cleanup(); setMain(cur.t.dataset.id); return; }
    const r = cur.t.getBoundingClientRect(); cur.ghost.style.transition = reduce() ? 'none' : 'transform .24s cubic-bezier(.2,.8,.2,1),box-shadow .24s'; cur.ghost.style.boxShadow = 'none'; cur.ghost.style.transform = `translate(${r.left}px,${r.top}px)`;
    setTimeout(() => { cleanup(); numbers(); save(K_ORDER, order()); if (!reduce()) { cur.t.animate([{ scale: '1.1' }, { scale: '.95' }, { scale: '1' }], { duration: 480, easing: 'ease-out' }); bod(cur.t).vy = -9; } }, reduce() ? 0 : 240);
  }
  document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', endDrag);
  grid.addEventListener('click', (e) => { const t = e.target.closest('.tile'); if (!t || suppressClick) return; if (e.target.closest('.star')) { e.stopPropagation(); setMain(t.dataset.id); } else launch(t.dataset.id); });
  grid.addEventListener('keydown', (e) => {
    const t = e.target.closest('.tile'); if (!t || e.target.closest('.star')) return;
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
    if (/^[1-9]$/.test(e.key)) { const ids = [main, ...[...grid.children].filter((c) => !c.hidden).map((c) => c.dataset.id)]; if (ids[+e.key - 1]) launch(ids[+e.key - 1]); }
  });

  /* ---------- customize menu ---------- */
  const menu = $('#homeMenu'), cbtn = $('#homeCustomizeBtn');
  const resetLayout = () => { save(K_ORDER, []); save(K_HIDDEN, []); main = 'ai-hub'; try { localStorage.removeItem(K_MAIN); } catch (e) {} renderMain(true); flip(applyOrder); toast('Layout reset'); };
  const buildMenu = () => { const h = new Set(load(K_HIDDEN)); menu.innerHTML = '<h2>Show in list</h2>' + APPS.map((a) => `<label><input type="checkbox" data-id="${a.id}" ${a.id !== main && h.has(a.id) ? '' : 'checked'} ${a.id === main ? 'disabled' : ''}/> ${a.name}</label>`).join('') + '<button class="reset" type="button" id="resetLayout">Reset layout</button>'; };
  function toggleMenu(open) { menu.hidden = !open; cbtn.setAttribute('aria-expanded', String(open)); if (open) buildMenu(); }
  cbtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(menu.hidden); });
  menu.addEventListener('click', (e) => { e.stopPropagation(); if (e.target.id === 'resetLayout') { resetLayout(); buildMenu(); } });
  menu.addEventListener('change', (e) => { const id = e.target.dataset.id; if (!id) return; const h = new Set(load(K_HIDDEN)); e.target.checked ? h.delete(id) : h.add(id); save(K_HIDDEN, [...h]); tiles[id].hidden = !e.target.checked; numbers(); });
  document.addEventListener('click', () => toggleMenu(false));
  const K_THEME = 'mad-home-v8-theme';
  try { const th = localStorage.getItem(K_THEME); if (th === 'light' || th === 'dark') document.body.dataset.theme = th; } catch (e) {}
  $('#themeBtn').addEventListener('click', () => { window.MadHome?.toggleTheme?.(); });

  /* ---------- clock ---------- */
  const p2 = (n) => String(n).padStart(2, '0');
  function tick() { const n = new Date(); $('#clock').innerHTML = p2(n.getHours()) + '<em>:</em>' + p2(n.getMinutes()); }
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
    $('#chipRam').textContent = Math.round(ram) + '%'; $('#chipCpu').textContent = Math.round(cpu) + '%'; $('#ramBar').style.width = Math.min(100, ram * 2.2) + '%'; $('#cpuBar').style.width = Math.min(100, cpu) + '%';
    $('#ramSub').textContent = (m.totalLabel || '—') + ' used by Mad Station'; if (m.processCountLabel) $('#procs').textContent = m.processCountLabel + ' processes';
    spark('ram', ram * 2.2); spark('cpu', cpu);
  }
  document.addEventListener('mad:memory-model', (e) => setSys(e.detail || {}));
  if (!window.MadHome.inApp) {
    let ram = 9; const step = () => { ram = Math.max(5, Math.min(40, ram + (Math.random() - .5) * 3)); setSys({ appPercent: ram, systemCpuPercent: 14 + Math.random() * 30, totalLabel: (ram * 0.16).toFixed(2) + ' GB', processCountLabel: '6' }); };
    for (let i = 0; i < 30; i++) step(); setInterval(step, 2000);
  }

  /* ---------- parallax: mouse + scroll drive the depth layers and the particle field ---------- */
  const layers = $$('.layers>i'), spot = $('#spot'), stars = [];
  let mx = 0, my = 0, cx = 0, cy = 0;
  window.addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; }, { passive: true });
  const cv = $('#fx'), ctx = cv.getContext('2d'); let W = 0, H = 0, dots = [];
  function size() { const dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); dots = Array.from({ length: Math.round(Math.min(90, W * H / 16000)) }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25, z: .25 + Math.random() * .75 })); }
  size(); let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(size, 150); });
  let fxVal = '138,180,255', fxColorDirty = true;
  function fxRgb() {
    if (fxColorDirty) {
      fxVal = getComputedStyle(document.body).getPropertyValue('--fxc').trim().replace(/\s+/g, ',') || '138,180,255';
      fxColorDirty = false;
    }
    return fxVal;
  }
  let frameHandle = 0;
  function frame() {
    frameHandle = 0;
    if (document.hidden || reduce()) return;
    cx += (mx - cx) * .06; cy += (my - cy) * .06; const sy = home.scrollTop;
    spot.style.transform = `translate3d(${((cx + .5) * innerWidth).toFixed(0)}px,${((cy + .5) * innerHeight).toFixed(0)}px,0)`; physics(); orbit();
    if (!document.body.classList.contains('reduce-motion') && !mcard.matches(':hover')) { mcard.style.setProperty('--dx', (cx * 2).toFixed(3)); mcard.style.setProperty('--dy', (cy * 2).toFixed(3)); mcard.style.setProperty('--ry', (cx * 11).toFixed(2) + 'deg'); mcard.style.setProperty('--rx', (-cy * 11).toFixed(2) + 'deg'); }
    layers.forEach((l) => { const k = +l.dataset.d; l.style.setProperty('--tx', (-cx * k).toFixed(1) + 'px'); l.style.setProperty('--ty', (-cy * k - sy * k / 120).toFixed(1) + 'px'); });
    ctx.clearRect(0, 0, W, H); const rgb = fxRgb();
    if (stars.length < 2 && Math.random() < .004) stars.push({ x: Math.random() * W * .8, y: Math.random() * H * .4, l: 0 });
    for (let k = stars.length - 1; k >= 0; k--) { const st = stars[k]; st.x += 11; st.y += 5; st.l++; const g = ctx.createLinearGradient(st.x, st.y, st.x - 110, st.y - 50); g.addColorStop(0, `rgba(${rgb},${Math.max(0, .8 - st.l / 60)})`); g.addColorStop(1, `rgba(${rgb},0)`); ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(st.x - 110, st.y - 50); ctx.stroke(); if (st.l > 60) stars.splice(k, 1); }
    ctx.lineWidth = 1;
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
    frameHandle = requestAnimationFrame(frame);
  }
  function refreshMotion() {
    if (reduce() || document.hidden) { if (frameHandle) cancelAnimationFrame(frameHandle); frameHandle = 0; return; }
    if (!frameHandle) frameHandle = requestAnimationFrame(frame);
  }
  window.MadHome.refreshMotion = refreshMotion;
  document.addEventListener('visibilitychange', refreshMotion);
  if (typeof MutationObserver === 'function') {
    const invalidateFxColor = () => { fxColorDirty = true; refreshMotion(); };
    const styleObserver = new MutationObserver(invalidateFxColor);
    styleObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    styleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
  }
  refreshMotion();

  renderMain(false); applyOrder();
  $$('.top>.brand,.top-r>*').forEach((el, i) => { el.style.animationDelay = i * 70 + 'ms'; });
  if (!reduce()) [...grid.children].forEach((el, i) => { const S = bod(el); S.y = -110 - i * 38; S.r = i % 2 ? 7 : -7; });
  window.MadHome.setMain = setMain; window.MadHome.getMain = () => main;
})();
