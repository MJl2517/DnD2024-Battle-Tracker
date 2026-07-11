import { type CSSProperties, FormEvent, MouseEvent, PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ClipboardPaste,
  Dices,
  Edit3,
  Eye,
  EyeOff,
  HeartPulse,
  Info,
  Keyboard,
  LogOut,
  MonitorUp,
  Play,
  Plus,
  Save,
  Settings,
  Shield,
  Skull,
  Swords,
  Trash2,
  UploadCloud,
  Users,
  X
} from 'lucide-react';
import type {
  AbilityBlock,
  AppUpdateStatus,
  Campaign,
  CampaignDetail,
  CombatEffect,
  CombatSession,
  Combatant,
  CombatantPatch,
  CompleteCombatOptions,
  CompleteCombatResult,
  CombatXpAward,
  CreatureFeature,
  CreatureTemplate,
  Encounter,
  EncounterCreatureGroup,
  EncounterLair,
  EncounterPlayerSetting,
  HitPointMode,
  InitiativeMode,
  PlayerCharacter,
  PublicFeatureCard,
  PublicCombatant,
  PublicCombatView,
  PublicDisplaySettings,
  SaveCreatureTemplateInput,
  SpellCard
} from '@shared/types';
import { calculateExperience, describeInitiativeMode, isBloodied } from '@shared/combat';
import { calculateEncounterDifficulty, type EncounterDifficultyResult } from '@shared/encounterDifficulty';
import {
  CONCENTRATION_STATUS_ID,
  UNCONSCIOUS_DEPENDENCY_STATUS_IDS,
  addStatusEffects,
  expandStatusEffectIds,
  getStatusEffectDefinition,
  STATUS_EFFECTS,
  type StatusEffectDefinition
} from '@shared/statusEffects';
import { DEFAULT_PUBLIC_DISPLAY_SETTINGS } from '@shared/types';

type TabKey = 'combat' | 'encounters' | 'library' | 'players';
type SelectOption = {
  value: string;
  label: string;
  description?: string;
  icon?: string;
};

type PopoverAnchor = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type PublicHpEvent = {
  id: string;
  combatantId: string;
  amount: number;
  kind: 'damage' | 'healing';
};

const api = window.dndTracker;
const HOLD_DELETE_MS = 900;
const PLAYER_CARD_STEP = 730;
const PLAYER_CARD_CENTER = 365;
const PLAYER_SLIDER_REPEAT = 11;
const PLAYER_SLIDER_MIDDLE_REPEAT = Math.floor(PLAYER_SLIDER_REPEAT / 2);
const PLAYER_ORDER_ROW_STEP = 148;
const PLAYER_ORDER_ROW_CENTER = 74;

const DEFAULT_ABILITIES: AbilityBlock = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10
};

export function App(): JSX.Element {
  if (!api) {
    return <MissingElectronApi />;
  }

  const isPlayerView = window.location.hash.startsWith('#/player');
  return isPlayerView ? <PlayerDisplay /> : <MasterApp />;
}

function MissingElectronApi(): JSX.Element {
  return (
    <main className="startup-error">
      <section>
        <Swords size={46} />
        <h1>Приложение открыто без desktop-оболочки</h1>
        <p>
          База данных, импорт NPC и экран игроков работают через Electron API. Запустите приложение командой{' '}
          <code>npm.cmd run dev</code> из папки проекта, а не открывайте адрес Vite напрямую в браузере.
        </p>
      </section>
    </main>
  );
}

