# Module ownership audit — v62 current source disposition

The current detailed renderer sink classification is in `docs/architecture/ARCHITECTURE.md`; the main-process function-by-function review is in `docs/architecture/ARCHITECTURE.md`. These are static ownership artifacts, not runtime proof. The latest v62 inventory records 21 insertion sinks, 243 renderer listener registrations, 55 typed main-process modules, 50 React modules, and 148 named top-level functions in the 2,104-line `src/main.js`. All current HTML insertion sinks are classified; remaining runtime listener teardown, keyboard/focus, workspace handoff and Electron security paths require owner-side behavioral acceptance. The historical module audit follows.

## Migration update — v36 main-process domain ownership and security-audit boundary


## v62 main-process ownership result (16 October 2026)

`docs/architecture/ARCHITECTURE.md` is generated from the current `src/main.js` top-level function declarations and documents 148 functions with ownership areas and guardrails. The source review separates runtime adapters delegating into the 55 typed `src/main/*.ts` modules from composition responsibilities that should remain in main: Electron window/native view lifecycle, lock and cleanup ordering, trusted sender/frame checks, workspace gate registration, and cross-module orchestration. The file is not considered too large solely because it is 2,104 lines; future extractions should move a cohesive state/lifecycle boundary with focused behavioral tests rather than rename wrappers.

The v62 IPC delta adds tested primitive validators and applies them to control-mode selection, clipboard text/length, and sidebar visibility. No preload capability was added. The broader security gates still require current PSL/dependency evidence and live Electron adversarial acceptance before closure.

`src/main.js` is now primarily a composition root for IPC registration, live app/workspace state, native Electron construction and trusted security callbacks. AI Lab data/API/local-model orchestration lives in `src/main/ai-lab-runtime.ts`; Arena store, cleanup, browser navigation and prompt orchestration live in `arena-store-runtime.ts`, `arena-account-data-runtime.ts`, `arena-browser-runtime.ts` and `arena-prompt-runtime.ts`; Forge/Video Hub browser lifecycle live in `forge-browser-runtime.ts` and `video-hub-browser-runtime.ts`; Video Hub proxy mode/rollback live in `video-hub-network-runtime.ts`; AI Hub account view lifecycle lives in `account-browser-runtime.ts`; and developer-file/icon/provider/update operations live in `native-operations-runtime.ts`. The modules use injected dependencies to avoid direct Electron bootstrap coupling.

The new `src/main/icon-runtime.ts` owns local icon discovery, data URI conversion, safe candidate selection, remote cache warming, and cache memory release. `src/main/memory-diagnostics-runtime.ts` owns aggregate process metrics, workspace view attribution, provider probes, and privacy-bounded diagnostic payload assembly. Both are wired into the build, source allowlist and package tests. The v35 baseline's 3,522-line / 167,034-byte `src/main.js` is now 2,071 lines / 98,320 bytes (1,451 fewer lines and 68,714 fewer bytes). The listed test suite passed 622/622 under direct execution after test-only TypeScript transpilation; 98 JS-family and 90 TS/TSX syntax checks passed; ten recent runtime modules passed strict standalone TypeScript checking. Normal dependency-backed build/typecheck and runtime/installer validation remain outstanding. **Security audit is the next milestone**, specifically sender/frame/lock policy, payload validation, filesystem containment, WebContents navigation/session separation and privileged native handlers. This is a static module ownership report, not a completed security review.

## Migration update — AI Hub management-list React ownership — 15 October 2026

`src/renderer-react/ai-hub-management-lists.tsx` now owns the provider, account-management, and shortcut list roots. The `innerHTML` implementations for provider and settings-account rows were removed from `src/renderer.js`; the old sidebar-account DOM fallback was removed as React is the sole owner of `#accounts`. A typed view-model/action bridge preserves the existing provider/account operations and persisted ordering, while the account/provider create/edit dialogs are explicitly still legacy-owned. Four contract tests cover build wiring, behavior hooks, bridge delegation, and removal of the legacy list renderers.

# Historical: Mad Station 1.5.4 — Static Module Audit

## Scope and method
Reviewed the shipped JavaScript modules against package entry points, CommonJS `require()` calls, HTML script references, and the existing regression-test references. This is a static source audit, not a runtime coverage proof. IPC channels and dynamically selected feature wiring remain important additional paths when considering any deletion.

## Module reference map (after staged migration)

