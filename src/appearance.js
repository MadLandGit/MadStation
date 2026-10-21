// Shared by the main window and the toolbar so both always use the same theme and accent.
(function () {
  const ACCENTS = {
    blue:   { dark: ['#8ab4ff', '#5f9bff'], light: ['#2767d9', '#1558ca'] },
    violet: { dark: ['#b69cff', '#8f6bff'], light: ['#6d44d8', '#5a32c0'] },
    pink:   { dark: ['#ff8fc0', '#ff5fa5'], light: ['#cf2f7c', '#b81f68'] },
    red:    { dark: ['#ff8a8a', '#ff5f5f'], light: ['#cc3a3a', '#b32a2a'] },
    orange: { dark: ['#ffb072', '#ff9238'], light: ['#c4600f', '#a94f06'] },
    green:  { dark: ['#7ee0a2', '#46cc7b'], light: ['#1f8a4c', '#16743d'] },
    teal:   { dark: ['#6fdcd3', '#33c5bb'], light: ['#0e8a84', '#0a746f'] },
  };
  const media = window.matchMedia('(prefers-color-scheme: light)');
  let last = null;

  function hexToRgb(hex) {
    const value = String(hex || '').trim().replace(/^#/, '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return null;
    return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
  }

  function mix(hex, target, amount) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const t = { r: target[0], g: target[1], b: target[2] };
    const m = Math.max(0, Math.min(1, amount));
    const out = {
      r: Math.round(rgb.r + (t.r - rgb.r) * m),
      g: Math.round(rgb.g + (t.g - rgb.g) * m),
      b: Math.round(rgb.b + (t.b - rgb.b) * m),
    };
    return `#${[out.r, out.g, out.b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  }

  function getAccentPair(accent, resolved) {
    if (typeof accent === 'string' && /^#[0-9a-f]{6}$/i.test(accent)) {
      return [accent, mix(accent, [0, 0, 0], resolved === 'light' ? 0.2 : 0.1)];
    }
    return (ACCENTS[accent] || ACCENTS.blue)[resolved];
  }

  function apply(settings) {
    last = settings || last || {};
    const s = last;
    const theme = ['dark', 'light', 'system'].includes(s.theme) ? s.theme : 'dark';
    const resolved = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme;
    const preserveNativeAccent = s.preserveNativeAccent === true;
    const pair = getAccentPair(s.accent, resolved);
    const root = document.documentElement;
    // Homepage accents reuse the same resolved palette values as Appearance;
    // it does not invent parallel colours or overwrite the user's selected --accent.
    for (const [name, palette] of Object.entries(ACCENTS)) {
      root.style.setProperty(`--accent-preset-${name}`, palette[resolved][0]);
      root.style.setProperty(`--accent-preset-${name}-strong`, palette[resolved][1]);
    }
    if (!preserveNativeAccent) {
      root.style.setProperty('--accent', pair[0]);
      root.style.setProperty('--accent-strong', pair[1]);
    }
    const body = document.body;
    body.dataset.theme = theme;
    body.dataset.density = s.density === 'compact' ? 'compact' : 'comfortable';
    body.dataset.cardSpacing = ['compact','comfortable','spacious'].includes(s.cardSpacing) ? s.cardSpacing : 'comfortable';
    body.dataset.borderSpacing = ['compact','comfortable','spacious'].includes(s.borderSpacing) ? s.borderSpacing : 'comfortable';
    body.dataset.surfaceStyle = ['solid','glass','elevated','frosted'].includes(s.surfaceStyle) ? s.surfaceStyle : 'solid';
    const builtInBackgrounds = ['plain','aurora','grid','spotlight','mesh','neon','parallax','dots','rings','hex','waves','diagonal','circuit','constellation','tiles'];
    body.dataset.backgroundStyle = builtInBackgrounds.includes(s.backgroundStyle) || s.backgroundStyle === 'custom' ? s.backgroundStyle : 'plain';
    root.style.removeProperty('--custom-background-image');
    if (body.dataset.backgroundStyle === 'custom') {
      const selected = Array.isArray(s.customBackgrounds) ? s.customBackgrounds.find((item) => item && item.id === s.backgroundId) : null;
      if (selected?.url) root.style.setProperty('--custom-background-image', `url(${JSON.stringify(selected.url)})`);
      else body.dataset.backgroundStyle = 'plain';
    }
    body.dataset.cornerStyle = ['soft','sharp','square','ultra'].includes(s.cornerStyle) ? s.cornerStyle : 'soft';
    body.dataset.buttonCorner = ['soft','pill','square','sharp','glass','neon'].includes(s.buttonCorner) ? s.buttonCorner : 'soft';
    body.dataset.buttonBackground = ['solid','outline','ghost','contrast','glass','neon','text'].includes(s.buttonBackground) ? s.buttonBackground : 'solid';
    body.dataset.borderStyle = ['subtle','balanced','strong','neon','neon2','glass','none'].includes(s.borderStyle) ? s.borderStyle : 'subtle';
    body.dataset.shadowStyle = ['none','soft','strong','neon','glass'].includes(s.shadowStyle) ? s.shadowStyle : 'soft';
    body.dataset.showStatusBar = s.showStatusBar === false ? 'false' : 'true';

    // The isolated Home gets the host's resolved core palette so its dark/light/system
    // colours match the rest of Mad Station instead of maintaining a parallel palette.
    const hostPalette = s.hostPalette && typeof s.hostPalette === 'object' && !Array.isArray(s.hostPalette) ? s.hostPalette : null;
    if (hostPalette) {
      const allowedPaletteProperties = ['--bg', '--sidebar', '--surface', '--surface-2', '--surface-3', '--line', '--line-strong', '--text', '--muted', '--muted-2', '--danger', '--shadow'];
      if (!preserveNativeAccent) allowedPaletteProperties.push('--accent', '--accent-strong');
      for (const property of allowedPaletteProperties) {
        const value = hostPalette[property];
        if (typeof value === 'string' && value.trim() && value.length <= 400 && !/[;{}]/.test(value)) root.style.setProperty(property, value.trim());
      }
    }
    body.classList.toggle('no-hover-animation', s.animateHover === false);
    body.classList.toggle('reduce-motion', Boolean(s.reduceMotion));
  }

  // In the app, the host bridge re-sends the newly resolved palette when System mode changes.
  // Only standalone previews should resolve the OS scheme locally; otherwise this frame
  // could briefly reapply a stale host palette while the host is already switching modes.
  media.addEventListener('change', () => { if (last && !last.hostPalette) apply(last); });
  window.MAD_ACCENTS = ACCENTS;
  window.applyAppearance = apply;
})();
