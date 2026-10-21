# Mad Station full one-click diagnostics (single canonical workflow).
# Windows PowerShell 5.1 compatible; invoked by + Diagnose Startup.cmd.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$script:ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script:Failures = New-Object 'System.Collections.Generic.List[string]'
$script:Warnings = New-Object 'System.Collections.Generic.List[string]'
$script:NpmCommand = $null
$script:NodeCommand = $null
$script:LogPath = $null
$script:TranscriptStarted = $false
$script:RunTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$script:DiagnosticPrefix = 'diagnose-startup-2' # Keep the established v2 log names for continuity.
$script:AppStartupEvents = New-Object 'System.Collections.Generic.List[string]'
$script:AppLaunchOutcome = 'NOT ATTEMPTED'

function Write-Section {
    param([Parameter(Mandatory = $true)][string]$Title)
    Write-Host ''
    Write-Host ('=' * 74) -ForegroundColor DarkCyan
    Write-Host $Title -ForegroundColor Cyan
    Write-Host ('=' * 74) -ForegroundColor DarkCyan
}

function Add-Failure {
    param([Parameter(Mandatory = $true)][string]$Message)
    [void]$script:Failures.Add($Message)
    Write-Host ("FAIL  {0}" -f $Message) -ForegroundColor Red
}

function Add-Warning {
    param([Parameter(Mandatory = $true)][string]$Message)
    [void]$script:Warnings.Add($Message)
    Write-Host ("WARN  {0}" -f $Message) -ForegroundColor Yellow
}

function Invoke-NpmStep {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$WarningOnFailure
    )

    Write-Section $Title
    Write-Host ('> npm {0}' -f ($Arguments -join ' ')) -ForegroundColor Gray
    & $script:NpmCommand @Arguments 2>&1 | ForEach-Object { Write-Host ([string]$_) }
    $code = $LASTEXITCODE
    if ($code -eq 0) {
        Write-Host ("PASS  {0}" -f $Title) -ForegroundColor Green
        return $true
    }

    $message = "${Title} failed with exit code $code."
    if ($WarningOnFailure) {
        Add-Warning $message
    }
    else {
        Add-Failure $message
    }
    return $false
}

function Get-JsonReport {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$ReportPath,
        [Parameter(Mandatory = $true)][string]$StderrPath
    )

    Write-Section $Title
    Write-Host ('> npm {0}' -f ($Arguments -join ' ')) -ForegroundColor Gray
    $output = & $script:NpmCommand @Arguments 2> $StderrPath | Out-String
    $code = $LASTEXITCODE
    Set-Content -LiteralPath $ReportPath -Value $output -Encoding UTF8

    $report = $null
    try {
        if (-not [string]::IsNullOrWhiteSpace($output)) {
            $report = ConvertFrom-Json -InputObject $output -ErrorAction Stop
        }
    }
    catch {
        $report = $null
    }

    if ($null -eq $report -or $null -eq $report.metadata -or $null -eq $report.metadata.vulnerabilities) {
        Add-Failure ("{0} could not produce a readable audit report (npm exit code {1}); the release audit is unverified, not clean. Check registry/network access and see {2}." -f $Title, $code, $ReportPath)
        if (Test-Path -LiteralPath $StderrPath) {
            Get-Content -LiteralPath $StderrPath | ForEach-Object { Write-Host ([string]$_) -ForegroundColor DarkYellow }
        }
        return $null
    }

    return $report
}

