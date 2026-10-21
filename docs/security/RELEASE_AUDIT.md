# Release validation for Mad Station v1.6.3

This page describes the release process for the current source tree. It replaces the former collection of dated intermediate checkpoint notes, which could be mistaken for the current state of the application.

## Automated Windows workflow

The workflow in [`.github/workflows/release.yml`](../../.github/workflows/release.yml) runs on pushes to `main` and on version tags beginning with `v`. It is configured to:

1. Select the Node.js version from `.node-version`.
2. Install the pinned npm version `10.9.2`.
3. Install dependencies from `package-lock.json` using `npm ci`.
4. Run `npm run env:check`.
5. Run the project suite with `npm test`.
6. Build the Windows NSIS installer with `npm run dist`; the package script sets `--publish=never` to prevent the build from attempting to publish on its own.
7. For a `v*` tag, publish `dist/Mad-Station-Setup-*.exe` as a GitHub Release asset.

Check [GitHub Actions](https://github.com/MadLandYT/Mad-Station/actions) for the latest result. A failed or still-running workflow must not be described as a successful release build.

## Checks still needed outside CI

A successful workflow is evidence that the configured automated checks and packaging steps completed. It does not, by itself, prove that the installed application has been manually exercised on every supported Windows setup. Before announcing a release, download the generated installer and verify installation, launch, the main user workflows, and uninstall/upgrade behavior on Windows.

The workflow does not run a full `npm audit` as a separate step and does not configure code signing. Review the [dependency audit](DEPENDENCY_AUDIT.md), [security audit](SECURITY_AUDIT.md), and [third-party notices](../licenses/THIRD_PARTY_NOTICES.md) separately. Do not describe a release as signed or as having a clean fresh dependency audit unless there is current evidence for that claim.

## Release checklist

- Confirm the workflow for the intended commit or version tag has completed successfully.
- Confirm the release contains the expected `Mad-Station-Setup-1.6.3.exe` (or matching versioned filename).
- Install and launch that installer on Windows and run the app's startup diagnostics.
- Confirm the visible app version matches the release version.
- Read the current workflow result and relevant security/dependency evidence before publishing release claims.
