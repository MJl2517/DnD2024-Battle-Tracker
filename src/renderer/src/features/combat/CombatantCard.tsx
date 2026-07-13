import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Eye, EyeOff, HeartPulse, Info, LogOut, Plus, Shield, Skull } from 'lucide-react';
import type { CombatEffect, Combatant, CombatantPatch, CreatureTemplate, EncounterLair } from '@shared/types';
import { isBloodied } from '@shared/combat';
import { getConditionImmunityStatusIds } from '@shared/conditionNames';
import {
  CONCENTRATION_STATUS_ID,
  UNCONSCIOUS_DEPENDENCY_STATUS_IDS,
  addStatusEffects,
  expandStatusEffectIds,
  getStatusEffectDefinition,
  STATUS_EFFECTS
} from '@shared/statusEffects';
import { CustomSelect } from '../../shared/ui/Select';
import { StatusEffectChip } from '../../shared/ui/StatusEffectChip';
import { isConcentrating } from '../../shared/lib/combatEffects';
import { Stat } from '../../shared/ui/Stat';
import { clientId } from '../../shared/lib/ids';
import { formatSignedInput, normalizeSignedInput, readNumber, readSignedNumber } from '../../shared/lib/numbers';
import { formatHitPoints } from './model/hitPoints';
import { TimerEffectModal } from './CombatModals';
import { LairStatblockPreview, StatblockPreview } from './StatblockPreview';
import { StatAdjustModal } from './StatAdjustModal';
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

/**
 * Управляемая мастерская карточка участника боя.
 * Компонент собирает действия интерфейса, но все правила хитов и состояний передаёт доменным помощникам и main-процессу.
 */
