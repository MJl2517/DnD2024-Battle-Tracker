export type TurnTimerPhase = 'running' | 'warning' | 'expired' | 'paused' | 'unlimited';

export interface TurnTimerState {
  phase: TurnTimerPhase;
  remainingMilliseconds: number;
  progress: number;
  display: string;
}

/** Чистая функция исключает расхождение между текстом, цветом и заполнением круга. */
export function getTurnTimerState(
  deadline: number | null,
  durationSeconds: number,
  currentTime: number,
  unlimited = false,
  pausedRemainingMilliseconds: number | null = null
): TurnTimerState {
  if (unlimited) {
    return { phase: 'unlimited', remainingMilliseconds: 0, progress: 1, display: '∞' };
  }

  const safeDurationMilliseconds = Math.max(1, durationSeconds) * 1000;
  if (pausedRemainingMilliseconds !== null) {
    const remainingMilliseconds = Math.max(0, pausedRemainingMilliseconds);
    return {
      phase: 'paused',
      remainingMilliseconds,
      progress: Math.max(0, Math.min(1, remainingMilliseconds / safeDurationMilliseconds)),
      display: formatRemainingTime(remainingMilliseconds)
    };
  }

  const remainingMilliseconds = deadline === null ? 0 : Math.max(0, deadline - currentTime);
  const progress = Math.max(0, Math.min(1, remainingMilliseconds / safeDurationMilliseconds));
  const warningMilliseconds = Math.min(safeDurationMilliseconds * 0.2, 10_000);
  const phase: TurnTimerPhase = remainingMilliseconds <= 0 ? 'expired' : remainingMilliseconds <= warningMilliseconds ? 'warning' : 'running';

  return {
    phase,
    remainingMilliseconds,
    progress,
    display: formatRemainingTime(remainingMilliseconds)
  };
}

function formatRemainingTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
