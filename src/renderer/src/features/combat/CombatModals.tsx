import { createPortal } from 'react-dom';
import { ChevronRight, Clock, Dices, Plus, Shield, Skull, Users, X } from 'lucide-react';
import type { Combatant, CompleteCombatOptions, CombatXpAward } from '@shared/types';
import { normalizeSignedInput, signed } from '../../shared/lib/numbers';
import { Stat } from '../../shared/ui/Stat';
import { useModalFocus } from '../../shared/ui/useModalFocus';
export function FinishCombatModal({
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
  const modalRef = useModalFocus<HTMLElement>(() => {
    if (!busy) onCancel();
  });
  const escapedOptions: Array<{ value: CompleteCombatOptions['escapedXpMode']; label: string }> = [
    { value: 'none', label: 'Сбежавшие не дают опыт' },
    { value: 'full', label: 'Сбежавшие дают опыт' },
    { value: 'half', label: 'Сбежавшие дают половину опыта' }
  ];

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section ref={modalRef} tabIndex={-1} className="app-modal xp-modal" role="dialog" aria-modal="true" aria-labelledby="finish-combat-title">
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

export function AllyXpSelectionModal({
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
  const modalRef = useModalFocus<HTMLElement>(onClose);

  return createPortal(
    <div className="modal-backdrop ally-xp-backdrop" role="presentation">
      <section ref={modalRef} tabIndex={-1} className="app-modal ally-xp-modal" role="dialog" aria-modal="true" aria-labelledby="ally-xp-title">
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
          <span>
            Выбрано {selectedIds.length} из {allies.length}
          </span>
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
                  onChange={(event) => onSelectedIdsChange(event.target.checked ? [...selectedIds, ally.id] : selectedIds.filter((id) => id !== ally.id))}
                />
                {tokenUrl ? (
                  <img src={tokenUrl} alt="" />
                ) : (
                  <span className="ally-xp-avatar">
                    <Shield size={22} />
                  </span>
                )}
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
          <button className="button primary" type="button" onClick={onClose}>
            Готово
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

export function TimerEffectModal({
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
  const modalRef = useModalFocus<HTMLElement>(() => {
    if (!busy) onCancel();
  });
  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section ref={modalRef} tabIndex={-1} className="app-modal timer-modal" role="dialog" aria-modal="true" aria-labelledby="timer-effect-title">
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
