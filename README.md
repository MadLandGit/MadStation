## Current release — Mad Station v1.6.3 (20 October 2026)

**v1.6.3 is the current source/package version target.** This revision adds the Isometric World homepage and integrates its controls with the existing homepage registry, Quick Access appearance controls, and app-level version metadata.

**One-click validation and launch:** use `+ Diagnose Startup.cmd`. This single canonical launcher runs the full release-focused diagnostic workflow: it explicitly verifies the Electron binary download and version, main-process startup, window creation, both renderer loads and application exit. Its final summary explicitly states whether startup was confirmed or was not attempted.

- **Processor monitor:** system CPU usage is sampled in the trusted Electron main process and rendered inside the Home System performance widget beside the existing RAM telemetry. The Home widget's dynamically-created mount is reconciled with the React monitor entry instead of being missed during startup.
- **Prompt Studio:** the legacy composer remains only as a startup fallback; its hidden state is enforced in CSS so it cannot display underneath the React-owned cards.
- **Version metadata:** `package.json`, `package-lock.json`, `VERSION`, About/Developer labels, runtime fallbacks, and current User-Agent version strings are synchronized to `1.6.3`.
- **Release security remediation:** the optional Electron packaging chain's `sprintf-js@1.1.3` finding is mitigated with a narrowly scoped, vendored maintenance patch (`vendor/sprintf-js-1.1.4+madstation.1.tgz`). The patch clamps numeric precision before number conversion; the tarball is pinned by SHA-512 in `package-lock.json` and independently verified by the environment check and the full Diagnose Startup workflow. This is a Mad Station local patch, **not an official upstream release**; revisit it when upstream publishes a fix. Do not force the breaking `@electron/get@5` API into Electron Builder 26 or apply npm audit's unsafe forced packaging-tool downgrade.

## v1.6.3 — Isometric World homepage integration

- Added **Isometric World** as a selectable homepage theme and Quick Access destination.
- Integrated the supplied day/night world with the app-wide Appearance / Quick Access controls.
- Removed the theme-local command/search bar and palette.
- Exposed building-name visibility under Customize and hardened camera hold controls for pointer capture, cancellation, and keyboard clicks.
- Standardized the app version metadata and current runtime fallbacks on **1.6.3**.

## v1.6.0 — Migration stabilization and monitor fixes

- Bumped the application release metadata from 1.5.4 to 1.6.0 without changing dependencies or the lockfile dependency graph.
- Restored Home's React-managed telemetry mount when the widget is created dynamically; added a live system CPU percentage sampler and a visible processor usage meter alongside RAM.
- Enforced hidden-state styling for Prompt Studio's legacy composer so the input and output cards no longer render twice after the React component takes ownership.
- Added focused tests for CPU sampling, late-created widget mounts, Prompt Studio visibility, and 1.6.0 release metadata.
- **Provider catalog migration:** for backward compatibility, an untouched legacy starter configuration (the original three placeholder accounts for each of the six built-in providers) is upgraded to one account per curated provider. This narrow migration runs only when the stored provider/account records match the known starter pattern.

## v1.5.4 — Google OAuth handoff fix

- Google authentication URLs are no longer forwarded mid-transaction to the system browser. When a Google auth endpoint is requested by an embedded account, Mad Station restarts the flow from that provider's HTTPS entry point in the default browser instead.
- The app explains that external-browser login state is separate and cannot be copied into the embedded account session. This respects Google's embedded OAuth policy; it does not bypass it.
- Added a Windows guard for Electron's documented `shell.openExternal` URL length limit and retained URL-free request-failure diagnostics.
- Updated the embedded-browser troubleshooting notes. Source tests verify the new handoff behavior, URL-length guard and source version consistency.

## v1.5.3 — release candidate

Mad Station is a personal Windows desktop app for keeping many official AI websites in one window, with **separate persistent logins for every account**. Version 1.6.3 carries forward the hardened 1.5.4 / 1.4.0 baseline of the Mad Station workspace, including the provider/account catalog, downloads, Model Arena, responsive settings, safer update handling, bounded icon caching, large-workspace rendering improvements, live RAM diagnostics, and workspace-scoped browser-session lifecycle limits.

