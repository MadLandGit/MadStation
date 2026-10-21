# Documentation repair changelog — 21 October 2026

This update synchronizes the documentation set with the checked-in Mad Station 1.6.3 source archive. It changes documentation and adds a standalone documentation verifier; it does not intentionally change runtime product behavior.

## New navigation and design-kit assets

- `docs/design/HOMEPAGE_THEME_CATALOG.md` — source IDs, entry documents, per-theme kits, test pointers, and add/change-theme checklist.
- `docs/design/homepage-theme-gallery.html` — visual index for the ten selectable homepage designs, plus the separate diagnostic legacy kit.
- `docs/design/theme-kits/*.html` — individual live-source kits for `v2`, `retro`, `retro-complex`, `parallax`, `parallax-big`, `galaxy`, `parallax-jungle`, `claymorphism`, `glass`, `isometric-world`, and `legacy`.
- `scripts/check-theme-documentation.mjs` and `npm run docs:themes:check` — dependency-free consistency/link check for the runtime theme registry, catalogue/gallery coverage, per-theme kit files, and local Markdown/HTML links under `docs` and the root guidance files.

## Updated documentation

- Root `README.md`: explicit current list of the ten selectable styles, separate legacy status, design-kit links, correct token ownership, and historical release-note qualification.
- `docs/README.md`: regenerated index around files/folders actually present in this archive.
- `docs/design/DESIGN_SYSTEM.md`: corrected the selectable theme inventory and Simple/Home v5 implementation pointers; linked the shared kit, gallery, and catalogue; clarified token ownership.
- `docs/design-kit-preview.html`: described as the shared token/component laboratory (rather than a complete replica of Settings), added gallery/guide navigation, added System mode, missing built-in background choices, border spacing and motion/status toggles, and documented the custom-background-flow limitation.
- `docs/architecture/CORE_SYSTEM.md`, `AGENTS.md`, and `CLAUDE.md`: added paths to the new theme catalogue/gallery/kits and checker.
- Architecture, security, and development documentation: checked navigation targets and clarified that dated verification records are historical unless rerun on the current checkout.

## Validation performed

- `npm run docs:themes:check` — passed: 10 selectable source themes, 10 selectable kits plus the legacy diagnostic kit, catalogue/gallery coverage, 95 local Markdown link targets, and all local HTML targets across `docs`.
- `node --test tests/design-system.test.js tests/home-page-switcher.test.js tests/home-isometric-world-integration.test.js tests/appearance-controls.test.js` — passed **71/71 tests**.

## Explicitly not claimed

The uploaded source archive omits `node_modules` and generated build output. This update did not run the canonical package `npm test` lifecycle, a full app build, a fresh dependency audit, live Electron interaction checks, or Windows installer acceptance. The documentation verifier is not a substitute for those project release gates. Older test-count paragraphs are retained only where useful as dated history and are qualified as historical evidence.
