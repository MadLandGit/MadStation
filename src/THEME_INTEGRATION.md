# Mad Station Theme Integration Contract (`madstation-theme-api-v1`)

This file belongs in every theme ZIP exported by Mad Station and is also shipped in the application package. It tells theme designers and the importer how the visual page reconnects to the real app. If an externally supplied ZIP omits this file, the importer warns and applies the built-in mappings below; ZIPs from every possible third party cannot be guaranteed to contain the instruction file.

## Package structure

Preferred ZIP root:

- `madstation-theme-pack.json` — package format, schema version, `instructionsFile`, and theme entries.
- `THEME_INTEGRATION.md` — this integration contract.
- `themes/home-*.html` — one entry page per theme.
- `shared-css/` — local stylesheets and their imported CSS.
- `visual-js/` — local visual renderers only. Do not include host bridges or the app-owned import adapter.
- `assets/` — local image, texture, font and media files referenced by a theme.
- `theme-manifest.json` — optional fingerprints and dependency metadata.

Theme IDs and file paths must be relative, unique, and confined to the ZIP. Keep CSS, scripts, fonts, and images local. ZIP entries must not contain absolute paths or `..` traversal segments.

## Action reconnection contract

The importer never executes a bridge supplied by a theme ZIP. It removes known host bridge scripts and the preview-only placeholder guard, checks the remaining HTML/CSS/JavaScript for disallowed host, filesystem, network, and dynamic-code access, and injects the application-owned `theme-live-config.js`, Quick Access controller, and `theme-live-adapter.js`.

The trusted adapter exposes these theme entry points inside the imported page:

- `MadStationTheme.launch("ai-hub")` — open an allow-listed Mad Station workspace app.
- `MadStationTheme.openSettings()` — open Mad Station Appearance settings.
- `MadStationTheme.toggleTheme()` — request a day/night toggle.
- `MadStationTheme.setHomepage("v2")` — select a currently installed theme ID.
- `MadStationTheme.setAccent("blue")` — request a supported accent.
- `MadStationTheme.setSeason("summer")` — request a Parallax Jungle season.

Prefer declarative actions in new ZIPs: `data-ms-action="launch:ai-hub"`, `data-ms-action="settings"`, `data-ms-action="toggle-theme"`, `data-ms-action="homepage:glass"`, or `data-ms-action="accent:violet"`. Action names alone do not grant capabilities. The app validates the target again in its parent window.

Allow-listed workspace target IDs:

| Visible label | Target ID |
|---|---|
| AI Hub | `ai-hub` |
| Prompt Studio | `instruction-forge` |
| AI Playground | `ai-lab` |
| Video Hub | `video-hub` |
| Image Hub | `image-hub` |
| Notes & Tasks | `clipboard` |
| Settings / Appearance | `settings` action; not a workspace app |

The importer also reconnects the theme's `MadHomeApps.setLauncher(...)` hook where the visual renderer provides it, and provides a constrained delegated-action fallback for elements carrying `data-ms-action` or recognizable app labels. Theme-specific styling should preserve the existing Quick Access trigger/menu markers (`data-theme-quick-access`, `data-theme-quick-trigger`, and `data-theme-quick-menu`) and the shared `home-quick-access-theme.css` stylesheet.

## Quick Access and Appearance

- The importer writes a current theme catalogue and a trusted per-theme host channel into a generated local config. Do not hard-code IPC or `window.aiHub` in theme code.
- Quick Access selection uses the same theme IDs as the app’s home-page switcher. The importer updates the list in installed themes after every import.
- Day/night mode, accents, and appearance settings flow through validated host messages. The imported page must not write app settings directly.
- Preview-only `visual-only-guard.js` must not remain in an installed theme, since it intentionally blocks app placeholders. The importer replaces it with the approved adapter.

## ZIP safety requirements

Do not include `require`, `process`, Electron IPC, host API access, raw parent-window messages, remote scripts/styles/media, `fetch`, XHR/WebSocket/EventSource, `eval`, `new Function`, or dynamic imports. Do not include app launcher logic in the design pack. App tiles in a design-only ZIP are placeholders; the importer reconnects only the documented, allow-listed actions.

The importer validates archive paths, entry counts, expanded size, checksums, required theme pages, local resources, and script/style source before writing anything. Import changes are staged; previous versions of the same imported custom theme are retained as rollback backups when updated. A missing instruction file is reported as a warning, not silently treated as confirmed metadata.

## Import behavior: custom additions only

- The built-in theme files under the Mad Station project `src/` directory are the canonical source of truth. Theme ZIP files are transport/export artifacts, not the editable source of a built-in theme.
- ZIP imports are installed only as separate custom themes with stable `custom-*` IDs. A ZIP that contains a built-in filename such as `home-retro-complex.html` does not replace that built-in theme.
- To restyle a built-in homepage, edit the corresponding `src/home-*.html` file and its referenced source CSS, visual scripts, and assets, then rebuild/reinstall Mad Station.
- Imported custom themes live in the app user-data `theme-imports/` directory. Existing legacy `override-*` folders and registry entries are not used to render built-in pages.
- The application does not provide a “Restore Default Theme Package” action. The runtime should not keep a second, ZIP-based definition of a built-in theme.

## Layout contract

Default native window: 1450 × 920 px. Minimum native window: 900 × 560 px. These are outer window dimensions; app chrome reduces the usable viewport. Fit the primary UI at the default size without page-level scrolling where practical, expand smoothly when maximized, and reflow at minimum size. Test 1450 × 920, 1280 × 800, 900 × 560, and 1920 × 1080.


## Theme identity and filenames

- Give every independently selectable theme a stable, unique `id` in `madstation-theme-pack.json`. The ID is the theme's identity; its HTML filename and display title are not unique identifiers.
- Different themes may reuse a source filename such as `themes/home-v2.html`. When importing as a new theme, use distinct IDs (for example, `potato` and `simple-theme`) so the themes remain separate in Appearance, Quick Access, and the exporter.
- Keep the ID stable when updating the same theme in a later ZIP. Change the ID only when you intend to add a distinct theme.
