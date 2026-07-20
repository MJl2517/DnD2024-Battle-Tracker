import { useEffect, useRef, useState } from 'react';
import { Clock3, History, Info, Play, Settings, UploadCloud, X } from 'lucide-react';
import { DEFAULT_PUBLIC_DISPLAY_SETTINGS, type AppRelease, type AppUpdateStatus, type PublicDisplaySettings } from '@shared/types';
import { ReleaseHistoryModal } from '../updates/ReleaseHistoryModal';
import { useModalFocus } from '../../shared/ui/useModalFocus';

const api = window.dndTracker;
export function SettingsModal({
  onClose,
  onDisplaySettingsChange,
  onSettingsSaved
}: {
  onClose: () => void;
  onDisplaySettingsChange?: (settings: PublicDisplaySettings) => void;
  onSettingsSaved?: () => void | Promise<void>;
}): JSX.Element {
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [displaySettings, setDisplaySettings] = useState<PublicDisplaySettings>(DEFAULT_PUBLIC_DISPLAY_SETTINGS);
  const [displayBusy, setDisplayBusy] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [timerSecondsDraft, setTimerSecondsDraft] = useState(String(DEFAULT_PUBLIC_DISPLAY_SETTINGS.turnTimerSeconds));
  const timerSecondsInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useModalFocus<HTMLElement>(onClose);

  useEffect(() => {
    void api.getUpdateStatus().then(setUpdateStatus);
    void api.getPublicDisplaySettings().then((settings) => {
      setDisplaySettings(settings);
      setTimerSecondsDraft(String(settings.turnTimerSeconds));
      onDisplaySettingsChange?.(settings);
    });
    return api.onUpdateStatus(setUpdateStatus);
  }, [onDisplaySettingsChange]);

  useEffect(() => {
    function handleTimerWheel(event: WheelEvent): void {
      if (document.activeElement !== timerSecondsInputRef.current) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      setTimerSecondsDraft((current) => String(clampTimerSeconds(Number(current || displaySettings.turnTimerSeconds) + direction)));
    }

    window.addEventListener('wheel', handleTimerWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleTimerWheel, { capture: true });
  }, [displaySettings.turnTimerSeconds]);

  async function saveDisplaySettings(patch: Partial<PublicDisplaySettings>): Promise<void> {
    const nextSettings = { ...displaySettings, ...patch };
    setDisplaySettings(nextSettings);
    setDisplayBusy(true);
    setDisplayError(null);
    try {
      const savedSettings = await api.savePublicDisplaySettings(nextSettings);
      setDisplaySettings(savedSettings);
      setTimerSecondsDraft(String(savedSettings.turnTimerSeconds));
      onDisplaySettingsChange?.(savedSettings);
      await onSettingsSaved?.();
    } catch (err) {
      setDisplaySettings(displaySettings);
      setDisplayError(err instanceof Error ? err.message : String(err));
    } finally {
      setDisplayBusy(false);
    }
  }

  function commitTimerSeconds(): void {
    const seconds = clampTimerSeconds(Number(timerSecondsDraft));
    setTimerSecondsDraft(String(seconds));
    if (seconds !== displaySettings.turnTimerSeconds) {
      void saveDisplaySettings({ turnTimerSeconds: seconds });
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

  async function downloadAndInstallUpdate(): Promise<void> {
    setUpdateBusy(true);
    try {
      const downloaded = await api.downloadUpdate();
      setUpdateStatus(downloaded);
      if (downloaded.status !== 'downloaded') {
        if (downloaded.status === 'error') return;
        throw new Error('Загрузка обновления не завершилась. Попробуйте ещё раз.');
      }
      const installing = await api.installUpdate();
      setUpdateStatus(installing);
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

  async function loadReleaseHistory(): Promise<void> {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      setReleases(await api.getReleaseHistory());
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setHistoryLoading(false);
    }
  }

  function openReleaseHistory(): void {
    setHistoryOpen(true);
    void loadReleaseHistory();
  }

  const updateSummary = describeUpdateStatus(updateStatus);
  const updatePercent = Math.max(0, Math.min(100, Math.round(updateStatus?.percent ?? 0)));

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={modalRef} tabIndex={-1} className="app-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
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

          <article className="settings-row display-settings-row timer-settings-row">
            <div>
              <div className="settings-heading-with-icon">
                <Clock3 size={20} />
                <h3>Таймер хода</h3>
              </div>
              <p>Круговой отсчёт текущего хода на экране мастера и игроков.</p>
            </div>
            <div className="settings-toggle-list">
              <label className={`settings-toggle ${displaySettings.turnTimerEnabled ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={displaySettings.turnTimerEnabled}
                  disabled={displayBusy}
                  onChange={(event) => void saveDisplaySettings({ turnTimerEnabled: event.currentTarget.checked })}
                />
                <span aria-hidden="true" />
                <strong>Включить таймер хода</strong>
              </label>
              <label className={`settings-number-field ${displaySettings.turnTimerEnabled ? '' : 'disabled'}`}>
                <strong>Секунд на ход</strong>
                <input
                  ref={timerSecondsInputRef}
                  type="number"
                  min={5}
                  max={3600}
                  step={1}
                  value={timerSecondsDraft}
                  disabled={displayBusy || !displaySettings.turnTimerEnabled}
                  onChange={(event) => setTimerSecondsDraft(event.currentTarget.value)}
                  onBlur={commitTimerSeconds}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitTimerSeconds();
                      event.currentTarget.blur();
                    }
                  }}
                />
              </label>
              <label className={`settings-toggle ${displaySettings.skipNpcTurnTimer ? 'active' : ''} ${displaySettings.turnTimerEnabled ? '' : 'disabled'}`}>
                <input
                  type="checkbox"
                  checked={displaySettings.skipNpcTurnTimer}
                  disabled={displayBusy || !displaySettings.turnTimerEnabled}
                  onChange={(event) => void saveDisplaySettings({ skipNpcTurnTimer: event.currentTarget.checked })}
                />
                <span aria-hidden="true" />
                <strong>Не учитывать таймер для монстров</strong>
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
              <button className="button secondary" type="button" disabled={updateBusy} onClick={openReleaseHistory}>
                <History size={18} />
                История версий
              </button>
              <button className="button secondary" type="button" disabled={updateBusy} onClick={() => void runUpdateAction(api.checkForUpdates)}>
                <Settings size={18} />
                Проверить обновления
              </button>
              {updateStatus?.status === 'available' && updateStatus.canInstall !== false && (
                <button className="button primary" type="button" disabled={updateBusy} onClick={() => void downloadAndInstallUpdate()}>
                  <UploadCloud size={18} />
                  Скачать и установить
                </button>
              )}
              {updateStatus?.status === 'downloaded' && (
                <button className="button primary" type="button" disabled={updateBusy} onClick={() => void runUpdateAction(api.installUpdate)}>
                  <Play size={18} />
                  Установить и перезапустить
                </button>
              )}
              {updateStatus?.status === 'installing' && (
                <button className="button primary" type="button" disabled>
                  <Play size={18} />
                  Запускаем установщик...
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
      {historyOpen && (
        <ReleaseHistoryModal
          mode="history"
          releases={releases}
          currentVersion={updateStatus?.currentVersion ?? ''}
          loading={historyLoading}
          error={historyError}
          onRetry={() => void loadReleaseHistory()}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}

function clampTimerSeconds(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PUBLIC_DISPLAY_SETTINGS.turnTimerSeconds;
  return Math.max(5, Math.min(3600, Math.round(value)));
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
    return { title: `Версия${targetVersion} готова`, message: message || 'Нажмите «Установить и перезапустить».' };
  }

  if (status.status === 'installing') {
    return { title: `Установка версии${targetVersion}`, message: message || 'Приложение закроется, после чего откроется мастер установки.' };
  }

  if (status.status === 'not-available') {
    return { title: 'Обновления не найдены', message: message || 'Установлена актуальная версия.' };
  }

  if (status.status === 'error') {
    return { title: 'Не удалось проверить обновление', message: message || 'Проверьте интернет и наличие релиза на GitHub.' };
  }

  return null;
}
