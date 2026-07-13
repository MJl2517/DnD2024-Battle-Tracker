import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Edit3, Info, Save, X } from 'lucide-react';
import type { EncounterLair } from '@shared/types';
import type { EncounterDifficultyResult } from '@shared/encounterDifficulty';
import { normalizeSignedInput, readNumber, readSignedNumber, signed } from '../../shared/lib/numbers';
import { HoldDeleteButton } from '../../shared/ui/HoldDeleteButton';
import { InitiativeRollModeToggle } from '../../shared/ui/InitiativeRollModeToggle';
import { FeatureListEditor, StatEditorSection } from '../bestiary/BestiaryPanel';

const api = window.dndTracker;
export function EncounterDifficultyScale({ result, scopeKey }: { result: EncounterDifficultyResult; scopeKey: string }): JSX.Element {
  const [collapsed, setCollapsed] = useState(true);
  const [acknowledgedWarningKey, setAcknowledgedWarningKey] = useState('');
  const hasCreatureCountWarning = result.partySize > 0 && result.hostileCreatureCount > result.partySize * 2;
  const hasWarnings =
    result.hasAllies ||
    result.missingXpGroups > 0 ||
    result.zeroChallengeCreatureCount > 0 ||
    result.uniqueStatblockCount > 3 ||
    result.powerfulCreatureCount > 0 ||
    hasCreatureCountWarning;
  const warningKey = [
    scopeKey,
    Number(result.hasAllies),
    result.missingXpGroups,
    result.zeroChallengeCreatureCount,
    result.uniqueStatblockCount > 3 ? result.uniqueStatblockCount : 0,
    result.powerfulCreatureCount,
    hasCreatureCountWarning ? result.hostileCreatureCount : 0
  ].join(':');
  const hasUnreadWarnings = hasWarnings && acknowledgedWarningKey !== warningKey;

  useEffect(() => {
    if (!collapsed && hasWarnings) setAcknowledgedWarningKey(warningKey);
  }, [collapsed, hasWarnings, warningKey]);

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
  const columns = [low.xp, medium.xp - low.xp, high.xp - medium.xp, scaleMaximum - high.xp].map((value) => `${Math.max(1, value)}fr`).join(' ');

  if (collapsed) {
    return (
      <section className={`encounter-difficulty-panel collapsed ${result.difficulty}`}>
        <DifficultyScaleBar columns={columns} low={low} medium={medium} high={high} markerPosition={markerPosition} enemyXp={result.enemyXp} />
        <button
          className="difficulty-collapse-button"
          type="button"
          aria-label="Развернуть оценку сложности"
          title={hasUnreadWarnings ? 'Развернуть: есть новые предупреждения' : 'Развернуть оценку сложности'}
          onClick={() => {
            setAcknowledgedWarningKey(warningKey);
            setCollapsed(false);
          }}
        >
          <ChevronDown size={20} />
          {hasUnreadWarnings && <span className="difficulty-warning-dot" aria-hidden="true" />}
        </button>
      </section>
    );
  }

  return (
    <section className={`encounter-difficulty-panel ${result.difficulty}`}>
      <div className="encounter-difficulty-heading">
        <div>
          <span className="eyebrow">Оценка сложности</span>
          <h3>{result.difficultyLabel}</h3>
        </div>
        <div className="encounter-difficulty-heading-actions">
          <span className={`difficulty-result-badge ${result.difficulty}`}>{result.enemyXp.toLocaleString('ru-RU')} XP врагов</span>
          <button
            className="difficulty-collapse-button"
            type="button"
            aria-label="Свернуть оценку сложности"
            title="Показывать только полосу сложности"
            onClick={() => setCollapsed(true)}
          >
            <ChevronUp size={20} />
          </button>
        </div>
      </div>

      <div className="encounter-difficulty-party">
        <span>{result.partySize} игроков</span>
        <span>Средний уровень {result.averageLevel}</span>
        <span>{result.levelSummary}</span>
        <span className="inline-help" title="Расчёт использует прямой бюджет XP и не применяет множители количества монстров.">
          <Info size={15} />
        </span>
      </div>

      <DifficultyScaleBar columns={columns} low={low} medium={medium} high={high} markerPosition={markerPosition} enemyXp={result.enemyXp} />

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
      {result.zeroChallengeCreatureCount > 0 && (
        <div className="difficulty-warning advisory">
          <Info size={18} />
          <span>
            <strong>Существа с ПО 0: {result.zeroChallengeCreatureCount}.</strong>
            Используйте их с осторожностью, особенно если они не дают опыта. Для большого количества таких существ лучше выбрать стаю из Бестиария.
          </span>
        </div>
      )}
      {result.uniqueStatblockCount > 3 && (
        <div className="difficulty-warning advisory">
          <Info size={18} />
          <span>
            <strong>Разных статблоков: {result.uniqueStatblockCount}.</strong>
            Более двух-трёх типов существ усложняют ведение сцены, особенно если у каждого есть особые умения.
          </span>
        </div>
      )}
      {result.powerfulCreatureCount > 0 && (
        <div className="difficulty-warning powerful">
          <Info size={18} />
          <span>
            <strong>Могущественные существа: {result.powerfulCreatureCount}.</strong>
            Их КО выше уровня хотя бы одного участника. Одного действия такого существа может хватить, чтобы вывести слабого персонажа из строя.
          </span>
        </div>
      )}
      {hasCreatureCountWarning && (
        <div className="difficulty-warning powerful">
          <Info size={18} />
          <span>
            <strong>
              Множество существ: {result.hostileCreatureCount} против {result.partySize} персонажей.
            </strong>
            В сцене более двух враждебных существ на персонажа. Добавляйте преимущественно слабых противников, которых можно быстро победить. Это особенно важно
            для персонажей 1–2 уровня.
          </span>
        </div>
      )}
      {result.missingXpGroups > 0 && (
        <div className="difficulty-warning missing-xp">
          <Info size={18} />
          <span>У {result.missingXpGroups} вражеских групп не найден XP или распознаваемый КО. Они не вошли в расчёт.</span>
        </div>
      )}
    </section>
  );
}

