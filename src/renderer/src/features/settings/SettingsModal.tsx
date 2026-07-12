import { useEffect, useState } from 'react';
import { Info, Play, Settings, UploadCloud, X } from 'lucide-react';
import { DEFAULT_PUBLIC_DISPLAY_SETTINGS, type AppUpdateStatus, type PublicDisplaySettings } from '@shared/types';

const api = window.dndTracker;
export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [displaySettings, setDisplaySettings] = useState<PublicDisplaySettings>(DEFAULT_PUBLIC_DISPLAY_SETTINGS);
  const [displayBusy, setDisplayBusy] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);

  useEffect(() => {
    void api.getUpdateStatus().then(setUpdateStatus);
    void api.getPublicDisplaySettings().then(setDisplaySettings);
    return api.onUpdateStatus(setUpdateStatus);
  }, []);

  async function saveDisplaySettings(patch: Partial<PublicDisplaySettings>): Promise<void> {
    const nextSettings = { ...displaySettings, ...patch };
    setDisplaySettings(nextSettings);
    setDisplayBusy(true);
    setDisplayError(null);
    try {
      setDisplaySettings(await api.savePublicDisplaySettings(nextSettings));
    } catch (err) {
      setDisplaySettings(displaySettings);
      setDisplayError(err instanceof Error ? err.message : String(err));
    } finally {
      setDisplayBusy(false);
    }
  }

  async function runUpdateAction(action: () => Promise<AppUpdateStatus | void>): Promise<void> {
    setUpdateBusy(true);
    try {
      const nextStatus = await action();
      if (nextStatus) {
        setUpdateStatus(nextStatus);
      }
    } catch (err) {
      setUpdateStatus({
        status: 'error',
        currentVersion: updateStatus?.currentVersion ?? 'dev',
        message: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setUpdateBusy(false);
    }
  }

  const updateSummary = describeUpdateStatus(updateStatus);
  const updatePercent = Math.max(0, Math.min(100, Math.round(updateStatus?.percent ?? 0)));

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="app-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Приложение</p>
            <h2 id="settings-title">Настройки</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть настройки" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="settings-list">
          <article className="settings-row display-settings-row">
            <div>
              <h3>Экран игроков</h3>
              <p>Настройки публичной информации на большом экране. Игроки по-прежнему не видят точные хиты врагов.</p>
              {displayError && <span className="settings-error">{displayError}</span>}
            </div>
            <div className="settings-toggle-list">
              <label className={`settings-toggle ${displaySettings.showEnemyArmorClass ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={displaySettings.showEnemyArmorClass}
                  disabled={displayBusy}
                  onChange={(event) => void saveDisplaySettings({ showEnemyArmorClass: event.currentTarget.checked })}
                />
                <span aria-hidden="true" />
                <strong>Показывать КД врагов</strong>
              </label>
              <label className={`settings-toggle ${displaySettings.showEnemySpeeds ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={displaySettings.showEnemySpeeds}
                  disabled={displayBusy}
                  onChange={(event) => void saveDisplaySettings({ showEnemySpeeds: event.currentTarget.checked })}
                />
                <span aria-hidden="true" />
                <strong>Показывать скорость врагов</strong>
              </label>
              <label className={`settings-toggle ${displaySettings.hideCreatureNames ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={displaySettings.hideCreatureNames}
                  disabled={displayBusy}
                  onChange={(event) => void saveDisplaySettings({ hideCreatureNames: event.currentTarget.checked })}
                />
                <span aria-hidden="true" />
                <strong>Скрывать имена существ</strong>
              </label>
            </div>
          </article>

          <article className="settings-row">
            <div>
              <h3>Обновления</h3>
              <p>Обновить из GitHub.</p>
              <span className="settings-version">Текущая версия: {updateStatus?.currentVersion ?? '...'}</span>
            </div>
            <div className="update-actions">
              <button className="button secondary" type="button" disabled={updateBusy} onClick={() => void runUpdateAction(api.checkForUpdates)}>
                <Settings size={18} />
                Проверить обновления
              </button>
              {updateStatus?.status === 'available' && updateStatus.canInstall !== false && (
                <button className="button primary" type="button" disabled={updateBusy} onClick={() => void runUpdateAction(api.downloadUpdate)}>
                  <UploadCloud size={18} />
                  Скачать
                </button>
              )}
              {updateStatus?.status === 'downloaded' && (
                <button className="button primary" type="button" disabled={updateBusy} onClick={() => void runUpdateAction(api.installUpdate)}>
                  <Play size={18} />
                  Установить
                </button>
              )}
            </div>
          </article>

          {updateSummary && (
            <div className="notice settings-status">
              <Info size={18} />
              <div>
                <strong>{updateSummary.title}</strong>
                <span>{updateSummary.message}</span>
              </div>
            </div>
          )}

          {updateStatus?.status === 'downloading' && (
            <div className="update-progress" aria-label="Прогресс скачивания обновления">
              <span className="update-progress-bar" style={{ width: `${updatePercent}%` }} />
              <strong>{updatePercent}%</strong>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function describeUpdateStatus(status: AppUpdateStatus | null): { title: string; message: string } | null {
  if (!status) return null;

  const targetVersion = status.version ? ` ${status.version}` : '';
  const message = status.message || '';

  if (status.status === 'checking') {
    return { title: 'Проверка обновления', message: message || 'Проверяем GitHub Releases...' };
  }

  if (status.status === 'available') {
    return { title: `Доступна версия${targetVersion}`, message: message || 'Можно скачать обновление.' };
  }

  if (status.status === 'downloading') {
    return { title: `Скачивание версии${targetVersion}`, message: message || 'Файл обновления загружается.' };
  }

  if (status.status === 'downloaded') {
    return { title: `Версия${targetVersion} готова`, message: message || 'Нажмите “Установить”, приложение перезапустится.' };
  }

  if (status.status === 'not-available') {
    return { title: 'Обновления не найдены', message: message || 'Установлена актуальная версия.' };
  }

  if (status.status === 'error') {
    return { title: 'Не удалось проверить обновление', message: message || 'Проверьте интернет и наличие релиза на GitHub.' };
  }

  return null;
}
