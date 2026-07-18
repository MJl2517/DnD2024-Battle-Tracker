import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import type { AppRelease, AppUpdateStatus } from '@shared/types';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { normalizeReleaseVersion, parseCachedReleaseHistory, parseGitHubReleaseHistory } from './releaseHistory';

const { autoUpdater } = electronUpdater;
const UPDATE_REPOSITORY_OWNER = 'MJl2517';
const UPDATE_REPOSITORY_NAME = 'DnD2024-Battle-Tracker';

type UpdaterInfo = { version?: string; releaseName?: string | null; releaseDate?: string; releaseNotes?: unknown };
type UpdaterProgress = { percent?: number; transferred?: number; total?: number; bytesPerSecond?: number };
type GitHubRelease = {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  html_url?: string;
  published_at?: string;
};

export interface AppUpdater {
  getStatus(): AppUpdateStatus;
  check(): Promise<AppUpdateStatus>;
  download(): Promise<AppUpdateStatus>;
  install(): void;
  getReleaseHistory(): Promise<AppRelease[]>;
  bindEvents(): void;
}

/**
 * Управляет полным циклом обновления: проверкой GitHub Releases, скачиванием и установкой.
 * В dev-режиме выполняется только безопасная проверка версии, потому что исходники нельзя обновлять как установленный пакет.
 */
export function createAppUpdater(getMainWindow: () => BrowserWindow | null): AppUpdater {
  let status: AppUpdateStatus = { status: 'idle', currentVersion: app.getVersion(), isPackaged: app.isPackaged };
  let eventsBound = false;

  autoUpdater.autoDownload = false;
  // После успешной загрузки обычное закрытие приложения тоже должно установить обновление.
  // Иначе подсказка о перезапуске вводит пользователя в заблуждение, а загруженный пакет остаётся только в кэше.
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;

  function setStatus(patch: Partial<AppUpdateStatus>): AppUpdateStatus {
    status = { ...status, ...patch, currentVersion: app.getVersion(), isPackaged: app.isPackaged };
    const window = getMainWindow();
    if (window && !window.isDestroyed()) window.webContents.send(IPC_CHANNELS.update.statusEvent, status);
    return status;
  }

  async function checkGitHubReleaseOnly(): Promise<AppUpdateStatus> {
    try {
      const release = await fetchLatestGitHubRelease();
      const releaseVersion = normalizeReleaseVersion(release.tag_name);
      const hasNewerRelease = releaseVersion ? compareVersions(releaseVersion, app.getVersion()) > 0 : false;
      return setStatus({
        status: hasNewerRelease ? 'available' : 'not-available',
        version: releaseVersion || release.tag_name,
        releaseName: release.name ?? undefined,
        releaseDate: release.published_at,
        releaseNotes: release.body ?? undefined,
        releaseUrl: release.html_url,
        canInstall: false,
        message: hasNewerRelease
          ? 'В GitHub Releases есть более новая версия. Скачивание и установка из приложения доступны только в установленной сборке.'
          : 'В GitHub Releases нет версии новее текущей.'
      });
    } catch (error) {
      return setStatus({ status: 'error', canInstall: false, message: describeError(error) });
    }
  }

  async function check(): Promise<AppUpdateStatus> {
    if (!app.isPackaged) {
      setStatus({
        status: 'checking',
        canInstall: false,
        message: 'Проверяем последний GitHub Release. В dev-режиме обновление не устанавливается поверх исходников.'
      });
      return checkGitHubReleaseOnly();
    }
    setStatus({ status: 'checking', canInstall: true, message: 'Проверяем свежий релиз в GitHub Releases...' });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      setStatus({ status: 'error', message: describeError(error) });
    }
    return status;
  }

  async function download(): Promise<AppUpdateStatus> {
    if (!app.isPackaged) return setStatus({ status: 'not-available', message: 'Скачивание обновлений доступно только в установленной сборке приложения.' });
    setStatus({ status: 'downloading', percent: 0, canInstall: true, message: 'Скачиваем обновление...' });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      setStatus({ status: 'error', message: describeError(error) });
    }
    return status;
  }

  /**
   * История сначала обновляется из GitHub, затем сохраняется рядом с данными
   * приложения. При временной потере сети пользователь увидит последний
   * успешно загруженный список, а не пустое окно.
   */
  async function getReleaseHistory(): Promise<AppRelease[]> {
    const cachePath = join(app.getPath('userData'), 'release-history.json');
    try {
      const releases = await fetchGitHubReleaseHistory();
      try {
        await writeFile(cachePath, JSON.stringify(releases, null, 2), 'utf8');
      } catch {
        // Ошибка кэша не должна скрывать уже полученную с GitHub историю.
      }
      return releases;
    } catch (networkError) {
      try {
        return parseCachedReleaseHistory(JSON.parse(await readFile(cachePath, 'utf8')) as unknown);
      } catch {
        throw networkError;
      }
    }
  }

  function bindEvents(): void {
    if (eventsBound) return;
    eventsBound = true;
    autoUpdater.on('checking-for-update', () => setStatus({ status: 'checking', message: 'Проверяем свежий релиз в GitHub Releases...' }));
    autoUpdater.on('update-available', (info: UpdaterInfo) =>
      setStatus({
        ...updateInfoPatch(info),
        status: 'available',
        percent: undefined,
        canInstall: true,
        message: 'Найдена новая версия. Ее можно скачать и установить из приложения.'
      })
    );
    autoUpdater.on('update-not-available', (info: UpdaterInfo) =>
      setStatus({ ...updateInfoPatch(info), status: 'not-available', percent: undefined, canInstall: true, message: 'Установлена актуальная версия.' })
    );
    autoUpdater.on('download-progress', (progress: UpdaterProgress) =>
      setStatus({
        status: 'downloading',
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
        canInstall: true,
        message: 'Скачиваем обновление...'
      })
    );
    autoUpdater.on('update-downloaded', (info: UpdaterInfo) =>
      setStatus({
        ...updateInfoPatch(info),
        status: 'downloaded',
        percent: 100,
        canInstall: true,
        message: 'Обновление скачано. Нажмите «Установить и перезапустить» или закройте приложение — установка начнётся автоматически.'
      })
    );
    autoUpdater.on('error', (error) => setStatus({ status: 'error', message: describeError(error) }));
  }

  return {
    getStatus: () => status,
    check,
    download,
    // Явная установка запускает обычный NSIS wizard и после него снова открывает приложение.
    install: () => autoUpdater.quitAndInstall(false, true),
    getReleaseHistory,
    bindEvents
  };
}

