import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const electronExecutable = resolve(projectRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const vitestEntry = resolve(projectRoot, 'node_modules', 'vitest', 'vitest.mjs');

// better-sqlite3 собран под ABI Electron. Запуск Vitest через Electron в Node-режиме
// позволяет проверять настоящую SQLite без пересборки нативного модуля перед каждым тестом.
const result = spawnSync(electronExecutable, [vitestEntry, 'run', 'src/main/repositories/repository.integration.test.ts'], {
  cwd: projectRoot,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit'
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