The fresh-install provider catalog was refined to start with one account per provider and to favor current free-access AI services.

### Release checks and guarantees

The 1.4.0 baseline fixes the update-link flow, the narrow Providers header overflow, large-account sidebar scaling, cache growth, missing-provider migration behavior, and silent filesystem-save failures.

The 1.4.0 runtime caches successful remote provider/account icons under the app data folder. Icon loading falls back in this order: saved/local icon data, one persisted remote cache hit, browser candidate chain, main-process HTTPS fetch/cache, then a bundled default Mad Station icon. Cache warming is backgrounded, deduplicated, and limited to four concurrent provider jobs.

- The application version is **1.6.3** and is sourced from `package.json`; `VERSION`, the About screen, and the Windows helper scripts stay aligned with it.
- The configuration schema has its own internal migration number (`13`) and is deliberately separate from the app's semantic version.
- The app uses one running instance, isolated persistent sessions per account, validated IPC senders, strict app-UI CSP, HTTPS-only account/provider URLs, permission checks tied to the account's own site, navigation/popup guards, atomic settings writes, backups, and corruption quarantine.
- Sidebar filtering and active-account updates are rendered from a cache-aware icon pipeline, so switching pages or provider filters does not require a fresh icon download.
- Provider icons support local files plus multiple remote fallbacks; successful remote icons are persisted in a local icon cache and a bundled default icon prevents blank/broken tiles even when every remote source fails. Disabling remote icons prevents network icon requests while previously cached local data remains usable.

### Core features

**Home screen.** Opening Mad Station lands on a purpose-built home page where **AI Hub is the main app**: it is the glowing core in the centre. Full Hub companions sit on the left, any icon-only mini apps sit above the circle, and live widgets stack on the right. Notes & Tasks is available as a clickable widget in the Default homepage's widget rail; it opens the existing Notes workspace. The three registries and engines remain separate. The RAM widget is intended to show total usage, a breakdown bar (main process, AI browsers, GPU, UI & other), a two-minute history line, a memory-reclaim button and the full process list. The current Default-homepage source includes a live system CPU usage meter and a reconciled React mount for the RAM/process monitor. The page carries the Mad Station name and the Settings button. It uses the shared design system (`src/design-tokens.css`), so theme, accent, surface, corner, button, border, shadow, spacing and background choices in Appearance apply to it like every other page; it also honours *Reduce motion*.

The **Main page → Homepage style** setting offers these isolated alternate homepages: Simple, Simple Retro, Retro Complex, 3D Parallax, 3D Parallax Big App, Galaxy, Parallax Jungle, Claymorphism, and Glass. Animated homepages load only when selected and unload when inactive.

**Alternate homepage styles.** Settings → Appearance → Main page offers Default, Simple, Simple Retro, Retro Complex, 3D Parallax, 3D Parallax Big App, Galaxy, Parallax Jungle, Claymorphism, and Glass. Each alternate homepage is hosted in its own local, strict-CSP iframe and uses a narrow message bridge for app launches, global Settings, shared Appearance, AI Hub counts, and live CPU/RAM telemetry. Each homepage owns its own saved arrangement so switching styles does not overwrite another page’s preferences. Older saved selections for removed homepage styles automatically fall back to Simple.

**Theme ZIP import/export.** Open Settings → Developer → **Theme ZIP Importer** to scan and add themes from a ZIP as separate custom themes. ZIP imports cannot replace the built-in homepage slots. For built-in restyling, the authoritative files are under `src/home-*.html` and their referenced source CSS, visual JavaScript, and local assets; edit those files in the project and rebuild/reinstall the application. **Theme Design Exporter** creates a shareable ZIP artifact from the latest canonical source files; that ZIP is not the source of truth and should not be edited as a substitute for project source. Imported custom themes live in the app's user-data `theme-imports/` directory and can be removed from Settings → Developer → Manage Themes. Older `override-*` registrations are ignored so they cannot shadow built-in source themes. ZIPs exported by Mad Station include `madstation-theme-pack.json` and `THEME_INTEGRATION.md`; the integration contract is also bundled in `src/THEME_INTEGRATION.md`. Third-party ZIPs may omit their own instruction file, so the importer warns and uses Mad Station's built-in action mappings instead of trusting supplied bridge scripts. Developer Options is password-protected, with salted scrypt storage for the password. Project/file-command, Workspace App Builder, Design System, AI Prompt Recipes, and guardrails cards remain in the source but are not rendered in Developer Settings.

