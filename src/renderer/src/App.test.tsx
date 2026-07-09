import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('PlayerDisplay', () => {
  beforeEach(() => {
    window.location.hash = '#/player?campaignId=campaign';
    vi.mocked(window.dndTracker.getPlayerView).mockResolvedValue({
      round: 2,
      combatants: [
        {
          id: 'npc',
          name: 'Паровой мефит',
          side: 'npc',
          armorClass: 10,
          initiative: 18,
          turnOrder: 0,
          effects: [{ id: 'slow', label: 'Замедлен', public: true }],
          bloodied: true,
          defeated: false,
          escaped: false,
          visible: true,
          isCurrent: true,
          speeds: '30 футов'
        }
      ]
    });
    vi.mocked(window.dndTracker.onPlayerView).mockReturnValue(() => undefined);
  });

  it('renders public initiative without exact npc hp', async () => {
    render(<App />);

    expect((await screen.findAllByText('Паровой мефит')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Окровавлен')).toBeInTheDocument();
    expect(screen.getAllByText('Замедлен').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Раунд 2').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/Хиты/)).not.toBeInTheDocument();
  });
});
