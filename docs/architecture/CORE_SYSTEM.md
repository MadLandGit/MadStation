# Mad Station Core System

This is the **single entry point for agents and contributors** working in this repository. Start here, classify the task, and follow the one route below that owns the change. Do not begin by reading every instruction file or searching the whole project; use the routed files and recipes only as needed.

> **Delegation prompt:** “Read `docs/architecture/CORE_SYSTEM.md` first. Route the task to the correct system, follow its recipe, preserve existing behavior hooks, add/update tests, run `npm test`, and report the files changed.”

## What “Core System” means

There are two related pieces:

- **`docs/architecture/CORE_SYSTEM.md` (this file)** is the agent-facing source map: it tells an agent which subsystem owns a requested change and which instructions/files are authoritative.
- **`src/home-core-system.js`** is the home-screen runtime coordinator. It registers the independent home systems, observes layout changes, owns hover/focus highlighting, and draws their shared animated signal lines. It does not hold individual app or widget definitions. Right-column widgets register their rendered shells as right-side links to AI Hub; while Arrange is dragging a widget, `src/home-layout-editor.js` exposes its live preview as the connection element so the signal line follows the preview. Saved free-position layouts keep an expanded widget-only canvas after Done and on startup; Home stage, AI Hub, and companion geometry remain fixed.

The separate systems stay separate. Add an item to its list/registry file; do not edit an engine or the Core runtime just to add an item.

The main-screen season selector is owned by `src/home-page-switcher.js` and is shown only while Parallax Jungle is the active homepage. Its selected season is sent through `src/home-style-settings-bridge.js` only to `src/home-parallax-jungle.html`, which retains its existing page-local season implementation. All other homepage styles use the shared Appearance accent and Day/Night settings only; do not add season-specific selectors or styling to Default, Simple, retro, parallax, Galaxy, Claymorphism, or Glass.

The alternate homepages are isolated from the legacy launcher. **Simple** keeps its stable selector value `v2` and iframe at `src/home-v2.html`, but its active UI is the Home v5 equal-app grid in `src/home-v5.css`, `src/home-v5.js`, and `src/home-v5-bridge.js`; it loads shared `src/design-tokens.css`, `src/appearance.js`, and the common Parallax background layer. The older `src/home-v2.css`, `src/home-modern.css`, `src/home-v2.js`, and `src/home-v2-registry.js` remain for historical/feature references but are not loaded by Simple. **3D Parallax** lives in `src/home-v3.html`, `src/home-v3.css`, `src/home-v3.js`, and `src/home-v3-bridge.js`; **3D Parallax Big App** uses the supplied main-app stage design in `src/home-v4.html`, `src/home-v4.css`, `src/home-v4.js`, and `src/home-v4-bridge.js`; **Simple Retro** uses the isolated CRT/pixel-art design in `src/home-retro.html` and `src/home-retro-bridge.js`; **Retro Complex** uses the physical CRT monitor, desktop, floppy-disk tiles and analog system monitor in `src/home-retro-complex.html` and `src/home-retro-complex-bridge.js`; **Galaxy** uses the supplied animated solar-system design in `src/home-galaxy.html`, with an inline host bridge for workspace launches, Settings, Appearance, theme toggling, and live memory telemetry. **Parallax Jungle** is the isolated layered jungle homepage in `src/home-parallax-jungle.html`; **Claymorphism** uses the supplied soft clay, spring-motion, and processor-panel design in `src/home-claymorphism.html`; **Glass** uses `src/home-glass.html`; and **Isometric World** uses `src/home-isometric-world.html` and `src/home-isometric-world-bridge.js`. These isolated pages use the narrow host-bridge pattern. `src/home-page-switcher.js` owns the global Appearance → Main page selector and the narrow, source-validated postMessage bridges for workspace launch, global Settings, Appearance, theme toggle, and RAM/CPU telemetry. In Settings, the modular all-apps grid is labelled **Simple**. The original homepage (`legacy`, displayed as **Default**) is a developer-only diagnostic choice available only in Developer Options, not in Appearance or Quick Access. The other built-in choices are **Simple Retro**, **Retro Complex**, **3D Parallax**, **3D Parallax Big App**, **Galaxy**, **Parallax Jungle**, **Claymorphism**, **Glass**, and **Isometric World**. Stable stored values are `legacy`, `v2`, `retro`, `retro-complex`, `parallax`, `parallax-big`, `galaxy`, `parallax-jungle`, `claymorphism`, `glass`, and `isometric-world` under `mad-station-homepage-version-v1`. Each isolated homepage keeps its own local layout keys; do not share or migrate one page's order/visibility into another. Keep the existing `#launcherScreen` intact. Regression coverage: `tests/home-page-switcher.test.js`, `tests/home-removed-theme-regression.test.js`, `tests/home-v3-integration.test.js`, `tests/home-v4-integration.test.js`, `tests/home-retro-integration.test.js`, `tests/home-retro-complex-integration.test.js`, and `tests/design-system.test.js`.