**Providers and accounts.** Add any HTTPS provider, add as many accounts as needed, rename/delete/reset accounts, and keep each account in its own persistent browser session.

**Fast switching.** Give accounts unique keyboard shortcuts. Built-in navigation shortcuts work while an AI website has focus, and `Ctrl+K` focuses the account search box.

**Browser toolbar.** Back, Forward, Reload/Stop, secure address display, account identity, and Open in browser sit above the active website.

**Settings.** Ten focused pages, grouped by purpose and all searchable in a full-window settings experience: **Providers**, **Accounts**, **Keybinds**, **Appearance**, **Startup**, **Lock**, **Privacy**, **Websites**, **About**, and **Data**. Provider and account order can be customized with drag-and-drop or move buttons; the same order is used by both the List and Icon grid sidebar styles.

**Reordering providers.** Drag the provider tiles at the top of the sidebar to rearrange them (a bar shows where the tile will land). Right-click a tile for Move earlier / Move later, or focus a tile and press `Ctrl+Shift+←` / `Ctrl+Shift+→`. In **Settings → Providers** you can drag rows or use the ↑/↓ buttons. Both places edit the same saved order, which is also used by the provider dropdown and the account lists.

**Reordering accounts.** Drag the account cards in the sidebar list to rearrange them (up/down in the list, left/right in the compact grid). **Settings → Accounts** also supports dragging rows or the ↑/↓ buttons, and both edit the same saved account order.

**Model Arena (AI Lab).** The Arena has its own providers and accounts, completely separate from AI Hub: add as many accounts as you like for every provider in **AI Lab → Arena Accounts**, and each one keeps its own saved login (`persist:arena-<id>`). In **Model Arena**, pick one account for the left browser and another for the right, type a question once, and press **Ask both** (Ctrl+Enter): the text is typed into both chat boxes and sent with Enter. Read the answers in the browsers themselves, vote for the one you prefer, and watch the **Leaderboard** rank models (providers) and individual accounts. Arena accounts are stored in `arena-accounts.json` in the app data folder; deleting an Arena account erases only its Arena session.

**Image Hub.** The Image Hub workspace collects image-generation, editing and upscaling tools in one searchable directory. It includes category filters, favorites, custom HTTPS tool entries, quick-launch actions and workspace-only preferences. Custom tools, favorites and preferences are stored locally in the renderer. Selecting an image tool opens its site in a hardened native `WebContentsView` with its own persistent `persist:image-hub-<id>` session, separate from AI Hub, Model Arena, Video Hub, and other Image Hub accounts. Image Hub requires HTTPS and follows the current browser navigation/security settings.

**Video Hub.** The Video Hub workspace keeps AI video-generator accounts in one place, with a persistent embedded browser, account labels, account switching, and per-account **Reset login** and **Delete** actions. It starts with **Higgsfield**, **PixVerse**, **Hailuo AI**, **Vidu AI**, and **Kling AI**, and supports custom HTTPS video sites. Every account has its own `persist:video-hub-<id>` Chromium partition; cookies, local/site storage, service workers and pop-up windows remain with that account and are not shared with AI Hub, Model Arena, or another Video Hub account. Account metadata lives in `video-hub-accounts.json`; provider passwords/cookies are not saved in that JSON. Resetting or deleting an account clears only its isolated session, while the existing Security → clear-cache/sign-out-on-exit choices also apply to Video Hub. The site list is a convenience, not a guarantee of any credit amount: free allowances, daily resets and regional availability change. Video Hub does not automate signups or bypass provider limits, and you should follow each site's terms.

**Clipboard.** The Clipboard workspace is an explicit-save local history: users paste or type text into the composer and choose Save. It supports link/code/text classification, pinning, search/filter/sort, editing and one-click copy/delete; Clear all asks for confirmation when enabled. It does not silently read or poll the Windows system clipboard. Retention, trimming, confirmation and maximum saved-clip length are configurable. Clipboard history persists locally through the renderer’s IndexedDB/local-storage compatibility layer.