/** Общая цветная полоса используется в полном и компактном режимах без расхождения расчётов. */
function DifficultyScaleBar({
  columns,
  low,
  medium,
  high,
  markerPosition,
  enemyXp
}: {
  columns: string;
  low: EncounterDifficultyResult['budgets'][number];
  medium: EncounterDifficultyResult['budgets'][number];
  high: EncounterDifficultyResult['budgets'][number];
  markerPosition: number;
  enemyXp: number;
}): JSX.Element {
  return (
    <div className="difficulty-scale-wrap">
      <div className="difficulty-scale" style={{ gridTemplateColumns: columns }}>
        <span className="below" title="Ниже бюджета низкой сложности">
          Ниже
        </span>
        <span className="low" title={low.description}>
          Низкая
        </span>
        <span className="medium" title={medium.description}>
          Средняя
        </span>
        <span className="high" title={high.description}>
          Высокая+
        </span>
      </div>
      <span className="difficulty-scale-marker" style={{ left: `${markerPosition}%` }} title={`Текущая сцена: ${enemyXp.toLocaleString('ru-RU')} XP`}>
        <span />
      </span>
    </div>
  );
}

export function EncounterAllyDifficultyWarning(): JSX.Element {
  return (
    <div className="difficulty-warning allies">
      <Info size={18} />
      <span>В сцене есть союзники. Калькулятор может работать неточно, поскольку их влияние на бой невозможно оценить только по XP.</span>
    </div>
  );
}

export function EncounterLairEditor({
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
          <button
            className={`icon-button ${editing ? 'active' : ''}`}
            type="button"
            disabled={busy}
            onClick={() => setEditing((current) => !current)}
            aria-label={editing ? 'Закрыть редактирование логова' : 'Редактировать логово'}
          >
            {editing ? <X size={18} /> : <Edit3 size={18} />}
          </button>
          <HoldDeleteButton label="логово" iconOnly disabled={busy} onConfirm={() => run(() => api.deleteEncounterLair(lair.encounterId)).then(onRefresh)} />
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

export function EncounterQuantityControl({ quantity, busy, onSave }: { quantity: number; busy: boolean; onSave: (quantity: number) => void }): JSX.Element {
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

export function InitiativeSettingControls({
  advantage,
  disadvantage,
  override,
  baseInitiative,
  busy,
  onRollModeChange,
  onOverrideSave
}: {
  advantage: boolean;
  disadvantage: boolean;
  override: number | null;
  baseInitiative: number;
  busy: boolean;
  onRollModeChange: (advantage: boolean, disadvantage: boolean) => void;
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
      <InitiativeRollModeToggle compact advantage={advantage} disadvantage={disadvantage} disabled={busy} onChange={onRollModeChange} />
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
