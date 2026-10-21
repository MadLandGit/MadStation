# Mad Station design system ("night station")

One look for the whole app, driven by **Settings → Appearance**. Every screen
that follows this document changes automatically when the user changes theme,
accent, surface, corners, buttons, borders, shadows, spacing, density or
background. Do not build UI any other way.

Shared component/token preview: open `docs/design-kit-preview.html` from the project checkout. It loads the shared CSS and exposes a useful subset of Appearance controls; it is not the full Settings panel. The ten built-in homepage layouts each have a dedicated live-source kit linked from [`homepage-theme-gallery.html`](homepage-theme-gallery.html) and indexed in [`HOMEPAGE_THEME_CATALOG.md`](HOMEPAGE_THEME_CATALOG.md).

## 1. How it works (three layers)

| Layer | What | Where |
|---|---|---|
| 1. Core palette | `--bg --sidebar --surface --surface-2 --surface-3 --line --line-strong --text --muted --muted-2 --accent --accent-strong --danger`. Light / Dark / System and the accent colour change these live. | `src/styles.css` (`:root`), set by `src/appearance.js` |
| 2. Design tokens | `--ms-*`: shape, spacing, surface material, borders, shadows, button looks. The **only** place Appearance settings (`body[data-*]`) are turned into values. | `src/design-tokens.css` |
| 3. Components | `.ms-*` classes built only from layers 1 and 2. | `src/design-kit.css` |

Flow: Appearance setting → `appearance.js` writes `body[data-…]` / `--accent` →
`design-tokens.css` maps it to `--ms-*` → components read `--ms-*`.

The isolated modular Simple Home (`src/home-v2.html`) loads the current `src/home-v5.css` implementation (not `home-v2.css`) and the `home-v5.js` / `home-v5-bridge.js` integration, along with shared appearance adapters. The host bridge forwards the resolved core palette (including light/dark/system resolution and the chosen accent) and the complete Appearance settings; the shared `--ms-home-*` adapter aliases map those settings into the modular Home. The token file also contains a standalone-preview fallback palette, not a second runtime theme system. Never duplicate Appearance mappings inside theme CSS; shared settings mappings belong in `src/design-tokens.css`. The **3D Parallax** Home (`src/home-v3.html`) follows the same contract through `src/home-v3-bridge.js`: it loads `appearance.js` and `design-tokens.css`, receives the resolved host palette plus the complete settings object, and maps its legacy visual roles (`--v3-bg`, `--v3-s1`, `--v3-line`, and others) onto the shared tokens. Its particles, rings, and depth layers may be decorative, but surfaces, control looks, accent hues, background, spacing, corners, motion, and feedback must derive from the shared settings. The 3D Home uses a separate iframe, postMessage channel, and local layout keys from Simple.

All built-in background styles (`plain`, `parallax`, `aurora`, `grid`, `spotlight`, `mesh`, `neon`, `dots`, `rings`, `hex`, `waves`, `diagonal`, `circuit`, `constellation`, and `tiles`) and a selected custom background are supported by the modular Home. Surface material, card/control radius, button background, border/shadow style, card spacing, density, border spacing, status indicators, hover behavior and reduced-motion preferences are likewise mapped through the common tokens. New options must update the bridge if they need host state, the central token adapter, documentation and focused tests. The **Parallax** background reuses the 3D Home’s complete accent-tinted depth treatment—soft light blooms, animated perspective grid, orbital rings, translucent floating geometry, and an accent-linked particle field—on Default and Simple. On Simple, the background library entry named **Parallax** activates the full reusable depth stack; other background choices hide these layers. The 3D Parallax homepage retains its signature stack as part of that layout. All added layers respect reduced-motion and hover-animation settings.

### Homepage styles in Themes

The global Appearance panel has one **Themes** card for choosing the homepage layout. `src/renderer-react/appearance-controls.tsx` presents a preview for each registered style and forwards the selected ID through `madstation:homepage-style-select`. `src/renderer.js` validates the allowed ID, and `src/home-page-switcher.js` persists it under `mad-station-homepage-version-v1`, activates its corresponding homepage, and falls back to the original homepage if an isolated style cannot start. The former four appearance preset mappings are removed; homepage-style selection does not overwrite global dark/light/system mode, accent, background, spacing, surface or control settings. Add a new homepage style to the switcher registry and `HOMEPAGE_STYLES`, give its preview a scoped `.homepage-style-preview--<id>` rule, and extend `tests/design-system.test.js` and the relevant homepage integration test.

The ten user-selectable homepage styles are Simple (`v2`), Simple Retro (`retro`), Retro Complex (`retro-complex`), 3D Parallax (`parallax`), 3D Parallax Big App (`parallax-big`), Galaxy (`galaxy`), Parallax Jungle (`parallax-jungle`), Claymorphism (`claymorphism`), Glass (`glass`), and Isometric World (`isometric-world`). Default/legacy remains an internal rescue/developer mode and is deliberately omitted from user-facing choices. See [`HOMEPAGE_THEME_CATALOG.md`](HOMEPAGE_THEME_CATALOG.md) for source ownership and test links; every selectable theme has an individual kit in `docs/design/theme-kits/`. Removed homepage IDs migrate to Simple (`v2`).

Stylesheet load order in `renderer.html` (keep it):
`styles.css → design-tokens.css → design-kit.css → home.css → pages.css`.

`home.css` and `pages.css` are the skin for the older screens (Home, AI Hub,
Prompt Studio, AI Playground, Notes & Tasks, Settings). They read the same
tokens (`home.css` through `--h-*` aliases). They are not the place for new work.

## 2. Rules

1. **No raw colours.** No hex, `rgb()`, `rgba()`, `hsl()` in new CSS. Use layer-1
   variables, `color-mix()` over them, or a hue token (`--ms-sky --ms-mint --ms-lilac --ms-amber --ms-rose`).
2. **No raw radii, paddings, gaps, borders, shadows or button looks** for cards
   and controls. Use the `--ms-*` tokens.
3. **Build from `.ms-*` kit classes.** Need something the kit lacks? Add it to
   `design-kit.css` (tokens only), document it here, then use it.
4. **Never write `body[data-surface-style|corner-style|button-corner|button-background|border-style|shadow-style|card-spacing|density] { --… }` outside `design-tokens.css`.**
5. **New Appearance option** = add the value list to `appearance.js` **and** a
   rule block in `design-tokens.css`. `npm test` fails if they disagree.
6. No `url()`, no `@import`, no inline `style=""` in app markup (strict CSP).
7. Respect motion settings: `body.reduce-motion` and `body.no-hover-animation`
   are already handled for kit components and `.ms-screen`.
8. Test the result in **Light and Dark**, with at least one neon/glass combination
   and one sharp/square combination.

## 3. Token reference (`design-tokens.css`)

| Token | Meaning | Driven by |
|---|---|---|
| `--ms-ease` | standard easing curve | fixed |
| `--ms-font-ui` | UI font stack | fixed |
| `--ms-fire` | accent → accent-strong gradient (primary buttons, highlights) | accent |
| `--ms-sky` `--ms-mint` `--ms-lilac` `--ms-amber` `--ms-rose` | semantic hues, adapt to light/dark | theme |
| `--ms-card-bg` `--ms-card-blur` | card material | surface style |
| `--ms-r-card` `--ms-r-card-lg` `--ms-r-sm` `--ms-r-xs` `--ms-r-icon` | corner radii (cards, large cards, inner blocks, fields, icon tiles) | corner style |
| `--ms-r-btn` | button / pill radius | button corner |
| `--ms-card-border` | card border colour | border style |
| `--ms-card-shadow` | card shadow | shadow style |
| `--ms-gap` | gap between cards | card spacing |
| `--ms-pad-y` `--ms-pad-x` | padding inside cards | density |
| `--ms-btn-bg` `--ms-btn-fg` `--ms-btn-bd` `--ms-btn-sh` `--ms-btn-bg-hover` | secondary button look | button background |
| Modular Home adapters: `--ms-home-background`, `--ms-home-background-size`, `--ms-home-background-position`, `--ms-home-background-repeat`, `--ms-home-panel-bg`, `--ms-home-overlay-bg`, `--ms-home-panel-blur`, `--ms-home-panel-border`, `--ms-home-panel-shadow`, `--ms-home-elevated-shadow`, `--ms-home-panel-radius`, `--ms-home-small-radius`, `--ms-home-quick-radius`, `--ms-home-search-radius`, `--ms-home-control-radius`, `--ms-home-module-gap`, `--ms-home-panel-padding`, `--ms-home-panel-padding-x`, `--ms-home-panel-padding-y`, `--ms-home-row-gap`, `--ms-home-toast-bg`, `--ms-home-toast-fg`, `--ms-home-control-bg`, `--ms-home-control-fg`, `--ms-home-control-border`, `--ms-home-control-shadow`, `--ms-home-control-blur`, `--ms-home-control-hover-bg`, `--ms-home-primary-bg`, `--ms-home-primary-fg`, `--ms-home-primary-border`, `--ms-home-primary-shadow`, `--ms-home-primary-hover-bg`, `--ms-home-status-indicator-display` | Adapter aliases used by current `src/home-v5.css` and compatibility/theme stylesheets (including v2/v3/v4); use the host-resolved palette with a standalone-preview fallback | Theme, background, surface, corners, spacing, borders, shadows, status and button style |

