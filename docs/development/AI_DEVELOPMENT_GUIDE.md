# AI development guide

## Before changing code

1. Read `docs/architecture/CORE_SYSTEM.md`. It is the subsystem routing map and points to implementation files, registries, recipes, and tests.
2. Read `docs/design/DESIGN_SYSTEM.md` and use `src/design-tokens.css` / `src/design-kit.css` for styling. Preserve the existing design language, DOM IDs, `data-*` hooks, keyboard behavior, and persisted settings unless the task explicitly changes them.
3. Check existing tests before refactoring. Add a narrow regression test for each behavior change and run `npm test`.
4. Make a small patch in the subsystem that owns the behavior. Do not create a parallel account/session store or a second renderer for a feature already owned by the main workspace.

## Typical visual change

- **Toolbar:** edit `src/toolbar-react/main.tsx` for state and markup, then `src/toolbar-react/toolbar.css` for isolated layout details. Reuse established toolbar CSS classes and design tokens; don't add a new CSS framework. Keep buttons labelled, keyboard-focusable, and disabled when the operation is unavailable. Do not directly mutate the toolbar DOM outside React.
- **Main workspace / existing pages:** use the exact path routed from `docs/architecture/CORE_SYSTEM.md`. Most of the active workspace still uses `src/renderer.js`, `src/renderer.html`, existing page modules, and shared stylesheets. The Home customizer is React-owned via `src/renderer-react/home-customizer.tsx`; `src/home-customizer.js` continues to own preference persistence and registry operations through its TypeScript-defined view bridge. The Home companion cards are React-owned via `src/renderer-react/home-companions.tsx`; their registry/routing and responsive layout model remain in `src/home-apps.js`. Icon-only mini-app tiles in `#homeMiniApps` are React-owned via `src/renderer-react/home-mini-apps.tsx`; registry, preference, launch and offset coordination remain in `src/home-mini-apps.js`. Keep the `.home-module` hooks because Home Core uses them to draw signal lines. The AI Hub `#accounts` subtree is another exception: `src/renderer-react/account-list.tsx` owns it after `madstation:accounts-react-ready`. The Clipboard, Notes and To-do list roots (`#clipboardItems`, `#notesList`, `#todoList`) are also React-owned after `madstation:utility-lists-react-ready`, via `src/renderer-react/utility-lists.tsx`. Their controller still owns persistence and mutations. Keep AI Hub provider filters/recent-account logic and note/task business state in the legacy owner until separately migrated. Image Hub provider tiles and account rows (`#imageHubProviderTiles`, `#imageHubAccountList`) are now React-owned via `src/renderer-react/image-hub-sidebar.tsx`; their search/filter/session controller remains in `src/renderer.js`. Preserve the image fallback/cache bridge and `data-image-provider-filter`/`data-image-account` hooks. Never let both renderers mutate the same subtree.
- **Tokens and shared styles:** edit `src/design-tokens.css` for appearance token mappings; edit `src/design-kit.css` for token-based shared components. Update `docs/design/DESIGN_SYSTEM.md` and token/design tests when the contract changes. Avoid hard-coded colors, radii, shadows, and duplicate button styles.

## Change the Home mini-app tile UI

1. Edit `src/renderer-react/home-mini-apps.tsx` for tile markup and visual interaction. Keep `.home-mini-app-tile`, `data-app-id`, `--mini-offset`, accessible labels, and the allowlisted SVG sanitizer.
2. Keep the registry, customizer-facing API, launch target and ordered model in `src/home-mini-apps.js`; do not reimplement launch/native routing in React.
3. Preserve the post-commit `mad:home-mini-apps-built` event and Home Core refresh, because the signal-line system discovers rendered tile elements.
4. Add/update focused assertions in `tests/home-systems.test.js`.

## Change the Home companion card UI

1. Edit `src/renderer-react/home-companions.tsx`; the registry and layout capacity controller remain in `src/home-apps.js`, and built-in app definitions remain in `src/home-app-list.js`.
2. Preserve `.home-module`, `.home-module--more`, `.home-more-panel`, `.home-more-item`, `data-app-id`, and the `--mod`/`--i`/`--enter` custom properties because styling and Home Core signal lines depend on them.
3. Keep `onLaunch` delegated through `window.MadHomeApps`; do not move workspace or native routing into React. Render custom chip data as text and keep SVG markup allowlisted.
4. Add/update `tests/home-systems.test.js`, then run `npm test`, `npm run typecheck`, and `npm run build`.

## Change Clipboard / Notes / To-do list presentation

1. Edit `src/renderer-react/utility-lists.tsx` and reuse the established `.clipboard-item`, `.note-card`, `.todo-row`, `.note-actions`, and `.utility-empty` classes.
2. Keep state changes behind the callbacks passed by `src/renderer.js`; persistence and confirmation logic currently live there.
3. Preserve stable IDs as React keys and render user content through React text nodes (never `dangerouslySetInnerHTML`).
4. Add a focused test in `tests/renderer-react-lists.test.js` and ensure neither legacy list renderer writes to its root after the handoff.