function MasterApp(): JSX.Element {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [tab, setTab] = useState<TabKey>('combat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [xpResult, setXpResult] = useState<CompleteCombatResult | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
      setError(err instanceof Error ? err.message : String(err));
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
      setError('Desktop API устарел: полностью остановите dev-версию и запустите npm.cmd run dev заново, чтобы закрытие опыта синхронизировалось с экраном игроков.');
    }
  }

  useEffect(() => {
    void run(() => loadCampaigns());
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
            <button
              className="rail-settings-button"
              type="button"
              aria-label="Открыть настройки"
              title="Настройки"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={21} />
              <span>Настройки</span>
            </button>
          </div>
        </div>
      </aside>

      <main className={`workspace ${tab === 'players' ? 'players-workspace' : ''}`}>
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
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
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

function CampaignSwitcher({
  campaigns,
  selectedId,
  busy,
  onSelect,
  onCreate,
  onDelete
}: {
  campaigns: Campaign[];
  selectedId: string;
  busy: boolean;
  onSelect: (id: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}): JSX.Element {
  const [name, setName] = useState('');

  return (
    <section className="rail-section">
      <p className="section-label">Кампании</p>
      <div className="campaign-list">
        {campaigns.map((campaign) => (
          <article className={`campaign-card ${campaign.id === selectedId ? 'active' : ''}`} key={campaign.id}>
            <button type="button" className="campaign-select" onClick={() => void onSelect(campaign.id)}>
              {campaign.name}
            </button>
            <HoldDeleteButton label="кампанию" iconOnly disabled={busy} onConfirm={() => onDelete(campaign.id)} />
          </article>
        ))}
      </div>
      <form
        className="compact-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          void onCreate(name.trim()).then(() => setName(''));
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Новая кампания" />
        <button className="icon-button" type="submit" disabled={busy} aria-label="Создать кампанию">
          <Plus size={18} />
        </button>
      </form>
    </section>
  );
}

function EmptyCampaignState({ busy, onCreate }: { busy: boolean; onCreate: (name: string) => Promise<void> }): JSX.Element {
  const [name, setName] = useState('Ильмарен');
  return (
    <section className="empty-state">
      <div>
        <p className="eyebrow">Старт</p>
        <h2>Создайте профиль кампании</h2>
      </div>
      <form
        className="hero-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreate(name);
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} />
        <button className="button primary" type="submit" disabled={busy}>
          <Plus size={20} />
          Создать
        </button>
      </form>
    </section>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: JSX.Element; label: string }): JSX.Element {
  return (
    <button className={`tab-button ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function HoldDeleteButton({
  label,
  onConfirm,
  disabled,
  compact = false,
  iconOnly = false,
  className = ''
}: {
  label: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  compact?: boolean;
  iconOnly?: boolean;
  className?: string;
}): JSX.Element {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);

  function clearHold(): void {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
  }

  function startHold(event: PointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;

    setHolding(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    timerRef.current = setTimeout(() => {
      clearHold();
      void onConfirm();
    }, HOLD_DELETE_MS);
  }

  function stopHold(event: PointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    clearHold();
  }

  useEffect(() => clearHold, []);

  return (
    <button
      className={`hold-delete-button ${compact ? 'compact' : ''} ${iconOnly ? 'icon-only' : ''} ${holding ? 'is-holding' : ''} ${className}`}
      type="button"
      disabled={disabled}
      title={`Зажмите, чтобы удалить: ${label}`}
      aria-label={`Зажмите, чтобы удалить: ${label}`}
      onPointerDown={startHold}
      onPointerUp={stopHold}
      onPointerCancel={stopHold}
      onPointerLeave={stopHold}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <Trash2 size={iconOnly ? 19 : 18} />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}

function PlayersPanel({
  detail,
  busy,
  run,
  onRefresh
}: {
  detail: CampaignDetail;
  busy: boolean;
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
  onRefresh: () => Promise<void>;
}): JSX.Element {
  const [draft, setDraft] = useState(() => emptyPlayer(detail.campaign.id));
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [importInfoOpen, setImportInfoOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const lssFileInputRef = useRef<HTMLInputElement | null>(null);
  const playerImportRef = useRef<HTMLDivElement | null>(null);
  const playerFormRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => setDraft(emptyPlayer(detail.campaign.id)), [detail.campaign.id]);

  useEffect(() => {
    function closeOnOutsidePointer(event: globalThis.PointerEvent): void {
      if (!playerImportRef.current?.contains(event.target as Node)) {
        setImportInfoOpen(false);
        setImportMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  useEffect(() => {
    function handlePlayerNumberWheel(event: WheelEvent): void {
      const input = document.activeElement;
      if (!(input instanceof HTMLInputElement)) return;
      if (!playerFormRef.current?.contains(input) || input.type !== 'number') return;

      event.preventDefault();
      event.stopPropagation();
      const step = event.deltaY < 0 ? 1 : -1;

      setDraft((current) => {
        switch (input.name) {
          case 'level':
            return { ...current, level: Math.max(1, current.level + step) };
          case 'armorClass':
            return { ...current, armorClass: Math.max(0, current.armorClass + step) };
          case 'maxHp':
            return { ...current, maxHp: Math.max(1, current.maxHp + step) };
          case 'initiativeMod':
            return { ...current, initiativeMod: current.initiativeMod + step };
          case 'passivePerception':
            return { ...current, passivePerception: Math.max(1, current.passivePerception + step) };
          default:
            return current;
        }
      });
    }

    window.addEventListener('wheel', handlePlayerNumberWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handlePlayerNumberWheel, { capture: true });
  }, []);

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    await run(() => api.savePlayer(draft));
    setDraft(emptyPlayer(detail.campaign.id));
    setImportMessage('');
    setImportError('');
    await onRefresh();
  }

  function applyLssImport(payload: unknown): void {
    const imported = importPlayerFromLss(payload, detail.campaign.id);
    setDraft(imported);
    setImportError('');
    setImportMessage(`Импортирован персонаж: ${imported.name}. Проверьте поля и нажмите “Сохранить”.`);
  }

  async function importLssFiles(fileList: FileList | null | undefined): Promise<void> {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    try {
      const players: PlayerCharacter[] = [];
      const errors: string[] = [];

      for (const file of files) {
        try {
          players.push(importPlayerFromLss(JSON.parse(await file.text()), detail.campaign.id));
        } catch (err) {
          errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (!players.length) {
        throw new Error(errors.join('\n') || 'Не удалось прочитать LSS JSON.');
      }

      if (files.length === 1 && players.length === 1) {
        setDraft(players[0]);
        setImportError(errors.join('\n'));
        setImportMessage(`Импортирован персонаж: ${players[0].name}. Проверьте поля и нажмите “Сохранить”.`);
        return;
      }

      let savedCount = 0;
      for (const player of players) {
        const saved = await run(() => api.savePlayer(player));
        if (saved) savedCount += 1;
      }

      setDraft(emptyPlayer(detail.campaign.id));
      setImportError(errors.join('\n'));
      setImportMessage(`Пакетный импорт LSS: сохранено персонажей ${savedCount} из ${players.length}.`);
      await onRefresh();
    } catch (err) {
      setImportMessage('');
      setImportError(err instanceof Error ? err.message : 'Не удалось прочитать LSS JSON.');
    } finally {
      setImportMenuOpen(false);
      if (lssFileInputRef.current) lssFileInputRef.current.value = '';
    }
  }

  async function importLssFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard?.readText?.();
      if (!text?.trim()) throw new Error('Буфер обмена пуст или недоступен.');
      applyLssImport(JSON.parse(text));
      setImportMenuOpen(false);
    } catch (err) {
      setImportMessage('');
      setImportError(err instanceof Error ? err.message : 'Не удалось импортировать LSS JSON из буфера.');
    }
  }

  return (
    <section className="panel-grid two-columns players-layout">
      <div className="panel player-editor-panel">
        <div className="panel-title split" ref={playerImportRef}>
          <div className="panel-title inline-title player-title">
            <Users size={22} />
            <h2>{draft.id ? 'Редактировать игрока' : 'Добавить игрока'}</h2>
            <button
              className="icon-button import-info-button"
              type="button"
              aria-label="Как импортировать персонажей из LSS"
              aria-expanded={importInfoOpen}
              onClick={() => setImportInfoOpen((current) => !current)}
            >
              <Info size={18} />
            </button>
            {importInfoOpen && (
              <div className="import-info-popover player-import-info-popover">
                <h3>Импорт Long Story Short</h3>
                <p>В LSS откройте персонажа, найдите экспорт/сохранение персонажа и выгрузите JSON-файл.</p>
                <p>Один файл заполнит форму для проверки. Несколько выбранных JSON-файлов будут сохранены в кампанию сразу.</p>
                <p>Если в JSON есть портрет, аватар или image URL, он попадёт в поле арта персонажа.</p>
              </div>
            )}
          </div>
          <div className="player-import-actions">
            <input
              ref={lssFileInputRef}
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              multiple
              onChange={(event) => void importLssFiles(event.target.files)}
            />
            <div className={`player-import-dropdown ${importMenuOpen ? 'open' : ''}`}>
              <button className="button secondary" type="button" disabled={busy} aria-expanded={importMenuOpen} onClick={() => setImportMenuOpen((current) => !current)}>
                <UploadCloud size={18} />
                Импорт LSS
                <ChevronDown size={17} />
              </button>
              {importMenuOpen && (
                <div className="player-import-menu">
                  <button className="player-import-menu-item" type="button" onClick={() => lssFileInputRef.current?.click()}>
                    <UploadCloud size={18} />
                    <span>
                      <strong>Выбрать JSON-файлы</strong>
                      <small>Один файл для проверки или несколько для пакетного импорта</small>
                    </span>
                  </button>
                  <button className="player-import-menu-item" type="button" onClick={() => void importLssFromClipboard()}>
                    <ClipboardPaste size={18} />
                    <span>
                      <strong>Вставить из буфера</strong>
                      <small>Заполнит форму одним персонажем из JSON</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {importMessage && (
          <div className="notice player-import-notice">
            <Info size={18} />
            {importMessage}
          </div>
        )}
        {importError && (
          <div className="notice error player-import-notice">
            <Info size={18} />
            {importError}
          </div>
        )}
        <form ref={playerFormRef} className="form-grid player-form" onSubmit={(event) => void save(event)}>
          <label>
            Имя
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label>
            Уровень
            <input name="level" type="number" value={draft.level} onChange={(event) => setDraft({ ...draft, level: readNumber(event.target.value, 1) })} />
          </label>
          <label>
            КД
            <input name="armorClass" type="number" value={draft.armorClass} onChange={(event) => setDraft({ ...draft, armorClass: readNumber(event.target.value, 10) })} />
          </label>
          <label>
            Хиты
            <input name="maxHp" type="number" value={draft.maxHp} onChange={(event) => setDraft({ ...draft, maxHp: readNumber(event.target.value, 1) })} />
          </label>
          <label>
            Инициатива
            <input
              name="initiativeMod"
              type="number"
              value={draft.initiativeMod}
              onChange={(event) => setDraft({ ...draft, initiativeMod: readNumber(event.target.value, 0) })}
            />
          </label>
          <label>
            Пасс. восприятие
            <input
              name="passivePerception"
              type="number"
              value={draft.passivePerception}
              onChange={(event) => setDraft({ ...draft, passivePerception: readNumber(event.target.value, 10) })}
            />
          </label>
          <label className={`wide player-active-toggle ${draft.active ? 'active' : ''}`}>
            <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />
            <span className="player-active-mark" aria-hidden="true">
              <Swords size={17} />
            </span>
            <span>
              <strong>Активен в боях</strong>
              <small>{draft.active ? 'Персонаж добавляется в энкаунтеры и бои' : 'Персонаж хранится в кампании, но не участвует в боях'}</small>
            </span>
          </label>
          <label className="wide">
            Арт персонажа
            <ImageUrlInput value={draft.imageUrl} onChange={(imageUrl) => setDraft({ ...draft, imageUrl })} placeholder="URL портрета или аватара персонажа" />
          </label>
          <label className="wide player-notes-field">
            Заметки
            <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </label>
          <div className="form-actions wide">
            <button className="button primary" type="submit" disabled={busy}>
              <Save size={19} />
              Сохранить
            </button>
            {draft.id && (
              <button className="button secondary" type="button" onClick={() => setDraft(emptyPlayer(detail.campaign.id))}>
                Сброс
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="list-stack player-list-scroll">
        {detail.players.map((player) => (
          <article className={`entity-card selectable player-list-card ${draft.id === player.id ? 'active' : ''} ${player.active ? '' : 'inactive-player'}`} key={player.id}>
            <button type="button" className="player-list-main player-list-button" onClick={() => setDraft({ ...player })}>
              {player.imageUrl ? <img className="player-list-avatar" src={player.imageUrl} alt="" /> : <span className="player-list-avatar empty">{player.name.slice(0, 1) || '?'}</span>}
              <div>
                <div className="player-list-name-row">
                  <h3>{player.name}</h3>
                  {!player.active && <span className="inactive-player-badge">Не активен в боях</span>}
                </div>
                <p>
                  Уровень {player.level} · КД {player.armorClass} · Хиты {player.maxHp} · инициатива {signed(player.initiativeMod)}
                </p>
              </div>
            </button>
            <div className="card-actions">
              <HoldDeleteButton label="Удалить игрока" compact disabled={busy} onConfirm={() => run(() => api.deletePlayer(player.id)).then(onRefresh)} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LibraryPanel({
  detail,
  busy,
  run,
  onRefresh
}: {
  detail: CampaignDetail;
  busy: boolean;
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
  onRefresh: () => Promise<void>;
}): JSX.Element {
  const [url, setUrl] = useState('https://ruleholder.com/monsters/steam-mephit');
  const [importInfoOpen, setImportInfoOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(detail.creatures[0]?.id ?? '');
  const [draft, setDraft] = useState<SaveCreatureTemplateInput>(() => detail.creatures[0] ?? emptyCreature(detail.campaign.id));
  const [creatureSearch, setCreatureSearch] = useState('');
  const [creatureSearchOpen, setCreatureSearchOpen] = useState(false);
  const creatureSearchRef = useRef<HTMLDivElement | null>(null);
  const filteredCreatures = useMemo(() => {
    const query = creatureSearch.trim().toLocaleLowerCase('ru');
    if (!query) return detail.creatures;
    return detail.creatures.filter((creature) => {
      const haystack = [creature.name, creature.originalName, creature.creatureType, creature.challengeRating].join(' ').toLocaleLowerCase('ru');
      return haystack.includes(query);
    });
  }, [creatureSearch, detail.creatures]);

  useEffect(() => {
    const selected = detail.creatures.find((creature) => creature.id === selectedId) ?? detail.creatures[0];
    setDraft(selected ? { ...selected } : emptyCreature(detail.campaign.id));
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [detail.creatures, detail.campaign.id]);

  useEffect(() => {
    function closeOnOutsidePointer(event: globalThis.PointerEvent): void {
      if (!creatureSearchRef.current?.contains(event.target as Node)) setCreatureSearchOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  function selectCreature(creature: CreatureTemplate): void {
    setSelectedId(creature.id);
    setDraft({ ...creature });
    setCreatureSearch('');
    setCreatureSearchOpen(false);
  }

  async function importCreature(event: FormEvent): Promise<void> {
    event.preventDefault();
    const creature = await run(() => api.importRuleholderCreature(detail.campaign.id, url));
    if (creature) {
      setSelectedId(creature.id);
      setDraft({ ...creature });
      await onRefresh();
    }
  }

  async function pasteImportUrl(): Promise<void> {
    try {
      const text = await navigator.clipboard?.readText?.();
      if (text?.trim()) setUrl(text.trim());
    } catch {
      // Clipboard access can be denied by the OS; keep the current URL in that case.
    }
  }

  async function saveCreature(event: FormEvent): Promise<void> {
    event.preventDefault();
    const saved = await run(() => api.saveCreature(draft));
    if (saved) {
      setSelectedId(saved.id);
      setDraft({ ...saved });
      await onRefresh();
    }
  }

  return (
    <section className="panel-grid library-layout">
      <div className="panel">
        <div className="import-header">
          <PanelTitle icon={<UploadCloud size={22} />} title="Импорт NPC" />
          <button
            className="icon-button import-info-button"
            type="button"
            aria-label="Ресурсы для импорта"
            aria-expanded={importInfoOpen}
            onClick={() => setImportInfoOpen((current) => !current)}
          >
            <Info size={18} />
          </button>
          {importInfoOpen && (
            <div className="import-info-popover">
              <h3>Ресурсы импорта</h3>
              <a href="https://ruleholder.com/monsters" target="_blank" rel="noreferrer">
                Ruleholder Monsters
              </a>
              <a href="https://next.dnd.su/bestiary/" target="_blank" rel="noreferrer">
                DnD.su Next Bestiary
              </a>
              <a href="https://new.ttg.club/bestiary" target="_blank" rel="noreferrer">
                TTG Club Bestiary
              </a>
            </div>
          )}
        </div>
        <form className="import-form" onSubmit={(event) => void importCreature(event)}>
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Ruleholder, next.dnd.su или new.ttg.club/bestiary/..." />
          <div className="import-actions">
            <button className="button secondary" type="button" disabled={busy} onClick={() => void pasteImportUrl()}>
              <ClipboardPaste size={19} />
              Вставить из буфера
            </button>
            <button className="button primary" type="submit" disabled={busy}>
              <UploadCloud size={19} />
              Импорт
            </button>
          </div>
        </form>
        <div className={`library-search ${creatureSearchOpen && creatureSearch.trim() ? 'open' : ''}`} ref={creatureSearchRef}>
          <input
            value={creatureSearch}
            onChange={(event) => {
              setCreatureSearch(event.target.value);
              setCreatureSearchOpen(true);
            }}
            onFocus={() => setCreatureSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setCreatureSearchOpen(false);
            }}
            placeholder="Найти статблок"
            aria-label="Поиск статблоков"
          />
          {creatureSearchOpen && creatureSearch.trim() && (
            <div className="custom-select-menu library-search-menu" role="listbox" aria-label="Найденные статблоки">
              {filteredCreatures.length ? (
                filteredCreatures.map((creature) => (
                  <button className="custom-select-option library-search-option" type="button" key={creature.id} onClick={() => selectCreature(creature)}>
                    <span className="custom-select-option-content">
                      <span>
                        <strong>{creature.name}</strong>
                        <small>
                          КД {creature.armorClass} · Хиты {creature.hitPoints} · КО {creature.challengeRating || '-'}
                        </small>
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="custom-select-empty">Статблок не найден</div>
              )}
            </div>
          )}
        </div>
        <div className="list-stack compact-list library-creature-list">
          <button className="entity-card ghost" type="button" onClick={() => setDraft(emptyCreature(detail.campaign.id))}>
            <Plus size={20} />
            Новый NPC вручную
          </button>
          {detail.creatures.map((creature) => (
            <article className={`entity-card selectable ${creature.id === selectedId ? 'active' : ''}`} key={creature.id}>
              <button
                type="button"
                className="entity-card-main"
                onClick={() => selectCreature(creature)}
              >
                <h3>{creature.name}</h3>
                <p>
                  КД {creature.armorClass} · Хиты {creature.hitPoints} · КО {creature.challengeRating || '-'}
                </p>
              </button>
              <HoldDeleteButton
                label="статблок NPC"
                iconOnly
                disabled={busy}
                onConfirm={async () => {
                  await run(() => api.deleteCreature(creature.id));
                  if (creature.id === selectedId) {
                    setSelectedId('');
                    setDraft(emptyCreature(detail.campaign.id));
                  }
                  await onRefresh();
                }}
              />
            </article>
          ))}
        </div>
      </div>

      <CreatureEditor
        draft={draft}
        busy={busy}
        onDraft={setDraft}
        onSave={saveCreature}
        onDelete={
          draft.id
            ? async () => {
                await run(() => api.deleteCreature(String(draft.id)));
                setSelectedId('');
                setDraft(emptyCreature(detail.campaign.id));
                await onRefresh();
              }
            : undefined
        }
      />
    </section>
  );
}

function CreatureEditor({
  draft,
  busy,
  onDraft,
  onSave,
  onDelete
}: {
  draft: SaveCreatureTemplateInput;
  busy: boolean;
  onDraft: (creature: SaveCreatureTemplateInput) => void;
  onSave: (event: FormEvent) => Promise<void>;
  onDelete?: () => Promise<void>;
}): JSX.Element {
  useEffect(() => {
    function handleWheel(event: WheelEvent): void {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLTextAreaElement)) return;
      if (!activeElement.closest('.stat-editor')) return;
      if (activeElement.scrollHeight <= activeElement.clientHeight) return;

      event.preventDefault();
      event.stopPropagation();
      activeElement.scrollTop += event.deltaY;
    }

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, []);

  return (
    <div className="panel stat-editor">
      <div className="panel-title split">
        <div className="panel-title inline-title">
          <Skull size={22} />
          <h2>Статблок NPC</h2>
        </div>
        {onDelete && (
          <HoldDeleteButton label="Удалить статблок NPC" disabled={busy} onConfirm={onDelete} />
        )}
      </div>
      <form className="stat-editor-form" onSubmit={(event) => void onSave(event)}>
        <div className="stat-editor-sections">
          <StatEditorSection title="Основное" description="Имя, размер и тип существа" defaultOpen>
            <div className="form-grid">
              <label>
                Имя
                <input value={draft.name} onChange={(event) => onDraft({ ...draft, name: event.target.value })} placeholder="Например: Паровой мефит" />
              </label>
              <label>
                Оригинал
                <input value={draft.originalName} onChange={(event) => onDraft({ ...draft, originalName: event.target.value })} placeholder="Например: Steam Mephit" />
              </label>
              <label>
                Размер
                <input value={draft.size} onChange={(event) => onDraft({ ...draft, size: event.target.value })} placeholder="Например: Небольшой или Средний" />
              </label>
              <label>
                Тип
                <input value={draft.creatureType} onChange={(event) => onDraft({ ...draft, creatureType: event.target.value })} placeholder="Например: Элементаль, Гуманоид, Дракон" />
              </label>
            </div>
          </StatEditorSection>

          <StatEditorSection title="Боевые параметры" description="КД, хиты, скорость, инициатива и опыт" defaultOpen>
            <div className="form-grid">
              <label>
                КД
                <input
                  type="number"
                  value={draft.armorClass}
                  onChange={(event) => onDraft({ ...draft, armorClass: readNumber(event.target.value, 10) })}
                  placeholder="Например: 15"
                />
              </label>
              <label>
                Хиты
                <input
                  type="number"
                  value={draft.hitPoints}
                  onChange={(event) => onDraft({ ...draft, hitPoints: readNumber(event.target.value, 1) })}
                  placeholder="Среднее значение, например: 81"
                />
              </label>
              <label>
                Кубы хитов
                <input value={draft.hitDice} onChange={(event) => onDraft({ ...draft, hitDice: event.target.value })} placeholder="Формула кубов: 18d8 или 23d12 + 46" />
              </label>
              <label>
                Инициатива
                <input
                  type="number"
                  value={draft.initiativeMod}
                  onChange={(event) => onDraft({ ...draft, initiativeMod: readNumber(event.target.value, 0) })}
                  placeholder="Модификатор, например: 2 или -1"
                />
              </label>
              <label className="wide">
                Скорость
                <input
                  value={draft.speeds}
                  onChange={(event) => onDraft({ ...draft, speeds: event.target.value })}
                  placeholder="Через запятую: 30 футов, полёт 60 футов, плавание 30 футов"
                />
              </label>
              <label>
                КО
                <input
                  value={draft.challengeRating}
                  onChange={(event) => onDraft({ ...draft, challengeRating: event.target.value })}
                  placeholder="Обычная дробь или число: 1/4, 3, 15"
                />
              </label>
              <label>
                ПО
                <input
                  type="number"
                  value={draft.xp}
                  onChange={(event) => onDraft({ ...draft, xp: readNumber(event.target.value, 0) })}
                  placeholder="Опыт числом: 50, 3900, 13000"
                />
              </label>
            </div>
          </StatEditorSection>

          <StatEditorSection title="Характеристики" description="СИЛ, ЛВК, ВЫН, ИНТ, МДР и ХАР" defaultOpen={false}>
            <AbilityEditor abilities={draft.abilities} onChange={(abilities) => onDraft({ ...draft, abilities })} />
          </StatEditorSection>

          <StatEditorSection title="Навыки и защиты" description="Навыки, устойчивости и невосприимчивости" defaultOpen={false}>
            <div className="form-grid">
              <label className="wide">
                Навыки
                <input
                  value={draft.skills}
                  onChange={(event) => onDraft({ ...draft, skills: event.target.value })}
                  placeholder="Через запятую: Внимание +4, Скрытность +8"
                />
              </label>
              <label className="wide">
                Устойчивости
                <input
                  value={draft.resistances}
                  onChange={(event) => onDraft({ ...draft, resistances: event.target.value })}
                  placeholder="Через запятую: Огонь, Холод; дробящий от немагических атак"
                />
              </label>
              <label className="wide">
                Невосприимчивость
                <input
                  value={draft.immunities}
                  onChange={(event) => onDraft({ ...draft, immunities: event.target.value })}
                  placeholder="Через запятую: Огонь, Яд; состояние Отравленный"
                />
              </label>
            </div>
          </StatEditorSection>

          <StatEditorSection title="Медиа" description="Изображение и токен для экранов боя" defaultOpen={false}>
            <div className="form-grid">
              <label className="wide">
                Изображение
                <ImageUrlInput value={draft.imageUrl} onChange={(imageUrl) => onDraft({ ...draft, imageUrl })} placeholder="URL портрета существа" />
              </label>
              <label className="wide">
                Токен
                <ImageUrlInput value={draft.tokenUrl} onChange={(tokenUrl) => onDraft({ ...draft, tokenUrl })} placeholder="URL круглого токена, если он есть" />
              </label>
            </div>
          </StatEditorSection>

          <StatEditorSection title="Особенности" description="Пассивные свойства, заклинания и правила существа" defaultOpen={false}>
            <FeatureListEditor
              section="Особенности"
              addLabel="Добавить особенность"
              emptyLabel="Особенности пока не добавлены"
              features={draft.traits}
              onChange={(traits) => onDraft({ ...draft, traits })}
            />
          </StatEditorSection>

          <StatEditorSection title="Действия" description="Атаки, реакции и активные возможности" defaultOpen={false}>
            <FeatureListEditor
              section="Действия"
              addLabel="Добавить действие"
              emptyLabel="Действия пока не добавлены"
              features={draft.actions}
              onChange={(actions) => onDraft({ ...draft, actions })}
            />
          </StatEditorSection>
        </div>

        <div className="form-actions stat-editor-actions">
          <button className="button primary" type="submit" disabled={busy}>
            <Save size={19} />
            Сохранить
          </button>
        </div>
      </form>
    </div>
  );
}

function StatEditorSection({
  title,
  description,
  defaultOpen,
  children
}: {
  title: string;
  description: string;
  defaultOpen: boolean;
  children: ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details className="stat-editor-section" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="stat-editor-section-summary">
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <ChevronDown size={20} />
      </summary>
      <div className="stat-editor-section-body">{children}</div>
    </details>
  );
}

function ImageUrlInput({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadLocalImage(file: File | undefined): Promise<void> {
    if (!file) return;
    onChange(await readFileAsDataUrl(file));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="local-image-field">
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        onChange={(event) => void loadLocalImage(event.target.files?.[0])}
      />
      <button className="button secondary" type="button" onClick={() => fileInputRef.current?.click()}>
        <UploadCloud size={18} />
        Загрузить
      </button>
    </div>
  );
}

function FeatureListEditor({
  features,
  section,
  addLabel,
  emptyLabel,
  defaultName,
  onChange
}: {
  features: CreatureFeature[];
  section: string;
  addLabel: string;
  emptyLabel: string;
  defaultName?: string;
  onChange: (features: CreatureFeature[]) => void;
}): JSX.Element {
  const nextDefaultName = defaultName ?? (section === 'Действия' ? 'Новое действие' : 'Новая особенность');

  function updateFeature(index: number, patch: Partial<Pick<CreatureFeature, 'name' | 'description'>>): void {
    onChange(
      features.map((feature, featureIndex) =>
        featureIndex === index
          ? {
              ...feature,
              ...patch,
              section,
              html: patch.name !== undefined || patch.description !== undefined ? '' : feature.html
            }
          : feature
      )
    );
  }

  function moveFeature(index: number, direction: -1 | 1): void {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= features.length) return;

    const nextFeatures = [...features];
    const [feature] = nextFeatures.splice(index, 1);
    nextFeatures.splice(nextIndex, 0, feature);
    onChange(nextFeatures);
  }

  function removeFeature(index: number): void {
    onChange(features.filter((_, featureIndex) => featureIndex !== index));
  }

  function addFeature(): void {
    onChange([
      ...features,
      {
        id: `${section}-${clientId()}`.replace(/\s+/g, '-').toLocaleLowerCase('ru'),
        name: nextDefaultName,
        section,
        description: '',
        html: ''
      }
    ]);
  }

  return (
    <div className="feature-editor">
      <div className="feature-editor-list">
        {features.length ? (
          features.map((feature, index) => (
            <article className="feature-editor-card" key={feature.id || `${section}-${index}`}>
              <div className="feature-editor-card-header">
                <strong>{index + 1}</strong>
                <div className="feature-editor-tools">
                  <button className="icon-button feature-editor-button" type="button" disabled={index === 0} onClick={() => moveFeature(index, -1)} aria-label="Поднять выше">
                    <ArrowUp size={17} />
                  </button>
                  <button
                    className="icon-button feature-editor-button"
                    type="button"
                    disabled={index === features.length - 1}
                    onClick={() => moveFeature(index, 1)}
                    aria-label="Опустить ниже"
                  >
                    <ArrowDown size={17} />
                  </button>
                  <button className="icon-button danger feature-editor-button" type="button" onClick={() => removeFeature(index)} aria-label="Удалить элемент">
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
              <div className="feature-editor-fields">
                <label>
                  Название
                  <input value={feature.name} onChange={(event) => updateFeature(index, { name: event.target.value })} placeholder={nextDefaultName} />
                </label>
                <label>
                  Описание
                  <textarea
                    value={feature.description}
                    onChange={(event) => updateFeature(index, { description: event.target.value })}
                    placeholder="Описание способности"
                  />
                </label>
              </div>
            </article>
          ))
        ) : (
          <div className="feature-editor-empty">{emptyLabel}</div>
        )}
      </div>
      <button className="button secondary feature-editor-add" type="button" onClick={addFeature}>
        <Plus size={18} />
        {addLabel}
      </button>
    </div>
  );
}

function AbilityEditor({ abilities, onChange }: { abilities: AbilityBlock; onChange: (abilities: AbilityBlock) => void }): JSX.Element {
  const labels: Array<[keyof AbilityBlock, string]> = [
    ['str', 'СИЛ'],
    ['dex', 'ЛВК'],
    ['con', 'ВЫН'],
    ['int', 'ИНТ'],
    ['wis', 'МДР'],
    ['cha', 'ХАР']
  ];
  return (
    <div className="ability-grid wide">
      {labels.map(([key, label]) => (
        <label key={key}>
          {label}
          <input type="number" value={abilities[key]} onChange={(event) => onChange({ ...abilities, [key]: readNumber(event.target.value, 10) })} />
        </label>
      ))}
    </div>
  );
}

function EncountersPanel({
  detail,
  busy,
  run,
  onRefresh,
  onStart
}: {
  detail: CampaignDetail;
  busy: boolean;
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
  onRefresh: () => Promise<void>;
  onStart: () => void;
}): JSX.Element {
  const [encounterName, setEncounterName] = useState('Новый энкаунтер');
  const [selectedId, setSelectedId] = useState(detail.encounters[0]?.id ?? '');
  const selected = detail.encounters.find((encounter) => encounter.id === selectedId) ?? detail.encounters[0] ?? null;

  useEffect(() => {
    if (!selectedId && detail.encounters[0]) setSelectedId(detail.encounters[0].id);
  }, [detail.encounters, selectedId]);

  async function createEncounter(event: FormEvent): Promise<void> {
    event.preventDefault();
    const encounter = await run(() => api.saveEncounter({ campaignId: detail.campaign.id, name: encounterName }));
    if (encounter) {
      setSelectedId(encounter.id);
      setEncounterName('Новый энкаунтер');
      await onRefresh();
    }
  }

  return (
    <section className="panel-grid encounter-layout">
      <div className="panel">
        <PanelTitle icon={<Swords size={22} />} title="Энкаунтеры" />
        <form className="compact-form roomy" onSubmit={(event) => void createEncounter(event)}>
          <input value={encounterName} onChange={(event) => setEncounterName(event.target.value)} />
          <button className="icon-button" type="submit" disabled={busy} aria-label="Создать энкаунтер">
            <Plus size={18} />
          </button>
        </form>
        <div className="list-stack compact-list">
          {detail.encounters.map((encounter) => (
            <article className={`entity-card selectable ${encounter.id === selected?.id ? 'active' : ''}`} key={encounter.id}>
              <button type="button" className="entity-card-main" onClick={() => setSelectedId(encounter.id)}>
                <h3>{encounter.name}</h3>
                <p>{encounter.groups.reduce((sum, group) => sum + group.quantity, 0)} существ</p>
              </button>
              <HoldDeleteButton
                label="энкаунтер"
                iconOnly
                disabled={busy}
                onConfirm={async () => {
                  await run(() => api.deleteEncounter(encounter.id));
                  if (encounter.id === selectedId) setSelectedId('');
                  await onRefresh();
                }}
              />
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        {selected ? (
          <EncounterBuilder
            encounter={selected}
            creatures={detail.creatures}
            players={detail.players}
            busy={busy}
            run={run}
            onRefresh={onRefresh}
            onDelete={async () => {
              await run(() => api.deleteEncounter(selected.id));
              setSelectedId('');
              await onRefresh();
            }}
            onStart={async () => {
              const session = await run(() => api.startCombat(selected.id));
              if (session) {
                await onRefresh();
                onStart();
              }
            }}
          />
        ) : (
          <InlineEmpty title="Создайте энкаунтер" />
        )}
      </div>
    </section>
  );
}

function EncounterBuilder({
  encounter,
  creatures,
  players,
  busy,
  run,
  onRefresh,
  onDelete,
  onStart
}: {
  encounter: Encounter;
  creatures: CreatureTemplate[];
  players: PlayerCharacter[];
  busy: boolean;
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
  onRefresh: () => Promise<void>;
  onDelete: () => Promise<void>;
  onStart: () => Promise<void>;
}): JSX.Element {
  const [templateId, setTemplateId] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [initiativeMode, setInitiativeMode] = useState<InitiativeMode>('individual');
  const [hpMode, setHpMode] = useState<HitPointMode>('average');
  const [hpOverride, setHpOverride] = useState('');
  const [isAlly, setIsAlly] = useState(false);
  const [addLairWithCreature, setAddLairWithCreature] = useState(false);
  const templateById = useMemo(() => new Map(creatures.map((creature) => [creature.id, creature])), [creatures]);
  const selectedTemplate = templateById.get(templateId);
  const playerSettingById = useMemo(() => new Map(encounter.playerSettings.map((setting) => [setting.playerId, setting])), [encounter.playerSettings]);
  const canAddGroup = Boolean(templateId && (hpMode !== 'fixed' || hpOverride.trim()));
  const canAddLairFromTemplate = Boolean(selectedTemplate?.lairDescription || selectedTemplate?.lairHtml || selectedTemplate?.lairName);
  const difficulty = useMemo(
    () => calculateEncounterDifficulty(players, encounter.playerSettings, encounter.groups, creatures),
    [creatures, encounter.groups, encounter.playerSettings, players]
  );
  const creatureOptions = useMemo<SelectOption[]>(
    () =>
      creatures.map((creature) => ({
        value: creature.id,
        label: creature.name,
        description: [creature.challengeRating ? `КО ${creature.challengeRating}` : '', creature.hitPoints ? `Хиты ${creature.hitPoints}` : '', creature.hitDice ? creature.hitDice : '']
          .filter(Boolean)
          .join(' · ')
      })),
    [creatures]
  );

  useEffect(() => {
    if (templateId && !templateById.has(templateId)) {
      setTemplateId('');
      setTemplateSearch('');
    }
  }, [templateById, templateId]);

  useEffect(() => {
    const selected = templateById.get(templateId);
    if (selected && templateSearch !== selected.name) {
      setTemplateSearch(selected.name);
    }
  }, [templateById, templateId, templateSearch]);

  useEffect(() => {
    if (encounter.lair || !canAddLairFromTemplate) {
      setAddLairWithCreature(false);
    }
  }, [canAddLairFromTemplate, encounter.lair]);

  async function addGroup(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canAddGroup) return;
    const selected = templateById.get(templateId);
    await run(() =>
      api.saveEncounterGroup({
        encounterId: encounter.id,
        templateId,
        quantity,
        initiativeMode,
        hpMode,
        hpOverride: hpMode === 'fixed' && hpOverride.trim() ? readNumber(hpOverride, 1) : null,
        isAlly
      })
    );
    if (addLairWithCreature && selected && !encounter.lair) {
      await run(() => saveLairFromTemplate(encounter.id, selected));
    }
    setTemplateId('');
    setTemplateSearch('');
    setQuantity(1);
    setHpMode('average');
    setHpOverride('');
    setIsAlly(false);
    setAddLairWithCreature(false);
    await onRefresh();
  }

  async function addLair(): Promise<void> {
    if (encounter.lair) return;
    const selected = templateById.get(templateId);
    if (addLairWithCreature && selected && canAddLairFromTemplate) {
      await run(() => saveLairFromTemplate(encounter.id, selected));
      setAddLairWithCreature(false);
      await onRefresh();
      return;
    }

    await run(() =>
      api.saveEncounterLair({
        encounterId: encounter.id,
        templateId: null,
        name: 'Логово',
        description: 'Логово действует на инициативе 20.',
        html: '',
        effects: []
      })
    );
    await onRefresh();
  }

  async function saveGroupInitiative(
    group: EncounterCreatureGroup,
    patch: Partial<Pick<EncounterCreatureGroup, 'quantity' | 'initiativeAdvantage' | 'initiativeOverride' | 'isAlly'>>
  ): Promise<void> {
    await run(() =>
      api.saveEncounterGroup({
        id: group.id,
        encounterId: group.encounterId,
        templateId: group.templateId,
        displayName: group.displayName,
        quantity: patch.quantity ?? group.quantity,
        initiativeMode: group.initiativeMode,
        initiativeAdvantage: patch.initiativeAdvantage ?? group.initiativeAdvantage,
        initiativeOverride: patch.initiativeOverride === undefined ? group.initiativeOverride : patch.initiativeOverride,
        hpMode: group.hpMode,
        hpOverride: group.hpOverride,
        isAlly: patch.isAlly ?? group.isAlly
      })
    );
    await onRefresh();
  }

  async function savePlayerInitiative(
    player: PlayerCharacter,
    setting: EncounterPlayerSetting | undefined,
    patch: Partial<Pick<EncounterPlayerSetting, 'participating' | 'initiativeAdvantage' | 'initiativeOverride'>>
  ): Promise<void> {
    await run(() =>
      api.saveEncounterPlayerSetting({
        encounterId: encounter.id,
        playerId: player.id,
        participating: patch.participating ?? setting?.participating ?? true,
        initiativeAdvantage: patch.initiativeAdvantage ?? setting?.initiativeAdvantage ?? false,
        initiativeOverride: patch.initiativeOverride === undefined ? setting?.initiativeOverride ?? null : patch.initiativeOverride
      })
    );
    await onRefresh();
  }

  return (
    <>
      <div className="panel-title split">
        <div>
          <h2>{encounter.name}</h2>
          <p>{encounter.groups.length} групп NPC</p>
        </div>
        <div className="toolbar-actions">
          <HoldDeleteButton label="Удалить энкаунтер" disabled={busy} onConfirm={onDelete} />
          <button className="button primary" type="button" disabled={busy || !encounter.groups.length} onClick={() => void onStart()}>
            <Play size={20} />
            Начать бой
          </button>
        </div>
      </div>
      <EncounterDifficultyScale result={difficulty} />
      <form className="form-grid" onSubmit={(event) => void addGroup(event)}>
        <label className="wide">
          NPC
          <SearchableSelect
            value={templateId}
            search={templateSearch}
            onSearchChange={setTemplateSearch}
            onChange={(value) => {
              setTemplateId(value);
              setTemplateSearch(templateById.get(value)?.name ?? '');
            }}
            options={creatureOptions}
            placeholder="Выберите NPC"
            searchPlaceholder="Найти NPC"
            ariaLabel="Выбрать NPC"
          />
        </label>
        <label>
          Количество
          <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(readNumber(event.target.value, 1))} />
        </label>
        <label>
          Хиты
          <CustomSelect
            value={hpMode}
            onChange={(value) => setHpMode(value as HitPointMode)}
            options={[
              { value: 'average', label: 'Средние из статблока' },
              { value: 'random', label: 'Случайно по кубам', description: templateById.get(templateId)?.hitDice || 'Нужны кубы хитов' },
              { value: 'fixed', label: 'Ручное значение' }
            ]}
            placeholder="Выберите режим хитов"
            ariaLabel="Выбрать режим хитов"
          />
        </label>
        {hpMode === 'fixed' && (
          <label>
            Значение хитов
            <input value={hpOverride} onChange={(event) => setHpOverride(event.target.value.replace(/[^\d]/g, ''))} placeholder="например 27" />
          </label>
        )}
        <label className="wide">
          Инициатива
          <CustomSelect
            value={initiativeMode}
            onChange={(value) => setInitiativeMode(value as InitiativeMode)}
            options={[
              { value: 'individual', label: 'Каждому отдельно' },
              { value: 'group', label: 'Группой' }
            ]}
            placeholder="Выберите режим инициативы"
            ariaLabel="Выбрать режим инициативы"
          />
        </label>
        <label className={`wide ally-toggle-row ${isAlly ? 'active' : ''}`}>
          <input type="checkbox" checked={isAlly} onChange={(event) => setIsAlly(event.target.checked)} />
          <span className="ally-toggle-mark" aria-hidden="true">
            <Shield size={18} />
          </span>
          <span>
            <strong>Союзник</strong>
            <small>Существо сражается на стороне игроков и не учитывается при начислении опыта</small>
          </span>
        </label>
        {canAddLairFromTemplate && !encounter.lair && (
          <label className={`wide lair-checkbox-row ${addLairWithCreature ? 'active' : ''}`}>
            <input type="checkbox" checked={addLairWithCreature} onChange={(event) => setAddLairWithCreature(event.target.checked)} />
            <span className="lair-checkbox-mark">
              <Shield size={17} />
            </span>
            <span className="lair-checkbox-copy">
              <strong>Добавить логово существа</strong>
              <small>{selectedTemplate?.lairName || selectedTemplate?.name || 'Логово существа'}</small>
            </span>
          </label>
        )}
        <div className="form-actions wide">
          <button className="button secondary" type="submit" disabled={busy || !canAddGroup}>
            <Plus size={19} />
            Добавить NPC
          </button>
          <button className="button secondary" type="button" disabled={busy || Boolean(encounter.lair)} onClick={() => void addLair()}>
            <Shield size={19} />
            {addLairWithCreature ? 'Добавить логово существа' : 'Добавить логово'}
          </button>
        </div>
      </form>

      <div className="encounter-roster">
        <section className="encounter-roster-section players">
          <div className="section-heading">
            <span>Игроки кампании</span>
            <strong>{players.filter((player) => player.active && (playerSettingById.get(player.id)?.participating ?? true)).length}</strong>
          </div>
          <div className="list-stack">
            {players
              .filter((player) => player.active)
              .map((player) => {
                const setting = playerSettingById.get(player.id);
                const participating = setting?.participating ?? true;
                return (
                  <article className={`entity-card player-roster-card ${participating ? '' : 'not-participating'}`} key={player.id}>
                    <div>
                      <h3>{player.name}</h3>
                      <p>
                        Уровень {player.level} · КД {player.armorClass} · Хиты {player.maxHp} · инициатива {signed(player.initiativeMod)}
                      </p>
                    </div>
                    <div className="roster-card-actions">
                      <label className={`participation-toggle ${participating ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={participating}
                          disabled={busy}
                          onChange={(event) => void savePlayerInitiative(player, setting, { participating: event.target.checked })}
                        />
                        <span>Участвует в бою</span>
                      </label>
                      <InitiativeSettingControls
                        advantage={setting?.initiativeAdvantage ?? false}
                        override={setting?.initiativeOverride ?? null}
                        baseInitiative={player.initiativeMod}
                        busy={busy || !participating}
                        onAdvantageChange={(initiativeAdvantage) => void savePlayerInitiative(player, setting, { initiativeAdvantage })}
                        onOverrideSave={(initiativeOverride) => void savePlayerInitiative(player, setting, { initiativeOverride })}
                      />
                    </div>
                  </article>
                );
              })}
            {players.filter((player) => player.active).length === 0 && <div className="roster-empty">Нет активных игроков</div>}
          </div>
        </section>

        {encounter.lair && (
          <section className="encounter-roster-section lair">
            <div className="section-heading">
              <span>Логово</span>
              <strong>1</strong>
            </div>
            <EncounterLairEditor lair={encounter.lair} busy={busy} run={run} onRefresh={onRefresh} />
          </section>
        )}

        <section className="encounter-roster-section">
          <div className="section-heading">
            <span>NPC группы</span>
            <strong>{encounter.groups.length}</strong>
          </div>
          <div className="list-stack">
        {encounter.groups.map((group) => {
          const template = templateById.get(group.templateId);
          return (
            <article className={`entity-card encounter-npc-card ${group.isAlly ? 'ally' : ''}`} key={group.id}>
              <div>
                <div className="encounter-npc-name-row">
                  <h3>{group.displayName}</h3>
                  {group.isAlly && <span className="ally-badge"><Shield size={14} />Союзник</span>}
                </div>
                <p>
                  {group.quantity} шт. · {describeInitiativeMode(group.initiativeMode)} · Хиты {describeHitPointMode(group, template)}
                </p>
              </div>
              <div className="roster-card-actions">
                <EncounterQuantityControl
                  quantity={group.quantity}
                  busy={busy}
                  onSave={(quantity) => void saveGroupInitiative(group, { quantity })}
                />
                <label className={`participation-toggle ally-card-toggle ${group.isAlly ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={group.isAlly}
                    disabled={busy}
                    onChange={(event) => void saveGroupInitiative(group, { isAlly: event.target.checked })}
                  />
                  <span>Союзник</span>
                </label>
                <InitiativeSettingControls
                  advantage={group.initiativeAdvantage}
                  override={group.initiativeOverride}
                  baseInitiative={template?.initiativeMod ?? 0}
                  busy={busy}
                  onAdvantageChange={(initiativeAdvantage) => void saveGroupInitiative(group, { initiativeAdvantage })}
                  onOverrideSave={(initiativeOverride) => void saveGroupInitiative(group, { initiativeOverride })}
                />
                <HoldDeleteButton
                  label="группу NPC"
                  iconOnly
                  disabled={busy}
                  onConfirm={() => run(() => api.deleteEncounterGroup(group.id)).then(onRefresh)}
                />
              </div>
            </article>
          );
        })}
          </div>
        </section>
      </div>
    </>
  );
}

function EncounterDifficultyScale({ result }: { result: EncounterDifficultyResult }): JSX.Element {
  if (!result.ok) {
    return (
      <section className="encounter-difficulty-panel unavailable">
        <div className="encounter-difficulty-heading">
          <div>
            <span className="eyebrow">Оценка сложности</span>
            <h3>Недостаточно данных</h3>
          </div>
          <Info size={20} />
        </div>
        <p>{result.message}</p>
        {result.hasAllies && <EncounterAllyDifficultyWarning />}
      </section>
    );
  }

  const [low, medium, high] = result.budgets;
  const scaleMaximum = Math.max(1, Math.ceil(high.xp * 1.25));
  const markerPosition = Math.min(100, (result.enemyXp / scaleMaximum) * 100);
  const columns = [low.xp, medium.xp - low.xp, high.xp - medium.xp, scaleMaximum - high.xp]
    .map((value) => `${Math.max(1, value)}fr`)
    .join(' ');

  return (
    <section className={`encounter-difficulty-panel ${result.difficulty}`}>
      <div className="encounter-difficulty-heading">
        <div>
          <span className="eyebrow">Оценка сложности</span>
          <h3>{result.difficultyLabel}</h3>
        </div>
        <span className={`difficulty-result-badge ${result.difficulty}`}>{result.enemyXp.toLocaleString('ru-RU')} XP врагов</span>
      </div>

      <div className="encounter-difficulty-party">
        <span>{result.partySize} игроков</span>
        <span>Средний уровень {result.averageLevel}</span>
        <span>{result.levelSummary}</span>
        <span className="inline-help" title="Расчёт использует прямой бюджет XP и не применяет множители количества монстров.">
          <Info size={15} />
        </span>
      </div>

      <div className="difficulty-scale-wrap">
        <div className="difficulty-scale" style={{ gridTemplateColumns: columns }}>
          <span className="below" title="Ниже бюджета низкой сложности">Ниже</span>
          <span className="low" title={low.description}>Низкая</span>
          <span className="medium" title={medium.description}>Средняя</span>
          <span className="high" title={high.description}>Высокая+</span>
        </div>
        <span className="difficulty-scale-marker" style={{ left: `${markerPosition}%` }} title={`Текущая сцена: ${result.enemyXp.toLocaleString('ru-RU')} XP`}>
          <span />
        </span>
      </div>

      <div className="difficulty-budget-grid">
        {result.budgets.map((budget) => (
          <div className={`difficulty-budget-card ${budget.key}`} key={budget.key} title={budget.description}>
            <span>{budget.label}</span>
            <strong>{budget.xp.toLocaleString('ru-RU')} XP</strong>
            <Info size={15} />
          </div>
        ))}
      </div>

      {result.hasAllies && <EncounterAllyDifficultyWarning />}
      {result.missingXpGroups > 0 && (
        <div className="difficulty-warning missing-xp">
          <Info size={18} />
          <span>У {result.missingXpGroups} вражеских групп не найден XP или распознаваемый КО. Они не вошли в расчёт.</span>
        </div>
      )}
    </section>
  );
}

function EncounterAllyDifficultyWarning(): JSX.Element {
  return (
    <div className="difficulty-warning allies">
      <Info size={18} />
      <span>В сцене есть союзники. Калькулятор может работать неточно, поскольку их влияние на бой невозможно оценить только по XP.</span>
    </div>
  );
}

function EncounterLairEditor({
  lair,
  busy,
  run,
  onRefresh
}: {
  lair: EncounterLair;
  busy: boolean;
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
  onRefresh: () => Promise<void>;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({
    name: lair.name,
    description: lair.description,
    effects: lair.effects
  }));

  useEffect(() => {
    setDraft({
      name: lair.name,
      description: lair.description,
      effects: lair.effects
    });
    setEditing(false);
  }, [lair.id, lair.name, lair.description, lair.effects]);

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    await run(() =>
      api.saveEncounterLair({
        encounterId: lair.encounterId,
        templateId: lair.templateId,
        name: draft.name,
        description: draft.description,
        html: lair.html,
        effects: draft.effects
      })
    );
    await onRefresh();
    setEditing(false);
  }

  function resetDraft(): void {
    setDraft({
      name: lair.name,
      description: lair.description,
      effects: lair.effects
    });
  }

  return (
    <article className="entity-card lair-roster-card lair-editor-card">
      <div className="lair-editor-header">
        <div>
          <h3>{lair.name}</h3>
          <p>Инициатива 20 · эффектов {lair.effects.length}</p>
        </div>
        <div className="lair-editor-actions">
          <button className={`icon-button ${editing ? 'active' : ''}`} type="button" disabled={busy} onClick={() => setEditing((current) => !current)} aria-label={editing ? 'Закрыть редактирование логова' : 'Редактировать логово'}>
            {editing ? <X size={18} /> : <Edit3 size={18} />}
          </button>
          <HoldDeleteButton
            label="логово"
            iconOnly
            disabled={busy}
            onConfirm={() => run(() => api.deleteEncounterLair(lair.encounterId)).then(onRefresh)}
          />
        </div>
      </div>

      {editing && (
        <form className="lair-editor-form" onSubmit={(event) => void save(event)}>
          <div className="form-grid">
            <label>
              Название логова
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Логово" />
            </label>
            <label>
              Инициатива
              <input value="20" disabled readOnly />
            </label>
            <label className="wide">
              Описание
              <textarea
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder="Общее описание логова или правило, которое будет видно в статблоке логова"
              />
            </label>
          </div>

          <StatEditorSection title="Эффекты логова" description="Удаляйте лишние эффекты, меняйте порядок и добавляйте свои" defaultOpen>
            <FeatureListEditor
              section="Эффекты логова"
              addLabel="Добавить эффект логова"
              emptyLabel="Эффекты логова пока не добавлены"
              defaultName="Новый эффект логова"
              features={draft.effects}
              onChange={(effects) => setDraft({ ...draft, effects })}
            />
          </StatEditorSection>

          <div className="form-actions">
            <button className="button primary" type="submit" disabled={busy}>
              <Save size={19} />
              Сохранить логово
            </button>
            <button className="button secondary" type="button" disabled={busy} onClick={resetDraft}>
              Сброс
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

function EncounterQuantityControl({ quantity, busy, onSave }: { quantity: number; busy: boolean; onSave: (quantity: number) => void }): JSX.Element {
  const [draft, setDraft] = useState(String(quantity));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setDraft(String(quantity)), [quantity]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;

    function handleWheel(event: WheelEvent): void {
      if (document.activeElement !== input) return;
      event.preventDefault();
      event.stopPropagation();
      setDraft((current) => String(Math.max(1, Math.min(99, readNumber(current, quantity) + (event.deltaY < 0 ? 1 : -1)))));
    }

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, [quantity]);

  function saveQuantity(): void {
    const next = Math.max(1, Math.min(99, Math.round(readNumber(draft, quantity))));
    setDraft(String(next));
    if (next !== quantity) onSave(next);
  }

  return (
    <label className="encounter-quantity-control">
      <span>Количество</span>
      <input
        ref={inputRef}
        value={draft}
        disabled={busy}
        inputMode="numeric"
        aria-label="Количество существ в группе"
        title="Введите от 1 до 99. Enter сохраняет значение."
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
        onBlur={saveQuantity}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(String(quantity));
          }
        }}
      />
    </label>
  );
}

function InitiativeSettingControls({
  advantage,
  override,
  baseInitiative,
  busy,
  onAdvantageChange,
  onOverrideSave
}: {
  advantage: boolean;
  override: number | null;
  baseInitiative: number;
  busy: boolean;
  onAdvantageChange: (advantage: boolean) => void;
  onOverrideSave: (override: number | null) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(override == null ? '' : String(override));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(override == null ? '' : String(override));
  }, [override]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;

    function handleWheel(event: WheelEvent): void {
      if (document.activeElement !== input) return;
      event.preventDefault();
      event.stopPropagation();
      setDraft((current) => String(readSignedNumber(current) + (event.deltaY < 0 ? 1 : -1)));
    }

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, []);

  function saveOverride(): void {
    const clean = draft.trim();
    onOverrideSave(clean ? readSignedNumber(clean) : null);
  }

  return (
    <div className="initiative-settings">
      <button
        className={`initiative-advantage-toggle ${advantage ? 'active' : ''}`}
        type="button"
        disabled={busy}
        aria-pressed={advantage}
        title="Бросок инициативы с преимуществом"
        onClick={() => onAdvantageChange(!advantage)}
      >
        <Dices size={17} />
        Преим.
      </button>
      <input
        ref={inputRef}
        className={`initiative-override-input ${draft.trim() ? 'active' : ''}`}
        value={draft}
        disabled={busy}
        inputMode="text"
        placeholder={signed(baseInitiative)}
        aria-label="Переписать инициативу"
        title="Enter сохранить, пустое поле очищает override"
        onChange={(event) => setDraft(normalizeSignedInput(event.target.value))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            saveOverride();
          }
        }}
      />
      <span className="initiative-override-label">Иниц.</span>
    </div>
  );
}

function CombatPanel({
  detail,
  busy,
  xpResult,
  onSession,
  onComplete,
  onClearXpResult,
  onRefresh,
  run
}: {
  detail: CampaignDetail;
  busy: boolean;
  xpResult: CompleteCombatResult | null;
  onSession: (session: CombatSession) => void;
  onComplete: (result: CompleteCombatResult) => void;
  onClearXpResult: () => void;
  onRefresh: () => Promise<void>;
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
}): JSX.Element {
  const session = detail.activeSession;
  const [draggingId, setDraggingId] = useState('');
  const [finishOpen, setFinishOpen] = useState(false);
  const [defeatedGiveXp, setDefeatedGiveXp] = useState(true);
  const [escapedXpMode, setEscapedXpMode] = useState<CompleteCombatOptions['escapedXpMode']>('none');
  const [customXpPool, setCustomXpPool] = useState('');
  const [xpAdjustment, setXpAdjustment] = useState('');
  const [shareXpWithAllies, setShareXpWithAllies] = useState(false);
  const [xpAllyIds, setXpAllyIds] = useState<string[]>([]);
  const [allyXpModalOpen, setAllyXpModalOpen] = useState(false);
  const ordered = session?.combatants.slice().sort((a, b) => a.turnOrder - b.turnOrder) ?? [];
  const xpAllies = ordered.filter((combatant) => combatant.side === 'npc' && combatant.isAlly);
  const currentTurnIndex = Math.max(
    0,
    ordered.findIndex((combatant) => combatant.id === session?.activeCombatantId)
  );
  const currentTurnNumber = ordered.length ? currentTurnIndex + 1 : 0;
  const absoluteTurnNumber = ordered.length ? (Math.max(1, session?.round ?? 1) - 1) * ordered.length + currentTurnNumber : 0;
  const activeCombatant = ordered[currentTurnIndex];
  const xpOptions: CompleteCombatOptions = {
    defeatedGiveXp,
    escapedXpMode,
    customXpPool: customXpPool.trim() ? readNumber(customXpPool, 0) : undefined,
    xpAdjustment: xpAdjustment.trim() ? readSignedNumber(xpAdjustment) : undefined,
    shareXpWithAllies,
    xpAllyIds
  };
  const xpPreview = session
    ? calculateExperience(
        session.combatants,
        session.combatants.filter((combatant) => combatant.side === 'player').map(() => ({ active: true })),
        xpOptions
      )
    : null;

  async function update(combatant: Combatant, patch: Partial<Combatant>): Promise<void> {
    const next = await run(() => api.updateCombatant(combatant.id, patch));
    if (next) onSession(next);
  }

  async function dropOn(targetId: string): Promise<void> {
    if (!session || !draggingId || draggingId === targetId) return;
    const ids = ordered.map((combatant) => combatant.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    const next = await run(() => api.reorderCombatants(session.id, ids));
    if (next) onSession(next);
    setDraggingId('');
  }

  async function completeCurrentCombat(): Promise<void> {
    if (!session) return;
    const options: CompleteCombatOptions = {
      defeatedGiveXp,
      escapedXpMode,
      customXpPool: customXpPool.trim() ? readNumber(customXpPool, 0) : undefined,
      xpAdjustment: xpAdjustment.trim() ? readSignedNumber(xpAdjustment) : undefined,
      shareXpWithAllies,
      xpAllyIds
    };
    const result = await run(() => api.completeCombat(session.id, options));
    if (result) {
      setFinishOpen(false);
      setCustomXpPool('');
      setXpAdjustment('');
      setShareXpWithAllies(false);
      setXpAllyIds([]);
      setAllyXpModalOpen(false);
      onComplete(result);
    }
  }

  async function navigateCombat(work: () => Promise<CombatSession>): Promise<void> {
    const next = await run(work);
    if (next) onSession(next);
  }

  useEffect(() => {
    if (!session || busy) return undefined;
    const sessionId = session.id;

    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target)) return;
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;

      event.preventDefault();
      if (event.key === 'ArrowRight') {
        void navigateCombat(() => (event.shiftKey ? api.advanceRound(sessionId) : api.advanceTurn(sessionId)));
      } else {
        void navigateCombat(() => (event.shiftKey ? api.retreatRound(sessionId) : api.retreatTurn(sessionId)));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, session, run, onSession]);

  if (!session) {
    return (
      <>
      <section className="panel">
        <PanelTitle icon={<Activity size={22} />} title="Активного боя нет" />
        <div className="list-stack">
          {detail.encounters.map((encounter) => (
            <article className="entity-card" key={encounter.id}>
              <div>
                <h3>{encounter.name}</h3>
                <p>{encounter.groups.reduce((sum, group) => sum + group.quantity, 0)} NPC готовы к бою</p>
              </div>
              <button
                className="button primary"
                type="button"
                disabled={busy || !encounter.groups.length}
                onClick={() =>
                  void run(() => api.startCombat(encounter.id)).then((next) => {
                    if (next) onSession(next);
                    void onRefresh();
                  })
                }
              >
                <Play size={19} />
                Старт
              </button>
            </article>
          ))}
        </div>
      </section>
      {xpResult && <XpAwardModal award={xpResult.xpAward} onClose={onClearXpResult} />}
      </>
    );
  }

  return (
    <section className="combat-layout">
      <div className="combat-toolbar">
        <div className="combat-heading">
          <p className="eyebrow">Раунд {session.round}</p>
          <h2>Боевой порядок</h2>
        </div>
        <div className="combat-counters" aria-label="Счётчики боя">
          <span>
            <strong>{session.round}</strong>
            Раунд
          </span>
          <span>
            <strong>
              {currentTurnNumber}/{ordered.length}
            </strong>
            Ход
          </span>
          <span>
            <strong>{absoluteTurnNumber}</strong>
            Всего ходов
          </span>
        </div>
        <div className="toolbar-actions">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => void navigateCombat(() => api.retreatTurn(session.id))}
          >
            <ChevronLeft size={20} />
            Ход назад
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => void navigateCombat(() => api.advanceTurn(session.id))}
          >
            <ChevronRight size={20} />
            Следующий ход
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => void navigateCombat(() => api.endRound(session.id))}
          >
            <ChevronDown size={20} />
            Завершить раунд
          </button>
          <button
            className="button danger"
            type="button"
            disabled={busy}
            onClick={() => setFinishOpen(true)}
          >
            <Skull size={20} />
            Завершить бой
          </button>
        </div>
      </div>
      {activeCombatant && (
        <div className="combat-active-bar">
          <span>Сейчас ходит</span>
          <strong>{activeCombatant.name}</strong>
        </div>
      )}
      <div className="combat-hotkeys" aria-label="Горячие клавиши боя">
        <Keyboard size={18} />
        <span>
          <kbd>←</kbd> ход назад
        </span>
        <span>
          <kbd>→</kbd> следующий ход
        </span>
        <span>
          <kbd>Shift</kbd> + <kbd>←</kbd>/<kbd>→</kbd> раунд назад/вперёд
        </span>
        <span>
          <kbd>Enter</kbd> применить +/- хиты
        </span>
      </div>

      {finishOpen && xpPreview && (
        <FinishCombatModal
          busy={busy}
          defeatedGiveXp={defeatedGiveXp}
          escapedXpMode={escapedXpMode}
          customXpPool={customXpPool}
          xpAdjustment={xpAdjustment}
          shareXpWithAllies={shareXpWithAllies}
          allyCount={xpAllies.length}
          selectedAllyCount={xpAllyIds.length}
          preview={xpPreview}
          onDefeatedGiveXpChange={setDefeatedGiveXp}
          onEscapedXpModeChange={setEscapedXpMode}
          onCustomXpPoolChange={setCustomXpPool}
          onXpAdjustmentChange={setXpAdjustment}
          onShareXpWithAlliesChange={(value) => {
            if (!value) {
              setShareXpWithAllies(false);
              setXpAllyIds([]);
              return;
            }
            if (!xpAllies.length) return;
            setShareXpWithAllies(true);
            setXpAllyIds((current) => (current.length ? current : xpAllies.map((ally) => ally.id)));
            setAllyXpModalOpen(true);
          }}
          onConfigureAllies={() => setAllyXpModalOpen(true)}
          onCancel={() => setFinishOpen(false)}
          onApply={() => void completeCurrentCombat()}
        />
      )}
      {finishOpen && allyXpModalOpen && (
        <AllyXpSelectionModal
          allies={xpAllies}
          selectedIds={xpAllyIds}
          onSelectedIdsChange={setXpAllyIds}
          onClose={() => {
            setShareXpWithAllies(xpAllyIds.length > 0);
            setAllyXpModalOpen(false);
          }}
        />
      )}

      <div className="combat-list">
        {ordered.map((combatant, index) => (
          <CombatantCard
            key={combatant.id}
            index={index}
            combatant={combatant}
            campaignId={session.campaignId}
            active={session.activeCombatantId === combatant.id}
            busy={busy}
            onDragStart={() => setDraggingId(combatant.id)}
            onDrop={() => void dropOn(combatant.id)}
            onSetActive={() => void run(() => api.setActiveCombatant(session.id, combatant.id)).then((next) => next && onSession(next))}
            onDamage={(amount) => void update(combatant, applyDamageToHitPoints(combatant, amount))}
            onHeal={(amount) => void update(combatant, { currentHp: combatant.currentHp + amount })}
            onDefeated={(defeated) => void update(combatant, { defeated })}
            onEscaped={(escaped) => void update(combatant, { escaped })}
            onEffects={(effects) => void update(combatant, { effects })}
            onPublicNameVisible={(publicNameVisible) => void update(combatant, { publicNameVisible })}
            onStats={(patch) => void update(combatant, patch)}
          />
        ))}
      </div>
    </section>
  );
}

function FinishCombatModal({
  busy,
  defeatedGiveXp,
  escapedXpMode,
  customXpPool,
  xpAdjustment,
  shareXpWithAllies,
  allyCount,
  selectedAllyCount,
  preview,
  onDefeatedGiveXpChange,
  onEscapedXpModeChange,
  onCustomXpPoolChange,
  onXpAdjustmentChange,
  onShareXpWithAlliesChange,
  onConfigureAllies,
  onCancel,
  onApply
}: {
  busy: boolean;
  defeatedGiveXp: boolean;
  escapedXpMode: CompleteCombatOptions['escapedXpMode'];
  customXpPool: string;
  xpAdjustment: string;
  shareXpWithAllies: boolean;
  allyCount: number;
  selectedAllyCount: number;
  preview: CombatXpAward;
  onDefeatedGiveXpChange: (value: boolean) => void;
  onEscapedXpModeChange: (value: CompleteCombatOptions['escapedXpMode']) => void;
  onCustomXpPoolChange: (value: string) => void;
  onXpAdjustmentChange: (value: string) => void;
  onShareXpWithAlliesChange: (value: boolean) => void;
  onConfigureAllies: () => void;
  onCancel: () => void;
  onApply: () => void;
}): JSX.Element {
  const escapedOptions: Array<{ value: CompleteCombatOptions['escapedXpMode']; label: string }> = [
    { value: 'none', label: 'Сбежавшие не дают опыт' },
    { value: 'full', label: 'Сбежавшие дают опыт' },
    { value: 'half', label: 'Сбежавшие дают половину опыта' }
  ];

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section className="app-modal xp-modal" role="dialog" aria-modal="true" aria-labelledby="finish-combat-title">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Завершение боя</p>
            <h2 id="finish-combat-title">Настройки опыта</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} disabled={busy} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>

        <div className="xp-settings">
          <label className={`choice-row ${defeatedGiveXp ? 'active' : ''}`}>
            <input type="checkbox" checked={defeatedGiveXp} onChange={(event) => onDefeatedGiveXpChange(event.target.checked)} />
            <span className="choice-mark" aria-hidden="true" />
            <span>Побеждённые дают опыт</span>
          </label>

          <div className="choice-group" role="radiogroup" aria-label="Опыт за сбежавших">
            {escapedOptions.map((option) => (
              <label className={`choice-row ${escapedXpMode === option.value ? 'active' : ''}`} key={option.value}>
                <input
                  type="radio"
                  name="escaped-xp-mode"
                  value={option.value}
                  checked={escapedXpMode === option.value}
                  onChange={() => onEscapedXpModeChange(option.value)}
                />
                <span className="choice-mark radio" aria-hidden="true" />
                <span>{option.label}</span>
              </label>
            ))}
          </div>

          <div className="xp-allies-setting">
            <label className={`choice-row ${shareXpWithAllies ? 'active' : ''} ${allyCount === 0 ? 'disabled' : ''}`}>
              <input
                type="checkbox"
                checked={shareXpWithAllies}
                disabled={allyCount === 0}
                onChange={(event) => onShareXpWithAlliesChange(event.target.checked)}
              />
              <span className="choice-mark" aria-hidden="true" />
              <span className="choice-copy">
                <strong>Разделить опыт с союзниками</strong>
                <small>{allyCount ? `Выбрано ${selectedAllyCount} из ${allyCount}` : 'В этом бою нет союзных существ'}</small>
              </span>
            </label>
            {shareXpWithAllies && (
              <button className="button secondary" type="button" onClick={onConfigureAllies}>
                <Users size={18} />
                Выбрать союзников
              </button>
            )}
          </div>

          <label className="xp-pool-field">
            Кастомный пул опыта
            <input
              inputMode="numeric"
              value={customXpPool}
              onChange={(event) => onCustomXpPoolChange(event.target.value.replace(/[^\d]/g, ''))}
              placeholder="Автоматический расчёт"
            />
          </label>

          <label className="xp-pool-field">
            Бонус/штраф к опыту
            <input
              inputMode="text"
              value={xpAdjustment}
              onChange={(event) => onXpAdjustmentChange(normalizeSignedInput(event.target.value))}
              placeholder="+0"
            />
          </label>
        </div>

        <div className="xp-preview">
          <Stat icon={<Skull size={18} />} label="Побеждено" value={preview.defeatedNpcCount} />
          <Stat icon={<ChevronRight size={18} />} label="Сбежало" value={preview.escapedNpcCount} />
          <Stat icon={<Users size={18} />} label="Игроков" value={preview.playerCount} />
          {preview.allyRecipientCount > 0 && <Stat icon={<Shield size={18} />} label="Союзников" value={preview.allyRecipientCount} />}
          <Stat icon={<Users size={18} />} label="Получателей" value={preview.recipientCount} />
          <Stat icon={<Plus size={18} />} label="Бонус/штраф" value={signed(preview.xpAdjustment)} />
          <Stat icon={<Dices size={18} />} label="Всего ПО" value={preview.totalXp} />
          <strong>По {preview.xpPerPlayer} ПО каждому участнику боя</strong>
        </div>

        <div className="modal-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={onCancel}>
            Отмена
          </button>
          <button className="button danger" type="button" disabled={busy} onClick={onApply}>
            <Skull size={19} />
            Применить
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function AllyXpSelectionModal({
  allies,
  selectedIds,
  onSelectedIdsChange,
  onClose
}: {
  allies: Combatant[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  onClose: () => void;
}): JSX.Element {
  const selected = new Set(selectedIds);

  return createPortal(
    <div className="modal-backdrop ally-xp-backdrop" role="presentation">
      <section className="app-modal ally-xp-modal" role="dialog" aria-modal="true" aria-labelledby="ally-xp-title">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Получатели опыта</p>
            <h2 id="ally-xp-title">Союзники</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>

        <div className="ally-xp-toolbar">
          <span>Выбрано {selectedIds.length} из {allies.length}</span>
          <div>
            <button className="button secondary" type="button" onClick={() => onSelectedIdsChange(allies.map((ally) => ally.id))}>
              Выбрать всех
            </button>
            <button className="button secondary" type="button" onClick={() => onSelectedIdsChange([])}>
              Снять выбор
            </button>
          </div>
        </div>

        <div className="ally-xp-list">
          {allies.map((ally) => {
            const checked = selected.has(ally.id);
            const snapshot = ally.snapshot && 'tokenUrl' in ally.snapshot ? ally.snapshot : null;
            const tokenUrl = snapshot ? snapshot.tokenUrl || snapshot.imageUrl : '';
            return (
              <label className={`ally-xp-row ${checked ? 'active' : ''}`} key={ally.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    onSelectedIdsChange(event.target.checked ? [...selectedIds, ally.id] : selectedIds.filter((id) => id !== ally.id))
                  }
                />
                {tokenUrl ? <img src={tokenUrl} alt="" /> : <span className="ally-xp-avatar"><Shield size={22} /></span>}
                <span className="ally-xp-copy">
                  <strong>{ally.name}</strong>
                  <small>{ally.defeated ? 'Побеждён' : ally.escaped ? 'Сбежал' : `Инициатива ${ally.initiative}`}</small>
                </span>
                <span className="choice-mark" aria-hidden="true" />
              </label>
            );
          })}
        </div>

        <div className="modal-actions">
          <button className="button primary" type="button" onClick={onClose}>Готово</button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function XpAwardModal({ award, onClose, publicView = false }: { award: CombatXpAward; onClose?: () => void; publicView?: boolean }): JSX.Element {
  return createPortal(
    <div className={`modal-backdrop ${publicView ? 'public' : ''}`} role="presentation">
      <section className={`app-modal xp-award-modal ${publicView ? 'public' : ''}`} role="dialog" aria-modal="true" aria-labelledby="xp-award-title">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Награда за бой</p>
            <h2 id="xp-award-title">Опыт начислен</h2>
          </div>
          {onClose && (
            <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть">
              <X size={20} />
            </button>
          )}
        </header>
        <div className="xp-award-total">
          <span>{award.xpPerPlayer}</span>
          <strong>ПО каждому участнику боя</strong>
        </div>
        <div className="xp-award-grid">
          <Stat icon={<Dices size={18} />} label="Общий пул" value={award.totalXp} />
          <Stat icon={<Users size={18} />} label="Игроков" value={award.playerCount} />
          {award.allyRecipientCount > 0 && <Stat icon={<Shield size={18} />} label="Союзников" value={award.allyRecipientCount} />}
          <Stat icon={<Users size={18} />} label="Получателей" value={award.recipientCount} />
          <Stat icon={<Skull size={18} />} label="Побеждено" value={award.defeatedNpcCount} />
          <Stat icon={<ChevronRight size={18} />} label="Сбежало" value={award.escapedNpcCount} />
          {award.xpAdjustment !== 0 && <Stat icon={<Plus size={18} />} label="Бонус/штраф" value={signed(award.xpAdjustment)} />}
        </div>
      </section>
    </div>,
    document.body
  );
}

function TimerEffectModal({
  name,
  rounds,
  busy,
  onNameChange,
  onRoundsChange,
  onCancel,
  onApply
}: {
  name: string;
  rounds: string;
  busy: boolean;
  onNameChange: (value: string) => void;
  onRoundsChange: (value: string) => void;
  onCancel: () => void;
  onApply: () => void;
}): JSX.Element {
  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section className="app-modal timer-modal" role="dialog" aria-modal="true" aria-labelledby="timer-effect-title">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Боевой таймер</p>
            <h2 id="timer-effect-title">Новый эффект</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} disabled={busy} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>
        <div className="timer-form">
          <label>
            Название
            <input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Например: Благословение" autoFocus />
          </label>
          <label>
            Раундов
            <input
              inputMode="numeric"
              value={rounds}
              onChange={(event) => onRoundsChange(event.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onApply();
                }
              }}
              placeholder="1"
            />
          </label>
        </div>
        <div className="modal-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={onCancel}>
            Отмена
          </button>
          <button className="button primary" type="button" disabled={busy} onClick={onApply}>
            <Clock size={18} />
            Создать
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function describeHitPointMode(group: EncounterCreatureGroup, template: CreatureTemplate | undefined): string {
  if (group.hpMode === 'fixed') return `${group.hpOverride ?? template?.hitPoints ?? '-'}`;
  if (group.hpMode === 'random') return template?.hitDice ? `случайно (${template.hitDice})` : `случайно (${template?.hitPoints ?? '-'})`;
  return `${template?.hitPoints ?? '-'} средние`;
}

function saveLairFromTemplate(encounterId: string, template: CreatureTemplate): Promise<unknown> {
  return api.saveEncounterLair({
    encounterId,
    templateId: template.id,
    name: template.lairName || `Логово: ${template.name}`,
    description: template.lairDescription,
    html: template.lairHtml,
    effects: template.lairEffects
  });
}

function CustomSelect({
  value,
  onChange,
  onSelect,
  selectedValues,
  options,
  placeholder,
  ariaLabel,
  disabled = false
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  selectedValues?: string[];
  options: SelectOption[];
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const selected = options.find((option) => option.value === value);

  function updateMenuPosition(): void {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const gap = 6;
    const viewportPadding = 12;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(180, Math.min(340, (openUp ? spaceAbove : spaceBelow) - gap));

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      right: 'auto',
      top: openUp ? 'auto' : rect.bottom + gap,
      bottom: openUp ? window.innerHeight - rect.top + gap : 'auto',
      width: rect.width,
      maxHeight,
      zIndex: 1001
    });
  }

  useEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();
    function closeOnOutsidePointer(event: globalThis.PointerEvent): void {
      if (!(event.target instanceof Node)) return;
      const inTrigger = rootRef.current?.contains(event.target) ?? false;
      const inMenu = menuRef.current?.contains(event.target) ?? false;
      if (!inTrigger && !inMenu) {
        setOpen(false);
      }
    }
    function handleViewportChange(): void {
      updateMenuPosition();
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open]);

  function choose(nextValue: string): void {
    if (onSelect) onSelect(nextValue);
    else onChange(nextValue);
    setOpen(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  return (
    <div className={`custom-select ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        className="custom-select-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      >
        {selected ? <CustomSelectOption option={selected} /> : <span className="custom-select-placeholder">{placeholder}</span>}
        <ChevronDown size={18} />
      </button>
      {open &&
        createPortal(
          <div ref={menuRef} className="custom-select-menu" style={menuStyle} role="listbox" aria-label={ariaLabel}>
          {options.length ? (
            options.map((option) => (
              <button
                className={`custom-select-option ${(selectedValues ?? [value]).includes(option.value) ? 'selected' : ''}`}
                type="button"
                role="option"
                aria-selected={(selectedValues ?? [value]).includes(option.value)}
                key={option.value}
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose(option.value);
                }}
                onClick={() => choose(option.value)}
              >
                <CustomSelectOption option={option} />
              </button>
            ))
          ) : (
            <div className="custom-select-empty">Нет вариантов</div>
          )}
          </div>,
          document.body
        )}
    </div>
  );
}

function SearchableSelect({
  value,
  search,
  onSearchChange,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  ariaLabel,
  disabled = false
}: {
  value: string;
  search: string;
  onSearchChange: (value: string) => void;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  searchPlaceholder: string;
  ariaLabel: string;
  disabled?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const normalizedSearch = search.trim().toLocaleLowerCase('ru');
  const filteredOptions = normalizedSearch
    ? options.filter((option) => `${option.label} ${option.description ?? ''}`.toLocaleLowerCase('ru').includes(normalizedSearch))
    : options;

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutsidePointer(event: globalThis.PointerEvent): void {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  function choose(option: SelectOption): void {
    onChange(option.value);
    onSearchChange(option.label);
    setOpen(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  return (
    <div className={`custom-select searchable-select ${open ? 'open' : ''}`} ref={rootRef}>
      <div className="searchable-select-control">
        <input
          value={search}
          placeholder={selected ? placeholder : searchPlaceholder}
          aria-label={ariaLabel}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onSearchChange(event.target.value);
            if (value) onChange('');
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
            }
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter' && filteredOptions[0]) {
              event.preventDefault();
              choose(filteredOptions[0]);
            }
          }}
        />
        <button
          className="searchable-select-toggle"
          type="button"
          aria-label="Открыть список NPC"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown size={18} />
        </button>
      </div>
      {open && (
        <div className="custom-select-menu searchable-select-menu" role="listbox" aria-label={ariaLabel}>
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <button
                className={`custom-select-option ${option.value === value ? 'selected' : ''}`}
                type="button"
                role="option"
                aria-selected={option.value === value}
                key={option.value}
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                onClick={() => choose(option)}
              >
                <CustomSelectOption option={option} />
              </button>
            ))
          ) : (
            <div className="custom-select-empty">NPC не найден</div>
          )}
        </div>
      )}
    </div>
  );
}

