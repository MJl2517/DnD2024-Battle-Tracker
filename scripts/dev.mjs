import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rendererRoot = resolve(rootDir, 'src/renderer');

const server = await createServer({
  root: rendererRoot,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false
  },
  resolve: {
    alias: {
      '@main': resolve(rootDir, 'src/main'),
      '@preload': resolve(rootDir, 'src/preload'),
      '@renderer': resolve(rootDir, 'src/renderer/src'),
      '@shared': resolve(rootDir, 'src/shared')
    }
  }
});

await server.listen();
server.printUrls();

const address = server.resolvedUrls?.local?.[0];
if (!address) {
  await server.close();
  throw new Error('Vite dev server did not expose a local URL.');
}

const electronProcess = spawn(electron, [rootDir], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RENDERER_URL: address.replace(/\/$/, '')
  }
});

const shutdown = async (exitCode = 0) => {
  await server.close();
  process.exit(exitCode);
};

process.on('SIGINT', () => {
  electronProcess.kill();
  void shutdown(0);
});

process.on('SIGTERM', () => {
  electronProcess.kill();
  void shutdown(0);
});

electronProcess.on('exit', (code) => {
  void shutdown(code ?? 0);
});
