import { Dices } from 'lucide-react';

export interface InitiativeRollModeToggleProps {
  advantage: boolean;
  disadvantage: boolean;
  disabled?: boolean;
  compact?: boolean;
  onChange: (advantage: boolean, disadvantage: boolean) => void;
}

/**
 * Явный переключатель режима d20. Повторный клик по активному режиму
 * возвращает обычный бросок, а выбор другого режима сразу переключает его.
 */
export function InitiativeRollModeToggle({ advantage, disadvantage, disabled = false, compact = false, onChange }: InitiativeRollModeToggleProps): JSX.Element {
  return (
    <div className={`initiative-roll-mode-toggle ${compact ? 'compact' : ''}`} role="group" aria-label="Режим броска инициативы">
      <button
        className={`initiative-roll-mode-button advantage ${advantage ? 'active' : ''}`}
        type="button"
        disabled={disabled}
        aria-pressed={advantage}
        aria-label="Преимущество"
        title="Преимущество: бросаются 2d20, выбирается лучший результат. Повторный клик вернёт обычный бросок."
        onClick={() => onChange(advantage ? false : true, false)}
      >
        <Dices size={compact ? 16 : 18} />
        <span>
          <strong>{compact ? 'Преим.' : 'Преимущество'}</strong>
          {!compact && <small>Лучший из 2d20</small>}
        </span>
      </button>
      <button
        className={`initiative-roll-mode-button disadvantage ${disadvantage ? 'active' : ''}`}
        type="button"
        disabled={disabled}
        aria-pressed={disadvantage}
        aria-label="Помеха"
        title="Помеха: бросаются 2d20, выбирается худший результат. Повторный клик вернёт обычный бросок."
        onClick={() => onChange(false, disadvantage ? false : true)}
      >
        <Dices size={compact ? 16 : 18} />
        <span>
          <strong>Помеха</strong>
          {!compact && <small>Худший из 2d20</small>}
        </span>
      </button>
    </div>
  );
}