function CustomSelectOption({ option }: { option: SelectOption }): JSX.Element {
  return (
    <span className="custom-select-option-content">
      {option.icon && <img src={option.icon} alt="" />}
      <span>
        <strong>{option.label}</strong>
        {option.description && <small>{option.description}</small>}
      </span>
    </span>
  );
}

function isCreatureSnapshot(snapshot: Combatant['snapshot']): snapshot is CreatureTemplate {
  return Boolean(snapshot && 'speeds' in snapshot && 'actions' in snapshot);
}

function isLairSnapshot(snapshot: Combatant['snapshot']): snapshot is EncounterLair {
  return Boolean(snapshot && 'initiative' in snapshot && 'description' in snapshot && 'encounterId' in snapshot);
}

function combatantToLairFallback(combatant: Combatant): EncounterLair | null {
  if (combatant.snapshot || combatant.initiative !== 20 || combatant.armorClass !== 0 || combatant.maxHp !== 1) return null;
  const timestamp = new Date().toISOString();
  return {
    id: combatant.initiativeGroupId ?? combatant.id,
    encounterId: combatant.sessionId,
    templateId: combatant.templateId,
    name: combatant.name,
    initiative: 20,
    description: combatant.publicNotes,
    html: '',
    effects: combatant.publicNotes
      ? [
          {
            id: 'lair-description',
            name: 'Описание логова',
            section: 'Логово',
            description: combatant.publicNotes
          }
        ]
      : [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function getCombatantBaseArmorClass(combatant: Combatant): number {
  return combatant.baseArmorClass ?? combatant.armorClass;
}

function getCombatantBaseMaxHp(combatant: Combatant): number {
  return combatant.baseMaxHp ?? combatant.maxHp;
}

function formatHitPoints(currentHp: number, maxHp: number, temporaryHp = 0): string {
  const temp = Math.max(0, Math.round(temporaryHp));
  return temp > 0 ? `${currentHp}(+${temp})/${maxHp}` : `${currentHp}/${maxHp}`;
}

function applyDamageToHitPoints(combatant: Combatant, amount: number): Pick<CombatantPatch, 'currentHp' | 'temporaryHp'> {
  const damage = Math.max(0, Math.round(amount));
  const temporaryDamage = Math.min(combatant.temporaryHp, damage);
  const remainingDamage = damage - temporaryDamage;
  return {
    temporaryHp: combatant.temporaryHp - temporaryDamage,
    currentHp: combatant.currentHp - remainingDamage
  };
}

function CombatantCard({
  combatant,
  campaignId,
  index,
  active,
  busy,
  onDragStart,
  onDrop,
  onSetActive,
  onDamage,
  onHeal,
  onDefeated,
  onEscaped,
  onEffects,
  onPublicNameVisible,
  onStats
}: {
  combatant: Combatant;
  campaignId: string;
  index: number;
  active: boolean;
  busy: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onSetActive: () => void;
  onDamage: (amount: number) => void;
  onHeal: (amount: number) => void;
  onDefeated: (defeated: boolean) => void;
  onEscaped: (escaped: boolean) => void;
  onEffects: (effects: CombatEffect[]) => void;
  onPublicNameVisible: (publicNameVisible: boolean) => void;
  onStats: (patch: Pick<CombatantPatch, 'armorClass' | 'maxHp' | 'currentHp' | 'temporaryHp'>) => void;
}): JSX.Element {
  const [effectName, setEffectName] = useState('');
  const [hpDelta, setHpDelta] = useState('');
  const hpDeltaInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [statEditor, setStatEditor] = useState<'ac' | 'hp' | null>(null);
  const [shiftMode, setShiftMode] = useState(false);
  const [timerName, setTimerName] = useState('');
  const [timerRounds, setTimerRounds] = useState('1');
  const creatureSnapshot = combatant.snapshot && isCreatureSnapshot(combatant.snapshot) ? combatant.snapshot : null;
  const lairSnapshot = combatant.snapshot && isLairSnapshot(combatant.snapshot) ? combatant.snapshot : combatantToLairFallback(combatant);
  const isLairCombatant = Boolean(lairSnapshot);
  const bloodied = isBloodied(combatant.currentHp, combatant.maxHp);
  const concentrating = isConcentrating(combatant.effects);
  const baseArmorClass = getCombatantBaseArmorClass(combatant);
  const baseMaxHp = getCombatantBaseMaxHp(combatant);
  const concentrationTooltip = concentrating ? 'Прекратить концентрацию' : 'Включить концентрацию';
  const publicNameTooltip = combatant.publicNameVisible ? 'Скрыть имя на экране игроков' : 'Показать имя на экране игроков';

  function addCustomEffect(): void {
    if (!effectName.trim()) return;
    onEffects([...combatant.effects, { id: clientId(), label: effectName.trim(), public: true }]);
    setEffectName('');
  }

  function addStatusEffect(statusId: string): void {
    const nextEffects = addStatusEffects(combatant.effects, expandStatusEffectIds(statusId), clientId);
    if (nextEffects.length === combatant.effects.length) return;
    onEffects(nextEffects);
  }

  function toggleDefeated(): void {
    if (combatant.defeated) {
      onDefeated(false);
      return;
    }

    const nextEffects = addStatusEffects(combatant.effects, UNCONSCIOUS_DEPENDENCY_STATUS_IDS, clientId);
    if (nextEffects.length !== combatant.effects.length) onEffects(nextEffects);
    onDefeated(true);
  }

  function toggleEscaped(): void {
    onEscaped(!combatant.escaped);
  }

  function toggleConcentration(): void {
    if (concentrating) {
      onEffects(combatant.effects.filter((effect) => effect.statusId !== CONCENTRATION_STATUS_ID));
      return;
    }
    const status = getStatusEffectDefinition(CONCENTRATION_STATUS_ID);
    if (!status) return;
    onEffects([...combatant.effects, { id: clientId(), label: status.label, public: status.public, statusId: status.id }]);
  }

  function addTimedEffect(): void {
    const rounds = Math.max(1, Math.min(99, Math.round(readNumber(timerRounds, 1))));
    const label = timerName.trim() || 'Таймер';
    onEffects([
      ...combatant.effects,
      {
        id: clientId(),
        label,
        public: true,
        timed: true,
        durationRounds: rounds,
        remainingRounds: rounds
      }
    ]);
    setTimerName('');
    setTimerRounds('1');
    setTimerOpen(false);
  }

  function applyHpDelta(): void {
    const amount = readSignedNumber(hpDelta);
    if (shiftMode) {
      if (amount < 0) onStats({ temporaryHp: Math.max(0, combatant.temporaryHp - Math.abs(amount)) });
      if (amount > 0) onStats({ temporaryHp: combatant.temporaryHp + amount });
    } else {
      if (amount < 0) onDamage(Math.abs(amount));
      if (amount > 0) onHeal(amount);
    }
    if (amount !== 0) setHpDelta('');
  }

  function damageButtonClass(): string {
    return `button mini danger ${shiftMode ? 'temporary-damage' : ''}`;
  }

  function healButtonClass(): string {
    return `button mini secondary ${shiftMode ? 'temporary-healing' : ''}`;
  }

  useEffect(() => {
    const input = hpDeltaInputRef.current;
    if (!input) return undefined;

    function handleWheel(event: WheelEvent): void {
      if (document.activeElement !== input) return;
      event.preventDefault();
      event.stopPropagation();
      setHpDelta((current) => {
        const next = readSignedNumber(current) + (event.deltaY < 0 ? 1 : -1);
        return formatSignedInput(next);
      });
    }

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, []);

  useEffect(() => {
    function syncShiftMode(event: KeyboardEvent): void {
      setShiftMode(event.shiftKey);
    }

    function clearShiftMode(): void {
      setShiftMode(false);
    }

    window.addEventListener('keydown', syncShiftMode);
    window.addEventListener('keyup', syncShiftMode);
    window.addEventListener('blur', clearShiftMode);
    return () => {
      window.removeEventListener('keydown', syncShiftMode);
      window.removeEventListener('keyup', syncShiftMode);
      window.removeEventListener('blur', clearShiftMode);
    };
  }, []);

  return (
    <article
      className={`combat-card ${active ? 'active' : ''} ${combatant.isAlly ? 'ally' : ''} ${bloodied ? 'bloodied' : ''} ${concentrating ? 'concentrating' : ''} ${combatant.defeated ? 'defeated' : ''} ${combatant.escaped ? 'escaped' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      {!combatant.defeated && (
        <button
          className={`concentration-button ${concentrating ? 'active' : ''}`}
          type="button"
          aria-label={concentrationTooltip}
          aria-pressed={concentrating}
          disabled={busy}
          onClick={toggleConcentration}
          title={concentrationTooltip}
        >
          <img src="./statuses/concentrating.svg" alt="" />
        </button>
      )}
      {!isLairCombatant && combatant.defeated && (
        <span className="death-mark" aria-hidden="true">
          <Skull size={34} />
        </span>
      )}
      {!isLairCombatant && combatant.escaped && (
        <span className="escaped-mark" aria-hidden="true">
          <LogOut size={32} />
          Сбежал
        </span>
      )}
      <button className="turn-index" type="button" onClick={onSetActive} disabled={busy} aria-label="Сделать активным">
        {index + 1}
      </button>
      <div className="combat-main">
        <div className="combat-heading">
          <div>
            <div className="combat-name-row">
              <h3>{combatant.name}</h3>
              {combatant.side === 'npc' && (
                <button
                  className={`name-visibility-button ${combatant.publicNameVisible ? 'active' : ''}`}
                  type="button"
                  aria-label={publicNameTooltip}
                  aria-pressed={combatant.publicNameVisible}
                  disabled={busy}
                  title={publicNameTooltip}
                  onClick={() => onPublicNameVisible(!combatant.publicNameVisible)}
                >
                  {combatant.publicNameVisible ? <Eye size={18} /> : <EyeOff size={18} />}
                  <span>{combatant.publicNameVisible ? 'Имя открыто' : 'Имя скрыто'}</span>
                </button>
              )}
            </div>
            <p>
              Иниц. {combatant.initiative} · {combatant.side === 'npc' ? 'NPC' : 'Игрок'}
            </p>
          </div>
          {!isLairCombatant && (
            <div className="combat-stats">
              <Stat icon={<Shield size={18} />} label="КД" value={combatant.armorClass} onClick={() => setStatEditor('ac')} />
              <Stat icon={<HeartPulse size={18} />} label="Хиты" value={formatHitPoints(combatant.currentHp, combatant.maxHp, combatant.temporaryHp)} onClick={() => setStatEditor('hp')} />
            </div>
          )}
        </div>

        <div className="chip-row">
          {combatant.isAlly && <span className="chip ally-chip"><Shield size={15} />Союзник</span>}
          {!isLairCombatant && bloodied && <span className="chip danger-chip">Окровавлен</span>}
          {!isLairCombatant && combatant.defeated && <span className="chip muted-chip">Побеждён</span>}
          {!isLairCombatant && combatant.escaped && <span className="chip muted-chip">Сбежал</span>}
          {combatant.effects.map((effect) => (
            <StatusEffectChip
              key={effect.id}
              effect={effect}
              onRemove={() => onEffects(combatant.effects.filter((item) => item.id !== effect.id))}
            />
          ))}
        </div>

        <div className="combat-controls">
          {!isLairCombatant && (
            <section className="combat-control-group hp-control" aria-label="Управление хитами">
              <span className="control-label hint-label">
                Хиты
                <span className="inline-help" title="Зажмите Shift, чтобы кнопки урона и лечения меняли временные хиты.">
                  <Info size={13} />
                </span>
              </span>
              <div className="hp-actions">
                {[1, 5, 10].map((amount) => (
                  <button
                    className={damageButtonClass()}
                    type="button"
                    key={`damage-${amount}`}
                    disabled={busy}
                    title={shiftMode ? 'Уменьшить временные хиты' : 'Нанести урон'}
                    onClick={(event) => {
                      if (shiftMode || event.shiftKey) onStats({ temporaryHp: Math.max(0, combatant.temporaryHp - amount) });
                      else onDamage(amount);
                    }}
                  >
                    -{amount}
                  </button>
                ))}
                <input
                  ref={hpDeltaInputRef}
                  className={`damage-input ${shiftMode && readSignedNumber(hpDelta) > 0 ? 'temporary-healing' : shiftMode && readSignedNumber(hpDelta) < 0 ? 'temporary-damage' : readSignedNumber(hpDelta) > 0 ? 'healing' : readSignedNumber(hpDelta) < 0 ? 'damage' : ''}`}
                  inputMode="text"
                  value={hpDelta}
                  disabled={busy}
                  onChange={(event) => setHpDelta(normalizeSignedInput(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      applyHpDelta();
                    }
                  }}
                  placeholder="+/- хиты"
                  aria-label="Изменить хиты"
                />
                {[1, 5, 10].map((amount) => (
                  <button
                    className={healButtonClass()}
                    type="button"
                    key={`heal-${amount}`}
                    disabled={busy}
                    title={shiftMode ? 'Добавить временные хиты' : 'Вылечить'}
                    onClick={(event) => {
                      if (shiftMode || event.shiftKey) onStats({ temporaryHp: combatant.temporaryHp + amount });
                      else onHeal(amount);
                    }}
                  >
                    +{amount}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="combat-control-group effects-control" aria-label="Состояния и эффекты">
            <span className="control-label">Состояния и эффекты</span>
            <div className="effect-form">
              <CustomSelect
                value=""
                onChange={() => undefined}
                onSelect={addStatusEffect}
                selectedValues={combatant.effects.map((effect) => effect.statusId).filter((statusId): statusId is string => Boolean(statusId))}
                options={STATUS_EFFECTS.map((status) => ({
                  value: status.id,
                  label: status.label,
                  description: status.originalName,
                  icon: status.icon
                }))}
                placeholder="Выберите состояние"
                ariaLabel="Выбрать эффект"
              />
              <input value={effectName} onChange={(event) => setEffectName(event.target.value)} placeholder="Свой эффект" />
              <button className="icon-button" type="button" onClick={addCustomEffect} aria-label="Добавить свой эффект">
                <Plus size={17} />
              </button>
              <button className="button mini secondary icon-only" type="button" disabled={busy} onClick={() => setTimerOpen(true)} aria-label="Добавить таймер эффекта" title="Таймер эффекта">
                <Clock size={16} />
              </button>
            </div>
          </section>

          <section className="combat-control-group card-actions-control" aria-label="Действия карточки">
            <span className="control-label">Действия</span>
            <div className="card-action-buttons">
              {(creatureSnapshot || lairSnapshot) && (
                <button className="button mini secondary" type="button" onClick={() => setOpen(!open)}>
                  <Eye size={16} />
                  Статблок
                </button>
              )}
              {!isLairCombatant && !combatant.escaped && (
                <button className="button mini secondary" type="button" onClick={toggleDefeated}>
                  {combatant.defeated ? 'Вернуть' : 'Побеждён'}
                </button>
              )}
              {!isLairCombatant && !combatant.defeated && (
                <button className="button mini secondary" type="button" onClick={toggleEscaped}>
                  {combatant.escaped ? 'Вернуть' : 'Сбежал'}
                </button>
              )}
            </div>
          </section>
        </div>

        {open && creatureSnapshot && <StatblockPreview creature={creatureSnapshot} campaignId={campaignId} />}
        {open && lairSnapshot && <LairStatblockPreview lair={lairSnapshot} campaignId={campaignId} />}
        {timerOpen && (
          <TimerEffectModal
            name={timerName}
            rounds={timerRounds}
            busy={busy}
            onNameChange={setTimerName}
            onRoundsChange={setTimerRounds}
            onCancel={() => setTimerOpen(false)}
            onApply={addTimedEffect}
          />
        )}
        {statEditor && (
          <StatAdjustModal
            mode={statEditor}
            combatant={combatant}
            baseArmorClass={baseArmorClass}
            baseMaxHp={baseMaxHp}
            busy={busy}
            onCancel={() => setStatEditor(null)}
            onApply={(patch) => {
              onStats(patch);
              setStatEditor(null);
            }}
          />
        )}
      </div>
    </article>
  );
}

function StatusEffectChip({ effect, onRemove }: { effect: CombatEffect; onRemove?: () => void }): JSX.Element {
  const status = getStatusEffectDefinition(effect.statusId);
  const [popover, setPopover] = useState<PopoverAnchor | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRounds = typeof effect.remainingRounds === 'number' ? Math.max(0, Math.round(effect.remainingRounds)) : null;

  function cancelHidePopover(): void {
    if (!hideTimerRef.current) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }

  function scheduleHidePopover(): void {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setPopover(null), 220);
  }

  useEffect(() => () => cancelHidePopover(), []);

  function showPopover(event: MouseEvent<HTMLElement>): void {
    if (!status) return;
    cancelHidePopover();
    setPopover(anchorFromElement(event.currentTarget));
  }

  const content = (
    <>
      {status && <img className="status-icon" src={status.icon} alt="" />}
      {effect.timed && !status && <Clock className="timer-effect-icon" size={17} />}
      <span>{effect.label}</span>
      {effect.timed && remainingRounds !== null && <strong className="timer-effect-count">{remainingRounds}</strong>}
    </>
  );

  const commonProps = {
    className: `chip effect-chip ${status ? 'status-effect-chip' : ''} ${effect.timed ? 'timer-effect-chip' : ''}`,
    onMouseEnter: showPopover,
    onMouseLeave: scheduleHidePopover
  };

  return (
    <>
      {onRemove ? (
        <button type="button" {...commonProps} onClick={onRemove} aria-label={`Убрать эффект ${effect.label}`}>
          {content}
        </button>
      ) : (
        <span {...commonProps}>{content}</span>
      )}
      {status && popover && <StatusEffectPopover status={status} anchor={popover} onMouseEnter={cancelHidePopover} onMouseLeave={scheduleHidePopover} />}
    </>
  );
}

function isConcentrating(effects: CombatEffect[]): boolean {
  return effects.some((effect) => effect.statusId === CONCENTRATION_STATUS_ID);
}

function StatusEffectPopover({
  status,
  anchor,
  onMouseEnter,
  onMouseLeave
}: {
  status: StatusEffectDefinition;
  anchor: PopoverAnchor;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}): JSX.Element {
  const width = Math.min(560, window.innerWidth - 36);
  const maxHeight = Math.min(620, window.innerHeight - 36);
  const { left, top } = positionAnchoredPopover(anchor, width, maxHeight, 18, 10);

  return createPortal(
    <aside className="status-popover" style={{ left, top }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <header>
        <img className="status-popover-icon" src={status.icon} alt="" />
        <div>
          <h3>{status.label}</h3>
          <p>{status.originalName}</p>
        </div>
      </header>
      <div>{status.ruling}</div>
    </aside>,
    document.body
  );
}

function Stat({ icon, label, value, onClick }: { icon: JSX.Element; label: string; value: string | number; onClick?: () => void }): JSX.Element {
  const content = (
    <>
      {icon}
      {label} {value}
    </>
  );

  if (onClick) {
    return (
      <button className="stat-pill stat-pill-button" type="button" onClick={onClick} title={`Нажмите, чтобы настроить ${label}`}>
        {content}
        <Edit3 size={13} />
      </button>
    );
  }

  return <span className="stat-pill">{content}</span>;
}

function StatAdjustModal({
  mode,
  combatant,
  baseArmorClass,
  baseMaxHp,
  busy,
  onCancel,
  onApply
}: {
  mode: 'ac' | 'hp';
  combatant: Combatant;
  baseArmorClass: number;
  baseMaxHp: number;
  busy: boolean;
  onCancel: () => void;
  onApply: (patch: Pick<CombatantPatch, 'armorClass' | 'maxHp' | 'currentHp'>) => void;
}): JSX.Element {
  const isArmorClass = mode === 'ac';
  const baseValue = isArmorClass ? baseArmorClass : baseMaxHp;
  const currentValue = isArmorClass ? combatant.armorClass : combatant.maxHp;
  const [bonus, setBonus] = useState(formatSignedInput(currentValue - baseValue));
  const [override, setOverride] = useState('');
  const bonusInputRef = useRef<HTMLInputElement | null>(null);
  const overrideInputRef = useRef<HTMLInputElement | null>(null);
  const overrideValue = override.trim() ? readNumber(override, baseValue) : null;
  const effectiveBaseValue = overrideValue ?? baseValue;
  const nextValue = Math.max(isArmorClass ? 0 : 1, effectiveBaseValue + readSignedNumber(bonus));
  const hpDelta = nextValue - combatant.maxHp;
  const nextCurrentHp = Math.max(0, Math.min(nextValue, combatant.currentHp + hpDelta));

  function apply(): void {
    if (isArmorClass) {
      onApply({ armorClass: Math.round(nextValue) });
      return;
    }

    onApply({ maxHp: Math.round(nextValue), currentHp: nextCurrentHp });
  }

  useEffect(() => {
    function handleWheel(event: WheelEvent): void {
      if (document.activeElement === bonusInputRef.current) {
        event.preventDefault();
        event.stopPropagation();
        setBonus((current) => formatSignedInput(readSignedNumber(current) + (event.deltaY < 0 ? 1 : -1)));
        return;
      }

      if (document.activeElement === overrideInputRef.current) {
        event.preventDefault();
        event.stopPropagation();
        setOverride((current) => {
          const minimum = isArmorClass ? 0 : 1;
          const currentValue = current.trim() ? readNumber(current, baseValue) : baseValue;
          return String(Math.max(minimum, Math.round(currentValue + (event.deltaY < 0 ? 1 : -1))));
        });
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, [baseValue, isArmorClass]);

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section className="app-modal stat-adjust-modal" role="dialog" aria-modal="true" aria-labelledby="stat-adjust-title">
        <header className="modal-header">
          <div>
            <p className="eyebrow">{combatant.name}</p>
            <h2 id="stat-adjust-title">{isArmorClass ? 'Настройка КД' : 'Настройка хитов'}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} disabled={busy} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>

        <div className="stat-adjust-summary">
          <span>
            <small>База</small>
            <strong>{baseValue}</strong>
          </span>
          <span>
            <small>Сейчас</small>
            <strong>{currentValue}</strong>
          </span>
          <span className="active">
            <small>Будет</small>
            <strong>{Math.round(nextValue)}</strong>
          </span>
        </div>

        <div className="stat-adjust-form">
          <label>
            {isArmorClass ? 'Бонус/штраф к КД' : 'Бонус/штраф к максимуму хитов'}
            <input
              ref={bonusInputRef}
              className={`damage-input ${readSignedNumber(bonus) > 0 ? 'healing' : readSignedNumber(bonus) < 0 ? 'damage' : ''}`}
              inputMode="text"
              value={bonus}
              onChange={(event) => setBonus(normalizeSignedInput(event.target.value))}
              placeholder="+0"
            />
          </label>
          <label>
            {isArmorClass ? 'Перезаписать КД' : 'Перезаписать максимум хитов'}
            <input
              ref={overrideInputRef}
              type="number"
              value={override}
              onChange={(event) => setOverride(event.target.value)}
              placeholder={String(baseValue)}
            />
          </label>
          {!isArmorClass && (
            <div className="stat-adjust-current-hp">
              Текущие хиты после изменения: <strong>{nextCurrentHp}/{Math.round(nextValue)}</strong>
            </div>
          )}
        </div>

        <div className="form-actions modal-actions">
          <button className="button primary" type="button" onClick={apply} disabled={busy}>
            <Save size={18} />
            Применить
          </button>
          <button className="button secondary" type="button" onClick={onCancel} disabled={busy}>
            Отмена
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function StatblockPreview({ creature, campaignId }: { creature: CreatureTemplate; campaignId: string }): JSX.Element {
  const [spellPopover, setSpellPopover] = useState<{ spell: SpellCard | null; anchor: PopoverAnchor; loading: boolean; error?: string } | null>(null);
  const [publicFeatureError, setPublicFeatureError] = useState('');
  const [shownPublicFeatureId, setShownPublicFeatureId] = useState('');
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function showSpellCard(href: string, anchor: PopoverAnchor): Promise<void> {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setSpellPopover({ spell: null, anchor, loading: true });
    if (typeof api.fetchRuleholderSpell !== 'function') {
      setSpellPopover({
        spell: null,
        anchor,
        loading: false,
        error: 'API заклинаний ещё не загружен. Остановите dev-версию через Ctrl+C и запустите npm.cmd run dev заново.'
      });
      return;
    }
    try {
      const spell = await api.fetchRuleholderSpell(href);
      setSpellPopover({ spell, anchor, loading: false });
    } catch (err) {
      setSpellPopover({
        spell: null,
        anchor,
        loading: false,
        error: err instanceof Error ? err.message : 'Не удалось загрузить заклинание.'
      });
    }
  }

  function scheduleHideSpellCard(): void {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setSpellPopover(null), 220);
  }

  function cancelHideSpellCard(): void {
    if (!hideTimerRef.current) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }

  useEffect(() => () => cancelHideSpellCard(), []);

  async function showFeatureOnPlayerScreen(feature: CreatureFeature): Promise<void> {
    setPublicFeatureError('');
    if (typeof api.showPublicFeatureCard !== 'function') {
      setPublicFeatureError('Desktop API устарел. Полностью остановите dev-версию и запустите npm.cmd run dev заново.');
      return;
    }

    const card: PublicFeatureCard = {
      id: `${creature.id}-${feature.id}-${Date.now()}`,
      sourceName: creature.name,
      sourceType: 'creature',
      featureName: feature.name,
      section: feature.section,
      description: feature.description,
      html: feature.html,
      imageUrl: creature.imageUrl,
      tokenUrl: creature.tokenUrl
    };

    try {
      await api.showPublicFeatureCard(campaignId, card);
      setShownPublicFeatureId(feature.id);
    } catch (err) {
      setPublicFeatureError(err instanceof Error ? err.message : 'Не удалось показать способность на экране игроков.');
    }
  }

  async function dismissFeatureOnPlayerScreen(): Promise<void> {
    setPublicFeatureError('');
    if (typeof api.dismissPublicFeatureCard !== 'function') {
      setPublicFeatureError('Desktop API устарел. Полностью остановите dev-версию и запустите npm.cmd run dev заново.');
      return;
    }

    try {
      await api.dismissPublicFeatureCard(campaignId);
      setShownPublicFeatureId('');
    } catch (err) {
      setPublicFeatureError(err instanceof Error ? err.message : 'Не удалось скрыть карточку с экрана игроков.');
    }
  }

  async function toggleFeatureOnPlayerScreen(feature: CreatureFeature): Promise<void> {
    if (shownPublicFeatureId === feature.id) {
      await dismissFeatureOnPlayerScreen();
      return;
    }

    await showFeatureOnPlayerScreen(feature);
  }

  return (
    <div
      className="statblock-preview"
      onMouseOver={(event) => {
        const link = getSpellLink(event.target);
        const href = link?.getAttribute('href');
        if (link && href) void showSpellCard(href, anchorFromElement(link));
      }}
      onMouseLeave={scheduleHideSpellCard}
      onClick={(event) => {
        if (getSpellHref(event.target)) {
          event.preventDefault();
        }
      }}
    >
      <div className="statblock-public-toolbar">
        <span>Публичная карточка способности</span>
        <button className="button mini secondary" type="button" onClick={() => void dismissFeatureOnPlayerScreen()}>
          <X size={15} />
          Скрыть с экрана игроков
        </button>
      </div>
      {publicFeatureError && <div className="notice error compact-notice">{publicFeatureError}</div>}
      <div className="statblock-grid">
        <span>Скорость: {creature.speeds || '-'}</span>
        <span>Устойчивости: {creature.resistances || '-'}</span>
        <span>Иммунитеты: {creature.immunities || '-'}</span>
        <span>Чувства: {creature.senses || '-'}</span>
      </div>
      <div className="feature-columns">
        {[...creature.traits, ...creature.actions].map((feature) => (
          <section className="feature-block" key={feature.id}>
            <div className="feature-block-header">
              <h4>{feature.name}</h4>
              <button
                className={`feature-show-button ${shownPublicFeatureId === feature.id ? 'active' : ''}`}
                type="button"
                onClick={() => void toggleFeatureOnPlayerScreen(feature)}
              >
                {shownPublicFeatureId === feature.id ? <EyeOff size={15} /> : <MonitorUp size={15} />}
                {shownPublicFeatureId === feature.id ? 'Скрыть' : 'Показать'}
              </button>
            </div>
            {feature.html ? <div className="feature-html" dangerouslySetInnerHTML={{ __html: feature.html }} /> : <p>{feature.description}</p>}
          </section>
        ))}
      </div>
      {spellPopover && <SpellPopover state={spellPopover} onMouseEnter={cancelHideSpellCard} onMouseLeave={scheduleHideSpellCard} />}
    </div>
  );
}

function LairStatblockPreview({ lair, campaignId }: { lair: EncounterLair; campaignId: string }): JSX.Element {
  const [publicFeatureError, setPublicFeatureError] = useState('');
  const [shownPublicFeatureId, setShownPublicFeatureId] = useState('');
  const effects = lair.effects.length
    ? lair.effects
    : [
        {
          id: 'lair-description',
          name: 'Описание логова',
          section: 'Логово',
          description: lair.description,
          html: lair.html
        }
      ];

  async function showFeatureOnPlayerScreen(effect: CreatureFeature): Promise<void> {
    setPublicFeatureError('');
    if (typeof api.showPublicFeatureCard !== 'function') {
      setPublicFeatureError('Desktop API устарел. Полностью остановите dev-версию и запустите npm.cmd run dev заново.');
      return;
    }

    const card: PublicFeatureCard = {
      id: `${lair.id}-${effect.id}-${Date.now()}`,
      sourceName: lair.name,
      sourceType: 'lair',
      featureName: effect.name,
      section: effect.section || 'Логово',
      description: effect.description,
      html: effect.html
    };

    try {
      await api.showPublicFeatureCard(campaignId, card);
      setShownPublicFeatureId(effect.id);
    } catch (err) {
      setPublicFeatureError(err instanceof Error ? err.message : 'Не удалось показать эффект логова на экране игроков.');
    }
  }

  async function dismissFeatureOnPlayerScreen(): Promise<void> {
    setPublicFeatureError('');
    if (typeof api.dismissPublicFeatureCard !== 'function') {
      setPublicFeatureError('Desktop API устарел. Полностью остановите dev-версию и запустите npm.cmd run dev заново.');
      return;
    }

    try {
      await api.dismissPublicFeatureCard(campaignId);
      setShownPublicFeatureId('');
    } catch (err) {
      setPublicFeatureError(err instanceof Error ? err.message : 'Не удалось скрыть карточку с экрана игроков.');
    }
  }

  async function toggleFeatureOnPlayerScreen(effect: CreatureFeature): Promise<void> {
    if (shownPublicFeatureId === effect.id) {
      await dismissFeatureOnPlayerScreen();
      return;
    }

    await showFeatureOnPlayerScreen(effect);
  }

  return (
    <div className="statblock-preview lair-statblock-preview">
      <div className="lair-statblock-header">
        <div>
          <h4>{lair.name}</h4>
          <p>Инициатива {lair.initiative}</p>
        </div>
        <Shield size={28} />
      </div>
      <div className="statblock-public-toolbar">
        <span>Публичная карточка эффекта</span>
        <button className="button mini secondary" type="button" onClick={() => void dismissFeatureOnPlayerScreen()}>
          <X size={15} />
          Скрыть с экрана игроков
        </button>
      </div>
      {publicFeatureError && <div className="notice error compact-notice">{publicFeatureError}</div>}
      <div className="feature-columns lair-feature-columns">
        {effects.map((effect) => (
          <section className="feature-block lair-feature-block" key={effect.id}>
            <div className="feature-block-header">
              <h4>{effect.name}</h4>
              <button
                className={`feature-show-button ${shownPublicFeatureId === effect.id ? 'active' : ''}`}
                type="button"
                onClick={() => void toggleFeatureOnPlayerScreen(effect)}
              >
                {shownPublicFeatureId === effect.id ? <EyeOff size={15} /> : <MonitorUp size={15} />}
                {shownPublicFeatureId === effect.id ? 'Скрыть' : 'Показать'}
              </button>
            </div>
            {effect.html ? <div className="feature-html" dangerouslySetInnerHTML={{ __html: effect.html }} /> : <p>{effect.description || 'Описание эффекта не найдено.'}</p>}
          </section>
        ))}
      </div>
    </div>
  );
}

function SpellPopover({
  state,
  onMouseEnter,
  onMouseLeave
}: {
  state: { spell: SpellCard | null; anchor: PopoverAnchor; loading: boolean; error?: string };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}): JSX.Element {
  const width = Math.min(500, window.innerWidth - 48);
  const maxHeight = Math.min(560, window.innerHeight - 48);
  const { left, top } = positionAnchoredPopover(state.anchor, width, maxHeight, 24, 10);
  const popoverProps = {
    className: 'spell-popover',
    style: { left, top },
    onMouseEnter,
    onMouseLeave
  };

  if (state.loading) {
    return (
      <aside {...popoverProps}>
        Загрузка заклинания...
      </aside>
    );
  }

  if (state.error || !state.spell) {
    return (
      <aside {...popoverProps}>
        {state.error ?? 'Заклинание не найдено.'}
      </aside>
    );
  }

  const spell = state.spell;
  return (
    <aside {...popoverProps}>
      <header className="spell-popover-header">
        <div>
          <h3>{spell.name}</h3>
          {spell.originalName && <p>{spell.originalName}</p>}
        </div>
        {spell.source && <span>{spell.source}</span>}
      </header>
      <dl className="spell-popover-grid">
        <SpellMeta label="Уровень" value={spell.level} />
        <SpellMeta label="Школа" value={spell.school} />
        <SpellMeta label="Время" value={spell.castingTime} />
        <SpellMeta label="Дистанция" value={spell.range} />
        <SpellMeta label="Длительность" value={spell.duration} />
        <SpellMeta label="Цель" value={spell.target} />
        <SpellMeta label="Область" value={spell.area} />
        <SpellMeta label="Испытание" value={spell.save} />
        <SpellMeta label="Урон" value={spell.damage} />
        <SpellMeta label="Компоненты" value={spell.components} wide />
      </dl>
      <div className="spell-popover-text" dangerouslySetInnerHTML={{ __html: spell.descriptionHtml }} />
    </aside>
  );
}

function SpellMeta({ label, value, wide = false }: { label: string; value: string; wide?: boolean }): JSX.Element | null {
  if (!value) return null;
  return (
    <div className={wide ? 'wide' : ''}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function getSpellHref(target: EventTarget | null): string | null {
  return getSpellLink(target)?.getAttribute('href') ?? null;
}

function getSpellLink(target: EventTarget | null): HTMLAnchorElement | null {
  return target instanceof Element ? target.closest<HTMLAnchorElement>('a[href*="/spells/"]') : null;
}

function anchorFromElement(element: Element): PopoverAnchor {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom
  };
}

function positionAnchoredPopover(anchor: PopoverAnchor, width: number, maxHeight: number, margin: number, gap: number): { left: number; top: number } {
  const viewportRight = window.innerWidth - margin;
  const viewportBottom = window.innerHeight - margin;
  const preferredLeft = anchor.left;
  const fallbackLeft = anchor.right - width;
  const left = Math.min(Math.max(margin, preferredLeft + width > viewportRight ? fallbackLeft : preferredLeft), Math.max(margin, viewportRight - width));

  const belowTop = anchor.bottom + gap;
  const aboveTop = anchor.top - maxHeight - gap;
  const hasRoomBelow = belowTop + maxHeight <= viewportBottom;
  const hasRoomAbove = aboveTop >= margin;
  const preferredTop = hasRoomBelow || !hasRoomAbove ? belowTop : aboveTop;
  const top = Math.min(Math.max(margin, preferredTop), Math.max(margin, viewportBottom - maxHeight));

  return { left, top };
}

function PlayerDisplay(): JSX.Element {
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const campaignId = params.get('campaignId') ?? '';
  const [view, setView] = useState<PublicCombatView>({ round: 1, combatants: [], settings: DEFAULT_PUBLIC_DISPLAY_SETTINGS });
  const [introAnimating, setIntroAnimating] = useState(false);
  const [hpEvents, setHpEvents] = useState<Record<string, PublicHpEvent>>({});
  const playerViewInitializedRef = useRef(false);
  const hadCombatRef = useRef(false);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousActiveIdRef = useRef<string | null>(null);
  const sliderCycleOffsetRef = useRef(PLAYER_SLIDER_MIDDLE_REPEAT);
  const previousHpSignalRef = useRef<Record<string, number>>({});
  const hpEventTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const combatants = view.combatants;
  const publicSettings = view.settings ?? DEFAULT_PUBLIC_DISPLAY_SETTINGS;
  const activeIndex = Math.max(
    0,
    combatants.findIndex((combatant) => combatant.isCurrent)
  );
  const sliderTrack = buildPlayerSliderTrack(combatants);
  const sliderVirtualIndex = combatants.length ? sliderCycleOffsetRef.current * combatants.length + activeIndex : 0;
  const orderTrack = buildPlayerOrderTrack(combatants, activeIndex, view.round);

  useEffect(() => {
    if (!campaignId) return undefined;

    function applyPlayerView(nextView: PublicCombatView): void {
      const hadCombat = hadCombatRef.current;
      const hasCombat = nextView.combatants.length > 0;
      const nextActiveId = nextView.combatants.find((combatant) => combatant.isCurrent)?.id ?? null;
      const nextHpSignals = readPublicHpSignals(nextView.combatants);

      if (!hasCombat || !hadCombat) {
        sliderCycleOffsetRef.current = PLAYER_SLIDER_MIDDLE_REPEAT;
      } else {
        const previousActiveId = previousActiveIdRef.current;
        const previousIndex = previousActiveId ? nextView.combatants.findIndex((combatant) => combatant.id === previousActiveId) : -1;
        const nextIndex = nextActiveId ? nextView.combatants.findIndex((combatant) => combatant.id === nextActiveId) : -1;
        const count = nextView.combatants.length;

        if (count > 1 && previousIndex >= 0 && nextIndex >= 0) {
          if (previousIndex === count - 1 && nextIndex === 0) {
            sliderCycleOffsetRef.current += 1;
          } else if (previousIndex === 0 && nextIndex === count - 1) {
            sliderCycleOffsetRef.current -= 1;
          }
        }

        if (sliderCycleOffsetRef.current <= 0 || sliderCycleOffsetRef.current >= PLAYER_SLIDER_REPEAT - 1) {
          sliderCycleOffsetRef.current = PLAYER_SLIDER_MIDDLE_REPEAT;
        }
      }

      if (playerViewInitializedRef.current && hadCombat && hasCombat) {
        const previousSignals = previousHpSignalRef.current;
        const nextEvents: PublicHpEvent[] = [];

        for (const combatant of nextView.combatants) {
          const previousSignal = previousSignals[combatant.id];
          const nextSignal = nextHpSignals[combatant.id];
          if (previousSignal === undefined || nextSignal === undefined || previousSignal === nextSignal) continue;

          const delta = nextSignal - previousSignal;
          nextEvents.push({
            id: `${combatant.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            combatantId: combatant.id,
            amount: Math.abs(delta),
            kind: delta < 0 ? 'damage' : 'healing'
          });
        }

        if (nextEvents.length > 0) {
          setHpEvents((current) => {
            const updated = { ...current };
            for (const event of nextEvents) {
              updated[event.combatantId] = event;
              if (hpEventTimersRef.current[event.combatantId]) {
                clearTimeout(hpEventTimersRef.current[event.combatantId]);
              }
              hpEventTimersRef.current[event.combatantId] = setTimeout(() => {
                setHpEvents((latest) => {
                  if (latest[event.combatantId]?.id !== event.id) return latest;
                  const { [event.combatantId]: _removed, ...rest } = latest;
                  return rest;
                });
                delete hpEventTimersRef.current[event.combatantId];
              }, 1250);
            }
            return updated;
          });
        }
      }

      setView(nextView);

      if (playerViewInitializedRef.current && !hadCombat && hasCombat) {
        if (introTimerRef.current) clearTimeout(introTimerRef.current);
        setIntroAnimating(true);
        introTimerRef.current = setTimeout(() => setIntroAnimating(false), 2400);
      }

      hadCombatRef.current = hasCombat;
      previousActiveIdRef.current = nextActiveId;
      previousHpSignalRef.current = nextHpSignals;
      playerViewInitializedRef.current = true;
    }

    void api.getPlayerView(campaignId).then(applyPlayerView);
    const unsubscribe = api.onPlayerView(applyPlayerView);
    return () => {
      unsubscribe();
      if (introTimerRef.current) clearTimeout(introTimerRef.current);
      Object.values(hpEventTimersRef.current).forEach(clearTimeout);
      hpEventTimersRef.current = {};
    };
  }, [campaignId]);

  return (
    <main className="player-screen">
      <header className="player-header">
        <div>
          <p className="eyebrow">Экран игроков</p>
          <h1>Боевой порядок</h1>
        </div>
        <Dices size={44} />
      </header>
      {combatants.length === 0 ? (
        <section className="player-empty-panel">
          <InlineEmpty title="Бой ещё не начат" />
        </section>
      ) : (
        <section className={`player-board ${introAnimating ? 'intro' : ''}`}>
          {introAnimating && (
            <div className="initiative-intro-banner">
              <Dices size={34} />
              <span>Инициатива брошена</span>
            </div>
          )}
          <div className="player-slider-pane">
            <div className="player-slider-window">
              <div className="player-slider-track" style={{ transform: `translateX(calc(50% - ${sliderVirtualIndex * PLAYER_CARD_STEP + PLAYER_CARD_CENTER}px))` }}>
                {sliderTrack.map((item, index) => (
                  <PlayerInitiativeCard
                    combatant={item.combatant}
                    hpEvent={hpEvents[item.combatant.id]}
                    introIndex={index % Math.max(1, combatants.length)}
                    key={item.key}
                    settings={publicSettings}
                  />
                ))}
              </div>
            </div>
          </div>

          <aside className="player-order-pane">
            <div className="player-order-header">
              <span>Инициатива</span>
              <strong>Раунд {view.round}</strong>
            </div>
            <div className="player-order-window">
              <div
                className="player-order-track"
                style={{ transform: `translateY(-${orderTrack.currentIndex * PLAYER_ORDER_ROW_STEP + PLAYER_ORDER_ROW_CENTER}px)` }}
              >
                {orderTrack.items.map((item, index) => (
                  <PlayerOrderRow hpEvent={item.round === view.round ? hpEvents[item.combatant.id] : undefined} item={item} introIndex={index} key={item.key} settings={publicSettings} />
                ))}
              </div>
            </div>
          </aside>
        </section>
      )}
      {view.featureCard && <PublicFeatureCardOverlay card={view.featureCard} />}
      {view.xpAward && <XpAwardModal award={view.xpAward} publicView />}
    </main>
  );
}

