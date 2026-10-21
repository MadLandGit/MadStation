@echo off
setlocal
cd /d "%~dp0"

if not exist package.json (
  echo ERROR: package.json was not found in:
  echo %CD%
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install the project-pinned Node.js 22.16.0 from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not installed.
  echo Use the npm version pinned in package.json: 10.9.2.
  pause
  exit /b 1
)

for /f "delims=" %%V in ('node -p "process.versions.node"') do set "NODE_VERSION=%%V"
if not "%NODE_VERSION%"=="22.16.0" (
  echo ERROR: Node.js %NODE_VERSION% is installed; this project pins Node.js 22.16.0.
  echo Use .node-version or .nvmrc to select the expected version.
  pause
  exit /b 1
)
for /f "delims=" %%V in ('npm --version') do set "NPM_VERSION=%%V"
if not "%NPM_VERSION%"=="10.9.2" (
  echo ERROR: npm %NPM_VERSION% is installed; this project pins npm 10.9.2.
  pause
  exit /b 1
)
for /f "delims=" %%V in ('node -p "require('./package.json').version"') do set "APP_VERSION=%%V"
echo Mad Station v%APP_VERSION%

if not exist package-lock.json (
  echo ERROR: package-lock.json is missing. This source archive is not yet reproducible.
  echo On a trusted network-enabled development machine, run:
  echo   npm install --package-lock-only --ignore-scripts --no-audit
  echo Review and commit the real lockfile, then retry this launcher.
  echo See docs/development/DEVELOPMENT_ENVIRONMENT.md for the full procedure.
  pause
  exit /b 1
)

rem A complete, pinned install can be reused; otherwise rebuild strictly from the lockfile.
echo Checking the pinned development environment...
call npm run env:check >nul 2>nul
if errorlevel 1 goto install_dependencies
goto start_app

:install_dependencies
echo Recreating dependencies from package-lock.json with npm ci...
call npm ci
if errorlevel 1 (
  echo.
  echo Dependency restoration failed. Review the npm error above.
  echo Check registry connectivity, available disk space, and any reviewed lifecycle scripts.
  pause
  exit /b 1
)
call npm run env:check
if errorlevel 1 (
  echo Environment verification failed after npm ci.
  pause
  exit /b 1
)

:start_app
call npm start
set "APP_EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %APP_EXIT_CODE%
