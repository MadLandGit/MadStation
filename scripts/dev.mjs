import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const projectRoot = resolve(import.meta.dirname, '..');
const vite = await createServer({
  configFile: resolve(projectRoot, 'vite.config.ts'),
  configFileDependencies: [resolve(projectRoot, 'vite.config.ts')],
});

let child;
let shuttingDown = false;
const stop = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (child && child.exitCode === null) child.kill(signal);
  await vite.close();
};

try {
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Vite did not open a TCP listener.');
  const devUrl = `http://127.0.0.1:${address.port}/toolbar.html`;
  const electronBinary = require('electron');
  child = spawn(electronBinary, [projectRoot], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, MAD_STATION_TOOLBAR_DEV_URL: devUrl },
  });

  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
  });
  await vite.close();
  process.exitCode = exitCode;
} catch (error) {
  await vite.close();
  throw error;
}
