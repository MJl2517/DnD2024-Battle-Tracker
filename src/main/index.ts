import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import electronUpdater from 'electron-updater';
import { openAppDatabase } from './services/db';
import { TrackerRepository } from './services/repository';
import type {
  AppUpdateStatus,
  CombatantPatch,
  CompleteCombatOptions,
  CreateCampaignInput,
  PublicDisplaySettings,
  PublicFeatureCard,
  SaveCreatureTemplateInput,
  SaveEncounterGroupInput,
  SaveEncounterInput,
  SaveEncounterLairInput,
  SaveEncounterPlayerSettingInput,
  SavePlayerInput
} from '@shared/types';

const { autoUpdater } = electronUpdater;

type UpdaterInfo = {
  version?: string;
  releaseName?: string | null;
  releaseDate?: string;
  releaseNotes?: unknown;
};

type UpdaterProgress = {
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
};

type GitHubRelease = {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  html_url?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
};

const UPDATE_REPOSITORY_OWNER = 'MJl2517';
const UPDATE_REPOSITORY_NAME = 'DnD2024-Battle-Tracker';

let mainWindow: BrowserWindow | null = null;
let playerWindow: BrowserWindow | null = null;
let playerWindowCampaignId: string | null = null;
let repository: TrackerRepository;
let updateStatus: AppUpdateStatus = {
  status: 'idle',
  currentVersion: app.getVersion()
};

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const appIconPath = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../build/icon.png');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function normalizeReleaseNotes(releaseNotes: unknown): string | undefined {
  if (typeof releaseNotes === 'string') {
    return releaseNotes;
  }

  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'note' in item && typeof item.note === 'string') return item.note;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return undefined;
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

function setUpdateStatus(patch: Partial<AppUpdateStatus>): AppUpdateStatus {
  updateStatus = {
    ...updateStatus,
    ...patch,
    currentVersion: app.getVersion()
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status', updateStatus);
  }

  return updateStatus;
}

function describeUpdateError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function normalizeVersion(version: string | undefined): string {
  return (version || '').trim().replace(/^v/i, '');
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeVersion(right).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

async function fetchLatestGitHubRelease(): Promise<GitHubRelease> {
  const response = await fetch(`https://api.github.com/repos/${UPDATE_REPOSITORY_OWNER}/${UPDATE_REPOSITORY_NAME}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'DnD-2024-Battle-Tracker'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub Releases вернул ${response.status}. Проверьте, что в репозитории есть опубликованный release.`);
  }

  return (await response.json()) as GitHubRelease;
}

async function checkGitHubReleaseOnly(): Promise<AppUpdateStatus> {
  try {
    const release = await fetchLatestGitHubRelease();
    const releaseVersion = normalizeVersion(release.tag_name);
    const hasNewerRelease = releaseVersion ? compareVersions(releaseVersion, app.getVersion()) > 0 : false;

    return setUpdateStatus({
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
  } catch (err) {
    return setUpdateStatus({
      status: 'error',
      canInstall: false,
      message: describeUpdateError(err)
    });
  }
}

async function checkForAppUpdates(): Promise<AppUpdateStatus> {
  if (!app.isPackaged) {
    setUpdateStatus({
      status: 'checking',
      canInstall: false,
      message: 'Проверяем последний GitHub Release. В dev-режиме обновление не устанавливается поверх исходников.'
    });
    return checkGitHubReleaseOnly();
  }

  setUpdateStatus({
    status: 'checking',
    canInstall: true,
    message: 'Проверяем свежий релиз в GitHub Releases...'
  });

  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    setUpdateStatus({
      status: 'error',
      message: describeUpdateError(err)
    });
  }

  return updateStatus;
}

async function downloadAppUpdate(): Promise<AppUpdateStatus> {
  if (!app.isPackaged) {
    return setUpdateStatus({
      status: 'not-available',
      message: 'Скачивание обновлений доступно только в установленной сборке приложения.'
    });
  }

  setUpdateStatus({
    status: 'downloading',
    percent: 0,
    canInstall: true,
    message: 'Скачиваем обновление...'
  });

  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    setUpdateStatus({
      status: 'error',
      message: describeUpdateError(err)
    });
  }

  return updateStatus;
}