function PublicFeatureCardOverlay({ card }: { card: PublicFeatureCard }): JSX.Element {
  const image = card.tokenUrl || card.imageUrl;
  const [spellPopover, setSpellPopover] = useState<{ spell: SpellCard | null; anchor: PopoverAnchor; loading: boolean; error?: string } | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function showSpellCard(href: string, anchor: PopoverAnchor): Promise<void> {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setSpellPopover({ spell: null, anchor, loading: true });
    if (typeof api.fetchRuleholderSpell !== 'function') {
      setSpellPopover({
        spell: null,
        anchor,
        loading: false,
        error: 'API заклинаний ещё не загружен. Перезапустите dev-версию приложения.'
      });
      return;
    }

    try {
      const spell = await api.fetchRuleholderSpell(href);
      setSpellPopover({ spell, anchor, loading: false });
    } catch (err) {
      setSpellPopover({
        spell: null,
        anchor,
        loading: false,
        error: err instanceof Error ? err.message : 'Не удалось загрузить заклинание.'
      });
    }
  }

  function scheduleHideSpellCard(): void {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setSpellPopover(null), 220);
  }

  function cancelHideSpellCard(): void {
    if (!hideTimerRef.current) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }

  useEffect(() => () => cancelHideSpellCard(), []);

  return (
    <aside className="public-feature-overlay" aria-live="polite">
      <section className="public-feature-card">
        <header className="public-feature-header">
          {image ? (
            <img src={image} alt="" />
          ) : (
            <span className="public-feature-icon">
              <Swords size={54} />
            </span>
          )}
          <div>
            <p>{card.sourceType === 'lair' ? 'Эффект логова' : card.sourceName}</p>
            <h2>{card.featureName}</h2>
            <span>{card.section}</span>
          </div>
        </header>
        <div
          className="public-feature-body"
          onMouseOver={(event) => {
            const link = getSpellLink(event.target);
            const href = link?.getAttribute('href');
            if (link && href) void showSpellCard(href, anchorFromElement(link));
          }}
          onMouseLeave={scheduleHideSpellCard}
          onClick={(event) => {
            if (getSpellHref(event.target)) event.preventDefault();
          }}
        >
          {card.html ? <div className="feature-html" dangerouslySetInnerHTML={{ __html: card.html }} /> : <p>{card.description}</p>}
        </div>
        {spellPopover && <SpellPopover state={spellPopover} onMouseEnter={cancelHideSpellCard} onMouseLeave={scheduleHideSpellCard} />}
      </section>
    </aside>
  );
}