**Downloads.** Files downloaded by any account are saved to your Windows Downloads folder by default, or to a folder you choose in **Settings → Websites → Downloads**. Existing files are never overwritten (`report (1).pdf`), and you can switch on **Ask where to save each file** for a Save As window every time. A **Downloads** button appears at the bottom of the sidebar once something has been downloaded; its panel shows progress and lets you pause, resume, cancel, open, show in folder or remove an entry. Programs and scripts (`.exe`, `.msi`, `.bat`, `.ps1`, `.js`, macro documents and similar) always ask where to save and can never be launched from Mad Station, only revealed in their folder. The list keeps only file names and the site host (never the full link, which can contain one-time tokens), lives in memory, and is empty again after a restart.

**RAM monitor.** AI Lab, AI Hub, Clipboard and Main include a live working-set monitor that breaks Mad Station's memory down into the main process, AI Hub browser sessions, Arena browsers, UI, GPU process, and an approximate retained clipboard-text buffer. Each monitor can open a full live process-details view showing every measured Electron process, including services such as GPU and Video Capture, with its type, PID and RAM usage. AI Hub browser views are workspace-scoped: leaving AI Hub closes all live AI Hub browser views immediately, while persistent cookies and site data stay on disk so returning does not sign you out. AI Hub browser views are strictly workspace-scoped: zero AI Hub web renderers are kept alive outside AI Hub, and locking the app closes browser renderers without cancelling downloads. Arena browser views are suspended when you leave browser comparison, API, or Local AI mode, and Clipboard never polls the operating-system clipboard; clips are saved only through explicit user input.

**Security and privacy.** Optional app lock with scrypt password hashing; cache/data controls; HTTPS and popup/navigation protections; per-site camera, microphone, notifications, clipboard-read, and fullscreen permissions; microphone access is denied by default and can be enabled in AI Hub → Settings → Website rules; screenshot protection; spell-check control; developer-tools control; and Electron security fuses in packaged builds.

## Historical migration checkpoint

The current source/architecture index is [`docs/architecture/CORE_SYSTEM.md`](docs/architecture/CORE_SYSTEM.md). Earlier migration checkpoints are historical evidence only; do not treat them as the current release checklist.

## Release history

The 1.4.0 baseline is retained for historical context; the current release target is **Mad Station 1.6.3**. Earlier internal release notes are retained in source control rather than duplicated in the shipped README.

## Adding apps to the home screen

For any code task, start with `docs/architecture/CORE_SYSTEM.md`; it routes you to the correct subsystem and copy-paste recipe. Hub companions, icon-only mini apps, and widgets have independent registries: `src/home-app-list.js`, `src/home-mini-list.js`, and `src/home-widget-list.js` respectively. 
Companion card sizing and overflow are automatic in `src/home-apps.js` (tunable through `MadHomeApps.config`):

- a few companions: full cards, shrinking as the list grows
- more companions: compact two-column tiles
- more than fit: the rest move into a **More apps** collection, itself wired to the circle, which opens a panel listing them

Shared animated signal lines and cross-system layout coordination live in `src/home-core-system.js`; mini apps and widgets keep their own independent engines and registries.


## Release packaging note

The release archive contains only runtime/source assets and tests required for verification. Development patch scripts and UI preview artifacts are not shipped.


## Current feature set

The current build includes workspace organization (pinned accounts, groups/tags and recent accounts), per-account settings, provider metadata, backup/restore, account import/export, diagnostics, accessibility controls, notifications, temporary sessions, and configurable update checking.


### Clipboard UI refinement
The Clipboard workspace now uses a centered app header, a consistent settings gear, a grouped Clipboard-only settings dialog, and a fixed centered Save Clip action.


**Pre-release hardening (1.4.0 baseline).** 1.4.0 includes secure OS-backed storage for AI Lab API credentials, AI Lab file recovery/backups, IndexedDB-backed clipboard history with an aggregate cap, semantic update-version comparison, provider authentication-domain enforcement, lazy bounded local icon caching, accessibility labels on key controls, and workspace/lock-scoped browser lifecycle enforcement. The release also includes privacy-safe diagnostics export, provider reachability checks, live session-state reporting, and a manual memory-reclaim action that never clears login storage or cancels downloads.


