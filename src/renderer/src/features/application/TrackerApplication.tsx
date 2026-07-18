import { useEffect, useState } from 'react';
import { Activity, BookOpen, ChevronLeft, ChevronRight, MonitorUp, Settings, Swords, Users, X } from 'lucide-react';
import {
  DEFAULT_PUBLIC_DISPLAY_SETTINGS,
  type AppRelease,
  type Campaign,
  type CampaignDetail,
  type CompleteCombatResult,
  type PublicDisplaySettings
} from '@shared/types';
import { CampaignSwitcher, EmptyCampaignState, TabButton } from './CampaignNavigation';
import { PlayersPanel } from '../players/PlayersPanel';
import { LibraryPanel } from '../bestiary/BestiaryPanel';
import { EncountersPanel } from '../encounters/EncountersPanel';
import { SettingsModal } from '../settings/SettingsModal';
import { CombatPanel } from '../combat/CombatPanel';
import { ReleaseHistoryModal } from '../updates/ReleaseHistoryModal';
import { getUserFacingErrorMessage } from '../../shared/lib/errors';
export { PlayerDisplay } from '../player-display/PlayerDisplay';

type TabKey = 'combat' | 'encounters' | 'library' | 'players';

const api = window.dndTracker;
const LAST_SEEN_VERSION_KEY = 'dnd-tracker:last-seen-version';

/**
 * Корневая композиция мастерского окна.
 * Здесь хранится только выбранная кампания/вкладка и оркестрация обновления данных между функциями.
 */
