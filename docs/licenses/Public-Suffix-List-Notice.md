# Public Suffix List data notice

Mad Station bundles the Public Suffix List (PSL), including ICANN and PRIVATE rules, in `src/main/public-suffix-list.ts`. It is used for authentication-domain allowlist normalization, not as a general URL trust policy.

- Upstream project: [Public Suffix List](https://publicsuffix.org/list/)
- Authoritative source: <https://publicsuffix.org/list/public_suffix_list.dat>
- Bundled upstream version: `2026-10-16_09-29-46_UTC`
- Upstream commit: `91b4bd846240a84afb33695d5a51adcbc4cfd9ca`
- Data license: Mozilla Public License 2.0; see `MPL-2.0.txt`.
- Refresh command: `npm run update:psl` (uses only the official URL and rejects redirects).

The PSL is maintained over time. Refresh the data before security-sensitive releases and rerun the auth-domain/PSL regression suite.
