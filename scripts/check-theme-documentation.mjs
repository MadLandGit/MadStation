import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const switcher = read('src/home-page-switcher.js');
const block = switcher.match(/const HOMEPAGE_STYLE_OPTIONS\s*=\s*\[([\s\S]*?)\n\s*\];/);
if (!block) throw new Error('Could not find HOMEPAGE_STYLE_OPTIONS in src/home-page-switcher.js');
const themes = [...block[1].matchAll(/\{\s*id:\s*['"]([^'"]+)['"]\s*,\s*label:\s*['"]([^'"]+)['"]/g)].map((m) => ({ id: m[1], label: m[2] }));
const appearanceSource = read('src/renderer-react/appearance-controls.tsx');
const appearanceBlock = appearanceSource.match(/const HOMEPAGE_STYLES\s*=\s*\[([\s\S]*?)\n\] as const;/);
if (!appearanceBlock) errors.push('Could not find HOMEPAGE_STYLES in src/renderer-react/appearance-controls.tsx');
const appearanceThemes = appearanceBlock ? [...appearanceBlock[1].matchAll(/\{\s*id:\s*['"]([^'"]+)['"]\s*,\s*label:\s*['"]([^'"]+)['"]/g)].map((m) => ({ id: m[1], label: m[2] })) : [];
const appearanceMap = new Map(appearanceThemes.map((theme) => [theme.id, theme.label]));
for (const theme of themes) { if (appearanceMap.get(theme.id) !== theme.label) errors.push(`Appearance picker registry mismatch for ${theme.id}: runtime label=${theme.label}, picker label=${appearanceMap.get(theme.id) ?? 'missing'}`); }
for (const theme of appearanceThemes) if (!themes.some((item) => item.id === theme.id)) errors.push(`Appearance picker has a non-runtime built-in theme: ${theme.id}`);
const pickerCss = read('src/styles.css');
for (const theme of themes) if (!pickerCss.includes(`.homepage-style-preview--${theme.id}`)) errors.push(`Missing Appearance picker preview CSS for ${theme.id}`);
if (themes.length !== 10) errors.push(`Expected 10 selectable built-in homepage themes, found ${themes.length}. Update the documentation policy if the product inventory intentionally changes.`);
const catalog = read('docs/design/HOMEPAGE_THEME_CATALOG.md');
const gallery = read('docs/design/homepage-theme-gallery.html');
if (!exists('docs/design/theme-kits/legacy.html')) errors.push('Missing diagnostic kit for internal Default/legacy renderer mode');
if (!catalog.includes('theme-kits/legacy.html')) errors.push('Catalogue does not link to the Default/legacy diagnostic kit');
if (!gallery.includes('theme-kits/legacy.html')) errors.push('Gallery does not link to the Default/legacy diagnostic kit');
for (const { id, label } of themes) {
  const kit = `docs/design/theme-kits/${id}.html`;
  if (!exists(kit)) errors.push(`Missing per-theme kit: ${kit}`);
  if (!catalog.includes(`\`${id}\``) || !catalog.includes(label)) errors.push(`Catalogue misses theme ID/label: ${id} / ${label}`);
  if (!gallery.includes(`theme-kits/${id}.html`)) errors.push(`Gallery misses link to ${id} kit`);
}
const markdownFiles = [];
function walk(dir) { for (const ent of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const rel = path.posix.join(dir, ent.name); if (ent.isDirectory()) walk(rel); else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) markdownFiles.push(rel); } }
walk('docs');
markdownFiles.push('README.md', 'AGENTS.md', 'CLAUDE.md');
const checked = new Set();
for (const rel of markdownFiles) {
  if (!exists(rel)) continue;
  const text = read(rel).replace(/```[\s\S]*?```/g, '');
  for (const m of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = m[1].trim().split(/\s+['"]?/)[0];
    if (!target || /^(?:https?:|mailto:|tel:|data:|#)/i.test(target)) continue;
    target = target.replace(/&amp;/g, '&').split('#')[0].split('?')[0];
    if (!target) continue;
    const abs = path.resolve(path.dirname(path.join(root, rel)), decodeURIComponent(target));
    if (!abs.startsWith(root + path.sep) && abs !== root) { errors.push(`${rel}: link escapes repository: ${m[1]}`); continue; }
    const normalized = path.relative(root, abs).split(path.sep).join('/');
    checked.add(`${rel} -> ${normalized}`);
    if (!fs.existsSync(abs)) errors.push(`${rel}: missing local link target ${m[1]} (resolved ${normalized})`);
  }
}
const htmlFiles = [];
function walkHtml(dir) { for (const ent of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const rel = path.posix.join(dir, ent.name); if (ent.isDirectory()) walkHtml(rel); else if (ent.isFile() && ent.name.toLowerCase().endsWith('.html')) htmlFiles.push(rel); } }
walkHtml('docs');
for (const rel of htmlFiles) {
  const html = read(rel);
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = m[1];
    if (/^(?:https?:|mailto:|data:|#|javascript:)/i.test(target)) continue;
    const abs = path.resolve(path.dirname(path.join(root, rel)), target.split('#')[0].split('?')[0]);
    if (!abs.startsWith(root + path.sep) && abs !== root) { errors.push(`${rel}: local HTML link escapes repository: ${target}`); continue; }
    if (!fs.existsSync(abs)) errors.push(`${rel}: missing local HTML target ${target}`);
  }
}
if (errors.length) {
  console.error(`Documentation/theme check failed with ${errors.length} issue(s):`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`Documentation/theme check passed: ${themes.length} source themes synchronized with the Appearance picker and preview CSS; ${themes.length} selectable kits plus the legacy diagnostic kit; catalogue/gallery coverage; ${checked.size} local Markdown links; and all local HTML targets across docs.`);
