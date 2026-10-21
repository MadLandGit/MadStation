# Homepage theme catalogue

**Purpose:** the authoritative documentation index for every user-selectable built-in homepage layout. The executable registry remains in `src/home-page-switcher.js` (`HOMEPAGE_STYLE_OPTIONS`); this catalogue records the design intent, source ownership, preview kit, and test coverage. If the runtime registry changes, update this page and the per-theme kit in the same change.

## Shared contract

All selectable themes are hosted as isolated homepage documents/frames. The host switcher owns selection and recovery; the renderer validates requested modes; each theme's bridge handles the documented host messages and appearance payload where implemented. Keep the bridge's channel consistent with `src/home-page-switcher.js`. Shared Appearance choices and tokens live in `src/appearance.js`, `src/design-tokens.css`, and `src/design-kit.css`; theme-specific decoration may differ, but actions, keyboard access, readable contrast, drag-and-drop where supported, and reduced-motion behavior must remain correct.

The shared component and token reference is [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md), the live shared kit is [`../design-kit-preview.html`](../design-kit-preview.html), and the visual index is [`homepage-theme-gallery.html`](homepage-theme-gallery.html). Each theme has a standalone kit in [`theme-kits/`](theme-kits/).

## Built-in selectable themes

| ID | Appearance label | Entry document | Kit | Primary integration tests |
|---|---|---|---|---|
| `v2` | Simple | [`home-v2.html`](../../src/home-v2.html) | [`Open kit`](theme-kits/v2.html) | [`home-page-switcher.test.js`](../../tests/home-page-switcher.test.js), [`home-no-theme-search-bars.test.js`](../../tests/home-no-theme-search-bars.test.js), [`home-theme-control-contrast.test.js`](../../tests/home-theme-control-contrast.test.js), [`home-theme-main-app-drag-drop.test.js`](../../tests/home-theme-main-app-drag-drop.test.js) |
| `retro` | Simple Retro | [`home-retro.html`](../../src/home-retro.html) | [`Open kit`](theme-kits/retro.html) | [`home-retro-integration.test.js`](../../tests/home-retro-integration.test.js), [`home-theme-control-contrast.test.js`](../../tests/home-theme-control-contrast.test.js), [`home-theme-main-app-drag-drop.test.js`](../../tests/home-theme-main-app-drag-drop.test.js) |
| `retro-complex` | Retro Complex | [`home-retro-complex.html`](../../src/home-retro-complex.html) | [`Open kit`](theme-kits/retro-complex.html) | [`home-retro-complex-integration.test.js`](../../tests/home-retro-complex-integration.test.js), [`home-retro-complex-interaction-states.test.js`](../../tests/home-retro-complex-interaction-states.test.js), [`home-theme-control-contrast.test.js`](../../tests/home-theme-control-contrast.test.js) |
| `parallax` | 3D Parallax | [`home-v3.html`](../../src/home-v3.html) | [`Open kit`](theme-kits/parallax.html) | [`home-v3-integration.test.js`](../../tests/home-v3-integration.test.js), [`home-theme-main-app-drag-drop.test.js`](../../tests/home-theme-main-app-drag-drop.test.js) |
| `parallax-big` | 3D Parallax Big App | [`home-v4.html`](../../src/home-v4.html) | [`Open kit`](theme-kits/parallax-big.html) | [`home-v4-integration.test.js`](../../tests/home-v4-integration.test.js), [`home-theme-main-app-drag-drop.test.js`](../../tests/home-theme-main-app-drag-drop.test.js) |
| `galaxy` | Galaxy | [`home-galaxy.html`](../../src/home-galaxy.html) | [`Open kit`](theme-kits/galaxy.html) | [`home-galaxy-orbit-speed.test.js`](../../tests/home-galaxy-orbit-speed.test.js), [`home-galaxy-compact-monitor.test.js`](../../tests/home-galaxy-compact-monitor.test.js), [`home-theme-main-app-drag-drop.test.js`](../../tests/home-theme-main-app-drag-drop.test.js) |
| `parallax-jungle` | Parallax Jungle | [`home-parallax-jungle.html`](../../src/home-parallax-jungle.html) | [`Open kit`](theme-kits/parallax-jungle.html) | [`home-parallax-jungle-app-card.test.js`](../../tests/home-parallax-jungle-app-card.test.js), [`home-parallax-jungle-border-fronds.test.js`](../../tests/home-parallax-jungle-border-fronds.test.js), [`home-seasonal-theme-variants.test.js`](../../tests/home-seasonal-theme-variants.test.js) |
| `claymorphism` | Claymorphism | [`home-claymorphism.html`](../../src/home-claymorphism.html) | [`Open kit`](theme-kits/claymorphism.html) | [`design-system.test.js`](../../tests/design-system.test.js), [`home-theme-control-contrast.test.js`](../../tests/home-theme-control-contrast.test.js), [`home-theme-main-app-drag-drop.test.js`](../../tests/home-theme-main-app-drag-drop.test.js) |
| `glass` | Glass | [`home-glass.html`](../../src/home-glass.html) | [`Open kit`](theme-kits/glass.html) | [`home-glass-main-icon-clarity.test.js`](../../tests/home-glass-main-icon-clarity.test.js), [`home-theme-control-contrast.test.js`](../../tests/home-theme-control-contrast.test.js), [`home-theme-main-app-drag-drop.test.js`](../../tests/home-theme-main-app-drag-drop.test.js) |
| `isometric-world` | Isometric World | [`home-isometric-world.html`](../../src/home-isometric-world.html) | [`Open kit`](theme-kits/isometric-world.html) | [`home-isometric-world-integration.test.js`](../../tests/home-isometric-world-integration.test.js), [`home-theme-control-contrast.test.js`](../../tests/home-theme-control-contrast.test.js), [`home-theme-main-app-drag-drop.test.js`](../../tests/home-theme-main-app-drag-drop.test.js) |

## Not a selectable theme: Default / legacy

`legacy` is an internal rescue/developer mode, not one of the ten user-facing choices. It has a separate [`Default / Legacy diagnostic kit`](theme-kits/legacy.html) because it is still a distinct rendering path worth documenting. The switcher deliberately omits it from `HOMEPAGE_STYLE_OPTIONS`; do not add it to the normal Appearance theme picker unless product behavior changes intentionally.

## Adding or changing a theme

1. Implement its homepage document and only the supporting CSS/JS/bridge it actually needs.
2. Add or update its frame and messaging channel in `src/home-page-switcher.js`; update `HOMEPAGE_STYLE_OPTIONS` only for user-selectable modes.
3. Add a scoped picker preview rule in `src/styles.css` and the selector metadata in the Appearance UI as appropriate.
4. Update the matching `docs/design/theme-kits/<id>.html`, this catalogue, and the gallery.
5. Add a focused integration test for host handshake/readiness, fallback, settings/contrast, and theme-specific interactions.
6. Run `npm run docs:themes:check`, focused theme tests, and the project-standard test/build gates available in the environment. Do not describe static HTML previews as full Electron acceptance.

## Coverage and limits

A kit is a design-review aid, not a second runtime implementation. The iframe loads the real homepage file when opened from the project checkout; some host-backed behaviors can only be fully exercised inside Mad Station/Electron. Test both Light and Dark where supported, compact viewports, keyboard focus, reduced motion, dragging/launch actions, and settings synchronization before release.