| Module | Evidence of use | Disposition |
|---|---|---|
| `src/main.js` | `package.json` main entry | Keep — application main process, still legacy JavaScript |
| `src/preload.ts` | Configured as control-view preload via generated `build/preload.js` | Keep — typed compatibility renderer bridge |
| `src/toolbar-preload.ts` | Configured as toolbar preload via generated `build/toolbar-preload.js` | Keep — restricted typed toolbar bridge |
| `src/renderer.js` | Script tag in `src/renderer.html` | Keep — primary renderer and feature wiring, still legacy DOM renderer |
| `src/toolbar-react/main.tsx` | Vite entry imported by `src/toolbar.html` | Keep — React toolbar implementation |
| `src/renderer-react/ai-playground-api-arena.tsx` | Vite entry `ai-playground-api-arena-react`, loaded by `src/renderer.html`; bridged by `madstation:api-arena-state` / `madstation:api-arena-action`; tested by `tests/renderer-react-ai-playground-api-arena.test.js` | Keep — React owns API Arena prompt/model/result/vote/history presentation; API credentials, network requests, persistence and action validation remain host-owned |
| `src/renderer-react/ai-playground-browser-arenas.tsx` | Vite entry `ai-playground-browser-arenas-react`, loaded by `src/renderer.html`; bridged by `madstation:free-arena-state` / `madstation:free-arena-action` and `madstation:local-arena-state` / `madstation:local-arena-action`; tested by `tests/renderer-react-ai-playground-browser-arenas.test.js` | Keep — React owns Free Account + Local AI arena controls and presentation; native WebContentsViews, sessions, local requests, and persistence remain host-owned |
| `src/renderer-react/image-hub-discovery.tsx` | Vite entry `image-hub-discovery-react`, loaded by `src/renderer.html`; bridged by `window.MadStationImageHubDiscovery`; tested by `tests/renderer-react-image-hub-discovery.test.js` | Keep — React owns Image Hub categories, quick-start tool cards, favorites, custom-tool form and add-account form; host validates actions and owns persistence/session switches |
| `src/renderer-react/image-hub-workspace-chrome.tsx` | Vite entry `image-hub-workspace-chrome-react`, loaded by `src/renderer.html`; bridged by `madstation:image-hub-workspace-chrome-state` / `madstation:image-hub-workspace-chrome-action`; tested by `tests/renderer-react-image-hub-workspace-chrome.test.js` | Keep — React owns Image Hub header, Studio/Add Account tabs and header collapse affordance; host validates tab/action DTOs and owns panel/sidebar state |
| `src/renderer-react/image-hub-workspace-toolbar.tsx` | Vite entry `image-hub-workspace-toolbar-react`, loaded by `src/renderer.html`; bridged by `madstation:image-hub-toolbar-state` / `madstation:image-hub-toolbar-action`; tested by `tests/renderer-react-image-hub-workspace-toolbar.test.js` | Keep — React owns Image Hub Studio navigation/loading toolbar and active-account/site status; renderer host retains WebView lifecycle, URL/title state, safe icon candidates and HTTPS-only external-open authorization |
| `src/renderer-react/image-hub-sidebar-chrome.tsx` | Vite entry `image-hub-sidebar-chrome-react`, loaded by `src/renderer.html`; bridged by `madstation:image-hub-sidebar-chrome-state` / `madstation:image-hub-sidebar-chrome-action` | Keep — React owns Image Hub brand, search, settings/notification/sidebar actions and account-list heading; host validates filtering/navigation and maintains state |
| `src/renderer-react/image-hub-settings.tsx` | Vite entry `image-hub-settings-react`, loaded by `src/renderer.html`; custom-event bridge to `src/renderer.js` | Keep — React-owned Image Hub settings form and modal keyboard/focus behavior; host validates/persists favorites ordering, account view and custom-tool removal policy |
| `src/renderer-react/image-hub-browser-state.tsx` | Vite entry `image-hub-browser-state-react`, loaded by `src/renderer.html`; bridged by browser-state/action custom events | Keep — React owns empty/loading/error UI; host owns WebView lifecycle, account session teardown, HTTPS navigation guard and retry handling |
| `src/renderer-react/notes-workspace.tsx` | Vite entry `notes-workspace-react`, loaded by `src/renderer.html`; custom-event bridge to `src/renderer.js` | Keep — React owns Notes hero/count, search/list header, composer and settings; host owns local storage, normalization, sorting, deletion confirmation, limits and mutations |
| `src/renderer-react/image-hub-sidebar.tsx` | Vite entry `image-hub-sidebar-react`, loaded by `src/renderer.html`; bridged by `window.MadStationImageHubSidebar` | Keep — React-owned provider filter and account-row subtrees; existing controller retains state, filters, icons and actions |
| `src/renderer-react/video-hub-sites.tsx` | Vite entry `video-hub-sites-react`, loaded by `src/renderer.html`; bridged by `window.MadStationVideoHubSites` | Keep — React-owned Video Hub Quick start provider cards; existing controller retains provider data, quick-add actions, and favicon cache behavior |
| `src/renderer-react/video-hub-provider-tiles.tsx` | Vite entry `video-hub-provider-tiles-react`, loaded by `src/renderer.html`; bridged by `window.MadStationVideoHubProviderTiles` | Keep — React-owned Video Hub provider-filter tiles; controller retains counts, selection persistence, filtering and icon fallback/cache behavior |
| `src/renderer-react/video-hub-account-list.tsx` | Vite entry `video-hub-account-list-react`, loaded by `src/renderer.html`; bridged by `window.MadStationVideoHubAccounts` | Keep — React-owned Video Hub account tiles and inline rename view; controller retains filtering, pins/recents, active-session actions, menus and icon fallback/cache behavior |
| `src/renderer-react/video-hub-recent.tsx` | Vite entry `video-hub-recent-react`, loaded by `src/renderer.html`; bridged by `window.MadStationVideoHubRecent` | Keep — React-owned Video Hub recent-account chips; controller retains recency persistence, active-account exclusion, visibility and account activation |
| `src/renderer-react/ai-hub-management-lists.tsx` | Vite entry `ai-hub-management-lists-react`, loaded by `src/renderer.html`; bridged by `window.MadStationAiHubManagementLists` | Keep — React owns AI Hub provider-management rows, account-management rows, and shortcut rows; renderer host retains data snapshots and existing actions/persistence |
| `src/renderer-react/appearance-controls.tsx` | Vite entry `appearance-controls-react`, loaded by `src/renderer.html` | Keep — React owns homepage-style previews, global theme mode, accent choices, and background library; the homepage switcher owns homepage selection, while renderer keeps Appearance settings mutations and native/background file actions |
| `src/renderer-react/remaining-settings-panels.tsx` | Vite entry `remaining-settings-panels-react`, loaded by `src/renderer.html`; test `tests/renderer-react-remaining-settings-panels.test.js`; included in developer-source allowlists | Keep — React owns AI Hub sidebar density, account-safety toggle, built-in shortcut info rows, and advanced global Appearance controls; `src/renderer.js` validates finite setting/security actions and keeps icon folder/refresh operations in the trusted host |
| `src/renderer-react/video-hub-providers.tsx` | Vite entry `video-hub-providers-react`, loaded by `src/renderer.html`; bridged by `window.MadStationVideoHubProviders` | Keep — React-owned Video Hub provider-management rows; controller retains provider state, deletion confirmation, account cleanup, and guarded icon fallback/cache behavior |
| `src/renderer-react/video-hub-workspace-chrome.tsx` | Vite entry `video-hub-workspace-chrome-react`, loaded by `src/renderer.html`; bridged by `window.MadStationVideoHubChrome` | Keep — React-owned Video Hub tabs/header, browser toolbar/active-account status, and summary stats; the host validates actions and keeps native browser-slot placement, session/navigation and external-open authorization |
| `src/renderer-react/video-hub-settings.tsx` | Vite entry `video-hub-settings-react`, loaded by `src/renderer.html`; custom-event bridge to `src/renderer.js` | Keep — React-owned feature settings dialog with staged workspace options; host validates actions, persists settings, applies network mode and security permissions, and controls native overlay state |
| `src/appearance.js` | Module script in both renderer and toolbar HTML | Keep — shared appearance behavior |
| `src/shared/ipc-validation.ts` | Imported into both TypeScript preloads and bundled into the main-process module output | Keep — bounded serializable-payload guard |
| `src/main/settings.ts` | CommonJS import from `src/main.js` and injected into the config-schema module | Keep — typed app/security settings normalization |
| `src/main/downloads-controller.ts` | CommonJS import from `src/main.js`; included in `build:main-modules` | Keep — typed downloads action/folder IPC transition layer; native dialog and secure IPC wrapper stay in main |
| `src/main/video-hub-ipc.ts` | Required by `src/main.js`; included in `build:main-modules` and developer-source allowlist | Keep — typed Video Hub IPC channel contract; delegates into existing validated host commands |
| `src/main/video-hub-controller.ts` | Imported from `src/main.js`, included in `build:main-modules`, and allowlisted as developer source | Keep — typed Video Hub provider/account store normalization and low-coupling mutations; dependencies are injected and Electron/session operations stay in main |
| `src/main/ai-hub-controller.ts` | Imported from `src/main.js`, included in `build:main-modules`, tested by `tests/main-ai-hub-controller.test.js`, and allowlisted as developer source | Keep — typed AI Hub provider/account data transitions; account updates use prepare/apply so session teardown remains ordered in main |
| `src/main/ai-hub-ipc.ts` | Required by `src/main.js`; included in `build:main-modules`, tested by `tests/main-ai-hub-ipc.test.js`, and allowlisted as developer source | Keep — typed AI Hub provider/account channel registration; secure `handle()` and host-owned side effects are preserved |
| `src/main/diagnostics-controller.ts` | Required by `src/main.js`; included in `build:main-modules`, covered by `tests/main-diagnostics-controller.test.js`, and allowlisted as developer source | Keep — typed diagnostics error redaction, memory projection, absolute-JSON path validation, and atomic diagnostics export; filesystem and path APIs are injected |
| `src/main/diagnostics-ipc.ts` | Required by `src/main.js`; included in `build:main-modules`, covered by `tests/main-diagnostics-ipc.test.js`, and allowlisted as developer source | Keep — typed diagnostics IPC registration through the existing secure `handle()` wrapper |
| AI Hub ordering and renderer read model | `src/main/ai-hub-read-model.ts` | `build/main/ai-hub-read-model.js` | Typed stable ordering, atomic full-order validation, locked-state filtering, provider/account serialization, icon candidate injection, missing-provider marker and runtime status projection |
| `src/main/settings-controller.ts` | CommonJS import from `src/main.js`; included in `build:main-modules` | Keep — typed application/security/download settings transitions; Electron authorization stays in the main-process wrapper |
| `src/main/config-schema.ts` | CommonJS import from `src/main.js` | Keep — typed persisted provider/account repair and migration |
| `src/main/config-store.ts` | CommonJS import from `src/main.js` | Keep — atomic config persistence, backup recovery and quarantine |
| `src/main/json-file-store.ts` | CommonJS import from `src/main.js`; included in `build:main-modules` and developer-source allowlists | Extracted in v48 — atomic JSON temp-write/rename and corrupt-file quarantine only; domain schema/default policy remains in the store controller |
| `src/main/lock-security.ts` | CommonJS import from `src/main.js` | Keep — validated password records, fixed-cost scrypt and attempt throttling |
| `src/main/downloads.ts` | CommonJS import from `src/main.js` | Keep — typed download manager |
| `src/main/input-validation.ts` | CommonJS import from `src/main.js` | Keep — typed URL, icon, host, ID and text validation helpers |
| `src/shared/api-contract.ts` | Imported by both TypeScript preload APIs and toolbar UI | Keep — shared API and DTO contract |
| `src/main/icon-cache.ts` | CommonJS import from `src/main.js` | Keep — remote icon cache |
| `src/default-providers.js` | CommonJS import from `src/main.js` | Keep — default provider catalog |

