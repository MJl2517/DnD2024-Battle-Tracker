import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CombatSession, Combatant, PlayerCharacter } from '@shared/types';
import { InitiativeSetupModal } from './InitiativeSetupModal';

const api = window.dndTracker;

function alertPlayer(): PlayerCharacter {
  return {
    id: 'player',
    campaignId: 'campaign',
    name: 'Бдительный герой',
    level: 5,
    armorClass: 16,
    maxHp: 35,
    initiativeMod: 3,
    passivePerception: 14,
    active: true,
    alertInitiativeSwap: true,
    imageUrl: '',
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

function combatant(): Combatant {
  return {
    id: 'combatant',
    sessionId: 'session',
    templateId: null,
    playerId: 'player',
    name: 'Бдительный герой',
    side: 'player',
    isAlly: false,
    armorClass: 16,
    baseArmorClass: 16,
    maxHp: 35,
    baseMaxHp: 35,
    currentHp: 35,
    temporaryHp: 0,
    initiative: 15,
    initiativeRoll: 12,
    initiativeSwapUsed: false,
    initiativeMod: 3,
    initiativeGroupId: null,
    initiativeMode: 'individual',
    turnOrder: 0,
    effects: [],
    publicNotes: '',
    publicNameVisible: true,
    snapshot: alertPlayer(),
    defeated: false,
    escaped: false,
    visible: true
  };
}

function session(): CombatSession {
  return {
    id: 'session',
    campaignId: 'campaign',
    encounterId: 'encounter',
    round: 1,
    status: 'preparing',
    activeCombatantId: 'combatant',
    totalXp: 0,
    xpPerPlayer: 0,
    xpAllyCount: 0,
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: null,
    combatants: [combatant()]
  };
}

beforeEach(() => {
  vi.mocked(api.beginInitiativeExchange).mockClear();
});

describe('InitiativeSetupModal', () => {
  it('показывает понятное уведомление, когда обмениваться не с кем', () => {
    render(<InitiativeSetupModal session={session()} busy={false} onReroll={vi.fn()} onCancel={vi.fn()} onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Бдительный герой: обменяться инициативой' }));

    expect(screen.getByRole('status')).toHaveTextContent('Для обмена нужен другой игрок или союзный NPC');
    expect(api.beginInitiativeExchange).not.toHaveBeenCalled();
  });
});
