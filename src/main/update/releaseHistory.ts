import { z } from 'zod';
import type { AppRelease } from '@shared/types';

const githubReleaseSchema = z.object({
  tag_name: z.string().min(1),
  name: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  html_url: z.string().url().nullable().optional(),
  published_at: z.string().nullable().optional(),
  draft: z.boolean().optional(),
  prerelease: z.boolean().optional()
});

const appReleaseSchema = z.object({
  version: z.string(),
  tagName: z.string(),
  name: z.string(),
  notes: z.string(),
  publishedAt: z.string().optional(),
  url: z.string().url().optional(),
  prerelease: z.boolean()
});

/** Превращает непроверенный ответ GitHub в безопасные данные для renderer. */
export function parseGitHubReleaseHistory(input: unknown): AppRelease[] {
  return z
    .array(githubReleaseSchema)
    .parse(input)
    .filter((release) => !release.draft)
    .map((release) => {
      const version = normalizeReleaseVersion(release.tag_name);
      return {
        version,
        tagName: release.tag_name,
        name: release.name?.trim() || `Версия ${version}`,
        notes: release.body?.trim() || 'Для этой версии описание изменений не добавлено.',
        publishedAt: release.published_at ?? undefined,
        url: release.html_url ?? undefined,
        prerelease: release.prerelease ?? false
      };
    });
}

/** Повторно проверяет кэш перед использованием, поскольку файл мог быть повреждён. */
export function parseCachedReleaseHistory(input: unknown): AppRelease[] {
  return z.array(appReleaseSchema).parse(input);
}

export function normalizeReleaseVersion(version: string | undefined): string {
  return (version || '').trim().replace(/^v/i, '');
}