## Homepage themes and design kits

For homepage layout work, use [`docs/design/HOMEPAGE_THEME_CATALOG.md`](../design/HOMEPAGE_THEME_CATALOG.md) for the canonical documented inventory and test pointers, [`docs/design/homepage-theme-gallery.html`](../design/homepage-theme-gallery.html) to review the ten designs visually, and the matching `docs/design/theme-kits/<id>.html` page for that design’s source preview and checklist. The shared token/component kit is `docs/design-kit-preview.html`; common rules live in `docs/design/DESIGN_SYSTEM.md`. Run `npm run docs:themes:check` after editing a theme registry, gallery, kit, or related documentation.

## One-glance routing map

| Request / goal | System to use | Definition / registry | Runtime / implementation | Recipe or validation |
|---|---|---|---|---|
| Add or change a full Hub companion card on the left | **Hub companions** | `src/home-app-list.js` | Registry/layout/routing in `src/home-apps.js`; React view in `src/renderer-react/home-companions.tsx` | “Add a companion” below; `tests/home-systems.test.js` |
| Add or change an icon-only shortcut above AI Hub | **Mini apps** | `src/home-mini-list.js` | Registry, preferences, and layout in `src/home-mini-apps.js`; React tile view in `src/renderer-react/home-mini-apps.tsx` | “Add a mini app” below; `tests/home-systems.test.js` |
| Add or change a live panel in the right column | **Widgets** | `src/home-widget-list.js` | React shell in `src/renderer-react/home-widgets.tsx`; registry and panel-mount controller in `src/home-widgets.js` | “Add a widget” below; `tests/home-widgets-controller.test.js` and `tests/home-systems.test.js` |
| Let the user enable/hide, reorder, add, or resize home modules | **Home menu customization** | Built-in definitions stay in the three registry files; user changes persist in local storage | `src/renderer-react/home-customizer.tsx` for the dialog and `src/home-customizer.js` for persistence/actions, plus the public APIs in `src/home-apps.js`, `src/home-mini-apps.js`, and `src/home-widgets.js` | “Customize the Home menu” below; `tests/home-systems.test.js` |
| Shared animated lines, home layout coordination, cross-system highlighting | **Home Core runtime** | No item definitions belong here | `src/home-core-system.js`, then the adapters in each engine | “Core runtime rules” below |
| RAM data, cleanup actions, process details, existing mount hooks | **RAM monitor pipeline** | First launcher widget: `src/home-widget-list.js` | `src/renderer.js`, `src/preload.ts`, `src/main.js` (the preload builds to `build/preload.js`) | Preserve IDs and `data-memory-*` hooks; run RAM tests in `tests/release.test.js` |
| Colors, theme, corners, shadows, surfaces, spacing, accessibility or responsive design | **Design system** | N/A | `src/design-tokens.css`, `src/design-kit.css`, `src/home.css` or the owning screen stylesheet | Use the matching recipe in `docs/design/DESIGN_SYSTEM.md`; never duplicate token mappings |
| Create/change a workspace screen, route, lifecycle, session, or persistence | **Workspace app** | Launcher companion definitions remain in `src/home-app-list.js` if it belongs as a full companion | `src/renderer.html`, `src/renderer.js`, `src/main.js`, `src/preload.ts` as routed by the existing app (built to `build/preload.js`) | Follow “Recipe: build a new app / page” in `docs/design/DESIGN_SYSTEM.md` and test security/lifecycle boundaries |
| Change Clipboard, Notes or To-do workspace UI/forms/settings | **Utility workspace UI** | N/A | `src/renderer-react/utility-workspaces.tsx`, `src/renderer-react/notes-workspace.tsx`; shared rows in `src/renderer-react/utility-lists.tsx`; controller remains in `src/renderer.js` | Keep persistence/mutations host-owned, Clipboard explicit-save only, staged settings and dialog focus behavior; test `tests/renderer-react-utility-workspaces.test.js`, `tests/renderer-react-notes-workspace.test.js`, `tests/renderer-react-lists.test.js` |
| Change Video Hub provider filter tile presentation | **Video Hub provider-filter UI** | Provider/account counts and selected filter remain in `src/renderer.js` | `src/renderer-react/video-hub-provider-tiles.tsx` | Preserve React root ownership and `data-video-hub-provider-filter`, selected ARIA state and guarded favicon fallback/cache behavior; test `tests/renderer-react-video-hub-provider-tiles.test.js` |
| Change Video Hub account tile, inline rename, or account-list presentation | **Video Hub account-list UI** | Account/session actions, filters, pins, recents and menu logic remain in `src/renderer.js` | `src/renderer-react/video-hub-account-list.tsx` | Preserve `data-video-hub-account` / `data-video-hub-rename`, `videoHubAccountAction`, context menu, guarded icon fallback/cache, and grid/list CSS; test `tests/renderer-react-video-hub-account-list.test.js` |
| Change AI Hub provider/account/shortcut management lists | **AI Hub settings management lists** | Model mapping and existing actions remain in `src/renderer.js`; create/edit modal forms remain legacy-owned | `src/renderer-react/ai-hub-management-lists.tsx` | Preserve provider/account order controls, drag/drop, selected account, rename/delete, shortcut recording, `data-*` hooks, and icon cache fallback; test `tests/renderer-react-ai-hub-management-lists.test.js` |
| Change AI Hub sidebar provider tiles, pinned/group filters, recent-account chips, or account-list heading | **AI Hub account navigation** | State, account/provider filtering, ordering persistence and account selection remain in `src/renderer.js` | `src/renderer-react/ai-hub-account-navigation.tsx` | Preserve provider selection/context menu/reorder behavior, validated `window.MadStationAiHubAccountNavigation` actions, icon fallback binding, and startup-only imperative fallback; test `tests/renderer-react-ai-hub-account-navigation.test.js` |
| Change Video Hub feature settings modal, workspace preferences, or browser/site permission switches | **Video Hub settings dialog** | React owns rendering and staged form draft; `src/renderer.js` validates and persists preferences, updates host security policy, applies network mode, and signals the native overlay | `src/renderer-react/video-hub-settings.tsx` | Preserve the settings action allowlist and host-controlled persistence/security boundary; test `tests/renderer-react-video-hub-settings.test.js` and `tests/design-system.test.js` |
| Change Video Hub workspace header/tabs, native browser toolbar, active account/site display, or account/site counters | **Video Hub workspace chrome** | Native `WebContentsView` positioning, browser sessions/navigation, settings/notifications overlays, and external-open authorization stay in the trusted renderer host | `src/renderer-react/video-hub-workspace-chrome.tsx` | Preserve `#videoHubBrowserSlot` as a sibling outside the React toolbar mount; actions are restricted by `window.MadStationVideoHubChrome`; test `tests/renderer-react-video-hub-workspace-chrome.test.js` and full suite |
| Change Video Hub provider-management rows | **Video Hub provider manager UI** | Provider state, delete confirmation, provider/account cleanup and IPC remain in `src/renderer.js` | `src/renderer-react/video-hub-providers.tsx` | Preserve `.video-hub-provider-row`, `data-video-hub-provider-id`, built-in provider non-removability, `deleteVideoHubProvider`, and guarded icon fallback/cache; test `tests/renderer-react-video-hub-providers.test.js` |
| Change Image Hub provider filters/account list presentation | **Image Hub sidebar UI** | Provider/account data remain in persisted Image Hub state | `src/renderer-react/image-hub-sidebar.tsx` presentation; `src/renderer.js` model, filter logic, icon candidates, and session switching | Preserve React root ownership, favicon fallback/cache behavior and `data-image-*` hooks; test `tests/renderer-react-image-hub.test.js` |
| Change Image Hub browser lifecycle, navigation, or view bounds | **Image Hub native browser** | Main process owns the hardened `WebContentsView`, isolated `persist:image-hub-<id>` session, navigation events and IPC authorization; renderer owns only the browser slot rectangle and UI state | `src/main/image-hub-browser-runtime.ts`, `src/main/session-lifecycle-runtime.ts`, `src/main/browser-view-layout-runtime.ts`, `src/renderer.js` | Keep `webviewTag` disabled; use the native-view bridge, require HTTPS, keep the view visible only in the unlocked Image Hub studio, and preserve retryable failure state; test `tests/main-image-hub-browser-runtime.test.js`, `tests/main-browser-view-layout-runtime.test.js` and Image Hub toolbar/state tests |
| Persisted provider/account config repair and migrations | **Config schema** | N/A | `src/main/config-schema.ts`; injected by `src/main.js` | Preserve the existing JSON shape/version, valid IDs, provider matching, shortcuts and order; add fixtures in `tests/main-config-schema.test.js` |
| Config save/load, backup recovery and corrupt-file quarantine | **Config persistence** | N/A | `src/main/config-store.ts`; path/default/migration factories are injected by `src/main.js` | Preserve atomic writes and recovery order; test with temp dirs in `tests/main-config-store.test.js` |
| Account browser permissions, host allowlists, HTTP/popup/navigation rules, OAuth handoff, external URL opening | **Account session security** | Trusted session partitions and `handle()` authorization remain in `src/main.js` | `src/main/account-session-security.ts` | Inject live settings and shell/session/download callbacks; preserve top-frame vs iframe behavior, per-account session inheritance and explicit media permissions; test `tests/main-account-session-security.test.js` |
| Main window creation, renderer-ready synchronization, minimize lock and close cleanup | **Main window runtime** | `BaseWindow` instance and view references stay injected from `src/main.js` | `src/main/main-window-runtime.ts` | Preserve creation order, startup-account selection, locked-start behavior and child-window cleanup; test `tests/main-main-window-runtime.test.js` |
| App ready/activate/window-all-closed sequencing | **App bootstrap runtime** | Configuration, default-session restrictions, diagnostics and native side effects injected from `src/main.js` | `src/main/app-bootstrap-runtime.ts` | Preserve ready-ordering and fatal startup forwarding; test `tests/main-app-bootstrap-runtime.test.js` |
| App-lock command transitions and channels | **App-lock controller / IPC** | Secure sender/lock checks remain in existing `handle()` wrapper composed in `src/main.js` | `src/main/lock-controller.ts`, `src/main/lock-ipc.ts` | Keep channel names and result shapes; preserve session-wipe-before-reset ordering; test `tests/main-lock-controller.test.js`, `tests/main-lock-ipc.test.js` |
| Idle timeout and system-lock watcher runtime | **App lifecycle runtime** | Electron power monitor, timer ownership and lock action injected from `src/main.js` | `src/main/app-lifecycle-runtime.ts` | Keep injected side effects, idle timeout behavior, lock/suspend wiring and cleanup; test `tests/main-app-lifecycle-runtime.test.js` |
| App-lock password hashes and retry throttling | **Lock security** | N/A | `src/main/lock-security.ts`; lock/unlock lifecycle remains in `src/main.js` | Keep fixed scrypt factors, constant-time compare and escalating delays; test `tests/main-lock-security.test.js` |
| App/security defaults and normalization | **Settings model** | N/A | `src/main/settings.ts` | Keep it free of Electron/filesystem dependencies; test invalid persisted values and default isolation in `tests/main-settings.test.js` |
| Settings commands and reset behavior | **Settings controller** | IPC channel registration and trusted-sender checks remain in `src/main.js` | `src/main/settings-controller.ts` | Preserve the dedicated security/download namespaces, apply-live calls, and config broadcast order; test `tests/main-settings-controller.test.js` |
| Download lifecycle and safe destinations | **Download manager** | N/A | `src/main/downloads.ts` | Renderer sends download IDs only; test Windows path/name restrictions, program file protections and source failover |
| Remote icon caching and main-input sanitization | **Native input/cache helpers** | N/A | `src/main/icon-cache.ts`, `src/main/input-validation.ts` | Preserve HTTPS-only fetches, MIME/size/cache bounds and channel-specific checks; see `tests/main-input-validation.test.js` and `tests/release.test.js` |
| Renderer IPC payload structure | **IPC boundary** | N/A | `src/shared/ipc-validation.ts`, `src/preload.ts`, `src/toolbar-preload.ts`, `src/main.js` | Keep named APIs only; payload shape checks do not replace sender, lock, ownership or business validation |
| Fix release or regression behavior | **Tests / feature owner** | The registry or owning feature file | Existing implementation and `tests/release.test.js` / `tests/design-system.test.js` | Add a focused regression test, then `npm test` |
| Dependency, packaging, or Windows installer change | **Build system** | `package.json` | `package.json`, `+ build installer.cmd`, `+ install and run.cmd` where relevant | Run applicable tests and inspect build configuration |

