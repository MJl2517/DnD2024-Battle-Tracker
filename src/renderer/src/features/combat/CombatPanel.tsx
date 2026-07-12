import { useEffect, useState } from 'react';
import { Activity, ChevronDown, ChevronLeft, ChevronRight, Keyboard, Play, Skull } from 'lucide-react';
import type { CampaignDetail, CombatSession, Combatant, CompleteCombatOptions, CompleteCombatResult } from '@shared/types';
import { calculateExperience } from '@shared/combat';
import { PanelTitle } from '../../shared/ui/PanelTitle';
import { XpAwardModal } from '../../shared/ui/XpAwardModal';
import { readNumber, readSignedNumber } from '../../shared/lib/numbers';
import { applyDamageToHitPoints } from './model/hitPoints';
import { CombatantCard } from './CombatantCard';
import { AllyXpSelectionModal, FinishCombatModal } from './CombatModals';

const api = window.dndTracker;

export function CombatPanel({
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
    // navigateCombat is recreated with the same dependencies listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