## Add a React component to the toolbar

1. Put the component in `src/toolbar-react/` next to its owner, unless it has a separate cohesive responsibility.
2. Give inputs and callback types explicit types; avoid `any` and one-component-per-file fragmentation.
3. Use stable React keys, handle empty/loading/error states, and put subscriptions/timers/listeners in effects with cleanup.
4. Keep external data rendering safe. Use text rendering rather than HTML string interpolation. Restrict image sources as the existing toolbar does.
5. Add or update a focused test, then run `npm run typecheck`, `npm test`, and `npm run build` on a machine with dependencies installed.

## Add a safe Electron capability

1. Put testable domain logic in the corresponding `src/main/*.ts` module when it can be isolated from Electron lifecycle state (settings, config schema, downloads, icon cache and input normalization are existing examples). Keep native lifecycle wiring/IPC authorization in `src/main.js` until its handler family is deliberately migrated. Use a named IPC channel and validate every argument at the handler, including ownership/authorization and URL/path rules. The generic `isSafeIpcPayload` guard is only an additional structural guard.
2. Confirm the handler's `{ toolbar: true }` option only when the limited toolbar genuinely needs that operation. Keep the sender/main-frame and lock-state checks intact.
3. Add a method to `src/shared/api-contract.ts`; expose it in `src/preload.ts` as a narrow wrapper (or in `src/toolbar-preload.ts` only for toolbar-safe actions). Do not expose arbitrary channel names or Electron objects.
4. Add/adjust the `Window` typing in `src/types/electron-api.d.ts` if a new global surface is introduced. Prefer the existing `window.aiHub` name unless there is a real compatibility reason to change it.
5. Add unit/regression tests for accepted and rejected inputs, sender authorization, lock behavior, and any state transition. Keep errors generic when payloads may contain sensitive values.
6. Re-run the test suite and full build. Verify navigation/popup permissions and packaging paths when native browser behavior changes. For persisted app configuration, keep the schema migration (`src/main/config-schema.ts`) separate from atomic file operations (`src/main/config-store.ts`) and test both independently. App-lock hashing/throttling lives in `src/main/lock-security.ts`; do not modify scrypt cost factors or throttle policy without a targeted security review and tests.

## Common commands

```bash
npm install
npm run dev          # Vite toolbar + Electron; build preloads first
npm run typecheck
npm test
npm run build        # type checks + Vite assets + preload bundles
npm run dist         # Windows NSIS package; run on Windows for release validation
```

Use Node.js 22.16.0 and npm 10.9.2, as pinned by `.node-version`, `.nvmrc`, and `package.json`. Run `npm run env:check` after `npm ci`. The main Electron process and primary-workspace UI are partially migrated into typed/React modules. Current ownership and remaining legacy regions are explicitly listed in `docs/architecture/ARCHITECTURE.md` and `docs/architecture/MODULE_AUDIT.md`; do not describe a remaining legacy path as migrated until its source and tests actually move.

## Change the Home customization dialog

1. Edit `src/renderer-react/home-customizer.tsx` for dialog layout, module rows, controls, and accessibility. Reuse `.home-customize-*` classes from `src/home.css`.
2. Keep storage schema `mad-station-home-modules-v1`, allowlisted workspace targets, `safeWrite`, custom shortcut registration, order changes, and defaults in `src/home-customizer.js`. React must call the controller bridge; do not write preferences directly from components.
3. Keep stable module IDs as React keys and retain escape/backdrop close behavior and focus restoration. Add assertions to `tests/home-systems.test.js` for the bridge and ownership boundary.


### Home live widget shell

Change shell structure, headings, size rendering, and per-widget error states in `src/renderer-react/home-widgets.tsx`. Change registration and ordering behavior in `src/home-widgets.js`; add built-in widget definitions in `src/home-widget-list.js`. `render(panel)` owns only the contents of the corresponding `.home-widget-content` panel. This remains an imperative boundary for the existing telemetry monitor, so do not give React children for this panel. Preserve the `launcherRamMonitorMount` ID and post-commit `mad:home-widgets-built` event so the telemetry adapter binds after React commits.


## Change the Image Hub sidebar

1. Edit `src/renderer-react/image-hub-sidebar.tsx` for provider tiles, account rows, empty states and accessible labels. Keep stable keys based on provider/account IDs and render provider/user strings as React text.
2. Keep search, provider/category filters, persisted list/grid settings, account session ownership, and safe favicon candidate construction in `src/renderer.js`. Do not move browser partition or URL selection behavior into React.
3. Preserve `#imageHubProviderTiles`, `#imageHubAccountList`, `data-image-provider-filter`, `data-image-account`, and the existing CSS classes. The controller's `bindIconFallbacks` bridge maintains remote favicon fallbacks/caching; do not replace it with direct icon HTML.
4. Run `node --test tests/renderer-react-image-hub.test.js` for focused wiring checks, then `npm test`, `npm run typecheck`, and `npm run build` in a dependency-installed workspace. Test provider filtering, search, active account switching, empty/no-match states, and list/grid mode on Windows.

