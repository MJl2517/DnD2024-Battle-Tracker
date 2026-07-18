import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getTurnTimerState } from '../lib/turnTimer';
import { TurnTimer } from './TurnTimer';

describe('getTurnTimerState', () => {
  it('formats a running timer and calculates its circular progress', () => {
    const state = getTurnTimerState(70_000, 60, 20_000);

    expect(state).toMatchObject({
      phase: 'running',
      remainingMilliseconds: 50_000,
      display: '00:50'
    });
    expect(state.progress).toBeCloseTo(5 / 6);
  });

  it('uses the adaptive warning threshold capped at ten seconds', () => {
    expect(getTurnTimerState(100_000, 60, 90_001).phase).toBe('warning');
    expect(getTurnTimerState(100_000, 30, 93_999).phase).toBe('running');
    expect(getTurnTimerState(100_000, 30, 94_000).phase).toBe('warning');
  });

  it('stops at zero without advancing the turn', () => {
    expect(getTurnTimerState(10_000, 60, 10_001)).toEqual({
      phase: 'expired',
      remainingMilliseconds: 0,
      progress: 0,
      display: '00:00'
    });
  });

  it('shows an unlimited turn independently of the deadline', () => {
    expect(getTurnTimerState(10_000, 60, 99_000, true)).toEqual({
      phase: 'unlimited',
      remainingMilliseconds: 0,
      progress: 1,
      display: '∞'
    });
  });

  it('keeps a paused remainder independent of the current clock', () => {
    expect(getTurnTimerState(null, 60, 999_000, false, 42_500)).toEqual({
      phase: 'paused',
      remainingMilliseconds: 42_500,
      progress: 42.5 / 60,
      display: '00:43'
    });
  });

  it('exposes an explicit pause and resume control for the master', () => {
    const onTogglePause = vi.fn();
    const { rerender } = render(
      <TurnTimer deadlineAt={new Date(Date.now() + 60_000).toISOString()} durationSeconds={60} interactive onTogglePause={onTogglePause} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Поставить таймер хода на паузу' }));
    expect(onTogglePause).toHaveBeenCalledOnce();

    rerender(<TurnTimer deadlineAt={null} durationSeconds={60} pausedRemainingMilliseconds={40_000} interactive onTogglePause={onTogglePause} />);
    expect(screen.getByRole('timer', { name: 'Таймер на паузе, осталось 00:40' })).toHaveTextContent('Пауза');
    expect(screen.getByRole('button', { name: 'Продолжить таймер хода' })).toBeVisible();
  });
});
