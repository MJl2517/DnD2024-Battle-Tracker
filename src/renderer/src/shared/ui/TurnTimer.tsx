import { Infinity as InfinityIcon, Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { getTurnTimerState, type TurnTimerState } from '../lib/turnTimer';

interface TurnTimerProps {
  deadlineAt: string | null | undefined;
  durationSeconds: number;
  pausedRemainingMilliseconds?: number | null;
  unlimited?: boolean;
  variant?: 'compact' | 'public';
  interactive?: boolean;
  disabled?: boolean;
  onTogglePause?: () => void;
}

/** Один круговой индикатор используется в обоих окнах, чтобы их поведение и пороги не расходились. */
export function TurnTimer({
  deadlineAt,
  durationSeconds,
  pausedRemainingMilliseconds = null,
  unlimited = false,
  variant = 'compact',
  interactive = false,
  disabled = false,
  onTogglePause
}: TurnTimerProps): JSX.Element {
  const state = useTurnTimer(deadlineAt, durationSeconds, unlimited, pausedRemainingMilliseconds);
  const style = { '--turn-offset': 100 - state.progress * 100 } as CSSProperties;
  const label =
    state.phase === 'unlimited'
      ? 'Ход без ограничения времени'
      : state.phase === 'paused'
        ? `Таймер на паузе, осталось ${state.display}`
        : state.phase === 'expired'
          ? 'Время хода истекло'
          : `До конца хода ${state.display}`;
  const canToggle = interactive && !unlimited && Boolean(onTogglePause);
  const actionLabel = state.phase === 'paused' ? 'Продолжить таймер хода' : 'Поставить таймер хода на паузу';

  const timer = (
    <div className={`turn-timer ${variant} ${state.phase}`} style={style} role="timer" aria-label={label}>
      <svg className="turn-timer-ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="turn-timer-track" cx="50" cy="50" r="44" pathLength="100" />
        <circle className="turn-timer-progress" cx="50" cy="50" r="44" pathLength="100" />
      </svg>
      <div className="turn-timer-copy">
        {state.phase === 'unlimited' ? (
          <InfinityIcon className="turn-timer-infinity" aria-hidden="true" />
        ) : (
          <>
            <strong>{state.display}</strong>
            <small>{state.phase === 'paused' ? 'Пауза' : 'Ход'}</small>
          </>
        )}
      </div>
    </div>
  );

  if (!canToggle) return <div title={label}>{timer}</div>;

  return (
    <button className="turn-timer-control" type="button" disabled={disabled} aria-label={actionLabel} title={actionLabel} onClick={onTogglePause}>
      {timer}
      <div className="turn-timer-action-hint" aria-hidden="true">
        {state.phase === 'paused' ? <Play size={11} fill="currentColor" /> : <Pause size={11} fill="currentColor" />}
      </div>
    </button>
  );
}

function useTurnTimer(
  deadlineAt: string | null | undefined,
  durationSeconds: number,
  unlimited: boolean,
  pausedRemainingMilliseconds: number | null
): TurnTimerState {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const deadline = useMemo(() => parseDeadline(deadlineAt), [deadlineAt]);

  useEffect(() => {
    setCurrentTime(Date.now());
    if (unlimited || pausedRemainingMilliseconds !== null || deadline === null || deadline <= Date.now()) return undefined;

    const interval = window.setInterval(() => {
      const nextTime = Date.now();
      setCurrentTime(nextTime);
      if (nextTime >= deadline) window.clearInterval(interval);
    }, 100);
    return () => window.clearInterval(interval);
  }, [deadline, pausedRemainingMilliseconds, unlimited]);

  return getTurnTimerState(deadline, durationSeconds, currentTime, unlimited, pausedRemainingMilliseconds);
}

function parseDeadline(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