export function CombatantCard({
  combatant,
  campaignId,
  index,
  active,
  busy,
  showNameVisibilityControl,
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
  showNameVisibilityControl: boolean;
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
  const [collapsed, setCollapsed] = useState(combatant.defeated || combatant.escaped);
  const previousTerminalStateRef = useRef(combatant.defeated || combatant.escaped);
  const creatureSnapshot = combatant.snapshot && isCreatureSnapshot(combatant.snapshot) ? combatant.snapshot : null;
  const immuneStatusIds = getConditionImmunityStatusIds(creatureSnapshot?.conditionImmunities ?? '');
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
    const nextEffects = addStatusEffects(combatant.effects, expandStatusEffectIds(statusId), clientId, immuneStatusIds);
    if (nextEffects.length === combatant.effects.length) return;
    onEffects(nextEffects);
  }

  function toggleDefeated(): void {
    if (combatant.defeated) {
      onDefeated(false);
      return;
    }

    const nextEffects = addStatusEffects(combatant.effects, UNCONSCIOUS_DEPENDENCY_STATUS_IDS, clientId, immuneStatusIds);
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

  function toggleCollapsed(): void {
    const nextCollapsed = !collapsed;
    setCollapsed(nextCollapsed);
    if (nextCollapsed) {
      setOpen(false);
      setTimerOpen(false);
      setStatEditor(null);
    }
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
    const terminalState = combatant.defeated || combatant.escaped;
    const previousTerminalState = previousTerminalStateRef.current;
    previousTerminalStateRef.current = terminalState;

    if (terminalState && !previousTerminalState) {
      setCollapsed(true);
      setOpen(false);
      setTimerOpen(false);
      setStatEditor(null);
    } else if (!terminalState && previousTerminalState) {
      setCollapsed(false);
    }
  }, [combatant.defeated, combatant.escaped]);

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
      data-combatant-id={combatant.id}
      className={`combat-card ${collapsed ? 'collapsed' : ''} ${active ? 'active' : ''} ${combatant.isAlly ? 'ally' : ''} ${bloodied ? 'bloodied' : ''} ${concentrating ? 'concentrating' : ''} ${combatant.defeated ? 'defeated' : ''} ${combatant.escaped ? 'escaped' : ''}`}
    >
      <div className="combat-card-utility-buttons">
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
        <button
          className="card-collapse-button"
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Раскрыть карточку: ${combatant.name}` : `Свернуть карточку: ${combatant.name}`}
          title={collapsed ? 'Раскрыть карточку' : 'Свернуть карточку'}
          onClick={toggleCollapsed}
        >
          {collapsed ? <ChevronDown size={22} /> : <ChevronUp size={22} />}
        </button>
      </div>
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
              {combatant.side === 'npc' && showNameVisibilityControl && (
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
          {collapsed && (combatant.isAlly || bloodied || combatant.defeated || combatant.escaped || combatant.effects.length > 0) && (
            <div className="compact-chip-row" aria-label="Активные состояния и эффекты">
              {combatant.defeated && (
                <span className="chip compact-outcome-chip defeated-outcome-chip">
                  <Skull size={16} />
                  Побеждён
                </span>
              )}
              {combatant.escaped && (
                <span className="chip compact-outcome-chip escaped-outcome-chip">
                  <LogOut size={16} />
                  Сбежал
                </span>
              )}
              {combatant.isAlly && (
                <span className="chip ally-chip">
                  <Shield size={15} />
                  Союзник
                </span>
              )}
              {!isLairCombatant && bloodied && !combatant.defeated && <span className="chip danger-chip">Окровавлен</span>}
              {combatant.effects.map((effect) => (
                <StatusEffectChip key={effect.id} effect={effect} onRemove={() => onEffects(combatant.effects.filter((item) => item.id !== effect.id))} />
              ))}
            </div>
          )}
          {!isLairCombatant && (
            <div className="combat-stats">
              <Stat icon={<Shield size={18} />} label="КД" value={combatant.armorClass} onClick={() => setStatEditor('ac')} />
              <Stat
                icon={<HeartPulse size={18} />}
                label="Хиты"
                value={formatHitPoints(combatant.currentHp, combatant.maxHp, combatant.temporaryHp)}
                onClick={() => setStatEditor('hp')}
              />
            </div>
          )}
        </div>

        {!collapsed && (
          <div className="chip-row">
            {combatant.isAlly && (
              <span className="chip ally-chip">
                <Shield size={15} />
                Союзник
              </span>
            )}
            {!isLairCombatant && bloodied && <span className="chip danger-chip">Окровавлен</span>}
            {!isLairCombatant && combatant.defeated && <span className="chip muted-chip">Побеждён</span>}
            {!isLairCombatant && combatant.escaped && <span className="chip muted-chip">Сбежал</span>}
            {combatant.effects.map((effect) => (
              <StatusEffectChip key={effect.id} effect={effect} onRemove={() => onEffects(combatant.effects.filter((item) => item.id !== effect.id))} />
            ))}
          </div>
        )}

        <div className={`combat-controls ${collapsed ? 'compact' : ''} ${isLairCombatant ? 'lair' : ''}`}>
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

          {!collapsed && (
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
                    icon: status.icon,
                    disabled: immuneStatusIds.has(status.id),
                    disabledReason: immuneStatusIds.has(status.id) ? 'Невосприимчивость к состоянию' : undefined
                  }))}
                  placeholder="Выберите состояние"
                  ariaLabel="Выбрать эффект"
                />
                <input value={effectName} onChange={(event) => setEffectName(event.target.value)} placeholder="Свой эффект" />
                <button className="icon-button" type="button" onClick={addCustomEffect} aria-label="Добавить свой эффект">
                  <Plus size={17} />
                </button>
                <button
                  className="button mini secondary icon-only"
                  type="button"
                  disabled={busy}
                  onClick={() => setTimerOpen(true)}
                  aria-label="Добавить таймер эффекта"
                  title="Таймер эффекта"
                >
                  <Clock size={16} />
                </button>
              </div>
            </section>
          )}

          <section className="combat-control-group card-actions-control" aria-label="Действия карточки">
            <span className="control-label">Действия</span>
            <div className="card-action-buttons">
              {(creatureSnapshot || lairSnapshot) && (
                <button
                  className="button mini secondary"
                  type="button"
                  onClick={() => {
                    const nextOpen = !open;
                    setOpen(nextOpen);
                    if (nextOpen) setCollapsed(false);
                  }}
                >
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
