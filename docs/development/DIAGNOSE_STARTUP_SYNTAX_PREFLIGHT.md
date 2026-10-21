# Diagnose Startup syntax preflight — v76

`+ Diagnose Startup.cmd` now runs `scripts/check-diagnose-startup-syntax.ps1` before executing `scripts/diagnose-startup.ps1`. The checker calls PowerShell's built-in AST parser and prints each syntax error's line and column. If parsing fails, the launcher stops before attempting dependency checks, test runs, build, or Electron startup.

The v75 parser failure was caused by a single-quoted string containing the apostrophe in `npm's` in the installed-lock-marker warning. That string now uses double quotes. The launcher's regression test checks that the syntax preflight is wired in.

This environment does not have Windows PowerShell / `pwsh`, so the AST parser itself was not executed here. On Windows, the syntax preflight is the first runtime check and must print `PASS PowerShell parser accepted scripts\diagnose-startup.ps1.` before the full workflow starts.
