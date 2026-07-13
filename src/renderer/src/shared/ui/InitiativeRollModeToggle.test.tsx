import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InitiativeRollModeToggle } from './InitiativeRollModeToggle';

describe('InitiativeRollModeToggle', () => {
  it('включает преимущество и переключается на помеху', () => {
    const onChange = vi.fn();
    const { rerender } = render(<InitiativeRollModeToggle advantage={false} disadvantage={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Преимущество' }));
    expect(onChange).toHaveBeenLastCalledWith(true, false);

    rerender(<InitiativeRollModeToggle advantage disadvantage={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Помеха' }));
    expect(onChange).toHaveBeenLastCalledWith(false, true);
  });

  it('повторным кликом сбрасывает активный режим', () => {
    const onChange = vi.fn();
    render(<InitiativeRollModeToggle advantage={false} disadvantage onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Помеха' }));
    expect(onChange).toHaveBeenCalledWith(false, false);
  });
});
