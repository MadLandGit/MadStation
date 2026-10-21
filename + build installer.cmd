@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install the project-pinned Node.js 22.16.0 from https://nodejs.org/ and run this again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not installed. This project pins npm 10.9.2.
  pause
  exit /b 1
)

for /f "delims=" %%V in ('node -p "process.versions.node"') do set "NODE_VERSION=%%V"
if not "%NODE_VERSION%"=="22.16.0" (
  echo ERROR: Node.js %NODE_VERSION% is installed; expected 22.16.0.
  pause
  exit /b 1
)
for /f "delims=" %%V in ('npm --version') do set "NPM_VERSION=%%V"
if not "%NPM_VERSION%"=="10.9.2" (
  echo ERROR: npm %NPM_VERSION% is installed; expected 10.9.2.
  pause
  exit /b 1
)
if not exist package.json (
  echo ERROR: package.json was not found in the project folder:
  echo %CD%
  pause
  exit /b 1
)
if not exist package-lock.json (
  echo ERROR: package-lock.json is missing. Refusing to build from an unresolved dependency graph.
  echo On a trusted network-enabled development machine, run:
  echo   npm install --package-lock-only --ignore-scripts --no-audit
  echo Review and commit the real lockfile, then retry this script.
  echo See docs/development/DEVELOPMENT_ENVIRONMENT.md for the full procedure.
  pause
  exit /b 1
)

for /f "delims=" %%V in ('node -p "require('./package.json').version"') do set "APP_VERSION=%%V"
echo Mad Station v%APP_VERSION%

echo Recreating dependencies from the reviewed lockfile...
call npm ci
if errorlevel 1 (
  echo.
  echo npm ci failed. Review the npm error above; check registry access, free disk space and reviewed lifecycle scripts.
  pause
  exit /b 1
)
call npm run env:check
if errorlevel 1 (
  echo Environment verification failed. Installer build cancelled.
  pause
  exit /b 1
)

rem Preserve old dist output until dependency installation and environment checks succeed.
if exist dist (
  echo Cleaning previous build output...
  rmdir /s /q dist
  if exist dist (
    echo ERROR: Could not remove dist. Close apps using files in dist and try again.
    pause
    exit /b 1
  )
)

echo Running typecheck, renderer/preload/main builds and the Windows installer target...
call npm run dist
if errorlevel 1 (
  echo.
  echo Build failed. The old dist folder was removed before building.
  echo If the error mentions package.json missing from app.asar, move the project
  echo outside OneDrive to a short local path such as C:\MadStation and retry.
  pause
  exit /b 1
)

echo.
echo Installer created in the dist folder.
pause
endlocal