## Change Video Hub provider filters

1. Edit `src/renderer-react/video-hub-provider-tiles.tsx` for the All/provider tile markup and selected/ARIA presentation. Preserve `tile`, `video-hub-provider-filter-tile`, `data-video-hub-provider-filter`, the count labels, and stable provider IDs as React keys.
2. Keep provider/account state, count calculation, selection persistence, filtering, URL candidate validation, and favicon cache behavior in `src/renderer.js`. The root `#videoHubProviderTiles` is React-owned once `window.MadStationVideoHubProviderTiles` attaches; after that, update it only by calling `renderVideoHubProviderTiles()` to publish the model, never by querying and toggling its child classes or writing `innerHTML`.
3. Keep icon candidates constrained by `isImageIcon`, include the built-in default data URL as final fallback, and invoke `bindIconFallbacks` through the bridge. Preserve `iconGeneration` in all three Video Hub view models so the keyed icons remount only on workspace re-entry. Run `node --test tests/renderer-react-video-hub-provider-tiles.test.js tests/renderer-react-video-hub.test.js`; then run `npm test`, `npm run typecheck`, and `npm run build` and test provider filtering on Windows.


## Change the Video Hub provider manager

1. Edit `src/renderer-react/video-hub-providers.tsx` for custom/built-in provider row presentation, labels, and the Remove button.
2. Keep provider state and removal semantics in `src/renderer.js` (`renderVideoHubProviders()` and `deleteVideoHubProvider()`). React can call the narrow `window.MadStationVideoHubProviders.removeProvider(id)` bridge but must not access Electron or storage itself.
3. Preserve `.video-hub-provider-row`, `data-video-hub-provider-id`, the built-in provider guard, and the existing `videoHubIconCandidates()` / `bindIconFallbacks()` pipeline. React owns `#videoHubProviderList` after the entry attaches; do not perform later `innerHTML` writes or restore older image nodes there.
4. Run `node --test tests/renderer-react-video-hub-providers.test.js tests/renderer-react-video-hub.test.js tests/renderer-react-video-hub-provider-tiles.test.js`, then `npm test`, `npm run typecheck`, and `npm run build`; on Windows verify custom-provider removal and any linked account cleanup.

## Change Video Hub account tiles

1. Edit `src/renderer-react/video-hub-account-list.tsx` for account tile and rename-row presentation. Keep stable ID + `iconGeneration` keys, `.video-hub-tile`, `.account-btn`, `data-video-hub-account`, `data-video-hub-rename`, and keyboard behaviors for Enter/Escape.
2. Keep model construction, query/provider/pinned filtering, saved pin/recent state, active-session calls, context menu, reset/delete confirmation, and rename IPC operations in `src/renderer.js`. The component must call only `window.MadStationVideoHubAccounts` bridge methods; never move browser/session operations into React.
3. Keep `iconCandidates` derived from `videoHubIconCandidates()` and gated by `isImageIcon()`, append `DEFAULT_ICON_DATA_URL`, and call `bindIconFallbacks` through the bridge. Keep the icon-session generation in keys so icons refresh on workspace re-entry rather than every filter change.
4. Once the bridge attaches, React exclusively owns `#videoHubAccountList` children. Do not let `renderVideoHub()`/`decorateVideoHub()` write list `innerHTML`, reorder/hide account DOM, or replace icon nodes on that path. Run the focused Video Hub account-list/site/provider tests and the full test suite, then validate rename, reset/delete confirmations, pins, search, provider filter, grid/list setting, and switching accounts on Windows.


## Change Appearance controls or download actions

For homepage-style previews/selection, global theme mode, accent, or background-card presentation, edit `src/renderer-react/appearance-controls.tsx`. Treat `#homepageStyles`, `#themeOptions`, `#accentOptions`, and `#backgroundLibrary` as React-owned roots. The homepage styles are switched by `src/home-page-switcher.js`; global dark/light/system mode, accent and background-setting actions are validated in `src/renderer.js`. Keep background URLs HTTPS/file-only and use the existing native picker for local files. Run `node --test tests/appearance-controls.test.js tests/design-system.test.js tests/home-page-switcher.test.js` and verify homepage previews and selection, modes, custom accent color, built-in/custom background selection, add/remove, and saved appearance on Windows.

For download command behavior, edit `src/main/downloads-controller.ts`. Keep actual IPC registration in `src/main.js` behind the `handle()` trusted-sender/lock/payload wrapper, and inject native dialog/settings operations. Renderer calls may only provide an action enum and download ID, never a path. Run `node --test tests/main-downloads-controller.test.js tests/main-settings-controller.test.js` and validate folder selection, open/show/cancel/pause/resume/remove, and clear-finished on Windows.
