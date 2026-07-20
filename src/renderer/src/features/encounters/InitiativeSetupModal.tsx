import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, Dices, Play, RefreshCw, X } from 'lucide-react';
import { INCAPACITATED_STATUS_ID } from '@shared/statusEffects';
import type { CombatInitiativeEntry, CombatSession, Combatant, EncounterLair, InitiativeExchangePrompt } from '@shared/types';
import { readNumber, signed } from '../../shared/lib/numbers';
import { getUserFacingErrorMessage } from '../../shared/lib/errors';
import { InitiativeExchangeModal } from '../combat/InitiativeExchangeModal';
import { useModalFocus } from '../../shared/ui/useModalFocus';

const api = window.dndTracker;

function isLair(combatant: Combatant): boolean {
  const snapshot = combatant.snapshot as EncounterLair | null;
  return Boolean(snapshot && 'encounterId' in snapshot && 'effects' in snapshot);
}

function hasAlertSwap(combatant: Combatant): boolean {
  return Boolean(combatant.side === 'player' && combatant.snapshot && 'alertInitiativeSwap' in combatant.snapshot && combatant.snapshot.alertInitiativeSwap);
}

function isIncapacitated(combatant: Combatant): boolean {
  return combatant.effects.some((effect) => effect.statusId === INCAPACITATED_STATUS_ID);
}

function getExchangeCandidates(session: CombatSession, sourceCombatantId: string): Combatant[] {
  return session.combatants.filter(
    (combatant) => combatant.id !== sourceCombatantId && (combatant.side === 'player' || combatant.isAlly) && !combatant.defeated && !isIncapacitated(combatant)
  );
}

function clampRoll(value: number): number {
  return Math.min(20, Math.max(1, Math.round(value)));
}

function totalFor(combatant: Combatant, rolls: Record<string, number>, exchangedTotals: Record<string, number>): number {
  if (isLair(combatant)) return 20;
  return exchangedTotals[combatant.id] ?? (rolls[combatant.id] ?? 1) + combatant.initiativeMod;
}

function sortIds(session: CombatSession, rolls: Record<string, number>, exchangedTotals: Record<string, number>): string[] {
  return session.combatants
    .slice()
    .sort((left, right) => {
      const leftFinal = totalFor(left, rolls, exchangedTotals);
      const rightFinal = totalFor(right, rolls, exchangedTotals);
      return rightFinal - leftFinal || right.initiativeMod - left.initiativeMod || left.name.localeCompare(right.name, 'ru');
    })
    .map((combatant) => combatant.id);
}

function readSessionValues(session: CombatSession): { rolls: Record<string, number>; exchangedTotals: Record<string, number> } {
  const rolls: Record<string, number> = {};
  const exchangedTotals: Record<string, number> = {};
  for (const combatant of session.combatants) {
    const roll = clampRoll(combatant.initiativeRoll ?? combatant.initiative - combatant.initiativeMod);
    rolls[combatant.id] = roll;
    if (!isLair(combatant) && combatant.initiative !== roll + combatant.initiativeMod) exchangedTotals[combatant.id] = combatant.initiative;
  }
  return { rolls, exchangedTotals };
}