interface PlayerOrderTrackItem {
  key: string;
  combatant: PublicCombatant;
  turnNumber: number;
  round: number;
  roundStart: boolean;
  current: boolean;
}

function buildPlayerSliderTrack(combatants: PublicCombatant[]): Array<{ key: string; combatant: PublicCombatant }> {
  if (!combatants.length) return [];

  return Array.from({ length: PLAYER_SLIDER_REPEAT }, (_, repeatIndex) =>
    combatants.map((combatant) => ({
      key: `${repeatIndex}-${combatant.id}`,
      combatant
    }))
  ).flat();
}

function readPublicHpSignals(combatants: PublicCombatant[]): Record<string, number> {
  return Object.fromEntries(
    combatants
      .map((combatant) => {
        const signal = typeof combatant.hpSignal === 'number'
          ? combatant.hpSignal
          : typeof combatant.currentHp === 'number'
            ? combatant.currentHp + (combatant.temporaryHp ?? 0)
            : undefined;
        return signal === undefined ? null : [combatant.id, signal];
      })
      .filter((entry): entry is [string, number] => Boolean(entry))
  );
}

function buildPlayerOrderTrack(combatants: PublicCombatant[], activeIndex: number, currentRound: number): { items: PlayerOrderTrackItem[]; currentIndex: number } {
  if (!combatants.length) return { items: [], currentIndex: 0 };

  const items: PlayerOrderTrackItem[] = [];
  const safeRound = Math.max(1, currentRound);
  const rounds = Array.from({ length: safeRound + 4 }, (_, index) => index + 1);

  for (const round of rounds) {
    combatants.forEach((combatant, index) => {
      items.push({
        key: `${round}-${combatant.id}`,
        combatant,
        turnNumber: (round - 1) * combatants.length + index + 1,
        round,
        roundStart: index === 0,
        current: round === safeRound && combatant.isCurrent
      });
    });
  }

  return {
    items,
    currentIndex: (safeRound - 1) * combatants.length + activeIndex
  };
}