## Home-screen architecture

### Connector and live-layout contract

The Home Core SVG layer is the single source of truth for Home connectors. Every companion, mini app, and widget must register an independent card endpoint; never add a duplicate static line. When Arrange moves a card, refresh Home Core from its live bounding rectangle so the line remains attached. Live reorder previews use temporary CSS translate variables and an insertion marker only; final order is persisted through the existing Home Customizer API. Widget drop zones must remain within the launcher window bounds.

| System | Where it appears | What it owns | Registry file |
|---|---|---|---|
| Hub companions | Left cards | Full app cards with name, description, chips and “More apps” overflow | `src/home-app-list.js` |
| Mini apps | Icon-only tiles above the AI Hub circle | Small shortcuts; name appears as the tooltip and accessible label | `src/home-mini-list.js` |
| Widgets | Right-side stack | React-owned theme-aware shell; individual live panel contents mount through an explicit `.home-widget-content` callback boundary | `src/home-widget-list.js` |
| Home menu customizer | Customize button in the top bar | Per-user module visibility, order, custom launch shortcuts, and widget sizes | `src/home-customizer.js` (preferences persist under `mad-station-home-modules-v1`) |
| Home drag layout editor | Arrange button in the top bar | Mouse drag/drop reorders companions vertically and moves fixed-size widgets freely inside their own canvas; the current single mini app and AI Hub stay fixed | `src/home-layout-editor.js` + validated `MadHomeCustomizer.reorder()` in `src/home-customizer.js`; tests in `tests/home-layout-editor.test.js` |
| Home Core | Shared home stage | System registration, shared animated-line drawing, resize coordination, hover/focus highlighting | `src/home-core-system.js` |

