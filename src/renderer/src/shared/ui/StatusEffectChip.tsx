import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import type { CombatEffect } from '@shared/types';
import { getStatusEffectDefinition, type StatusEffectDefinition } from '@shared/statusEffects';
import { anchorFromElement, positionAnchoredPopover, type PopoverAnchor } from '../lib/popover';
export function StatusEffectChip({ effect, onRemove }: { effect: CombatEffect; onRemove?: () => void }): JSX.Element {
  const status = getStatusEffectDefinition(effect.statusId);
  const [popover, setPopover] = useState<PopoverAnchor | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRounds = typeof effect.remainingRounds === 'number' ? Math.max(0, Math.round(effect.remainingRounds)) : null;

  function cancelHidePopover(): void {
    if (!hideTimerRef.current) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }

  function scheduleHidePopover(): void {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setPopover(null), 220);
  }

  useEffect(() => () => cancelHidePopover(), []);

  function showPopover(event: MouseEvent<HTMLElement>): void {
    if (!status) return;
    cancelHidePopover();
    setPopover(anchorFromElement(event.currentTarget));
  }

  const content = (
    <>
      {status && <img className="status-icon" src={status.icon} alt="" />}
      {effect.timed && !status && <Clock className="timer-effect-icon" size={17} />}
      <span>{effect.label}</span>
      {effect.timed && remainingRounds !== null && <strong className="timer-effect-count">{remainingRounds}</strong>}
    </>
  );

  const commonProps = {
    className: `chip effect-chip ${status ? 'status-effect-chip' : ''} ${effect.timed ? 'timer-effect-chip' : ''}`,
    onMouseEnter: showPopover,
    onMouseLeave: scheduleHidePopover
  };

  return (
    <>
      {onRemove ? (
        <button type="button" {...commonProps} onClick={onRemove} aria-label={`Убрать эффект ${effect.label}`}>
          {content}
        </button>
      ) : (
        <span {...commonProps}>{content}</span>
      )}
      {status && popover && <StatusEffectPopover status={status} anchor={popover} onMouseEnter={cancelHidePopover} onMouseLeave={scheduleHidePopover} />}
    </>
  );
}

function StatusEffectPopover({
  status,
  anchor,
  onMouseEnter,
  onMouseLeave
}: {
  status: StatusEffectDefinition;
  anchor: PopoverAnchor;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}): JSX.Element {
  const width = Math.min(560, window.innerWidth - 36);
  const maxHeight = Math.min(620, window.innerHeight - 36);
  const { left, top } = positionAnchoredPopover(anchor, width, maxHeight, 18, 10);

  return createPortal(
    <aside className="status-popover" style={{ left, top }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <header>
        <img className="status-popover-icon" src={status.icon} alt="" />
        <div>
          <h3>{status.label}</h3>
          <p>{status.originalName}</p>
        </div>
      </header>
      <div>{status.ruling}</div>
    </aside>,
    document.body
  );
}
