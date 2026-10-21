const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Retro Complex is a separate homepage option and preserves all existing options', () => {
  const html = read('src/renderer.html');
  assert.match(html, /id="launcherRetroComplexScreen"[^>]*data-home-src="home-retro-complex\.html"[^>]*data-home-unload-inactive="true"/);
  assert.doesNotMatch(html.match(/<iframe id="launcherRetroComplexScreen"[^>]*>/)?.[0] || '', /\ssrc=/, 'inactive homepage is not loaded eagerly');
  const switcher = read('src/home-page-switcher.js');
  assert.match(switcher, /'retro-complex': \{ frame: document\.getElementById\('launcherRetroComplexScreen'\), channel: 'madstation-home-retro-complex' \}/);
  assert.match(switcher, /Object\.prototype\.hasOwnProperty\.call\(FRAMES, value\)/, 'registered homepage modes remain valid through the centralized frame registry');
  assert.match(read('src/styles.css'), /#launcherRetroComplexScreen\.home-retro-complex-frame/);
  const picker = read('src/renderer-react/appearance-controls.tsx');
  for (const [value, label] of [['v2','Simple'],['retro','Simple Retro'],['retro-complex','Retro Complex'],['parallax','3D Parallax'],['parallax-big','3D Parallax Big App'],['galaxy','Galaxy'],['parallax-jungle','Parallax Jungle'],['claymorphism','Claymorphism'],['glass','Glass'],]) {
    assert.ok(picker.includes(`id: '${value}', label: '${label}'`), `${label} appears in Themes`);
  }
});

