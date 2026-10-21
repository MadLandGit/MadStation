# One-click startup diagnostics (Mad Station 1.6.3)

Run **`+ Diagnose Startup.cmd`** from the project root for the full release validation and startup checks. It replaces the former separate Diagnose Startup 2 launcher and runs that complete workflow directly; there is now only one CMD file for diagnosis.

The script:

1. Syntax-checks `scripts/diagnose-startup.ps1` with Windows PowerShell's AST parser before performing the full workflow.
2. Checks required project files, exact Node.js/npm pins, package version consistency and the lockfile's HTTPS origins/integrity hashes.
3. Runs `npm run env:check`; when dependency markers or `npm ls --depth=0` show a missing/mismatched installation, it runs `npm ci` and repeats validation.
4. Runs typecheck and the complete `npm test` suite, then generates production-only and full dependency audit JSON reports. Unreadable audit results are not treated as proof of a clean audit; findings are recorded as release validation failures.
5. Runs `npm run build`. It only proceeds to Electron if the production build passes.
6. Explicitly runs `node_modules\.bin\install-electron.cmd --no`, verifies `node_modules\electron\dist\electron.exe` exists and is plausibly complete, and runs Electron's `--version` self-check against the pinned package version.
7. Launches Mad Station interactively. The main process emits only safe event names (not event details) to stdout. After the user closes the app, the final summary checks for `main-module-evaluated`, `app-ready-config-loaded`, `main-window-created`, `control-renderer-loaded` and `toolbar-renderer-loaded`, reports renderer load/process failures, and records the application exit code. The final summary always prints an `Application startup result` status, including `NOT ATTEMPTED` when validation fails before launch. This distinguishes a successful compile from a confirmed live application startup.
8. Keeps the CMD window open and returns a nonzero exit status when a required check or startup signal fails.

The timestamped transcript and audit JSON/stderr files are written to `%LOCALAPPDATA%\MadStation\diagnostics`, falling back to `%TEMP%\MadStation-diagnostics`. Electron separately records detailed, redacted startup events in `startup-diagnostics.log` under its user-data directory. These logs serve different purposes. Share the final console summary and relevant log when troubleshooting. Logs and reports can include local paths and dependency metadata; review them before public sharing.

The script does not build the Windows installer. After validation and manual GUI acceptance, use **`+ build installer.cmd`** for the NSIS package.