The original `src/preload.js`, `src/toolbar-preload.js`, and `src/toolbar.js` were replaced by their TypeScript/React equivalents. Preload bundle filenames under `build/` are generated by `npm run build:preload`; do not add them as hand-maintained source. The main process and primary workspace renderer remain legacy JavaScript. This is a static reference inventory, not proof of end-to-end runtime coverage.

## Release verification performed for this archive

- Version metadata set to `1.5.4` in `package.json` and `VERSION`.
- About-screen version label and icon-cache User-Agent version updated to `1.5.4`.
- Release regression test expectations updated to the 1.5.4 release target.
- Original baseline before modernization: **181 passed, 0 failed**.
- Updated suite after the TypeScript service extraction: **215 passed, 0 failed** in the direct Node regression run (design system, home systems, release regression, IPC validation, settings normalization, input validation, config-schema migration, config-store recovery, and app-lock security tests).
- The eight extracted/shared TypeScript service modules were strict-checked individually. Full project typecheck, Vite/esbuild build, app launch and Windows installer checks remain outstanding because project dependencies could not be installed in this environment.

## Still required before release

- Run `npm run dist` on a Windows build host with dependencies installed.
- Install the generated NSIS installer on a clean Windows test account/VM and verify install, launch, shortcuts, upgrade behavior, and uninstall.
- Perform runtime/manual checks for IPC channel reachability, feature flows, and dynamically referenced UI elements. Do not delete functions or UI elements solely from text-search results.


