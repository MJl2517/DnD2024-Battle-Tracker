import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import type { PublicCombatView } from '@shared/types';
import { IPC_CHANNELS } from '@shared/ipc/channels';

const rendererUrl = process.env.ELECTRON_RENDERER_URL;

/**
 * Владеет главным и публичным окнами Electron.
 * Закрытие главного окна всегда закрывает экран игроков, а внешние ссылки открываются системным браузером.
 */
export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private playerWindow: BrowserWindow | null = null;
  private playerWindowCampaignId: string | null = null;

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  getPlayerWindowCampaignId(): string | null {
    return this.playerWindowCampaignId;
  }

  createMainWindow(): BrowserWindow {
    const window = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 1180,
      minHeight: 760,
      title: 'DnD 2024 Battle Tracker',
      icon: this.appIconPath,
      backgroundColor: '#17130f',
      autoHideMenuBar: true,
      webPreferences: this.webPreferences
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: 'deny' };
    });
    window.on('closed', () => {
      this.mainWindow = null;
      this.closePlayerWindow();
    });

    this.mainWindow = window;
    this.loadRenderer(window);
    return window;
  }

  openPlayerWindow(campaignId: string): BrowserWindow {
    this.playerWindowCampaignId = campaignId;
    if (this.playerWindow && !this.playerWindow.isDestroyed()) {
      this.playerWindow.focus();
      this.loadRenderer(this.playerWindow, `/player?campaignId=${encodeURIComponent(campaignId)}`);
      return this.playerWindow;
    }

    this.playerWindow = new BrowserWindow({
      width: 1600,
      height: 900,
      minWidth: 1024,
      minHeight: 720,
      title: 'Экран игроков',
      icon: this.appIconPath,
      backgroundColor: '#120f0c',
      autoHideMenuBar: true,
      webPreferences: this.webPreferences
    });
    this.playerWindow.on('closed', () => {
      this.playerWindow = null;
      this.playerWindowCampaignId = null;
    });
    this.loadRenderer(this.playerWindow, `/player?campaignId=${encodeURIComponent(campaignId)}`);
    return this.playerWindow;
  }

  closePlayerWindow(): void {
    if (this.playerWindow && !this.playerWindow.isDestroyed()) {
      const windowToClose = this.playerWindow;
      this.playerWindow = null;
      this.playerWindowCampaignId = null;
      windowToClose.close();
      return;
    }
    this.playerWindow = null;
    this.playerWindowCampaignId = null;
  }

  broadcastPlayerView(view: PublicCombatView): void {
    if (!this.playerWindow || this.playerWindow.isDestroyed()) return;
    this.playerWindow.webContents.send(IPC_CHANNELS.playerWindow.viewEvent, view);
  }

  private get appIconPath(): string {
    return app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../build/icon.png');
  }

  private get webPreferences(): Electron.WebPreferences {
    return {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    };
  }

  private loadRenderer(window: BrowserWindow, hash = ''): void {
    if (rendererUrl) {
      const targetUrl = `${rendererUrl}${hash ? `#${hash}` : ''}`;
      void window.loadURL(targetUrl);
      window.webContents.once('did-fail-load', (_event, errorCode) => {
        if (errorCode !== -102) return;
        setTimeout(() => {
          if (!window.isDestroyed()) void window.loadURL(targetUrl);
        }, 500);
      });
      return;
    }
    void window.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined);
  }
}
