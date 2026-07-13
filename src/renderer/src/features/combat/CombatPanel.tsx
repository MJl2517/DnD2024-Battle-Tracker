import { useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, ChevronLeft, ChevronRight, Dices, Keyboard, Skull, UserPlus } from 'lucide-react';
import type {
  AddCombatantsToCombatInput,
  CampaignDetail,
  CombatInitiativeEntry,
  CombatSession,
  Combatant,
  CompleteCombatOptions,
  CompleteCombatResult
} from '@shared/types';
import { calculateExperience } from '@shared/combat';
import { PanelTitle } from '../../shared/ui/PanelTitle';
import { XpAwardModal } from '../../shared/ui/XpAwardModal';
import { readNumber, readSignedNumber } from '../../shared/lib/numbers';
import { applyDamageToHitPoints } from './model/hitPoints';
import { CombatantCard } from './CombatantCard';
import { AllyXpSelectionModal, FinishCombatModal } from './CombatModals';
import { InitiativeSetupModal } from '../encounters/InitiativeSetupModal';
import { AddCombatantModal } from './AddCombatantModal';

const api = window.dndTracker;

export function CombatPanel({
  detail,
  busy,
  hideCreatureNames,
  xpResult,
  onSession,
  onComplete,
  onClearXpResult,
  onRefresh,
  run
}: {
  detail: CampaignDetail;
  busy: boolean;
  hideCreatureNames: boolean;
  xpResult: CompleteCombatResult | null;
  onSession: (session: CombatSession) => void;
  onComplete: (result: CompleteCombatResult) => void;
  onClearXpResult: () => void;
  onRefresh: () => Promise<void>;
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
}): JSX.Element {
  const session = detail.activeSession;
  const [finishOpen, setFinishOpen] = useState(false);
  const [defeatedGiveXp, setDefeatedGiveXp] = useState(true);
  const [escapedXpMode, setEscapedXpMode] = useState<CompleteCombatOptions['escapedXpMode']>('none');
  const [customXpPool, setCustomXpPool] = useState('');
  const [xpAdjustment, setXpAdjustment] = useState('');
  const [shareXpWithAllies, setShareXpWithAllies] = useState(false);
  const [xpAllyIds, setXpAllyIds] = useState<string[]>([]);
  const [allyXpModalOpen, setAllyXpModalOpen] = useState(false);
  const [preparedSession, setPreparedSession] = useState<CombatSession | null>(null);
  const [headerStuck, setHeaderStuck] = useState(false);
  const [addCombatantOpen, setAddCombatantOpen] = useState(false);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const previousActiveCombatantRef = useRef<{ sessionId: string; combatantId: string } | null>(null);
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

  async function prepareInitiative(encounterId: string): Promise<void> {
    const prepared = await run(() => api.prepareCombat(encounterId));
    if (prepared) setPreparedSession(prepared);
  }

  async function cancelInitiative(): Promise<void> {
    if (!preparedSession) return;
    await run(() => api.cancelCombatPreparation(preparedSession.id));
    setPreparedSession(null);
  }

  async function confirmInitiative(entries: CombatInitiativeEntry[]): Promise<void> {
    if (!preparedSession) return;
    const started = await run(() => api.confirmCombatInitiative(preparedSession.id, entries));
    if (!started) return;
    setPreparedSession(null);
    onSession(started);
    await onRefresh();
  }

  async function addCombatants(input: AddCombatantsToCombatInput): Promise<void> {
    const updated = await run(() => api.addCombatantsToCombat(input));
    if (!updated) return;
    onSession(updated);
    setAddCombatantOpen(false);
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
    // navigateCombat is recreated with the same dependencies listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, session, run, onSession]);

  useEffect(() => {
    const header = stickyHeaderRef.current;
    const scrollRoot = header?.closest<HTMLElement>('.combat-workspace');
    if (!header || !scrollRoot) {
      setHeaderStuck(false);
      return undefined;
    }

    // Верхний фон нужен только после прилипания шапки. В обычном положении он не должен заходить на вкладки.
    const updateStickyState = (): void => {
      const rootTop = scrollRoot.getBoundingClientRect().top;
      const headerTop = header.getBoundingClientRect().top;
      setHeaderStuck(scrollRoot.scrollTop > 0 && headerTop <= rootTop + 32);
    };

    updateStickyState();
    scrollRoot.addEventListener('scroll', updateStickyState, { passive: true });
    return () => scrollRoot.removeEventListener('scroll', updateStickyState);
  }, [session?.id]);

  useEffect(() => {
    const sessionId = session?.id;
    const activeCombatantId = session?.activeCombatantId;
    if (!sessionId || !activeCombatantId) {
      previousActiveCombatantRef.current = null;
      return undefined;
    }

    const previous = previousActiveCombatantRef.current;
    previousActiveCombatantRef.current = { sessionId, combatantId: activeCombatantId };
    // При первом открытии вкладки сохраняем позицию пользователя. Автопрокрутка нужна только после реального переключения хода в той же сессии.
    if (!previous || previous.sessionId !== sessionId || previous.combatantId === activeCombatantId) return undefined;

    const frame = requestAnimationFrame(() => {
      const header = stickyHeaderRef.current;
      const scrollRoot = header?.closest<HTMLElement>('.combat-workspace');
      const card = scrollRoot?.querySelector<HTMLElement>(`[data-combatant-id="${CSS.escape(activeCombatantId)}"]`);
      if (!header || !scrollRoot || !card) return;

      const rootRect = scrollRoot.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const visibleTop = rootRect.top + header.getBoundingClientRect().height + 18;
      const visibleBottom = rootRect.bottom - 18;
      const visibleCenter = (visibleTop + visibleBottom) / 2;
      const cardCenter = cardRect.top + cardRect.height / 2;
      const targetTop = Math.max(0, scrollRoot.scrollTop + cardCenter - visibleCenter);
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollRoot.scrollTo({ top: targetTop, behavior: reduceMotion ? 'auto' : 'smooth' });
    });

    return () => cancelAnimationFrame(frame);
  }, [session?.activeCombatantId, session?.id]);

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
                  onClick={() => void prepareInitiative(encounter.id)}
                >
                  <Dices size={19} />
                  Бросить инициативу
                </button>
              </article>
            ))}
          </div>
        </section>
        {preparedSession && (
          <InitiativeSetupModal
            session={preparedSession}
            busy={busy}
            onReroll={() => prepareInitiative(preparedSession.encounterId)}
            onCancel={cancelInitiative}
            onConfirm={confirmInitiative}
          />
        )}
        {xpResult && <XpAwardModal award={xpResult.xpAward} onClose={onClearXpResult} />}
      </>
    );
  }

  return (
    <section className="combat-layout">
      <div ref={stickyHeaderRef} className={`combat-sticky-header ${headerStuck ? 'is-stuck' : ''}`}>
        <div className="combat-toolbar">
          <div className="combat-heading">
            <p className="eyebrow">Раунд {session.round}</p>
            <h2>Боевой порядок</h2>
            <button className="button secondary combat-add-button" type="button" disabled={busy} onClick={() => setAddCombatantOpen(true)}>
              <UserPlus size={20} />
              Добавить существо
            </button>
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
            <button className="button secondary" type="button" disabled={busy} onClick={() => void navigateCombat(() => api.retreatTurn(session.id))}>
              <ChevronLeft size={20} />
              Ход назад
            </button>
            <button className="button secondary" type="button" disabled={busy} onClick={() => void navigateCombat(() => api.advanceTurn(session.id))}>
              <ChevronRight size={20} />
              Следующий ход
            </button>
            <button className="button secondary" type="button" disabled={busy} onClick={() => void navigateCombat(() => api.endRound(session.id))}>
              <ChevronDown size={20} />
              Завершить раунд
            </button>
            <button className="button danger" type="button" disabled={busy} onClick={() => setFinishOpen(true)}>
              <Skull size={20} />
              Завершить бой
            </button>
          </div>
        </div>
        {activeCombatant && (
          <div className="combat-active-bar">
            <div className="combat-active-turn">
              <span>Сейчас ходит</span>
              <strong>{activeCombatant.name}</strong>
            </div>
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
          </div>
        )}
      </div>

      {addCombatantOpen && (
        <AddCombatantModal sessionId={session.id} creatures={detail.creatures} busy={busy} onClose={() => setAddCombatantOpen(false)} onAdd={addCombatants} />
      )}

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
            showNameVisibilityControl={hideCreatureNames}
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