export function InitiativeSetupModal({
  session,
  busy,
  onReroll,
  onCancel,
  onConfirm
}: {
  session: CombatSession;
  busy: boolean;
  onReroll: () => Promise<void>;
  onCancel: () => Promise<void>;
  onConfirm: (entries: CombatInitiativeEntry[]) => Promise<void>;
}): JSX.Element {
  const initial = useMemo(() => readSessionValues(session), [session]);
  const [displaySession, setDisplaySession] = useState(session);
  const [rolls, setRolls] = useState<Record<string, number>>(initial.rolls);
  const [exchangedTotals, setExchangedTotals] = useState<Record<string, number>>(initial.exchangedTotals);
  const [orderedIds, setOrderedIds] = useState(() => sortIds(session, initial.rolls, initial.exchangedTotals));
  const [exchangeSourceId, setExchangeSourceId] = useState<string | null>(null);
  const [exchangeError, setExchangeError] = useState('');
  const modalRef = useModalFocus<HTMLElement>(() => {
    if (!busy) void onCancel();
  });

  useEffect(() => {
    setDisplaySession(session);
    setRolls(initial.rolls);
    setExchangedTotals(initial.exchangedTotals);
    setOrderedIds(sortIds(session, initial.rolls, initial.exchangedTotals));
    setExchangeSourceId(null);
  }, [initial, session]);

  useEffect(() => {
    if (!exchangeError) return undefined;
    const timeout = window.setTimeout(() => setExchangeError(''), 6000);
    return () => window.clearTimeout(timeout);
  }, [exchangeError]);

  useEffect(
    () =>
      api.onCombatPreparation((nextSession) => {
        if (!nextSession || nextSession.id !== session.id) return;
        const next = readSessionValues(nextSession);
        setDisplaySession(nextSession);
        setRolls(next.rolls);
        setExchangedTotals(next.exchangedTotals);
        setOrderedIds(sortIds(nextSession, next.rolls, next.exchangedTotals));
        setExchangeSourceId(null);
      }),
    [session.id]
  );

  const combatantById = useMemo(() => new Map(displaySession.combatants.map((combatant) => [combatant.id, combatant])), [displaySession.combatants]);
  const ordered = orderedIds.map((id) => combatantById.get(id)).filter((combatant): combatant is Combatant => Boolean(combatant));

  function reorder(nextRolls = rolls, nextExchangedTotals = exchangedTotals): void {
    setOrderedIds(sortIds(displaySession, nextRolls, nextExchangedTotals));
  }

  function commitRoll(combatantId: string): void {
    const nextRolls = { ...rolls, [combatantId]: clampRoll(rolls[combatantId] ?? 1) };
    const nextExchangedTotals = { ...exchangedTotals };
    delete nextExchangedTotals[combatantId];
    setRolls(nextRolls);
    setExchangedTotals(nextExchangedTotals);
    reorder(nextRolls, nextExchangedTotals);
  }

  function entries(): CombatInitiativeEntry[] {
    return sortIds(displaySession, rolls, exchangedTotals).map((combatantId) => {
      const combatant = combatantById.get(combatantId)!;
      return { combatantId, roll: rolls[combatantId], initiative: totalFor(combatant, rolls, exchangedTotals) };
    });
  }

  async function openExchange(sourceCombatantId: string): Promise<void> {
    if (!getExchangeCandidates(displaySession, sourceCombatantId).length) {
      setExchangeError('Для обмена нужен другой игрок или союзный NPC, который не побеждён и не имеет состояния «Недееспособный».');
      return;
    }

    try {
      setExchangeError('');
      const nextSession = await api.beginInitiativeExchange(displaySession.id, sourceCombatantId, entries());
      const next = readSessionValues(nextSession);
      setDisplaySession(nextSession);
      setRolls(next.rolls);
      setExchangedTotals(next.exchangedTotals);
      setOrderedIds(sortIds(nextSession, next.rolls, next.exchangedTotals));
      setExchangeSourceId(sourceCombatantId);
    } catch (error) {
      setExchangeError(getUserFacingErrorMessage(error));
    }
  }

  async function swapWith(targetCombatantId: string): Promise<void> {
    if (!exchangeSourceId) return;
    try {
      setExchangeError('');
      const nextSession = await api.swapCombatInitiative(displaySession.id, exchangeSourceId, targetCombatantId);
      const next = readSessionValues(nextSession);
      setDisplaySession(nextSession);
      setRolls(next.rolls);
      setExchangedTotals(next.exchangedTotals);
      setOrderedIds(sortIds(nextSession, next.rolls, next.exchangedTotals));
      setExchangeSourceId(null);
    } catch (error) {
      setExchangeError(getUserFacingErrorMessage(error));
    }
  }

  async function cancelExchange(): Promise<void> {
    const nextSession = await api.cancelInitiativeExchange(displaySession.id);
    setDisplaySession(nextSession);
    setExchangeSourceId(null);
  }

  const exchangePrompt = useMemo<InitiativeExchangePrompt | null>(() => {
    if (!exchangeSourceId) return null;
    const source = combatantById.get(exchangeSourceId);
    if (!source) return null;
    return {
      sessionId: displaySession.id,
      sourceCombatantId: source.id,
      sourceName: source.name,
      sourceInitiative: source.initiative,
      candidates: getExchangeCandidates(displaySession, source.id).map((combatant) => ({
        combatantId: combatant.id,
        name: combatant.name,
        initiative: combatant.initiative,
        side: combatant.side,
        isAlly: combatant.isAlly
      }))
    };
  }, [combatantById, displaySession, exchangeSourceId]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        ref={modalRef}
        tabIndex={-1}
        className="app-modal initiative-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="initiative-setup-title"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Перед началом боя</p>
            <h2 id="initiative-setup-title">Порядок инициативы</h2>
            <p>Измените бросок и нажмите Enter, чтобы перестроить порядок.</p>
          </div>
          <button className="icon-button" type="button" disabled={busy} onClick={() => void onCancel()} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>

        <div className="initiative-setup-list">
          {ordered.map((combatant, index) => {
            const lair = isLair(combatant);
            const roll = rolls[combatant.id] ?? 1;
            const exchanged = exchangedTotals[combatant.id] !== undefined;
            const hasExchangeCandidates = getExchangeCandidates(displaySession, combatant.id).length > 0;
            return (
              <article className={`initiative-setup-card ${exchanged ? 'exchanged' : ''}`} key={combatant.id}>
                <strong className="initiative-order">{index + 1}</strong>
                <div className="initiative-participant">
                  <strong>{combatant.name}</strong>
                  <span>{lair ? 'Логово' : combatant.side === 'player' ? 'Игрок' : combatant.isAlly ? 'Союзник' : 'NPC'}</span>
                </div>
                {hasAlertSwap(combatant) && (
                  <button
                    className="icon-button initiative-swap-button"
                    type="button"
                    disabled={busy || isIncapacitated(combatant) || combatant.initiativeSwapUsed}
                    title={
                      combatant.initiativeSwapUsed
                        ? 'Обмен инициативой уже использован'
                        : !hasExchangeCandidates
                          ? 'Нет доступных союзников для обмена'
                          : 'Бдительный: обменяться инициативой'
                    }
                    aria-label={`${combatant.name}: обменяться инициативой`}
                    onClick={() => void openExchange(combatant.id)}
                  >
                    <RefreshCw size={20} />
                  </button>
                )}
                <div className="initiative-equation" aria-label={`Расчёт инициативы: ${combatant.name}`}>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={lair ? 20 : roll}
                    disabled={busy || lair}
                    aria-label={`Бросок инициативы: ${combatant.name}`}
                    onChange={(event) => {
                      const nextExchanged = { ...exchangedTotals };
                      delete nextExchanged[combatant.id];
                      setExchangedTotals(nextExchanged);
                      setRolls((current) => ({ ...current, [combatant.id]: readNumber(event.target.value, 1) }));
                    }}
                    onBlur={() => commitRoll(combatant.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitRoll(combatant.id);
                      }
                    }}
                    onWheel={(event) => {
                      if (document.activeElement !== event.currentTarget || lair) return;
                      event.preventDefault();
                      const direction = event.deltaY < 0 ? 1 : -1;
                      const nextExchanged = { ...exchangedTotals };
                      delete nextExchanged[combatant.id];
                      setExchangedTotals(nextExchanged);
                      setRolls((current) => ({ ...current, [combatant.id]: clampRoll((current[combatant.id] ?? 1) + direction) }));
                    }}
                  />
                  {!lair && (
                    <>
                      <span className="initiative-operator">+</span>
                      <span className="initiative-bonus" title="Бонус к инициативе">
                        <small>Бонус</small>
                        <strong>{signed(combatant.initiativeMod)}</strong>
                      </span>
                      <span className="initiative-operator">=</span>
                    </>
                  )}
                  <strong className="initiative-total">
                    {totalFor(combatant, rolls, exchangedTotals)}
                    {exchanged && <small>Обмен</small>}
                  </strong>
                </div>
              </article>
            );
          })}
        </div>

        <div className="modal-actions initiative-modal-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={() => void onReroll()}>
            <Dices size={20} />
            Бросок инициативы
          </button>
          <button className="button primary" type="button" disabled={busy || !ordered.length} onClick={() => void onConfirm(entries())}>
            <Play size={20} />
            Начать бой
          </button>
        </div>
      </section>
      {exchangePrompt && (
        <InitiativeExchangeModal prompt={exchangePrompt} busy={busy} onSelect={(targetId) => void swapWith(targetId)} onCancel={() => void cancelExchange()} />
      )}
      {exchangeError && (
        <div className="initiative-exchange-error" role="status">
          <CircleAlert size={20} />
          <span>{exchangeError}</span>
          <button type="button" onClick={() => setExchangeError('')} aria-label="Закрыть уведомление">
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
