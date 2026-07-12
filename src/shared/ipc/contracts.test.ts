import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from './channels';

function collectChannelPaths(value: unknown, path: string[] = []): string[] {
  if (typeof value === 'string') return [path.join('.')];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, nested]) => collectChannelPaths(nested, [...path, key]));
}

describe('IPC implementation contract', () => {
  it('references every registered channel from preload or main', () => {
    const implementation = ['src/preload/index.ts', 'src/main/ipc/registerIpcHandlers.ts', 'src/main/update/appUpdater.ts', 'src/main/windows/windowManager.ts']
      .map((file) => readFileSync(resolve(file), 'utf8'))
      .join('\n');

    for (const channelPath of collectChannelPaths(IPC_CHANNELS)) {
      expect(implementation, `Missing implementation for ${channelPath}`).toContain(`IPC_CHANNELS.${channelPath}`);
    }
  });
});