function Invoke-Audits {
    $reportDirectory = Split-Path -Parent $script:LogPath
    $productionReportPath = Join-Path $reportDirectory ("{0}-{1}-audit-production.json" -f $script:DiagnosticPrefix, $script:RunTimestamp)
    $productionStderrPath = Join-Path $reportDirectory ("{0}-{1}-audit-production-stderr.txt" -f $script:DiagnosticPrefix, $script:RunTimestamp)
    $fullReportPath = Join-Path $reportDirectory ("{0}-{1}-audit-full.json" -f $script:DiagnosticPrefix, $script:RunTimestamp)
    $fullStderrPath = Join-Path $reportDirectory ("{0}-{1}-audit-full-stderr.txt" -f $script:DiagnosticPrefix, $script:RunTimestamp)

    $production = Get-JsonReport -Title 'Production dependency security audit' -Arguments @('audit', '--omit=dev', '--json') -ReportPath $productionReportPath -StderrPath $productionStderrPath
    if ($null -ne $production) {
        $v = $production.metadata.vulnerabilities
        if ([int]$v.total -eq 0) {
            Write-Host 'PASS  Production dependency audit reports zero vulnerabilities.' -ForegroundColor Green
        }
        else {
            $productionMessage = "Production dependency audit reports {0} issue(s): critical={1}, high={2}, moderate={3}, low={4}. Review {5}." -f $v.total, $v.critical, $v.high, $v.moderate, $v.low, $productionReportPath
            Add-Warning $productionMessage
            Add-Failure 'The production-only dependency audit did not report zero vulnerabilities.'
        }
    }

    $full = Get-JsonReport -Title 'Full development/build dependency security gate' -Arguments @('audit', '--json') -ReportPath $fullReportPath -StderrPath $fullStderrPath
    Write-Host ("Production audit JSON report: {0}" -f $productionReportPath) -ForegroundColor Gray
    Write-Host ("Full audit JSON report: {0}" -f $fullReportPath) -ForegroundColor Gray

    if ($null -ne $full) {
        $v = $full.metadata.vulnerabilities
        if ([int]$v.total -eq 0) {
            Write-Host 'PASS  Full dependency audit reports zero vulnerabilities.' -ForegroundColor Green
        }
        else {
            Add-Warning ("Full development/build dependency audit reports {0} issue(s): critical={1}, high={2}, moderate={3}, low={4}. Review {5}." -f $v.total, $v.critical, $v.high, $v.moderate, $v.low, $fullReportPath)
            Add-Failure 'Full dependency audit reports unresolved vulnerabilities; release validation is not clean.'
        }
    }
}