## 1.5.4 auth-flow addendum

Google OAuth handoff routing in `src/main.js` was updated to restart authentication from the provider origin in the system browser rather than forwarding an intermediate Google OAuth URL. This is an authentication compatibility change, not an OAuth-policy bypass; external-browser session state is not imported into Mad Station.


## Current verification snapshot — typed settings IPC transition layer

The latest source ZIP passed the direct Node regression suite **255/255 before this settings-controller extraction**. The settings-controller extraction adds four unit tests and two integration/guard tests; after the change the direct suite passed **261/261**, using globally transpiled service modules placed temporarily in `build/main/` (generated outputs are removed from the archive). `node --check` passed for all JavaScript sources/tests/scripts, and the globally installed TypeScript transpiler parsed all TS/TSX implementation files without syntax diagnostics.

The dependency-backed `npm run typecheck` remains blocked in this environment because `@types/node` and `vite/client` are unavailable. `npm run build:renderer` remains blocked because project-local Vite is unavailable. `npm install --no-audit --no-fund` timed out before creating `node_modules`, so no production build, Electron launch, or Windows installer is claimed for this source snapshot. The new controller is included in `build:main-modules`; on the Windows development machine, run `npm start` and verify general settings, app-lock/security options, download preferences/folder selection, and reset settings before continuing to the next native handler family.


## Current batch migration snapshot — Appearance + downloads

This pass migrates four Appearance settings roots (homepage-style selection, theme mode, accent colors, and background library) to `src/renderer-react/appearance-controls.tsx` and delegates the choose-folder/get-downloads/download-action IPC family to `src/main/downloads-controller.ts`. The legacy renderer owns settings persistence, URL checks, local file picker invocation, and background removal; the main process still owns sender validation and native IPC registration. The download controller only exposes ID-based operations and does not accept renderer-supplied file paths.

The direct Node regression suite passed **285/285** after using the globally installed TypeScript transpiler to create temporary test prerequisites in `build/main/`. All 27 TypeScript/TSX files parsed with no syntax diagnostics. `npm install --no-audit --no-fund` timed out again, so the dependency-backed strict type check, Vite production build, Electron runtime, and installer could not be verified in this environment. The temporary `build/` output is excluded from the deliverable archive. Confirm `npm start` and visually test Appearance selection/custom backgrounds and downloads folder/action behavior on Windows before continuing to the next batch.


| `src/renderer-react/appearance-controls.tsx` | Vite entry `appearance-controls-react`, loaded by `src/renderer.html` | Keep — React owns homepage-style previews, mode choices, accent controls, and background-library cards; the homepage switcher persists the selected style and existing renderer keeps Appearance settings persistence and native actions |
| `src/main/downloads-controller.ts` | CommonJS import from `src/main.js`; included in `build:main-modules` | Keep — typed download-command transitions; native dialog and authorization wrapper remain in the main process |

## Latest verification snapshot — batch Appearance + downloads migration

**285/285 direct Node tests passed**. Syntax checks passed for 34 JavaScript source/test/script files and 27 TS/TSX files parsed through global TypeScript transpilation. This does not substitute for semantic type checking. The dependency installation timed out; `npm run typecheck` cannot find `@types/node` or `vite/client`, and `npm run build:renderer` cannot find local `vite`. No production build, Electron launch, or installer result is claimed for this batch. Temporary `build/` output used for tests is excluded from the source archive.


## Latest continuation — typed diagnostics/native export boundary

`src/main/diagnostics-controller.ts` now owns the diagnostics-facing pure helpers and export operation: URL/local-path/token redaction, compact numeric memory summaries, validation of absolute `.json` destinations, and exclusive sibling-temp-file + rename atomic JSON writing. The filesystem and path API are injected; invalid or relative targets are rejected before any filesystem call. Successful exports no longer return the selected local path to renderer code, avoiding accidental disclosure of the Windows profile path. `src/main/diagnostics-ipc.ts` owns the three existing diagnostics registrations (`get-diagnostics`, `check-provider-compatibility`, `export-diagnostics`) and is wired through the pre-existing secure `handle()` wrapper. The earliest startup log writer remains inline and independent of compiled modules so startup failures can still be recorded when build output is missing.