export function MasterApp(): JSX.Element {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [tab, setTab] = useState<TabKey>('combat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [xpResult, setXpResult] = useState<CompleteCombatResult | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displaySettings, setDisplaySettings] = useState<PublicDisplaySettings>(DEFAULT_PUBLIC_DISPLAY_SETTINGS);
  const [whatsNew, setWhatsNew] = useState<{ release: AppRelease; currentVersion: string } | null>(null);

  async function loadCampaigns(preferredId?: string): Promise<void> {
    const nextCampaigns = await api.listCampaigns();
    setCampaigns(nextCampaigns);
    const requestedId = preferredId !== undefined ? preferredId : selectedCampaignId;
    const nextId = nextCampaigns.some((campaignItem) => campaignItem.id === requestedId) ? requestedId : nextCampaigns[0]?.id || '';
    setSelectedCampaignId(nextId);
    if (nextId) {
      setDetail(await api.getCampaignDetail(nextId));
    } else {
      setDetail(null);
    }
  }

  async function refresh(): Promise<void> {
    if (!selectedCampaignId) {
      await loadCampaigns();
      return;
    }
    setDetail(await api.getCampaignDetail(selectedCampaignId));
    setCampaigns(await api.listCampaigns());
  }

  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError('');
    try {
      return await work();
    } catch (err) {
      setError(getUserFacingErrorMessage(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  function clearXpResult(): void {
    const sessionId = xpResult?.session.id;
    const dismissCombatXpAward = api.dismissCombatXpAward;
    setXpResult(null);
    if (sessionId && typeof dismissCombatXpAward === 'function') {
      void run(() => dismissCombatXpAward(sessionId));
    } else if (sessionId) {
      setError(
        'Desktop API устарел: полностью остановите dev-версию и запустите npm.cmd run dev заново, чтобы закрытие опыта синхронизировалось с экраном игроков.'
      );
    }
  }

  useEffect(() => {
    void run(() => loadCampaigns());
    void api.getPublicDisplaySettings().then(setDisplaySettings);
    // Initial bootstrap only; later campaign changes go through explicit actions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function detectInstalledUpdate(): Promise<void> {
      const status = await api.getUpdateStatus();
      if (!status?.isPackaged) return;

      const currentVersion = normalizeVersion(status.currentVersion);
      const lastSeenVersion = normalizeVersion(window.localStorage.getItem(LAST_SEEN_VERSION_KEY) ?? '');
      if (!currentVersion || currentVersion === lastSeenVersion) return;

      let release: AppRelease | undefined;
      try {
        const history = await api.getReleaseHistory();
        release = history.find((item) => normalizeVersion(item.version) === currentVersion);
      } catch {
        // Даже без сети сообщаем о завершённом обновлении; историю можно повторно загрузить из настроек.
      }

      if (cancelled) return;
      setWhatsNew({
        currentVersion,
        release: release ?? {
          version: currentVersion,
          tagName: `v${currentVersion}`,
          name: `Версия ${currentVersion} установлена`,
          notes: 'Обновление успешно установлено. Подробную историю изменений можно открыть в настройках.',
          prerelease: false
        }
      });
    }

    void detectInstalledUpdate();
    return () => {
      cancelled = true;
    };
  }, []);

  const campaign = detail?.campaign;

  return (
    <div className={`app-shell ${railCollapsed ? 'rail-collapsed' : ''}`}>
      <aside className="side-rail">
        <button
          className="rail-toggle rail-toggle-collapsed"
          type="button"
          aria-label="Показать кампании"
          title="Показать кампании"
          onClick={() => setRailCollapsed(false)}
        >
          <ChevronRight size={21} />
        </button>
        <div className="rail-content" aria-hidden={railCollapsed}>
          <div className="rail-header">
            <div className="brand-mark">
              <Swords size={34} />
              <div>
                <strong>DnD 2024</strong>
                <span>Battle Tracker</span>
              </div>
            </div>
            <button
              className="rail-toggle"
              type="button"
              aria-label={railCollapsed ? 'Показать кампании' : 'Скрыть кампании'}
              title={railCollapsed ? 'Показать кампании' : 'Скрыть кампании'}
              onClick={() => setRailCollapsed((current) => !current)}
            >
              {railCollapsed ? <ChevronRight size={21} /> : <ChevronLeft size={21} />}
            </button>
          </div>

          <CampaignSwitcher
            campaigns={campaigns}
            selectedId={selectedCampaignId}
            busy={busy}
            onSelect={async (id) => {
              setSelectedCampaignId(id);
              await run(async () => setDetail(await api.getCampaignDetail(id)));
            }}
            onCreate={async (name) => {
              const created = await run(() => api.createCampaign({ name }));
              if (created) await loadCampaigns(created.id);
            }}
            onDelete={async (id) => {
              await run(async () => {
                if (!api.deleteCampaign) {
                  throw new Error('Desktop API устарел. Полностью остановите dev-версию и запустите npm.cmd run dev заново.');
                }
                await api.deleteCampaign(id);
              });
              await loadCampaigns(id === selectedCampaignId ? undefined : selectedCampaignId);
            }}
          />
          <div className="rail-footer">
            <button className="rail-settings-button" type="button" aria-label="Открыть настройки" title="Настройки" onClick={() => setSettingsOpen(true)}>
              <Settings size={21} />
              <span>Настройки</span>
            </button>
          </div>
        </div>
      </aside>

      <main
        className={`workspace ${
          tab === 'players' ? 'players-workspace' : tab === 'encounters' ? 'encounters-workspace' : tab === 'combat' ? 'combat-workspace' : ''
        }`}
      >
        <header className="topbar">
          <div>
            <p className="eyebrow">Профиль кампании</p>
            <h1>{campaign?.name ?? 'Новая кампания'}</h1>
          </div>
          <div className="topbar-actions">
            {campaign && (
              <button className="button secondary" type="button" onClick={() => void run(() => api.openPlayerWindow(campaign.id))}>
                <MonitorUp size={20} />
                Экран игроков
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="notice error">
            <X size={18} />
            {error}
          </div>
        )}

        {!detail ? (
          <EmptyCampaignState
            busy={busy}
            onCreate={async (name) => {
              const created = await run(() => api.createCampaign({ name }));
              if (created) await loadCampaigns(created.id);
            }}
          />
        ) : (
          <>
            <nav className="tabs" aria-label="Разделы">
              <TabButton active={tab === 'combat'} onClick={() => setTab('combat')} icon={<Activity size={20} />} label="Бой" />
              <TabButton active={tab === 'encounters'} onClick={() => setTab('encounters')} icon={<Swords size={20} />} label="Энкаунтеры" />
              <TabButton active={tab === 'library'} onClick={() => setTab('library')} icon={<BookOpen size={20} />} label="Бестиарий" />
              <TabButton active={tab === 'players'} onClick={() => setTab('players')} icon={<Users size={20} />} label="Игроки" />
            </nav>

            {tab === 'combat' && (
              <CombatPanel
                detail={detail}
                busy={busy}
                displaySettings={displaySettings}
                xpResult={xpResult}
                onSession={(session) => {
                  setDetail({ ...detail, activeSession: session });
                  setXpResult(null);
                }}
                onComplete={(result) => {
                  setDetail({ ...detail, activeSession: result.session.status === 'active' ? result.session : null });
                  setXpResult(result);
                }}
                onClearXpResult={clearXpResult}
                onRefresh={refresh}
                run={run}
              />
            )}
            {tab === 'encounters' && <EncountersPanel detail={detail} busy={busy} run={run} onRefresh={refresh} onStart={() => setTab('combat')} />}
            {tab === 'library' && <LibraryPanel detail={detail} busy={busy} run={run} onRefresh={refresh} />}
            {tab === 'players' && <PlayersPanel detail={detail} busy={busy} run={run} onRefresh={refresh} />}
          </>
        )}
      </main>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onDisplaySettingsChange={setDisplaySettings} onSettingsSaved={refresh} />}
      {whatsNew && (
        <ReleaseHistoryModal
          mode="whats-new"
          releases={[whatsNew.release]}
          currentVersion={whatsNew.currentVersion}
          onClose={() => {
            window.localStorage.setItem(LAST_SEEN_VERSION_KEY, whatsNew.currentVersion);
            setWhatsNew(null);
          }}
        />
      )}
    </div>
  );
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}
