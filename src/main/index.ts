import { app, BrowserWindow } from 'electron';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { openAppDatabase } from './services/db';
import { TrackerRepository } from './services/repository';
import { createAppUpdater } from './update/appUpdater';
import { WindowManager } from './windows/windowManager';

let windows: WindowManager | null = null;

// Точка входа только собирает зависимости. База, IPC, обновления и окна реализованы в отдельных модулях.
app.whenReady().then(() => {
  const repository = new TrackerRepository(openAppDatabase(app.getPath('userData')));
  windows = new WindowManager();
  const updater = createAppUpdater(() => windows?.getMainWindow() ?? null);

  updater.bindEvents();
  registerIpcHandlers({ repository, updater, windows });
  windows.createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windows?.createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => windows?.closePlayerWindow());
