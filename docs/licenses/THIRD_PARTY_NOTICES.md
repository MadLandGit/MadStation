# Third-party notices

## Public Suffix List

Mad Station includes Public Suffix List data with ICANN and PRIVATE rules. It is distributed under the Mozilla Public License 2.0 (MPL-2.0); the license text is provided in `docs/licenses/MPL-2.0.txt`.

Upstream: https://publicsuffix.org/list/public_suffix_list.dat
Bundled upstream version: 2026-10-16_09-29-46_UTC
Upstream commit: 91b4bd846240a84afb33695d5a51adcbc4cfd9ca
Refresh with `npm run update:psl`.

## sprintf-js (Mad Station local security maintenance patch)

- **Source:** `vendor/sprintf-js/` and `vendor/sprintf-js-1.1.4+madstation.1.tgz`
- **Upstream project:** https://github.com/alexei/sprintf.js
- **Upstream base version:** 1.1.3
- **Local version label:** `1.1.4+madstation.1` (private Mad Station maintenance build; not an official upstream release)
- **License:** BSD 3-Clause; see `vendor/sprintf-js/LICENSE`.
- **Local change:** clamps out-of-range precision for numeric `e`, `f`, and `g` conversions to avoid passing invalid precision into JavaScript numeric formatting methods. Tests cover extreme precision and standard formatting. This is a local defensive mitigation for the GitHub-listed advisory, whose report/CVE classification is publicly disputed upstream.
- **Integrity:** the tarball is pinned with SHA-512 in `package-lock.json`; `scripts/check-dev-environment.mjs` and the full Diagnose Startup workflow verify the same digest. Replace this local patch with a reviewed official upstream fix when available.