All of these are loaded by `src/renderer.html`, before `src/renderer.js`. The three registries have independent engines and can be extended independently. Widget card chrome is rendered by `src/renderer-react/home-widgets.tsx`; widget definitions may only populate their own empty `panel` mount. Do not add React children to that panel while the legacy RAM monitor mutates its `data-memory-*` hooks. The Core runtime shares the existing `.home-link-path` visual treatment; preserve that class and the stable theme variables when changing line behavior.

## Recipe: customize the Home menu

For list-style personalization, keep presentation in `src/renderer-react/home-customizer.tsx` and route actions through `src/home-customizer.js`; do not fold personalized state into Core or mutate shipped registry definitions. The Home top-bar **Customize** control remains the detailed manager for visibility, order, shortcuts, and widget sizing. The separate **Arrange** control runs `src/home-layout-editor.js`: it outlines role-locked drop zones, temporarily exposes every enabled companion in a compact adaptive left rail, and uses Pointer Events rather than native HTML drag-and-drop (companions reorder vertically with a pointer-following drag preview, the current single mini app stays fixed, and widgets move freely within a larger right-side canvas while retaining their saved small/medium/large sizes). On desktop, Arrange keeps the existing Home stage grid, AI Hub size, and companion rail unchanged; only the widget canvas extends across the available right-side workspace to the window edge and gains the available height while individual widget dimensions remain fixed; narrow windows keep a scrollable, positioned widget canvas in the stacked layout. The current single mini-app tile has no draggable zone; future multi-tile positioning can add one without changing the current interaction. The companion heading sits on the top edge of its outlined lane. Drop bounds are remeasured at pointer release, and window-focus loss cancels transient drag state. AI Hub stays fixed. Reorder preview transforms remain until the React DOM order has committed; Done and Cancel use direct click handlers independent of the drag gesture. Only a complete unique ID order from one registry is accepted by `MadHomeCustomizer.reorder()`, then persisted under `mad-station-home-modules-v1`. Cancel/Escape restores the order snapshot taken on entry; Done keeps the order changes.

