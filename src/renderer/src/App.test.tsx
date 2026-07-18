import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { DEFAULT_PUBLIC_DISPLAY_SETTINGS } from '@shared/types';

describe('PlayerDisplay', () => {
  beforeEach(() => {
    window.location.hash = '#/player?campaignId=campaign';
    vi.mocked(window.dndTracker.getPlayerView).mockResolvedValue({
      round: 2,
      settings: {
        ...DEFAULT_PUBLIC_DISPLAY_SETTINGS,
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
    expect(screen.getAllByText('Окровавлен').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Замедлен').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Раунд 2').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/Хиты/)).not.toBeInTheDocument();
  });

  it('shows an unlimited circular timer for npc turns when npc timing is disabled', async () => {
    vi.mocked(window.dndTracker.getPlayerView).mockResolvedValue({
      round: 2,
      turnTimerDeadlineAt: null,
      settings: {
        ...DEFAULT_PUBLIC_DISPLAY_SETTINGS,
        turnTimerEnabled: true,
        skipNpcTurnTimer: true
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
          isCurrent: true
        }
      ]
    });

    render(<App />);

    const timer = await screen.findByRole('timer', { name: 'Ход без ограничения времени' });
    expect(timer).toHaveClass('unlimited');
    expect(timer.querySelector('.turn-timer-infinity')).toBeInTheDocument();
  });

  it('hides enemy armor class and speed when public settings are disabled', async () => {
    vi.mocked(window.dndTracker.getPlayerView).mockResolvedValue({
      round: 2,
      settings: {
        ...DEFAULT_PUBLIC_DISPLAY_SETTINGS,
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
        ...DEFAULT_PUBLIC_DISPLAY_SETTINGS,
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

describe('MasterApp release notes', () => {
  beforeEach(() => {
    window.location.hash = '';
    window.localStorage.clear();
    vi.mocked(window.dndTracker.listCampaigns).mockResolvedValue([]);
    vi.mocked(window.dndTracker.getPublicDisplaySettings).mockResolvedValue(DEFAULT_PUBLIC_DISPLAY_SETTINGS);
    vi.mocked(window.dndTracker.getUpdateStatus).mockResolvedValue({
      status: 'idle',
      currentVersion: '0.3.0',
      isPackaged: true
    });
    vi.mocked(window.dndTracker.getReleaseHistory).mockResolvedValue([
      {
        version: '0.3.0',
        tagName: 'v0.3.0',
        name: 'Таймер хода',
        notes: '- Добавлена пауза таймера',
        prerelease: false
      }
    ]);
  });

  it('shows changes once after an installed version changes', async () => {
    let firstRun!: ReturnType<typeof render>;
    await act(async () => {
      firstRun = render(<App />);
    });

    expect(await screen.findByRole('heading', { name: 'Что нового' })).toBeVisible();
    expect(screen.getByText('Добавлена пауза таймера')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(window.localStorage.getItem('dnd-tracker:last-seen-version')).toBe('0.3.0');
    firstRun.unmount();

    await act(async () => {
      render(<App />);
    });
    expect(screen.queryByRole('heading', { name: 'Что нового' })).not.toBeInTheDocument();
  });
});
