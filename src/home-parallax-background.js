// The shared Parallax Appearance preset reuses the 3D Parallax home's depth stack on Simple.
// It is intentionally dormant unless body[data-background-style="parallax"] is active.
(function () {
  'use strict';
  const root = document.getElementById('homeParallaxBackground');
  const home = document.getElementById('launcherScreen');
  const canvas = document.getElementById('homeParallaxCanvas');
  if (!root || !home || !canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const layers = [...root.querySelectorAll('[data-depth]')];
  const reduceMotion = () => document.body.classList.contains('reduce-motion')
    || document.body.classList.contains('no-hover-animation')
    || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let width = 0, height = 0, dots = [], mx = 0, my = 0, cx = 0, cy = 0, frameId = 0;

  let accentRgbValue = null;
  function accentRgb() {
    if (accentRgbValue) return accentRgbValue;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const hex = accent.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const v = hex[1];
      accentRgbValue = [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
    } else {
      const rgb = accent.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
      accentRgbValue = rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : [138, 180, 255];
    }
    return accentRgbValue;
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = Array.from({ length: Math.round(Math.min(78, width * height / 18000)) }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .22, z: .25 + Math.random() * .75,
    }));
  }

  function clearFrame() { ctx.clearRect(0, 0, width, height); }
  function paint() {
    frameId = 0;
    if (document.hidden || !isActive() || reduceMotion()) { clearFrame(); return; }
    cx += (mx - cx) * .06; cy += (my - cy) * .06;
    const scrollY = home.scrollTop;
    layers.forEach((layer) => {
      const depth = Number(layer.dataset.depth) || 0;
      layer.style.setProperty('--hp-tx', `${(-cx * depth).toFixed(1)}px`);
      layer.style.setProperty('--hp-ty', `${(-cy * depth - scrollY * depth / 120).toFixed(1)}px`);
    });
    clearFrame();
    const [r, g, b] = accentRgb();
    dots.forEach((p) => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = width; if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height; if (p.y > height) p.y = 0;
      p.dx = p.x - cx * 90 * p.z * p.z;
      p.dy = p.y - cy * 90 * p.z * p.z - scrollY * .1 * p.z;
    });
    const linkRadius = 104, linkRadiusSq = linkRadius * linkRadius;
    for (let i = 0; i < dots.length; i++) {
      const p = dots[i];
      ctx.fillStyle = `rgba(${r},${g},${b},${.16 + p.z * p.z * .56})`;
      ctx.beginPath(); ctx.arc(p.dx, p.dy, .6 + p.z * p.z * 2.2, 0, Math.PI * 2); ctx.fill();
      for (let j = i + 1; j < dots.length; j++) {
        const q = dots[j], dx = p.dx - q.dx, dy = p.dy - q.dy, distanceSq = dx * dx + dy * dy;
        if (distanceSq < linkRadiusSq) {
          const distance = Math.sqrt(distanceSq);
          ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - distance / linkRadius) * .14})`;
          ctx.beginPath(); ctx.moveTo(p.dx, p.dy); ctx.lineTo(q.dx, q.dy); ctx.stroke();
        }
      }
    }
    frameId = window.requestAnimationFrame(paint);
  }

  function isActive() { return document.body.dataset.backgroundStyle === 'parallax'; }
  function stop() { if (frameId) window.cancelAnimationFrame(frameId); frameId = 0; clearFrame(); }
  function sync() {
    accentRgbValue = null;
    const active = isActive();
    root.hidden = !active;
    document.body.classList.toggle('home-parallax-background-active', active);
    if (active && !reduceMotion() && !document.hidden) {
      resize();
      if (!frameId) frameId = window.requestAnimationFrame(paint);
    } else {
      stop();
      layers.forEach((layer) => { layer.style.setProperty('--hp-tx', '0px'); layer.style.setProperty('--hp-ty', '0px'); });
    }
  }

  window.addEventListener('pointermove', (event) => {
    mx = event.clientX / Math.max(1, window.innerWidth) - .5;
    my = event.clientY / Math.max(1, window.innerHeight) - .5;
  }, { passive: true });
  window.addEventListener('resize', () => { if (isActive()) { resize(); sync(); } }, { passive: true });
  home.addEventListener('scroll', () => { if (isActive() && !reduceMotion() && !frameId) frameId = window.requestAnimationFrame(paint); }, { passive: true });
  document.addEventListener('visibilitychange', sync);
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', sync);
  if (typeof MutationObserver === 'function') {
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-background-style', 'class'] });
    new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  }
  sync();
})();