Added `tests/main-diagnostics-controller.test.js` and `tests/main-diagnostics-ipc.test.js`, updated release source-contract tests, package build/test inputs, and the developer-source resource allowlist. No renderer IPC names or argument patterns changed.


## Custom background file boundary (continuation v8)

| Module | Ownership | Guardrails |
|---|---|---|
| `src/main/background-ipc.ts` | Registration for the existing `choose-background-file` and `remove-background` channels | Must receive the established secure `handle()` wrapper; preserve exact channel names and argument shape |
| `src/main/background-files.ts` | Selected-image validation, extension/MIME mapping, managed-directory copying, file URL containment checks, and best-effort managed-file removal | Inject fs/path/URL APIs; require absolute paths and supported image extensions; cap selected source files at 25 MiB; use `COPYFILE_EXCL`; only delete generated `local-<id>.<image-extension>` direct children of the managed backgrounds directory; sanitize errors before IPC |

The Electron host retains native open-dialog presentation, custom-background config lookup/mutation, live settings application, and config broadcasts. A file is removed only after the stored record is found and its type is `local`; stale or unavailable files do not prevent the settings entry from being removed.

## Account import/export and workspace backup/restore (continuation v7)

| Module | Ownership | Guardrails |
|---|---|---|
| `src/main/workspace-transfer-ipc.ts` | Typed registration for the four existing transfer/backup/restore channels | Must receive the established secure `handle()` wrapper; no direct `ipcMain` access |
| `src/main/workspace-transfer-controller.ts` | Versioned account export envelope, non-mutating import preparation, workspace backup envelope, and config restore migration | Import must return a new candidate config; preserve provider-name merging, globally unique account names, provider/account ordering, `temporary: false`, and raw-config restore compatibility |
| `src/main/workspace-transfer-files.ts` | Absolute `.json` path checks, regular-file/25 MiB read limit, JSON reads, and atomic writes | Inject fs/path; reject invalid paths before file mutation; exclusive temp file and rename; surface sanitized errors only |

The Electron composition root retains Save/Open dialogs, the existing secure IPC wrapper, config commit/broadcast timing, native settings/security application, browser-view activation, and `wipeAllSessions()`. The restore candidate is completely parsed and migrated before session cleanup starts. Do not move session teardown or runtime mutation into the data controller.

| `src/main/ai-lab-credentials.ts` | Required by `src/main.js`; included in `build:main-modules`, the developer-source allowlist and `tests/main-ai-lab-credentials.test.js` | Keep — OS safeStorage-backed credential envelope, weak-backend refusal, bounded record validation, and exclusive atomic credential-file writes; filesystem, path, safeStorage and base64 adapters are injected |

### AI Lab credential-store extraction (15 October 2026)

Credential envelope encryption/decryption and disk persistence now live in `src/main/ai-lab-credentials.ts`. The on-disk `mad-station-secure-credentials` envelope and version are unchanged. `src/main.js` injects Electron safeStorage (including async and sync API compatibility), filesystem/path APIs, base64 conversion and a cryptographically unique temporary suffix. Reads preserve the prior fail-soft behavior for missing/corrupt/unavailable credential storage; writes reject unavailable or `basic_text` storage rather than silently persisting plaintext. Credential writes encrypt before creating an exclusive temp file and set POSIX mode 0600; cleanup deletes only a temp file created successfully by this write attempt. Legacy-key migration and AI Lab data backup recovery remain in the Electron host.


## Latest lifecycle-policy inventory — v10

`src/main/browser-view-policy.ts` is part of the typed main-process boundary but does not own native lifecycle effects. AI Hub and Forge use the same preferred-ID/recency pruning policy, with deterministic stable tie ordering. Memory reclamation selects closable account-view IDs while respecting the unlocked AI Hub active-view rule and the borrowed-view set. The host continues to close or preserve every view and session. The complete listed test suite passed **348/348** after temporary TypeScript transpilation; semantic full-project typecheck and production bundles remain blocked by absent local dependencies.

| Module | Wiring and tests | Disposition |
|---|---|---|
| `src/main/browser-view-policy.ts` | Required by `src/main.js`; included in `build:main-modules`, both developer-source allowlists, and `tests/main-browser-view-policy.test.js` | Keep — pure typed retention/reclamation decisions for AI Hub and Instruction Forge views; all Electron view/session side effects remain in main |
| `src/main/browser-view-runtime.ts` | Required by `src/main.js`; included in `build:main-modules`, both developer-source allowlists, and `tests/main-browser-view-runtime.test.js` | Keep — injected best-effort close sequence for one account view; no Electron import, session access or policy selection |


## Lifecycle ordering test inventory — v11

`tests/main-browser-lifecycle-contract.test.js` pins current source ordering for workspace leave, lock/unlock, temporary borrowed account views, and shutdown. Its five tests pass as part of the **353-test/38-file** source regression run. It intentionally does not claim an Electron runtime integration test. Keep it in the package test list, and add injected adapter tests before moving native lifecycle side effects from `src/main.js`.


## Browser-view runtime adapter (continuation v12)