test('Retro Complex retains the supplied CRT/desk/floppy-drive design and uses independent storage', () => {
  const html = read('src/home-retro-complex.html');
  assert.match(html, /class="case"/);
  assert.match(html, /class="desk"/);
  assert.match(html, /id="drive"/);
  assert.match(html, /id="mainCard"/);
  assert.match(html, /mad-retro-complex-main/);
  assert.doesNotMatch(html, /mad-retro-complex-ph|id="phBtn"|Screen:/, 'the old per-screen phosphor control is removed');
  assert.match(html, /<span class="brand" aria-label="Mad Station"><b>MAD<\/b> Station<\/span>/, 'the MAD Station badge is shown on the lower monitor bezel');
  assert.doesNotMatch(html, /class="note n1"/, 'the instruction sticker is intentionally removed');
  assert.match(html, /class="chip madstation-theme-quick-trigger" id="themeBtn" data-theme-quick-trigger/, 'the existing analog key now opens Quick Access');
  assert.equal((html.match(/data-theme-quick-trigger/g) || []).length, 1, 'there is only one Quick Access trigger on the monitor chin');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.chin #themeBtn::after[\s\S]*?content: none !important/, 'the retired moon glyph does not stack on top of the Quick Access icon');
  assert.match(html, /body\.dataset\.theme = effectiveTheme/, 'host theme selection updates the actual scene theme');
  assert.match(html, /window\.addEventListener\('madstation:appearance-theme-mode'/, 'standalone Quick Access theme toggles update the scene');
  assert.match(html, /body\[data-home-style="retro-complex"\]\[data-theme="light"\] \.window-view/, 'day mode includes an explicit daylight sky override');
  assert.match(html, /body\[data-home-style="retro-complex"\]\[data-theme="light"\] \.wall-sconce \.sconce-light/, 'day mode reduces the lamp light to fit daylight');
  assert.match(read('src/home-quick-access-theme.js'), /const nextTheme = resolvedTheme\(state\.theme\) === 'light' \? 'dark' : 'light'/, 'Quick Access toggles correctly even when the initial appearance was System');
  assert.doesNotMatch(html, /Station 64|setPh|press T to change screen colour/);
  assert.match(html, /PH = accent;/, 'phosphor visuals follow the shared Appearance accent');
  assert.match(html, /mad-retro-complex-order/);
  assert.match(html, /id="launcherSettingsBtn"/);
  assert.match(html, /<link href="design-tokens\.css" rel="stylesheet"\/>/);
  assert.match(html, /<script src="appearance\.js"><\/script>/);
  assert.match(html, /<script src="home-retro-complex-bridge\.js"><\/script>/);
});

test('Retro Complex connects apps, Settings, shared Appearance, live telemetry and readiness recovery', () => {
  const html = read('src/home-retro-complex.html');
  const bridge = read('src/home-retro-complex-bridge.js');
  assert.match(html, /function launch\(id\)/);
  assert.match(html, /function setMain\(id\)/);
  assert.match(html, /mad:memory-model/);
  assert.match(html, /function setSys\(m\)/);
  assert.match(html, /applyHostAppearance\(settings\)/);
  assert.match(html, /body\.classList\.contains\('reduce-motion'\)/);
  assert.match(bridge, /const CHANNEL = 'madstation-home-retro-complex'/);
  assert.match(bridge, /window\.MadHomeApps\?\.setLauncher\?\./);
  assert.match(bridge, /sendHost\('launch', \{ target \}\)/);
  assert.match(bridge, /sendHost\('open-settings'\)/);
  assert.match(bridge, /window\.applyAppearance\?\./);
  assert.match(bridge, /MadRetroComplexAppearance\?\.applyHostAppearance/);
  assert.match(bridge, /event\.source !== window\.parent/);
  assert.match(bridge, /home-ready/);
  assert.match(bridge, /home-error/);
});

test('Retro Complex refinement adds analog no-scroll Quick Access, working monitor power, room scene and removes disk stars/numeric shortcuts', () => {
  const html = read('src/home-retro-complex.html');
  const quickAccessCss = read('src/home-quick-access-theme.css');
  assert.match(html, /id="monitorPowerBtn"[^>]*aria-pressed="true"/);
  assert.match(html, /class="monitor-off"|classList\.toggle\('monitor-off'/);
  assert.match(html, /id="monitorLed"/);
  assert.match(html, /class="room-window"/);
  assert.match(html, /class="desk-hardware"/);
  assert.match(html, /class="sys dev"[\s\S]*id="gRam"[\s\S]*id="gCpu"/);
  assert.match(html, /class="gauge figcaption|gauge figcaption b/);
  assert.doesNotMatch(html, /<button class="star"/);
  assert.doesNotMatch(html, /if \(\/\^\[1-6\]\$\//, 'number-key app launching is removed');
  assert.match(html, /animation-timing-function:linear!important;animation-iteration-count:infinite!important/);
  assert.match(quickAccessCss, /retro-complex[^\n]*max-height:none!important;overflow:visible!important/);
  assert.match(quickAccessCss, /mqa-theme-list\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});


test('Retro Complex follows the moonlit CRT-room reference without removing working app controls', () => {
  const html = read('src/home-retro-complex.html');
  assert.doesNotMatch(html, /class="modern-wall-light"|class="wall-sconce"/, 'the rejected wall-mounted light is fully removed');
  assert.match(html, /class="bird bird-one"[\s\S]*class="bird bird-two"/, 'two animated birds enliven the window view');
  assert.match(html, /class="curtain-tie curtain-tie-left"[\s\S]*class="curtain-tie curtain-tie-right"/, 'open curtains have matching tie-backs');
  assert.match(html, /class="desk-furniture"[\s\S]*class="desktop-top"[\s\S]*class="desk-front"/, 'desktop surface and drawers exist');
  assert.match(html, /class="desk" aria-label="Wall-mounted disk box"/);
  assert.match(html, /<span>DISK BOX<\/span>/);
  assert.match(html, /class="desk-hardware"[\s\S]*id="drive"[\s\S]*class="sys dev"/, 'functional drive and live system gauges stay in the scene');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.room-window[\s\S]*width: min\(59vw, 820px\)/, 'night window is positioned for the reference composition');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.main \.nm[\s\S]*color: var\(--h\)/, 'terminal title follows the selected app color');
  assert.match(html, /const K_DISK_POSITIONS = 'mad-retro-complex-disk-positions'/, 'disk positions use independent persistent storage');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.desk \.apps \{[\s\S]*display: block;/, 'disk safe area is a free-placement surface rather than a grid');
  assert.match(html, /position: absolute;[\s\S]*width: 28%;[\s\S]*aspect-ratio: 1 \/ 1;/, 'floppies have independent square positions within the safe area');
  assert.match(html, /function isOverDiskSafeArea\([\s\S]*grid\.getBoundingClientRect\(\)/, 'drops outside the green safe area can be rejected');
  assert.match(html, /grid\.classList\.toggle\('free-drop-target',[\s\S]*return; \/\/ Disk overlaps are intentional: don't reorder or swap/i, 'free placement bypasses the old grid reorder handler');
  assert.match(html, /diskPositions\[k\.t\.dataset\.id\] = \{ \.\.\.diskPositionFromDrop[\s\S]*z: \+\+diskStack/, 'dropped disks retain their position and stacking order');
  assert.match(html, /if \(toDiskSafe\) \{[\s\S]*diskPositionFromDrop[\s\S]*persistDiskPositions\(\)/, 'only in-bounds drops commit the new position');
  assert.match(html, /if \(toMain\) \{[\s\S]*setMain\(k\.t\.dataset\.id\)/, 'the existing floppy reader drop behavior remains intact');
  assert.match(html, /id="themeQuickAccessMenu"/);
  assert.match(html, /id="monitorPowerBtn"/);
});


test('Retro Complex polish grounds the desk, removes the monitor stand, constrains lamp light and tints app visuals', () => {
  const html = read('src/home-retro-complex.html');
  assert.match(html, /Retro Complex polish pass:[\s\S]*\.desktop-top \{[\s\S]*left: 2%;[\s\S]*top: 60\.5%;[\s\S]*0 20px 28px rgb\(0 0 0 \/ \.58\)/, 'table extends left and casts a clear shadow underneath');
  assert.match(html, /Retro Complex polish pass:[\s\S]*\.desk-front \{[\s\S]*left: 2%;[\s\S]*top: 91\.1%;/, 'drawer fascia aligns with the tabletop');
  assert.match(html, /Retro Complex polish pass:[\s\S]*\.mon \{[\s\S]*width: 44%;/, 'CRT is slightly wider than before');
  assert.doesNotMatch(html, /<div class="stand"/, 'monitor stand markup is removed');
  assert.match(html, /Retro Complex polish pass:[\s\S]*\.wall-sconce \{ height: 59%; \}[\s\S]*\.sconce-light \{[\s\S]*clip-path: polygon\(43% 0, 57% 0, 98% 100%, 2% 100%\);[\s\S]*filter: none;/, 'lamp cone reaches the desk but its light remains inside a crisp boundary');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.main \{[\s\S]*border: 2px solid color-mix\(in srgb, var\(--h\)/, 'the CRT card border follows the selected app accent');
  assert.match(html, /Retro Complex polish pass:[\s\S]*\.main \.nm \{[\s\S]*color: var\(--h\)/, 'the terminal title inherits the selected app accent');
  assert.match(html, /Retro Complex polish pass:[\s\S]*\.main \.nn \.nd \{[\s\S]*stroke: var\(--h\)/, 'the animated network icon uses the app accent');
  assert.match(html, /'<i><\/i>'\.repeat\(42\)/, 'Video Hub uses two identical 21-frame strips for seamless scrolling');
  assert.match(html, /@keyframes retroFilmScroll \{ to \{ translate: -1302px 0; \} \}/, 'film strip loops by exactly one repeated section');
  assert.match(html, /@keyframes retroAppSwap[\s\S]*cubic-bezier\(\.2,\.8,\.2,1\)/, 'main-app transitions use a smooth eased effect instead of a red glitch flash');
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important;/, 'motion-sensitive users can disable the new animations');
});


test('Retro Complex Quick Access opens its menu instead of being intercepted by the legacy Day/Night bridge', () => {
  const bridge = read('src/home-style-settings-bridge.js');
  const quickAccess = read('src/home-quick-access-theme.js');
  const html = read('src/home-retro-complex.html');
  assert.match(bridge, /#themeBtn:not\(\[data-theme-quick-trigger\]\)/, 'legacy Day/Night bridge excludes the native Quick Access trigger');
  assert.match(quickAccess, /trigger\.addEventListener\('click',[\s\S]*?if \(menu\.hidden\) openMenu\(\); else closeMenu\(\)/, 'trigger toggles the Quick Access menu');
  assert.match(quickAccess, /if \(action === 'toggle-theme'\) send\('toggle-theme'\)/, 'Day/Night remains an action inside the menu');
  assert.match(html, /Retro Complex visual gap correction:[\s\S]*?\.main \.vis \{[\s\S]*?flex: 1 1 auto;[\s\S]*?max-height: none;/, 'large app animation expands to fill the free middle area');
  assert.match(html, /viewBox="0 0 320 160"/, 'AI Hub animation fills a taller visual area without leaving a gap');
  const chrome = read('src/home-quick-access-theme.css');
  assert.match(chrome, /Retro Complex monitor controls:[\s\S]*?justify-content: flex-start !important;[\s\S]*?margin-right: auto !important;/, 'physical controls stay clustered at the right');
});



test('Retro Complex monitor uses the MAD Station badge and balanced reference proportions', () => {
  const html = read('src/home-retro-complex.html');
  assert.match(html, /<span class="brand" aria-label="Mad Station"><b>MAD<\/b> Station<\/span>/, 'the MAD Station badge appears on the lower bezel');
  assert.match(html, /Reference-match refinement:[\s\S]*?\.mon \{[\s\S]*?left: 19\.3%;[\s\S]*?width: 41\.5%;/, 'the main monitor matches the reference scale');
  assert.match(html, /Reference-match refinement:[\s\S]*?\.case \{[\s\S]*?height: min\(70\.5vh, 44vw, 620px\)/, 'the monitor shell is slightly taller');
  assert.match(html, /Reference-match refinement:[\s\S]*?\.chin \{[\s\S]*?flex: 0 0 72px/, 'the lower bezel has more height');
  assert.match(html, /Reference-match refinement:[\s\S]*?\.drive \{[\s\S]*?width: 12\.3%;[\s\S]*?height: 14%;/, 'the floppy drive stays close to its former proportions');
  assert.match(html, /Reference-match refinement:[\s\S]*?\.sys \{[\s\S]*?width: 14%;[\s\S]*?height: 22\.5%;/, 'the CPU/RAM monitor is shorter and slightly narrower');
  assert.doesNotMatch(html, /<div class="stand"/, 'the CRT stand remains omitted');
});

test('Retro Complex tabletop keeps perspective while desktop hardware uses clean 2D faces', () => {
  const html = read('src/home-retro-complex.html');
  assert.match(html, /class="drive" id="drive"[\s\S]*?class="slot"/, 'the drive keeps its functional disk slot');
  assert.doesNotMatch(html, /class="drive-top-face"|class="drive-side-face"|class="sys-top-face"|class="sys-side-face"/, 'the desktop devices no longer contain visible 3D extrusion faces');
  assert.match(html, /Retro Complex physical hardware perspective pass[\s\S]*?\.desktop-top\s*\{[\s\S]*?clip-path:\s*polygon\(6\.8% 0, 93\.2% 0, 100% 100%, 0 100%\)/, 'the tabletop keeps its tapered perspective');
  assert.match(html, /Retro Complex flat-face hardware \+ paired desk legs[\s\S]*?\.desk-hardware\s*\{[\s\S]*?perspective:\s*none !important;[\s\S]*?transform-style:\s*flat;/, 'the drive and system monitor share a flat front-facing stage');
  assert.match(html, /Retro Complex flat-face hardware \+ paired desk legs[\s\S]*?\.drive\s*\{[\s\S]*?transform:\s*none !important;[\s\S]*?border-radius:\s*6px;/, 'the floppy drive has a compact front-facing casing');
  assert.match(html, /Retro Complex flat-face hardware \+ paired desk legs[\s\S]*?\.sys\s*\{[\s\S]*?height:\s*clamp\(142px, 22vh, 178px\);[\s\S]*?transform:\s*none !important;/, 'the live CPU/RAM monitor is shortened and no longer rotated');
  assert.match(html, /Retro Complex flat-face hardware \+ paired desk legs[\s\S]*?\.desk-front::before,[\s\S]*?\.desk-front::after\s*\{[\s\S]*?content:\s*none !important;[\s\S]*?display:\s*none !important;/, 'the outer vertical bars are removed from the drawer fascia');
});

test('Retro Complex main-app terminal fills the open visual area instead of leaving a blank middle gap', () => {
  const html = read('src/home-retro-complex.html');
  assert.match(html, /Retro Complex app panel:[\s\S]*\.main \{[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*width: 86%;/, 'main app panel is narrower and arranges its contents vertically');
  assert.match(html, /Retro Complex app panel:[\s\S]*\.main \.mb \{[\s\S]*grid-template-columns: 58px minmax\(0, 1fr\);[\s\S]*gap: 16px;[\s\S]*padding: 20px 16px 0;/, 'icon and title have deliberate breathing room');
  assert.match(html, /Retro Complex app panel:[\s\S]*\.main \.vis \{[\s\S]*flex: 1 1 auto;[\s\S]*margin: 12px 16px 16px;/, 'the app animation grows below the controls instead of being pinned to the bottom');
  assert.match(html, /@media \(max-width: 700px\)[\s\S]*\.main \{[\s\S]*width: 88%;[\s\S]*\.main \.mb \{[\s\S]*grid-template-columns: 40px minmax\(0, 1fr\);/, 'small displays keep a compact icon/title row');
  assert.match(html, /Retro Complex visual gap correction:[\s\S]*\.main \.vis \{[\s\S]*flex: 1 1 auto;[\s\S]*max-height: none;/, 'animation area expands into the empty panel space');
  assert.match(html, /'image-hub': \(\) => '<div class=\"im\">' \+ Array\.from\(\{ length: 128 \}/, 'Image Hub has enough animated cells to fill the taller area');
  assert.match(html, /\.main \.im \{[\s\S]*grid-template-rows: repeat\(8, minmax\(0, 1fr\)\)/, 'Image Hub grid fills both the width and height of the expanded visual');
});

test('Retro Complex rebuilds the desk and compact hardware to match the wooden desktop reference', () => {
  const html = read('src/home-retro-complex.html');
  assert.match(html, /class="desk-furniture"[\s\S]*?class="desktop-top"[\s\S]*?class="desk-front"[\s\S]*?class="desk-leg desk-leg-left"[\s\S]*?class="desk-leg desk-leg-right"/, 'desk keeps its top, fascia, drawers, and both legs');
  assert.match(html, /Retro Complex rebuilt desk \+ compact desktop hardware[\s\S]*?\.desktop-top \{[\s\S]*?top: 55\.5%;[\s\S]*?height: 31\.5%;[\s\S]*?clip-path: polygon\(6% 0, 94% 0, 100% 100%, 0 100%\)/, 'desk top is shallower and visibly tapers toward the back');
  assert.match(html, /Retro Complex rebuilt desk \+ compact desktop hardware[\s\S]*?\.desk-front \{[\s\S]*?top: 85\.7%;[\s\S]*?height: 9\.2%;/, 'drawer fascia sits directly under the tapered desktop');
  assert.match(html, /\.drawer-one \{ left: 0; width: 40\.5%; \}/, 'left drawer uses reference-like proportions');
  assert.match(html, /\.drawer-two \{ right: 5\.7%; width: 47%; \}/, 'right drawer uses reference-like proportions');
  assert.match(html, /class="drive" id="drive"[\s\S]*?class="slot"/, 'floppy drive keeps a clean front face and functional slot');
  assert.match(html, /\.drive \{[\s\S]*?top: 72\.5%;[\s\S]*?width: 12\.7%;[\s\S]*?height: clamp\(58px, 12\.8vh, 100px\)/, 'floppy drive is compact and positioned on the tabletop');
  assert.match(html, /class="sys dev"[\s\S]*?id="gRam"[\s\S]*?id="gCpu"/, 'flat system monitor preserves live gauge hooks');
  assert.match(html, /\.sys \{[\s\S]*?top: 61\.5%;[\s\S]*?width: 15\.2%;[\s\S]*?height: clamp\(108px, 23\.5vh, 190px\)/, 'CPU/RAM monitor has a squat reference-like footprint');
});

test('Retro Complex aligns drawers equally and nudges the tabletop hardware right', () => {
  const html = read('src/home-retro-complex.html');
  assert.match(html, /Fine alignment pass: equal drawers and a slightly right-shifted desktop setup[\s\S]*?\.desk-front \.drawer \{\s*width: 43\.5%;\s*\}[\s\S]*?\.drawer-one \{\s*left: 3\.3%;\s*right: auto;\s*\}[\s\S]*?\.drawer-two \{\s*left: auto;\s*right: 3\.3%;\s*\}/, 'drawers have the same width and the left drawer is inset from the far edge');
  assert.match(html, /Fine alignment pass: equal drawers and a slightly right-shifted desktop setup[\s\S]*?\.mon \{\s*left: 20\.3%;\s*\}[\s\S]*?\.drive \{\s*left: 64\.3%;\s*\}[\s\S]*?\.sys \{\s*left: 6%;\s*\}/, 'CRT, floppy drive, and CPU/RAM monitor shift right together');
  assert.match(html, /@media \(max-width: 700px\)[\s\S]*?\.mon \{\s*left: 18\.5%;\s*\}[\s\S]*?\.drive \{\s*left: 65\.5%;\s*\}[\s\S]*?\.sys \{\s*left: 5%;\s*\}/, 'mobile layout keeps the same subtle rightward adjustment');
});


test('Retro Complex shortens the system monitor, removes the faux screw, and moves the lamp left to enlarge the disk box', () => {
  const html = read('src/home-retro-complex.html');
  assert.match(html, /Final layout touch-up:[\s\S]*?\.sys\s*\{[\s\S]*?height:\s*clamp\(110px, 19vh, 146px\);[\s\S]*?max-height:\s*146px;/, 'live CPU/RAM monitor is shorter on desktop');
  assert.match(html, /\.chin \.chip\[aria-label="Current time"\]\s*\{\s*display:\s*none !important;/, 'screw-like time dial is hidden while its DOM clock remains available');
  assert.match(html, /\.wall-sconce\s*\{\s*left:\s*1\.5%;\s*top:\s*20\.5%;\s*width:\s*clamp\(58px, 7vw, 90px\);/, 'wall lamp sits fully on the wall to the left of the window');
  assert.match(html, /\.desk\s*\{\s*left:\s*74\.2%;\s*top:\s*8\.4%;\s*width:\s*24\.5%;\s*height:\s*53\.5%;\s*\}/, 'disk box becomes wider and taller on desktop');
  assert.match(html, /@media \(max-width: 700px\)[\s\S]*?\.room-window\s*\{[\s\S]*?left:\s*44%;[\s\S]*?width:\s*52vw;[\s\S]*?\}\s*body\[data-home-style="retro-complex"\] \.mon/, 'mobile window leaves a clear wall strip beside the sconce');
  assert.match(html, /@media \(max-width: 700px\)[\s\S]*?\.wall-sconce\s*\{\s*left:\s*1\.2%;\s*top:\s*22%;\s*width:\s*clamp\(44px, 12vw, 68px\);/, 'mobile sconce remains on the left wall without overlapping the window');
});


test('Retro Complex enlarges only the wall disk box, keeps floppy tiles square, and aligns tabletop device depth', () => {
  const html = read('src/home-retro-complex.html');
  assert.match(html, /Disk box sizing \+ shared tabletop depth correction:[\s\S]*?\.desk \{[\s\S]*?left: 72\.3%;[\s\S]*?width: 26\.8%;[\s\S]*?height: 57\.5%;/, 'the enclosure grows without scaling the floppy faces independently');
  assert.match(html, /Disk box sizing \+ shared tabletop depth correction:[\s\S]*?\.desk \.apps \{[\s\S]*?grid-template-rows: repeat\(3, auto\);[\s\S]*?align-content: space-evenly;/, 'the larger enclosure spaces rows while allowing each tile to retain natural dimensions');
  assert.match(html, /Disk box sizing \+ shared tabletop depth correction:[\s\S]*?\.desk \.tile \{[\s\S]*?height: auto;[\s\S]*?aspect-ratio: 1 \/ 1;[\s\S]*?align-self: start;/, 'all floppy tiles stay square instead of stretching vertically');
  assert.match(html, /\.drive \{[\s\S]*?top: 70\.5%;[\s\S]*?height: clamp\(64px, 12vh, 96px\);[\s\S]*?\.sys \{[\s\S]*?top: calc\(70\.5% \+ clamp\(64px, 12vh, 96px\) - clamp\(110px, 19vh, 146px\)\);[\s\S]*?height: clamp\(110px, 19vh, 146px\);/, 'drive and system monitor share a common bottom/ground line on desktop');
  assert.match(html, /@media \(max-width: 700px\)[\s\S]*?\.desk \{[\s\S]*?left: 70\.2%;[\s\S]*?width: 28\.5%;[\s\S]*?height: 50\.5%;[\s\S]*?\.desk \.tile \{[\s\S]*?aspect-ratio: 1 \/ 1;[\s\S]*?\.sys \{[\s\S]*?top: calc\(70% \+ clamp\(54px, 10vh, 74px\) - clamp\(92px, 17vh, 120px\)\);/, 'mobile devices remain aligned and disk tiles remain square');
});


test('Retro Complex disk box keeps all floppy tiles inside the dotted inset and uses readable header text', () => {
  const html = read('src/home-retro-complex.html');
  assert.match(html, /Disk box inner fit \+ readable title pass[\s\S]*?\.desk \.dh \{[\s\S]*?flex: 0 0 29px;[\s\S]*?font-size: clamp\(9px, \.95vw, 12px\);/, 'the disk box title and instruction text are larger and easier to read');
  assert.match(html, /Disk box inner fit \+ readable title pass[\s\S]*?\.desk \.apps \{[\s\S]*?grid-template-rows: repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?overflow: hidden;/, 'the three rows share the available green inset height instead of overflowing');
  assert.match(html, /Disk box inner fit \+ readable title pass[\s\S]*?\.desk \.tile \{[\s\S]*?width: 76%;[\s\S]*?aspect-ratio: 1 \/ 1;[\s\S]*?justify-self: center;[\s\S]*?align-self: center;/, 'smaller square floppy tiles are centered inside each grid cell');
  assert.match(html, /@media \(max-width: 700px\)[\s\S]*?\.desk \.tile \{[\s\S]*?width: 74%;[\s\S]*?aspect-ratio: 1 \/ 1;/, 'the reduced tile size and square proportions are preserved on small screens');
});


test('Retro Complex makes the rotating terminal tips larger and places them above the app window', () => {
  const html = read('src/home-retro-complex.html');
  assert.match(html, /class="cmd" aria-hidden="true"><em>C:\\MAD&gt;<\/em><span id="pt"><\/span><i class="cur"><\/i><\/div>/, 'the existing animated command tips and prompt remain wired');
  assert.match(html, /Retro Complex terminal tips: readable status bar above the app window[\s\S]*?\.screen \.cmd\s*\{[\s\S]*?order:\s*-1;[\s\S]*?min-height:\s*28px;[\s\S]*?font:\s*clamp\(10px, \.82vw, 12px\)\/1\.2/, 'the tip strip moves above the main app card and gets a larger, more readable treatment');
  assert.match(html, /Retro Complex terminal tips: readable status bar above the app window[\s\S]*?\.screen \.cmd #pt\s*\{[\s\S]*?text-overflow:\s*ellipsis;/, 'long tips stay within the strip instead of overflowing the CRT');
  assert.match(html, /@media \(max-width: 700px\)[\s\S]*?\.screen \.cmd\s*\{[\s\S]*?min-height:\s*26px;[\s\S]*?\.main\s*\{[\s\S]*?flex-basis:\s*74%;/, 'small screens retain a readable strip without displacing the app window');
});


test('Retro Complex tabletop texture is calmer and main-app metadata is readable', () => {
  const html = read('src/home-retro-complex.html');
  const polishAt = html.lastIndexOf('Retro Complex readability polish: calmer walnut surface + legible main-app metadata');
  assert.ok(polishAt >= 0, 'final readability polish is present');
  const polish = html.slice(polishAt);
  assert.match(polish, /\.desktop-top\s*\{[\s\S]*background:[\s\S]*radial-gradient\(ellipse at 24% 42%[\s\S]*linear-gradient\(180deg, #886342/, 'tabletop uses smooth, subtle wood tones without the old repeating grain/grid');
  assert.match(polish, /\.main \.tg\s*\{[\s\S]*flex-wrap: wrap;[\s\S]*font: 400 clamp\(8px, \.8vw, 10px\)\/1\.35 "Courier New", monospace;/, 'main-app metadata is larger and can wrap instead of being clipped');
  assert.match(html.slice(html.lastIndexOf('Retro Complex final finish: inset status strip, readable executable titlebars, antique wall sconce')), /\.main \.tb\s*\{[\s\S]*font: 700 clamp\(10px, \.9vw, 12px\)\/1 \"Courier New\", monospace;/, 'main app executable titlebars use a readable 10–12px font');
  assert.match(polish, /\.main \.open\s*\{[\s\S]*font-size: clamp\(9px, \.78vw, 10px\)/, 'launch button text is larger for legibility');
});


test('Retro Complex gives only the physical Quick Access and power buttons tactile analog CRT styling', () => {
  const html = read('src/home-retro-complex.html');
  const analogAt = html.lastIndexOf('Retro Complex analog CRT controls: tactile caps seated into the monitor chin.');
  assert.ok(analogAt >= 0, 'the analog physical-control styling pass is present');
  const analog = html.slice(analogAt);
  assert.match(analog, /\.chin \.madstation-theme-quick-trigger\s*\{[\s\S]*?border-radius:\s*50% !important;[\s\S]*?radial-gradient\([\s\S]*?box-shadow:[\s\S]*?0 0 0 2px #5f5845/, 'Quick Access is a round, tactile button seated in a bezel-like ring');
  assert.match(analog, /\.chin \.pwr\s*\{[\s\S]*?border-radius:\s*50%;[\s\S]*?radial-gradient\([\s\S]*?box-shadow:[\s\S]*?0 0 0 2px #5d5642/, 'power is a matched analog hardware button');
  assert.match(analog, /\.chin \.pwr::before\s*\{[\s\S]*?inset:\s*3px;[\s\S]*?border-radius:\s*50%;/, 'both caps have inner inset detail that makes them feel molded into the casing');
  assert.match(analog, /\.monitor-off \.chin \.pwr\s*\{[\s\S]*?color:\s*#655f4d;[\s\S]*?box-shadow:/, 'the power control has a distinct depressed/off appearance');
  assert.match(analog, /The Quick Access menu is untouched|physical buttons only; the Quick Access menu is untouched/, 'the visual change is scoped to the physical controls, not the menu');
});


test('Retro Complex keeps its native phosphor palette while accent remains in main Appearance settings', () => {
  const html = read('src/home-retro-complex.html');
  const retro = read('src/home-retro.html');
  const quickAccess = read('src/home-quick-access-theme.js');
  const quickAccessCss = read('src/home-quick-access-theme.css');
  const host = read('src/home-page-switcher.js');
  const appearance = read('src/appearance.js');
  const rendererHtml = read('src/renderer.html');
  assert.doesNotMatch(quickAccess, /data-qa-accent|applyPageAccent|set-accent|accentColors|state\.accent/, 'Quick Access no longer exposes or applies accent choices');
  assert.doesNotMatch(quickAccessCss, /mqa-accent/, 'Quick Access stylesheet no longer contains accent LED selectors');
  assert.doesNotMatch(html, /Retro Complex accent response|--retro-quick-accent/, 'the CRT glass and tips strip keep their native green palette');
  assert.match(html, /native phosphor palette; global Accent belongs to workspace apps/);
  assert.match(html, /const nativePh = getComputedStyle\(body\)\.getPropertyValue\('--ph'\)\.trim\(\) \|\| '#33ff7a'/);
  assert.match(html, /s\.preserveNativeAccent \? nativePh/);
  assert.match(retro, /s\.preserveNativeAccent \? nativePh/);
  assert.match(host, /preserveNativeAccent: true/);
  assert.match(host, /delete settings\.accent/);
  assert.match(appearance, /if \(!preserveNativeAccent\)/);
  assert.match(rendererHtml, /id="accentOptions"[\s\S]*data-accent-choice="blue"/, 'the global accent option remains available from main Settings');
});

test('Retro Complex daylight tabletop uses calm wood texture and all tabletop hardware shifts right together', () => {
  const html = read('src/home-retro-complex.html');
  const finalPassAt = html.lastIndexOf('Final Retro Complex daylight wood + tabletop alignment pass');
  assert.ok(finalPassAt >= 0, 'the final day-mode texture/alignment pass is present');
  const finalPass = html.slice(finalPassAt, html.indexOf('</style>', finalPassAt));
  assert.match(finalPass, /body\[data-home-style="retro-complex"\]\[data-theme="light"\] \.desktop-top\s*\{[\s\S]*radial-gradient\(ellipse at 24% 42%[\s\S]*linear-gradient\(180deg, #d0ab79/, 'day mode keeps the warm tabletop color but uses the same broad, non-repeating tonal texture as night mode');
  assert.doesNotMatch(finalPass.match(/body\[data-home-style="retro-complex"\]\[data-theme="light"\] \.desktop-top\s*\{([\s\S]*?)\n\}/)?.[1] || '', /repeating-linear-gradient/, 'daytime tabletop has no repeating stripe/grid texture');
  assert.match(finalPass, /\.mon\s*\{\s*left:\s*21\.8%;\s*\}/, 'main CRT shifts slightly right');
  assert.match(finalPass, /\.drive\s*\{\s*left:\s*65\.8%;\s*\}/, 'floppy reader shifts right with the CRT');
  assert.match(finalPass, /\.sys\s*\{\s*left:\s*7\.5%;\s*\}/, 'CPU/RAM monitor shifts right with the group');
  assert.match(finalPass, /@media \(max-width: 700px\)[\s\S]*?\.mon\s*\{\s*left:\s*19\.5%;\s*\}[\s\S]*?\.drive\s*\{\s*left:\s*66\.5%;\s*\}[\s\S]*?\.sys\s*\{\s*left:\s*6%;\s*\}/, 'small-screen positioning stays coordinated');
});


test('Retro Complex keeps the screen polish and uses a realistic detailed window without the rejected wall light', () => {
  const html = read('src/home-retro-complex.html');
  const finalPassAt = html.lastIndexOf('Retro Complex final finish: inset status strip, readable executable titlebars, antique wall sconce');
  assert.ok(finalPassAt >= 0, 'the original screen/titlebar polish remains present');
  const finalPass = html.slice(finalPassAt, html.indexOf('</style>', finalPassAt));
  assert.match(finalPass, /\.screen \.cmd\s*\{[\s\S]*?align-self:\s*center;[\s\S]*?width:\s*96%;[\s\S]*?margin:\s*5px 0 2px;[\s\S]*?min-height:\s*24px;/, 'tips bar remains inset beneath the curved top edge');
  assert.match(finalPass, /\.main \.tb\s*\{[\s\S]*?height:\s*24px;[\s\S]*?font:\s*700 clamp\(10px, \.9vw, 12px\)\/1 "Courier New", monospace;/, 'main executable titlebars remain large and readable');
  assert.match(html, /★ MAIN\.\$\{a\.id\.replace\(\/-\/g, "\."\)\.toUpperCase\(\)\}\.EXE/, 'app headers keep their executable names');
  assert.match(html, /class="window-headrail"[\s\S]*class="window-sill"[\s\S]*class="window-lock window-lock-left"/, 'window has a projecting headrail, deep sill and sash hardware');
  assert.match(html, /class="curtain-rod"[\s\S]*class="curtain-rings"[\s\S]*class="curtain-tie curtain-tie-left"[\s\S]*class="curtain-tie curtain-tie-right"/, 'open curtains include a rod, rings and paired tie-backs');
  assert.match(html, /body\[data-home-style="retro-complex"\] \.room-window::before,[\s\S]*repeating-linear-gradient\(90deg,transparent 0 7%/, 'curtain panels use layered fold highlights');
  assert.match(html, /class="skyline skyline-far"[\s\S]*class="skyline skyline-near"[\s\S]*class="tree-line"[\s\S]*class="river-glint"/, 'outdoor view includes layered buildings, trees and moving water glints');
  assert.match(html, /data-theme="light"\] \.room-window \.window-view[\s\S]*data-theme="dark"\] \.room-window \.window-view/, 'day and night have different exterior palettes');
  assert.match(html, /@keyframes bird-flight[\s\S]*@keyframes bird-wingbeat/, 'birds fly across the view with subtle wing movement');
  assert.doesNotMatch(html, /class="modern-wall-light"|class="wall-sconce"/, 'no wall-mounted lamp element remains');
});

test('Retro Complex rebuilt window uses one sun-or-moon element and a smaller upper-left frame', () => {
  const html = read('src/home-retro-complex.html');
  const windowStart = html.indexOf('<div class="room-window"');
  const mainStart = html.indexOf('<main class="home"', windowStart);
  assert.ok(windowStart >= 0 && mainStart > windowStart, 'rebuilt window markup is present before the room');
  const windowMarkup = html.slice(windowStart, mainStart);
  assert.equal((windowMarkup.match(/class="celestial"/g) || []).length, 1, 'the window has one dedicated celestial object');
  assert.doesNotMatch(windowMarkup, /class="(?:sun|moon)(?:\s|")/, 'legacy duplicate celestial elements are gone');
  assert.equal((windowMarkup.match(/class="bird bird-/g) || []).length, 2, 'daytime view keeps two birds');

  const rebuildAt = html.lastIndexOf('Retro Complex — full window rebuild');
  assert.ok(rebuildAt >= 0, 'the new self-contained window style block is present');
  const rebuild = html.slice(rebuildAt, html.indexOf('</style>', rebuildAt));
  assert.match(rebuild, /left:\s*31%;[\s\S]*top:\s*3\.6%;[\s\S]*width:\s*min\(46vw, 680px\)/, 'the frame is smaller and moved toward the upper-left');
  const daySky = rebuild.match(/body\[data-home-style="retro-complex"\]\[data-theme="light"\] \.room-window \.window-view\s*\{([^}]*)\}/);
  const nightSky = rebuild.match(/body\[data-home-style="retro-complex"\]\[data-theme="dark"\] \.room-window \.window-view\s*\{([^}]*)\}/);
  assert.ok(daySky && nightSky, 'day and night each have a dedicated sky rule');
  assert.doesNotMatch(daySky[1], /radial-gradient/i, 'day sky does not paint an extra sun disc');
  assert.doesNotMatch(nightSky[1], /radial-gradient/i, 'night sky does not paint an extra moon disc');
  const nightFar = rebuild.match(/body\[data-home-style="retro-complex"\]\[data-theme="dark"\] \.room-window \.skyline-far\s*\{([^}]*)\}/);
  const nightNear = rebuild.match(/body\[data-home-style="retro-complex"\]\[data-theme="dark"\] \.room-window \.skyline-near\s*\{([^}]*)\}/);
  assert.ok(nightFar && nightNear, 'night skyline layers have dedicated cleanup rules');
  assert.doesNotMatch(`${nightFar[1]} ${nightNear[1]}`, /repeating-linear-gradient/i, 'night city no longer paints repetitive floating blue bars');
  assert.match(nightFar[1], /bottom:\s*17%;[\s\S]*height:\s*25%/, 'distant night buildings sit lower on the horizon');
  assert.match(rebuild, /clip-path:polygon\(0 100%,0 80%,7% 80%,7% 70%,11% 70%,11% 84%,17% 84%,17% 74%,22% 74%,22% 83%,28% 83%/, 'the far-left skyline peaks are lowered so they do not look like stray sticks');
});
