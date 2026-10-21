# Documentation index

Use this page to navigate Mad Station's user, architecture, design, development, security, and licensing documentation. For the product overview and release information, start with the root README.

## Start here

- [`DOCUMENTATION-UPDATE-CHANGELOG.md`](DOCUMENTATION-UPDATE-CHANGELOG.md) — this documentation repair and its validation boundaries.

- [`../README.md`](../README.md) — product overview and current user-facing feature descriptions.
- [`android/ANDROID.md`](android/ANDROID.md) — Android companion features, APK build instructions, and known limitations.
- [`../AGENTS.md`](../AGENTS.md) — canonical repository instructions for AI coding agents and maintainers.
- [`../CLAUDE.md`](../CLAUDE.md) — concise entry point delegating to the repository instructions.
- [`architecture/CORE_SYSTEM.md`](architecture/CORE_SYSTEM.md) — fastest route to the correct subsystem and source files.

## Architecture

- [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md) — broad architecture overview and runtime ownership.
- [`architecture/CORE_SYSTEM.md`](architecture/CORE_SYSTEM.md) — current module map and development recipes.
- [`architecture/MODULE_AUDIT.md`](architecture/MODULE_AUDIT.md) — detailed module/ownership audit; read historical checkpoint labels carefully.

## Design system and themes

- [`design/DESIGN_SYSTEM.md`](design/DESIGN_SYSTEM.md) — token rules, component catalogue, and design recipes.
- [`design-kit-preview.html`](design-kit-preview.html) — shared component and token laboratory; open from the project checkout in a browser.
- [`design/homepage-theme-gallery.html`](design/homepage-theme-gallery.html) — gallery of all ten user-selectable built-in homepage themes.
- [`design/HOMEPAGE_THEME_CATALOG.md`](design/HOMEPAGE_THEME_CATALOG.md) — theme IDs, entry files, test links, and process for adding a theme.
- [`design/theme-kits/`](design/theme-kits/) — one dedicated HTML review kit per selectable built-in theme.
- [`archive/design-prototypes/`](archive/design-prototypes/) — archived visual explorations, not current implementation contracts.

## Development

- [`development/DEVELOPMENT_ENVIRONMENT.md`](development/DEVELOPMENT_ENVIRONMENT.md) — environment setup and verification workflow.
- [`development/AI_DEVELOPMENT_GUIDE.md`](development/AI_DEVELOPMENT_GUIDE.md) — conventions for AI-assisted changes.
- [`development/DIAGNOSE_STARTUP_SYNTAX_PREFLIGHT.md`](development/DIAGNOSE_STARTUP_SYNTAX_PREFLIGHT.md) — startup syntax preflight.
- [`development/STARTUP_DIAGNOSTICS.md`](development/STARTUP_DIAGNOSTICS.md) — startup troubleshooting diagnostics.

## Security, dependencies, and licenses

- [`security/SECURITY_AUDIT.md`](security/SECURITY_AUDIT.md) — dated security review history and current references.
- [`security/DEPENDENCY_AUDIT.md`](security/DEPENDENCY_AUDIT.md) — dependency-risk and audit notes.
- [`security/RELEASE_AUDIT.md`](security/RELEASE_AUDIT.md) — current automated release workflow and manual validation checklist.
- [`licenses/THIRD_PARTY_NOTICES.md`](licenses/THIRD_PARTY_NOTICES.md) — included third-party notices.
- [`licenses/Public-Suffix-List-Notice.md`](licenses/Public-Suffix-List-Notice.md) and [`licenses/MPL-2.0.txt`](licenses/MPL-2.0.txt) — relevant license notices/text.

## Using dated audit records

Security, dependency, and release audit documents may contain dated findings and results. Treat each result as evidence from its stated date, not as a claim that the same checks were rerun on the current checkout. For current implementation details, follow `architecture/CORE_SYSTEM.md` and verify the source and tests.