function bindUpdaterEvents(): void {
  autoUpdater.on('checking-for-update', () => {
    setUpdateStatus({
      status: 'checking',
      message: 'Проверяем свежий релиз в GitHub Releases...'
    });
  });

  autoUpdater.on('update-available', (info: UpdaterInfo) => {
    setUpdateStatus({
      ...updateInfoPatch(info),
      status: 'available',
      percent: undefined,
      canInstall: true,
      message: 'Найдена новая версия. Ее можно скачать и установить из приложения.'
    });
  });

  autoUpdater.on('update-not-available', (info: UpdaterInfo) => {
    setUpdateStatus({
      ...updateInfoPatch(info),
      status: 'not-available',
      percent: undefined,
      canInstall: true,
      message: 'Установлена актуальная версия.'
    });
  });

  autoUpdater.on('download-progress', (progress: UpdaterProgress) => {
    setUpdateStatus({
      status: 'downloading',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
      canInstall: true,
      message: 'Скачиваем обновление...'
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdaterInfo) => {
    setUpdateStatus({
      ...updateInfoPatch(info),
      status: 'downloaded',
      percent: 100,
      canInstall: true,
      message: 'Обновление скачано. Перезапустите приложение для установки.'
    });
  });

  autoUpdater.on('error', (err) => {
    setUpdateStatus({
      status: 'error',
      message: describeUpdateError(err)
    });
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: 'DnD 2024 Battle Tracker',
    icon: appIconPath,
    backgroundColor: '#17130f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  window.on('closed', () => {
    mainWindow = null;
    closePlayerWindow();
  });

  mainWindow = window;
  loadRenderer(window);
  return window;
}

function closePlayerWindow(): void {
  if (playerWindow && !playerWindow.isDestroyed()) {
    const windowToClose = playerWindow;
    playerWindow = null;
    playerWindowCampaignId = null;
    windowToClose.close();
    return;
  }

  playerWindow = null;
  playerWindowCampaignId = null;
}

function createPlayerWindow(campaignId: string): BrowserWindow {
  playerWindowCampaignId = campaignId;
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.focus();
    loadRenderer(playerWindow, `/player?campaignId=${encodeURIComponent(campaignId)}`);
    return playerWindow;
  }

  playerWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: 'Экран игроков',
    icon: appIconPath,
    backgroundColor: '#120f0c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });
  playerWindow.on('closed', () => {
    playerWindow = null;
    playerWindowCampaignId = null;
  });
  loadRenderer(playerWindow, `/player?campaignId=${encodeURIComponent(campaignId)}`);
  return playerWindow;
}

function loadRenderer(window: BrowserWindow, hash = ''): void {
  if (rendererUrl) {
    const targetUrl = `${rendererUrl}${hash ? `#${hash}` : ''}`;
    window.loadURL(targetUrl);
    window.webContents.once('did-fail-load', (_event, errorCode) => {
      if (errorCode === -102) {
        setTimeout(() => {
          if (!window.isDestroyed()) {
            window.loadURL(targetUrl);
          }
        }, 500);
      }
    });
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined);
  }
}

function broadcastPlayerView(campaignId: string): void {
  if (!playerWindow || playerWindow.isDestroyed()) return;
  const view = repository.getPlayerView(campaignId);
  playerWindow.webContents.send('player:view', view);
}

