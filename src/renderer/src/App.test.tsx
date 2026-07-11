import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('PlayerDisplay', () => {
  beforeEach(() => {
    window.location.hash = '#/player?campaignId=campaign';
    vi.mocked(window.dndTracker.getPlayerView).mockResolvedValue({
      round: 2,
      settings: {
        showEnemyArmorClass: true,
        showEnemySpeeds: true,
        hideCreatureNames: false
      },
      combatants: [
        {
          id: 'npc',
          name: 'Паровой мефит',
          side: 'npc',
          armorClass: 10,
          initiative: 18,
          turnOrder: 0,
          effects: [{ id: 'slow', label: 'Замедлен', public: true }],
          publicNameVisible: false,
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

  it('hides enemy armor class and speed when public settings are disabled', async () => {
    vi.mocked(window.dndTracker.getPlayerView).mockResolvedValue({
      round: 2,
      settings: {
        showEnemyArmorClass: false,
        showEnemySpeeds: false,
        hideCreatureNames: false
      },
      combatants: [
        {
          id: 'npc',
          name: 'Паровой мефит',
          side: 'npc',
          armorClass: 10,
          initiative: 18,
          turnOrder: 0,
          effects: [],
          publicNameVisible: false,
          bloodied: false,
          defeated: false,
          escaped: false,
          visible: true,
          isCurrent: true,
          speeds: '30 футов'
        }
      ]
    });

    render(<App />);

    expect((await screen.findAllByText('Паровой мефит')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Иниц\. 18/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/КД 10/)).not.toBeInTheDocument();
    expect(screen.queryByText(/30 футов/)).not.toBeInTheDocument();
  });

  it('hides npc names on the player screen until a combatant is revealed', async () => {
    vi.mocked(window.dndTracker.getPlayerView).mockResolvedValue({
      round: 2,
      settings: {
        showEnemyArmorClass: true,
        showEnemySpeeds: true,
        hideCreatureNames: true
      },
      combatants: [
        {
          id: 'hidden-npc',
          name: 'Паровой мефит',
          side: 'npc',
          armorClass: 10,
          initiative: 18,
          turnOrder: 0,
          effects: [],
          publicNameVisible: false,
          bloodied: false,
          defeated: false,
          escaped: false,
          visible: true,
          isCurrent: true,
          speeds: '30 футов'
        },
        {
          id: 'revealed-npc',
          name: 'Маг',
          side: 'npc',
          armorClass: 15,
          initiative: 12,
          turnOrder: 1,
          effects: [],
          publicNameVisible: true,
          bloodied: false,
          defeated: false,
          escaped: false,
          visible: true,
          isCurrent: false
        }
      ]
    });

    render(<App />);

    expect((await screen.findAllByText('Существо')).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Паровой мефит')).not.toBeInTheDocument();
    expect(screen.getAllByText('Маг').length).toBeGreaterThanOrEqual(2);
  });
});