function Test-SourceMetadata {
    Write-Section 'Project files and version consistency'
    $required = @(
        'package.json', 'package-lock.json', 'VERSION', '.node-version', '.npmrc',
        'src/main.js', 'src/renderer.js', 'src/preload.ts', 'vite.config.ts',
        'scripts/check-dev-environment.mjs', 'scripts/check-diagnose-startup-syntax.ps1', 'scripts/diagnose-startup.ps1', '+ Diagnose Startup.cmd', 'tests/release.test.js',
        'src/main/public-suffix-list.ts', 'docs/licenses/Public-Suffix-List-Notice.md',
        'docs/licenses/THIRD_PARTY_NOTICES.md', 'vendor/sprintf-js-1.1.4+madstation.1.tgz'
    )
    $missing = @($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $script:ProjectRoot $_) -PathType Leaf) })
    if ($missing.Count -gt 0) {
        Add-Failure ("Required source file(s) are missing: {0}" -f ($missing -join ', '))
        return $false
    }
    Write-Host ('PASS  {0} required source/configuration files are present.' -f $required.Count) -ForegroundColor Green

    try {
        $package = Get-Content -LiteralPath (Join-Path $script:ProjectRoot 'package.json') -Raw | ConvertFrom-Json -ErrorAction Stop
        $lockPath = Join-Path $script:ProjectRoot 'package-lock.json'

        # npm lockfile v3 stores the project root at packages[""]. Windows PowerShell
        # 5.1 ConvertFrom-Json cannot reliably materialize that empty property name.
        # Ask the already-required Node runtime to move that entry to "rootPackage"
        # before PowerShell parses the projected JSON. No lockfile bytes are modified.
        $lockProjectionScript = @'
const fs = require('node:fs');
const lockPath = process.argv[1];
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
if (!lock.packages || !Object.prototype.hasOwnProperty.call(lock.packages, '')) {
  throw new Error('package-lock.json v3 root package entry is missing.');
}
lock.rootPackage = lock.packages[''];
delete lock.packages[''];
process.stdout.write(JSON.stringify(lock));
'@
        $lockProjectionOutput = & node -e $lockProjectionScript $lockPath
        if ($LASTEXITCODE -ne 0) {
            throw 'Node could not safely parse and project package-lock.json metadata.'
        }
        $lock = ($lockProjectionOutput -join "`n") | ConvertFrom-Json -ErrorAction Stop
        $versionFile = (Get-Content -LiteralPath (Join-Path $script:ProjectRoot 'VERSION') -Raw).Trim()
        $expectedNode = (Get-Content -LiteralPath (Join-Path $script:ProjectRoot '.node-version') -Raw).Trim()
        $expectedNpm = ([string]$package.packageManager) -replace '^npm@', ''
        $lockRoot = $lock.rootPackage

        $metadataProblems = New-Object 'System.Collections.Generic.List[string]'
        if ([string]::IsNullOrWhiteSpace($package.version) -or $package.version -ne $versionFile -or $lock.version -ne $package.version -or $null -eq $lockRoot -or $lockRoot.version -ne $package.version) {
            [void]$metadataProblems.Add('package.json, package-lock.json and VERSION do not agree on the application version.')
        }
        if ($lock.lockfileVersion -ne 3) {
            [void]$metadataProblems.Add('package-lock.json must use lockfileVersion 3.')
        }
        if ($lock.name -ne $package.name) {
            [void]$metadataProblems.Add('package-lock.json name does not match package.json.')
        }
        if ($package.engines.node -ne $expectedNode) {
            [void]$metadataProblems.Add('package.json engines.node does not match .node-version.')
        }
        if ($expectedNpm -notmatch '^\d+\.\d+\.\d+$') {
            [void]$metadataProblems.Add('package.json must pin npm through packageManager (for example npm@10.9.2).')
        }

        if ($null -ne $lockRoot) {
            foreach ($group in @('dependencies', 'devDependencies', 'optionalDependencies')) {
                $manifestPairs = @($package.$group.PSObject.Properties | Sort-Object Name | ForEach-Object { '{0}={1}' -f $_.Name, [string]$_.Value }) -join "`n"
                $lockPairs = @($lockRoot.$group.PSObject.Properties | Sort-Object Name | ForEach-Object { '{0}={1}' -f $_.Name, [string]$_.Value }) -join "`n"
                if ($manifestPairs -ne $lockPairs) {
                    [void]$metadataProblems.Add("package-lock.json root $group differs from package.json.")
                }
            }

            $declared = @{}
            foreach ($group in @('dependencies', 'devDependencies', 'optionalDependencies')) {
                foreach ($dependency in $package.$group.PSObject.Properties) {
                    $declared[$dependency.Name] = [string]$dependency.Value
                }
            }
            foreach ($dependencyName in $declared.Keys) {
                $lockEntry = $null
                $expectedEntryName = 'node_modules/' + $dependencyName
                foreach ($lockProperty in $lock.packages.PSObject.Properties) {
                    if ($lockProperty.Name -eq $expectedEntryName) { $lockEntry = $lockProperty.Value; break }
                }
                if ($null -eq $lockEntry -or $lockEntry.version -ne $declared[$dependencyName]) {
                    [void]$metadataProblems.Add("Lockfile does not resolve $dependencyName at its exact manifest version.")
                }
            }
        }

        $localSprintfLockPath = 'node_modules/sprintf-js'
        $localSprintfVersion = '1.1.4+madstation.1'
        $localSprintfResolved = 'file:vendor/sprintf-js-1.1.4+madstation.1.tgz'
        $localSprintfOverride = 'file:../../vendor/sprintf-js-1.1.4+madstation.1.tgz'
        $localSprintfIntegrity = 'sha512-oLg66y/zw4Kgslc92sTWFh0pvMmmencN0KgqUXHL5vLiM95C1sA3iiNUInRVtBUg4AjZTTX8VeCC1iaLYBEgvg=='
        $localSprintfArchive = Join-Path $script:ProjectRoot 'vendor\sprintf-js-1.1.4+madstation.1.tgz'
        if ([string]$package.overrides.'sprintf-js' -ne $localSprintfOverride) {
            [void]$metadataProblems.Add('package.json does not use the reviewed local sprintf-js security override.')
        }
        if ($null -eq $lock.packages.PSObject.Properties[$localSprintfLockPath]) {
            [void]$metadataProblems.Add('package-lock.json is missing the reviewed local sprintf-js security patch entry.')
        }
        else {
            $sprintfEntry = $lock.packages.PSObject.Properties[$localSprintfLockPath].Value
            if ([string]$sprintfEntry.version -ne $localSprintfVersion -or [string]$sprintfEntry.resolved -ne $localSprintfResolved -or [string]$sprintfEntry.integrity -ne $localSprintfIntegrity) {
                [void]$metadataProblems.Add('The local sprintf-js patch lock entry does not match the reviewed version, tarball path, and SHA-512 integrity pin.')
            }
        }
        foreach ($lockProperty in $lock.packages.PSObject.Properties) {
            if ([string]$lockProperty.Name -eq $localSprintfLockPath) { continue }
            if ([string]$lockProperty.Name -match '(^|/)sprintf-js$') {
                [void]$metadataProblems.Add('An unexpected additional sprintf-js package path is present; inspect the lockfile to ensure no unpatched registry package is reintroduced.')
            }
        }
        if (-not (Test-Path -LiteralPath $localSprintfArchive -PathType Leaf)) {
            [void]$metadataProblems.Add('The reviewed local sprintf-js security patch tarball is missing.')
        }
        else {
            $integrityScript = @'
const fs = require('node:fs');
const crypto = require('node:crypto');
const file = process.argv[1];
process.stdout.write('sha512-' + crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64'));
'@
            $actualSprintfIntegrity = (& node -e $integrityScript $localSprintfArchive | Out-String).Trim()
            if ($LASTEXITCODE -ne 0 -or $actualSprintfIntegrity -ne $localSprintfIntegrity) {
                [void]$metadataProblems.Add('The local sprintf-js security patch tarball does not match its reviewed SHA-512 integrity pin.')
            }
        }

        foreach ($lockProperty in $lock.packages.PSObject.Properties) {
            if (-not $lockProperty.Name.StartsWith('node_modules/')) { continue }
            $entry = $lockProperty.Value
            if ($entry.link -or $entry.inBundle) { continue }
            if ([string]$lockProperty.Name -eq $localSprintfLockPath) { continue }
            if ([string]::IsNullOrWhiteSpace([string]$entry.version)) {
                [void]$metadataProblems.Add("Lockfile package $($lockProperty.Name) has no exact version.")
            }
            if ([string]::IsNullOrWhiteSpace([string]$entry.resolved) -or -not ([string]$entry.resolved).StartsWith('https://registry.npmjs.org/', [System.StringComparison]::OrdinalIgnoreCase)) {
                [void]$metadataProblems.Add("Lockfile package $($lockProperty.Name) does not resolve from the pinned HTTPS npm registry.")
            }
            if ([string]::IsNullOrWhiteSpace([string]$entry.integrity)) {
                [void]$metadataProblems.Add("Lockfile package $($lockProperty.Name) has no integrity hash.")
            }
        }

        if ($metadataProblems.Count -gt 0) {
            foreach ($problem in $metadataProblems) { Add-Failure $problem }
            Write-Host 'Source/lockfile preflight failed. npm ci will not be run because the manifest/lockfile must be reviewed first.' -ForegroundColor Red
            return $false
        }

        Write-Host ("PASS  Application version {0}; Node pin {1}; npm pin {2}." -f $package.version, $expectedNode, $expectedNpm) -ForegroundColor Green
        Write-Host 'PASS  Lockfile v3, direct pins, registry integrity, and hash-pinned local sprintf-js security patch are consistent.' -ForegroundColor Green
        $script:ExpectedNodeVersion = $expectedNode
        $script:ExpectedNpmVersion = $expectedNpm
        return $true
    }
    catch {
        Add-Failure ("Could not validate the package/version/lockfile metadata: {0}" -f $_.Exception.Message)
        return $false
    }
}
function Test-InstalledLockMarkerCurrent {
    $sourceLockPath = Join-Path $script:ProjectRoot 'package-lock.json'
    $installedMarkerPath = Join-Path $script:ProjectRoot 'node_modules\.package-lock.json'
    if (-not (Test-Path -LiteralPath $installedMarkerPath -PathType Leaf)) {
        Add-Warning 'npm installed-lock marker is missing; dependencies will be restored from the reviewed package-lock.json.'
        return $false
    }
    try {
        $sourceLock = Get-Item -LiteralPath $sourceLockPath -ErrorAction Stop
        $installedMarker = Get-Item -LiteralPath $installedMarkerPath -ErrorAction Stop
        if ($sourceLock.LastWriteTimeUtc -gt $installedMarker.LastWriteTimeUtc) {
            Add-Warning "package-lock.json is newer than npm's installed-tree marker; dependencies will be refreshed with npm ci."
            return $false
        }
        return $true
    }
    catch {
        Add-Warning 'Could not verify the installed dependency marker; dependencies will be refreshed with npm ci.'
        return $false
    }
}

