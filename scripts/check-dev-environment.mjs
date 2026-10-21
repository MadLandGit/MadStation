import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const packageJson = readJson('package.json');
const expectedNode = fs.readFileSync(path.join(root, '.node-version'), 'utf8').trim();
const expectedNpm = /^npm@(.+)$/.exec(packageJson.packageManager ?? '')?.[1];
const problems = [];
const notes = [];
const localSprintfPatch = Object.freeze({
  lockPath: 'node_modules/sprintf-js',
  version: '1.1.4+madstation.1',
  resolved: 'file:vendor/sprintf-js-1.1.4+madstation.1.tgz',
  override: 'file:../../vendor/sprintf-js-1.1.4+madstation.1.tgz',
  archive: 'vendor/sprintf-js-1.1.4+madstation.1.tgz',
  integrity: 'sha512-oLg66y/zw4Kgslc92sTWFh0pvMmmencN0KgqUXHL5vLiM95C1sA3iiNUInRVtBUg4AjZTTX8VeCC1iaLYBEgvg==',
});

if (packageJson.engines?.node !== expectedNode) {
  problems.push(`package.json engines.node must match the exact .node-version pin (${expectedNode}).`);
}
const declaredDependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
  ...(packageJson.optionalDependencies ?? {}),
};
for (const [name, version] of Object.entries(declaredDependencies)) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    problems.push(`Direct dependency ${name} is not pinned to an exact version: ${version}`);
  }
}

const actualNode = process.versions.node;
if (actualNode !== expectedNode) {
  problems.push(`Node version is ${actualNode}; expected exactly ${expectedNode} (see .node-version).`);
} else {
  notes.push(`Node ${actualNode}`);
}

let actualNpm = '';
if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, '--version'], { cwd: root, encoding: 'utf8' });
  if (result.status === 0) actualNpm = result.stdout.trim();
}
if (!actualNpm) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(command, ['--version'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status === 0) actualNpm = result.stdout.trim();
}
if (!expectedNpm) {
  problems.push('package.json must pin packageManager as npm@<exact-version>.');
} else if (actualNpm !== expectedNpm) {
  problems.push(`npm version is ${actualNpm || '(unavailable)'}; expected exactly ${expectedNpm} (packageManager).`);
} else {
  notes.push(`npm ${actualNpm}`);
}