`src/main/browser-view-runtime.ts` now owns the ordered native close calls used by `removeAccountView()`: resolve the currently registered view, attempt parent detachment, inspect `webContents.isDestroyed()`, close only if live (or if inspection itself fails, preserve the prior best-effort attempt), and finally remove the registry entry only when it still points to that same view. The adapter accepts all operations as injected callbacks and returns only a status and safe failed-step identifiers, never raw exception messages.

The host retains download cancellation, Forge-view cleanup, policy-based selection, `accountRuntime` cleanup, session partition access, creation, activation, workspace transitions, app lock/unlock, and shutdown. The adapter does not introduce new asynchronous behavior.

| `src/main/browser-view-pruning-runtime.ts` | Required by `src/main.js`; included in `build:main-modules`, both developer-source allowlists, and `tests/main-browser-view-pruning-runtime.test.js` | Keep — applies policy-selected account-view closures in order, isolates per-view thrown failures, and contains no Electron APIs or policy logic |
| `src/main/browser-view-reclamation-runtime.ts` | Required by `src/main.js`; included in `build:main-modules`, both developer-source allowlists, and `tests/main-browser-view-reclamation-runtime.test.js` | Keep — applies active/borrowed-view reclamation policy in order, isolates per-view failures, and contains no Electron APIs or session access |

`applyViewPrunePlan()` executes precisely the ordered close IDs passed by the host. If a `removeAccountView()` call throws, it records that ID and continues through the remainder of the plan. The host logs only a failure count to avoid exposing runtime exception details. This is an execution adapter, not a selector or session manager.


## Arena/Forge native view cleanup — v15

`src/main/workspace-browser-view-runtime.ts` consolidates only the detach/close/forget sequence shared by `closeArenaView()` and `closeForgeBrowserView()`. It accepts injected native operations and returns a sanitized status with safe failure-step labels. It deliberately does not inspect or mutate workspace selection, layout, sessions, storage, or account state. As of v17, per-account Arena storage/cache wiping is orchestrated separately by `src/main/arena-account-data-runtime.ts`.

| Module | Wiring and tests | Disposition |
|---|---|---|
| `src/main/workspace-browser-view-runtime.ts` | Required by `src/main.js`; included in `build:main-modules`, both developer-source allowlists, and `tests/main-workspace-browser-view-runtime.test.js` | Keep — injected best-effort close boundary shared by Arena and Forge; no Electron import, session access, or workspace state ownership |

The v15 test suite covers successful ordering, missing registry entries, detach/close/forget failures, failure-detail redaction, shared host wiring and build/package/source allowlists. Actual Electron view lifecycle still requires runtime smoke tests after a dependency-backed build.


## Arena data wipe and Instruction Forge suspension contracts — v16

`tests/main-browser-data-cleanup-contract.test.js` pins host-level lifecycle order without moving any runtime behavior: Arena's `arenaWipeAccountData()` closes the account WebContents before clearing session storage and cache; account/provider deletion and login reset await the wipe before committing state or restoring views; `suspendForgeBrowsers()` closes every registered Forge view while preserving the selected account; and leaving Instruction Forge closes its views before the control UI switches. The suite is included in the package test list. These tests inspect source ordering and must not be presented as live Electron integration coverage.


## Arena account-data wipe coordinator — v17

| Module | Wiring | Boundary |
|---|---|---|
| `src/main/account-session-security.ts` | Required by `src/main.js`; included in `build:main-modules` and developer-source allowlist; `tests/main-account-session-security.test.js` | Keep — typed provider/account host allowlists, permission checks, HTTP blocking, device denial, download hooks, privacy-safe network failures, navigation/popup rules, OAuth routing and safe external opening; session partition creation stays in main |
| `src/main/main-window-runtime.ts` | Required by `src/main.js`; included in `build:main-modules` and developer-source allowlist; `tests/main-main-window-runtime.test.js` | Keep — typed BaseWindow lifecycle and renderer-ready orchestration; control/toolbar view implementation and state ownership stay injected |
| `src/main/app-bootstrap-runtime.ts` | Required by `src/main.js`; included in `build:main-modules` and developer-source allowlist; `tests/main-app-bootstrap-runtime.test.js` | Keep — typed app-ready/activate/window-all-closed ordering; config, security initialization, diagnostics and native operations remain injected |
| `src/main/lock-controller.ts` | Required by `src/main.js`; included in `build:main-modules` and developer-source allowlist; `tests/main-lock-controller.test.js` | Keep — typed app-lock command transitions; injected session/config/window effects; preserves password validation and reset ordering |
| `src/main/lock-ipc.ts` | Required by `src/main.js`; included in `build:main-modules` and developer-source allowlist; `tests/main-lock-ipc.test.js` | Keep — registers established lock channels using the secure `handle()` callback; no direct `ipcMain` access or authorization bypass |
| `src/main/app-lifecycle-runtime.ts` | Required by `src/main.js`; included in `build:main-modules` and developer-source allowlist; `tests/main-app-lifecycle-runtime.test.js` | Keep — injected idle timeout and system-lock/suspend watcher runtime; Electron side effects remain in the host |
| `src/renderer-react/utility-workspaces.tsx` | Vite entry `utility-workspaces-react`; loaded by `src/renderer.html`; tests in `tests/renderer-react-utility-workspaces.test.js`; included in packaged developer-source allowlist | Keep — React owns Clipboard and To-do workspace chrome/forms/settings; host still owns persistence and mutations; Clipboard is explicit-save only |
| `src/main/arena-account-data-runtime.ts` | Required by `src/main.js`; included in `build:main-modules`, both developer-source allowlists and `tests/main-arena-account-data-runtime.test.js` | Keep — injected close/session coordinator; closes the native view before resolving the persistent session; independently attempts storage and cache cleanup; returns safe failed-step names only |