function bindIpc(): void {
  ipcMain.handle('update:get-status', () => updateStatus);
  ipcMain.handle('update:check', () => checkForAppUpdates());
  ipcMain.handle('update:download', () => downloadAppUpdate());
  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });
  ipcMain.handle('settings:get-public-display', () => repository.getPublicDisplaySettings());
  ipcMain.handle('settings:save-public-display', (_event, input: PublicDisplaySettings) => {
    const settings = repository.savePublicDisplaySettings(input);
    if (playerWindowCampaignId) {
      broadcastPlayerView(playerWindowCampaignId);
    }
    return settings;
  });

  ipcMain.handle('campaign:list', () => repository.listCampaigns());
  ipcMain.handle('campaign:create', (_event, input: CreateCampaignInput) => repository.createCampaign(input));
  ipcMain.handle('campaign:delete', (_event, id: string) => repository.deleteCampaign(id));
  ipcMain.handle('campaign:detail', (_event, campaignId: string) => repository.getCampaignDetail(campaignId));

  ipcMain.handle('player:save', (_event, input: SavePlayerInput) => {
    const player = repository.savePlayer(input);
    broadcastPlayerView(player.campaignId);
    return player;
  });
  ipcMain.handle('player:delete', (_event, id: string) => repository.deletePlayer(id));

  ipcMain.handle('creature:import-ruleholder', async (_event, campaignId: string, url: string) => repository.importRuleholderCreature(campaignId, url));
  ipcMain.handle('spell:fetch-ruleholder', async (_event, href: string) => repository.fetchRuleholderSpell(href));
  ipcMain.handle('creature:save', (_event, input: SaveCreatureTemplateInput) => repository.saveCreature(input));
  ipcMain.handle('creature:delete', (_event, id: string) => repository.deleteCreature(id));

  ipcMain.handle('encounter:save', (_event, input: SaveEncounterInput) => repository.saveEncounter(input));
  ipcMain.handle('encounter:delete', (_event, id: string) => repository.deleteEncounter(id));
  ipcMain.handle('encounter-group:save', (_event, input: SaveEncounterGroupInput) => repository.saveEncounterGroup(input));
  ipcMain.handle('encounter-group:delete', (_event, id: string) => repository.deleteEncounterGroup(id));
  ipcMain.handle('encounter-player:save', (_event, input: SaveEncounterPlayerSettingInput) => repository.saveEncounterPlayerSetting(input));
  ipcMain.handle('encounter-lair:save', (_event, input: SaveEncounterLairInput) => repository.saveEncounterLair(input));
  ipcMain.handle('encounter-lair:delete', (_event, encounterId: string) => repository.deleteEncounterLair(encounterId));

  ipcMain.handle('combat:start', (_event, encounterId: string) => {
    const session = repository.startCombat(encounterId);
    broadcastPlayerView(session.campaignId);
    return session;
  });
  ipcMain.handle('combat:get', (_event, sessionId: string) => repository.getCombatSession(sessionId));
  ipcMain.handle('combatant:update', (_event, id: string, patch: CombatantPatch) => {
    const session = repository.updateCombatant(id, patch);
    broadcastPlayerView(session.campaignId);
    return session;
  });
  ipcMain.handle('combatant:reorder', (_event, sessionId: string, orderedIds: string[]) => {
    const session = repository.reorderCombatants(sessionId, orderedIds);
    broadcastPlayerView(session.campaignId);
    return session;
  });
  ipcMain.handle('combatant:set-active', (_event, sessionId: string, combatantId: string) => {
    const session = repository.setActiveCombatant(sessionId, combatantId);
    broadcastPlayerView(session.campaignId);
    return session;
  });
  ipcMain.handle('combat:advance-turn', (_event, sessionId: string) => {
    const session = repository.advanceTurn(sessionId);
    broadcastPlayerView(session.campaignId);
    return session;
  });
  ipcMain.handle('combat:retreat-turn', (_event, sessionId: string) => {
    const session = repository.retreatTurn(sessionId);
    broadcastPlayerView(session.campaignId);
    return session;
  });
  ipcMain.handle('combat:end-round', (_event, sessionId: string) => {
    const session = repository.endRound(sessionId);
    broadcastPlayerView(session.campaignId);
    return session;
  });
  ipcMain.handle('combat:advance-round', (_event, sessionId: string) => {
    const session = repository.advanceRound(sessionId);
    broadcastPlayerView(session.campaignId);
    return session;
  });
  ipcMain.handle('combat:retreat-round', (_event, sessionId: string) => {
    const session = repository.retreatRound(sessionId);
    broadcastPlayerView(session.campaignId);
    return session;
  });
  ipcMain.handle('combat:complete', (_event, sessionId: string, options: CompleteCombatOptions) => {
    const result = repository.completeCombat(sessionId, options);
    broadcastPlayerView(result.session.campaignId);
    return result;
  });
  ipcMain.handle('combat:dismiss-xp-award', (_event, sessionId: string) => {
    const campaignId = repository.dismissCombatXpAward(sessionId);
    broadcastPlayerView(campaignId);
  });

  ipcMain.handle('player-window:open', (_event, campaignId: string) => {
    createPlayerWindow(campaignId);
    setTimeout(() => broadcastPlayerView(campaignId), 200);
  });
  ipcMain.handle('player-window:view', (_event, campaignId: string) => repository.getPlayerView(campaignId));
  ipcMain.handle('player-window:show-feature-card', (_event, campaignId: string, card: PublicFeatureCard) => {
    repository.showPublicFeatureCard(campaignId, card);
    broadcastPlayerView(campaignId);
  });
  ipcMain.handle('player-window:dismiss-feature-card', (_event, campaignId: string) => {
    repository.dismissPublicFeatureCard(campaignId);
    broadcastPlayerView(campaignId);
  });
}

app.whenReady().then(() => {
  repository = new TrackerRepository(openAppDatabase(app.getPath('userData')));
  bindUpdaterEvents();
  bindIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  closePlayerWindow();
});
