import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { openAppDatabase } from './services/db';
import { TrackerRepository } from './services/repository';
import type {
  CombatantPatch,
  CompleteCombatOptions,
  CreateCampaignInput,
  PublicFeatureCard,
  SaveCreatureTemplateInput,
  SaveEncounterGroupInput,
  SaveEncounterInput,
  SaveEncounterLairInput,
  SaveEncounterPlayerSettingInput,
  SavePlayerInput
} from '@shared/types';

let playerWindow: BrowserWindow | null = null;
let repository: TrackerRepository;

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const appIconPath = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../build/icon.png');

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
    closePlayerWindow();
  });

  loadRenderer(window);
  return window;
}

function closePlayerWindow(): void {
  if (playerWindow && !playerWindow.isDestroyed()) {
    const windowToClose = playerWindow;
    playerWindow = null;
    windowToClose.close();
    return;
  }

  playerWindow = null;
}

function createPlayerWindow(campaignId: string): BrowserWindow {
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
