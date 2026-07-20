import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoldDeleteButton } from './HoldDeleteButton';

afterEach(() => {
  vi.useRealTimers();
});

describe('HoldDeleteButton', () => {
  it('requires a full keyboard hold before confirming deletion', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(<HoldDeleteButton label="Удалить игрока" onConfirm={onConfirm} />);
    const button = screen.getByRole('button', { name: /Удалить игрока/ });

    fireEvent.keyDown(button, { key: 'Enter' });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.keyUp(button, { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.keyDown(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(900));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