The host still owns Arena account/provider deletion, login reset, partition resolution, selected browser-model restoration and workspace switching. Unlike the earlier source-order-only stage, the wipe steps are now exercised against an injected test harness, while the caller ordering remains protected by `main-browser-data-cleanup-contract.test.js`.


## AI Hub form vertical slice — v19

| Module | Wiring and tests | Disposition |
|---|---|---|
| `src/renderer-react/ai-hub-management-forms.tsx` | Vite entry `ai-hub-management-forms-react`; loaded by `renderer.html`; package test `tests/renderer-react-ai-hub-management-forms.test.js`; included in developer-source allowlist | Keep — React owns provider/account create-edit forms, draft state and payload shaping; host bridge retains persistence/native operations |

This stage removes the static form bodies from `renderer.html` and old direct input mutations/submission handlers from `renderer.js`. The wrapper modals remain static to preserve app-level overlay handling. The full Vite/TypeScript build needs installed project dependencies; source-contract and test-suite results must not be misreported as a production build.


| `src/renderer-react/global-settings-panels.tsx` | React view module | Accessibility, Audio output, and Startup settings UI; bounded setting-action custom events | `src/renderer.js` remains trusted host for setting persistence, audio device enumeration and audio tone testing | **Migrated in v20**. Old static control markup and direct listeners removed; Vite/HTML/dev-source wiring and tests added. Full Vite bundle still awaits local dependency install. |


| `src/renderer-react/system-settings-panels.tsx` | React view module | Lock policy controls, Downloads settings, and Data/Diagnostics actions; mount roots: `#lockOptions`, `#downloadsSettingsReactMount`, `#dataDiagnosticsReactMount`; action events are validated by `src/renderer.js` | **Migrated in v21**. Static duplicate controls/direct listeners removed; host retains password modals, settings persistence, native download dialogs, backup/restore, diagnostics IPC and update opening. Vite/HTML/package/developer source wiring and regression tests added. |

| `src/renderer-react/information-security-panels.tsx` | React view module | About version/provider/account view model, Developer file cards/prompt recipes/guardrails, AI Hub Privacy toggles, Websites & permissions toggles; mounts `#aboutReactMount`, `#developerReactMount`, `#aiHubPrivacyReactMount`, `#aiHubWebsitesReactMount` | **Migrated in v22**. Host owns all privileged operations; privacy/website actions use a bounded boolean security whitelist. Static duplicate panel bodies removed and the module wired into Vite/HTML/package/developer source resources. |


## React-owned Free Account and Local AI Arena modes — v26

`src/renderer-react/ai-playground-browser-arenas.tsx` owns the Free Account and Local AI Arena control/presentation UI under `#freeAccountArenaReactMount` and `#localArenaReactMount`. The single Vite entry `ai-playground-browser-arenas-react` is already included in renderer HTML, `vite.config.ts`, package tests/resources, and both Developer source allowlists. The trusted renderer produces bounded snapshots and validates `madstation:free-arena-action` and `madstation:local-arena-action`; React must not call `window.aiHub` or run network requests. Browser slot anchors are React-rendered so the host can measure them and position native WebContentsViews. Keep view creation, placement, persistent session partitions, page navigation, injected browser input, Local AI/API calls, and vote persistence in host code. Local model/server endpoint snapshots must remove URL user/password and sensitive query credentials before crossing to React. Do not restore legacy static composer/picker/result markup or imperative writers for these roots. Tests: `tests/renderer-react-ai-playground-browser-arenas.test.js`, `tests/renderer-react-ai-playground-api-arena.test.js`, `tests/design-system.test.js`, `tests/release.test.js`, plus the full package-listed suite.


## Video Hub sidebar controls (v28 continuation)

- `src/renderer-react/video-hub-sidebar-controls.tsx` — React rendering owner for search and All/Pinned controls.
- `src/renderer.js` — retains filter policy, keyboard semantics, pin state, and account selection via delegated listeners.
- `src/renderer.html` — mount point only; duplicate static control markup removed.
- `tests/renderer-react-video-hub-sidebar-controls.test.js` — ownership and build-wiring contracts.

### v33 grouped utility workspace ownership and app-lock extraction

Clipboard and To-do now use the React-owned `src/renderer-react/utility-workspaces.tsx` for their complete visible workflow (tabs, chrome, composition/editing, search/filter/sort and settings). Notes-specific views remain in `notes-workspace.tsx`; shared list rows are in `utility-lists.tsx`. The renderer host remains the authority for persistence, normalization, item limits, copy/pin/delete/complete actions and confirmations. Clipboard does not read or poll the OS clipboard.

The app-lock controller, IPC registration and watcher runtime live in `src/main/lock-controller.ts`, `src/main/lock-ipc.ts` and `src/main/app-lifecycle-runtime.ts`. These modules are built and packaged as developer source, and are covered by focused contracts. Keep secure `handle()` authorization and native Electron operations in the composition root.


### v34 account-session security and lifecycle orchestration

The v34 batch extracts the account session permission/network/navigation policy and the app bootstrap/main-window lifecycle into `account-session-security.ts`, `app-bootstrap-runtime.ts`, and `main-window-runtime.ts`. All three sources are imported by `src/main.js`, built by `build:main-modules`, included in developer-source allowlisting, and have focused tests. No IPC channel or preload API was changed, and the secure `handle()` wrapper remains in the trusted composition root. Static and injected-runtime coverage does not establish live Electron or Windows installer behavior.


