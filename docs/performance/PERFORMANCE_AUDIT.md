# Mad Station performance audit and fixes

Date: 2026-10-21
Project: Mad Station 1.6.3

## Verified source-level findings addressed

### 1. Particle-link animation used a square root for every possible point pair

Files: `src/home-v3.js`, `src/home-v4.js`, `src/home-parallax-background.js`.

Each animation compares each dot with later dots to decide whether to draw a connecting line. Previously each pair called `Math.hypot(...)` before the distance threshold was checked. With `n` dots this involves `n(n-1)/2` pair checks per frame (up to 4,005 pairs for 90 dots), including distant pairs that never draw anything. The code now compares squared distance with a cached squared radius and calculates `Math.sqrt` only for nearby pairs that actually draw a line. The visual thresholds and opacity falloff remain unchanged.

Expected benefit: fewer expensive operations in three animation hot paths, especially on large displays or slower CPUs. No measured frame-time percentage is claimed because a renderer benchmark could not be run in this environment.

### 2. Canvas animation re-resolved CSS colors every frame

Files: `src/home-v3.js`, `src/home-v4.js`, `src/home-parallax-background.js`.

The animation loops repeatedly called `getComputedStyle()` and, in the parallax background, parsed the accent color string every frame even though the accent changes only when appearance/theme styles change. These values are now cached and invalidated when body/root theme-related attributes or the parallax background's appearance state changes. This removes per-frame style resolution and string parsing from those loops while preserving the existing theme-update path.

### 3. Home connector layout repeatedly queried card geometry

File: `src/home-core-system.js`.

`drawLinks()` previously called `getBoundingClientRect()` indirectly through `bounds(...)` inside sort comparators and then measured the same elements again while grouping and drawing connectors. The function now calculates each connected element's bounds once per draw and reuses the cached values for sorting, grouping, and endpoints. This reduces repeated layout reads and makes the sort comparator a pure in-memory comparison.

Expected benefit: less repeated layout work when home modules move, resize, or the connector layer refreshes. The connector routing and grouping rules are unchanged.

## Existing optimizations confirmed during review

- `src/home-page-switcher.js` lazily loads a selected home frame and unloads inactive frames marked for unloading, preventing hidden theme pages from running their own render loops.
- The connector refresh is requestAnimationFrame-coalesced instead of drawing for each individual refresh trigger.
- Existing appearance bridges keep the 3D parallax CSS animation color synchronized with accent settings; cache invalidation now listens to style/theme mutations rather than polling computed styles each frame.
- The isometric-world renderer already contains adaptive device-pixel-ratio behavior and visibility culling; it was left intact to avoid changing a complex rendering system without runtime profiling evidence.
- Memory sampling is interval-based and has a re-entrancy guard; no leak or runaway sampling could be established from source alone.

## Validation and limits

- Added `tests/home-performance-optimizations.test.js` to guard the squared-distance check, cached appearance colors, and single-measurement-per-element approach. The test is included in the project `npm test` script.
- Node syntax checks passed for all four modified runtime JavaScript files, and 72 targeted existing/static test cases passed.
- Full `npm test`, production build, bundle analysis, and Electron runtime profiling were not run: `npm ci --ignore-scripts --no-audit --no-fund` could not reach the npm registry in this environment (DNS/network error), leaving dependencies unavailable. Therefore dependency-specific performance issues, production bundle size, real frame-time improvement, and production CPU/memory/latency behavior remain unverified.
- Documentation-link validation is separate from runtime performance validation. Frame-time improvement and production CPU, memory, and latency behavior remain unverified by this audit.
- The previous web-research report included example class/file names that do not exist in this project. They are not treated as confirmed findings here.

## Recommended next validation on a network-enabled development machine

1. Run `npm ci` using Node 22.16.0 (the version specified by `.node-version`) and `npm test`.
2. Run the normal release build and compare bundle/build artifacts before and after this patch.
3. Profile a production build in Electron on the same screen size and home themes before/after. Compare p95 frame duration and renderer CPU with the 3D Parallax, V3, and V4 themes active, plus connector refresh while arranging home modules.
4. Capture Electron process CPU/memory and renderer traces over a longer session if users still report performance degradation. A source-only scan cannot verify runtime leaks or load-dependent stalls.
