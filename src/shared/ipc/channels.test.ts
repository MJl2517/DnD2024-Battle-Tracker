import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from './channels';

function collectChannels(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(collectChannels);
}

describe('IPC channel registry', () => {
  it('contains unique non-empty channel names', () => {
    const channels = collectChannels(IPC_CHANNELS);
    expect(channels.length).toBeGreaterThan(30);
    expect(channels.every((channel) => channel.includes(':'))).toBe(true);
    expect(new Set(channels).size).toBe(channels.length);
  });
});