Local custom properties used by the kit (not Appearance tokens): `--ms-tile-hue`
(hue of a brand tile), `--ms-screen-z` (z-index of a `.ms-screen`, default 35).

## 4. Component catalog (`design-kit.css`)

**Screen:** `.ms-screen` full-window page (adds backdrop glow, focus ring, font,
reduce-motion automatically) · `.ms-inner` centred content column ·
`.ms-header` top bar · `.ms-header-actions` and `.ms-spacer` push tools to the right ·
`.ms-grid` responsive card grid (gap follows card spacing).

**Brand:** `.ms-brand` row · `.ms-brand-tile` icon tile, optional hue
`.ms-brand-tile--sky|mint|lilac|amber|rose` · `.ms-brand-text` · `.ms-brand-name` · `.ms-brand-tag`.

**Controls:** `.ms-btn` (secondary, follows Appearance → Buttons) ·
`.ms-btn--primary` (accent gradient) · `.ms-btn--sm` · `.ms-icon-btn` (40px round) ·
`.ms-input` (input, select, textarea) · `.ms-chip` · `.ms-tabs` + `.ms-tab` (add `.active`) · `.ms-browser-toolbar` (token-based embedded-browser control row) · `.ms-browser-tool-btn` (compact icon action using the shared button tokens) · `.ms-browser-open-external` (external-link button icon).

**Surfaces:** `.ms-card` (hover accent edge) · `.ms-card--flat` (no hover effect;
use for forms and settings) · `.ms-card-head` · `.ms-row` (list row; `.is-active`
for the selected one) · `.ms-stat` (label + big number, a `span` then a `strong`) · `.ms-empty` · `.ms-code-block` (theme-aware read-only code/prompt surface) · `.ms-browser-frame` (theme-aware embedded browser/preview frame) · `.ms-browser-address` (theme-aware address field) with `.ms-browser-address-icon-wrap`, `.ms-browser-address-icon`, `.ms-browser-address-lock`, `.ms-browser-address-location` and `.ms-browser-address-account` parts. Pair with `.ms-muted` when muted text is desired.

**Text:** `.ms-title` gradient page title · `.ms-eyebrow` small uppercase label · `.ms-muted`.

Shared legacy pieces that are already skinned and may still be used inside
existing screens and modals: `.modal` + `.modal-card` (+ `.modal-title`,
`.modal-subtitle`), `.card`, `.primary`, `.tiny-btn`, `.icon-only`, `.ctx-menu`.
For anything new, prefer the kit.

### Settings UI patterns — Full Global Settings and Compact Feature Settings

This is the reusable specification for the two settings styles used in Mad Station. They share the same Appearance tokens and `.ms-*` component kit, but they are deliberately different **layout patterns**. Choose one based on scope; do not shrink the full page until it looks like a dialog or expand a small feature dialog into an unnecessary settings hub.

| Pattern | Use it for | Navigation | Container | Save model |
|---|---|---|---|---|
| **A. Full Global Settings** — main-menu Settings | App-wide preferences, many categories, cross-workspace configuration, searchable settings | Persistent left navigation rail + independent content pane | Full-window `.ms-screen` | Usually apply/save each preference immediately; show a restart notice only when a setting genuinely requires restart |
| **B. Compact Feature Settings** — Prompt Studio example | A small set of settings for one tool or workspace | No side rail; one compact dialog with grouped options | Centered modal over the current workspace | Use explicit **Save** / **Cancel** when edits are staged; closing/cancelling must not accidentally commit staged edits |

Both styles inherit theme, accent, surface, border, corner, shadow, spacing and button appearance through `src/design-tokens.css` and `src/design-kit.css`. Keep visual declarations in the shared kit/tokens; settings-specific CSS should primarily describe layout and responsive behavior. Existing `st-*`, `clipboard-settings-*`, `settings-tab`, `bento`, and related names are legacy implementation hooks, not generic `.ms-*` kit classes. New apps may create their own layout hooks, but should keep the component hierarchy, measurements and states below.

#### A. Full Global Settings — main-menu pattern

**Design intent:** a persistent settings workspace suited to many categories. Users should always understand where they are, find a setting across categories, and work in a spacious content surface without a dialog interrupting the app.

**Overall frame and geometry**

- Full-window page using `.settings-screen.ms-screen`, with `--ms-screen-z: 50` in this app. Use the shared `.ms-screen` backdrop/focus/motion behavior; set a local z-index token only when the host stacking order requires it.
- Two-column grid: **264px** navigation rail and `minmax(0, 1fr)` content. The frame owns the viewport (`overflow: hidden`); navigation and content scroll independently rather than scrolling the entire page.
- Navigation rail padding: **20px 14px 14px**. Main content padding: **34px `clamp(24px, 4.5vw, 64px)` 64px**. Center the active settings panel at a maximum width of **1040px**.
- Use the active theme/surface tokens for the page, rail, cards, controls and focus states. Do not create a separate settings-only palette.

**Left navigation rail, top to bottom**

1. **Header:** back/close icon button (**36 × 36px**, about **10px** corner radius), Settings title and a short muted status such as “Saved automatically”. The title is compact (about **15px**, semibold/bold) and truncates rather than pushing controls outside the rail.
2. **Search:** a full-width token-styled field with a search icon, one-line query and a clear action. Give it about **14px** of separation from the category list. Search should filter or reveal matching settings and identify their category; clearing the query restores normal navigation.
3. **Grouped navigation:** uppercase muted category labels, then icon + text tabs. Each tab is **40px high**, with an approximately **17px** icon, **11px** icon/label gap and **12px** horizontal padding. Mark the active category using `.ms-tab` state styling (for existing code, retain the `.settings-tab` hook and its `.active` state).
4. **Long lists:** let the rail itself scroll. Keep group headings and tab rows from shrinking. Do not put the whole rail in the content pane or repeat navigation inside every category.

**Content pane**

- Show one active `.settings-panel` at a time. Begin with `.panel-head`: a clear `.ms-title` category heading and a short description (about **13px**, muted, max width around **620px**), followed by roughly **22px** separation before controls.
- Use `.bento` as a two-column grid with `minmax(0, 1fr)` columns and a gap of `calc(var(--ms-gap) * 2)`. At content widths around **1100px** and below, collapse to one column. Let especially important or wide groups span both columns.
- Group related settings into `.ms-card.ms-card--flat` surfaces. Use a concise card title, optional icon/description, then setting rows. Avoid hover-lift on cards that are primarily forms/settings.
- Standard setting rows align label/help text on the left and the input, segmented control or action on the right. Use approximately **58px minimum row height**, **12–14px** horizontal padding and a subtle divider between rows. Longer help text can wrap; controls must not force the label column below a usable width.
- Place notices (for example, restart required) above the category content, visually secondary and with a clear action. Do not imply a restart is needed if the setting applies immediately.
- Use `.ms-input` for inputs/selects, `.ms-tabs`/`.ms-tab` for tab-like choices, `.ms-btn`/`.ms-btn--primary` for actions, `.ms-chip` for counts/status, and `.ms-muted` for supporting copy. Keep legacy hooks if existing JavaScript/tests rely on them; do not rename IDs or `data-*` attributes during a visual refactor.

**Responsive behavior**

- At **860px or narrower**, convert the left rail to an **icon rail about 76px wide**. Hide category labels and tab text, center icons, preserve accessible names, and provide tooltips for icon-only actions.
- The rail can expand into a **264px overlay drawer** when the user requests navigation/search. Restore labels and search input while expanded; keep the main content usable and avoid covering essential actions permanently.
- At **1100px and narrower**, collapse the content bento grid to one column. Reduce side padding before allowing horizontal overflow. On small widths, keep forms single-column and allow rows to wrap as required.
- Respect `body.reduce-motion` and `body.no-hover-animation`; category changes may use a restrained fade/short vertical transition but must remain understandable with reduced motion enabled.

**Interaction/accessibility contract**

