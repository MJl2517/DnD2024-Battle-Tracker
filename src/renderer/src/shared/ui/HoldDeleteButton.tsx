import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

const HOLD_DELETE_MS = 900;

/** Кнопка опасного действия, которая срабатывает только после полного удержания указателя. */
export function HoldDeleteButton({
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