- Registry files remain the source of built-in module definitions. The customizer only calls the engines' `configure`, `register`, and `unregister` APIs.
- New shortcut destinations must be one of the built-in targets accepted by the customizer's allowlisted target menu and `openWorkspaceApp()` in `src/renderer.js`. Do not accept arbitrary URLs or executable code as destinations.
- Keep UI styles in `src/home.css` and use `src/design-tokens.css` aliases. The customizer overlay, rows, fields and buttons must continue to follow global Appearance settings and responsive breakpoints.
- When widgets are hidden and re-enabled, preserve monitor hooks and reinstall mounted monitors idempotently via the `mad:home-widgets-built` event. React dispatches it after shell and panel commit; keep `launcherRamMonitorMount` unchanged.
- Reset behavior should restore registry defaults and remove personal shortcuts without editing built-in registry files.

## Recipe: add a companion

Edit **only** `src/home-app-list.js` for a normal new companion. Copy this entry and customize it:

```js
add({
  id: 'my-companion',
  name: 'My Companion',
  description: 'One sentence shown on the full card.',
  chips: ['One', 'Two'],
  iconSvg: '<circle cx="12" cy="12" r="8"></circle>',
  launch: 'my-companion',
  order: 20,
});
```

Keep the `id` unique. `launch` must route to an existing target accepted by `openWorkspaceApp()` in `src/renderer.js`, unless the entry defines a custom `open(app)` function. The companion engine controls card sizing and the “More apps” overflow; do not add a top-dock flag. To add a different kind of item above the circle, use the mini-app recipe instead.