function getPublicCombatantMeta(combatant: PublicCombatant, settings: PublicDisplaySettings, includeInitiative = false): string[] {
  const isEnemy = combatant.side === 'npc' && !combatant.isAlly;
  const parts = includeInitiative ? [`Иниц. ${combatant.initiative}`] : [];

  if (!isEnemy || settings.showEnemyArmorClass) {
    parts.push(`КД ${combatant.armorClass}`);
  }

  if (combatant.side === 'player' && combatant.currentHp !== undefined && combatant.maxHp !== undefined) {
    parts.push(`Хиты ${formatHitPoints(combatant.currentHp, combatant.maxHp, combatant.temporaryHp)}`);
  }

  if (isEnemy && settings.showEnemySpeeds && combatant.speeds) {
    parts.push(combatant.speeds);
  }

  return parts;
}

function getPublicCombatantName(combatant: PublicCombatant, settings: PublicDisplaySettings): string {
  if (combatant.side === 'npc' && !combatant.isAlly && settings.hideCreatureNames && !combatant.publicNameVisible) {
    return 'Существо';
  }
  return combatant.name;
}

function FloatingHpEvent({ event, compact = false }: { event: PublicHpEvent; compact?: boolean }): JSX.Element {
  const prefix = event.kind === 'damage' ? '-' : '+';
  return (
    <span className={`floating-hp-event ${event.kind} ${compact ? 'compact' : ''}`} key={event.id} aria-hidden="true">
      {prefix}
      {event.amount}
    </span>
  );
}