function normalizeReleaseNotes(releaseNotes: unknown): string | undefined {
  if (typeof releaseNotes === 'string') return releaseNotes;
  if (!Array.isArray(releaseNotes)) return undefined;
  return releaseNotes
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'note' in item && typeof item.note === 'string') return item.note;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function updateInfoPatch(info?: UpdaterInfo): Partial<AppUpdateStatus> {
  if (!info) return {};
  return {
    version: info.version,
    releaseName: info.releaseName ?? undefined,
    releaseDate: info.releaseDate,
    releaseNotes: normalizeReleaseNotes(info.releaseNotes)
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizeReleaseVersion(left)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeReleaseVersion(right)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    if ((leftParts[index] ?? 0) > (rightParts[index] ?? 0)) return 1;
    if ((leftParts[index] ?? 0) < (rightParts[index] ?? 0)) return -1;
  }
  return 0;
}

async function fetchLatestGitHubRelease(): Promise<GitHubRelease> {
  const response = await fetch(`https://api.github.com/repos/${UPDATE_REPOSITORY_OWNER}/${UPDATE_REPOSITORY_NAME}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DnD-2024-Battle-Tracker' }
  });
  if (!response.ok) throw new Error(`GitHub Releases вернул ${response.status}. Проверьте, что в репозитории есть опубликованный release.`);
  return (await response.json()) as GitHubRelease;
}

async function fetchGitHubReleaseHistory(): Promise<AppRelease[]> {
  const response = await fetch(`https://api.github.com/repos/${UPDATE_REPOSITORY_OWNER}/${UPDATE_REPOSITORY_NAME}/releases?per_page=50`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DnD-2024-Battle-Tracker' }
  });
  if (!response.ok) throw new Error(`GitHub Releases вернул ${response.status}. Проверьте подключение к интернету.`);
  return parseGitHubReleaseHistory(await response.json());
}