### 1.4.0 fix
AI Hub launcher entry now synchronizes the main-process workspace before activating the saved account, so Models/Accounts clicks work immediately after entering AI Hub.



### Icon rendering stability
AI Hub and Model Arena preserve already-decoded provider/account icons across model, provider, account, filter, and state changes. Unchanged icons are not recreated or reloaded on every interaction; the icon cache is initialized/warmed as needed when a workspace is opened.



## v1.5.3 release preparation

*Historical release-preparation notes; the current application target is v1.6.3.*

- Version metadata is synchronized to `1.5.3` across `package.json`, `VERSION`, and the About screen.
- The 1.4.0 hardening notes above describe the inherited baseline, not newly introduced 1.5.3 features.
- Run `npm test` and `npm run dist` on a Windows machine before publishing. A successful source test run does not substitute for a native NSIS installer smoke test.

### Page design (pages.css)
Every page now shares the home screen's "night station" look. `src/pages.css` loads after `home.css` and gives **Notes & Tasks (Clips, Notes, To-do list), Prompt Studio, AI Playground, AI Hub and Settings** the same glowing backdrop, gradient icon tiles, pill buttons, accent-edge cards, uppercase labels and brand header. It is built from the same theme variables as Home, so Appearance settings (theme, accent, background, surface, corners, buttons, borders, shadows, spacing, hover and motion) apply to every page. To change shared visual tokens, edit `src/design-tokens.css`; use `src/design-kit.css` for reusable component rules. `src/pages.css` is legacy screen styling, not the shared token source.


## Design system

**Homepage theme documentation:** the ten selectable designs—Simple, Simple Retro, Retro Complex, 3D Parallax, 3D Parallax Big App, Galaxy, Parallax Jungle, Claymorphism, Glass, and Isometric World—each have a dedicated HTML kit. Default/legacy also has a diagnostic kit, but is developer-only and not a normal picker option. Start at [`docs/design/homepage-theme-gallery.html`](docs/design/homepage-theme-gallery.html) or use the source/test index in [`docs/design/HOMEPAGE_THEME_CATALOG.md`](docs/design/HOMEPAGE_THEME_CATALOG.md). The shared component and token laboratory is [`docs/design-kit-preview.html`](docs/design-kit-preview.html).

All screens share one design system driven by **Settings → Appearance**: tokens in `src/design-tokens.css`, components in `src/design-kit.css`, rules and recipes in `docs/design/DESIGN_SYSTEM.md`, and a shared component/token preview in `docs/design-kit-preview.html`, and one dedicated HTML kit per selectable homepage style in `docs/design/homepage-theme-gallery.html`. To build a new app or restyle an old section, follow `docs/design/DESIGN_SYSTEM.md` (AI assistants read `AGENTS.md` / `CLAUDE.md`, which point to it). `npm test` guards it.

## Startup troubleshooting

**Start here for checks or startup trouble:** double-click `+ Diagnose Startup.cmd` in the project root. It syntax-checks the PowerShell workflow, verifies the pinned Node.js/npm versions and lockfile metadata, restores dependencies with `npm ci` only if needed, checks the installed tree, runs TypeScript tests and the full regression suite, writes both npm audit reports, builds the app, explicitly runs `install-electron --no`, verifies `electron.exe` and its version, and then launches Mad Station. During the interactive run it records privacy-safe startup event names and reports whether the main process started, app-ready initialization completed, the main window was created, the main UI and toolbar renderers loaded, renderer failures occurred, and Electron exited cleanly after you close the app. Keep the console open until you close Mad Station to finish the diagnosis. The timestamped transcript and audit JSON reports are saved under `%LOCALAPPDATA%\MadStation\diagnostics` (TEMP fallback); the app also writes `startup-diagnostics.log` under its user-data folder. A fresh registry-backed audit on the release machine is still required before declaring dependency security clean. Share the final summary and log when troubleshooting. AI coding agents should tell you to run this launcher first instead of pasting a series of individual npm commands.


## Historical migration continuation — v32

