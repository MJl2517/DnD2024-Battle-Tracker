import { describe, expect, it } from 'vitest';
import { parseGitHubReleaseHistory } from './releaseHistory';

describe('release history parser', () => {
  it('normalizes published GitHub releases and excludes drafts', () => {
    expect(
      parseGitHubReleaseHistory([
        {
          tag_name: 'v0.3.0',
          name: 'Таймер хода',
          body: '- Добавлен таймер',
          html_url: 'https://github.com/example/releases/tag/v0.3.0',
          published_at: '2026-07-19T10:00:00.000Z'
        },
        { tag_name: 'v0.4.0', draft: true }
      ])
    ).toEqual([
      {
        version: '0.3.0',
        tagName: 'v0.3.0',
        name: 'Таймер хода',
        notes: '- Добавлен таймер',
        publishedAt: '2026-07-19T10:00:00.000Z',
        url: 'https://github.com/example/releases/tag/v0.3.0',
        prerelease: false
      }
    ]);
  });

  it('rejects malformed external data', () => {
    expect(() => parseGitHubReleaseHistory([{ name: 'Нет тега' }])).toThrow();
  });
});