const packageLockPath = path.join(root, 'package-lock.json');
let lock = null;
if (!fs.existsSync(packageLockPath)) {
  problems.push('package-lock.json is missing. Generate it on a network-enabled machine with `npm install --package-lock-only --ignore-scripts --no-audit`, review it, and commit it before running `npm ci`.');
} else {
  try {
    lock = readJson('package-lock.json');
    if (lock.lockfileVersion !== 3) problems.push(`package-lock.json has lockfileVersion ${lock.lockfileVersion}; expected npm lockfile version 3.`);
    if (lock.name !== packageJson.name || lock.version !== packageJson.version) {
      problems.push('package-lock.json name/version do not match package.json. Regenerate and review the lockfile.');
    }
    const rootEntry = lock.packages?.[''];
    if (!rootEntry) problems.push('package-lock.json is missing packages[""] root metadata.');
    else {
      const equalRecord = (left, right) => JSON.stringify(Object.entries(left ?? {}).sort(([a], [b]) => a.localeCompare(b))) === JSON.stringify(Object.entries(right ?? {}).sort(([a], [b]) => a.localeCompare(b)));
      for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        if (!equalRecord(rootEntry[group], packageJson[group])) {
          problems.push(`package-lock.json root ${group} differs from package.json.`);
        }
      }
    }
    for (const [name, version] of Object.entries(declaredDependencies)) {
      const entry = lock.packages?.[`node_modules/${name}`];
      if (!entry || entry.version !== version) {
        problems.push(`Lockfile does not resolve ${name}@${version} exactly.`);
      }
    }

    if (packageJson.overrides?.['sprintf-js'] !== localSprintfPatch.override) {
      problems.push('The sprintf-js security override does not match the reviewed local tarball spec.');
    }
    const localSprintfEntry = lock.packages?.[localSprintfPatch.lockPath];
    if (!localSprintfEntry
      || localSprintfEntry.version !== localSprintfPatch.version
      || localSprintfEntry.resolved !== localSprintfPatch.resolved
      || localSprintfEntry.integrity !== localSprintfPatch.integrity) {
      problems.push('package-lock.json does not pin the reviewed local sprintf-js security patch at the expected path, version, tarball, and integrity hash.');
    }
    const sprintfEntries = Object.keys(lock.packages ?? {}).filter((packagePath) => packagePath.endsWith('/sprintf-js'));
    if (sprintfEntries.some((packagePath) => packagePath !== localSprintfPatch.lockPath)) {
      problems.push('An unexpected additional sprintf-js package path is present; inspect the lockfile to ensure no unpatched registry package is reintroduced.');
    }

    try {
      const archivePath = path.join(root, localSprintfPatch.archive);
      const actualIntegrity = `sha512-${createHash('sha512').update(fs.readFileSync(archivePath)).digest('base64')}`;
      if (actualIntegrity !== localSprintfPatch.integrity) {
        problems.push('The local sprintf-js security patch tarball does not match its reviewed SHA-512 integrity pin.');
      } else {
        notes.push('local sprintf-js security patch tarball matches its reviewed SHA-512 integrity pin');
      }
    } catch {
      problems.push('The local sprintf-js security patch tarball is missing or unreadable.');
    }

    for (const [packagePath, entry] of Object.entries(lock.packages ?? {})) {
      if (!packagePath.startsWith('node_modules/') || entry.link || entry.inBundle) continue;
      if (packagePath === localSprintfPatch.lockPath) continue;
      if (!entry.version) problems.push(`Lockfile package ${packagePath} has no exact version.`);
      if (!entry.resolved || !entry.resolved.startsWith('https://registry.npmjs.org/')) {
        problems.push(`Lockfile package ${packagePath} does not resolve from the expected HTTPS npm registry.`);
      }
      if (!entry.integrity) problems.push(`Lockfile package ${packagePath} has no integrity hash.`);
    }
    if (lock && problems.length === 0) notes.push('package-lock.json v3 matches the manifest; registry packages have HTTPS origins and integrity hashes, with one hash-pinned local security patch');
  } catch (error) {
    problems.push(`package-lock.json cannot be parsed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const nodeModules = path.join(root, 'node_modules');
if (!fs.existsSync(nodeModules)) {
  problems.push('node_modules is missing. After the reviewed lockfile is committed, run `npm ci`.');
} else {
  for (const [name, version] of Object.entries(declaredDependencies)) {
    const manifestPath = path.join(nodeModules, ...name.split('/'), 'package.json');
    if (!fs.existsSync(manifestPath)) problems.push(`Installed package ${name}@${version} is missing; run npm ci.`);
    else {
      try {
        const installed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (installed.version !== version) problems.push(`Installed ${name}@${installed.version}; package.json pins ${version}. Run npm ci.`);
      } catch {
        problems.push(`Installed package metadata for ${name} is unreadable.`);
      }
    }
  }
  const binDir = path.join(nodeModules, '.bin');
  for (const bin of ['tsc', 'vite', 'esbuild', 'electron', 'install-electron', 'electron-builder']) {
    const candidates = process.platform === 'win32' ? [`${bin}.cmd`, `${bin}.ps1`, bin] : [bin];
    if (!candidates.some((candidate) => fs.existsSync(path.join(binDir, candidate)))) {
      problems.push(`Required local executable node_modules/.bin/${bin}${process.platform === 'win32' ? '.cmd' : ''} is missing.`);
    }
  }
  if (problems.length === 0) notes.push('all declared dependencies and required local executables are installed');
}

console.log('Mad Station development environment check');
for (const note of notes) console.log(`PASS  ${note}`);
for (const problem of problems) console.error(`BLOCK ${problem}`);
if (problems.length) {
  console.error(`\nEnvironment is not reproducible yet (${problems.length} blocker${problems.length === 1 ? '' : 's'}).`);
  process.exitCode = 1;
} else {
  console.log('\nEnvironment is pinned and ready for project checks.');
}