function PlayerOrderRow({ hpEvent, item, introIndex, settings }: { hpEvent?: PublicHpEvent; item: PlayerOrderTrackItem; introIndex: number; settings: PublicDisplaySettings }): JSX.Element {
  const combatant = item.combatant;
  const publicName = getPublicCombatantName(combatant, settings);
  const meta = getPublicCombatantMeta(combatant, settings, true);
  return (
    <article
      className={`player-order-row ${item.current ? 'current' : ''} ${combatant.isAlly ? 'ally' : ''} ${combatant.bloodied ? 'bloodied' : ''} ${combatant.defeated ? 'defeated' : ''} ${combatant.escaped ? 'escaped' : ''} ${item.roundStart ? 'round-start' : ''} ${isConcentrating(combatant.effects) ? 'concentrating' : ''} ${hpEvent ? `hp-event ${hpEvent.kind}` : ''}`}
      style={{ '--intro-index': introIndex % Math.max(1, item.round === 1 ? 12 : 6) } as CSSProperties}
    >
      {hpEvent && <FloatingHpEvent compact event={hpEvent} />}
      {combatant.defeated && (
        <span className="death-mark small" aria-hidden="true">
          <Skull size={28} />
        </span>
      )}
      {combatant.escaped && (
        <span className="escaped-mark small" aria-hidden="true">
          <LogOut size={22} />
          Сбежал
        </span>
      )}
      {combatant.defeated && <span className="blood-trail" aria-hidden="true" />}
      {item.roundStart && <span className="player-round-marker">Раунд {item.round}</span>}
      <span className="player-order-turn">{item.turnNumber}</span>
      {combatant.tokenUrl ? <img className="player-order-token" src={combatant.tokenUrl} alt="" /> : <span className="player-order-token empty">{combatant.initiative}</span>}
      <div>
        <div className="public-combatant-name-row">
          <h3>{publicName}</h3>
          {combatant.isAlly && <span className="ally-badge public"><Shield size={16} />Союзник</span>}
        </div>
        <p>{meta.join(' · ')}</p>
        {combatant.effects.length > 0 && (
          <div className="player-order-effects">
            {combatant.effects.map((effect) => (
              <StatusEffectChip effect={effect} key={effect.id} />
            ))}
          </div>
        )}
      </div>
      {combatant.defeated ? (
        <span className="player-order-badge death">Пал</span>
      ) : combatant.escaped ? (
        <span className="player-order-badge">Сбежал</span>
      ) : (
        combatant.bloodied && <span className="player-order-badge">Окров.</span>
      )}
    </article>
  );
}