function Main {
    Set-Location -LiteralPath $script:ProjectRoot
    $diagnosticTitle = 'Mad Station Diagnose Startup (full checks)'
    Write-Section $diagnosticTitle
    Write-Host ("Project: {0}" -f $script:ProjectRoot)
    Write-Host 'This routine checks the pinned toolchain, repairs missing dependencies if needed, runs checks/tests/build, performs both security audits, installs/verifies the Electron runtime binary, then confirms application startup and shutdown.'

    if (-not (Test-SourceMetadata)) {
        Write-Host 'Source preflight failed. No dependency installation or app launch was attempted.' -ForegroundColor Red
        return 2
    }

    $nodeInfo = Get-Command 'node.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    $npmInfo = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $nodeInfo) { $nodeInfo = Get-Command 'node' -ErrorAction SilentlyContinue | Select-Object -First 1 }
    if ($null -eq $npmInfo) { $npmInfo = Get-Command 'npm' -ErrorAction SilentlyContinue | Select-Object -First 1 }
    if ($null -eq $nodeInfo -or $null -eq $npmInfo) {
        Add-Failure 'Node.js and npm must be installed and available on PATH. Install the project-pinned versions, then rerun this file.'
        return 2
    }
    $script:NodeCommand = $nodeInfo.Source
    $script:NpmCommand = $npmInfo.Source

    $nodeVersion = (& $script:NodeCommand --version | Out-String).Trim()
    $npmVersion = (& $script:NpmCommand --version | Out-String).Trim()
    Write-Host ("Detected Node.js {0}; expected {1}." -f $nodeVersion, $script:ExpectedNodeVersion)
    Write-Host ("Detected npm {0}; expected {1}." -f $npmVersion, $script:ExpectedNpmVersion)
    if ($nodeVersion -ne ("v{0}" -f $script:ExpectedNodeVersion) -or $npmVersion -ne $script:ExpectedNpmVersion) {
        Add-Failure 'The installed Node.js/npm versions do not match the project pins. Select the versions printed above and rerun this command.'
        return 2
    }
    Write-Host 'PASS  Pinned Node.js and npm versions match.' -ForegroundColor Green

    $envReady = Invoke-NpmStep -Title 'Environment/dependency preflight' -Arguments @('run', 'env:check') -WarningOnFailure
    if (-not $envReady) {
        Write-Host 'The installed dependency tree is missing or does not match the lockfile. Restoring it with npm ci...' -ForegroundColor Yellow
        $ciReady = Invoke-NpmStep -Title 'Restore dependencies from the reviewed lockfile' -Arguments @('ci') 
        if (-not $ciReady) {
            Write-Host 'npm ci failed; further validation and Electron launch were skipped.' -ForegroundColor Red
            return 2
        }
        $envReady = Invoke-NpmStep -Title 'Recheck environment after dependency restoration' -Arguments @('run', 'env:check') 
        if (-not $envReady) {
            Add-Failure 'The environment check still fails after npm ci; app launch was skipped.'
            return 2
        }
    }

    $treeMarkerCurrent = Test-InstalledLockMarkerCurrent
    $treeReady = $false
    if ($treeMarkerCurrent) {
        $treeReady = Invoke-NpmStep -Title 'Installed dependency tree consistency' -Arguments @('ls', '--depth=0') -WarningOnFailure
    }
    if (-not $treeReady) {
        Write-Host 'npm ls found an inconsistent installed tree. Recreating dependencies once from package-lock.json...' -ForegroundColor Yellow
        $ciReady = Invoke-NpmStep -Title 'Restore dependency tree after npm ls findings' -Arguments @('ci')
        if (-not $ciReady) {
            Write-Host 'Dependency restoration failed; further validation and Electron launch were skipped.' -ForegroundColor Red
            return 2
        }
        $envReady = Invoke-NpmStep -Title 'Recheck environment after dependency restoration' -Arguments @('run', 'env:check')
        if (-not $envReady) { return 2 }
        $treeReady = Invoke-NpmStep -Title 'Recheck installed dependency tree' -Arguments @('ls', '--depth=0')
        if (-not $treeReady) {
            Write-Host 'The dependency tree remains inconsistent after npm ci; app launch was skipped.' -ForegroundColor Red
            return 2
        }
    }

    [void](Invoke-NpmStep -Title 'TypeScript checks' -Arguments @('run', 'typecheck'))
    [void](Invoke-NpmStep -Title 'Complete automated regression/security test suite' -Arguments @('test'))

    Invoke-Audits

    $buildReady = Invoke-NpmStep -Title 'Production development build (renderer, preload and main)' -Arguments @('run', 'build') 
    if (-not $buildReady) {
        Add-Warning 'The build failed, so Electron was not launched. Review the build errors in the diagnosis log.'
        return 1
    }

    $electron = Join-Path $script:ProjectRoot 'node_modules\.bin\electron.cmd'
    $electronInstaller = Join-Path $script:ProjectRoot 'node_modules\.bin\install-electron.cmd'
    if (-not (Test-Path -LiteralPath $electron -PathType Leaf)) {
        Add-Failure 'The local Electron launcher node_modules\.bin\electron.cmd is missing, despite a successful build.'
        return 1
    }
    if (-not (Test-Path -LiteralPath $electronInstaller -PathType Leaf)) {
        Add-Failure 'The local install-electron command is missing; cannot explicitly verify/download Electron before app launch.'
        return 1
    }

    Write-Section 'Electron runtime binary download/install preflight'
    Write-Host '> node_modules\.bin\install-electron.cmd --no' -ForegroundColor Gray
    Write-Host 'Electron 42+ downloads its executable on first use; this step runs the installer explicitly so failures are recorded before launch.'
    & $electronInstaller '--no' 2>&1 | ForEach-Object { Write-Host ([string]$_) }
    $electronInstallCode = $LASTEXITCODE
    if ($electronInstallCode -ne 0) {
        Add-Failure ("Electron runtime binary download/install failed with exit code {0}. Check network access and the Electron download output above." -f $electronInstallCode)
        return 1
    }

    $electronBinary = Join-Path $script:ProjectRoot 'node_modules\electron\dist\electron.exe'
    if (-not (Test-Path -LiteralPath $electronBinary -PathType Leaf)) {
        Add-Failure 'Electron download command exited successfully, but node_modules\electron\dist\electron.exe is missing. The runtime is not ready to launch.'
        return 1
    }
    $electronBinaryInfo = Get-Item -LiteralPath $electronBinary -ErrorAction SilentlyContinue
    if ($null -eq $electronBinaryInfo -or $electronBinaryInfo.Length -lt 1048576) {
        Add-Failure 'Electron executable exists but is unexpectedly small; the download may be incomplete or corrupt.'
        return 1
    }
    Write-Host ("PASS  Electron binary is present ({0:N1} MiB)." -f ($electronBinaryInfo.Length / 1MB)) -ForegroundColor Green

    Write-Host '> node_modules\.bin\electron.cmd --version' -ForegroundColor Gray
    $electronVersionOutput = & $electron '--version' 2>&1 | Out-String
    $electronVersionCode = $LASTEXITCODE
    if (-not [string]::IsNullOrWhiteSpace($electronVersionOutput)) { Write-Host $electronVersionOutput.Trim() }
    $packageManifest = Get-Content -LiteralPath (Join-Path $script:ProjectRoot 'package.json') -Raw | ConvertFrom-Json -ErrorAction Stop
    $expectedElectronVersion = [string]$packageManifest.devDependencies.electron
    if ($electronVersionCode -ne 0 -or $electronVersionOutput -notmatch [regex]::Escape($expectedElectronVersion)) {
        Add-Failure ("Electron executable self-check failed (exit code {0}); expected version {1}." -f $electronVersionCode, $expectedElectronVersion)
        return 1
    }
    Write-Host ("PASS  Electron executable self-check reports version {0}." -f $expectedElectronVersion) -ForegroundColor Green

    Write-Section 'Launch Mad Station and verify live startup signals'
    Write-Host '> node_modules\.bin\electron.cmd .' -ForegroundColor Gray
    Write-Host 'Use the app normally, reproduce any startup/UI problem, then close Mad Station to finish this log.'
    Write-Host 'The app emits privacy-safe startup event names below; the final summary reports whether the main process, window, and both UI renderers started.'
    $script:AppLaunchOutcome = 'LAUNCH STARTED; waiting for startup signals and user close'
    $script:AppStartupEvents.Clear()
    $launchStarted = Get-Date
    & $electron '.' 2>&1 | ForEach-Object {
        $line = [string]$_
        if ($line -match '\[Mad Station startup\]\s+([a-z0-9-]+)') {
            [void]$script:AppStartupEvents.Add($Matches[1])
        }
        Write-Host $line
    }
    $appExitCode = $LASTEXITCODE
    $uniqueEvents = @($script:AppStartupEvents | Select-Object -Unique)
    $mainModuleStarted = $uniqueEvents -contains 'main-module-evaluated'
    $appReady = $uniqueEvents -contains 'app-ready-config-loaded'
    $mainWindowCreated = $uniqueEvents -contains 'main-window-created'
    $controlRendererLoaded = $uniqueEvents -contains 'control-renderer-loaded'
    $controlRendererFailed = $uniqueEvents -contains 'control-renderer-load-failed'
    $controlRendererGone = $uniqueEvents -contains 'control-renderer-process-gone'
    $toolbarRendererLoaded = $uniqueEvents -contains 'toolbar-renderer-loaded'
    $toolbarRendererFailed = $uniqueEvents -contains 'toolbar-renderer-load-failed'
    $toolbarRendererGone = $uniqueEvents -contains 'toolbar-renderer-process-gone'
    $fatalStartupError = $uniqueEvents -contains 'fatal-startup-error'
    $unhandledRejectionSeen = $uniqueEvents -contains 'unhandled-rejection'

    $startupSignalsComplete = $mainModuleStarted -and $appReady -and $mainWindowCreated -and $controlRendererLoaded -and $toolbarRendererLoaded
    $startupHasRuntimeErrors = $fatalStartupError -or $controlRendererFailed -or $controlRendererGone -or $toolbarRendererFailed -or $toolbarRendererGone -or ($appExitCode -ne 0)
    if ($startupSignalsComplete -and -not $startupHasRuntimeErrors) {
        if ($unhandledRejectionSeen) {
            $script:AppLaunchOutcome = 'STARTUP CONFIRMED WITH WARNING; an unhandled rejection was logged during the interactive run'
        } else {
            $script:AppLaunchOutcome = 'STARTUP CONFIRMED; main process, window, both renderers, and clean exit verified'
        }
    } else {
        $script:AppLaunchOutcome = 'STARTUP NOT FULLY CONFIRMED; one or more startup/runtime checks failed or were not observed'
    }

    Write-Section 'Application startup confirmation and exit status'
    Write-Host ("Electron binary download/install: PASS ({0})" -f $expectedElectronVersion) -ForegroundColor Green
    if ($mainModuleStarted) {
        Write-Host 'PASS  Mad Station main-process JavaScript started.' -ForegroundColor Green
    } else {
        Add-Failure 'Mad Station main-process startup was not confirmed; no main-module-evaluated event was observed.'
    }
    if ($appReady) {
        Write-Host 'PASS  Electron app-ready configuration and security initialization completed.' -ForegroundColor Green
    } else {
        Add-Failure 'Mad Station did not confirm completion of app-ready initialization.'
    }
    if ($mainWindowCreated) {
        Write-Host 'PASS  Main application window creation was confirmed.' -ForegroundColor Green
    } else {
        Add-Failure 'Mad Station did not confirm main-window creation.'
    }
    if ($controlRendererLoaded) {
        Write-Host 'PASS  Main UI renderer finished loading.' -ForegroundColor Green
    } else {
        Add-Failure 'Mad Station did not confirm that the main UI renderer finished loading.'
    }
    if ($fatalStartupError) { Add-Failure 'The main process recorded a fatal startup error; see the Electron startup-diagnostics.log.' }
    if ($unhandledRejectionSeen) { Add-Warning 'The main process recorded an unhandled promise rejection during the interactive run; review the Electron startup-diagnostics.log.' }
    if ($controlRendererFailed) { Add-Failure 'The main UI renderer reported a load failure; see the Electron startup-diagnostics.log.' }
    if ($controlRendererGone) { Add-Failure 'The main UI renderer process exited unexpectedly; see the Electron startup-diagnostics.log.' }
    if ($toolbarRendererLoaded) {
        Write-Host 'PASS  Toolbar renderer finished loading.' -ForegroundColor Green
    } else {
        Add-Failure 'The toolbar renderer did not confirm a completed load.'
    }
    if ($toolbarRendererFailed) { Add-Failure 'The toolbar renderer reported a load failure; some UI may be incomplete.' }
    if ($toolbarRendererGone) { Add-Failure 'The toolbar renderer process exited unexpectedly; some UI may be incomplete.' }
    if ($appExitCode -eq 0) {
        Write-Host 'PASS  Mad Station process exited cleanly (exit code 0) after the interactive check.' -ForegroundColor Green
    } else {
        Add-Failure ("Mad Station exited with code {0}. Check the app startup-diagnostics.log and the events above." -f $appExitCode)
    }
    Write-Host ("Startup events observed: {0}" -f $(if ($uniqueEvents.Count) { $uniqueEvents -join ', ' } else { '(none)' })) -ForegroundColor Gray
    Write-Host ("Interactive launch duration: {0}" -f ((Get-Date) - $launchStarted)) -ForegroundColor Gray

    if ($script:Failures.Count -gt 0) { return 1 }
    return 0
}

