import { type FormEvent, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Dices, Plus, Trash2, X } from 'lucide-react';
import type { AddCombatantGroupInput, AddCombatantsToCombatInput, CreatureTemplate, HitPointMode } from '@shared/types';
import { readNumber, readSignedNumber } from '../../shared/lib/numbers';
import { InitiativeRollModeToggle } from '../../shared/ui/InitiativeRollModeToggle';
import { CustomSelect, SearchableSelect, type SelectOption } from '../../shared/ui/Select';
import { useModalFocus } from '../../shared/ui/useModalFocus';

type QueuedGroup = { id: string; settings: AddCombatantGroupInput };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function rollD20(advantage: boolean, disadvantage: boolean): number {
  const first = Math.floor(Math.random() * 20) + 1;
  if (!advantage && !disadvantage) return first;
  const second = Math.floor(Math.random() * 20) + 1;
  if (disadvantage) return Math.min(first, second);
  return Math.max(first, second);
}

function queueId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function describeHpMode(settings: AddCombatantGroupInput, template: CreatureTemplate | undefined): string {
  if (settings.hpMode === 'fixed') return `Хиты ${settings.hpOverride ?? template?.hitPoints ?? 1}`;
  if (settings.hpMode === 'random') return `Хиты по кубам ${template?.hitDice || ''}`.trim();
  return `Средние хиты ${template?.hitPoints ?? 1}`;
}