function PlayerInitiativeCard({ combatant, hpEvent, introIndex, settings }: { combatant: PublicCombatant; hpEvent?: PublicHpEvent; introIndex: number; settings: PublicDisplaySettings }): JSX.Element {
  const publicName = getPublicCombatantName(combatant, settings);
  const meta = getPublicCombatantMeta(combatant, settings);
  return (
    <article
      className={`player-card ${combatant.isCurrent ? 'current' : ''} ${combatant.isAlly ? 'ally' : ''} ${combatant.bloodied ? 'bloodied' : ''} ${combatant.defeated ? 'defeated' : ''} ${combatant.escaped ? 'escaped' : ''} ${isConcentrating(combatant.effects) ? 'concentrating' : ''} ${hpEvent ? `hp-event ${hpEvent.kind}` : ''}`}
      style={{ '--intro-index': introIndex } as CSSProperties}
    >
      {hpEvent && <FloatingHpEvent event={hpEvent} />}
      {combatant.defeated && (
        <span className="death-mark" aria-hidden="true">
          <Skull size={54} />
        </span>
      )}
      {combatant.escaped && (
        <span className="escaped-mark" aria-hidden="true">
          <LogOut size={46} />
          Сбежал
        </span>
      )}
      {combatant.defeated && <span className="blood-trail" aria-hidden="true" />}
      <div className="player-visual">
        {combatant.tokenUrl ? <img className="player-token" src={combatant.tokenUrl} alt="" /> : <div className="player-init">{combatant.initiative}</div>}
        {combatant.tokenUrl && <div className="player-token-init">{combatant.initiative}</div>}
      </div>
      <div className="player-info">
        <div className="public-combatant-name-row">
          <h2>{publicName}</h2>
          {combatant.isAlly && <span className="ally-badge public"><Shield size={18} />Союзник</span>}
        </div>
        {meta.length > 0 && <p>{meta.join(' · ')}</p>}
        <div className="chip-row">
          {combatant.defeated ? (
            <span className="chip muted-chip">Пал</span>
          ) : combatant.escaped ? (
            <span className="chip muted-chip">Сбежал</span>
          ) : (
            combatant.bloodied && <span className="chip danger-chip">Окровавлен</span>
          )}
          {combatant.effects.map((effect) => (
            <StatusEffectChip effect={effect} key={effect.id} />
          ))}
        </div>
      </div>
    </article>
  );
}

function PanelTitle({ icon, title }: { icon: JSX.Element; title: string }): JSX.Element {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function InlineEmpty({ title }: { title: string }): JSX.Element {
  return (
    <div className="inline-empty">
      <Dices size={36} />
      <h2>{title}</h2>
    </div>
  );
}

function emptyPlayer(campaignId: string): PlayerCharacter {
  const timestamp = new Date().toISOString();
  return {
    id: '',
    campaignId,
    name: '',
    level: 1,
    armorClass: 15,
    maxHp: 20,
    initiativeMod: 0,
    passivePerception: 10,
    active: true,
    imageUrl: '',
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

type UnknownRecord = Record<string, unknown>;
type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

const LSS_SKILL_LABELS: Record<string, string> = {
  acrobatics: 'Акробатика',
  'animal handling': 'Уход за животными',
  arcana: 'Магия',
  athletics: 'Атлетика',
  deception: 'Обман',
  history: 'История',
  insight: 'Проницательность',
  intimidation: 'Запугивание',
  investigation: 'Анализ',
  medicine: 'Медицина',
  nature: 'Природа',
  perception: 'Внимательность',
  performance: 'Выступление',
  persuasion: 'Убеждение',
  religion: 'Религия',
  'sleight of hand': 'Ловкость рук',
  stealth: 'Скрытность',
  survival: 'Выживание'
};

function importPlayerFromLss(payload: unknown, campaignId: string): PlayerCharacter {
  const raw = getLssRaw(payload);
  const info = recordValue(raw.info);
  const vitality = recordValue(raw.vitality);
  const stats = normalizeLssStats(recordValue(raw.stats));
  const level = Math.max(1, numberValue(fieldValue(info, 'level', 1), 1));
  const proficiency = numberValue(fieldValue(raw, 'proficiency', 0), proficiencyBonus(level));
  const skills = prepareLssSkills(recordValue(raw.skills), stats, proficiency);
  const textSections = prepareLssTextSections(recordValue(raw.text));
  const timestamp = new Date().toISOString();
  const name = stringValue(pathValue(raw, ['name', 'value'], fieldValue(raw, 'name', 'Без имени')), 'Без имени').trim() || 'Без имени';
  const baseMaxHp = numberValue(fieldValue(vitality, 'hp-max', 0), 0);
  const maxHpBonus = numberValue(fieldValue(vitality, 'hp-max-bonus', 0), 0);
  const maxHp = baseMaxHp ? baseMaxHp + maxHpBonus : numberValue(fieldValue(vitality, 'hp-current', 0), 0);
  const imageUrl = extractLssImageUrl(raw);

  return {
    id: '',
    campaignId,
    name,
    level,
    armorClass: numberValue(fieldValue(vitality, 'ac', 10), 10),
    maxHp: Math.max(1, maxHp || 1),
    initiativeMod: numberValue(fieldValue(vitality, 'initiative', stats.dex.modifier), stats.dex.modifier),
    passivePerception: skills.perception?.passive ?? 10 + stats.wis.modifier,
    active: true,
    imageUrl,
    notes: buildLssNotes(textSections),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function getLssRaw(payload: unknown): UnknownRecord {
  let raw: unknown = isRecord(payload) && 'data' in payload ? payload.data : payload;

  if (typeof raw === 'string') {
    raw = JSON.parse(raw);
  }

  if (!isRecord(raw)) {
    throw new Error('Long Story Short JSON не содержит данных персонажа.');
  }

  return raw;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordValue(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function fieldValue(container: unknown, key: string, fallback: unknown = ''): unknown {
  const record = recordValue(container);
  const value = record[key];

  if (isRecord(value) && 'value' in value) {
    return value.value ?? fallback;
  }

  return value ?? fallback;
}

function pathValue(obj: unknown, path: string[], fallback: unknown = ''): unknown {
  let current: unknown = obj;

  for (const key of path) {
    if (!isRecord(current)) return fallback;
    current = current[key];
  }

  return current ?? fallback;
}

function stringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function abilityModifier(score: unknown): number {
  return Math.floor((numberValue(score, 10) - 10) / 2);
}

function normalizeLssStats(stats: UnknownRecord): Record<AbilityKey, { score: number; modifier: number }> {
  const result = {} as Record<AbilityKey, { score: number; modifier: number }>;
  const keys: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

  for (const key of keys) {
    const stat = recordValue(stats[key]);
    const score = numberValue(stat.score, 10);
    result[key] = { score, modifier: abilityModifier(score) };
  }

  return result;
}

function proficiencyBonus(level: number): number {
  return Math.ceil((Number(level) || 1) / 4) + 1;
}

function lssProficiencyMultiplier(item: UnknownRecord): number {
  for (const key of ['isProf', 'proficient', 'prof']) {
    if (!(key in item)) continue;
    const value = item[key];
    if (typeof value === 'boolean') return value ? 1 : 0;
    return Number(value) || 0;
  }

  return 0;
}

function prepareLssSkills(
  rawSkills: UnknownRecord,
  stats: Record<AbilityKey, { score: number; modifier: number }>,
  proficiency: number
): Record<string, { label: string; value: number; passive: number; isProficient: boolean }> {
  const result: Record<string, { label: string; value: number; passive: number; isProficient: boolean }> = {};

  for (const [key, rawSkill] of Object.entries(rawSkills)) {
    const skill = recordValue(rawSkill);
    const baseStat = stringValue(skill.baseStat) as AbilityKey;
    const statMod = stats[baseStat]?.modifier ?? 0;
    const profMultiplier = lssProficiencyMultiplier(skill);
    const value = statMod + Math.floor(proficiency * profMultiplier);
    result[key] = {
      label: LSS_SKILL_LABELS[key] ?? key,
      value,
      passive: value + 10,
      isProficient: profMultiplier > 0
    };
  }

  return result;
}

function tiptapToText(node: unknown): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(tiptapToText).filter(Boolean).join('\n');
  if (!isRecord(node)) return '';
  if (node.type === 'text') return stringValue(node.text);

  const content = Array.isArray(node.content) ? node.content.map(tiptapToText).filter(Boolean) : [];
  if (node.type === 'paragraph' || node.type === 'heading') {
    return content.join('').trim();
  }

  return content.join('\n').trim();
}

function readLssTextSection(section: unknown): string {
  const record = recordValue(section);
  const valueRecord = recordValue(record.value);
  return tiptapToText(valueRecord.data ?? record.data ?? record.value ?? '').trim();
}

function prepareLssTextSections(text: UnknownRecord): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, section] of Object.entries(text)) {
    const body = readLssTextSection(section);
    if (body) result[key] = body;
  }

  return result;
}

function buildLssNotes(textSections: Record<string, string>): string {
  const namedNotes = Object.entries(textSections)
    .filter(([key]) => /^notes-\d+$/i.test(key) && key !== 'notes-1')
    .sort(([left], [right]) => left.localeCompare(right, 'ru', { numeric: true }))
    .map(([key, value]) => `Заметки ${key.replace('notes-', '')}:\n${value}`);

  return [
    textSections.background && `Предыстория:\n${textSections.background}`,
    textSections.personality && `Черты характера:\n${textSections.personality}`,
    textSections.trait && `Черты характера:\n${textSections.trait}`,
    textSections.ideals && `Идеалы:\n${textSections.ideals}`,
    textSections.ideal && `Идеалы:\n${textSections.ideal}`,
    textSections.bonds && `Привязанности:\n${textSections.bonds}`,
    textSections.bond && `Привязанности:\n${textSections.bond}`,
    textSections.flaws && `Слабости:\n${textSections.flaws}`,
    textSections.flaw && `Слабости:\n${textSections.flaw}`,
    textSections['notes-1'] && `Заметки:\n${textSections['notes-1']}`,
    ...namedNotes
  ].filter(Boolean).join('\n\n');
}

function extractLssImageUrl(raw: UnknownRecord): string {
  const directPaths = [
    ['image'],
    ['avatar'],
    ['portrait'],
    ['photo'],
    ['picture'],
    ['art'],
    ['token'],
    ['info', 'image'],
    ['info', 'avatar'],
    ['info', 'portrait'],
    ['info', 'photo'],
    ['info', 'picture'],
    ['info', 'art'],
    ['profile', 'image'],
    ['profile', 'avatar'],
    ['profile', 'portrait'],
    ['appearance', 'image'],
    ['appearance', 'avatar'],
    ['appearance', 'portrait']
  ];

  for (const path of directPaths) {
    const url = imageUrlFromUnknown(pathValue(raw, path));
    if (url) return url;
  }

  return findImageUrlByKey(raw);
}

function imageUrlFromUnknown(value: unknown): string {
  if (typeof value === 'string') return isUsableImageUrl(value) ? value.trim() : '';
  if (!isRecord(value)) return '';

  for (const key of ['webp', 'jpeg', 'jpg', 'png', 'url', 'src', 'href', 'path', 'value', 'data']) {
    const url = imageUrlFromUnknown(value[key]);
    if (url) return url;
  }

  return '';
}

function findImageUrlByKey(record: UnknownRecord, depth = 0): string {
  if (depth > 4) return '';

  for (const [key, value] of Object.entries(record)) {
    if (isImageLikeKey(key)) {
      const directUrl = imageUrlFromUnknown(value);
      if (directUrl) return directUrl;
    }

    if (isRecord(value)) {
      const nestedUrl = findImageUrlByKey(value, depth + 1);
      if (nestedUrl) return nestedUrl;
    }
  }

  return '';
}

function isImageLikeKey(key: string): boolean {
  return /avatar|portrait|image|token|photo|picture|art|illustration/i.test(key);
}

function isUsableImageUrl(value: string): boolean {
  const clean = value.trim();
  return /^https?:\/\//i.test(clean) || /^data:image\//i.test(clean);
}

function emptyCreature(campaignId: string): SaveCreatureTemplateInput {
  return {
    campaignId,
    name: '',
    originalName: '',
    size: '',
    creatureType: '',
    alignment: '',
    armorClass: 10,
    initiativeMod: 0,
    initiativeScore: 10,
    hitPoints: 1,
    hitDice: '',
    speeds: '',
    abilities: DEFAULT_ABILITIES,
    savingThrows: {},
    skills: '',
    vulnerabilities: '',
    resistances: '',
    immunities: '',
    conditionImmunities: '',
    senses: '',
    languages: '',
    challengeRating: '',
    xp: 0,
    proficiencyBonus: 2,
    traits: [],
    actions: [],
    imageUrl: '',
    tokenUrl: '',
    lairName: '',
    lairDescription: '',
    lairHtml: '',
    lairEffects: [],
    sourceUrl: '',
    notes: ''
  };
}

function readNumber(value: string | number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeSignedInput(value: string): string {
  const clean = value.replace(/[^\d+-]/g, '');
  const sign = clean.startsWith('-') ? '-' : clean.startsWith('+') ? '+' : '';
  const digits = clean.replace(/[+-]/g, '');
  return `${sign}${digits}`;
}

function readSignedNumber(value: string): number {
  if (value === '+' || value === '-') return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function formatSignedInput(value: number): string {
  if (value === 0) return '';
  return value > 0 ? `+${value}` : String(value);
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function clientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Не удалось прочитать файл изображения.')));
    reader.readAsDataURL(file);
  });
}