## Recipe: add a mini app

Edit **only** `src/home-mini-list.js`. Mini apps are icon-only; do not add a description or chips.

```js
add({
  id: 'my-mini-app',
  name: 'My Mini App',
  iconSvg: '<path d="M5 12h14"></path>',
  launch: 'my-mini-app',
  color: 'var(--h-m2)', // optional; omit to use the rotating palette
  order: 20,            // optional; lower numbers appear first
});
```

`launch` is passed to the existing launcher route through `MadHomeApps.launchTarget()`. Names become the tile tooltip and accessible label. Mini apps are positioned as a centered group above the core: a single tile aligns with the core's vertical centerline and multiple tiles spread symmetrically around it. Because `.home-module` uses the shared `home-in` animation with `transform` and `animation-fill-mode: both`, desktop horizontal centering must use the independent CSS `translate` property; a `transform: translateX(-50%)` is overridden by the animation's final `transform: none`. The responsive layout must clear `translate` when returning the tile to normal flex flow. The mini-app engine supplies the `anchor: 'top'` link and `src/home-core-system.js` draws its animated line from each rendered tile center to the circle. Preserve the `data-app-id` hook and do not reintroduce a `dock: 'top'` flag into the companion registry.

## Recipe: add a widget

Edit **only** `src/home-widget-list.js`. Every widget defines an `id`, visible `title`, `size` (`small`, `medium`, or `large`), `order`, and a `render(panel)` function:

```js
add({
  id: 'my-widget',
  title: 'My Widget',
  size: 'medium',
  order: 20,
  render(panel) {
    const message = document.createElement('p');
    message.className = 'home-widget-message';
    message.textContent = 'Live widget content';
    panel.appendChild(message);
  },
});
```

The shared shell provides a themed surface, border, corner, shadow and overflow behavior. Widget-local CSS belongs in `src/home.css` and must use the existing design tokens. Do not insert style attributes or hard-coded visual values. The widget stack preserves already-mounted widget DOM when another widget is registered, so stable IDs and event hooks survive registry updates.

### RAM monitor rule — preserve the pipeline

