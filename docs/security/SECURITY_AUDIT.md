# Security audit and remediation checkpoint — v62 (IPC hardening; PSL/runtime open)

> **Current workflow status — 2026-10-21:** check [GitHub Actions](https://github.com/MadLandYT/Mad-Station/actions) for the current automated checks. The dated v62/v66/v67 entries and historical test counts below describe prior checkpoints, not a fresh verification of the current checkout. CI results are point-in-time evidence, not an independent penetration test or blanket certification of all Electron security scenarios.


## Phase 4 theme-import hardening — historical intermediate source checkpoint (2026-10-21)

- `src/main/theme-pack-import.ts` now scans quoted and unquoted HTML attributes at the import boundary. The importer rejects remote/custom-scheme/absolute and missing script/resource references, strips event-handler and `srcdoc` attributes, removes meta refresh, neutralizes unsafe link destinations, and inserts `IMPORTED_THEME_CSP` into each imported HTML document. That policy denies network connections, nested frames, plugins, workers, forms, and unspecified sources while permitting the local visual assets/scripts required by the imported theme format.
- The ZIP reader now validates directory paths before skipping directory entries; rejects Unix symbolic links and unsupported special-file modes; compares local-header flags/method/name to their central-directory record; and rejects compressed entry data that overlaps the central directory. Existing file/archive size, entry-count, expansion-ratio, duplicate-name, decompression, and CRC checks remain.
- New regression coverage is in `tests/main-theme-pack-import.test.js`. The focused security batch passed 59/59; all 138 package-listed test files passed 982/982 when invoked directly with `node --test`. Main TypeScript transpilation emitted with no diagnostics, but this is not a semantic type check.
- **Status at this intermediate checkpoint only:** `npm run env:check` and `npm run build` stopped because `node_modules` was missing in that review workspace, global semantic TypeScript checking could not find `@types/node`, and `npm audit --json` failed because registry DNS resolution returned `EAI_AGAIN`. Those failures describe that separate review workspace and do not establish the result for the current GitHub checkout. Use the current [GitHub Actions workflow](https://github.com/MadLandYT/Mad-Station/actions) for automated results. CI results are point-in-time evidence and do not cover every live Electron security scenario.
- This is a source-level security checkpoint, not an independent penetration test or certification. Continue with the live visual/accessibility audit and runtime-specific security checks when the GUI environment is available.

> **Current-source revalidation — 2026-10-21:** The generated `src/main/public-suffix-list.ts` identifies upstream version `2026-10-16_09-29-46_UTC`, commit `91b4bd846240a84afb33695d5a51adcbc4cfd9ca`, with 10,399 rules. This current source metadata supersedes older status statements below that say the bundled source still contains the OpenJDK 2026-08 snapshot. The historical dated entries are retained as history. The source header alone is not a live security certification; rerun the PSL, network-security, and account-session tests and perform Electron/Windows validation before release.


> **Historical v62 checkpoint — current app target v1.6.3:** This document preserves a prior checkpoint and cumulative history, including outdated PSL/audit states. Do not use its older statuses as current release facts. Use [`CORE_SYSTEM.md`](../architecture/CORE_SYSTEM.md) for current source ownership, [`MODULE_AUDIT.md`](../architecture/MODULE_AUDIT.md) for the available module review, and [`DEPENDENCY_AUDIT.md`](DEPENDENCY_AUDIT.md) for dependency-risk notes. This document preserves dated historical findings; do not treat older checkpoints as current release status.


## Diagnose Startup 2 current dependency mitigation — 17 October 2026

The current source archive replaces the optional build-tool `sprintf-js` copy with a locally maintained, SHA-512-pinned build of upstream 1.1.3 that clamps out-of-range numeric precision before calling `toFixed`, `toExponential`, or `toPrecision`. The focused patch tests pass in this workspace. The vendored build is labeled `1.1.4+madstation.1`; it is not an official upstream release.

The GitHub Advisory Database still lists GHSA-hp3w-g68c-fv3c / CVE-2026-97058 for `sprintf-js <=1.1.3` with no official patched version ([advisory](https://github.com/advisories/ghsa-hp3w-g68c-fv3c)), while upstream maintainers have publicly disputed the report/CVE classification ([upstream discussion](https://github.com/alexei/sprintf.js/issues/237)). This project adopts the clamp as a narrow defensive mitigation and does not treat the advisory dispute as an official resolution. A fresh registry-backed audit, complete Windows tests/build, package inspection and installer launch are not verified in this workspace; the single `+ Diagnose Startup.cmd` must be rerun on a connected Windows environment before release clearance.

## v62 current security status — partial closure only

- Added `isControlMode`, `isStringWithinLength` and `isBooleanValue` in `src/main/input-validation.ts`, with behavior-level unit tests. Main IPC applies them to `set-control-mode`, `write-system-clipboard` (type and 50,000-character bound), and `set-sidebar-hidden`. Invalid values now return an error before state mutation.
- The central `handle()` trusted sender/main-frame/local-file, lock-state and payload gate remains in use; workspace-owned commands still use their scoped handler wrappers. Existing sandbox, context isolation, disabled Node integration, popup/navigation/redirect controls and host-managed browser/session authority are unchanged.
- `../architecture/MODULE_AUDIT.md` classifies the current main-process functions and documents the boundaries that still require runtime verification. This closes the static source-classification work for v62, not live behavioral security acceptance.
- **Still open as of v62:** official PSL data refresh (this environment could not retrieve the complete authoritative file), fresh registry audit/tree/package inclusion evidence for `sprintf-js@1.1.3`, and live Electron adversarial acceptance. GitHub's current advisory GHSA-hp3w-g68c-fv3c / CVE-2026-97058 lists versions `<=1.1.3` as affected and no patched version ([advisory](https://github.com/advisories/ghsa-hp3w-g68c-fv3c)). The lockfile marks the package dev/optional; do not conclude runtime exposure is absent without package/tree evidence.
- This is not an independent penetration test. No dependency versions or lockfile contents were changed and no full Electron runtime test was run in this workspace.

**Baseline:** Mad Station v1.5.4, current source continuation v60  
**Assessment date:** 16 October 2026  
**Disposition:** UI ownership and fallback-safety improvements are integrated, but the exact PSL source, dependency advisory disposition, and live Electron security gates remain open. This source review is not an independent penetration test and has not been independently validated by a third party.

## Historical v60 status (superseded by the v62 status above)

- **App lock/unlock form:** React owns steady-state presentation and local password input state. Password is sent through a narrow host bridge; lock-state broadcasts contain only a boolean. Host checks lock state/password bounds and owns unlock/reset, confirmation and trusted API calls.
- **Video Hub browser visibility and recovery:** React owns the placeholder/status UI but hides it only when the main process reports that a native browser view is attached. The host sends independent `hasBrowserView`, loading, and bounded error status; a visible retry action requests recreation for the selected account. Session, navigation, URL validation and native view ownership remain in the host/main process. The same main-owned `WebContentsView`/isolated-session boundary is used for Image Hub. Do not use DOM `<webview>` elements: `webviewTag` is disabled and `will-attach-webview` is cancelled globally.
- **Current source checks:** the selected v60 adjacent-renderer batch passed 76/76, and focused lock-screen/Video Hub state/workspace-chrome tests passed 13/13. TSX transpilation is syntax-only; these are not a security penetration test, semantic typecheck, production build or live Electron test.
- **Inventory:** 25 HTML insertion sites and 243 listener registrations remain. They are classification targets rather than a vulnerability count; startup fallbacks and native lifecycle listeners can be intentional.
- **PSL remains open:** `src/main/public-suffix-list.ts` identifies `local-openjdk-2026-08-19`, not verified complete official bytes. The updater and direct download failed in this workspace, and no partial rules were inserted. The current official source advertises VERSION `2026-10-07_07-28-19_UTC` / commit `3929462652695bad04f0a27afb600974014a3c8b` ([official endpoint](https://publicsuffix.org/list/public_suffix_list.dat)).
- **Dependency advisory remains open:** [GHSA-hp3w-g68c-fv3c / CVE-2026-97058](https://github.com/advisories/ghsa-hp3w-g68c-fv3c) currently lists `sprintf-js <=1.1.3` affected, with no patched version. Lockfile inspection puts `sprintf-js@1.1.3` in an optional dev/build-tool chain, but the fresh registry-backed audit, installed-tree/package inclusion check and written risk disposition remain necessary.
- **Owner-side runtime evidence:** the owner confirmed the previous Windows project opened and ran. The owner-reported `Root` import typecheck error was fixed in v61; post-v61 typecheck/runtime verification remains pending; absence of assistant-side dependencies/build outputs is not a defect report about the owner checkout.

## Security exit criteria

1. Refresh exact official PSL bytes from a connected checkout, review the entire source/version/license/provenance diff, and pass PSL/account-session/network security tests.
2. Capture `npm audit --json`, `npm explain sprintf-js`, and `npm ls sprintf-js --all`; check package inclusion/runtime exposure and either remediate with a safe upstream chain or record a time-bounded, owner-approved risk disposition. Do not force a breaking packager downgrade.
3. Complete adversarial Electron tests for trusted IPC sender/frame/lock/payload checks; account sessions, permission-origin matrices, redirects/popups/navigation; downloads and managed-file path/symlink behavior; and locked-state boundary cases.
4. Record post-v61 canonical typecheck/test/build/audit and Windows runtime acceptance. The owner's earlier working baseline is accepted but does not verify this increment.

## v45 continuation environment checkpoint — 16 October 2026

The Notifications and Downloads list rendering slices now have focused source-contract coverage, but the current workspace could not complete `npm ci`; the environment preflight reports 16 missing package/executable blockers. `npm run update:psl` failed with `fetch failed`, and `npm audit` failed on registry DNS (`EAI_AGAIN`). Accordingly, PSL freshness, current dependency advisories, canonical build/test verification, and live Electron/Windows controls remain open. The focused six-suite diagnostic result (31/31) is source-level regression evidence only, not a security certification or runtime acceptance.

## Scope reviewed

- IPC sender/main-frame/local-document trust, lock-state gates, safe payloads, and workspace ownership.
- Account-specific Electron sessions: navigation, redirects, popups, permissions, downloads, and external/OAuth handoff.
- AI Lab credential binding, endpoint validation, request/response bounds, redirect handling, and loopback/local-model support.
- Main-process outbound requests for icon caching, provider diagnostics/verification, and update feeds.
- Provider authentication-domain suffix validation, including wildcard/exception/private suffix handling.
- Managed background-file containment, symlink handling, configuration normalization, and Developer file allowlists.
- Security-test/report and third-party-license packaging contracts.

## Remediations integrated in v38

### IPC sender, lock, and workspace authorization

- The common `handle()` wrapper remains the mandatory first gate: trusted control WebContents/main frame/local renderer identity, safe payload validation, and locked-state restrictions except for the explicit allowlist.
- Workspace-specific commands use `handleForWorkspace()` / `handleForWorkspaces()` after those shared gates. AI Hub navigation/account operations, AI Lab credential/data/API operations, Model Arena, Instruction Forge, and Video Hub operations are scoped to their permitted workspaces. Shared model reads remain restricted to AI Lab and Instruction Forge.
- Account-prompt and Arena prompt automation validate the active workspace before operating on account/session state. These remain source-level guarantees with regression coverage, not live IPC spoofing-test results.

### Credentials and AI Lab requests

- Secure API credentials are bound to the saved provider, endpoint, and model. Missing/legacy/mismatched bindings fail closed and require credential re-entry.
- Remote AI endpoints require HTTPS and reject credentials in URLs, unsupported components, and overlong input. Plain HTTP is restricted to explicitly supported loopback/local-model paths; the public-only probe policy below does not disable AI Lab's separate user-configured local endpoint support.
- Redirects are rejected on authorization-bearing API requests. Prompt/token/temperature values and response size are bounded.

### Complete Public Suffix List algorithm and domain policy

- `src/main/public-suffix-list.ts` includes exact, wildcard, and exception rules, including the PSL PRIVATE section. `normalizeAuthDomain()` now rejects public suffixes such as `co.uk` and `github.io` rather than relying on a short hard-coded suffix denylist.
- Built-in Video Hub providers retain only source-reviewed cross-domain roots from their canonical provider presets; changing a stored built-in URL does not inherit the preset's unrelated trusted roots. Custom providers can explicitly define a concrete multi-label authentication host, but cannot use a public suffix as a trust root.
- The bundled snapshot now uses 9,762 IDNA-normalized rules extracted from the locally available OpenJDK 21.0.12.1 `public_suffix_list.dat` bundle installed 2026-08-19, replacing the older 2024-08-29 Perl snapshot. It includes ICANN + PRIVATE rules, 168 wildcard rules, and 8 exception rules. The authoritative upstream page inspected during this work advertises `VERSION: 2026-10-07_07-28-19_UTC` and commit `3929462652695bad04f0a27afb600974014a3c8b`; DNS resolution for `publicsuffix.org` failed, so the exact October source data could not be downloaded. Do not claim the local August data is the exact current official snapshot.
- The bundled PSL data is governed by MPL-2.0. `docs/licenses/THIRD_PARTY_NOTICES.md`, `docs/licenses/Public-Suffix-List-Notice.md`, and `docs/licenses/MPL-2.0.txt` record attribution/license terms and are included in the Developer resources.

### Public-only main-process probes and DNS pinning

- Provider reachability checks, provider diagnostics, update-feed requests, and remote icon fetching reject local, private, link-local, reserved, documentation, multicast and other non-global destinations. If a DNS lookup returns a mix of public and private answers, the hostname is rejected rather than choosing only the public answer.
- The resolved address is pinned into the HTTPS request's DNS callback so the client does not perform a second hostname lookup after validation. The request keeps the original URL hostname for Host/SNI/certificate validation. Redirects are not followed by provider/update checks; icon-cache redirects are revalidated and constrained at every hop.
- These main-process convenience probes use a public-internet-only policy. This deliberately disallows verifying custom providers on private/LAN addresses through those probe actions. This decision is separate from the explicit loopback/local-model flow in AI Lab. Environments requiring a corporate outbound proxy need a reviewed proxy-aware adapter that preserves destination pinning; these probes currently use direct Node HTTPS transport.
- Requests have timeouts and bounded feed/icon response sizes. DNS pinning and IP-range guards have unit regression tests; there has been no live external-network penetration test.

### Account sessions, permissions, and navigation

- Permission callbacks validate requesting, top-level, and embedding origins against the allowed account/site hosts. Unknown permission types and hardware-device/clipboard permissions default to deny.
- Navigation, redirect and popup policy continues to use the account-session security module; external destinations accept only safe HTTP(S) URLs and reject embedded credentials. Google OAuth is not resumed mid-transaction in an embedded Google Accounts view; the app restarts from the provider's HTTPS entry URL in the system browser.
- Download events remain routed through the account session and existing download manager. Actual Chromium redirect/download behavior, popup teardown and OAuth flows still require a real Electron/Windows pass.

### Filesystem and configuration boundaries

- Developer-file operations require exact relative-path allowlist entries and containment under the approved developer source root. Absolute paths and traversal are rejected.
- Managed custom backgrounds must resolve to an app-owned direct child matching the generated filename shape; `lstat` rejects symlink targets and non-files. Config loads, patches and restore operations normalize/remove invalid background references.
- The license and PSL data notices are now packaged, allowlisted and covered by a security-contract regression test.

## Verification evidence

- v39 verification: **668/668 package-listed tests passed across 90 test files**. Direct Node execution after temporary TypeScript transpilation bypasses the normal npm pretest and is not a production-bundle test.
- Focused security/network/domain tests passed. The final Video Hub allowlist regression confirms only canonical built-in roots are preserved and public suffixes are rejected.
- **104/104 JavaScript-family files** passed `node --check`; **91/91 TypeScript/TSX files** passed syntax transpilation. All 54 main-process modules plus shared TypeScript modules passed standalone strict checking with `tsc --noEmit --strict`. `package.json`, `tsconfig.json`, and `tsconfig.electron.json` parse, and all **300** static renderer HTML IDs are unique.
- The report and notices are covered by package/allowlist contract tests. The ZIP integrity and packaged file inventory are checked before delivery.
- The official PSL endpoint was inspected and advertised `2026-10-07_07-28-19_UTC`; raw retrieval failed because DNS resolution is unavailable. The project now contains `scripts/update-public-suffix-list.mjs` and the `npm run update:psl` command to download/validate the official source and update provenance on a network-enabled host. The updater/parser is covered by tests but could not perform a live upstream refresh here.

## Residual risks and unverified areas

1. **Refresh the exact upstream PSL data before release.** The bundled snapshot is now from the local OpenJDK data installed 2026-08-19, but is not proven byte-for-byte current with upstream 2026-10-07. Run `npm run update:psl` in a network-enabled environment, check the recorded VERSION/COMMIT and rerun the PSL/auth-domain tests.
2. **No live Electron security test has run in this environment.** Permission callbacks, actual redirects, popup creation/teardown, proxy transitions, partition separation, stale child-window callbacks and Windows path semantics require smoke/integration tests on the packaged app.
3. **The normal production toolchain remains blocked by missing dependencies.** `npm test` pretest and the main-module bundle need `esbuild`; full project semantic typecheck needs `@types/node` and `vite/client`. Standalone strict checks and temporary test transpilation are narrower evidence.
4. **Download and OAuth end-to-end behavior remains unverified.** Exercise redirect handling, destination containment, filename sanitization, partial-file cleanup, per-account attribution, Google OAuth fallback and lock/unlock session cleanup with real Chromium/WebContents on Windows.
5. **Provider diagnostics/verification intentionally reject private/LAN IPs.** This is the selected policy for main-process convenience probes. If a product requirement calls for LAN provider verification, it must be introduced as an explicit, separately authorized policy—not by weakening the public-IP guard. AI Lab's separately configured local-model endpoint is unaffected by this probe restriction.
6. **Outbound proxy compatibility needs an explicit release test.** The pinned provider/update probe transport uses direct Node HTTPS and does not automatically use Electron's proxy configuration. If proxy-based deployments are supported, implement and test a proxy-aware transport that keeps destination validation intact.
7. This is not an external penetration test. A separate security reviewer should validate the threat model and test the packaged app before release.

## Exit criteria for the security/release phase

- Fetch the current official PSL snapshot into the project, record its upstream version/commit and refresh the license/notice metadata.
- Restore reproducible dependency installation and run normal `npm test`, both semantic TypeScript projects, and the Vite/preload/main production builds.
- Run Electron/Windows scenarios for IPC authorization, redirects/popups, session partition isolation, downloads, config restore/path containment, lock/unlock, local AI model compatibility, OAuth and update handling.
- Verify network behavior in supported proxy environments, and build/install/upgrade/uninstall the Windows installer with recorded logs.

## Dependency audit follow-up — 2026-10-16

The provided Windows audit identified Vite in a vulnerable version range. The source manifest is updated to exact Vite 7.3.7; official Vite advisories list 7.3.7 as patched for the October 2026 advisories (see https://github.com/vitejs/vite/security/advisories/GHSA-9jrq-w75r-8gcw and https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22). A new lockfile must be generated and `npm audit` rerun before claiming the high finding is closed. The separate `sprintf-js` advisory has no patched upstream release as of this review (https://github.com/advisories/GHSA-hp3w-g68c-fv3c); it is reached by the electron-builder build-tool dependency chain. npm’s suggested forced resolution downgrades electron-builder to 26.5.0; that change is intentionally not applied without a clean installer regression test.

## Updated dependency/build evidence — Windows v42 (16 October 2026)

The owner supplied Windows logs confirming `npm ci`, project typecheck, and the production renderer/preload/main-module build passed using Node `22.16.0` / npm `10.9.2`. One of 669 tests failed solely because a release-contract assertion still expected Vite `7.1.12` while the manifest pins `7.3.7`; the assertion is corrected in the follow-up patch and requires a canonical test rerun.

The updated `npm audit` shows 8 moderate findings through `sprintf-js` in the `electron-builder` tooling dependency chain. The advisory lists no patched `sprintf-js` release. This remains an open dependency-chain finding; a forced downgrade of `electron-builder` is not accepted without a Windows installer validation. The uploaded ZIP did not contain the lockfile that the owner generated locally, so ensure the reviewed lockfile is committed before treating future clean archives as reproducible.


## v46 current continuation checkpoint — 16 October 2026

Model Arena management/scoreboard and Prompt Studio account/status presentation are now React-owned; account/provider eligibility, state changes and trusted browser operations remain in the renderer host and existing protected paths. This is an ownership/presentation change, not a new security certification. Selected source/security tests passed 36/36; direct package-listed tests reported 687/687 after temporary TypeScript transpilation, which bypasses canonical npm pretest/build. The environment gate currently has one blocker (`node_modules` missing). Exact official PSL refresh, current `npm audit`, canonical typecheck/build/test, live Electron permission/redirect/popup/session/download/proxy testing and Windows installer acceptance remain open. The old 84–88% completion estimate is retired as unweighted and unverified; see `../architecture/MODULE_AUDIT.md`.

## v47 renderer form bridge review (16 October 2026)

The Video Hub Add Account and Add Video Site React forms dispatch only the visible form fields through renderer-local custom events. The receiving renderer handlers verify the field types; account creation also checks that the provider ID is present in the current host view-model before calling the preload API. Main-process controllers remain the actual authority for HTTPS URL normalization, provider/account mutation, persistence and session isolation. The old provider-select fallback now assigns option labels with `textContent` instead of parsing HTML strings. Focused source-contract tests passed within a 42/42 batch; this is not a live Electron security test. Canonical build/runtime verification is still blocked by missing `node_modules`, and the authoritative PSL refresh and Windows Electron matrix remain open.

## v48 persistence ownership review (16 October 2026)

Video Hub JSON file mechanics are isolated in `src/main/json-file-store.ts`; only the trusted main process imports the compiled module. Writes use temporary-file rename, while invalid JSON is quarantined with a timestamp. The extracted primitive does not parse user-controlled paths or make schema/provider decisions; `src/main.js` supplies the fixed store path and `video-hub-controller.ts` retains validation/default policy. Six unit contracts cover atomic writes, corrupt/missing data and write failure. Combined selected source contracts passed 48/48. This is not a live Electron or disk-failure integration test; canonical build and runtime verification remain open.

## Step 2 security/dependency review — 16 October 2026 (latest check)

- The official PSL page currently still advertises version `2026-10-07_07-28-19_UTC`, commit `3929462652695bad04f0a27afb600974014a3c8b`. The local updater/download attempt failed (`fetch failed`), so the application still bundles the separately sourced OpenJDK 2026-08-19 data. Exact PSL synchronization remains open; do not change generated metadata without successfully parsing the official source bytes.
- Current online advisory review reconfirms [GHSA-hp3w-g68c-fv3c / CVE-2026-97058](https://github.com/advisories/ghsa-hp3w-g68c-fv3c): `sprintf-js` `<=1.1.3` is affected and the advisory lists no patched version. The included lockfile reaches it through `electron-builder` → `app-builder-lib` → `@electron/get` → optional `global-agent` → `roarr` → `sprintf-js`. This is a development/packaging dependency path, not a direct runtime dependency, but the finding remains open until a fresh audit and code-path/risk review are recorded.
- A fresh `npm audit --json` could not reach `registry.npmjs.org` (`EAI_AGAIN`), and `npm explain sprintf-js` is not reliable against the workspace's inconsistent `node_modules`. The earlier count of eight moderate findings is historical, not a fresh count. The lockfile is unchanged; no forced downgrade or unreviewed override was applied.
- **Required before security sign-off:** run `npm run update:psl`, `npm audit --json`, and `npm explain sprintf-js` on the network-connected Windows project copy; review the PSL diff and actual audit paths; then rerun PSL/auth-domain tests. Any dependency mitigation needs a clean install, canonical checks, packaging, and Windows installer regression evidence. These environment limitations are not a security pass or penetration-test result.

## v50 AI Hub navigation bridge review — 16 October 2026

The new React navigation surface dispatches bounded actions through `window.MadStationAiHubAccountNavigation`. The host verifies provider IDs before changing filters/opening provider menus/reordering; account IDs before recent-account selection; group values before filtering; and reorder requests require string IDs plus a boolean `after` flag before `computeReorder`/`persistOrder`. Icon URL candidates are filtered by the existing host `isImageIcon` policy, and the component uses JSX text rather than HTML-string rendering. Focused source-contract coverage is included in `tests/renderer-react-ai-hub-account-navigation.test.js`.

This is source-level contract evidence only. It is not a live Electron adversarial test or proof of runtime session isolation. The Step 2 official PSL refresh and registry-backed dependency audit remain open; no supply-chain finding is closed by this renderer slice.



## v51 API model settings ownership boundary (16 October 2026)

The Model Arena API model settings editor is now React-owned for presentation. Its renderer-local snapshot contains only API model identifiers/metadata and boolean credential-status flags; it does not carry raw API key material. Save/clear commands return through a renderer-local action bridge, which validates selected model IDs, field types and field length bounds before using the existing preload APIs for metadata and secure credential operations. The legacy fallback selector now builds option nodes with `textContent`. Six source-contract tests cover the wiring and boundary; the focused API Arena/editor batch passed 13/13. This is source-level evidence only and **does not** close the outstanding official PSL refresh, fresh dependency audit, or live Electron permission/session/network/installer review.


## v52 Prompt Studio settings ownership boundary (16 October 2026)

The Prompt Studio settings React component receives an explicit display snapshot and dispatches preference edits through a renderer-local custom-event bridge. It does not read localStorage or call preload APIs. The host checks selected model IDs against the current model list, retains `forgeSettings` and `saveForgeSettings` as the persistence owner, and synchronizes the existing Prompt Studio selector. The legacy form remains as a startup fallback, with model labels assigned through DOM `textContent` rather than an interpolated HTML string. Six source-contract tests cover wiring, host ownership, model validation and fallback options. The combined recent renderer contract batch passed 22/22. This remains source-level evidence only; it does not close current PSL/dependency audit findings or live Electron behavior/session-security tests.


## v53 AI Playground settings ownership boundary (16 October 2026)

The new React settings component emits a typed renderer-local custom event. The host checks `defaultTab` against `model-arena` / `arena-accounts` / `scoreboard`, checks `defaultArena` against `free-account` / `api` / `local`, and requires booleans for both toggles before updating `aiLabData.settings` and saving through the existing `saveLab()` function. The component does not access storage or preload APIs; the static card remains a fallback until the mount handshake. Six focused source-contract tests exercise the bridge, value validation, wiring and fallback. This does not close PSL/dependency findings or the live Electron security/installer test matrix.


## v54 Model Arena setup forms ownership boundary (16 October 2026)

The Model Arena creation forms now use a React local-state component and a typed custom-event action bridge. The renderer host bounds account/provider names and URL strings, rejects malformed action types, checks that an account's provider ID belongs to the current provider state, then invokes the existing `window.aiHub` preload APIs. The main process remains responsible for domain validation and persistence. The React component does not read storage, call privileged APIs directly or inject HTML. The static form remains as an interim fallback until the mount handshake. Six new source-contract tests cover the wiring and validation boundary, included in the combined 34/34 focused batch. This does not constitute live Electron security testing or close the official PSL/current dependency audit gates.
