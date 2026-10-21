# Claude Code instructions

Start with **`docs/architecture/CORE_SYSTEM.md`** for every task. It is the single routing map for the repository and identifies the owning implementation, related contracts, and tests.

The maintained, canonical instruction set is in `AGENTS.md`. Import it rather than duplicating or diverging from its rules:

@AGENTS.md

For visual work, follow `docs/design/DESIGN_SYSTEM.md`; never write raw colours, radii, shadows, or button looks.


For homepage themes, consult `docs/design/HOMEPAGE_THEME_CATALOG.md` and `docs/design/homepage-theme-gallery.html`; each built-in theme has a dedicated `docs/design/theme-kits/<id>.html` kit. Run `npm run docs:themes:check` after updating theme documentation.