The Image Hub visible workspace UI and Notes-specific UI are React-owned: Image Hub includes sidebar chrome/search, provider/account lists, discovery/forms, tabs, browser toolbar/status, settings, and empty/loading/error states; Notes includes its hero/count, search/list header, composer, note cards, and settings. Storage, mutations, navigation policy and native `WebContentsView`/session lifecycle remain host-owned. **Historical verification note:** an earlier migration workspace reported 471 tests passing through direct Node execution after temporary TypeScript transpilation; that bypassed the canonical pretest and did not establish production bundle success. Its environment blockers and test count are not current verification for this archive. Use `docs/architecture/ARCHITECTURE.md` and `docs/architecture/CORE_SYSTEM.md` for the available source map, and rerun canonical checks in the current configured environment.

## Historical migration continuation — v35 WebContentsView/session lifecycle

The main process delegates persistent AI Hub/Arena/Video Hub/Image Hub session partition ownership, one-time configuration, Video Hub proxy readiness and session data-clearing order to `src/main/session-lifecycle-runtime.ts`. Browser-view attachment order is shared in `src/main/web-contents-view-attachment-runtime.ts`, and bounds/visibility policy is in `src/main/browser-view-layout-runtime.ts`. The Electron host continues to own view construction/security listeners, account/workspace state, IPC authorization, native operations and close/reclamation. Earlier migration notes reported a 523/523 injected lifecycle-suite result, but the detailed report they referenced is not included in this archive; treat that count as historical rather than evidence for the current checkout. Live Electron and Windows release verification remain separate gates.


**Historical v35 verification note (not rerun for this documentation update):** the old note recorded 523/523 listed tests, 85 JavaScript-family syntax checks and 76 TypeScript/TSX syntax checks, plus strict standalone typechecking for three lifecycle modules. The original detailed migration report is not included in this source archive. These numbers are historical only; production build, live Electron startup and Windows installer require current, separate evidence.

## Historical migration security checkpoint — v37

The current continuation adds `docs/security/SECURITY_AUDIT.md`, documenting the first-pass source security review, the specific remediations and tests, and the live Electron/Windows checks that remain open. This report intentionally separates tested source behavior from production build, runtime security and installer evidence; passing regression tests does not by itself mean the release is verified.

## Historical Windows validation — v42 (16 October 2026)

The owner confirmed that lockfile generation, `npm ci`, `npm run env:check`, `npm run typecheck`, and `npm run build` passed on Windows using Node `22.16.0` and npm `10.9.2`. The canonical test run had one stale test assertion expecting Vite `7.1.12` after the package pin changed to `7.3.7`; the source test is corrected in the follow-up patch and needs a post-fix `npm test` rerun. `npm audit` reports 8 moderate transitive `sprintf-js` findings under `electron-builder`; the audit is still open. Keep the generated lockfile from the working copy in the repository/archive.

## Theme management (Rev21)

Theme selection and theme administration are separate. **Settings → Appearance** is for previewing and selecting a homepage theme; it no longer contains per-theme options or delete/restore actions. Use **Settings → Developer → Manage Themes** for installed-theme maintenance.

- **Refresh themes** runs the same live source scanner used by Theme Design Exporter. It detects new theme pages, content/dependency changes, and pages removed since the previous scan.
- Imported custom themes can be removed from Manage Themes. ZIP imports cannot replace built-in themes, and there is no restore-package action; built-in themes are maintained only in the project source under `src/home-*.html` and their source dependencies.
- If an imported theme folder is deleted outside Mad Station, the next explicit Developer scan reports the missing theme and prunes its stale registry entry so Quick Access and Appearance can reflect the current files. Remaining theme files are not deleted by this cleanup.
- Scan fingerprints are stored in the renderer's local storage to compare the current catalogue to the previous scan. A first scan establishes a baseline; later scans report new, changed, and removed theme IDs.

## Rev22 — Retro Complex refinement

Retro Complex now has an analog-style compact Quick Access panel with no internal scrollbar, a functional monitor power toggle, a parallax room/window background, a smaller CRT/main-app presentation, and a wooden desk surface that houses the floppy drive and detached system-monitor module. Floppy-disk star controls and numeric app-launch shortcuts are removed from this theme. Main-app visual animations use continuous timing to reduce loop snapping.