The `ram-monitor` widget deliberately wraps the existing `#launcherRamMonitorMount`; the renderer fills that mount with the established `homeTelemetryMarkup()` path. The `performance-mini` widget is a compact view of the same `data-memory-*` snapshot stream and intentionally does not poll independently. Do not rename or duplicate `launcherRamMonitorMount`, `data-memory-monitor`, `data-memory-scope`, any `data-memory-slot` / `data-memory-bar` / `data-memory-details` hooks, or the related monitor mounts on other workspaces. Cleanup, refresh, process metrics and IPC live outside the widget engine. Wrap the monitor; do not fork or rewrite it to create another monitor implementation.

## Core runtime rules

- Keep individual entries in their registry, not in `src/home-core-system.js`.
- Register independent home engines with `window.MadHomeCore.registerSystem(id, adapter)` and provide a `getLinks()` adapter only for items that should connect to AI Hub.
- The shared runtime owns signal-line SVG generation and hover/focus state. Reuse the existing `home-link-group`, `home-link-path`, `home-link-dot`, and `--mod` conventions so every system keeps the same animation and accent behavior.
- Keep new mini apps icon-only; keep companion cards descriptive; keep widgets inside the right-side widget stack.
- Do not change established IDs or `data-*` hooks while restyling or wrapping a feature.
- Do not put theme/palette mappings in this file or any engine. `src/design-tokens.css` remains authoritative for Appearance token mapping.

## Documentation and verification route

1. Read this file first and select the route above.
2. Edit the owning registry for additions; edit an engine only when changing behavior shared by every entry in that system.
3. If a change affects visual styling or responsive behavior, follow the relevant `docs/design/DESIGN_SYSTEM.md` recipe and inspect both Light and Dark plus one glass/neon and one sharp/square appearance combination. Also check a narrow window when the home layout changes.
4. Add regression coverage in `tests/home-systems.test.js`, `tests/design-system.test.js`, or `tests/release.test.js` depending on the route.
5. Run `npm test`. Report changed files, test results, and any visual checks that could not be performed.

`AGENTS.md` and `CLAUDE.md` intentionally route agents back to this file rather than repeating the system map. `docs/design/DESIGN_SYSTEM.md` remains the authoritative visual recipe book when a routed task requires design details; it is not a competing project entry point.


### AI Hub account navigation (v50)

The child subtrees `#providerTiles`, `#orgBar`, `#recentAccounts`, and `#listTitle` are React-owned by `src/renderer-react/ai-hub-account-navigation.tsx` after `window.MadStationAiHubAccountNavigation.attachReactRenderer()` attaches. Keep account/provider data, filtering/search semantics, provider-menu state, account selection, grouping/favorites, and persisted ordering in `src/renderer.js`. The host bridge must validate provider/account/group IDs and reorder payloads; React must not access Electron, persistence, or account/session services directly. Preserve context-menu opening, drag reorder, Ctrl+Shift+Arrow reorder, group reset when the selected group disappears, icon fallback/cache behavior, and the startup-only imperative fallback. Run `node --test tests/renderer-react-ai-hub-account-navigation.test.js tests/renderer-react-ai-hub-management-lists.test.js tests/release.test.js`; full typecheck/build and Electron verification remain required.


### Video Hub quick-start site cards

The quick-start provider-card subtree is React-owned by `src/renderer-react/video-hub-sites.tsx` after `window.MadStationVideoHubSites` attaches. The existing `src/renderer.js` remains authoritative for provider/account data, icon fallback candidates, and quick-add/session actions. Preserve `.video-hub-site-card` styling and `data-video-hub-quick-add` delegated events when changing this view.

### Video Hub provider-filter tiles

The `#videoHubProviderTiles` child subtree is React-owned by `src/renderer-react/video-hub-provider-tiles.tsx` after `window.MadStationVideoHubProviderTiles` attaches. Keep count construction, persisted selection, account filtering, and guarded icon candidates in `src/renderer.js`. Preserve the delegated `data-video-hub-provider-filter` event hook and update selected ARIA/class state by publishing a fresh React model, not direct DOM mutation.


### Video Hub account tiles

`#videoHubAccountList` is React-owned by `src/renderer-react/video-hub-account-list.tsx` after `window.MadStationVideoHubAccounts` attaches. Keep account/session operations, pin/recent persistence, provider/query/pinned filters, confirmation prompts and menu operations in `src/renderer.js`. React may request actions through the bridge but must not directly call Electron or edit persisted state. Preserve account IDs, active/pinned labels, rename Enter/Escape behavior, grid/list layout classes, and `bindIconFallbacks`. Run `node --test tests/renderer-react-video-hub-account-list.test.js tests/renderer-react-video-hub.test.js tests/renderer-react-video-hub-provider-tiles.test.js` and then the full suite.