# Keep the primary log under LocalAppData; fall back to TEMP if it is not writable.
$logDirectory = $null
$candidates = @()
if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    $candidates += (Join-Path $env:LOCALAPPDATA 'MadStation\diagnostics')
}
if (-not [string]::IsNullOrWhiteSpace($env:TEMP)) {
    $candidates += (Join-Path $env:TEMP 'MadStation-diagnostics')
}
foreach ($candidate in $candidates) {
    try {
        New-Item -ItemType Directory -Path $candidate -Force -ErrorAction Stop | Out-Null
        $probe = Join-Path $candidate ('.write-test-' + [guid]::NewGuid().ToString('N'))
        Set-Content -LiteralPath $probe -Value 'test' -ErrorAction Stop
        Remove-Item -LiteralPath $probe -Force -ErrorAction Stop
        $logDirectory = $candidate
        break
    }
    catch { }
}
if ($null -eq $logDirectory) {
    Write-Host 'ERROR: Cannot create a diagnostic log under LocalAppData or TEMP.' -ForegroundColor Red
    exit 2
}
# Keep the latest 12 diagnostic runs and remove associated JSON/stderr sidecars with older logs.
try {
    $oldLogs = @(Get-ChildItem -LiteralPath $logDirectory -Filter 'diagnose-startup-*.log' -File -ErrorAction Stop | Sort-Object LastWriteTime -Descending | Select-Object -Skip 11)
    foreach ($oldLog in $oldLogs) {
        $prefix = [System.IO.Path]::GetFileNameWithoutExtension($oldLog.Name)
        Get-ChildItem -LiteralPath $logDirectory -Filter ($prefix + '*') -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    }
}
catch { }
$script:LogPath = Join-Path $logDirectory ("{0}-{1}.log" -f $script:DiagnosticPrefix, $script:RunTimestamp)
try {
    Start-Transcript -Path $script:LogPath -Force | Out-Null
    $script:TranscriptStarted = $true
}
catch {
    Write-Host ("WARNING: Transcript logging could not start: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
}

$exitCode = 1
try {
    $exitCode = Main
}
catch {
    Add-Failure ("Unexpected diagnostics-script error: {0}" -f $_.Exception.Message)
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    $exitCode = 1
}
finally {
    Write-Section 'Final diagnostic summary'
    if ($script:Failures.Count -eq 0) {
        Write-Host 'PASS  Required validation steps completed without recorded failures.' -ForegroundColor Green
    }
    else {
        Write-Host ("FAIL  {0} failure(s) were recorded:" -f $script:Failures.Count) -ForegroundColor Red
        foreach ($failure in $script:Failures) { Write-Host ("  - {0}" -f $failure) -ForegroundColor Red }
        if ($exitCode -eq 0) { $exitCode = 1 }
    }
    if ($script:Warnings.Count -gt 0) {
        Write-Host ("{0} warning(s):" -f $script:Warnings.Count) -ForegroundColor Yellow
        foreach ($warning in $script:Warnings) { Write-Host ("  - {0}" -f $warning) -ForegroundColor Yellow }
    }
    Write-Host ("Application startup result: {0}" -f $script:AppLaunchOutcome)
    Write-Host ("Full diagnosis log: {0}" -f $script:LogPath)
    Write-Host 'Electron also writes startup-diagnostics.log under its user-data folder. The two logs serve different purposes.'
    if ($script:TranscriptStarted) {
        try { Stop-Transcript | Out-Null } catch { }
    }
}
exit $exitCode