- Each category button has a meaningful accessible name, visible active state and keyboard focus. Search is labelled; Escape closes Settings (or first clears the active search/drawer state, following the host app's established behavior).
- Changing tabs changes only the visible panel. It must not reset values or recreate unrelated workspace state.
- For live/auto-saved preferences, apply updates immediately and communicate restart requirements accurately. Avoid Save buttons that imply staging when changes already apply live.
- Each setting has a visible label and, where useful, a concise description. Keep focus rings, adequate contrast, and reachable controls in the collapsed rail.

**Portable structure reference** (IDs shown here are placeholders; give every new page unique IDs and wire it to that app's own state):

```html
<main class="settings-screen ms-screen" id="yourSettingsScreen">
  <aside class="your-settings-nav">
    <header class="your-settings-nav-head">
      <!-- back/close action + Settings title + save-status hint -->
    </header>
    <label class="ms-input"><span class="visually-hidden">Search settings</span>
      <input type="search" />
    </label>
    <nav aria-label="Settings categories">
      <!-- category labels and .ms-tab buttons; one active at a time -->
    </nav>
  </aside>
  <section class="your-settings-main">
    <section class="your-settings-panel" aria-labelledby="yourCategoryTitle">
      <header class="your-settings-panel-head">
        <h2 class="ms-title" id="yourCategoryTitle">Appearance</h2>
        <p class="ms-muted">A short description of these options.</p>
      </header>
      <div class="your-settings-grid">
        <section class="ms-card ms-card--flat">
          <!-- card heading + labelled setting rows -->
        </section>
      </div>
    </section>
  </section>
</main>
```

The `.your-*` classes are intentionally placeholders, not classes supplied by `design-kit.css`. Copy the layout measurements above and implement them in your app's layout CSS; use `.ms-*` for the shared visual system. The current Mad Station reference is `#settingsScreen` in `src/renderer.html`, `.settings-screen` / `.st-nav` / `.st-main` in `src/styles.css`, and `.settings-screen .st-nav-label` in `src/pages.css`.

#### B. Compact Feature Settings — Prompt Studio pattern

**Design intent:** a focused, low-friction dialog for a handful of settings belonging to one workspace. It keeps the user in context, has a strong title and grouped rows, and avoids a navigation sidebar, large page heading area or sprawling bento grid.

**Dialog frame and geometry**

- Use a fixed full-viewport overlay with a restrained, theme-aware dim and light blur. Center a single `.ms-card.ms-card--flat` panel; do not wrap the dialog in another decorative card.
- Desktop panel width: **up to 680px**. Maximum height: `min(760px, calc(100vh - 48px))`; the panel scrolls internally so the title and action footer can remain visible. Keep horizontal overflow clipped.
- Header uses a compact three-part grid: **40px** back/close control, **44px** feature icon tile, and a flexible title/subtitle column. Standard header padding is **20px 26px** with **14px** gaps. Use `.ms-icon-btn` for Back and `.ms-brand-tile` for the feature icon.
- Dialog title: about **20px**, heavy weight (around **850**), tight line-height and slightly negative letter spacing. Subtitle: about **12.5px**, muted, line-height around **1.5**. Keep both readable at narrow widths and truncate only where essential.
- The header is sticky at the top of the panel and separated from content with one quiet divider. The title identifies the feature (“Prompt Studio settings”), not a generic “Settings” heading.

**Grouped setting body**

- Split settings into small named groups. Begin each group with `.ms-eyebrow` (uppercase, muted/letter-spaced); place an optional short `.ms-muted` explanation directly below it.
- Standard section padding: **22px 26px 8px**. Separate subsequent groups with a horizontal divider and no nested card unless the content is genuinely independent.
- Each setting row has about **15px vertical padding**, **2px horizontal inset**, and a subtle bottom divider. Remove the divider from the final row in a group.
- For a label + select/field row, use a two-column layout: `minmax(0, 1fr)` label and **210px** control. Gap: **18px**. The control uses `.ms-input`, target height around **34px**, and must not overflow the dialog.
- For a toggle row, put the text and helper sentence together on one side and the switch at the opposite edge. Main label about **13.5px / 700**; helper about **12px** with **1.5** line-height. Reference switch size is **44 × 26px** with an **18px** thumb. Use an obvious checked state and visible focus ring; prefer a native checkbox underneath the visual switch.
- Do not add a sidebar, search field, category tabs or large content-page margin to this pattern. A compact dialog typically needs only one to three groups.

**Sticky action footer**

- Keep actions aligned right in a footer at the bottom of the panel. Use **16px 26px** padding, **10px** gap, one top divider and a theme-aware surface. Footer buttons have a **96px minimum width**.
- Use `.ms-btn` for secondary/cancel and `.ms-btn.ms-btn--primary` for the committed action. Make the commit action unambiguous (“Save settings”). If the dialog is read-only or auto-saves, use a single “Done”/close action instead of a misleading Save button.
- The footer stays visible while the section body scrolls. Its controls must remain clickable even if the scroll container or drag-region system would otherwise intercept pointer events.

**Responsive behavior**

- At **560px or narrower**, reduce overlay padding to **12px**; header layout becomes **36px + 40px + flexible title**, with **10px** gaps and **16px 18px** padding.
- Reduce section padding to **18px 18px 6px**. Change label/control rows from two columns to one, with an **8px** gap and the control below the label.
- Footer uses **14px 18px** padding and its buttons flex to fill the available width equally. Keep the dialog inside the viewport and its body vertically scrollable.

**Interaction/accessibility contract**

- New implementations should expose the panel as a labelled modal dialog (`role="dialog"`, `aria-modal="true"`, and `aria-labelledby`), move focus into it on open, constrain keyboard focus while open, restore focus to the settings trigger on close, and support Escape when safe to dismiss.
- Give the back/close icon an accessible name such as “Back” or “Close settings”; a tooltip alone is not sufficient. Associate each visible label with its actual input and keep the helper sentence available to assistive technology.
- Define Save/Cancel semantics before coding. In the Prompt Studio reference, **Save settings** commits the staged preferences; **Cancel**, Back, Escape and backdrop dismissal close without saving. Use this same rule for new staged dialogs. Never silently mix draft state and auto-saving state in one dialog.
- Keep preferences scoped to the owning feature; Prompt Studio's settings must not unexpectedly change global defaults or another workspace's behavior.
- Respect reduced-motion and shared Appearance tokens in both the dialog and its controls.

**Portable structure reference** (placeholder IDs; wire state/commit/close behavior in the new app):

```html
<div class="your-feature-settings-overlay" hidden>
  <section class="ms-card ms-card--flat your-feature-settings"
           role="dialog" aria-modal="true" aria-labelledby="yourSettingsTitle">
    <header class="your-feature-settings-header">
      <button class="ms-icon-btn" type="button" aria-label="Back">…</button>
      <span class="ms-brand-tile" aria-hidden="true">…</span>
      <div>
        <h2 id="yourSettingsTitle">Prompt Studio settings</h2>
        <p class="ms-muted">Choose defaults for this workspace.</p>
      </div>
    </header>
    <section class="your-feature-settings-group">
      <h3 class="ms-eyebrow">Prompt defaults</h3>
      <p class="ms-muted">These preferences affect this tool only.</p>
      <!-- labelled .ms-input rows and accessible toggle rows -->
    </section>
    <footer class="your-feature-settings-actions">
      <button class="ms-btn" type="button">Cancel</button>
      <button class="ms-btn ms-btn--primary" type="button">Save settings</button>
    </footer>
  </section>
</div>
```

Here `your-feature-*` classes are intentional layout hooks, not built-in kit components. The current reference markup is `#instructionSettingsModal` in `src/renderer.html`; its open/save/cancel behavior is in `openInstructionSettings()`, `saveInstructionSettings()` and `closeInstructionSettings()` in `src/renderer.js`. The shared feature-dialog layout rules are in the “Feature settings dialogs” block near the end of `src/styles.css`. The same compact structure is used by AI Playground, Notes, To-do and Clips where appropriate.

#### Choose the right settings style

- Use **Full Global Settings** if the user must browse multiple categories, search across preferences, or configure app-wide behavior. Keep navigation persistent and settings content scrollable.
- Use **Compact Feature Settings** if the options only affect one tool and fit into a short grouped form. Preserve the current workspace behind a single modal and make commit/cancel behavior explicit.
- Both patterns must use the same `--ms-*` design tokens and `.ms-*` components. Do not copy Mad Station's old raw colours, hard-coded shadows or unrelated legacy CSS into a new app. Keep behavior and data ownership separate from presentation.


### Browser Controller Bar — Default AI Hub Pattern

This is the **canonical default design for browser controls** throughout Mad Station. Use the AI Hub browser controller above the active website as the visual and interaction reference. A workspace may adapt the layout to an embedded browser, but it must preserve this control order, hierarchy, and state behavior instead of inventing a different browser toolbar.

This component is **not** the Global Workspace Bar and not a page heading. It contains browser navigation and page-status controls. The operating-system window controls are a separate design system and are explicitly **outside this component**.

#### Structure and order

Read left to right:

`[Show/Hide sidebar] [Back] [Forward] [Reload/Stop] [Site icon + security + host/path + account label] [Open in browser]`

A thin loading-progress line runs along the bottom edge when the active page is loading. The address area is a read-only status display, not an editable URL input. Preserve the account context inside that field; do not add a separate session chip outside it.

#### Standard geometry

These measurements describe the AI Hub reference toolbar. Preserve them for the default browser-controller design; responsive changes should simplify labels before removing core controls.

| Element | Default size / treatment |
|---|---|
| Toolbar row | 50px high; 12px horizontal outer padding; 10px gap between major groups; 1px bottom divider |
| Sidebar toggle and browser action buttons | 34 × 34px hit area; 18 × 18px navigation glyphs; transparent resting background |
| Navigation cluster | Horizontal flex row; 2px gap between Back, Forward and Reload/Stop |
| Address/status field | Flexible width, min-width: 0, 34px high; pill shape (17px radius); 11px left and 6px right padding; 9px internal gap |
| Site icon | 18 × 18px slot; favicon/image rendered at 16 × 16px; hide the empty slot when no icon is available |
| Security indicator | 13 × 13px; muted lock for HTTPS and warning icon for a non-HTTPS URL |
| Host and path | 13px text; host is stronger/bolder, path/query is muted; truncate with ellipsis rather than pushing actions offscreen |
| Account label | Accent-tinted pill; 11px semibold text; 3px × 10px padding; maximum width 38% of the address field; ellipsize long names |
| Open in browser | Right-side action; 34px high; 15 × 15px external-link icon; 12px semibold label; 12px horizontal padding; 7px icon/label gap |
| Loading progress | 2px high accent line along the bottom edge; animate while a page is loading; never intercept pointer input |
| Window-control clearance | Reserve the existing top-right safe area. Do not let the address field or actions underlap it; this document does not define window-control appearance or sizing |

All colours, surfaces, borders, button treatments, focus rings and corner treatments must follow the active Appearance palette. Do not hard-code a new toolbar-specific colour, radius, or shadow. Keep controls in Electron's non-draggable region and give every icon-only control an accessible name and a useful title/tooltip.

#### Interaction and states

- **Show/Hide sidebar** toggles the workspace sidebar and updates its accessible name/title to the resulting action.
- **Back** and **Forward** are disabled when no account/page is active or when the web contents have no history in that direction.
- **Reload/Stop** is disabled until an account is active. While loading, replace the reload glyph with Stop, update the accessible name and tooltip to “Stop loading”, and show the progress line. When loading finishes, restore Reload.
- **Security and location** show nothing when there is no URL. For HTTPS, show a lock indicator; for a non-HTTPS URL, show a warning indicator. Display the hostname without a leading `www.` where possible; show the path and query in muted text and truncate long values.
- **Account label** is visible only when an account is active. The address field tooltip may expose the full page title and URL even though the visible address is truncated.
- **Open in browser** is disabled when there is no active account or URL. It opens the current page in the system's default browser; it is not a copy-link action.
- **Responsive behavior at 720px and below:** hide the “Open in browser” text and keep its icon-only 34px control; hide the account label; keep Back, Forward, Reload/Stop, address/status, and external-open accessible.
- Empty/disabled states must stay visually quiet but legible; disabled controls are not removed from the layout because that would cause the toolbar to jump.

#### Implementation reference and scope boundary

The separate browser toolbar is now mounted by `src/toolbar.html` and implemented in `src/toolbar-react/main.tsx` (React/TypeScript). Its layout-specific additions live in `src/toolbar-react/toolbar.css`; the established `.toolbar` / `.tb-*` design rules remain in `src/styles.css`.

- Sidebar toggle: `#tbSidebar` (`.tb-sidebar-toggle`)
- Navigation cluster: `.tb-nav`, `#tbBack`, `#tbForward`, `#tbReload` (`.tb-btn`)
- Read-only address/status field: `#tbAddress` (`.tb-address`), `#tbIcon`, `#tbSecure`, `#tbHost`, `#tbPath`, and `#tbAccount`
- External-open action: `#tbOpen` (`.tb-open`)
- Loading indicator: `#tbProgress` (`.tb-progress`)

The current toolbar window includes `.tb-window-controls` as a separate sibling group. **Do not include `#tbWindowMinimizeBtn`, `#tbWindowMaximizeBtn`, `#tbWindowCloseBtn`, `.tb-window-controls`, or `.window-control` in this Browser Controller Bar specification.** Their visual style, hit areas and interaction rules belong to the separate Window Controls system. Keep only enough reserved space to prevent overlap.

The embedded-browser kit classes `.ms-browser-toolbar`, `.ms-browser-nav`, `.ms-browser-tool-btn`, `.ms-browser-address`, `.ms-browser-address-lock`, `.ms-browser-address-location`, `.ms-browser-address-account`, and `.ms-browser-open-external` are the token-based adaptation for embedded contexts. The default AI Hub hierarchy is implemented across these workspaces:

- **Prompt Studio:** `.forge-browser-toolbar` uses the shared controller row, Back / Forward / Reload buttons, a read-only URL/status field with the selected account label inside it, a page-title hint, and an external-open action. The account rail remains the selector of record.
- **AI Playground:** each Arena browser uses `.arena-browser-toolbar` and the same 34px navigation controls. Keep the left/right account `<select>` inside `.arena-account-address`; account selection must not be removed or converted into a passive label. Each browser has its own external-open action.
- **Video Hub:** `.video-hub-browser-toolbar` is rendered by `src/renderer-react/video-hub-workspace-chrome.tsx` with the shared controller sizing, site/account address field, active account label, and external-open action. The React toolbar root is a sibling of the native browser slot; the account manager/sidebar remains independent.

For compact embedded workspaces, hide optional account labels and external-open text at the breakpoint before removing controls; keep selectors, address/status context, and the external-open icon available. Loading progress is displayed only when the owning browser state marks `.ms-browser-toolbar.is-loading`. This loading contract applies to Prompt Studio, Image Hub, Video Hub, and both Free Account Arena browser panes; each state must be driven by that view's actual navigation events and be cleared on completion or a non-aborted main-frame failure. AI Hub's separate toolbar uses its `.tb-progress` indicator driven by the active account's `loading` state. The Local AI Arena compares API/model responses and is not a website browser, so it does not need navigation progress. These variants must use the active Appearance tokens and keep existing renderer hooks / IPC actions intact. The separate AI Hub toolbar is currently styled through `.tb-*` rules in `styles.css`; moving that separate window fully onto the token/kit layers remains a migration task, not a reason to change this reference design.

### Global workspace bar patterns — Compact and Full

The **global workspace bar** is the top-left navigation and utility row that lets a user return to the Mad Station launcher and reach workspace-wide tools. It is separate from a page's content heading and from the operating-system window controls. Use one of these two named patterns; do not invent a third, slightly different header for each workspace.

Both variants share a visual and interaction contract:

- One horizontal row, vertically aligned, with the same order and meaning for shared controls wherever possible.
- **Back to launcher** is a navigation button, not browser Back. Give every icon-only control a meaningful `aria-label` and title/tooltip.
- The app icon identifies the current workspace. Keep the icon's app-specific hue, but derive its styling from the active palette/semantic hue tokens rather than hard-coded colours.
- The **performance monitor** is the same compact resource/RAM pill in both variants. Keep it aligned with the buttons; do not expand it into the full monitoring card in the header.
- Settings and Notifications remain icon-only. Anchor the unread-count badge to the notification button's top-right corner without changing the button's footprint.
- Keep all actual controls clickable and outside Electron's draggable region. Reserve the top-right window-control area; the header must never overlap or intercept minimize/maximize/close controls.
- All surfaces, borders, radii, focus states and hover states must respond to the active Appearance settings. New implementations follow the no-raw-colours rule and use the shared design tokens / `.ms-*` kit.

#### A. Compact Global Bar — AI Hub / Video Hub pattern

**Use for:** dense, sidebar-led workspaces where the product name is already obvious from context and horizontal space is valuable.

**Identity treatment:** show the workspace app icon only. Do **not** show an app-name label or tagline in this variant.

**Order, from left to right:**

`[Back to launcher] [App icon] [Performance monitor] [Settings] [Notifications + badge] [Collapse sidebar] [Optional Lock]`

The Lock control is conditional: include it only where that workspace supports locking. The sidebar-collapse control is conditional on the host having a collapsible sidebar. Keep the app icon and monitor next to one another so the identity and live system status read as a single compact group. The bar lives in the sidebar's own header row and should inherit that host surface; do not add a separate floating capsule unless the host design explicitly calls for one.

#### B. Full Global Bar — Prompt Studio pattern

**Use for:** standalone or content-focused workspaces where the workspace name should remain visible and orient the user even when they switch between tools.

**Identity treatment:** show the app icon followed by a two-line brand block: the app name, then an optional short uppercase tagline. The brand block must remain readable without forcing the action buttons offscreen.

**Order, from left to right:**

`[Back to launcher] [App icon + app name/tagline] [Performance monitor] [Settings] [Notifications + badge] [Keep window-control area clear]`

The app name is the primary identity: approximately **21px, weight 800, uppercase, with 0.2em letter spacing** in the standard wide layout. The tagline is secondary: approximately **10px, weight 600, uppercase, with 0.26em letter spacing**, using the muted text token. Keep about **10px** between the app icon and the brand text. On narrower windows, hide the tagline first and reduce the app name to about **17px**; do not remove the app icon, Back, Settings or Notifications just to preserve the tagline. This variant has no sidebar-collapse button unless the workspace actually owns a collapsible sidebar.

#### Shared geometry and responsive rules

These are the current design measurements for the two patterns. Preserve them when recreating either bar; do not choose unrelated sizes per workspace.

| Element | Standard size / rule |
|---|---|
| Back, Settings, Notifications, and other icon buttons | 36 × 36px; 17px icon glyph; 10px corner radius |
| Workspace app icon tile | 36 × 36px; 20px icon glyph; same corner radius as utility buttons |
| Horizontal gap between rail items | 8px; may tighten slightly at narrow widths |
| Performance monitor pill | 40px tall; at least 96px wide; horizontal layout |
| Monitor ring | 30px outer diameter; 22px inner diameter |
| Full-bar app-name / tagline gap | 5px vertically; 10px from icon tile to brand block |
| Full-bar control alignment | Centered on the same horizontal axis as the icon tile and monitor |
| Responsive priority | Hide the tagline first; keep essential navigation and utility actions reachable; avoid overlap with window controls |

The current implementation expresses the shared rail dimensions as `--rail-btn`, `--rail-glyph`, `--rail-gap`, `--rail-radius`, `--rail-pill-h`, `--rail-ring` and `--rail-ring-in` in `src/styles.css`. Treat these as the existing visual reference. When migrating this pattern into new kit components, keep the measurements centralized rather than creating per-page copies.

#### Current implementation references

These are references to the markup/hooks that currently render the patterns; they are **not** additional `.ms-*` kit classes and are not safe to copy with duplicate IDs.

- **Compact / AI Hub:** the `.sidebar > .brand` row in `src/renderer.html`; its Back button is `#openLauncherBtn`, icon is `.brand-mark-ai`, monitor mount is `#aiHubRamMonitorMount`, shared actions are `#settingsBtn` and `#notificationsBtn`, and the sidebar action is `#hideSidebarBtn`. `#lockBtn` is optional and may be hidden.
- **Compact / Video Hub:** `.video-hub-aside > .video-hub-brand`; its Back button is `#videoHubBackBtn`, workspace icon is `.brand-mark-ai`, monitor mount is `#videoHubRamMonitorMount`, shared actions are `#videoHubSettingsBtn` and `#videoHubNotificationsBtn`, and the sidebar action is `#videoHubHideSidebarBtn`. It uses the same icon-only identity treatment as AI Hub—no app-name label or tagline—and keeps Video Hub's own event handlers and notification badge.
- **Full / Prompt Studio:** `.forge-app-header` and `.app-header-cluster`; the Back button is `#instructionBackBtn`, identity is `.forge-brand-mark.app-icon-prompt` plus `.page-brand-text`, monitor mount is `#forgeRamMonitorMount`, and shared actions are `#instructionSettingsBtn` and `#instructionNotificationsBtn`.
- Preserve each destination's real event wiring, notification-badge behavior, keyboard/focus behavior and accessible names. Any new screen must use unique IDs and its own correct handlers rather than reusing IDs from these examples.


### AI Hub Provider & Account Sidebar System — Canonical Pattern

This is the **default design system for the left-side provider/account panel** in AI Hub. Use it whenever another workspace needs to browse providers, switch saved accounts, revisit recent sessions, or choose between a detailed list and a compact icon grid. The goal is to reuse this hierarchy and its visual measurements—not merely to make a sidebar that looks vaguely similar.

This system begins **below the Compact Global Bar**. The top Back/app-icon/performance/Settings/Notifications/sidebar-collapse row is governed by the preceding **Compact Global Bar** specification. The browser navigation row above the website is governed separately by **Browser Controller Bar**. Do not merge those three systems or duplicate their controls.

#### Information hierarchy and order

From top to bottom:

`[Compact Global Bar] → [Search accounts] → [Provider icon grid] → [All / Pinned / Groups filters] → [Recent accounts, when eligible] → [Account heading + count] → [Account list or icon grid] → [Add account]`

- **Search** narrows accounts by account name, URL, or provider name. Keep the search field visible while scrolling the account collection; show the clear action only when useful and retain the keyboard shortcut hint where space permits.
- **Provider grid** filters the collection. Start with **All**, then provider tiles in the user's provider order, then the dashed **Add provider** tile. Each provider count reflects saved accounts for that provider; All shows the total account count.
- **Organization filters** are a compact horizontal row: **All**, **Pinned**, and **Groups**. They refine the collection; they do not replace provider selection.
- **Recent accounts** is a transient shortcut row of up to five recently opened accounts, shown only when there is no search query, Pinned filter, or group filter. Each chip selects the existing saved account; it must not create a duplicate account or a separate login.
- **Account heading** communicates the current scope and result count (for example, All accounts, a provider name, or search results). Keep it visually quieter than the account names.
- **Account collection** is the primary scrollable region. The default **Comfortable** density uses full account rows; **Compact** density uses an icon grid. The global Density setting is the switch between these presentations—do not add a separate competing view toggle unless the host specifically requires one.
- **Add account** stays at the end of the collection. It is a full-width labelled action in Comfortable density and a square plus tile in Compact density.

#### Provider-filter icon grid

The provider selector is deliberately **icon-first**, not a row of text labels. It uses fixed square targets that can wrap to as many columns as the sidebar width permits. Provider names remain available through an accessible name and tooltip; do not depend on a hidden visual label alone.

| Element | Canonical reference size / treatment |
|---|---|
| Provider tile button | 42 × 42px; fixed square; 6px grid gap; 2px × 4px outer padding |
| Provider icon holder | 28 × 28px, centered; radius follows the icon/small-control tokens |
| Provider logo/image | 21 × 21px, `object-fit: contain`; preserve the provider's native proportions |
| Generic/fallback glyph | 17 × 17px, centered in the same icon holder |
| Account-count badge | At least 14 × 14px; 8px text; anchored to the tile's top-right corner without changing tile geometry |
| Provider label | Hidden visually in the dense grid; provider name remains in the button's accessible name/title |
| Add provider | Same tile dimensions; dashed outline and plus glyph; no count badge |
| Selected provider | Accent-tinted surface and accent border; `aria-selected="true"`; selection remains distinguishable in light and dark themes |

Provider tiles are ordered by the user's saved order. Dragging reorders providers horizontally; `Ctrl+Shift+Left/Right` is also supported in AI Hub. Preserve provider filtering, reorder handles/keyboard behavior, context-menu behavior, and accessible names when carrying this pattern to another page.

#### Account list — Comfortable density

Use a full-width, single-column collection with one clearly selectable row per saved account. The collection scrolls independently from the search, provider filters, recent shortcuts, and heading.

| Element | Canonical reference size / treatment |
|---|---|
| Account collection | Flexible remaining height; vertical scroll; 2px top / 4px horizontal / 10px bottom padding; 8px row gap |
| Account row / button | Full width; 64px high; 12px horizontal inner padding; 12px icon-to-copy gap |
| Provider icon holder | 40 × 40px; square-ish rounded holder using the icon-radius token |
| Provider logo/image | 26 × 26px, `object-fit: contain` |
| Account name | 13.5px, weight 700; single line with ellipsis |
| Provider subtitle | 11.5px, muted; single line with ellipsis |
| Trailing metadata | Group label, pinned star, and active/open state; muted by default, with accent reserved for meaningful state |
| Row overflow menu | 28 × 28px hit area, 14px glyph; appears on hover or keyboard focus, but remains reachable without a mouse |
| Add account row | Full width; minimum 52px high; dashed border; plus icon and visible “Add account” label |

The active account uses an accent-tinted surface and accent edge/border, not color alone: the selected account should also expose an accessible current/selected state. Hover may gently emphasize the row; never move it enough to impair target accuracy or make adjacent rows jump. Long account names and provider names truncate rather than widen the sidebar.

#### Account icon grid — Compact density

Compact density is a real alternate layout, not merely a smaller list. Each account becomes a square target; the provider logo carries the visual identity and the account name is available via a tooltip/focus popover. Respect the Accessibility setting **Always show account names**, which may restore the text even in Compact density.

| Element | Canonical reference size / treatment |
|---|---|
| Account grid | Responsive `auto-fill` columns with a minimum cell width of 50px; 7px gap; align tiles to the top |
| Account tile | Square (`aspect-ratio: 1 / 1`); centered icon; 6px inner padding |
| Provider icon holder | 32 × 32px |
| Provider logo/image | 23 × 23px, `object-fit: contain` |
| Hidden account copy | Name/provider text hidden by default in Compact density; reveal full name in a tooltip/popover on hover and keyboard focus |
| Tile options button | 22 × 22px, top-right inset; appears on hover/focus and does not obscure the provider logo |
| Add account tile | Same square grid cell; centered 26px plus glyph; visible text label is hidden only in this density |
| Reordering | Drag/drop markers indicate left/right insertion in the grid; keyboard/focus operations remain available where implemented |

Keep the same account identity, selection, favorite/pin state, provider association, context menu, and add-account action in both views. Changing density changes presentation only; it must not change login isolation, account ordering, selected account, or account data. If a tile is too narrow for text, do not force the text to wrap inside the icon grid.

#### Recent-account chips

Recent items are lightweight shortcuts, not full account cards. Render at most five in most-recently-used order. Use a small provider logo, a single-line account name, and a quiet outline/surface so the row does not compete with the main account collection.

| Element | Canonical reference size / treatment |
|---|---|
| Section label | 10px, weight 800, uppercase, 0.08em letter spacing; muted |
| Chip spacing | 6px between chips; allow wrapping onto another line when needed |
| Chip padding | 5px vertical / 8px horizontal; 11px account-name text |
| Provider logo/image | 16 × 16px; 6px gap between icon and name |
| Chip surface | Theme-aware surface with subtle border; hover strengthens the border/background; corners follow the active button/small-radius token |
| Visibility | Hide for active search, Pinned mode, or a group filter; do not show an empty Recent heading |

#### Shared visual language, states, and scrolling

- **Appearance:** follow the active Light/Dark/System theme, accent, surface material, corner style, button style, border, shadow, spacing, and Density options. Do not hard-code colors in a copied sidebar. Selected and pinned states must remain legible in solid, glass, elevated, and frosted surfaces.
- **Focus and pointer states:** provider tiles, account rows, recent chips, filters, add actions, and overflow buttons need clear keyboard focus. Maintain a practical pointer target even when the icon itself is only 16–23px.
- **Selected / active:** distinguish the selected provider and the open account with the accent token plus shape/border/state semantics. Do not use a provider's brand color as a replacement for selection state.
- **Pinned / grouped:** a pin can be subtle until active; group labels are compact and truncate. Pinned filtering must coexist with the provider filter and Group selection as the current implementation expects.
- **Image failure:** preserve the same icon slot if a provider logo fails to load; display the established fallback glyph instead of collapsing or shifting the tile/row.
- **Empty and no-match states:** explain what is missing and keep the Add account action available. Search “no matches” must be distinct from having no accounts at all.
- **Scrollable regions:** keep the top global bar, search, provider grid, filters, recent shortcuts, and list heading stable. The account list/grid takes the flexible remaining height and owns its vertical scrollbar. If a target page has many providers or a short viewport, cap and scroll the provider grid rather than allowing it to push accounts off-screen.
- **Window controls:** this system does not define minimize/maximize/close controls; they remain part of the separate Window Controls system.

#### Implementation references and reuse contract

Current AI Hub hooks in `src/renderer.html` / `src/styles.css` / `src/renderer.js`:

| Area | Existing hooks / behavior |
|---|---|
| Sidebar shell and top row | `.sidebar`, `.brand`, `.brand-mark-ai`; top-row button IDs are covered by Compact Global Bar |
| Search | `.search-wrap`, `#search`, `#searchClear`, `#searchKbd` |
| Provider selector | `#providerTiles`, `.tile`, `.tile-icon`, `.tile-count`, `data-provider-filter`, `data-reorder-type="service"` |
| Organization filters | `.org-bar`, `#orgAllBtn`, `#orgFavoritesBtn`, `#orgGroupFilter` |
| Recent shortcuts | `.recent-accounts`, `.recent-head`, `.recent-item`, `#recentAccounts`, `data-recent-id` |
| Heading and collection | `.list-head`, `#listTitle`, `.accounts`, `.account-row`, `.account-btn`, `data-account-id` |
| Account identity / metadata | `.account-icon`, `.account-text`, `.account-name`, `.account-sub`, `.account-end`, `.group-pill`, `.pin-pill`, `.live-pill` |
| Context menu / add action | `.more-btn`, `#ctxMenu`, `.accounts-end-add` |

These are **reference hooks**, not a prescription to duplicate AI Hub IDs into another workspace. For another page, create unique host IDs and preserve its current events/state wiring, then map the visual layer to `.ms-*` kit components and `--ms-*` Appearance tokens. Any new shared reusable component must be added to `src/design-kit.css` and documented here; keep page-specific CSS limited to layout. The current AI Hub styles include legacy hooks, so this spec describes the canonical design contract and measured reference—not a claim that every old declaration has already been migrated into token-only component classes.

Minimal page skeleton:

```html
<main class="ms-screen hidden" id="weatherScreen">
  <div class="ms-inner">
    <header class="ms-header">
      <button class="ms-icon-btn" id="weatherBack" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
      <div class="ms-brand">
        <div class="ms-brand-tile ms-brand-tile--sky"><svg viewBox="0 0 24 24"><!-- icon --></svg></div>
        <div class="ms-brand-text"><span class="ms-brand-name">Weather</span><span class="ms-brand-tag">Hub companion</span></div>
      </div>
      <div class="ms-header-actions"><button class="ms-btn ms-btn--sm">Refresh</button></div>
    </header>

    <div class="ms-tabs"><button class="ms-tab active">Today</button><button class="ms-tab">Week</button></div>

    <div class="ms-grid">
      <article class="ms-card">
        <div class="ms-card-head"><span class="ms-eyebrow">Now</span></div>
        <input class="ms-input" placeholder="City"/>
        <button class="ms-btn ms-btn--primary">Search</button>
      </article>
    </div>
  </div>
</main>
```

## Home screen systems: companions, mini apps, and widgets

### Modular Home connectors and Arrange motion

Home Core owns all visible signal wires. Do not add a static connector line on top of its SVG layer. Each Hub companion, mini app, and widget registers its own card as a connector endpoint; lines are recalculated from live card bounds while Arrange transitions run. Companion reordering uses CSS translate shifts, a pointer-following non-interactive ghost and a token-styled insertion marker without reparenting React-owned nodes. Arrange gestures use window-capture Pointer Events rather than native drag bitmaps or stage pointer capture. The current single mini app remains fixed until multi-tile positioning is implemented. Drop bounds are refreshed at release, transient drag state is cleared if the window loses focus, and preview offsets remain until React commits the reordered registry order. The widget drop outline is clipped to the launcher window inset; the canvas may expand only within the application content bounds.

For home-screen changes, begin with `docs/architecture/CORE_SYSTEM.md`; it is the single routing map for the project and contains copy-paste recipes for the three registries and the user-facing modular menu. The actual home systems stay independent:

- **Hub companions** are full cards on the left and are defined in `src/home-app-list.js`.
- **Mini apps** are icon-only shortcuts above AI Hub and are defined in `src/home-mini-list.js`. Their `name` is used only for tooltip/accessibility; do not add description/chips. The visible mini-app group is centered on the AI Hub core's vertical axis: a single mini app sits exactly on center, while multiple mini apps spread symmetrically around that axis. Desktop centering uses CSS individual `translate` rather than `transform`, because the shared `.home-module` entrance animation fills `transform` forwards and can override transform-based centering. Keep hover/press transforms vertical-only and clear individual `translate` in the narrow-layout override. `src/home-core-system.js` draws each signal line from the rendered tile center to the core, so retain the `data-app-id` tile hook and the `anchor: 'top'` link registration.
- **Widgets** are live right-column panels defined in `src/home-widget-list.js`; each supplies `id`, `title`, `size`, `order`, and `render(panel)`. The shared shell consumes the existing Appearance tokens. Once a free widget layout is saved, only the widget canvas extends from the fixed AI Hub boundary to the window edge after Arrange is closed and across app restarts; the Home stage grid, AI Hub circle, and companion rail keep their canonical dimensions.
- `src/home-core-system.js` coordinates the independent engines and owns their shared animated signal lines. Companions connect from the core's left arc, mini apps from its top arc, and right-side widgets connect from its right arc. During a widget drag, the widget engine resolves the line's source to the live preview; after drop or cancel it resolves back to the real React-owned shell. Additions belong in a registry, never in Core.
- `src/home-customizer.js` is the user-facing persistence/validation entry for personal module visibility, order, shortcut creation, widget sizing and complete-registry reordering. It calls the engines instead of rewriting registry definitions; preferences persist locally.
- `src/home-layout-editor.js` powers the separate Home **Arrange** control. It measures the live regions and draws bounded drop zones; companions reorder vertically in their left rail, the current single mini app stays fixed, and widgets move freely within their right-side canvas at a fixed size determined by the saved small/medium/large preset. While arranging, companion rows become compact, their height adapts to the actual rail/window size, and labels/descriptions/chips collapse to keep more apps visible at once. On desktop the Arrange stage keeps its canonical width, height, and grid tracks; only the widget canvas extends from the AI Hub right boundary to the window edge and uses the available vertical space. Each widget retains its saved size preset and only its position changes. The AI Hub and companion rail do not move or resize. At narrow widths, preserve the stacked page layout. The center AI Hub is visibly marked fixed. Do not allow a drag/drop operation to cross registry categories or overlap protected regions; preserve Home Core signal-line updates after reordering.

### Recipe: make the main menu user-modular

Start with `docs/architecture/CORE_SYSTEM.md` → “Customize the Home menu,” then edit the owner file identified there. Keep **Customize** as the detailed settings panel and **Arrange** as a separate mouse drag/drop mode. Arrange mode must expose role-locked boundaries, preserve the fixed AI Hub center, and allow ordering only within each enabled placement zone: compact adaptive companion rows vertically in the left rail, keep the current single mini app fixed above the core, and move widgets freely within the larger, scrollable widget canvas while preserving each widget size preset. On wide desktop windows only the widget canvas extends through the available right-side workspace to the window edge; never widen or re-track the Home stage, change the companion rail, or resize AI Hub. The widget canvas height must not be capped to the core diameter. At narrow widths retain the normal stacked layout and compact rail. Widget drag begins only from the dedicated handle so live panel controls remain usable. During a widget drag, render a non-interactive, fixed-size ghost preview at the prospective drop position and label it visibly until release; clear it on cancel, invalid-zone hover, or drag end. The widget's Core connector must target that same preview while it is moving, then reconnect to the saved widget after release. When a free-position layout has been saved, restore the expanded widget-only canvas outside Arrange and on startup so normalized coordinates at the far edges remain reachable; the Home stage/grid/AI Hub/companions must remain unchanged on Done. In the companion rail, use safe vertical centering when the cards fit and allow scroll overflow from the start when they do not. Reorder through `MadHomeCustomizer.reorder()`; it validates a complete unique set of current IDs and persists through the existing `mad-station-home-modules-v1` preferences instead of moving React-owned DOM nodes or changing registry definitions. Keep Done and Cancel reachable above all drop-zone overlays and handle them with ordinary click actions. Use Pointer Events (not native HTML drag-and-drop) for all Arrange gestures so pointer-up, cancellation, strict zone validation, and exit-button clicks remain reliable. Clear companion shift transforms atomically before submitting the registry reorder, then keep transitions suppressed until React reflects the expected order so old offsets cannot be applied to the new DOM slots.

Build the customizer and any future main-menu manager UI using the same token aliases used by the home screen (`--h-card-bg`, `--h-card-border`, `--h-r-card-lg`, `--h-btn-bg`, `--h-btn-bd`, `--h-card-shadow`, `--h-ink`, `--h-dim`, and `--h-faint`). Keep it accessible by keyboard, and confirm the overlay and its three module columns work in Light and Dark themes and in a narrow window. Never make the user-customization layer accept arbitrary code or external URLs as launch targets.

### Recipe: compact modular performance widget

`src/home-widget-list.js` registers both `ram-monitor` (the existing full monitor) and `performance-mini` (the small live meter). The compact widget consumes the same `data-memory-monitor`, `data-memory-scope`, and `data-memory-slot` contract as the established renderer telemetry updater; it must not create another timer or IPC poll. The user can hide, reorder and resize registered performance widgets through the Home customizer. Preserve `#launcherRamMonitorMount` and every existing `data-memory-*` integration hook when changing the full monitor.

### Recipe: add a Hub companion

Copy an `add({ id, name, description, chips, iconSvg, launch, order })` entry in `src/home-app-list.js`. Its `launch` must be a target handled by `openWorkspaceApp()` or it must provide a custom `open(app)`. Do not use a `dock: 'top'` flag; icon-only shortcuts belong in the Mini apps registry.

### Recipe: add a mini app

Copy an `add({ id, name, iconSvg, launch, color, order })` entry in `src/home-mini-list.js`. Required fields are `id`, `name`, `iconSvg`, and `launch`; `color` and `order` are optional. Names are tooltips/accessibility labels. Keep the entry icon-only and let `src/home-core-system.js` draw its signal line.

### Recipe: add a widget

Copy an `add({ id, title, size, order, render(panel) { ... } })` entry in `src/home-widget-list.js`. `size` is `small`, `medium`, or `large`. Build content using DOM APIs and token-backed styles. The shared widget shell handles surfaces, corners, borders, shadows, and overflow. The RAM monitor must remain a wrapper around the existing `#launcherRamMonitorMount` and its `data-memory-*` hooks; do not fork its telemetry pipeline.

Run `npm test` after changes and follow the verification route in `docs/architecture/CORE_SYSTEM.md`, including Light/Dark and at least one glass/neon, sharp/square and narrow-window check for home layout changes.

## 5. Recipe: build a new app / page

Say to the AI: *"Build a [Weather] app in this app's design system. Follow
docs/design/DESIGN_SYSTEM.md."* The steps it must follow in this codebase:

1. **Markup** in `src/renderer.html`: add a `<main class="ms-screen hidden" id="…Screen">`
   next to the other screens (skeleton above). Only kit classes; no inline `style=`.
2. **Layout-only CSS** (if any) in `src/design-kit.css` as new documented `.ms-*`
   classes, using tokens. App-specific CSS must not set colours, radii or shadows.
3. **Show/hide** in `src/renderer.js` → `updateWorkspaceView()`: add
   `$('…Screen').classList.toggle('hidden', currentApp !== '<app-id>');` and a
   title branch for `document.title`.
4. **Open** in `src/renderer.js` → `openWorkspaceApp(appId)`: add a case that sets
   `currentApp`, calls `updateWorkspaceView()` and `window.aiHub.setWorkspaceApp('<app-id>')`.
5. **Main process** `src/main.js`: add `<app-id>` to `VALID_WORKSPACE_APPS` (and to
   the `startupWorkspace` allow-list if it may be a startup page).
6. **Home screen**: read `docs/architecture/CORE_SYSTEM.md` first, then use the matching recipe for a full companion (`src/home-app-list.js`), icon-only mini app (`src/home-mini-list.js`), or live widget (`src/home-widget-list.js`). The item registries are separate and the shared signal-line behavior is coordinated by `src/home-core-system.js`.
7. **Back button** calls the existing `goToLauncher()`.
8. **Verify:** `npm test`, then open the app and switch through Appearance
   (Light/Dark, an accent, glass + neon, sharp/square corners, compact density).
   Also open `docs/design-kit-preview.html` if you added a kit class.

The built-in **Video Hub** (`video-hub`) follows the AI Hub layout. Its account sidebar begins with the shared **Compact Global Bar**: Back to launcher, Video Hub app icon, compact performance monitor, Video Hub Settings, Notifications with unread badge, and collapse-sidebar action. This bar is icon-only and intentionally omits the app-name label and tagline. Its hooks are `.video-hub-brand`, `#videoHubBackBtn`, `.brand-mark-ai`, `#videoHubRamMonitorMount`, `#videoHubSettingsBtn`, `#videoHubNotificationsBtn`, and `#videoHubHideSidebarBtn`. The main area has a separate page header with the Video Hub name and `.ms-tabs`, an account sidebar (`.ms-input` search, `.ms-tabs` site filter and All/Pinned filter, recents, `.ms-row` account rows with `.ms-brand-tile` avatars and pin buttons) and a large browser panel; the Add Accounts tab has `.ms-stat` counters, a quick-start `.ms-grid` of site `.ms-card`s and the add-account/add-site forms. Pins, recents, site filter and the collapsed sidebar are UI-only preferences kept in renderer local storage (`madstation.videoHub.ui.v1`); the account presentation preference (`grid` or `list`, default `grid`) is saved in the Video Hub settings record (`madstation.videoHub.settings.v1`) and exposed as **Account view** in Video Hub Settings. The Video Hub Settings surface uses the shared **Compact Feature Settings** modal pattern: a centered feature dialog, branded icon/title, grouped workspace and safety settings, staged edits, sticky Save/Cancel actions, focus trapping, Escape/backdrop cancellation, and focus restoration. Its open/close flow must continue calling `window.aiHub.videoHubSettingsOverlay(true/false)` so the embedded browser view is positioned below the modal. The additive sidebar code lives in `decorateVideoHub()` in `renderer.js` and never replaces the account/site functions. It uses the shared `.ms-card` surfaces for its account manager and browser panel, `.ms-browser-toolbar` and `.ms-browser-address` for browser controls, and `.ms-browser-frame` for the embedded content boundary. The studio toolbar places token-styled navigation buttons on the left, the provider icon / secure-site host / account label in one address field, and an `Open in browser` button on the right. Do not add a separate session chip or replace the external-open action with a copy-link button. Its workspace-specific rules are layout-only. As of v27, the main header/tab row, browser toolbar/active-account status and Add Accounts summary counters are React-owned by `src/renderer-react/video-hub-workspace-chrome.tsx`, while `src/renderer.js` keeps the snapshot/action bridge and native browser layout. It is a full workspace for managing video-generator sites and account profiles. Its shell uses `.ms-screen`, `.ms-inner`, `.ms-header`, `.ms-card`, `.ms-row`, `.ms-btn`, `.ms-input`, `.ms-chip`, `.ms-title`, `.ms-eyebrow`, `.ms-muted`, `.ms-empty`, and `.ms-section-title`; Video Hub-specific CSS is layout-only and preserves `video-hub-*` hook classes for layout and JavaScript compatibility. Each account receives a separate persistent Electron session partition (`persist:video-hub-<account-id>`) and has independent login reset/deletion actions. Provider/account metadata is stored in `video-hub-accounts.json`; authentication cookies and site storage remain in that account's own Chromium partition rather than renderer local storage. The built-in site list is informational and free-tier allowances may change at each provider.


### Video Hub account sidebar — List / Icon grid presentation

Video Hub's left provider/account sidebar reuses the **AI Hub Provider & Account Sidebar System** while offering a workspace-local **Account view** setting in Video Hub Settings. This view choice is separate from global Density and is persisted under `madstation.videoHub.settings.v1.accountView`; changing it affects presentation only. Default to `grid` to preserve the existing compact presentation for existing users and for users without a saved preference.

- **Icon grid:** responsive `auto-fill` cells with a 56px minimum; 7px gaps; centered 40px account icon-holder (provider artwork at 26px); an unobtrusive 22px options target in the upper-right; account name/provider in an accessible name and tooltip/focus popover; pinned star overlaid near the lower-right.
- **List:** one full-width row per account, 60px high with 7–10px padding; 40px icon holder and 26px provider logo; account name at 12.5px bold with ellipsis; provider label at 10.5px muted; a compact “Pinned” indicator when pinned; an “Active” state indicator for the selected account; and a 28px options-menu target revealed on hover or focus.
- Both presentations preserve provider filters, All/Pinned filters, search, recent-account shortcuts, active account identity, context-menu actions, pinning, sorting, and isolated browser sessions. The list/grid setting must not create or reset accounts, change account order, or sign a user in/out.
- **Settings control:** a labelled select named **Account view** with **Icon grid** and **List** options, grouped under Workspace. Stage edits in the Compact Feature Settings dialog; **Save settings** commits them locally and updates the sidebar, while **Cancel**, Back, Escape, or backdrop dismissal discards unsaved changes. Populate the controls from the saved preferences every time Video Hub Settings opens.
- **Video Hub Settings dialog:** use `.feature-settings-modal.video-hub-settings-modal` and the shared `.ms-card.ms-card--flat.clipboard-settings-card` structure, with `.clipboard-settings-heading`, `.ms-brand-tile` feature icon, grouped `.clipboard-settings-section` content, `.toggle-row` switches, and sticky `.clipboard-settings-actions`. Keep all preferences scoped to Video Hub. Restore focus to the gear button on close, trap Tab navigation within the dialog, and preserve the Video Hub browser-view overlay coordination in the main process.
- Retain the same shared Appearance tokens, active-row accent treatment, clear keyboard focus ring, reduced-motion compatibility and responsive behavior in both modes. Workspace-specific CSS should only add the structure/layout required for each view and should not hard-code a separate theme.

### Image Hub workspace

Image Hub (`image-hub`) is a curated image-tool workspace and home-screen companion. It follows the **Video Hub layout** and the three canonical patterns above; its Image Hub-specific CSS is layout-only and consumes the shared Appearance tokens. Its screen is `#imageHubScreen`; visibility/title routing lives in `updateWorkspaceView()` and `openWorkspaceApp()` in `src/renderer.js`.

- **Compact Global Bar:** `.image-hub-aside > .image-hub-brand` holds Back (`#imageHubBackBtn`), the Image Hub icon (`.brand-mark-ai`), the performance monitor (`#imageHubRamMonitorMount`), Settings (`#imageHubSettingsBtn`), Notifications with badge (`#imageHubNotificationsBtn`, `#imageHubNotificationBadge`) and collapse sidebar (`#imageHubHideSidebarBtn`). Icon-only, no name or tagline. The rail rules in `styles.css` and the sidebar rules in `design-kit.css` list `image-hub` selectors alongside the `video-hub` ones; keep them in sync.
- **Sidebar:** search (`#imageHubSearch`, filters accounts), a 42px provider icon-tile grid with account counts (`#imageHubProviderTiles`, `data-image-provider-filter`; the All tile plus every tool that has an account), category filters (`data-image-filter`: All / Generate / Edit / Upscale), and the account list (`#imageHubAccountList`) where each row shows the provider icon, account name, tool name and an Active state. Provider icons use the shared `iconMarkup()` fallback chain (site favicon, root-domain favicon, favicon services, default icon). There is no add-account control in the sidebar. The first time Image Hub opens it creates one default account per built-in tool (`madstation.imageHub.seeded.v1`) so the sidebar has accounts to preview.
- **Main area:** `.image-hub-header` with the sidebar toggle (`#imageHubSidebarToggle`) and `.ms-tabs` — **Image Studio** (browser) and **Add Account** (tool cards with provider icons and a one-click `+ Add account`, the add-account form `#imageHubNewProvider` / `#imageHubNewName` / `#imageHubAddAccountBtn`, and the add-another-tool form `#imageHubAddForm`).
- **Browser Controller Bar:** `#imageHubBrowserToolbar` (`.ms-browser-toolbar.image-hub-browser-toolbar`): Back, Forward, Reload/Stop (`#imageHubBrowserBack`, `#imageHubBrowserForward`, `#imageHubBrowserReload`), a read-only address/status field (site icon, lock/warning, host + muted path, account label) and `Open in browser` (`#imageHubBrowserExternal`). The address is not editable; pages open when an account is selected in the sidebar. `.is-loading` shows the progress line.
- **Settings:** Compact Feature Settings modal (`.feature-settings-modal.image-hub-settings-modal`) with staged Save/Cancel, focus trap, Escape/backdrop cancel and focus restoration.
- **Storage:** custom tools, favorites, accounts, preferences and UI state live under `madstation.imageHub.*.v1` renderer-local keys. Each account uses the partition `persist:image-hub-<account-id>` through a renderer `<webview>`.

## 6. Checklist: migrate an old section to the design system

Say to the AI: *"Migrate [section] to the new design system. Follow the
migration checklist in docs/design/DESIGN_SYSTEM.md. Change styling and structure only,
never behaviour."*

1. Find the section's markup (`renderer.html`) and every CSS rule that styles it
   (`grep` its classes in `styles.css`).
2. Keep all `id`s and `data-*` attributes (JavaScript and tests depend on them).
3. Swap legacy classes for kit classes: container → `.ms-card`/`.ms-card--flat`,
   buttons → `.ms-btn`/`.ms-btn--primary`/`.ms-btn--sm`, fields → `.ms-input`,
   tabs → `.ms-tabs`/`.ms-tab`, list items → `.ms-row`, full-window pages → `.ms-screen`.
4. In the old CSS delete every declaration the kit now provides (background,
   border, border-radius, box-shadow, colours, font weights on controls). Keep
   only **layout** (grid/flex, widths, spacing between children).
5. Replace any remaining raw value with a token or palette variable.
6. If `.ms-screen` would change an existing `z-index`, set `--ms-screen-z` on that
   screen instead of fighting the kit.
7. Run `npm test`. Check Light + Dark and two contrasting Appearance combos.
8. Remove dead selectors left behind in `styles.css`.
9. Add regression checks for preserved IDs, `data-*` hooks, keyboard handlers, kit-class usage, and token-only surfaces. Inspect Light and Dark, glass + neon, and sharp/square + compact variants; automated checks cannot replace a live Electron visual inspection.

Worked example (done): **Settings** — `settings-screen ms-screen` (`--ms-screen-z: 50`), cards `ms-card ms-card--flat`, nav tabs and segmented controls `ms-tab`/`ms-tabs`, buttons `ms-btn`, fields and dropdowns `ms-input`, page titles `ms-title`, count pills `ms-chip`. Legacy hook classes (`card`, `row`, `settings-tab`, `segmented`, …) stay because JavaScript and layout rules use them.

Worked example (done): **Feature settings dialogs** (Clips, Notes, To-do, Prompt Studio, AI Playground) — `ms-card ms-card--flat` panel, `ms-brand-tile` icon, `ms-icon-btn` back button, `ms-eyebrow` section titles, `ms-input` fields, `ms-btn` actions. Their layout lives in one block at the end of `styles.css` ("Feature settings dialogs").

Worked example (done): **Lock screen**. Before: bare `.lock-card` with
hard-coded input colours and a 9px radius. After: `lock-screen ms-screen`,
`lock-card ms-card ms-card--flat`, `ms-input`, `ms-btn ms-btn--primary`,
`ms-btn ms-btn--sm`. `styles.css` keeps only layout and `--ms-screen-z: 300`.

## 7. Migration backlog (design reference documented; implementation work remains)

| Section | Where | Notes |
|---|---|---|
| Browser controller toolbar | `src/toolbar.html`, `.tb-*` in `styles.css` | The default AI Hub Browser Controller Bar is specified above, but the separate window still uses legacy `.tb-*` styling and loads only `styles.css` plus `appearance.js`. A future migration can load the token/kit layers and move visual styling into shared tokens. Keep the separate Window Controls system intact; its CSS is covered by tests. |
| AI Hub Provider & Account Sidebar | `.sidebar`, `#providerTiles`, `#accounts`, `.recent-accounts` in `src/renderer.html` / `src/styles.css` | The provider/account layout is now the canonical design reference. Its legacy hook styles should migrate toward shared `.ms-*` components and token-only visual declarations without changing provider filtering, account selection, recent-account state, context menus, ordering, or density behavior. |
| Downloads list | `.dl-card`, `.dl-list`, `.dl-row`, `.dl-empty` in `styles.css` | The modal shell is skinned; the rows still use fixed radii and colours. Use `.ms-row` / `.ms-empty`. |
| Leftover legacy rules | `styles.css` (about 150 hex colours) | Mostly the core palette plus older layers. Clean up as sections migrate. |

## 8. Guardrails

`tests/design-system.test.js` (part of `npm test`) fails when: Appearance
options and token rules drift apart, a token or kit class is missing from this
document, the kit contains raw colours or `url()`, an Appearance mapping is
re-declared outside `design-tokens.css`, a retired `--p-*` token returns, or a
`var(--ms-…)` points at an undefined token.
