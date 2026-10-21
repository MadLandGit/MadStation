# Validate the canonical diagnostics script before Windows PowerShell executes it.
# This catches parser errors before the full diagnostic workflow can start.
$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot 'diagnose-startup.ps1'
if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
    Write-Host ("ERROR: Diagnostics script not found: {0}" -f $target) -ForegroundColor Red
    exit 2
}

$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($target, [ref]$tokens, [ref]$parseErrors)
if ($null -ne $parseErrors -and $parseErrors.Count -gt 0) {
    foreach ($parseError in $parseErrors) {
        $line = $parseError.Extent.StartLineNumber
        $column = $parseError.Extent.StartColumnNumber
        Write-Host ("PowerShell syntax error at line {0}, column {1}: {2}" -f $line, $column, $parseError.Message) -ForegroundColor Red
    }
    exit 1
}

Write-Host 'PASS  PowerShell parser accepted scripts\diagnose-startup.ps1.' -ForegroundColor Green
exit 0
