# Dependency, Script, and Build Audit — Diagnose Startup 2 continuation

> **Current workflow status — 2026-10-21:** check [GitHub Actions](https://github.com/MadLandYT/Mad-Station/actions) for automated checks on the current checkout. The dated observations below came from separate workspaces and should not be treated as freshly verified results for the current checkout. Keep the local patch and its integrity pin under review; CI results are point-in-time evidence, not an official upstream patch or a permanent security guarantee.


> **Prior assistant-workspace source check — 2026-10-21:** `src/main/public-suffix-list.ts` identifies upstream version `2026-10-16_09-29-46_UTC`, commit `91b4bd846240a84afb33695d5a51adcbc4cfd9ca`, and 10,399 rules. In the separate review workspace used for this earlier assessment, the locked dependency install was absent, so that workspace did not run a fresh audit or production build. That workspace-specific result is not evidence of the current checkout; use the workflow linked above for current automated results. The source metadata by itself is not a security certification.

> **Current revision status — 17 October 2026:** Diagnose Startup 2 now verifies the Electron binary/download, observes main-process/window/renderer startup, and reports the final process exit code. It still treats unreadable or nonzero vulnerability audit results as release failures.

## Current dependency security remediation — 17 October 2026

The Windows log uploaded for the prior revision reported eight moderate findings along the optional packaging/tooling path `electron-builder` → `app-builder-lib` → nested `@electron/get@3.1.0` → `global-agent` → `roarr` → `sprintf-js@1.1.3`. The current source applies a narrow local override to `vendor/sprintf-js-1.1.4+madstation.1.tgz`. The local patch clamps numeric precision for `e`, `f`, and `g` conversions before number formatting. The lockfile pins the tarball with SHA-512 integrity, and both the environment check and the full Diagnose Startup workflow verify that exact pin. The root lock entry is `node_modules/sprintf-js`; no duplicate nested copy is allowed.

This is a **Mad Station-maintained defensive patch**, not an official upstream `sprintf-js` release. GitHub's [GHSA-hp3w-g68c-fv3c / CVE-2026-97058 advisory](https://github.com/advisories/ghsa-hp3w-g68c-fv3c) still lists `sprintf-js <=1.1.3` as affected and no official patched version. The upstream maintainers have publicly disputed the report/CVE classification, so this project records both facts rather than claiming the upstream issue is undisputed. The clamp avoids passing out-of-range precision values into `toFixed`, `toExponential`, and `toPrecision`; the local regression tests cover hostile and ordinary formats.

Local validation in this workspace: package/lock metadata matches, the archive's SHA-512 matches the lockfile, and the three focused mitigation tests pass. A clean `npm ci` could not be completed here because the offline cache lacks a registry tarball (`yocto-queue`); no fresh registry-backed `npm audit --json`, `npm explain sprintf-js`, `npm ls sprintf-js --all`, canonical full-suite Windows run, or installer smoke test is claimed. The uploaded Windows log predates this mitigation and therefore still reflects the prior eight findings. Re-run the single `+ Diagnose Startup.cmd` against this archive on the connected Windows machine; if the current `npm audit` still reports any finding or install/build/tests fail, the release gate must remain failed.

Do not apply a blanket `@electron/get@5.1.0` override: Electron Builder 26 still uses the older Got-based downloader API. Also do not blindly apply `npm audit fix --force`'s suggested `electron-builder@26.5.0` downgrade. Keep the local fork versioned, hash-pinned and covered by regression tests, and re-evaluate it when the GitHub advisory/upstream release status is resolved or a reviewed official patch is available.

Lockfile SHA-256 for this archive: `291fac3f72020636398d33047e29c5cfec276f1224fd24071ef9982e5206871c`. The lockfile is intentionally changed from the supplied project to pin the local patch; this hash identifies this specific archive and is not a substitute for full release verification.

## Historical v62 dependency disposition (prior checkpoint)

No dependency version or lockfile content changed in this increment. The lockfile SHA-256 remains `8b851d881e9d659b5c2dac88b234872b608dfbe74961299d536aacf46345f605`. Owner-provided evidence says the existing Windows environment is configured and runs; this source archive's omitted `node_modules` and generated build outputs do not indicate a defect in that checkout.

The official endpoint `https://publicsuffix.org/list/public_suffix_list.dat` currently identifies VERSION `2026-10-07_07-28-19_UTC` / COMMIT `3929462652695bad04f0a27afb600974014a3c8b` ([source](https://publicsuffix.org/list/public_suffix_list.dat)). In this workspace both the updater and direct file download failed; the bundled generated rules therefore remain the OpenJDK-derived 2026-08-19 snapshot. Do not hand-copy a partial list or mark the upstream refresh done.

GitHub advisory [GHSA-hp3w-g68c-fv3c / CVE-2026-97058](https://github.com/advisories/ghsa-hp3w-g68c-fv3c), updated 5 October 2026, lists `sprintf-js <=1.1.3` as affected and no patched version. Lockfile metadata labels the installed v1.1.3 as development/optional and traces a build tooling chain including `roarr`; this is reduced presumed product-runtime exposure, not a closed audit finding. `npm audit --json`, `npm explain sprintf-js`, `npm ls sprintf-js --all`, package inclusion, and a documented owner/date for risk acceptance or remediation remain open.

## Historical v61 dependency disposition (superseded by v62 above)

No direct dependency versions, package version, or `package-lock.json` contents changed in v59/v61. The owner confirmed the pre-continuation Windows project/environment worked. This source archive omits `node_modules` and generated build output; that does not imply a defect in the owner's checkout. Canonical post-v61 typecheck/test/build/audit should be recorded from the owner's already-working checkout after integrating these source changes; do not reinstall merely because this archive excludes local dependencies.

## Public Suffix List refresh — still open

`npm run update:psl` failed with `fetch failed`, and a direct attempt to retrieve the full file also failed. No complete upstream list was received and no partial or hand-copied rules were added to `src/main/public-suffix-list.ts`. The official endpoint currently advertises VERSION `2026-10-07_07-28-19_UTC`, commit `3929462652695bad04f0a27afb600974014a3c8b` ([official source](https://publicsuffix.org/list/public_suffix_list.dat)). Run the updater on a network-connected checkout, review the complete data/version/license/provenance diff, then rerun the updater, suffix tests, account-session security and network-security suites.

## `sprintf-js` dependency review — open; no patched release listed

GitHub advisory [GHSA-hp3w-g68c-fv3c / CVE-2026-97058](https://github.com/advisories/ghsa-hp3w-g68c-fv3c) affects `sprintf-js <=1.1.3` and currently lists no patched version. Static lockfile inspection shows locked `sprintf-js@1.1.3` is `dev: true`, `optional: true`, in the `electron-builder@26.17.0` / `app-builder-lib@26.17.0` chain through nested `@electron/get` / `global-agent` / `roarr`. This suggests build-tool exposure, but is not a substitute for fresh npm audit/tree/package inclusion evidence. Do not use `npm audit fix --force` or force a breaking packager downgrade. If still unpatched and build-only, document a time-bounded risk acceptance, environment controls and recheck date.

## Historical v62 lockfile/toolchain evidence

- Node `22.16.0` and npm `10.9.2` remain the pins.
- `package-lock.json` is v3 and remains byte-for-byte unchanged; SHA-256 `8b851d881e9d659b5c2dac88b234872b608dfbe74961299d536aacf46345f605`.
- The package test command now includes 109 unique `.test.js` entries matching 109 test files. v60 adds the Video Hub browser-state entry and three focused source-contract checks; no dependency install or lockfile update was needed for source/test editing.

## Open dependency/release checklist

1. From the connected checkout, run `npm run update:psl`, inspect the entire generated data diff and rerun PSL/session/network security tests.
2. Capture `npm audit --json`, `npm explain sprintf-js`, and `npm ls sprintf-js --all`; verify packaged files versus build-only usage and write the remediation/risk decision.
3. After applying v60, record `npm run env:check`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run audit` on the owner's existing Windows environment. Do not assume the previously working checkout needs reinstall unless it reports an issue.
4. Complete native Electron workflow and installer acceptance after the canonical checks pass.

## v45 workspace verification attempt — 16 October 2026

- `npm ci` could not complete: registry DNS resolution returned `EAI_AGAIN registry.npmjs.org`; npm exited with “Exit handler never called!”. No lockfile changes were made.
- `npm audit --json` also failed because the npm audit endpoint returned `EAI_AGAIN`; this session therefore has no refreshed advisory count.
- `npm explain sprintf-js` could not resolve the dependency because the incomplete local install contains no installed dependency tree. The inherited eight-moderate-finding report remains the last known result, not a current audit.
- Remove the partial `node_modules` tree before archiving. Retry these checks on a registry-connected machine using the pinned toolchain.

## Continuation attempt — current environment (16 October 2026)

A fresh `npm ci` was attempted during the continuation but could not complete because the registry hostname did not resolve (`EAI_AGAIN registry.npmjs.org`); `npm run env:check` then reported 16 missing dependencies/local executables. A subsequent `npm audit --json --fetch-timeout=10000 --fetch-retries=0` could not reach the audit endpoint for the same DNS reason. `npm explain sprintf-js` cannot be treated as refreshed evidence without a complete install. No forced dependency change was applied and `package-lock.json` remains byte-for-byte unchanged. The inherited report of eight moderate `sprintf-js` findings via `electron-builder` remains the last known result, not a current audit.

`npm run update:psl` was also attempted and failed with `fetch failed`; no rule data or metadata was refreshed. Retry install, audit, dependency explanation and official PSL update on a registry-connected machine.

## Historical v62 checkpoint table (not current verification)

| Check | Current result | Evidence/status |
|---|---|---|
| Node/npm | PASS | Owner Windows run: Node 22.16.0, npm 10.9.2. |
| Lockfile | PASS | Included v3 `package-lock.json`; 429 package records including root; root dependencies and engine match manifest; lock SHA-256 `8b851d881e9d659b5c2dac88b234872b608dfbe74961299d536aacf46345f605`. |
| Clean install | PASS | Owner log: `npm ci` installed 353 packages. |
| Environment preflight | PASS | `npm run env:check` passed after clean install. |
| Project TypeScript checks | PASS | Owner log shows both TypeScript projects completed without diagnostics. |
| Production source build | PASS | Owner log shows Vite renderer, preload and main-module builds completed. |
| Canonical tests after Vite assertion fix | NEEDS RESULT RECORDING | Earlier output was 666/667 due to a stale test expecting Vite 7.1.12. The v44 source now expects 7.3.7; user reports the fix appears resolved, but preserve the exact post-fix `npm test` summary as the next checkpoint. |
| `npm audit` | OPEN | Last supplied audit after Vite update reported 8 moderate `sprintf-js` findings via the `electron-builder` tooling chain. Refresh against this lockfile. |
| Exact PSL update | OPEN | The updater exists, but the bundled rules are from the local OpenJDK snapshot installed 2026-08-19, not confirmed to match the official source advertised for 2026-10-07. |

## Locked toolchain

- Node.js: `22.16.0` (`.node-version`, `.nvmrc`, `engines.node`).
- npm: `10.9.2` (`packageManager`).
- Direct tool versions are pinned in `package.json` and match the lockfile, including Vite `7.3.7`, esbuild `0.25.12`, TypeScript `5.9.3`, Electron `44.7.2`, and electron-builder `26.17.0`.
- Archives include `package-lock.json` and intentionally omit `node_modules`.

## Commands for the next verified run

```powershell
npm ci
npm run env:check
npm ls --depth=0
npm run typecheck
npm test
npm run build
npm audit --json
npm explain sprintf-js
npm run update:psl
```

Rerun `npm test`, typecheck/build, and targeted PSL/security tests after any generated PSL diff or dependency update. Do not substitute temporary transpilation for the package-defined test lifecycle.

## Remaining dependency risks

### `sprintf-js` / `electron-builder`

The last owner output reported eight moderate findings in the `sprintf-js` dependency chain under `electron-builder`; the advisory referenced in `docs/security/SECURITY_AUDIT.md` listed no patched upstream `sprintf-js` version at assessment time. `npm audit fix --force` was not accepted because npm proposed downgrading electron-builder to `26.5.0`.

Next steps:

1. Run `npm audit --json` and `npm explain sprintf-js` against the included lockfile.
2. Review the exact dependency path, advisory range and available non-breaking mitigations/overrides.
3. If no patched version exists, document the reachable code path and packaging-only exposure if confirmed, available mitigations, owner risk decision and the evidence for any acceptance.
4. If the chosen mitigation changes electron-builder or packaging dependencies, regenerate the lockfile, run `npm ci`, full tests/build, and test the Windows installer before closing it.

Do not claim the dependency audit is clean while a finding remains open or unaccepted, and do not use `npm audit fix --force` blindly.

## Historical note

Earlier v39/v41 entries in the migration history record the period when registry DNS failed and the lockfile/dependencies were missing. Those are historical, superseded by the owner-provided v44 lockfile and Windows clean-install/typecheck/build evidence above.

## Step 2 execution review — 16 October 2026 (latest check)

### Public Suffix List (PSL)

- The authoritative endpoint remains `https://publicsuffix.org/list/public_suffix_list.dat`. A current inspection of that official endpoint still advertises `VERSION: 2026-10-07_07-28-19_UTC` and `COMMIT: 3929462652695bad04f0a27afb600974014a3c8b`.
- Running `npm run update:psl` in this workspace still fails with `fetch failed`; direct file download also failed. Therefore the updater did **not** change `src/main/public-suffix-list.ts` or the notices. The bundled rules remain the OpenJDK snapshot installed 2026-08-19 (9,762 normalized rules) and must not be relabeled as the official October snapshot.
- PSL refresh status remains **OPEN / BLOCKED by network retrieval**. On the connected Windows development machine, run `npm run update:psl`, inspect the generated diff, verify the VERSION/COMMIT against the official endpoint, and rerun `node --test tests/public-suffix-updater.test.js tests/main-public-suffix-list.test.js` plus auth-domain/input-validation tests.

### Dependency advisory review

- `npm audit --json` failed because the registry audit endpoint could not resolve (`EAI_AGAIN registry.npmjs.org`). Its current finding count is **not verified**. `npm explain sprintf-js` also failed because this workspace's extracted `node_modules` tree is stale/inconsistent; `npm ls --depth=0` reports invalid and extraneous packages. The lockfile was not changed. This failed environment result must not be confused with the owner's earlier clean-install logs.
- Lockfile metadata shows the transitive development/packaging path: `electron-builder@26.17.0` → `app-builder-lib@26.17.0` → `@electron/get@3.1.0` → optional `global-agent@3.0.0` → `roarr@2.15.4` → `sprintf-js@1.1.3`. `sprintf-js` is not a direct product-runtime dependency in the manifest; it is reachable through a build/packaging tool path. This reduces the apparent runtime exposure but does not make the audit finding disappear.
- The GitHub Advisory Database entry **GHSA-hp3w-g68c-fv3c / CVE-2026-97058** currently lists `sprintf-js` versions `<=1.1.3` as affected and lists **no patched version**. The described failure is an uncaught `RangeError` from an unbounded numeric-format precision when attacker-controlled format strings reach the vulnerable call. See <https://github.com/advisories/ghsa-hp3w-g68c-fv3c>.
- The historical owner report of eight moderate findings remains a historical report only; a fresh `npm audit` count is not available in this run. No `npm audit fix --force`, package downgrade, override, or lockfile mutation was applied because the available advisory lists no patched upstream version and the earlier forced proposal downgraded `electron-builder` to `26.5.0` without installer regression evidence.
- Dependency closure remains **OPEN**. On the connected Windows environment, run `npm audit --json` and `npm explain sprintf-js`. Review the actual output against the current lockfile. If there is still no patched version, decide on a narrowly scoped build-tool mitigation or documented risk acceptance; any package/lock change must be followed by `npm ci`, canonical tests/typecheck/build, and Windows installer validation.

### Step 2 disposition

The advisory research and lockfile-path review are complete, but Step 2 is **not security-closed**: exact PSL bytes could not be retrieved, and the current registry audit count could not be refreshed. The package lockfile is preserved unchanged. Do not proceed to Step 3 until the connected-environment commands above provide evidence for these two gates, or the remaining risks are explicitly accepted by the project owner.

### Step 2 targeted verification

- `node --test tests/public-suffix-updater.test.js tests/security-audit-contract.test.js tests/renderer-react-notes-workspace.test.js tests/renderer-react-arena-management.test.js tests/renderer-react-utility-workspaces.test.js`: **26/26 passed**.
- `npm run build:main-modules` could not run in this extracted workspace because the local `esbuild` executable is absent (`sh: 1: esbuild: not found`). This agrees with the inconsistent `node_modules` report and is not treated as a product build result. The complete project package intentionally excludes `node_modules` and generated `build` output; restore the exact locked dependencies with `npm ci` in the connected Windows project before canonical verification.

## v50 continuation — dependency state unchanged (16 October 2026)

The AI Hub navigation migration made no dependency or lockfile changes. The manifest/lockfile parse cleanly and the environment checker confirms lockfile/manifest alignment, but canonical reproducibility is blocked because `node_modules` is absent. No new `npm audit` or `npm explain sprintf-js` result is claimed; the historical `sprintf-js` finding remains open pending a registry-connected install/audit. PSL synchronization is also still open because authoritative list bytes were not fetched in this workspace.