export function AddCombatantModal({
  sessionId,
  creatures,
  busy,
  onClose,
  onAdd
}: {
  sessionId: string;
  creatures: CreatureTemplate[];
  busy: boolean;
  onClose: () => void;
  onAdd: (input: AddCombatantsToCombatInput) => Promise<void>;
}): JSX.Element {
  const [queuedGroups, setQueuedGroups] = useState<QueuedGroup[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [search, setSearch] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [initiativeAdvantage, setInitiativeAdvantage] = useState(false);
  const [initiativeDisadvantage, setInitiativeDisadvantage] = useState(false);
  const [initiativeRoll, setInitiativeRoll] = useState(() => rollD20(false, false));
  const [initiativeBonus, setInitiativeBonus] = useState('0');
  const [hpMode, setHpMode] = useState<HitPointMode>('average');
  const [hpOverride, setHpOverride] = useState('');
  const modalRef = useModalFocus<HTMLElement>(() => {
    if (!busy) onClose();
  });
  const templateById = useMemo(() => new Map(creatures.map((creature) => [creature.id, creature])), [creatures]);
  const selectedTemplate = templateById.get(templateId);
  const options = useMemo<SelectOption[]>(
    () =>
      creatures.map((creature) => ({
        value: creature.id,
        label: creature.name,
        description: `КД ${creature.armorClass} · Хиты ${creature.hitPoints} · инициатива ${creature.initiativeMod >= 0 ? '+' : ''}${creature.initiativeMod}`,
        icon: creature.tokenUrl || creature.imageUrl || undefined
      })),
    [creatures]
  );
  const bonus = clamp(readSignedNumber(initiativeBonus), -50, 50);
  const finalInitiative = clamp(initiativeRoll, 1, 20) + bonus;

  function resetDraft(): void {
    setEditingId(null);
    setTemplateId('');
    setSearch('');
    setQuantity(1);
    setInitiativeAdvantage(false);
    setInitiativeDisadvantage(false);
    setInitiativeRoll(rollD20(false, false));
    setInitiativeBonus('0');
    setHpMode('average');
    setHpOverride('');
  }

  function editGroup(group: QueuedGroup): void {
    const template = templateById.get(group.settings.templateId);
    setEditingId(group.id);
    setTemplateId(group.settings.templateId);
    setSearch(template?.name ?? '');
    setQuantity(group.settings.quantity);
    setInitiativeAdvantage(group.settings.initiativeAdvantage);
    setInitiativeDisadvantage(group.settings.initiativeDisadvantage ?? false);
    setInitiativeRoll(group.settings.initiativeRoll);
    setInitiativeBonus(String(group.settings.initiativeBonus));
    setHpMode(group.settings.hpMode);
    setHpOverride(group.settings.hpOverride == null ? '' : String(group.settings.hpOverride));
  }

  function confirmDraft(event: FormEvent): void {
    event.preventDefault();
    if (!templateId) return;
    const settings: AddCombatantGroupInput = {
      templateId,
      quantity: clamp(quantity, 1, 50),
      initiativeRoll: clamp(initiativeRoll, 1, 20),
      initiativeBonus: bonus,
      initiativeAdvantage,
      initiativeDisadvantage,
      hpMode,
      hpOverride: hpMode === 'fixed' ? clamp(readNumber(hpOverride, selectedTemplate?.hitPoints ?? 1), 1, 9999) : null
    };

    setQueuedGroups((current) =>
      editingId ? current.map((group) => (group.id === editingId ? { ...group, settings } : group)) : [...current, { id: queueId(), settings }]
    );
    resetDraft();
  }

  async function addQueuedGroups(): Promise<void> {
    if (!queuedGroups.length) return;
    await onAdd({ sessionId, groups: queuedGroups.map((group) => group.settings) });
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section ref={modalRef} tabIndex={-1} className="app-modal add-combatant-modal" role="dialog" aria-modal="true" aria-labelledby="add-combatant-title">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Активный бой</p>
            <h2 id="add-combatant-title">Добавить существ</h2>
          </div>
          <button className="icon-button" type="button" disabled={busy} onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>

        <div className="add-combatant-workspace">
          <aside className="add-combatant-sidebar" aria-label="Подготовленные существа">
            <div className="add-combatant-sidebar-heading">
              <strong>К добавлению</strong>
              <span>{queuedGroups.reduce((sum, group) => sum + group.settings.quantity, 0)}</span>
            </div>
            <div className="add-combatant-queue">
              {queuedGroups.map((group) => {
                const template = templateById.get(group.settings.templateId);
                return (
                  <article className={`add-combatant-queue-card ${editingId === group.id ? 'active' : ''}`} key={group.id}>
                    <button type="button" className="add-combatant-queue-main" onClick={() => editGroup(group)}>
                      <strong>{template?.name ?? 'Существо'}</strong>
                      <span>
                        {group.settings.quantity} шт. · инициатива {group.settings.initiativeRoll + group.settings.initiativeBonus}
                      </span>
                      <small>{describeHpMode(group.settings, template)}</small>
                    </button>
                    <button
                      className="icon-button danger"
                      type="button"
                      aria-label={`Убрать ${template?.name ?? 'существо'} из списка`}
                      onClick={() => {
                        setQueuedGroups((current) => current.filter((item) => item.id !== group.id));
                        if (editingId === group.id) resetDraft();
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </article>
                );
              })}
              {!queuedGroups.length && <p className="add-combatant-empty">Настройте существо и нажмите «Подтвердить».</p>}
            </div>
            <button className="button primary add-queued-button" type="button" disabled={busy || !queuedGroups.length} onClick={() => void addQueuedGroups()}>
              <Plus size={20} />
              Добавить в бой
            </button>
          </aside>

          <form className="add-combatant-form" onSubmit={confirmDraft}>
            <div className="add-combatant-form-heading wide">
              <strong>{editingId ? 'Изменить настройки' : 'Настроить существо'}</strong>
              {editingId && (
                <button className="button mini secondary" type="button" onClick={resetDraft}>
                  Новая позиция
                </button>
              )}
            </div>
            <label className="wide">
              Существо из бестиария
              <SearchableSelect
                value={templateId}
                search={search}
                onSearchChange={setSearch}
                onChange={(value) => {
                  setTemplateId(value);
                  const template = templateById.get(value);
                  if (template) {
                    setInitiativeBonus(String(template.initiativeMod));
                    setHpOverride(String(template.hitPoints));
                  }
                }}
                options={options}
                placeholder="Выберите существо"
                searchPlaceholder="Найти статблок"
                ariaLabel="Выбрать существо из бестиария"
                disabled={busy}
              />
            </label>

            <label>
              Количество
              <input
                type="number"
                min={1}
                max={50}
                value={quantity}
                disabled={busy}
                onChange={(event) => setQuantity(readNumber(event.target.value, 1))}
                onBlur={() => setQuantity((current) => clamp(current, 1, 50))}
              />
            </label>
            <label>
              Бросок инициативы
              <span className="initiative-roll-input">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={initiativeRoll}
                  disabled={busy}
                  onChange={(event) => setInitiativeRoll(readNumber(event.target.value, 1))}
                  onBlur={() => setInitiativeRoll((current) => clamp(current, 1, 20))}
                />
                <button
                  className="icon-button"
                  type="button"
                  disabled={busy}
                  onClick={() => setInitiativeRoll(rollD20(initiativeAdvantage, initiativeDisadvantage))}
                  aria-label={
                    initiativeDisadvantage
                      ? 'Бросить инициативу с помехой'
                      : initiativeAdvantage
                        ? 'Бросить инициативу с преимуществом'
                        : 'Перебросить инициативу'
                  }
                  title={
                    initiativeDisadvantage
                      ? 'Помеха: бросить 2d20 и выбрать худший результат'
                      : initiativeAdvantage
                        ? 'Преимущество: бросить 2d20 и выбрать лучший результат'
                        : 'Обычный бросок 1d20'
                  }
                >
                  <Dices size={19} />
                </button>
              </span>
            </label>
            <InitiativeRollModeToggle
              advantage={initiativeAdvantage}
              disadvantage={initiativeDisadvantage}
              disabled={busy}
              onChange={(advantage, disadvantage) => {
                setInitiativeAdvantage(advantage);
                setInitiativeDisadvantage(disadvantage);
              }}
            />
            <label>
              Бонус к инициативе
              <input
                type="text"
                inputMode="numeric"
                value={initiativeBonus}
                disabled={busy}
                placeholder="Например, +3 или -1"
                onChange={(event) => setInitiativeBonus(event.target.value.replace(/[^\d+-]/g, ''))}
                onBlur={() => setInitiativeBonus(String(bonus))}
              />
            </label>
            <label>
              Способ определения хитов
              <CustomSelect
                value={hpMode}
                onChange={(value) => setHpMode(value as HitPointMode)}
                options={[
                  { value: 'average', label: 'Средние из статблока', description: String(selectedTemplate?.hitPoints ?? '') },
                  { value: 'random', label: 'Случайно по кубам', description: selectedTemplate?.hitDice || 'Нет формулы кубов' },
                  { value: 'fixed', label: 'Указать вручную' }
                ]}
                placeholder="Выберите способ"
                ariaLabel="Способ определения хитов"
                disabled={busy}
              />
            </label>
            {hpMode === 'fixed' && (
              <label>
                Хиты каждого существа
                <input type="number" min={1} max={9999} value={hpOverride} disabled={busy} onChange={(event) => setHpOverride(event.target.value)} />
              </label>
            )}
            <div className="initiative-add-preview" aria-label="Итоговая инициатива">
              <span>{clamp(initiativeRoll, 1, 20)}</span>
              <small>{bonus < 0 ? '−' : '+'}</small>
              <span>{Math.abs(bonus)}</span>
              <small>=</small>
              <strong>{finalInitiative}</strong>
            </div>

            <div className="modal-actions wide">
              <button className="button secondary" type="button" disabled={busy} onClick={resetDraft}>
                Сброс
              </button>
              <button className="button primary" type="submit" disabled={busy || !templateId}>
                <Check size={20} />
                Подтвердить
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>,
    document.body
  );
}
