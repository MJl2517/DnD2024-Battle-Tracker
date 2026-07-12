import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, X } from 'lucide-react';
import type { Combatant, CombatantPatch } from '@shared/types';
import { formatSignedInput, normalizeSignedInput, readNumber, readSignedNumber } from '../../shared/lib/numbers';

/** Модалка поверх базовых значений применяет перезапись и затем отдельный бонус или штраф. */
export function StatAdjustModal({
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
              Текущие хиты после изменения:{' '}
              <strong>
                {nextCurrentHp}/{Math.round(nextValue)}
              </strong>
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