### v34 main-process security, bootstrap, and window boundaries

- `src/main/account-session-security.ts`: strict TypeScript module for per-account session policy, navigation/popup decisions and safe external opening. Focused tests: `tests/main-account-session-security.test.js`.
- `src/main/main-window-runtime.ts`: injected BaseWindow creation, lifecycle and renderer-ready ordering. Focused tests: `tests/main-main-window-runtime.test.js`.
- `src/main/app-bootstrap-runtime.ts`: app-ready, activation and window-all-closed sequencing. Focused tests: `tests/main-app-bootstrap-runtime.test.js`.

All are referenced by `src/main.js`, the `build:main-modules` command, package developer-source allowlists and the package-listed test script. The 506-test source suite passes through the temporary transpilation workflow, but `esbuild`/Vite and the full project type definitions are not present, so production output remains unverified.

### v35 WebContentsView and session lifecycle boundaries

| Module | Wiring | Boundary |
|---|---|---|
| `src/main/session-lifecycle-runtime.ts` | Imported from `src/main.js`; added to `build:main-modules`, developer source allowlists, and `tests/main-session-lifecycle-runtime.test.js` | Keep — partition naming, one-time session security configuration, Video Hub proxy-readiness coordination and storage/cache cleanup ordering; Electron Session objects are injected |
| `src/main/browser-view-layout-runtime.ts` | Imported from `src/main.js`; built/packaged and tested by `tests/main-browser-view-layout-runtime.test.js` | Keep — pure/injected native view bounds and visibility for AI Hub, Forge, Arena and Video Hub; zoom and app state supplied by host |
| `src/main/web-contents-view-attachment-runtime.ts` | Imported from `src/main.js`; built/packaged and tested by `tests/main-web-contents-view-attachment-runtime.test.js` | Keep — shared attach/register/navigation ordering; view construction, hardened event handlers and workspace state stay in host |

The existing `browser-view-runtime.ts`, `workspace-browser-view-runtime.ts`, pruning/reclamation adapters and Arena wipe coordinator remain the close/cleanup owners. This stage consolidates partition setup and layout, but does not yet extract every workspace-specific `WebContentsView` constructor or host event listener. No live Electron or production bundle validation is implied by the injected tests.


### v35 verification closure

The three lifecycle modules are wired into main-module bundling, tests and both source allowlists. The package-listed suite passes **523/523**; all three modules pass standalone strict TypeScript checking. The normal dependency-backed build, real Electron WebContentsView/session smoke tests and Windows installer are still release gates.

## v37 security ownership map

- `src/main.js`: trusted main-frame sender verification, lock-state enforcement, safe IPC payload validation, workspace-gate adapters, and dependency composition.
- `src/main/account-session-security.ts`: account host policy, permission-origin checks, navigation/redirect/popup decisions, child-window session inheritance and safe external/OAuth handoff.
- `src/main/ai-lab-runtime.ts` / `src/main/ai-lab-credentials.ts`: secure API key binding, endpoint validation, redirect prohibition and bounded model requests.
- `src/main/icon-cache.ts`: bounded remote icon fetch and public-address DNS policy; redirect destination revalidation.
- `src/main/native-operations-runtime.ts`: developer-file allowlist/path containment, explicit icon-cache commands, provider-check redirect rejection and update-feed validation.
- `src/main/background-files.ts` / `src/main/settings-controller.ts`: managed background file containment, symlink rejection and settings filtering.
- `src/main/config-schema.ts`: provider metadata/auth-domain normalization. Its common public-suffix denylist is deliberately not a full PSL and remains an explicit follow-up.
- `docs/security/SECURITY_AUDIT.md`: scope, concrete remediation, evidence and unclosed live/runtime gates.


## v38 security-module ownership

- `src/main/network-security.ts` — typed public IPv4/IPv6/global address checks, DNS-answer validation, address-pinned HTTPS and bounded update-feed JSON transport. Used by icon cache, provider checks/diagnostics, and update-feed operations. Keep AI Lab local-model requests on their separate explicit endpoint policy.
- `src/main/public-suffix-list.ts` — bundled PSL rule data and exact/wildcard/exception matcher support, used by auth-domain normalization. The refreshed v67 source declares upstream version `2026-10-16_09-29-46_UTC`, commit `91b4bd846240a84afb33695d5a51adcbc4cfd9ca`, and 10,399 rules. The earlier 9,762-rule OpenJDK snapshot note is superseded; see `docs/licenses/Public-Suffix-List-Notice.md`. Attribution and license files are in `docs/licenses/`, including `docs/licenses/THIRD_PARTY_NOTICES.md`.
- `docs/security/SECURITY_AUDIT.md` — current source security evidence and runtime/release exit criteria. It is intentionally not a security certification.


## v38 audit verification snapshot

The security suite passed **668/668 listed tests** after temporary test-only TypeScript transpilation. `network-security.ts`, `public-suffix-list.ts`, input-validation, native operations, diagnostics and Video Hub config normalization pass a strict standalone TypeScript check. The bundled PSL data now comes from the local OpenJDK snapshot installed 2026-08-19; refresh from the exact authoritative upstream snapshot using `npm run update:psl` before release. Production build, project typecheck and live Electron/Windows scenarios remain release gates.