### Video Hub provider-management rows

`#videoHubProviderList` is React-owned by `src/renderer-react/video-hub-providers.tsx` after `window.MadStationVideoHubProviders` attaches. Keep provider data and `deleteVideoHubProvider()` in `src/renderer.js`; React should call the bridge and never call Electron directly. Preserve `data-video-hub-provider-id`, `.video-hub-provider-row`, built-in provider removal restrictions, and the existing icon candidate/cache fallback pipeline. The imperative `innerHTML` path remains only as a startup fallback before React attaches. Run `node --test tests/renderer-react-video-hub-providers.test.js tests/renderer-react-video-hub.test.js tests/renderer-react-video-hub-provider-tiles.test.js` and verify custom-provider removal on Windows.

### Video Hub recent account chips
- React-owned markup: `src/renderer-react/video-hub-recent.tsx`
- Model/recency/filter state and delegated activation: `src/renderer.js` (`getVideoHubRecentItems`, `renderVideoHubRecent`)
- Entry wiring: `vite.config.ts` and `src/renderer.html`
- Tests: `tests/renderer-react-video-hub-recent.test.js`


| Appearance theme, accent, and background UI | **Appearance controls** | Settings persistence and native background operations remain in `src/renderer.js` / `src/main.js` | `src/renderer-react/appearance-controls.tsx` | Preserve four roots (`#homepageStyles`, `#themeOptions`, `#accentOptions`, `#backgroundLibrary`), per-homepage preview/selection behavior, HTTPS/file-only image previews, and custom event contracts; test `tests/appearance-controls.test.js`, `tests/design-system.test.js`, and `tests/home-page-switcher.test.js` |
| Downloads list presentation | **Downloads React list** | `src/renderer.js` owns view-model construction and actions; `src/main/downloads-controller.ts` owns download commands | `src/renderer-react/downloads-list.tsx` | Preserve `data-dl-action` / `data-dl-id`, managed-download cancellation restrictions, progress width updates without inline style attributes, and empty state; test `tests/renderer-react-downloads-list.test.js` |
| Downloads IPC command behavior | **Downloads controller** | Trusted-sender/lock checks and IPC registration remain in `src/main.js` | `src/main/downloads-controller.ts` | Preserve ID-only actions, path normalization, cancel/pause/resume/remove semantics, folder cancellation, and config broadcasts; test `tests/main-downloads-controller.test.js` |


### AI Hub settings management list boundary

`#providerList`, `#settingsAccountList`, and `#shortcutList` are React-owned by `src/renderer-react/ai-hub-management-lists.tsx` after `window.MadStationAiHubManagementLists` attaches. Keep persistence and app/session side effects in the existing host callbacks; don't render these subtrees in the old renderer. The old account/provider list `innerHTML` functions have been removed, as has the legacy `#accounts` account-card fallback. Create/edit modal forms still need a separate migration. Run `node --test tests/renderer-react-ai-hub-management-lists.test.js tests/renderer-react-lists.test.js tests/release.test.js`.


## v34 main-process boundary

For account session permissions/navigation use `src/main/account-session-security.ts`; for BaseWindow lifecycle use `src/main/main-window-runtime.ts`; for app-ready/activate/window-close event ordering use `src/main/app-bootstrap-runtime.ts`. Keep all three dependency-injected and preserve native session ownership and secure IPC wrapper checks. Use the matching tests listed in the routing table above.


## v38 security ownership

For IPC trust/lock/workspace authorization read the security helpers in `src/main.js` and `src/main/account-session-security.ts`; for outbound request DNS/IP pinning read `src/main/network-security.ts`; for auth-domain/public-suffix checks read `src/main/input-validation.ts` and `src/main/public-suffix-list.ts`. `docs/security/SECURITY_AUDIT.md` is the current decision/evidence matrix. Do not claim security/release closure until the embedded PSL data is refreshed, production build/typecheck pass, and live Electron/Windows scenarios are verified.
