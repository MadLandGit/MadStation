# Mad Station maintained `sprintf-js` security patch

This vendored package is based on upstream `sprintf-js` 1.1.3 and retains the upstream BSD-3-Clause license (see `LICENSE`). It is assigned the private version `1.1.4+madstation.1` so the lockfile and npm audit can distinguish the patched copy from the published vulnerable release; it is **not** an official upstream release.

## Patch

The code bounds precision values for the `e`, `f`, and `g` numeric format specifiers before passing them to JavaScript's number formatting methods. Numeric precision above 100 is clamped to 100, and precision `0` for `%g` is clamped to 1; valid precision values remain unchanged. This prevents out-of-range precision from reaching `toFixed`, `toExponential`, or `toPrecision` and causing the reported `RangeError`. The string-formatting precision path is unchanged.

This patch mitigates the reported unbounded numeric precision path by clamping the affected precision inputs before numeric formatting. Callers should still use trusted format strings or handle formatting errors: `sprintf-js` intentionally throws for other malformed format strings.

## Upstream status

This fork is a local release-maintenance patch because the GitHub advisory still lists no patched upstream release, while upstream maintainers have publicly disputed the report. The app keeps the targeted clamp as a defensive, narrow behavior change. Re-evaluate the override when the upstream advisory and release status are resolved.
